import type { ReactNode } from 'react';

/*
 * Math as it's written on a board, for lessons that use it: a fraction typed "3/4" is shown stacked, "x^2" raised,
 * "sqrt(9)" under a root sign, "3 * 4" with a times sign. Words stay words: this only changes how they're SHOWN (what's
 * stored, searched and said is the plain text).
 *
 * On for a math lesson (its profile: lib/canvas/profile.ts usesMath; the Lesson panel can turn it on or off), set by the
 * lesson page and the editor (setMathText). Off: text is shown exactly as typed, as the blue catfish lesson always was
 * ("24/7", a date like "9/11" and "and/or" stay as they are).
 */

let on = false;
export function setMathText(v: boolean): void { on = v; }
export const mathTextOn = (): boolean => on;

/** Markup an AI may have put in (LaTeX) → the plain way to type it: "\(\frac{1}{2}\)" → "1/2". Safe for any text. */
export function plainMath(text: string): string {
  if (!/[\\$]/.test(text)) return text;
  return text
    .replace(/\\[dt]?frac\s*\{([^{}]{1,12})\}\s*\{([^{}]{1,12})\}/g, '$1/$2')
    .replace(/\\(?:times|cdot)\b\s?/g, '× ')
    .replace(/\\div\b\s?/g, '÷ ')
    .replace(/\\(?:leq?)\b\s?/g, '≤ ')
    .replace(/\\(?:geq?)\b\s?/g, '≥ ')
    .replace(/\\neq?\b\s?/g, '≠ ')
    .replace(/\\sqrt\s*\{([^{}]{1,20})\}/g, 'sqrt($1)')
    .replace(/\\[([\])]/g, '')                 // \( \) \[ \]
    // $x + 1$ → x + 1 (not prices: "$5 and $6" has words in between)
    .replace(/\$\$?([^$\n]{1,60})\$\$?/g, (all, inner: string) => (/[A-Za-z]{3,}/.test(inner.replace(/sqrt|frac|times/g, '')) || !/[=+\-/^\\]|[a-z]/.test(inner) ? all : inner))
    .replace(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[,;! ]/g, ' ');
}

const VAR = '[a-dmnxyz]';
// mixed number | fraction | power | root
const PARTS = new RegExp(
  `(?<![\\w/.])(\\d+) (\\d{1,3})\\/(\\d{1,3})(?![\\w/])` +
  `|(?<![\\w/.])(\\d{1,4}|${VAR})\\/(\\d{1,4}|${VAR})(?![\\w/])` +
  `|([A-Za-z0-9)])\\^(-?\\d{1,3}|[a-z])` +
  `|sqrt\\(([^()]{1,20})\\)`,
  'g',
);

function Fraction({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span role="math" aria-label={`${top} over ${bottom}`} data-fraction={`${top}/${bottom}`}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', lineHeight: 1, fontSize: '0.78em', margin: '0 0.14em' }}>
      <span style={{ padding: '0 0.18em 0.06em' }}>{top}</span>
      <span style={{ borderTop: '0.09em solid currentColor', padding: '0.08em 0.18em 0', minWidth: '1em', textAlign: 'center' }}>{bottom}</span>
    </span>
  );
}

/** The text as it's shown: with math typeset when the lesson uses math (force: whatever the lesson) */
export function typeset(text: string | undefined | null, force = false): ReactNode {
  if (!text) return text ?? '';
  if (!on && !force) return text;
  const t = plainMath(text)
    .replace(/(\d)\s*\*\s*(?=\d)/g, '$1 × ')
    .replace(/(\d) x (?=\d)/g, '$1 × ')
    .replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠');
  if (!/[/^]|sqrt\(/.test(t)) return t;
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of t.matchAll(PARTS)) {
    const at = m.index ?? 0;
    if (at > last) out.push(t.slice(last, at));
    if (m[1] !== undefined) out.push(<span key={k++} style={{ whiteSpace: 'nowrap' }}>{m[1]}<Fraction top={m[2]} bottom={m[3]} /></span>);
    else if (m[4] !== undefined) {
      // (a number over 0, or a year range like 2023/24, isn't a fraction someone meant)
      if (m[5] === '0' || (m[4].length === 4 && m[5].length <= 2)) out.push(m[0]);
      else out.push(<Fraction key={k++} top={m[4]} bottom={m[5]} />);
    } else if (m[6] !== undefined) out.push(<span key={k++}>{m[6]}<sup style={{ fontSize: '0.62em', lineHeight: 0 }}>{m[7].replace('-', '−')}</sup></span>);
    else if (m[8] !== undefined) out.push(<span key={k++} style={{ whiteSpace: 'nowrap' }}>√<span style={{ borderTop: '0.08em solid currentColor', padding: '0 0.1em' }}>{m[8]}</span></span>);
    last = at + m[0].length;
  }
  if (!out.length) return t;
  if (last < t.length) out.push(t.slice(last));
  // (one box: where the text sits in a row or column of things, a title, a chip, it stays one piece of running text)
  return <span data-math-text>{out}</span>;
}

/** A fraction typed "3/4" or "1 1/2" → its parts (null: not one) */
export function parseFraction(s: string): { whole: number; top: number; bottom: number } | null {
  const m = s.trim().match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (!m || !Number(m[3])) return null;
  return { whole: Number(m[1] ?? 0), top: Number(m[2]), bottom: Number(m[3]) };
}
