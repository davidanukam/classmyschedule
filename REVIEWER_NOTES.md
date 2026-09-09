# Notes for Reviewers — ClassMyCalendar

## Summary

ClassMyCalendar is a Manifest V3 add-on for Western University's DraftMySchedule. It:

1. Scrapes the on-page class list tables.
2. Builds weekly recurring calendar events between Fall/Winter term dates.
3. Exports an `.ics` file, and optionally syncs to Google Calendar or Microsoft Outlook when the user connects an account.

Chrome and Firefox packages are produced from the same runtime files. Differences:

- Chrome `manifest.json`: `background.service_worker`, Google `oauth2`, Google host permissions
- Firefox `manifest.firefox.json`: `background.scripts`, `gecko.id`, `downloads`, Microsoft hosts only
- Runtime code prefers Gecko `browser.*` (promises) and falls back to Chromium `chrome.*`

## How to test

1. Run `npm install` and `npm run stage`.
2. Load `build/firefox` (or `build/chrome`) as a temporary / unpacked extension.
3. Open `https://draftmyschedule.uwo.ca/` and display a schedule with Fall and/or Winter classes.
4. Open the toolbar popup.
5. Confirm Fall/Winter date ranges auto-fill (Western Academic Calendar or offline defaults).
6. Click **Export .ics** for a term and confirm a download.
7. Optional: configure OAuth client IDs (see README) and test Google / Outlook connect + sync.

## Network destinations

| Host | Why |
|------|-----|
| `draftmyschedule.uwo.ca` | Content script reads schedule DOM |
| `westerncalendar.uwo.ca` | Fetch undergraduate sessional dates |
| `accounts.google.com` / `www.googleapis.com` | Optional Google OAuth + Calendar API |
| `login.microsoftonline.com` / `graph.microsoft.com` | Optional Microsoft OAuth + Graph |

No developer-controlled backend is used. Packages are unminified allowlist copies from `scripts/build.mjs`.

## Permissions rationale

- `tabs` / `scripting` — talk to the active DraftMySchedule tab and reinject the content script if needed
- `storage` — cache term dates and Outlook token metadata
- `identity` — OAuth for Google (Chrome) and Microsoft (Firefox)
- `downloads` — Firefox `.ics` export (Chrome saves via a popup blob download instead)
- Host permissions — only the sites/APIs listed above; Firefox omits Google API hosts

## Data collection (Firefox)

`authenticationInfo` is declared because optional Google/Outlook sync uses browser identity / OAuth. Schedule content is sent to Google or Microsoft only when the user starts a sync. `.ics` export does not transmit schedule data off-device.
