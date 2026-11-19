'use client';

import Icon from '@/components/Icon';
import { FAMILY_THINGS, LEARN_MORE } from '@/lib/study/content';
import { SHOW_QR } from '@/lib/settings';

/*
 * What a learner takes home at the end: the badge for catching Finn's mix-ups, and "3 things to tell your family".
 * On the study's last screen (components/study/StudyFlow.tsx) and the lesson's own end screen (app/presentation).
 */

/** Three things to tell your family (the take-home card), and where to learn more */
export function FamilyCard() {
  return (
    <section className="mt-6 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-sky-50 p-5" aria-label="Three things to tell your family">
      <div className="flex items-start gap-5 max-sm:flex-col">
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Icon name="home" className="text-cyan-700" /> 3 things to tell your family</h2>
          <ol className="mt-3 flex flex-col gap-2.5">
            {FAMILY_THINGS.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700">
                <span className="shrink-0 w-6 h-6 rounded-full bg-cyan-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          {!SHOW_QR && (
            <p className="mt-4 text-sm text-slate-600">Learn more: <a href={LEARN_MORE.url} target="_blank" rel="noreferrer" className="font-medium text-cyan-700 underline hover:text-cyan-800">{LEARN_MORE.label}</a></p>
          )}
        </div>
        {SHOW_QR && (
          <a href={LEARN_MORE.url} target="_blank" rel="noreferrer" className="shrink-0 flex flex-col items-center gap-1.5 rounded-xl bg-white p-3 shadow-sm hover:shadow-md transition-shadow max-sm:self-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LEARN_MORE.qr} alt={`QR code: ${LEARN_MORE.label}`} width={112} height={112} className="w-28 h-28 [image-rendering:pixelated]" />
            <span className="text-[11px] text-slate-500 text-center leading-tight">Scan to learn more<br /><span className="text-cyan-700 underline">{LEARN_MORE.label}</span></span>
          </a>
        )}
      </div>
    </section>
  );
}

/** The badges (public/badges): one of Finn's mix-ups caught, or all of them (two or more) */
const BADGES = {
  spotted: { src: '/badges/mix-up-spotted.webp', name: 'Mix-up Spotted!', file: 'mix-up-spotted.webp' },
  checker: { src: '/badges/fact-checker.webp', name: 'Fact Checker', file: 'fact-checker.webp' },
};

/** "I caught Finn!": a badge for catching Finn's mix-ups, to save (the adaptive lesson with the classmates only) */
export function FinnBadge({ caught, of }: { caught: number; of: number }) {
  const badge = caught === of && of >= 2 ? BADGES.checker : BADGES.spotted;
  const line = caught === of ? (of === 1 ? 'You caught Finn’s mix-up!' : of === 2 ? 'You caught both of Finn’s mix-ups!' : `You caught all ${of} of Finn’s mix-ups!`) : `You caught ${caught} of Finn’s ${of} mix-ups!`;
  return (
    <section className="mt-6 flex items-center gap-5 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 max-sm:flex-col max-sm:text-center" aria-label="Your badge">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={badge.src} alt={`Badge: ${badge.name} I caught Finn!`} width={128} height={128} className="w-32 h-32 shrink-0 drop-shadow-md animate-[pop-in_500ms_ease_both]" />
      <div className="flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Badge earned</div>
        <div className="text-lg font-bold text-slate-900">{badge.name}</div>
        <div className="text-sm text-slate-600">{line} Finn mixes things up on purpose, and you spotted it.</div>
        <a href={badge.src} download={badge.file} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 underline hover:text-amber-900">Save the badge</a>
      </div>
    </section>
  );
}
