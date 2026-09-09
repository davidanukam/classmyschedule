import { TIMEZONE } from "../constants.js";

async function googleFetch(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message =
      data?.error?.message || data?.error_description || `Google API ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function toGoogleDateTime(localIcal) {
  // localIcal: YYYYMMDDTHHMMSS
  const y = localIcal.slice(0, 4);
  const m = localIcal.slice(4, 6);
  const d = localIcal.slice(6, 8);
  const hh = localIcal.slice(9, 11);
  const mm = localIcal.slice(11, 13);
  const ss = localIcal.slice(13, 15);
  return {
    dateTime: `${y}-${m}-${d}T${hh}:${mm}:${ss}`,
    timeZone: TIMEZONE
  };
}

function untilToGoogle(untilLocal) {
  // Date-only UNTIL ends recurrence on that calendar day (RFC 5545).
  return untilLocal.slice(0, 8);
}

export async function createGoogleCalendar(token, summary) {
  return googleFetch(token, "https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    body: JSON.stringify({ summary, timeZone: TIMEZONE })
  });
}

export async function insertGoogleEvent(token, calendarId, event) {
  const body = {
    summary: event.title,
    location: event.location,
    description: event.description,
    start: toGoogleDateTime(event.startLocal),
    end: toGoogleDateTime(event.endLocal),
    recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${untilToGoogle(event.untilLocal)}`]
  };

  return googleFetch(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
}

/**
 * Create a dedicated calendar and insert all class events.
 */
export async function syncEventsToGoogle(token, events, termLabel) {
  const calendar = await createGoogleCalendar(
    token,
    `Western ${termLabel} (ClassMyCalendar)`
  );

  let created = 0;
  for (const event of events) {
    await insertGoogleEvent(token, calendar.id, event);
    created += 1;
  }

  return {
    calendarId: calendar.id,
    calendarUrl: calendar.id
      ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendar.id)}`
      : null,
    created
  };
}
