import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildClassEvent,
  parseClassContentHtml,
  parseLocalDate,
  parseTime
} from "../utils/events.js";
import { makeICS } from "../utils/ics.js";
import {
  academicYearKey,
  getDefaultTermDates,
  parseSessionalDatesHtml
} from "../utils/termDates.js";

test("parses DraftMySchedule class HTML fields", () => {
  const html = `
    <h5>CS 1026A</h5>
    <div>Time: <span>9:30 AM - 10:30 AM</span></div>
    <div>Day: <span>Monday</span></div>
    <div>Location: <span>NSC-1</span></div>
    <div>Instructor: <span>Smith</span></div>
    <div>Type: <span>Lecture</span></div>
  `;
  const parsed = parseClassContentHtml(html);
  assert.equal(parsed.title, "CS 1026A");
  assert.equal(parsed.startTimeStr, "9:30 AM");
  assert.equal(parsed.endTimeStr, "10:30 AM");
  assert.equal(parsed.dayStr, "Monday");
  assert.equal(parsed.location, "NSC-1");
  assert.equal(parsed.prof, "Smith");
  assert.equal(parsed.type, "Lecture");
});

test("builds recurring events without mutating rangeEnd", () => {
  const rangeStart = parseLocalDate("2026-09-09");
  const rangeEnd = parseLocalDate("2026-12-09");
  const endTimeBefore = rangeEnd.getTime();

  const event = buildClassEvent({
    title: "CS 1026A",
    location: "NSC-1",
    description: "Lecture with Smith in NSC-1",
    dayNum: 1,
    startTime: parseTime("9:30 AM"),
    endTime: parseTime("10:30 AM"),
    rangeStart,
    rangeEnd
  });

  assert.equal(rangeEnd.getTime(), endTimeBefore);
  assert.equal(event.title, "CS 1026A");
  assert.match(event.startLocal, /^20260914T093000$/);
  assert.match(event.untilLocal, /^20261209T235959$/);
  assert.equal(event.dayNum, 1);
});

test("makeICS includes timezone and weekly RRULE", () => {
  const rangeStart = parseLocalDate("2026-09-09");
  const rangeEnd = parseLocalDate("2026-12-09");
  const event = buildClassEvent({
    title: "CS 1026A",
    location: "NSC-1",
    description: "Lecture",
    dayNum: 1,
    startTime: parseTime("9:30 AM"),
    endTime: parseTime("10:30 AM"),
    rangeStart,
    rangeEnd
  });

  const ics = makeICS([event], "-//ClassMyCalendar fall//");
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /TZID:America\/Toronto/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20261209T235959/);
  assert.match(ics, /SUMMARY:CS 1026A/);
  assert.match(ics, /END:VCALENDAR/);
});

test("parses undergraduate sessional date fixtures", () => {
  const fixture = `
| Date(s) | Description | Category | Type |
| 2026-09-09 September 09, 2026 | Fall/Winter Term classes begin. | Fall/Winter Term Date including Study Breaks | Undergraduate |
| 2026-12-09 December 09, 2026 | Fall/Winter classes end. | Fall/Winter Term Date including Study Breaks | Undergraduate |
| 2027-01-04 January 04, 2027 | Classes resume. | Fall/Winter Term Date including Study Breaks | Undergraduate |
| 2027-04-09 April 09, 2027 | Fall/Winter classes end. | Fall/Winter Term Date including Study Breaks | Undergraduate |
`;

  const parsed = parseSessionalDatesHtml(fixture, "2026-2027");
  assert.deepEqual(parsed, {
    academicYear: "2026-2027",
    fall: { start: "2026-09-09", end: "2026-12-09" },
    winter: { start: "2027-01-04", end: "2027-04-09" },
    source: "westerncalendar"
  });
});

test("provides offline default term dates for known academic years", () => {
  const dates = getDefaultTermDates(new Date("2026-10-01T12:00:00"));
  assert.equal(dates.academicYear, "2026-2027");
  assert.equal(dates.fall.start, "2026-09-09");
  assert.equal(academicYearKey(new Date("2026-03-01T12:00:00")), "2025-2026");
});

test("release manifests scope hosts and keep Firefox gecko settings", async () => {
  const chromeManifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url), "utf8")
  );
  const firefoxManifest = JSON.parse(
    await readFile(new URL("../manifest.firefox.json", import.meta.url), "utf8")
  );

  assert.equal(chromeManifest.manifest_version, 3);
  assert.equal(firefoxManifest.manifest_version, 3);
  assert.deepEqual(chromeManifest.content_scripts[0].matches, [
    "https://draftmyschedule.uwo.ca/*"
  ]);
  assert.ok(
    chromeManifest.host_permissions.includes(
      "https://www.westerncalendar.uwo.ca/*"
    )
  );
  assert.equal(chromeManifest.background.service_worker, "background.js");
  assert.equal(chromeManifest.background.type, "module");
  assert.ok(chromeManifest.oauth2?.client_id);
  assert.deepEqual(firefoxManifest.background.scripts, ["background.js"]);
  assert.equal(firefoxManifest.background.type, "module");
  assert.equal(firefoxManifest.oauth2, undefined);
  assert.ok(firefoxManifest.permissions.includes("downloads"));
  assert.ok(
    firefoxManifest.host_permissions.includes(
      "https://login.microsoftonline.com/*"
    )
  );
  assert.equal(
    firefoxManifest.host_permissions.some((host) => host.includes("googleapis")),
    false
  );
  assert.match(
    firefoxManifest.browser_specific_settings.gecko.id,
    /^\{[0-9a-f-]{36}\}$/
  );
  assert.deepEqual(
    firefoxManifest.browser_specific_settings.gecko.data_collection_permissions
      .required,
    ["authenticationInfo"]
  );
});

test("content script avoids innerHTML assignment sinks", async () => {
  const contentScript = await readFile(
    new URL("../content.js", import.meta.url),
    "utf8"
  );
  assert.equal(contentScript.includes(".innerHTML ="), false);
  assert.match(contentScript, /DOMParser/);
  assert.match(contentScript, /scrapeTerm/);
  assert.match(contentScript, /typeof browser !== "undefined"/);
});

test("popup is an ES module that uses the shared extension API", async () => {
  const popupHtml = await readFile(
    new URL("../popup.html", import.meta.url),
    "utf8"
  );
  const popupJs = await readFile(new URL("../popup.js", import.meta.url), "utf8");
  const backgroundJs = await readFile(
    new URL("../background.js", import.meta.url),
    "utf8"
  );

  assert.match(popupHtml, /<script type="module" src="popup\.js">/);
  assert.match(popupJs, /from "\.\/utils\/extApi\.js"/);
  assert.match(popupJs, /downloadIcs/);
  assert.match(backgroundJs, /downloadIcs/);
  assert.match(backgroundJs, /getExtApi/);
  assert.equal(backgroundJs.includes("data:text/calendar"), false);
});

test("shortenDownloadError hides huge data: URL failures", async () => {
  const { shortenDownloadError } = await import("../utils/extApi.js");
  const error = shortenDownloadError(
    new Error(
      "Type error for parameter options (Error processing url: Error: Access denied for URL data:text/calendar;charset=utf-8,BEGIN:VCALENDAR) for downloads.download."
    )
  );
  assert.match(error.message, /blob download/i);
  assert.equal(error.message.includes("BEGIN:VCALENDAR"), false);
});

test("getExtApi throws outside an extension runtime", async () => {
  const { getExtApi, isFirefox } = await import("../utils/extApi.js");
  assert.equal(isFirefox(), false);
  assert.throws(() => getExtApi(), /WebExtension APIs are unavailable/);
});
