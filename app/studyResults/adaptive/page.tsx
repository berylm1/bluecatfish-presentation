import { redirect } from 'next/navigation';

// Static vs adaptive's results moved to /studyResults (it's study 1, the main study)
export default function AdaptiveResults() {
  redirect('/studyResults');
}
