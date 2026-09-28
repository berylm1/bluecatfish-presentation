'use client';

// The slide editor arrives in step 3 (docs/customization-plan.md).
// For now this page shows that the password gate works.
export default function SlideEditor() {
  return (
    <main className="min-h-[calc(100vh-40px)] flex flex-col items-center justify-center gap-3 bg-slate-100 p-8 text-center">
      <h1 className="text-3xl font-bold text-slate-900">Slide editor</h1>
      <p className="text-slate-600 max-w-md">You&apos;re in. The editor itself is being built next (step 3 of the plan).</p>
    </main>
  );
}
