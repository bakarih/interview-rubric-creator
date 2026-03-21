'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import FileUpload from '@/components/upload/FileUpload';
import TextInput from '@/components/upload/TextInput';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorMessage from '@/components/common/ErrorMessage';
import RubricView from '@/components/rubric/RubricView';
import ExportButtons from '@/components/export/ExportButtons';
import { Rubric, JobDescription } from '@/types';

type FlowState = 'input' | 'loading' | 'result' | 'error';
type TabId = 'upload' | 'paste';

const STATUS_MESSAGES = [
  'Parsing document...',
  'Extracting signals...',
  'Generating rubric...',
];

export default function Home() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>('input');
  const [activeTab, setActiveTab] = useState<TabId>('upload');
  const [pastedText, setPastedText] = useState('');
  const [statusIndex, setStatusIndex] = useState(0);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const mainRef = useRef<HTMLElement>(null);

  // Compute before any conditional returns so TypeScript doesn't narrow flow
  const isLoading = (flow as string) === 'loading';

  // Cycle through status messages while loading
  useEffect(() => {
    if (flow !== 'loading') return;
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [flow]);

  // Focus management on flow state changes
  useEffect(() => {
    if (flow !== 'input') {
      mainRef.current?.focus();
    }
  }, [flow]);

  async function runPipeline(text: string) {
    setFlow('loading');
    setStatusIndex(0);

    try {
      // Step 1: Extract
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!extractRes.ok) {
        const data = await extractRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Extraction failed');
      }

      const jd: JobDescription & { signals?: unknown[] } = await extractRes.json();

      // Step 2: Generate
      const generateRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: jd.role,
          level: jd.level,
          signals: jd.signals ?? [],
        }),
      });

      if (!generateRes.ok) {
        const data = await generateRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Generation failed');
      }

      const generatedRubric: Rubric = await generateRes.json();

      // Save to localStorage
      const stored = JSON.parse(localStorage.getItem('rubrics') ?? '{}') as Record<string, Rubric>;
      stored[generatedRubric.id] = generatedRubric;
      localStorage.setItem('rubrics', JSON.stringify(stored));

      setRubric(generatedRubric);
      setFlow('result');
      router.push(`/rubric/${generatedRubric.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setFlow('error');
    }
  }

  async function handleFile(file: File) {
    setFlow('loading');
    setStatusIndex(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const parseRes = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      if (!parseRes.ok) {
        const data = await parseRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'File parsing failed');
      }

      const { text } = await parseRes.json() as { text: string };
      await runPipeline(text);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setFlow('error');
    }
  }

  async function handleTextSubmit() {
    if (pastedText.trim().length < 100) {
      setErrorMessage('Job description must be at least 100 characters.');
      setFlow('error');
      return;
    }
    await runPipeline(pastedText);
  }

  function handleReset() {
    setFlow('input');
    setRubric(null);
    setErrorMessage('');
    setPastedText('');
    setActiveTab('upload');
    router.push('/');
  }

  if (flow === 'loading') {
    return (
      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 focus:outline-none">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-10 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <LoadingSpinner message={STATUS_MESSAGES[statusIndex]} />
        </div>
      </main>
    );
  }

  if (flow === 'result' && rubric) {
    return (
      <main id="main-content" ref={mainRef} tabIndex={-1} className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10 focus:outline-none">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Interview Rubric</h1>
            <div className="flex flex-wrap items-center gap-3">
              <ExportButtons rubric={rubric} />
              <button
                onClick={handleReset}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Start Over
              </button>
            </div>
          </div>
          <RubricView rubric={rubric} />
        </div>
      </main>
    );
  }

  if (flow === 'error') {
    return (
      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 focus:outline-none">
        <div className="w-full max-w-md space-y-4">
          <ErrorMessage message={errorMessage} onRetry={handleReset} />
        </div>
      </main>
    );
  }

  // Input state
  const charCount = pastedText.trim().length;
  const canSubmit = charCount >= 100;

  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Interview Rubric Creator
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Transform job descriptions into structured interview rubrics with AI
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
          {/* Tabs */}
          <div className="mb-6 flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800" role="tablist" aria-label="Input method">
            {(['upload', 'paste'] as TabId[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                id={`tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`tabpanel-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={[
                  'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                  activeTab === tab
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                ].join(' ')}
              >
                {tab === 'upload' ? 'Upload File' : 'Paste Text'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'upload' ? (
            <div role="tabpanel" id="tabpanel-upload" aria-labelledby="tab-upload" className="space-y-4">
              <FileUpload onFile={handleFile} disabled={isLoading} />
            </div>
          ) : (
            <div role="tabpanel" id="tabpanel-paste" aria-labelledby="tab-paste" className="space-y-4">
              <TextInput
                value={pastedText}
                onChange={setPastedText}
                disabled={isLoading}
              />
              <div className="space-y-1">
                <button
                  onClick={handleTextSubmit}
                  disabled={!canSubmit || isLoading}
                  aria-describedby={!canSubmit ? 'submit-hint' : undefined}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Generate Rubric
                </button>
                {!canSubmit && (
                  <p id="submit-hint" className="text-xs text-gray-500 dark:text-gray-400">
                    Minimum 100 characters required ({charCount}/100)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
