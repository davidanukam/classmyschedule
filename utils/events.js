/** Pure helpers for schedule event dates and serialization. */

const DAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseTime(timeStr) {
  const [time, meridian] = timeStr.trim().split(/\s+/);
  let [hours, minutes] = time.split(":").map(Number);
  if (meridian === "PM" && hours !== 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

export function getDayNumber(dayStr) {
  const normalized = dayStr.slice(0, 3);
  return Object.prototype.hasOwnProperty.call(DAY_MAP, normalized)
    ? DAY_MAP[normalized]
    : -1;
}

export function getNextWeekday(fromDate, weekday) {
  const date = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const diff = (weekday + 7 - date.getDay()) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

export function toIcalDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/**
 * Build a structured recurring class event.
 * Does not mutate rangeEnd.
 */
export function buildClassEvent({
  title,
  location,
  description,
  dayNum,
  startTime,
  endTime,
  rangeStart,
  rangeEnd
}) {
  const firstDate = getNextWeekday(rangeStart, dayNum);
  const start = new Date(firstDate);
  start.setHours(startTime.hours, startTime.minutes, 0, 0);

  const end = new Date(firstDate);
  end.setHours(endTime.hours, endTime.minutes, 0, 0);

  const until = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    rangeEnd.getDate(),
    23,
    59,
    59
  );

  return {
    title: title || "Untitled Class",
    location: location || "TBD",
    description: description || "",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    untilIso: until.toISOString(),
    startLocal: toIcalDateString(start),
    endLocal: toIcalDateString(end),
    untilLocal: toIcalDateString(until),
    dayNum,
    uid: `${start.getTime()}-${(title || "class").replace(/\s+/g, "_")}@classmycalendar`
  };
}

/**
 * Parse class details from DraftMySchedule data-content HTML.
 * Uses DOMParser when available; falls back to regex for Node tests.
 */
export function parseClassContentHtml(html) {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("h5")?.textContent?.trim() || null;
    const bodyText = doc.body?.textContent || "";

    const timeMatch = bodyText.match(
      /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i
    );
    const dayMatch =
      html.match(/Day:.*?>(\w+)</i) || bodyText.match(/Day:\s*(\w+)/i);

    const field = (label) => {
      const re = new RegExp(`${label}:\\s*([^\\n<]+)`, "i");
      const fromText = bodyText.match(re);
      if (fromText) return fromText[1].trim();
      const fromHtml = html.match(
        new RegExp(`${label}:.*?>([^<]*)<`, "i")
      );
      return fromHtml ? fromHtml[1].trim() : "";
    };

    return {
      title,
      startTimeStr: timeMatch?.[1]?.trim() || null,
      endTimeStr: timeMatch?.[2]?.trim() || null,
      dayStr: dayMatch?.[1]?.trim() || null,
      location: field("Location") || "TBD",
      prof: field("Instructor") || "Unknown",
      type: field("Type") || "Session"
    };
  }

  const title = (html.match(/<h5>(.*?)<\/h5>/i) || [])[1]?.trim() || null;
  const times = (html.match(
    /Time:.*?(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i
  ) || []).slice(1);
  const dayStr = (html.match(/Day:.*?>(\w+)</i) || [])[1]?.trim() || null;
  const location =
    (html.match(/Location:.*?>([^<]*)</i) || [])[1]?.trim() || "TBD";
  const prof =
    (html.match(/Instructor:.*?>([^<]*)</i) || [])[1]?.trim() || "Unknown";
  const type = (html.match(/Type:.*?>([^<]*)</i) || [])[1]?.trim() || "Session";

  return {
    title,
    startTimeStr: times[0]?.trim() || null,
    endTimeStr: times[1]?.trim() || null,
    dayStr,
    location,
    prof,
    type
  };
}
