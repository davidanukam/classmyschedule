/** Shared configuration for ClassMyCalendar. */

export const PRODUCT_NAME = "ClassMyCalendar";
export const TIMEZONE = "America/Toronto";

export const DRAFT_MY_SCHEDULE_ORIGIN = "https://draftmyschedule.uwo.ca";
export const SESSIONAL_DATES_URL =
  "https://www.westerncalendar.uwo.ca/SessionalDates.cfm";

/**
 * Browser sync policy:
 * - Chrome: Google Calendar + .ics export
 * - Firefox / Zen: Outlook + .ics export
 * Google Web-client OAuth for Firefox is intentionally unsupported
 * (identity redirect UUID mismatches Google Cloud reliably).
 */

/** Chrome Extension OAuth client (manifest oauth2 + getAuthToken). */
export const GOOGLE_OAUTH_CLIENT_ID_CHROME =
  "162482059553-ejq25b7ohmqdtun7odpd0k8l60dg1a43.apps.googleusercontent.com";

/** @deprecated Google sync is Chrome-only; kept empty on purpose. */
export const GOOGLE_OAUTH_CLIENT_ID_FIREFOX = "";

/** @deprecated Prefer GOOGLE_OAUTH_CLIENT_ID_CHROME */
export const GOOGLE_OAUTH_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID_CHROME;

/**
 * Azure AD app (public client) Application (client) ID.
 * Used on Firefox / Zen for Outlook sync.
 */
export const MICROSOFT_CLIENT_ID = "4bd59e41-e5e0-43c3-9890-a5a9f5b0851e";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "Calendars.ReadWrite"
].join(" ");

export const STORAGE_KEYS = {
  termDates: "termDatesCache",
  googleConnected: "googleConnected",
  microsoftConnected: "microsoftConnected",
  microsoftTokens: "microsoftTokens"
};
