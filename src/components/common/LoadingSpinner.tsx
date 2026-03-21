'use client';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16"
      role="status"
      aria-live="polite"
      aria-label={message ?? 'Loading'}
    >
      <div className="relative h-12 w-12">
        <div
          className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600"
          aria-hidden="true"
        />
      </div>
      {message && (
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{message}</p>
      )}
    </div>
  );
}
