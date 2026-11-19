import Link from 'next/link';

/** The study pages once data collection is over (STUDY_OPEN off): a short note and the way to the lesson */
export default function StudyClosed() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 text-white p-6 text-center">
      <h1 className="text-3xl font-bold">The study is closed</h1>
      <p className="text-slate-300 max-w-md">Thank you to everyone who took part. You can still try the lesson, in either version.</p>
      <Link href="/" className="px-6 py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 font-semibold">Go to the lesson</Link>
    </main>
  );
}
