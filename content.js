/**
 * ClassMyCalendar content script — DraftMySchedule DOM scrape only.
 * Kept free of ES module imports for Chrome + Firefox content_scripts compatibility.
 */
(function () {
  const DAY_MAP = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function parseTime(timeStr) {
    const [time, meridian] = timeStr.trim().split(/\s+/);
    let [hours, minutes] = time.split(":").map(Number);
    if (meridian === "PM" && hours !== 12) hours += 12;
    if (meridian === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  function getDayNumber(dayStr) {
    const normalized = dayStr.slice(0, 3);
    return Object.prototype.hasOwnProperty.call(DAY_MAP, normalized)
      ? DAY_MAP[normalized]
      : -1;
  }

  function getNextWeekday(fromDate, weekday) {
    const date = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate()
    );
    const diff = (weekday + 7 - date.getDay()) % 7;
    date.setDate(date.getDate() + diff);
    return date;
  }

  function toIcalDateString(date) {
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

  function parseClassContentHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("h5")?.textContent?.trim() || null;
    const bodyText = doc.body?.textContent || "";

    const timeMatch = bodyText.match(
      /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i
    );
    const dayMatch =
      html.match(/Day:.*?>(\w+)</i) || bodyText.match(/Day:\s*(\w+)/i);

    const field = (label) => {
      const fromText = bodyText.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
      if (fromText) return fromText[1].trim();
      const fromHtml = html.match(new RegExp(`${label}:.*?>([^<]*)<`, "i"));
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

  function buildClassEvent({
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

  function parseTable(table, rangeStart, rangeEnd) {
    const events = [];
    const boxes = table.querySelectorAll('[class^="class_box_o_"]');

    boxes.forEach((box) => {
      const html = box.getAttribute("data-content");
      if (!html) return;

      const parsed = parseClassContentHtml(html);
      if (
        !parsed.title ||
        !parsed.startTimeStr ||
        !parsed.endTimeStr ||
        !parsed.dayStr
      ) {
        return;
      }

      const dayNum = getDayNumber(parsed.dayStr);
      if (dayNum === -1) return;

      events.push(
        buildClassEvent({
          title: parsed.title,
          location: parsed.location,
          description: `${parsed.type} with ${parsed.prof} in ${parsed.location}`,
          dayNum,
          startTime: parseTime(parsed.startTimeStr),
          endTime: parseTime(parsed.endTimeStr),
          rangeStart,
          rangeEnd
        })
      );
    });

    return events;
  }

  /**
   * DraftMySchedule does not currently expose term start/end dates.
   * Probe kept for future layout changes.
   */
  function probePageTermDates() {
    const text = document.body?.innerText || "";
    const patterns = [
      /(?:Fall|Autumn).*?(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/i,
      /Term\s*Dates?[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
    ];
    for (const re of patterns) {
      const match = text.match(re);
      if (match) {
        return { found: true, raw: match[0] };
      }
    }
    return { found: false };
  }

  function extractEvents(mode, startDateStr, endDateStr) {
    const allTables = document.querySelectorAll("table.table-bordered");
    const table = mode === "fall" ? allTables[0] : allTables[1];
    if (!table) {
      return {
        success: false,
        code: "table_missing",
        error: `Could not find the ${mode} schedule table on this page.`
      };
    }

    const rangeStart = parseLocalDate(startDateStr);
    const rangeEnd = parseLocalDate(endDateStr);
    const events = parseTable(table, rangeStart, rangeEnd);

    if (!events.length) {
      return {
        success: false,
        code: "empty",
        error: "Empty schedule? No class events were found."
      };
    }

    return {
      success: true,
      events,
      pageDates: probePageTermDates()
    };
  }

  const api = typeof browser !== "undefined" ? browser : chrome;
  const gecko = typeof browser !== "undefined";

  api.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!request || typeof request.action !== "string") {
      return;
    }

    let response;
    if (request.action === "probeDates") {
      response = { success: true, pageDates: probePageTermDates() };
    } else if (request.action === "scrapeTerm") {
      const { term, startDate, endDate } = request;
      if (!startDate || !endDate) {
        response = {
          success: false,
          code: "bad_dates",
          error: "Start and end dates are required."
        };
      } else {
        const mode = term === "winter" ? "winter" : "fall";
        response = extractEvents(mode, startDate, endDate);
      }
    } else {
      return;
    }

    if (gecko) {
      return Promise.resolve(response);
    }
    sendResponse(response);
    return false;
  });
})();
