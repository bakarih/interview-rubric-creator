'use client';

import { Rubric } from '@/types';
import SignalCard from './SignalCard';

interface RubricViewProps {
  rubric: Rubric;
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function RubricView({ rubric }: RubricViewProps) {
  const sortedSignals = [...rubric.signals].sort((a, b) => b.weight - a.weight);
  const totalWeight = rubric.signals.reduce((sum, s) => sum + s.weight, 0);
  const createdDate = new Date(rubric.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{rubric.role}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                {toTitleCase(rubric.level)}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                {rubric.signals.length} signal{rubric.signals.length !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                Total weight: {totalWeight}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500">Created {createdDate}</p>
        </div>
      </div>

      {/* Signal cards */}
      <div className="space-y-4">
        {sortedSignals.map((signal, index) => (
          <SignalCard key={signal.id} signal={signal} index={index} />
        ))}
      </div>
    </div>
  );
}
