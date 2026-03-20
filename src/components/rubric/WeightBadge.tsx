'use client';

interface WeightBadgeProps {
  weight: number;
}

export default function WeightBadge({ weight }: WeightBadgeProps) {
  const colorClass =
    weight >= 7
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : weight >= 4
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      Weight: {weight}/10
    </span>
  );
}
