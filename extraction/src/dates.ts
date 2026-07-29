/**
 * Conservative date normalization. `toIso` returns YYYY-MM-DD only when the
 * input is unambiguous; anything else returns undefined and the caller keeps
 * the raw string. Guessing a year or a day/month order is worse than
 * abstaining — downstream review handles the raw value.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function build(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12) return undefined;
  const maxDay = m === 2 && isLeapYear(y) ? 29 : (DAYS_IN_MONTH[m - 1] ?? 31);
  if (d < 1 || d > maxDay) return undefined;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthNumber(name: string): number | undefined {
  return MONTHS[name.toLowerCase()];
}

/**
 * Normalize a date string to ISO YYYY-MM-DD, or return undefined when the
 * input is incomplete or ambiguous. Accepted: `YYYY-MM-DD`,
 * `Month D, YYYY`, `D Month YYYY`, and slash dates where day/month order is
 * provable (one component > 12). Rejected on purpose: dates with no year
 * ("14 Oct"), and slash dates where both components could be a month.
 */
export function toIso(raw: string): string | undefined {
  const t = raw
    .trim()
    .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\s+/g, ' ');

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m) {
    const mo = monthNumber(m[1] ?? '');
    return mo === undefined ? undefined : build(Number(m[3]), mo, Number(m[2]));
  }

  m = /^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/.exec(t);
  if (m) {
    const mo = monthNumber(m[2] ?? '');
    return mo === undefined ? undefined : build(Number(m[3]), mo, Number(m[1]));
  }

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12 && b <= 12) return build(y, b, a);
    if (b > 12 && a <= 12) return build(y, a, b);
    return undefined; // both ≤ 12: MM/DD vs DD/MM is a guess — abstain
  }

  return undefined;
}

/** Wrap a captured raw date, attaching `iso` only when provable. */
export function extractedDate(raw: string): {raw: string; iso?: string} {
  const iso = toIso(raw);
  return iso === undefined ? {raw} : {raw, iso};
}
