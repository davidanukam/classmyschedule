import { TIMEZONE } from "../constants.js";

function escapeText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Minimal VTIMEZONE for America/Toronto using standard North American DST rules
 * (second Sunday in March / first Sunday in November).
 */
export function buildTorontoVTimezone(referenceYear = new Date().getFullYear()) {
  const year = referenceYear;
  const nextYear = year + 1;

  const secondSundayMarch = nthWeekdayOfMonth(year, 2, 0, 2);
  const firstSundayNovember = nthWeekdayOfMonth(year, 10, 0, 1);
  const nextFirstSundayNovember = nthWeekdayOfMonth(nextYear, 10, 0, 1);

  const format = (d, hour) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}0000`;
  };

  return [
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE}`,
    "BEGIN:DAYLIGHT",
    `DTSTART:${format(secondSundayMarch, 2)}`,
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    `DTSTART:${format(firstSundayNovember, 2)}`,
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];
}

function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  const date = new Date(year, monthIndex, 1);
  let count = 0;
  while (date.getMonth() === monthIndex) {
    if (date.getDay() === weekday) {
      count += 1;
      if (count === n) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
      }
    }
    date.setDate(date.getDate() + 1);
  }
  return new Date(year, monthIndex, 1);
}

export function makeEventLines(event) {
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${event.startLocal}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DTSTART;TZID=${TIMEZONE}:${event.startLocal}`,
    `DTEND;TZID=${TIMEZONE}:${event.endLocal}`,
    `RRULE:FREQ=WEEKLY;UNTIL=${event.untilLocal}`,
    "SEQUENCE:0",
    `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    "END:VEVENT"
  ].join("\r\n");
}

export function makeICS(events, prodid = "-//ClassMyCalendar//EN") {
  const year =
    events.length > 0
      ? Number(String(events[0].startLocal).slice(0, 4))
      : new Date().getFullYear();

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `PRODID:${prodid}`,
    ...buildTorontoVTimezone(year),
    ...events.map(makeEventLines),
    "END:VCALENDAR"
  ].join("\r\n");
}
