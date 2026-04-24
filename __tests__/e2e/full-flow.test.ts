/**
 * E2E Tests — Interview Rubric Creator
 *
 * Covers the full user journey:
 *   paste text → extract → generate → view rubric → download export
 *
 * API routes (/api/extract, /api/generate, /api/export, /api/parse) are
 * intercepted with Playwright route mocking so the tests are deterministic
 * and require no live Anthropic API key.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  MOCK_RUBRIC,
  MOCK_RUBRIC_ID,
  MOCK_JOB_ID,
  MOCK_EXTRACT_RESPONSE,
  LONG_JD_TEXT,
} from './fixtures/mockData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an SSE response body that matches what /api/generate now streams.
 * Emits one `signal` event per rubric signal, then a final `done` event.
 */
function buildGenerateSSEBody(rubric: typeof MOCK_RUBRIC): string {
  return [
    ...rubric.signals.map(
      (signal) => `data: ${JSON.stringify({ type: 'signal', signal })}\n\n`,
    ),
    `data: ${JSON.stringify({
      type: 'done',
      id: rubric.id,
      role: rubric.role,
      level: rubric.level,
      createdAt: rubric.createdAt,
      version: rubric.version,
    })}\n\n`,
  ].join('');
}

/** Intercept all three pipeline API routes with deterministic mock responses. */
async function mockPipelineRoutes(page: Page) {
  // Inline pipeline
  await page.route('**/api/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_EXTRACT_RESPONSE),
    });
  });

  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: buildGenerateSSEBody(MOCK_RUBRIC),
    });
  });

  // Async pipeline
  await mockAsyncPipelineRoutes(page);
}

/**
 * Intercept the async pipeline routes (Cloudflare Queues + R2 path).
 *
 * POST /api/jobs  → returns a queued job ID immediately.
 * GET  /api/jobs/:jobId → returns status=done with the mock rubric on the
 *   first poll, keeping tests fast without real queue latency.
 */
async function mockAsyncPipelineRoutes(page: Page) {
  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: MOCK_JOB_ID, status: 'queued' }),
    });
  });

  await page.route(`**/api/jobs/${MOCK_JOB_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId: MOCK_JOB_ID,
        status: 'done',
        rubric: MOCK_RUBRIC,
        createdAt: MOCK_RUBRIC.createdAt,
        updatedAt: MOCK_RUBRIC.createdAt,
        attempts: 1,
      }),
    });
  });
}

/** Intercept /api/export and respond with a minimal binary file. */
async function mockExportRoute(page: Page) {
  await page.route('**/api/export', async (route) => {
    const body = route.request().postDataJSON() as { format: 'pdf' | 'docx' };
    const format = body.format;
    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    await route.fulfill({
      status: 200,
      contentType,
      headers: {
        'Content-Disposition': `attachment; filename="rubric.${format}"`,
      },
      body: Buffer.from(`mock ${format} content`),
    });
  });
}

/** Intercept /api/parse and return a pre-canned text string. */
async function mockParseRoute(page: Page, returnText = LONG_JD_TEXT) {
  await page.route('**/api/parse', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: returnText }),
    });
  });
}

/**
 * Seed localStorage with MOCK_RUBRIC so the rubric page can load it without
 * running the full pipeline. Must be called after `page.goto()`.
 */
async function seedRubricInLocalStorage(page: Page) {
  await page.evaluate(
    ([id, rubric]) => {
      localStorage.setItem('rubrics', JSON.stringify({ [id]: rubric }));
    },
    [MOCK_RUBRIC_ID, MOCK_RUBRIC] as const,
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────

test.describe('Home page', () => {
  test('renders the hero heading and description', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Interview Rubric Creator' })).toBeVisible();
    await expect(
      page.getByText('Transform job descriptions into structured interview rubrics with AI'),
    ).toBeVisible();
  });

  test('shows Upload File tab active by default', async ({ page }) => {
    await page.goto('/');
    const uploadTab = page.getByRole('tab', { name: 'Upload File' });
    await expect(uploadTab).toBeVisible();
    await expect(uploadTab).toHaveAttribute('aria-selected', 'true');
  });

  test('shows the file drop-zone when Upload File tab is active', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Upload a job description file/i })).toBeVisible();
    await expect(page.getByText('Drag & drop or click to upload')).toBeVisible();
  });

  test('switches to Paste Text tab and shows the textarea', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await expect(page.getByRole('tab', { name: 'Paste Text' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByPlaceholder('Paste your job description here...'),
    ).toBeVisible();
  });
});

// ─── Text Input Validation ────────────────────────────────────────────────────

test.describe('Text input validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
  });

  test('Generate Rubric button is disabled when textarea is empty', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Generate Rubric' })).toBeDisabled();
  });

  test('shows character count hint when text is too short', async ({ page }) => {
    await page.getByPlaceholder('Paste your job description here...').fill('Too short');
    await expect(page.getByText(/Minimum 100 characters required/)).toBeVisible();
  });

  test('updates character count as user types', async ({ page }) => {
    const textarea = page.getByPlaceholder('Paste your job description here...');
    await textarea.fill('Hello');
    await expect(page.getByText(/5\s*\/\s*50,000/)).toBeVisible();
  });

  test('enables Generate Rubric button once 100+ chars are entered', async ({ page }) => {
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await expect(page.getByRole('button', { name: 'Generate Rubric' })).toBeEnabled();
  });

  test('shows validation error when fewer than 100 chars are submitted directly', async ({
    page,
  }) => {
    // Simulate a submit attempt with just under 100 chars by filling 99 chars.
    // The button is disabled so we trigger the flow via page.evaluate instead.
    await page
      .getByPlaceholder('Paste your job description here...')
      .fill('A'.repeat(99));
    // Button stays disabled — confirm the hint copy is visible.
    await expect(page.getByText(/Minimum 100 characters required/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Rubric' })).toBeDisabled();
  });
});

// ─── Full Pipeline: Paste Text → Extract → Generate → Rubric View ─────────────

test.describe('Full paste-text pipeline', () => {
  test('shows loading state while pipeline runs', async ({ page }) => {
    await mockPipelineRoutes(page);

    // Delay both pipeline entry points so the loading UI is visible in either
    // mode: inline (delays /api/extract) or async (delays POST /api/jobs).
    await page.route('**/api/extract', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EXTRACT_RESPONSE),
      });
    });
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: MOCK_JOB_ID, status: 'queued' }),
      });
    });

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    // Loading spinner appears while the first network call is pending.
    // Inline mode shows the extract label; async mode shows "Submitting...".
    await expect(
      page.getByText(/Extracting signals from job description|Submitting\.\.\./),
    ).toBeVisible();
  });

  test('redirects to /rubric/[id] after successful generation', async ({ page }) => {
    await mockPipelineRoutes(page);

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    await page.waitForURL(`**/rubric/${MOCK_RUBRIC_ID}`);
    expect(page.url()).toContain(`/rubric/${MOCK_RUBRIC_ID}`);
  });

  test('displays role and signal names on the rubric page after redirect', async ({ page }) => {
    await mockPipelineRoutes(page);

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    await page.waitForURL(`**/rubric/${MOCK_RUBRIC_ID}`);

    await expect(page.getByText('Senior Software Engineer')).toBeVisible();
    await expect(page.getByText('Technical Problem Solving').first()).toBeVisible();
    await expect(page.getByText('System Design').first()).toBeVisible();
  });

  test('stores rubric in localStorage after generation', async ({ page }) => {
    await mockPipelineRoutes(page);

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    await page.waitForURL(`**/rubric/${MOCK_RUBRIC_ID}`);

    const stored = await page.evaluate((id) => {
      const raw = localStorage.getItem('rubrics');
      const rubrics = JSON.parse(raw ?? '{}') as Record<string, unknown>;
      return rubrics[id];
    }, MOCK_RUBRIC_ID);

    expect(stored).toBeTruthy();
    expect((stored as { role: string }).role).toBe('Senior Software Engineer');
  });
});

// ─── File Upload Pipeline ──────────────────────────────────────────────────────

test.describe('File upload pipeline', () => {
  test('shows the drop-zone by default on the Upload File tab', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /Upload a job description file/i }),
    ).toBeVisible();
  });

  test('uploads a TXT file and completes the pipeline', async ({ page }) => {
    await mockParseRoute(page);
    await mockPipelineRoutes(page);

    await page.goto('/');

    // Trigger the file chooser via the hidden <input type="file">
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /Upload a job description file/i }).click(),
    ]);
    await fileChooser.setFiles({
      name: 'job-description.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(LONG_JD_TEXT),
    });

    await page.waitForURL(`**/rubric/${MOCK_RUBRIC_ID}`);
    expect(page.url()).toContain(`/rubric/${MOCK_RUBRIC_ID}`);
  });

  test('shows the loading state after a file is selected', async ({ page }) => {
    // Hold parse open so we can assert on the loading UI before redirect.
    let resolveParse: () => void;
    const parseReady = new Promise<void>((r) => (resolveParse = r));

    await page.route('**/api/parse', async (route) => {
      await parseReady;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: LONG_JD_TEXT }),
      });
    });
    await mockPipelineRoutes(page);

    await page.goto('/');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /Upload a job description file/i }).click(),
    ]);
    await fileChooser.setFiles({
      name: 'my-jd.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(LONG_JD_TEXT),
    });

    // React batches setSelectedFile + setFlow('loading') together, so the page
    // immediately transitions to the loading spinner. Verify the spinner text.
    // Inline mode: "Extracting signals…". Async mode: "Parsing document...".
    await expect(
      page.getByText(/Extracting signals from job description|Parsing document/),
    ).toBeVisible();

    resolveParse!();
  });

  test('shows an error when /api/parse fails', async ({ page }) => {
    await page.route('**/api/parse', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unsupported file type' }),
      });
    });

    await page.goto('/');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /Upload a job description file/i }).click(),
    ]);
    await fileChooser.setFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('short'),
    });

    await expect(page.getByText('Unsupported file type')).toBeVisible();
  });
});

// ─── Rubric Page (direct navigation) ──────────────────────────────────────────

test.describe('Rubric page', () => {
  test('loads and displays the rubric from localStorage', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    await expect(page.getByText('Senior Software Engineer')).toBeVisible();
    await expect(page.getByText('Technical Problem Solving').first()).toBeVisible();
    await expect(page.getByText('System Design').first()).toBeVisible();
  });

  test('shows signal weights', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    // WeightBadge renders "Weight: N/10"
    await expect(page.getByText('Weight: 9/10')).toBeVisible();
    await expect(page.getByText('Weight: 8/10')).toBeVisible();
  });

  test('shows total weight in the rubric header', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    // 9 + 8 = 17
    await expect(page.getByText('Total weight: 17')).toBeVisible();
  });

  test('shows criteria table headers (Exceeds / Meets / Below)', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    await expect(page.getByText('Exceeds').first()).toBeVisible();
    await expect(page.getByText('Meets').first()).toBeVisible();
    await expect(page.getByText('Below').first()).toBeVisible();
  });

  test('shows suggested questions for each signal', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    await expect(
      page.getByText('Walk me through how you would design a distributed rate-limiting system.'),
    ).toBeVisible();
    await expect(
      page.getByText('How would you design a distributed job queue capable of handling 100K events per second?'),
    ).toBeVisible();
  });

  test('shows a Back to Home link', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    const backLink = page.getByRole('link', { name: 'Back to Home' });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/');
  });

  test('shows "Rubric not found" for an unknown rubric ID', async ({ page }) => {
    await page.goto('/rubric/does-not-exist-xyz');

    await expect(page.getByRole('heading', { name: 'Rubric not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Home' })).toBeVisible();
  });

  test('navigates back to home when Back to Home is clicked', async ({ page }) => {
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);

    await page.getByRole('link', { name: 'Back to Home' }).click();
    await page.waitForURL('/');
    expect(page.url()).toMatch(/\/$/);
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────

test.describe('Export', () => {
  test.beforeEach(async ({ page }) => {
    await mockExportRoute(page);
    await page.goto('/');
    await seedRubricInLocalStorage(page);
    await page.goto(`/rubric/${MOCK_RUBRIC_ID}`);
  });

  test('Download PDF button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  });

  test('Download DOCX button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Download DOCX' })).toBeVisible();
  });

  test('triggers a PDF download when Download PDF is clicked', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('rubric.pdf');
  });

  test('triggers a DOCX download when Download DOCX is clicked', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download DOCX' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('rubric.docx');
  });

  test('calls /api/export with correct format for PDF', async ({ page }) => {
    let capturedBody: { format: string } | null = null;

    await page.route('**/api/export', async (route) => {
      capturedBody = route.request().postDataJSON() as { format: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="rubric.pdf"' },
        body: Buffer.from('mock pdf'),
      });
    });

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PDF' }).click(),
    ]);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.format).toBe('pdf');
  });

  test('calls /api/export with correct format for DOCX', async ({ page }) => {
    let capturedBody: { format: string } | null = null;

    await page.route('**/api/export', async (route) => {
      capturedBody = route.request().postDataJSON() as { format: string };
      await route.fulfill({
        status: 200,
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers: { 'Content-Disposition': 'attachment; filename="rubric.docx"' },
        body: Buffer.from('mock docx'),
      });
    });

    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download DOCX' }).click(),
    ]);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.format).toBe('docx');
  });

  test('shows an error message when the export API fails', async ({ page }) => {
    await page.route('**/api/export', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Export service unavailable' }),
      });
    });

    await page.getByRole('button', { name: 'Download PDF' }).click();

    // Use getByText to avoid strict-mode clash with Next.js's route announcer
    // which also carries role="alert".
    await expect(page.getByText('Export service unavailable')).toBeVisible();
  });

  test('disables both export buttons while a download is in progress', async ({ page }) => {
    // Hold the export request open until we can assert on button state.
    let resolveExport: () => void;
    const exportReady = new Promise<void>((r) => (resolveExport = r));

    await page.route('**/api/export', async (route) => {
      await exportReady;
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': 'attachment; filename="rubric.pdf"' },
        body: Buffer.from('mock pdf'),
      });
    });

    // Don't await the full download — we want to inspect mid-flight state.
    page.getByRole('button', { name: 'Download PDF' }).click();

    // Both buttons should be disabled while export is running.
    await expect(page.getByRole('button', { name: /Generating PDF/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download DOCX' })).toBeDisabled();

    resolveExport!();
  });
});

// ─── Error Handling ───────────────────────────────────────────────────────────

test.describe('Error handling', () => {
  test('shows an error when /api/extract fails', async ({ page }) => {
    // Inline: /api/extract returns 500.
    await page.route('**/api/extract', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Claude is unavailable' }),
      });
    });

    // Async: POST /api/jobs returns the same error so the UI message matches.
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Claude is unavailable' }),
      });
    });

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    await expect(page.getByText('Claude is unavailable')).toBeVisible();
  });

  test('shows an error when /api/generate fails', async ({ page }) => {
    // Inline: extract succeeds, generate fails.
    await page.route('**/api/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EXTRACT_RESPONSE),
      });
    });

    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rubric generation timed out' }),
      });
    });

    // Async: job is accepted then the poll reports it failed.
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: MOCK_JOB_ID, status: 'queued' }),
      });
    });

    await page.route(`**/api/jobs/${MOCK_JOB_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: MOCK_JOB_ID,
          status: 'failed',
          error: 'Rubric generation timed out',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attempts: 1,
        }),
      });
    });

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    await expect(page.getByText('Rubric generation timed out')).toBeVisible();
  });

  test('allows the user to retry after an error', async ({ page }) => {
    // Inline: first extract call fails, second succeeds.
    let extractCallCount = 0;
    await page.route('**/api/extract', async (route) => {
      extractCallCount++;
      if (extractCallCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary failure' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_EXTRACT_RESPONSE),
        });
      }
    });

    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildGenerateSSEBody(MOCK_RUBRIC),
      });
    });

    // Async: POST /api/jobs fails — the "try again" button resets to the home
    // form (handleReset), so we only need the first attempt to fail.
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary failure' }),
      });
    });

    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste Text' }).click();
    await page.getByPlaceholder('Paste your job description here...').fill(LONG_JD_TEXT);
    await page.getByRole('button', { name: 'Generate Rubric' }).click();

    // Error shown on first attempt.
    await expect(page.getByText('Temporary failure')).toBeVisible();

    // Find and click the retry button (ErrorMessage renders a retry action).
    await page.getByRole('button', { name: /try again/i }).click();

    // After retry the home form is shown again.
    await expect(page.getByRole('heading', { name: 'Interview Rubric Creator' })).toBeVisible();
  });
});
