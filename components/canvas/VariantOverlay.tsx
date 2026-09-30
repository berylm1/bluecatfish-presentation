'use client';

// A variant slide shown over the canvas when the learner is confused: one of
// the reviewed "explain it another way" slides (slide_templates), e.g. an
// authored slide image from the PDF deck with its explanation.
export type Variant = {
  title: string; body: string; narration: string; audio_url?: string | null; image_url?: string | null; variant?: string;
  /** A fresh spoken explanation of the slide (asked for with explain=1); played instead of the stored narration. */
  live_narration?: string;
};

export default function VariantOverlay({ variant, onDone }: { variant: Variant; onDone: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm rounded-2xl p-6" role="dialog" aria-label="Another way to see it">
      <div className="w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl bg-slate-900 border border-cyan-500/30 p-6 text-left shadow-2xl">
        <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2">Professor Marine · a different way to see it</div>
        <h2 className="text-2xl font-bold text-white mb-4">{variant.title}</h2>
        {variant.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={variant.image_url} alt={variant.title} className="w-full max-h-[45vh] object-contain rounded-xl border border-cyan-500/30 mb-4 bg-black/20" />
        )}
        <p className="text-lg leading-relaxed text-blue-100 mb-5">{variant.body}</p>
        <button onClick={onDone} className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold">
          Got it, back to the lesson →
        </button>
      </div>
    </div>
  );
}
