'use client';

interface WeightBadgeProps {
  weight: number;
}

export default function WeightBadge({ weight }: WeightBadgeProps) {
  const colorClass =
    weight >= 7
      ? 'bg-green-100 text-green-800'
      : weight >= 4
        ? 'bg-blue-100 text-blue-800'
        : 'bg-gray-100 text-gray-700';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      Weight: {weight}/10
    </span>
  );
}
