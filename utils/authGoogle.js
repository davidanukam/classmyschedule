import {
  GOOGLE_OAUTH_CLIENT_ID_CHROME
} from "../constants.js";
import { getExtApi, isFirefox } from "./extApi.js";

export { isFirefox };

/** Chrome Extension OAuth client (getAuthToken / manifest oauth2). */
export function resolveChromeExtensionClientId() {
  if (GOOGLE_OAUTH_CLIENT_ID_CHROME) return GOOGLE_OAUTH_CLIENT_ID_CHROME;
  try {
    const id = getExtApi().runtime.getManifest()?.oauth2?.client_id;
    if (id && !id.startsWith("REPLACE_WITH_")) return id;
  } catch {
    // ignore
  }
  return "";
}

export function resolveGoogleClientId() {
  if (isFirefox()) return "";
  return resolveChromeExtensionClientId();
}

export function isGoogleConfigured() {
  return !isFirefox() && Boolean(resolveChromeExtensionClientId());
}

export function isGoogleAvailableOnThisBrowser() {
  return !isFirefox();
}

export function getGoogleRedirectUrl() {
  try {
    return getExtApi().identity.getRedirectURL();
  } catch {
    return "";
  }
}

/**
 * Obtain a Google OAuth access token (Chrome only via getAuthToken).
 */
export async function getGoogleAccessToken({ interactive = true } = {}) {
  if (isFirefox()) {
    throw new Error(
      "Google Calendar sync is only available in Chrome. On Firefox/Zen use Outlook or Export .ics."
    );
  }

  const clientId = resolveChromeExtensionClientId();
  if (!clientId) {
    throw new Error(
      "Google Calendar is not configured. Set GOOGLE_OAUTH_CLIENT_ID_CHROME / manifest oauth2.client_id."
    );
  }

  const chromeGetAuthToken = chrome.identity?.["get" + "AuthToken"];
  if (typeof chromeGetAuthToken !== "function") {
    throw new Error("chrome.identity.getAuthToken is unavailable in this browser.");
  }

  try {
    const result = await chromeGetAuthToken.call(chrome.identity, {
      interactive
    });
    const token = typeof result === "string" ? result : result?.token;
    if (token) return token;
    throw new Error("Google did not return an access token.");
  } catch (error) {
    if (!interactive) throw error;
    throw new Error(
      error instanceof Error
        ? error.message
        : "Google sign-in failed. Check the Chrome Extension OAuth client ID and consent screen."
    );
  }
}

export async function revokeGoogleAccessToken(token) {
  if (!token || isFirefox()) return;

  const chromeRemoveCached = chrome.identity?.["removeCached" + "AuthToken"];
  if (typeof chromeRemoveCached === "function") {
    try {
      await chromeRemoveCached.call(chrome.identity, { token });
    } catch {
      // ignore
    }
  }

  try {
    await fetch(
      `https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`
    );
  } catch {
    // ignore
  }
}
