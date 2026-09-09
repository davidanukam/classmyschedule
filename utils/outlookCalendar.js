import { TIMEZONE } from "../constants.js";

async function graphFetch(token, url, options = {}) {
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
      data?.error?.message || data?.error_description || `Graph API ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function localIcalToIso(localIcal) {
  const y = localIcal.slice(0, 4);
  const m = localIcal.slice(4, 6);
  const d = localIcal.slice(6, 8);
  const hh = localIcal.slice(9, 11);
  const mm = localIcal.slice(11, 13);
  const ss = localIcal.slice(13, 15);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function dayNumToMicrosoft(dayNum) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    dayNum
  ];
}

export async function createOutlookCalendar(token, name) {
  return graphFetch(token, "https://graph.microsoft.com/v1.0/me/calendars", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function insertOutlookEvent(token, calendarId, event) {
  const body = {
    subject: event.title,
    body: {
      contentType: "text",
      content: event.description || ""
    },
    location: {
      displayName: event.location || ""
    },
    start: {
      dateTime: localIcalToIso(event.startLocal),
      timeZone: TIMEZONE
    },
    end: {
      dateTime: localIcalToIso(event.endLocal),
      timeZone: TIMEZONE
    },
    recurrence: {
      pattern: {
        type: "weekly",
        interval: 1,
        daysOfWeek: [dayNumToMicrosoft(event.dayNum ?? 1)]
      },
      range: {
        type: "endDate",
        startDate: localIcalToIso(event.startLocal).slice(0, 10),
        endDate: localIcalToIso(event.untilLocal).slice(0, 10)
      }
    }
  };

  return graphFetch(
    token,
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
}

export async function syncEventsToOutlook(token, events, termLabel) {
  const calendar = await createOutlookCalendar(
    token,
    `Western ${termLabel} (ClassMyCalendar)`
  );

  let created = 0;
  for (const event of events) {
    await insertOutlookEvent(token, calendar.id, event);
    created += 1;
  }

  return {
    calendarId: calendar.id,
    created
  };
}
