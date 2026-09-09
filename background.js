import { PRODUCT_NAME, STORAGE_KEYS } from "./constants.js";
import { makeICS } from "./utils/ics.js";
import { resolveTermDates } from "./utils/termDates.js";
import { downloadUrl, getExtApi, isFirefox } from "./utils/extApi.js";
import {
  getGoogleAccessToken,
  isGoogleAvailableOnThisBrowser,
  isGoogleConfigured,
  revokeGoogleAccessToken
} from "./utils/authGoogle.js";
import {
  connectMicrosoft,
  disconnectMicrosoft,
  getMicrosoftAccessToken,
  getStoredMicrosoftTokens,
  isMicrosoftAvailableOnThisBrowser,
  isMicrosoftConfigured
} from "./utils/authMicrosoft.js";
import { syncEventsToGoogle } from "./utils/googleCalendar.js";
import { syncEventsToOutlook } from "./utils/outlookCalendar.js";

const ext = getExtApi();
const storage = ext.storage.local;

function ok(data = {}) {
  return { success: true, ...data };
}

function fail(error, code = "error") {
  return {
    success: false,
    code,
    error: error instanceof Error ? error.message : String(error)
  };
}

async function handleGetTermDates(message) {
  const dates = await resolveTermDates({
    storageArea: storage,
    forceRefresh: Boolean(message.forceRefresh)
  });
  return ok({ dates });
}

async function handleBuildIcs(message) {
  const { events, term } = message;
  if (!Array.isArray(events) || events.length === 0) {
    return fail("No events to export.", "empty");
  }
  const ics = makeICS(events, `-//${PRODUCT_NAME} ${term || ""}//`);
  return ok({ ics, filename: `${term || "schedule"}_schedule.ics` });
}

async function handleGetAuthStatus() {
  const stored = await storage.get([
    STORAGE_KEYS.googleConnected,
    STORAGE_KEYS.microsoftConnected
  ]);
  const msTokens = await getStoredMicrosoftTokens(storage);
  const firefox = isFirefox();
  return ok({
    browser: firefox ? "firefox" : "chrome",
    google: {
      available: isGoogleAvailableOnThisBrowser(),
      configured: isGoogleConfigured(),
      connected: Boolean(stored[STORAGE_KEYS.googleConnected])
    },
    microsoft: {
      available: isMicrosoftAvailableOnThisBrowser(),
      configured: isMicrosoftConfigured(),
      connected: Boolean(
        stored[STORAGE_KEYS.microsoftConnected] || msTokens?.accessToken
      )
    }
  });
}

async function handleConnectGoogle() {
  if (!isGoogleAvailableOnThisBrowser()) {
    return fail(
      "Google Calendar sync is only available in Chrome. On Firefox/Zen use Outlook or Export .ics.",
      "unsupported_browser"
    );
  }
  try {
    const token = await getGoogleAccessToken({ interactive: true });
    await storage.set({ [STORAGE_KEYS.googleConnected]: true });
    return ok({ connected: Boolean(token) });
  } catch (error) {
    return fail(error, "google_auth");
  }
}

async function handleDisconnectGoogle() {
  try {
    const token = await getGoogleAccessToken({ interactive: false });
    await revokeGoogleAccessToken(token);
  } catch {
    // not signed in
  }
  await storage.set({ [STORAGE_KEYS.googleConnected]: false });
  return ok({ connected: false });
}

async function handleConnectMicrosoft() {
  if (!isMicrosoftAvailableOnThisBrowser()) {
    return fail(
      "Outlook sync is only available in Firefox/Zen. On Chrome use Google Calendar or Export .ics.",
      "unsupported_browser"
    );
  }
  await connectMicrosoft({ storageArea: storage, interactive: true });
  return ok({ connected: true });
}

async function handleDisconnectMicrosoft() {
  await disconnectMicrosoft(storage);
  return ok({ connected: false });
}

async function handleSyncGoogle(message) {
  if (!isGoogleAvailableOnThisBrowser()) {
    return fail(
      "Google Calendar sync is only available in Chrome.",
      "unsupported_browser"
    );
  }
  const { events, term } = message;
  if (!Array.isArray(events) || events.length === 0) {
    return fail("No events to sync.", "empty");
  }
  const token = await getGoogleAccessToken({ interactive: true });
  await storage.set({ [STORAGE_KEYS.googleConnected]: true });
  const label = term === "winter" ? "Winter" : "Fall";
  const result = await syncEventsToGoogle(token, events, label);
  return ok(result);
}

async function handleDownloadIcs(message) {
  const { ics, filename } = message;
  if (!ics) {
    return fail("Nothing to download.", "empty");
  }

  try {
    // Data URLs stay valid if a Firefox event page sleeps during the save dialog.
    await downloadUrl({
      url: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
      filename: filename || "schedule.ics",
      saveAs: true
    });
    return ok();
  } catch (error) {
    return fail(error, "download");
  }
}

async function handleSyncOutlook(message) {
  if (!isMicrosoftAvailableOnThisBrowser()) {
    return fail(
      "Outlook sync is only available in Firefox/Zen.",
      "unsupported_browser"
    );
  }
  const { events, term } = message;
  if (!Array.isArray(events) || events.length === 0) {
    return fail("No events to sync.", "empty");
  }
  const token = await getMicrosoftAccessToken({
    storageArea: storage,
    interactive: true
  });
  const label = term === "winter" ? "Winter" : "Fall";
  const result = await syncEventsToOutlook(token, events, label);
  return ok(result);
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.action !== "string") {
    return;
  }

  const run = async () => {
    switch (message.action) {
      case "getTermDates":
        return handleGetTermDates(message);
      case "buildIcs":
        return handleBuildIcs(message);
      case "downloadIcs":
        return handleDownloadIcs(message);
      case "getAuthStatus":
        return handleGetAuthStatus();
      case "connectGoogle":
        return handleConnectGoogle();
      case "disconnectGoogle":
        return handleDisconnectGoogle();
      case "connectMicrosoft":
        return handleConnectMicrosoft();
      case "disconnectMicrosoft":
        return handleDisconnectMicrosoft();
      case "syncGoogle":
        return handleSyncGoogle(message);
      case "syncOutlook":
        return handleSyncOutlook(message);
      default:
        return fail(`Unknown action: ${message.action}`, "unknown_action");
    }
  };

  const promise = run().catch((error) => fail(error));
  if (isFirefox()) {
    return promise;
  }
  promise.then(sendResponse);
  return true;
});
