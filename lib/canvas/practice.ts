import { chat } from './ai';
import { parseNumber, acceptedAnswers } from './answerMatch';

/*
 * Help with a "Type the answer" question, for the lesson page:
 *   - a HINT after a wrong try: the next step or the likely slip, never the answer itself
 *   - the same question with FRESH NUMBERS, to practise again. The model's sums aren't trusted: it also gives the
 *     sum as plain arithmetic ("3/4 + 1/8"), which is worked out here and has to equal the answer it gave.
 */

/** Plain arithmetic ("(3/4 + 1/8) * 2"), worked out as exact fractions. null: not arithmetic, or a division by zero */
export function evaluate(expr: string): number | null {
  // ("1/5 + 3/5 = 4/5": the sum is what's before the equals sign; "1 1/2" is one and a half, not eleven halves)
  const src = expr.split('=')[0].replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, '($1+$2/$3)').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/\s+/g, '');
  if (!src || /[^0-9+\-*/().]/.test(src)) return null;
  let i = 0;
  type F = [number, number];   // numerator, denominator
  const g = (a: number, b: number): number => (b ? g(b, a % b) : Math.abs(a));
  const norm = ([n, d]: F): F => { const k = g(n, d) || 1; return d < 0 ? [-n / k, -d / k] : [n / k, d / k]; };
  const num = (): F | null => {
    const m = src.slice(i).match(/^\d*\.?\d+/);
    if (!m) return null;
    i += m[0].length;
    const dec = (m[0].split('.')[1] ?? '').length;
    return norm([Math.round(Number(m[0]) * 10 ** dec), 10 ** dec]);
  };
  const atom = (): F | null => {
    if (src[i] === '-') { i++; const v = atom(); return v && [-v[0], v[1]]; }
    if (src[i] === '(') { i++; const v = sum(); if (!v || src[i] !== ')') return null; i++; return v; }
    return num();
  };
  const product = (): F | null => {
    let a = atom();
    while (a && (src[i] === '*' || src[i] === '/')) {
      const op = src[i++];
      const b = atom();
      if (!b || (op === '/' && !b[0])) return null;
      a = norm(op === '*' ? [a[0] * b[0], a[1] * b[1]] : [a[0] * b[1], a[1] * b[0]]);
    }
    return a;
  };
  function sum(): F | null {
    let a = product();
    while (a && (src[i] === '+' || src[i] === '-')) {
      const op = src[i++];
      const b = product();
      if (!b) return null;
      a = norm([a[0] * b[1] + (op === '+' ? 1 : -1) * b[0] * a[1], a[1] * b[1]]);
    }
    return a;
  }
  const v = sum();
  return v && i === src.length && v[1] ? v[0] / v[1] : null;
}

/** One short hint for a wrong answer (never the answer). Empty when the model gave it away. */
export async function hintFor(question: string, key: string, tried: string): Promise<string> {
  const out = (await chat(
    'A learner aged {{ages}} got a practice question wrong. Give ONE short hint, under 25 words, in {{language}}: the next step to take, ' +
      'or the slip they most likely made with their answer. Never say the answer, and never a number or word that IS the answer. ' +
      'Kind and plain, as a good teacher would say it. Plain text only.',
    `QUESTION: ${question}\nTHE RIGHT ANSWER (do not say it): ${key}\nTHEY ANSWERED: ${tried}`,
    false, 200,
  )).trim().replace(/^hint:\s*/i, '');
  const gives = acceptedAnswers(key).some((a) => a.length > 1 && new RegExp(`(^|[^\\w/.])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w/])`, 'i').test(out));
  return gives ? '' : out.slice(0, 240);
}

/** The same kind of question with other numbers, checked: null when it isn't a sum, or the model's sum didn't add up */
export async function freshQuestion(question: string, key: string): Promise<{ question: string; answer: string } | null> {
  const first = acceptedAnswers(key)[0] ?? '';
  if (parseNumber(first) === null) return null;   // (only questions with a number for an answer)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const o = JSON.parse(await chat(
        'You write ONE practice question for a learner aged {{ages}}, in {{language}}: the SAME skill, the same kind of wording and about the same ' +
          'difficulty as the question given, with DIFFERENT numbers (and a different everyday thing if it has one). The answer must come out clean, ' +
          'in the same form as the original answer (a fraction stays a fraction in lowest terms, a whole number stays whole, the same unit if it had one). ' +
          'Reply as JSON: {"question":"…","answer":"…","check":"the sum as plain arithmetic that equals the answer, only digits and + - * / ( ) ."}',
        `QUESTION: ${question}\nITS ANSWER: ${first}`,
        true, 400,
      ));
      const q = String(o?.question ?? '').trim(), a = String(o?.answer ?? '').trim();
      const want = parseNumber(a), got = evaluate(String(o?.check ?? ''));
      if (!q || q === question || want === null || got === null) continue;
      if (Math.abs(want - got) > 1e-6 * Math.max(1, Math.abs(got))) continue;
      return { question: q.slice(0, 300), answer: a.slice(0, 60) };
    } catch { /* try once more */ }
  }
  return null;
}
