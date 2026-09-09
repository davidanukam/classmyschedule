import {
  SESSIONAL_DATES_URL,
  STORAGE_KEYS
} from "../constants.js";
import { formatLocalDate, parseLocalDate } from "./events.js";

/**
 * Built-in undergraduate defaults for 2025-26 / 2026-27 academic years.
 * Used when the live Western Calendar fetch fails.
 */
export const DEFAULT_TERM_DATES = {
  "2025-2026": {
    fall: { start: "2025-09-04", end: "2025-12-09" },
    winter: { start: "2026-01-05", end: "2026-04-09" },
    source: "defaults"
  },
  "2026-2027": {
    fall: { start: "2026-09-09", end: "2026-12-09" },
    winter: { start: "2027-01-04", end: "2027-04-09" },
    source: "defaults"
  }
};

export function academicYearKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  // Academic year starts roughly in September (month index 8).
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function getDefaultTermDates(referenceDate = new Date()) {
  const key = academicYearKey(referenceDate);
  if (DEFAULT_TERM_DATES[key]) {
    return { academicYear: key, ...DEFAULT_TERM_DATES[key] };
  }
  // Nearest known year fallback
  const keys = Object.keys(DEFAULT_TERM_DATES).sort();
  const nearest = keys[keys.length - 1];
  return { academicYear: nearest, ...DEFAULT_TERM_DATES[nearest] };
}

/**
 * Parse undergraduate Fall/Winter class start/end dates from Sessional Dates HTML.
 */
export function parseSessionalDatesHtml(html, academicYear) {
  const [startYearStr, endYearStr] = academicYear.split("-");
  const startYear = Number(startYearStr);
  const endYear = Number(endYearStr);

  const rows = [];
  const rowRe =
    /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = rowRe.exec(html)) !== null) {
    const dateCell = stripTags(match[1]);
    const description = stripTags(match[2]);
    const typeCell = match[0].match(/Undergraduate/i) ? "Undergraduate" : "";
    rows.push({ dateCell, description, typeCell, raw: match[0] });
  }

  // Also support markdown-ish / plain table dumps used in tests
  if (rows.length === 0) {
    const lineRe =
      /^\|\s*(\d{4}-\d{2}-\d{2}(?:\s+to\s+\d{4}-\d{2}-\d{2})?)[^|]*\|\s*([^|]+)\|/gim;
    let lineMatch;
    while ((lineMatch = lineRe.exec(html)) !== null) {
      rows.push({
        dateCell: lineMatch[1],
        description: lineMatch[2].trim(),
        typeCell: html.includes("Undergraduate") ? "Undergraduate" : "",
        raw: lineMatch[0]
      });
    }
  }

  const undergrad = rows.filter(
    (r) =>
      /Undergraduate/i.test(r.raw) ||
      /Undergraduate/i.test(r.typeCell) ||
      rows.every((x) => !/Undergraduate/i.test(x.raw))
  );

  const pickDate = (predicate, yearHint) => {
    for (const row of undergrad) {
      if (!predicate(row.description)) continue;
      const iso = extractIsoDate(row.dateCell, yearHint);
      if (!iso) continue;
      const y = Number(iso.slice(0, 4));
      if (yearHint && y !== yearHint) continue;
      return iso;
    }
    return null;
  };

  // Fall: classes begin in Sept of startYear; fall classes end in Dec of startYear
  const fallStart =
    pickDate(
      (d) => /Fall\/Winter Term classes begin/i.test(d),
      startYear
    ) ||
    pickDate((d) => /Fall\/Winter.*classes begin/i.test(d), startYear);

  const fallEndCandidates = undergrad
    .filter((r) => /Fall\/Winter classes end/i.test(r.description))
    .map((r) => extractIsoDate(r.dateCell, startYear))
    .filter(Boolean)
    .filter((iso) => Number(iso.slice(0, 4)) === startYear && iso.slice(5, 7) === "12");

  const fallEnd = fallEndCandidates[0] || null;

  // Winter: classes resume in Jan of endYear; winter classes end in Apr of endYear
  const winterStart =
    pickDate((d) => /^Classes resume\.?$/i.test(d.trim()), endYear) ||
    pickDate((d) => /Classes resume/i.test(d) && !/Years?/i.test(d), endYear);

  const winterEndCandidates = undergrad
    .filter((r) => /Fall\/Winter classes end/i.test(r.description))
    .map((r) => extractIsoDate(r.dateCell, endYear))
    .filter(Boolean)
    .filter((iso) => Number(iso.slice(0, 4)) === endYear && iso.slice(5, 7) === "04");

  const winterEnd = winterEndCandidates[0] || null;

  if (!fallStart || !fallEnd || !winterStart || !winterEnd) {
    return null;
  }

  return {
    academicYear,
    fall: { start: fallStart, end: fallEnd },
    winter: { start: winterStart, end: winterEnd },
    source: "westerncalendar"
  };
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIsoDate(dateCell, yearHint) {
  const range = dateCell.match(
    /(\d{4}-\d{2}-\d{2})(?:\s+to\s+(\d{4}-\d{2}-\d{2}))?/
  );
  if (range) return range[1];

  const textual = dateCell.match(
    /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/
  );
  if (textual) {
    const parsed = new Date(`${textual[1]} ${textual[2]}, ${textual[3]}`);
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalDate(parsed);
    }
  }

  if (yearHint) {
    const short = dateCell.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (short) {
      const parsed = new Date(`${short[1]} ${short[2]}, ${yearHint}`);
      if (!Number.isNaN(parsed.getTime())) {
        return formatLocalDate(parsed);
      }
    }
  }

  return null;
}

export async function fetchTermDatesFromNetwork(fetchImpl = fetch) {
  const academicYear = academicYearKey(new Date());
  const response = await fetchImpl(SESSIONAL_DATES_URL, {
    credentials: "omit",
    cache: "no-cache"
  });
  if (!response.ok) {
    throw new Error(`Sessional dates HTTP ${response.status}`);
  }
  const html = await response.text();
  const parsed = parseSessionalDatesHtml(html, academicYear);
  if (!parsed) {
    throw new Error("Could not parse undergraduate term dates");
  }
  return parsed;
}

export async function getCachedTermDates(storageArea) {
  const result = await storageArea.get(STORAGE_KEYS.termDates);
  return result[STORAGE_KEYS.termDates] || null;
}

export async function setCachedTermDates(storageArea, dates) {
  await storageArea.set({
    [STORAGE_KEYS.termDates]: {
      ...dates,
      cachedAt: Date.now()
    }
  });
}

/**
 * Resolve term dates: fresh cache for current academic year, else network, else defaults.
 */
export async function resolveTermDates({
  storageArea,
  fetchImpl = fetch,
  forceRefresh = false
} = {}) {
  const academicYear = academicYearKey(new Date());
  if (!forceRefresh && storageArea) {
    const cached = await getCachedTermDates(storageArea);
    if (
      cached &&
      cached.academicYear === academicYear &&
      cached.fall?.start &&
      cached.winter?.start
    ) {
      return cached;
    }
  }

  try {
    const fetched = await fetchTermDatesFromNetwork(fetchImpl);
    if (storageArea) {
      await setCachedTermDates(storageArea, fetched);
    }
    return fetched;
  } catch {
    const defaults = getDefaultTermDates(new Date());
    if (storageArea) {
      await setCachedTermDates(storageArea, defaults);
    }
    return defaults;
  }
}

export function validateDateRange(startStr, endStr) {
  if (!startStr || !endStr) return false;
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  return start <= end;
}
