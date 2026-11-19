import StudyFlow from '@/components/study/StudyFlow';
import StudyClosed from '@/components/study/StudyClosed';
import { STUDY_OPEN } from '@/lib/settings';

// Static vs adaptive, the main study (study 1): components/study/StudyFlow. ?test=1: a test run
// (STUDY_OPEN off: closed, unless ?test=1, a test run)
export default async function Study({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!STUDY_OPEN && (await searchParams).test !== '1') return <StudyClosed />;
  return <StudyFlow which={1} />;
}
