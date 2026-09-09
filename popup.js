import { getExtApi, isFirefox } from "./utils/extApi.js";

const ext = getExtApi();

function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

onReady(() => {
  const statusEl = document.getElementById("status");
  const progress = document.getElementById("progress");
  const progressText = document.getElementById("progressText");
  const pageHint = document.getElementById("pageHint");
  const syncNote = document.getElementById("syncNote");

  const fallStart = document.getElementById("fallStart");
  const fallEnd = document.getElementById("fallEnd");
  const winterStart = document.getElementById("winterStart");
  const winterEnd = document.getElementById("winterEnd");
  const fallRangeLabel = document.getElementById("fallRangeLabel");
  const winterRangeLabel = document.getElementById("winterRangeLabel");

  const googleRow = document.getElementById("googleRow");
  const outlookRow = document.getElementById("outlookRow");
  const googleState = document.getElementById("googleState");
  const outlookState = document.getElementById("outlookState");
  const outlookRedirect = document.getElementById("outlookRedirect");
  const googleConnect = document.getElementById("googleConnect");
  const outlookConnect = document.getElementById("outlookConnect");

  let authStatus = {
    browser: "chrome",
    google: { available: true, configured: false, connected: false },
    microsoft: { available: false, configured: false, connected: false }
  };
  let busy = false;

  function isFirefoxUi() {
    return authStatus.browser === "firefox" || isFirefox();
  }

  function setStatus(message, type = "") {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `status${type ? ` ${type}` : ""}`;
  }

  function setBusy(isBusy, label = "Working…") {
    busy = isBusy;
    progress.hidden = !isBusy;
    progressText.textContent = label;
    document.querySelectorAll("button").forEach((btn) => {
      if (btn.classList.contains("disclosure")) return;
      if (isBusy) {
        btn.dataset.prevDisabled = btn.disabled ? "1" : "0";
        btn.disabled = true;
      } else if (btn.dataset.prevDisabled !== undefined) {
        btn.disabled = btn.dataset.prevDisabled === "1";
        delete btn.dataset.prevDisabled;
      }
    });
    refreshActionAvailability();
  }

  function formatRange(start, end) {
    if (!start || !end) return "Dates unavailable";
    const opts = { month: "short", day: "numeric" };
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  }

  function getTermDates(term) {
    if (term === "winter") {
      return { start: winterStart.value, end: winterEnd.value };
    }
    return { start: fallStart.value, end: fallEnd.value };
  }

  function applyTermDates(dates) {
    if (dates?.fall) {
      fallStart.value = dates.fall.start || "";
      fallEnd.value = dates.fall.end || "";
      fallRangeLabel.textContent = formatRange(dates.fall.start, dates.fall.end);
      if (dates.source === "defaults") {
        fallRangeLabel.textContent += " (offline defaults)";
      } else if (dates.source === "westerncalendar") {
        fallRangeLabel.textContent += " · Western calendar";
      }
    }
    if (dates?.winter) {
      winterStart.value = dates.winter.start || "";
      winterEnd.value = dates.winter.end || "";
      winterRangeLabel.textContent = formatRange(
        dates.winter.start,
        dates.winter.end
      );
      if (dates.source === "defaults") {
        winterRangeLabel.textContent += " (offline defaults)";
      } else if (dates.source === "westerncalendar") {
        winterRangeLabel.textContent += " · Western calendar";
      }
    }
  }

  function wireDisclosure(buttonId, panelId) {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
    });
  }

  wireDisclosure("fallDisclosure", "fallDates");
  wireDisclosure("winterDisclosure", "winterDates");

  async function sendMessage(message) {
    try {
      const response = await ext.runtime.sendMessage(message);
      return response || { success: false, error: "No response" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async function getActiveTab() {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function sendTabMessage(tabId, message) {
    try {
      const response = await ext.tabs.sendMessage(tabId, message);
      return response || { success: false, error: "No response from page" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async function ensureOnDraftMySchedule() {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) {
      return { ok: false, error: "No active tab." };
    }
    if (!/^https:\/\/draftmyschedule\.uwo\.ca\//i.test(tab.url)) {
      return {
        ok: false,
        error: "Open DraftMySchedule (draftmyschedule.uwo.ca) first, then try again."
      };
    }
    return { ok: true, tab };
  }

  async function scrapeTerm(term) {
    const dates = getTermDates(term);
    if (!dates.start || !dates.end) {
      return { success: false, error: `Missing dates for ${term} term.` };
    }
    if (dates.start > dates.end) {
      return { success: false, error: "Start date must be on or before end date." };
    }

    const page = await ensureOnDraftMySchedule();
    if (!page.ok) return { success: false, error: page.error };

    let result = await sendTabMessage(page.tab.id, {
      action: "scrapeTerm",
      term,
      startDate: dates.start,
      endDate: dates.end
    });

    if (!result.success && /Receiving end does not exist|Could not establish connection|No matching message handler/i.test(result.error || "")) {
      try {
        await ext.scripting.executeScript({
          target: { tabId: page.tab.id },
          files: ["content.js"]
        });
        result = await sendTabMessage(page.tab.id, {
          action: "scrapeTerm",
          term,
          startDate: dates.start,
          endDate: dates.end
        });
      } catch (error) {
        return {
          success: false,
          error: error.message || "Could not inject into DraftMySchedule."
        };
      }
    }

    return result;
  }

  async function downloadIcs(ics, filename) {
    if (isFirefox()) {
      return sendMessage({
        action: "downloadIcs",
        ics,
        filename: filename || "schedule.ics"
      });
    }

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "schedule.ics";
    a.click();
    URL.revokeObjectURL(url);
    return { success: true };
  }

  function applyBrowserLayout() {
    const googleOn = Boolean(authStatus.google?.available);
    const outlookOn = Boolean(authStatus.microsoft?.available);

    googleRow.hidden = !googleOn;
    outlookRow.hidden = !outlookOn;

    document.querySelectorAll(".sync-google").forEach((el) => {
      el.hidden = !googleOn;
    });
    document.querySelectorAll(".sync-outlook").forEach((el) => {
      el.hidden = !outlookOn;
    });

    document.querySelectorAll(".term-actions").forEach((el) => {
      el.classList.toggle("has-two-sync", googleOn && outlookOn);
    });

    if (googleOn && !outlookOn) {
      syncNote.textContent =
        "Chrome: connect Google Calendar for one-click sync, or export .ics.";
    } else if (outlookOn && !googleOn) {
      syncNote.textContent =
        "Firefox/Zen: connect Outlook for one-click sync, or export .ics.";
    } else {
      syncNote.textContent = "One-click add for connected accounts.";
    }
  }

  function refreshActionAvailability() {
    if (busy) return;
    applyBrowserLayout();

    const googleReady =
      authStatus.google.available && authStatus.google.configured;
    const outlookReady =
      authStatus.microsoft.available && authStatus.microsoft.configured;

    ["fallGoogle", "winterGoogle"].forEach((id) => {
      document.getElementById(id).disabled = !googleReady;
    });
    ["fallOutlook", "winterOutlook"].forEach((id) => {
      document.getElementById(id).disabled = !outlookReady;
    });

    if (!authStatus.google.available) {
      // hidden
    } else if (!authStatus.google.configured) {
      googleState.textContent = "Add Chrome Extension OAuth client ID";
      googleConnect.textContent = "Setup needed";
      googleConnect.disabled = true;
    } else if (authStatus.google.connected) {
      googleState.textContent = "Connected";
      googleConnect.textContent = "Disconnect";
      googleConnect.disabled = false;
    } else {
      googleState.textContent = "Not connected";
      googleConnect.textContent = "Connect";
      googleConnect.disabled = false;
    }

    if (!authStatus.microsoft.available) {
      // hidden
    } else if (!authStatus.microsoft.configured) {
      outlookState.textContent = "Add MICROSOFT_CLIENT_ID in constants.js";
      outlookConnect.textContent = "Setup needed";
      outlookConnect.disabled = true;
      outlookRedirect.hidden = true;
    } else if (authStatus.microsoft.connected) {
      outlookState.textContent = "Connected";
      outlookConnect.textContent = "Disconnect";
      outlookConnect.disabled = false;
      outlookRedirect.hidden = true;
    } else {
      outlookState.textContent = "Not connected";
      outlookConnect.textContent = "Connect";
      outlookConnect.disabled = false;
      outlookRedirect.hidden = true;
    }
  }

  async function refreshAuthStatus() {
    const response = await sendMessage({ action: "getAuthStatus" });
    if (response.success) {
      authStatus = {
        browser: response.browser || (isFirefox() ? "firefox" : "chrome"),
        google: response.google,
        microsoft: response.microsoft
      };
    }
    refreshActionAvailability();
  }

  async function handleExport(term) {
    setBusy(true, "Building schedule…");
    setStatus("");
    try {
      const scraped = await scrapeTerm(term);
      if (!scraped.success) {
        setStatus(scraped.error || "Export failed.", "error");
        return;
      }
      const built = await sendMessage({
        action: "buildIcs",
        events: scraped.events,
        term
      });
      if (!built.success) {
        setStatus(built.error || "Could not build .ics.", "error");
        return;
      }
      const downloaded = await downloadIcs(built.ics, built.filename);
      if (!downloaded?.success) {
        setStatus(downloaded?.error || "Could not download .ics.", "error");
        return;
      }
      setStatus(
        `Exported ${scraped.events.length} class${scraped.events.length === 1 ? "" : "es"} for ${term}.`,
        "success"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSync(term, provider) {
    const action = provider === "google" ? "syncGoogle" : "syncOutlook";
    const label = provider === "google" ? "Google Calendar" : "Outlook";
    setBusy(true, `Adding to ${label}…`);
    setStatus("");
    try {
      const scraped = await scrapeTerm(term);
      if (!scraped.success) {
        setStatus(scraped.error || "Sync failed.", "error");
        return;
      }
      const result = await sendMessage({
        action,
        events: scraped.events,
        term
      });
      if (!result.success) {
        setStatus(result.error || `Could not sync to ${label}.`, "error");
        return;
      }
      await refreshAuthStatus();
      setStatus(
        `Added ${result.created} class${result.created === 1 ? "" : "es"} to ${label}.`,
        "success"
      );
    } finally {
      setBusy(false);
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const term = button.getAttribute("data-term");
      const action = button.getAttribute("data-action");
      if (action === "export") handleExport(term);
      if (action === "google") handleSync(term, "google");
      if (action === "outlook") handleSync(term, "outlook");
    });
  });

  googleConnect.addEventListener("click", async () => {
    setBusy(true, authStatus.google.connected ? "Disconnecting…" : "Connecting Google…");
    setStatus("");
    try {
      const action = authStatus.google.connected
        ? "disconnectGoogle"
        : "connectGoogle";
      const result = await sendMessage({ action });
      if (!result.success) {
        setStatus(result.error || "Google account action failed.", "error");
      } else {
        setStatus(
          authStatus.google.connected ? "Google disconnected." : "Google connected.",
          "success"
        );
      }
      await refreshAuthStatus();
    } finally {
      setBusy(false);
    }
  });

  outlookConnect.addEventListener("click", async () => {
    setBusy(
      true,
      authStatus.microsoft.connected ? "Disconnecting…" : "Connecting Outlook…"
    );
    setStatus("");
    try {
      const action = authStatus.microsoft.connected
        ? "disconnectMicrosoft"
        : "connectMicrosoft";
      const result = await sendMessage({ action });
      if (!result.success) {
        setStatus(result.error || "Outlook account action failed.", "error");
      } else {
        setStatus(
          authStatus.microsoft.connected
            ? "Outlook disconnected."
            : "Outlook connected.",
          "success"
        );
      }
      await refreshAuthStatus();
    } finally {
      setBusy(false);
    }
  });

  ["fallStart", "fallEnd"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      fallRangeLabel.textContent =
        formatRange(fallStart.value, fallEnd.value) + " · manual";
    });
  });
  ["winterStart", "winterEnd"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      winterRangeLabel.textContent =
        formatRange(winterStart.value, winterEnd.value) + " · manual";
    });
  });

  async function init() {
    // Optimistic layout before auth status returns
    authStatus.browser = isFirefox() ? "firefox" : "chrome";
    authStatus.google.available = !isFirefoxUi();
    authStatus.microsoft.available = isFirefoxUi();
    applyBrowserLayout();

    const page = await ensureOnDraftMySchedule();
    if (!page.ok) {
      pageHint.hidden = false;
      pageHint.textContent = page.error;
    } else {
      pageHint.hidden = true;
    }

    const datesResponse = await sendMessage({ action: "getTermDates" });
    if (datesResponse.success) {
      applyTermDates(datesResponse.dates);
    } else {
      fallRangeLabel.textContent = "Could not load term dates";
      winterRangeLabel.textContent = "Could not load term dates";
      setStatus(datesResponse.error || "Term date lookup failed.", "error");
    }

    await refreshAuthStatus();
  }

  init();
});
