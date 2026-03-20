'use client';

import { Signal } from '@/types';
import WeightBadge from './WeightBadge';

interface SignalCardProps {
  signal: Signal;
  index: number;
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function SignalCard({ signal, index }: SignalCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
            {index + 1}
          </span>
          <h3 className="text-base font-semibold text-gray-900">{signal.name}</h3>
        </div>
        <WeightBadge weight={signal.weight} />
      </div>

      {/* Description */}
      <p className="mb-3 text-sm text-gray-600">{signal.description}</p>

      {/* Modality pill */}
      <div className="mb-4">
        <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
          {toTitleCase(signal.suggestedModality)}
        </span>
      </div>

      {/* Criteria table */}
      <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="w-1/3 px-4 py-2 font-semibold text-green-700 border-b border-gray-200">
                Exceeds
              </th>
              <th className="w-1/3 px-4 py-2 font-semibold text-blue-700 border-b border-gray-200 border-l">
                Meets
              </th>
              <th className="w-1/3 px-4 py-2 font-semibold text-orange-700 border-b border-gray-200 border-l">
                Below
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-3 text-gray-700 align-top">{signal.criteria.exceeds}</td>
              <td className="px-4 py-3 text-gray-700 align-top border-l border-gray-200">
                {signal.criteria.meets}
              </td>
              <td className="px-4 py-3 text-gray-700 align-top border-l border-gray-200">
                {signal.criteria.below}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Suggested questions */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Suggested Questions
        </h4>
        <ol className="list-decimal list-inside space-y-1">
          {signal.suggestedQuestions.map((q, i) => (
            <li key={i} className="text-sm text-gray-700">
              {q}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
