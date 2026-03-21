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
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-400" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            <span className="sr-only">Signal {index + 1}: </span>
            {signal.name}
          </h3>
        </div>
        <WeightBadge weight={signal.weight} />
      </div>

      {/* Description */}
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{signal.description}</p>

      {/* Modality pill */}
      <div className="mb-4">
        <span className="inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-800">
          {toTitleCase(signal.suggestedModality)}
        </span>
      </div>

      {/* Criteria table */}
      <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <caption className="sr-only">Evaluation criteria for {signal.name}</caption>
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-left">
              <th scope="col" className="w-1/3 px-4 py-2 font-semibold text-green-700 dark:text-green-400 border-b border-gray-200 dark:border-gray-700">
                Exceeds
              </th>
              <th scope="col" className="w-1/3 px-4 py-2 font-semibold text-blue-700 dark:text-blue-400 border-b border-gray-200 dark:border-gray-700 border-l">
                Meets
              </th>
              <th scope="col" className="w-1/3 px-4 py-2 font-semibold text-orange-700 dark:text-orange-400 border-b border-gray-200 dark:border-gray-700 border-l">
                Below
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300 align-top">{signal.criteria.exceeds}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300 align-top border-l border-gray-200 dark:border-gray-700">
                {signal.criteria.meets}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300 align-top border-l border-gray-200 dark:border-gray-700">
                {signal.criteria.below}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Suggested questions */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Suggested Questions
        </h4>
        <ol className="list-decimal list-inside space-y-1">
          {signal.suggestedQuestions.map((q, i) => (
            <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
              {q}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
