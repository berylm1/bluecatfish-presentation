import StudyResultsView from '@/components/study/StudyResultsView';

// /studyResults/classmates: the classmates study (study 2; editors only: lib/editorAuth.ts); components/study/StudyResultsView
export default function ClassmatesResults() {
  return <StudyResultsView which={2} />;
}
