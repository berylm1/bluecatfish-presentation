import Link from 'next/link';

/**
 * The studies, as tabs at the top of each one's page (and the editor's More menu lists the same two):
 *   classmates  with or without the AI classmates (v1, running: /studyResults)
 *   adaptive    static vs adaptive (v2, being planned: /studyResults/adaptive)
 */
export const STUDIES = [
  { id: 'classmates', name: 'Classmates study', href: '/studyResults', status: 'With or without the AI classmates' },
  { id: 'adaptive', name: 'Static vs adaptive', href: '/studyResults/adaptive', status: 'Being planned' },
] as const;

export default function StudyTabs({ current }: { current: (typeof STUDIES)[number]['id'] }) {
  return (
    <nav aria-label="Studies" className="flex flex-wrap gap-2 print:hidden">
      {STUDIES.map((s) => (
        <Link key={s.id} href={s.href} aria-current={s.id === current ? 'page' : undefined}
          className={`px-4 py-2 rounded-xl border text-sm ${s.id === current ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white hover:border-slate-400 text-slate-700'}`}>
          <span className="font-semibold">{s.name}</span>
          <span className={`block text-xs ${s.id === current ? 'text-slate-300' : 'text-slate-500'}`}>{s.status}</span>
        </Link>
      ))}
    </nav>
  );
}
