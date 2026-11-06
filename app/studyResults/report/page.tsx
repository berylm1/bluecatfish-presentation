import { redirect } from 'next/navigation';

// The pilot report is at the bottom of each study's results page (components/study/PilotReport); was its own page
export default function PilotReportPage() {
  redirect('/studyResults#pilot-report');
}
