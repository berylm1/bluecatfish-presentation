/*
 * Checking a typed answer ("Type the answer" hands-on boxes) against the answer key, forgivingly:
 *   - the key can list alternatives: "3/4 | 0.75 | three quarters"
 *   - numbers by value: 3/4 = 0.75 = .75 = 6/8; "1 1/2" = 1.5; "1,000" = 1000; 75% = 0.75 (both sides the same way);
 *     a unit after the number is fine either way ("5 feet" for "5", "5" for "5 feet"), as is "x = 5" for "5"
 *   - words: capitals, punctuation, extra spaces and "a/an/the" don't matter, and one small typo in a longer word is fine
 */

/** The number a typed answer means (null: not a number) */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/^[a-z]\s*=\s*/, '').replace(/[−–]/g, '-').replace(/(\d),(?=\d{3}\b)/g, '$1');
  // a unit or word after the number ("5 feet", "3/4 of a pizza"): the number
  const m = s.match(/^(-?\s*\d+\s+\d+\s*\/\s*\d+|-?\s*\d*\.?\d+\s*\/\s*\d*\.?\d+|-?\s*\d*\.?\d+\s*%?)(?:\s+[a-z].*)?$/);
  if (!m) return null;
  s = m[1].replace(/\s+/g, ' ').trim();
  const pct = s.endsWith('%');
  if (pct) s = s.slice(0, -1).trim();
  let v: number;
  const mixed = s.match(/^(-?)(\d+) (\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const d = Number(mixed[4]);
    if (!d) return null;
    v = (Number(mixed[2]) + Number(mixed[3]) / d) * (mixed[1] ? -1 : 1);
  } else if (s.includes('/')) {
    const [a, b] = s.split('/').map((x) => Number(x.replace(/\s/g, '')));
    if (!Number.isFinite(a) || !b) return null;
    v = a / b;
  } else {
    v = Number(s.replace(/\s/g, ''));
  }
  if (!Number.isFinite(v)) return null;
  return pct ? v / 100 : v;
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !['a', 'an', 'the'].includes(w)).join(' ');

/** At most one letter added, left out or changed */
function nearlySame(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** The key's accepted answers ("3/4 | 0.75": both) */
export const acceptedAnswers = (key: string): string[] => key.split('|').map((x) => x.trim()).filter(Boolean);

/** Is the typed answer right? */
export function answerMatches(typed: string, key: string): boolean {
  const t = typed.trim();
  if (!t) return false;
  for (const ok of acceptedAnswers(key)) {
    const a = parseNumber(t), b = parseNumber(ok);
    if (a !== null && b !== null) {
      if (Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))) return true;
      continue;   // (both numbers, different: wrong, whatever the words)
    }
    const wt = words(t), wk = words(ok);
    if (!wk) continue;
    if (wt === wk) return true;
    if (wk.length >= 5 && nearlySame(wt, wk)) return true;
  }
  return false;
}
