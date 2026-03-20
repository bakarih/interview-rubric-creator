'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { Rubric } from '@/types';
import RubricView from '@/components/rubric/RubricView';
import ExportButtons from '@/components/export/ExportButtons';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function RubricPage({ params }: PageProps) {
  const { id } = use(params);
  const [rubric, setRubric] = useState<Rubric | null | undefined>(undefined);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('rubrics') ?? '{}') as Record<string, Rubric>;
        setRubric(stored[id] ?? null);
      } catch {
        setRubric(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);

  // Still loading from localStorage
  if (rubric === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </main>
    );
  }

  if (rubric === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Rubric not found</h1>
          <p className="text-gray-600 dark:text-gray-400">
            This rubric may have been cleared from your browser storage.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          <ExportButtons rubric={rubric} />
        </div>

        <RubricView rubric={rubric} />
      </div>
    </main>
  );
}
