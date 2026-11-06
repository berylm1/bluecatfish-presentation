import StudyFlow from '@/components/study/StudyFlow';

// Static vs adaptive, the main study (study 1): components/study/StudyFlow. ?test=1: a test run
export default function Study() {
  return <StudyFlow which={1} />;
}
