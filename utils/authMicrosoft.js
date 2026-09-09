import { MICROSOFT_CLIENT_ID, MICROSOFT_SCOPES, STORAGE_KEYS } from "../constants.js";
import { getExtApi, getRedirectURL, isFirefox, launchWebAuthFlow } from "./extApi.js";

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

function randomString(length = 64) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

export function isMicrosoftAvailableOnThisBrowser() {
  return isFirefox();
}

export function isMicrosoftConfigured() {
  return (
    isMicrosoftAvailableOnThisBrowser() &&
    Boolean(MICROSOFT_CLIENT_ID && !MICROSOFT_CLIENT_ID.startsWith("REPLACE"))
  );
}

function defaultStorage() {
  return getExtApi().storage.local;
}

export async function getStoredMicrosoftTokens(storageArea = defaultStorage()) {
  const result = await storageArea.get(STORAGE_KEYS.microsoftTokens);
  return result[STORAGE_KEYS.microsoftTokens] || null;
}

export async function clearMicrosoftTokens(storageArea = defaultStorage()) {
  await storageArea.remove([
    STORAGE_KEYS.microsoftTokens,
    STORAGE_KEYS.microsoftConnected
  ]);
}

async function exchangeCodeForTokens({ code, codeVerifier, redirectUrl }) {
  const body = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUrl,
    code_verifier: codeVerifier,
    scope: MICROSOFT_SCOPES
  });

  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed");
  }
  return data;
}

async function refreshMicrosoftToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES
  });

  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Microsoft refresh failed");
  }
  return data;
}

async function persistTokens(storageArea, tokenResponse) {
  const record = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000 - 60_000
  };
  await storageArea.set({
    [STORAGE_KEYS.microsoftTokens]: record,
    [STORAGE_KEYS.microsoftConnected]: true
  });
  return record;
}

/**
 * Interactive Microsoft sign-in using PKCE (public client, no secret).
 */
export async function connectMicrosoft({
  storageArea = defaultStorage(),
  interactive = true
} = {}) {
  if (!isMicrosoftAvailableOnThisBrowser()) {
    throw new Error(
      "Outlook sync is only available in Firefox/Zen. On Chrome use Google Calendar or Export .ics."
    );
  }
  if (!isMicrosoftConfigured()) {
    throw new Error(
      "Outlook is not configured. Set MICROSOFT_CLIENT_ID in constants.js."
    );
  }
  if (!interactive) {
    throw new Error("Microsoft sign-in required.");
  }

  const redirectUrl = getRedirectURL();
  const codeVerifier = randomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  const state = randomString(32);

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUrl,
    response_mode: "query",
    scope: MICROSOFT_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state
  });

  const authUrl =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;

  const responseUrl = await launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  const url = new URL(responseUrl);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const queryParams = url.searchParams;
  const code = hashParams.get("code") || queryParams.get("code");
  const returnedState = hashParams.get("state") || queryParams.get("state");
  const error = hashParams.get("error") || queryParams.get("error");

  if (error) {
    throw new Error(hashParams.get("error_description") || error);
  }
  if (!code) {
    throw new Error("Microsoft did not return an authorization code.");
  }
  if (returnedState && returnedState !== state) {
    throw new Error("Microsoft OAuth state mismatch.");
  }

  const tokenResponse = await exchangeCodeForTokens({
    code,
    codeVerifier,
    redirectUrl
  });
  return persistTokens(storageArea, tokenResponse);
}

export async function getMicrosoftAccessToken({
  storageArea = defaultStorage(),
  interactive = true
} = {}) {
  if (!isMicrosoftAvailableOnThisBrowser()) {
    throw new Error(
      "Outlook sync is only available in Firefox/Zen. On Chrome use Google Calendar or Export .ics."
    );
  }
  if (!MICROSOFT_CLIENT_ID || MICROSOFT_CLIENT_ID.startsWith("REPLACE")) {
    throw new Error(
      "Outlook is not configured. Set MICROSOFT_CLIENT_ID in constants.js."
    );
  }

  let tokens = await getStoredMicrosoftTokens(storageArea);
  if (tokens?.accessToken && tokens.expiresAt > Date.now()) {
    return tokens.accessToken;
  }

  if (tokens?.refreshToken) {
    try {
      const refreshed = await refreshMicrosoftToken(tokens.refreshToken);
      tokens = await persistTokens(storageArea, {
        ...refreshed,
        refresh_token: refreshed.refresh_token || tokens.refreshToken
      });
      return tokens.accessToken;
    } catch {
      await clearMicrosoftTokens(storageArea);
    }
  }

  if (!interactive) {
    throw new Error("Microsoft sign-in required.");
  }

  tokens = await connectMicrosoft({ storageArea, interactive: true });
  return tokens.accessToken;
}

export async function disconnectMicrosoft(storageArea = defaultStorage()) {
  await clearMicrosoftTokens(storageArea);
}
