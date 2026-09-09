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

export async function downloadUrl({ url, filename, saveAs = true }) {
  const api = getExtApi();
  if (typeof api.downloads?.download !== "function") {
    throw new Error("The downloads API is unavailable in this browser.");
  }
  return api.downloads.download({
    url,
    filename: filename || "download",
    saveAs
  });
}
