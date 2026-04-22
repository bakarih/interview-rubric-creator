'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import FileUpload from '@/components/upload/FileUpload';
import TextInput from '@/components/upload/TextInput';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorMessage from '@/components/common/ErrorMessage';
import RubricView from '@/components/rubric/RubricView';
import ExportButtons from '@/components/export/ExportButtons';
import { Rubric, JobDescription, Signal } from '@/types';
import { runAsyncPipeline, AsyncJobStatus } from '@/lib/utils/asyncPipeline';

type FlowState = 'input' | 'loading' | 'streaming' | 'result' | 'error';
type TabId = 'upload' | 'paste';

// Feature flag: when "true", the app routes rubric generation through the
// Cloudflare Queues + R2 async pipeline. Otherwise, it uses the inline
// Next.js streaming pipeline (/api/extract + SSE-streamed /api/generate).
//
// This is a client-side flag (NEXT_PUBLIC_*) so the UI can decide which path
// to take. The server-side RUBRIC_PRODUCER_URL still gates whether the /api/jobs
// proxy actually works.
const USE_ASYNC_PIPELINE = process.env.NEXT_PUBLIC_USE_ASYNC_PIPELINE === 'true';

// Inline-flow timeouts. Haiku-backed extraction is fast; 30 s is generous.
const EXTRACT_TIMEOUT_MS = 30_000;
// Sonnet 4 streaming a full rubric (8192 max_tokens, 8-10 signals) can take
// 40-70 s. 90 s gives it room without letting a true hang go forever.
const GENERATE_TIMEOUT_MS = 90_000;

// Async-pipeline status labels, keyed off the polled job status.
const ASYNC_STATUS_LABELS: Record<AsyncJobStatus, string> = {
  queued: 'Queued — waiting for a worker...',
  running: 'Running pipeline — extracting signals and generating rubric...',
  done: 'Done',
  failed: 'Failed',
};

export default function Home() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>('input');
  const [activeTab, setActiveTab] = useState<TabId>('upload');
  const [pastedText, setPastedText] = useState('');
  const [asyncStatusLabel, setAsyncStatusLabel] = useState<string>('Submitting...');
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const signalsRef = useRef<Signal[]>([]);

  const isLoading = flow === 'loading' || flow === 'streaming';

  // Focus management on flow state changes
  useEffect(() => {
    if (flow !== 'input') {
      mainRef.current?.focus();
    }
  }, [flow]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function makeAbortController(): AbortController {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }

  /**
   * Async pipeline (Cloudflare Queues + R2). Submits the JD to the producer
   * Worker via /api/jobs, then polls /api/jobs/:jobId until terminal state.
   * No intermediate streaming — the UI shows queued/running labels from polling.
   */
  async function runAsyncFlow(text: string) {
    const controller = makeAbortController();

    setFlow('loading');
    setAsyncStatusLabel('Submitting...');

    try {
      const generatedRubric = await runAsyncPipeline(text, {
        signal: controller.signal,
        onStatus: (status, attempts) => {
          const base = ASYNC_STATUS_LABELS[status] ?? status;
          setAsyncStatusLabel(attempts > 1 ? `${base} (attempt ${attempts})` : base);
        },
      });

      // Save to localStorage so the /rubric/[id] route can load it
      const stored = JSON.parse(localStorage.getItem('rubrics') ?? '{}') as Record<string, Rubric>;
      stored[generatedRubric.id] = generatedRubric;
      localStorage.setItem('rubrics', JSON.stringify(stored));

      setRubric(generatedRubric);
      setFlow('result');
      router.push(`/rubric/${generatedRubric.id}`);
    } catch (err) {
      // Ignore aborts — they're intentional (e.g., user hit Start Over mid-flight)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setFlow('error');
    }
  }

  /**
   * Inline pipeline (SSE streaming). Calls /api/extract, then consumes the
   * SSE stream from /api/generate, progressively rendering signals as they
   * arrive. Default path when USE_ASYNC_PIPELINE is false.
   */
  async function runInlineFlow(text: string) {
    setFlow('loading');
    signalsRef.current = [];

    try {
      // Step 1: Extract — 30 s timeout
      const extractController = makeAbortController();
      const extractTimeout = setTimeout(() => extractController.abort(), EXTRACT_TIMEOUT_MS);

      let extractRes: Response;
      try {
        extractRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: extractController.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('Signal extraction timed out. Please try again.');
        }
        throw err;
      } finally {
        clearTimeout(extractTimeout);
      }

      if (!extractRes.ok) {
        const data = await extractRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Extraction failed');
      }

      const jd: JobDescription & { signals?: unknown[] } = await extractRes.json();

      // Seed a partial rubric so the streaming view has something to render immediately
      setRubric({
        id: 'pending',
        role: jd.role,
        level: jd.level,
        signals: [],
        createdAt: new Date().toISOString(),
        version: '1.0.0',
      });
      setFlow('streaming');

      // Step 2: Generate — 90 s timeout covers both the initial fetch and stream reading
      const generateController = makeAbortController();
      const generateTimeout = setTimeout(() => generateController.abort(), GENERATE_TIMEOUT_MS);

      let generateRes: Response;
      let rubricId: string | null = null;
      let rubricCreatedAt: string | null = null;

      try {
        try {
          generateRes = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: jd.role,
              level: jd.level,
              signals: jd.signals ?? [],
            }),
            signal: generateController.signal,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error('Rubric generation timed out. Please try again.');
          }
          throw err;
        }

        if (!generateRes.ok) {
          const data = await generateRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? 'Generation failed');
        }

        // Read SSE stream and progressively render signals
        const reader = generateRes.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const eventData = JSON.parse(line.slice(6)) as {
                type: string;
                signal?: Signal;
                id?: string;
                createdAt?: string;
                version?: string;
                message?: string;
              };

              if (eventData.type === 'signal' && eventData.signal) {
                signalsRef.current = [...signalsRef.current, eventData.signal];
                const snapshot = signalsRef.current;
                setRubric((prev) => (prev ? { ...prev, signals: snapshot } : prev));
              } else if (eventData.type === 'done') {
                rubricId = eventData.id ?? null;
                rubricCreatedAt = eventData.createdAt ?? null;
              } else if (eventData.type === 'error') {
                throw new Error(eventData.message ?? 'Generation failed');
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error('Rubric generation timed out. Please try again.');
          }
          throw err;
        }
      } finally {
        clearTimeout(generateTimeout);
      }

      if (!rubricId) {
        throw new Error('Generation failed: incomplete response from server');
      }

      const generatedRubric: Rubric = {
        id: rubricId,
        role: jd.role,
        level: jd.level,
        signals: signalsRef.current,
        createdAt: rubricCreatedAt ?? new Date().toISOString(),
        version: '1.0.0',
      };

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

  async function runPipeline(text: string) {
    if (USE_ASYNC_PIPELINE) {
      await runAsyncFlow(text);
    } else {
      await runInlineFlow(text);
    }
  }

  async function handleFile(file: File) {
    setFlow('loading');
    setAsyncStatusLabel('Parsing document...');

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

      const { text } = (await parseRes.json()) as { text: string };
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
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    signalsRef.current = [];
    setFlow('input');
    setRubric(null);
    setErrorMessage('');
    setPastedText('');
    setActiveTab('upload');
    router.push('/');
  }

  if (flow === 'loading') {
    const message = USE_ASYNC_PIPELINE
      ? asyncStatusLabel
      : 'Extracting signals from job description…';
    return (
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 focus:outline-none"
      >
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-10 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <LoadingSpinner message={message} />
          {USE_ASYNC_PIPELINE && (
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Running on Cloudflare Queues + R2. This can take 30–60 seconds.
            </p>
          )}
        </div>
      </main>
    );
  }

  if (flow === 'streaming' && rubric) {
    return (
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10 focus:outline-none"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Interview Rubric</h1>
            <button
              onClick={handleReset}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" aria-hidden="true" />
            <span>
              Generating rubric
              {rubric.signals.length > 0
                ? ` — ${rubric.signals.length} signal${rubric.signals.length !== 1 ? 's' : ''} so far`
                : '…'}
            </span>
          </div>
          {rubric.signals.length > 0 && <RubricView rubric={rubric} />}
        </div>
      </main>
    );
  }

  if (flow === 'result' && rubric) {
    return (
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10 focus:outline-none"
      >
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
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 focus:outline-none"
      >
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
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-12"
    >
      <div className="w-full max-w-xl space-y-6">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Interview Rubric Creator
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Transform job descriptions into structured interview rubrics with AI
          </p>
          {USE_ASYNC_PIPELINE && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Async mode: powered by Cloudflare Queues + R2
            </p>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
          {/* Tabs */}
          <div
            className="mb-6 flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800"
            role="tablist"
            aria-label="Input method"
          >
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
              <TextInput value={pastedText} onChange={setPastedText} disabled={isLoading} />
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
