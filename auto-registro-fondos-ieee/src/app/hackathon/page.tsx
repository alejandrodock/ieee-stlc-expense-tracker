import type { Metadata } from 'next';
import EvaluationPortal from '@/components/hackathon/EvaluationPortal';
export const metadata: Metadata = {
  title: 'Telecom Innovation Hackathon · Evaluación',
  description: 'Portal de evaluación del jurado del Telecom Innovation Hackathon.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function HackathonPage() { return <EvaluationPortal />; }
