// Expiration dates typed by people: a single day, a single month, or a month range. Pure (no database), safe in the browser.
//
//   "8/2027-6/2028"        August 2027 through June 2028   (a range)
//   "5/27 to 11/28"        May 2027 through November 2028  (a range; two-digit years are only read inside a range)
//   "2027-08 - 2028-06"    the same, written the other way
//   "8/2027" or "Aug 2027" one month
//   "2027-08-15", "8/15/2027"  one day
//
// How it is stored: a day is itself. A month means its LAST day (that is how the rest of the system already reads "2027-05"),
// so a range is `from` = last day of the first month and `to` = last day of the last month. `to` is null for a single date.
// Selling and "near expiry" always use `from` (the earliest), so nothing is promised past its first date.

export type ExpiryParts = { from: string | null; to: string | null; kind: "none" | "day" | "month" | "range" };
export type ExpiryRead = ({ ok: true } & ExpiryParts) | { ok: false; error: string };

const MONTH_WORDS: Record<string, number> = {};
["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].forEach((w, i) => {
  MONTH_WORDS[w] = i + 1;
  MONTH_WORDS[w.slice(0, 3)] = i + 1;
});
MONTH_WORDS.sept = 9;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthNo = (w: string) => MONTH_WORDS[w.toLowerCase().replace(/\.$/, "")] ?? 0;
const validDay = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);

type Tok = { kind: "day" | "month"; date: string; twoDigitYear?: boolean };

/** One piece: a day or a month. `allowShortYear` lets "5/27" mean May 2027 (only used on the sides of a range). */
function readToken(raw: string, allowShortYear: boolean): Tok | null {
  const s = raw.trim().replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return validDay(+m[1], +m[2], +m[3]) ? { kind: "day", date: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` } : null;
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) return validDay(+m[1], +m[2], 1) ? { kind: "month", date: `${m[1]}-${pad(+m[2])}-${pad(lastDay(+m[1], +m[2]))}` } : null;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return validDay(+m[3], +m[1], +m[2]) ? { kind: "day", date: `${m[3]}-${pad(+m[1])}-${pad(+m[2])}` } : null;
  if ((m = /^(\d{1,2})[/-](\d{4})$/.exec(s))) return validDay(+m[2], +m[1], 1) ? { kind: "month", date: `${m[2]}-${pad(+m[1])}-${pad(lastDay(+m[2], +m[1]))}` } : null;
  if (allowShortYear && (m = /^(\d{1,2})\/(\d{2})$/.exec(s))) {
    const y = 2000 + +m[2];
    return validDay(y, +m[1], 1) ? { kind: "month", date: `${y}-${pad(+m[1])}-${pad(lastDay(y, +m[1]))}`, twoDigitYear: true } : null;
  }
  if ((m = /^([A-Za-z.]+)\s+(\d{4})$/.exec(s))) {
    const mo = monthNo(m[1]);
    return mo && validDay(+m[2], mo, 1) ? { kind: "month", date: `${m[2]}-${pad(mo)}-${pad(lastDay(+m[2], mo))}` } : null;
  }
  return null;
}

/** Reads what a person typed (or a spreadsheet cell held). Empty means "no expiration date". */
export function parseExpiryInput(raw: string | null | undefined): ExpiryRead {
  const s = String(raw ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  if (!s) return { ok: true, from: null, to: null, kind: "none" };

  // Excel may hand a real date over as a number of days; those are read by the caller before this point.
  const whole = readToken(s, false);
  if (whole) return { ok: true, from: whole.date, to: null, kind: whole.kind };

  // A range: split on a word or dash, trying every possible split so "2027-08-2028-06" and "8/2027-6/2028" both work.
  const candidates: [string, string][] = [];
  const word = /\s+(?:to|through|thru|until|and)\s+|\s*[–—]\s*/gi;
  for (const m of s.matchAll(word)) candidates.push([s.slice(0, m.index), s.slice((m.index ?? 0) + m[0].length)]);
  for (let i = 0; i < s.length; i++) if (s[i] === "-") candidates.push([s.slice(0, i), s.slice(i + 1)]);
  for (const [a, b] of candidates) {
    const x = readToken(a, true);
    const y = readToken(b, true);
    if (!x || !y) continue;
    if (x.date > y.date) return { ok: false, error: "The first date is after the second. Put the earlier month first, like 8/2027-6/2028." };
    if (x.date === y.date) return { ok: true, from: x.date, to: null, kind: x.kind };
    return { ok: true, from: x.date, to: y.date, kind: "range" };
  }
  return { ok: false, error: /\d\/\d{1,2}$/.test(s) && !s.includes("-") ? "Type the month and the full year, like 8/2027 (5/27 could mean a day)." : "I couldn't read that date. Use a month range like 8/2027-6/2028, one month like 8/2027, or one day like 8/15/2027." };
}

/** "8/2027 - 6/2028" for a range, or null when it is one date (or none). */
export function rangeText(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to || to <= from) return null;
  const a = /^(\d{4})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})/.exec(to);
  if (!a || !b) return null;
  return `${+a[2]}/${a[1]} – ${+b[2]}/${b[1]}`;
}

const isLastDayOfMonth = (d: string) => +d.slice(8, 10) === lastDay(+d.slice(0, 4), +d.slice(5, 7));
const monthText = (d: string) => `${+d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * What goes back into the input box for a stored value. A month-end date is shown as a month ("8/2027") and a range as
 * "8/2027-6/2028", so typing it back gives the same dates. A date that is not a month-end keeps its day, so nothing is lost.
 */
export function toInputText(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return "";
  const part = (d: string) => (isLastDayOfMonth(d) ? monthText(d) : d);
  if (to && to > from) return `${part(from)}${isLastDayOfMonth(from) && isLastDayOfMonth(to) ? "-" : " to "}${part(to)}`;
  return part(from);
}

/** One-line plain words for a read result ("Aug 2027 through Jun 2028"), shown under the box so a person can check it. */
export function describeExpiry(r: ExpiryRead): string {
  if (!r.ok) return r.error;
  const mon = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  if (r.kind === "none" || !r.from) return "No expiration date";
  if (r.kind === "range" && r.to) return `${mon(r.from)} through ${mon(r.to)}`;
  if (r.kind === "month") return mon(r.from);
  const [y, m, d] = r.from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * The short words an expiration prints as on a document: a range "8/2027 – 6/2028", one month "8/2027", one day "8/15/2028".
 * (The same dates typed back through `parseExpiryInput` give the same result, so a saved line can be edited again.)
 */
export function expiryDisplay(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return "";
  const rt = rangeText(from, to);
  if (rt) return rt;
  if (isLastDayOfMonth(from)) return monthText(from);
  return `${+from.slice(5, 7)}/${+from.slice(8, 10)}/${from.slice(0, 4)}`;
}
