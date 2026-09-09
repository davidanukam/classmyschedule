# ClassMyCalendar Privacy Policy

Last updated: September 8, 2026

ClassMyCalendar helps Western University students export class schedules from DraftMySchedule to an `.ics` file, Google Calendar, or Microsoft Outlook.

## Data the extension accesses

On `draftmyschedule.uwo.ca`, ClassMyCalendar reads the class list shown under the DraftMySchedule calendar (course titles, times, days, locations, instructors, and session types) in order to build calendar events.

ClassMyCalendar also requests undergraduate Fall/Winter class start and end dates from `westerncalendar.uwo.ca` (Sessional Dates) so term ranges can be filled in automatically. Manual date overrides stay on your device.

## Data sent to third parties

### Google Calendar (optional)

If you choose **Connect** / sync to Google Calendar, the extension sends OAuth authentication requests to Google and creates calendar events in your Google account using the Google Calendar API. Class details from DraftMySchedule are sent to Google only when you explicitly sync.

### Microsoft Outlook (optional)

If you choose **Connect** / sync to Outlook, the extension sends OAuth authentication requests to Microsoft and creates calendar events using Microsoft Graph. Class details from DraftMySchedule are sent to Microsoft only when you explicitly sync.

### .ics export

Downloading an `.ics` file keeps schedule data on your device. Importing that file into Apple Calendar, Notion, Obsidian, or another app is handled by that app under its own privacy practices.

## Storage and sharing

ClassMyCalendar does not:

- create developer-operated user accounts;
- collect analytics, telemetry, advertising identifiers, or browsing history beyond the DraftMySchedule and Academic Calendar pages it needs;
- sell data; or
- send schedule data to the extension developer.

Local preferences and Microsoft OAuth tokens (when Outlook sync is used) may be stored with the browser extension storage APIs. Google tokens are handled through the browser identity APIs when available.

On Firefox-based browsers, saving an `.ics` file uses the browser downloads API so the file picker can run after the toolbar popup closes.

## Permissions

ClassMyCalendar requests access to:

- `draftmyschedule.uwo.ca` — read schedule tables;
- `westerncalendar.uwo.ca` — fetch sessional dates;
- Google and Microsoft identity / API hosts — only for optional calendar sync;
- `tabs`, `storage`, `identity`, `scripting`, and (on Firefox) `downloads` — operate the popup, cache dates, authenticate, and save `.ics` files.

## Questions

Privacy questions and issues can be filed at the project repository issues page.
