/**
 * Cross-browser WebExtension API.
 * Firefox/Zen expose promise-based `browser.*`; Chrome MV3 `chrome.*` also
 * returns promises when no callback is passed. Prefer `browser` on Gecko so
 * we never mix callback-style chrome shims with await.
 */

export function getExtApi() {
  const browserApi = globalThis.browser;
  const chromeApi = globalThis.chrome;
  if (browserApi && typeof browserApi.runtime?.getURL === "function") {
    return browserApi;
  }
  if (chromeApi && typeof chromeApi.runtime?.getURL === "function") {
    return chromeApi;
  }
  throw new Error("WebExtension APIs are unavailable.");
}

export function isFirefox() {
  try {
    return getExtApi().runtime.getURL("").startsWith("moz-extension://");
  } catch {
    return false;
  }
}

export function getRedirectURL() {
  return getExtApi().identity.getRedirectURL();
}

export async function launchWebAuthFlow(details) {
  const api = getExtApi();
  return api.identity.launchWebAuthFlow(details);
}

export function shortenDownloadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Access denied for URL data:/i.test(message) || /Error processing url/i.test(message)) {
    return new Error(
      "Firefox blocked that download URL. The add-on will retry with a blob download."
    );
  }
  if (message.length > 180) {
    return new Error(`${message.slice(0, 160)}…`);
  }
  return error instanceof Error ? error : new Error(message);
}

function revokeBlobUrl(url) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

function watchDownloadThenRevoke(api, url, downloadId) {
  const revoke = () => revokeBlobUrl(url);

  if (typeof downloadId !== "number" || !api.downloads?.onChanged?.addListener) {
    setTimeout(revoke, 60_000);
    return;
  }

  const onChanged = (delta) => {
    if (delta.id !== downloadId) return;
    if (delta.state?.current === "complete" || delta.state?.current === "interrupted") {
      api.downloads.onChanged.removeListener(onChanged);
      revoke();
    }
  };
  api.downloads.onChanged.addListener(onChanged);
  setTimeout(() => {
    try {
      api.downloads.onChanged.removeListener(onChanged);
    } catch {
      // ignore
    }
    revoke();
  }, 5 * 60_000);
}

/**
 * Firefox rejects data: URLs in downloads.download(). Use a blob: URL instead.
 * Firefox background event pages (unlike Chrome service workers) support createObjectURL.
 */
export async function downloadTextFile({
  body,
  filename,
  mimeType = "text/plain;charset=utf-8",
  saveAs = true
}) {
  if (typeof URL.createObjectURL !== "function") {
    throw new Error("Blob URLs are unavailable in this context.");
  }
  const api = getExtApi();
  if (typeof api.downloads?.download !== "function") {
    throw new Error("The downloads API is unavailable in this browser.");
  }

  const url = URL.createObjectURL(new Blob([body], { type: mimeType }));
  try {
    const downloadId = await api.downloads.download({
      url,
      filename: filename || "download",
      saveAs,
      conflictAction: "uniquify"
    });
    watchDownloadThenRevoke(api, url, downloadId);
    return downloadId;
  } catch (error) {
    revokeBlobUrl(url);
    throw shortenDownloadError(error);
  }
}
