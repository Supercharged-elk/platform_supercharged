/**
 * Studio — Real Footage pipeline E2E tests
 *
 * All AI/external API calls are mocked via page.route().
 * Zustand state is seeded via localStorage when we need to test mid-pipeline stages.
 *
 * Stages:
 *   1. Upload video clips  →  Gemini File API upload
 *   2. Review & enrich actions  →  GPT-4o
 *   3. Generate keyframes  →  Gemini image gen
 *   4. Animate videos  →  Replicate / Kling
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

// ── tiny helpers ──────────────────────────────────────────────────────────────

/** Clear the Zustand persist key for Real Footage so tests don't bleed. */
async function clearRFState(page) {
  await page.addInitScript(() => {
    localStorage.removeItem('studio-real-footage');
  });
}

/** Inject a pre-built Zustand state so we can test a specific stage. */
function injectRFState(page, partialState) {
  page.addInitScript((state) => {
    localStorage.setItem('studio-real-footage', JSON.stringify({ state, version: 0 }));
  }, partialState);
}

/** Shared fake data */
const FAKE_FILE_URI = 'files/test-abc123';
const FAKE_ANALYSIS = [
  'Overall creative tone: cinematic and moody, with a focus on contrast.',
  'ACTION: Person walks through a doorway in silhouette',
  'ACTION: Camera pans slowly across an empty street at dusk',
  'ACTION: Close-up of hands picking up an object',
  'Visual treatment: desaturated palette with warm accent lighting.',
].join('\n');

const FAKE_ACTIONS_STATE = {
  stage: 'actions',
  videoSources: [
    { fileUri: FAKE_FILE_URI, mimeType: 'video/mp4', name: FAKE_FILE_URI, displayName: 'test.mp4' },
  ],
  creativeAnalysis: FAKE_ANALYSIS,
  actionsText: 'Person walks through a doorway in silhouette\nCamera pans slowly across an empty street at dusk',
  actions: [
    { id: 'act1', raw: 'Person walks through a doorway in silhouette', imagePrompt: 'Person walks through a doorway in silhouette, cinematic chiaroscuro lighting', videoPrompt: 'Slow motion figure steps through doorway, warm backlight', approved: true },
    { id: 'act2', raw: 'Camera pans slowly across an empty street at dusk', imagePrompt: 'Empty cobblestone street at dusk, blue-orange gradient sky, desaturated palette', videoPrompt: 'Slow aerial dolly along empty street, dusk light fading', approved: true },
  ],
  keyframes: [],
  videos: [],
};

// 1x1 white JPEG base64 (minimal valid JPEG)
const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

const FAKE_KEYFRAMES_STATE = {
  stage: 'keyframes',
  videoSources: [
    { fileUri: FAKE_FILE_URI, mimeType: 'video/mp4', name: FAKE_FILE_URI, displayName: 'test.mp4' },
  ],
  creativeAnalysis: FAKE_ANALYSIS,
  actionsText: FAKE_ACTIONS_STATE.actionsText,
  actions: FAKE_ACTIONS_STATE.actions,
  keyframes: [
    {
      id: 'kf1',
      actionId: 'act1',
      imagePrompt: 'Person walks through a doorway in silhouette, cinematic chiaroscuro lighting',
      videoPrompt: 'Slow motion figure steps through doorway, warm backlight',
      base64: TINY_JPEG_B64,
      mimeType: 'image/jpeg',
      status: 'done',
      approved: true,
    },
    {
      id: 'kf2',
      actionId: 'act2',
      imagePrompt: 'Camera pans slowly across an empty street at dusk, cinematic',
      videoPrompt: 'Slow aerial dolly along empty street, dusk light fading',
      base64: null,
      mimeType: 'image/jpeg',
      status: 'idle',
      approved: false,
    },
  ],
  videos: [],
};

const FAKE_VIDEOS_STATE = {
  stage: 'videos',
  videoSources: FAKE_KEYFRAMES_STATE.videoSources,
  creativeAnalysis: FAKE_ANALYSIS,
  actionsText: FAKE_ACTIONS_STATE.actionsText,
  actions: FAKE_ACTIONS_STATE.actions,
  keyframes: FAKE_KEYFRAMES_STATE.keyframes,
  videos: [
    {
      id: 'vid1',
      keyframeId: 'kf1',
      base64: TINY_JPEG_B64,
      imagePrompt: 'Person walks through a doorway in silhouette, cinematic chiaroscuro lighting',
      videoPrompt: 'Person walks through a doorway in silhouette',
      videoUrl: null,
      status: 'idle',
    },
  ],
};

// ── mock helpers ──────────────────────────────────────────────────────────────

function mockGeminiUpload(page) {
  // Mock the Supabase Storage signed URL PUT upload (direct browser-to-Supabase upload)
  page.route('**/storage/v1/object/**', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'rf-temp/test/test-clip.mp4' }) });
    } else {
      await route.continue();
    }
  });

  page.route('**/api/studio/gemini-upload', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === 'storage_start') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ bucket: 'rf-temp', path: 'test/test-clip.mp4', token: 'fake-signed-token' }),
      });
    } else if (body?.action === 'storage_ingest') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fileUri: FAKE_FILE_URI, mimeType: 'video/mp4', name: FAKE_FILE_URI, displayName: 'test.mp4' }),
      });
    } else {
      // Legacy multipart path
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fileUri: FAKE_FILE_URI, mimeType: 'video/mp4', name: FAKE_FILE_URI, displayName: 'test.mp4' }),
      });
    }
  });
}

function mockGeminiAnalyze(page) {
  page.route('**/api/studio/gemini', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === 'video') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: FAKE_ANALYSIS }),
      });
    } else if (body?.mode === 'generate' || body?.mode === 'vision') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ base64: TINY_JPEG_B64, mimeType: 'image/jpeg' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Generic response' }),
      });
    }
  });
}

function mockOpenAI(page) {
  page.route('**/api/studio/openai', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          items: [
            {
              imagePrompt: 'Person emerges from shadow doorway, wide-angle shot with warm backlight, chiaroscuro contrast.',
              videoPrompt: 'Slow motion figure steps through doorway, warm backlight fading in.',
            },
            {
              imagePrompt: 'Slow aerial dolly along empty cobblestone street, dusk light, blue-orange color grade.',
              videoPrompt: 'Slow aerial pan across empty street, dusk light, smooth camera movement.',
            },
          ],
        },
      }),
    });
  });
}

function mockReplicate(page) {
  // Return succeeded immediately from POST so pollPrediction is never called (no 3s sleep)
  page.route('**/api/studio/replicate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'pred-test-001', status: 'succeeded', output: ['https://cdn.example.com/test.mp4'] }),
    });
  });
  page.route('**/api/studio/replicate/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'pred-test-001', status: 'succeeded', output: ['https://cdn.example.com/test.mp4'] }),
    });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Studio — Real Footage pipeline', () => {

  // Bypass the @elkanodata.com auth gate for E2E tests (dev only)
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{
      name: 'e2e_auth_bypass',
      value: '1',
      domain: 'localhost',
      path: '/',
    }]);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-01: Studio landing page
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-01: Studio landing shows both pipeline cards', async ({ page }) => {
    await page.goto('/studio', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Studio' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Real Footage/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Illustrations/i })).toBeVisible();

    // Pipeline description texts
    await expect(page.getByText(/Upload video.*Analyze with AI/i)).toBeVisible();
    await expect(page.getByText(/Upload B&W sketches/i)).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-02: Stage 1 — renders upload dropzone
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-02: Stage 1 renders video upload dropzone', async ({ page }) => {
    await clearRFState(page);
    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Upload Real Footage/i })).toBeVisible();
    await expect(page.getByText(/MP4, MOV, WebM/i)).toBeVisible();

    // The nav shows "Studio" and both pipeline links
    await expect(page.getByText('Studio', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Real Footage/i }).first()).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-03: Stage 1 — upload a video, see "ready" state, then analyze
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-03: Upload video → mock Gemini upload → slot shows ready → analyze calls Gemini', async ({ page }) => {
    test.setTimeout(30000);
    await clearRFState(page);
    mockGeminiUpload(page);
    mockGeminiAnalyze(page);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });

    // Track which API routes were called
    const uploadCalls = [];
    const analyzeCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/gemini-upload')) uploadCalls.push(r.method());
      if (r.url().includes('/api/studio/gemini')) {
        try { analyzeCalls.push(r.postDataJSON()); } catch { analyzeCalls.push(null); }
      }
    });

    // Upload a fake MP4 file
    const fileInput = page.locator('input[type="file"][accept="video/*"]');
    await fileInput.setInputFiles({
      name: 'test-clip.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake video content'),
    });

    // Slot appears with filename
    await expect(page.getByText('test-clip.mp4')).toBeVisible({ timeout: 5000 });

    // After mock upload resolves, slot should say "Ready for analysis"
    await expect(page.getByText('Ready for analysis')).toBeVisible({ timeout: 10000 });
    expect(uploadCalls.length).toBeGreaterThan(0);

    // Analyze button appears
    const analyzeBtn = page.getByRole('button', { name: /Analyze.*clip.*Gemini/i });
    await expect(analyzeBtn).toBeVisible();
    await analyzeBtn.click();

    // Analysis result appears
    await expect(page.getByText('Creative Analysis')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/cinematic and moody/i)).toBeVisible();

    // Confirm button appears
    await expect(page.getByRole('button', { name: /Confirm & Review Actions/i })).toBeVisible();

    // Verify Gemini was called with mode=video
    expect(analyzeCalls.some((c) => c?.mode === 'video')).toBe(true);

    await page.screenshot({ path: 'test-results/RF-03-after-analyze.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-04: Stage 1 → Stage 2 transition via confirm
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-04: Confirm analysis → navigates to Stage 2 with detected actions', async ({ page }) => {
    injectRFState(page, {
      stage: 'upload',
      videoSources: [{ fileUri: FAKE_FILE_URI, mimeType: 'video/mp4', name: FAKE_FILE_URI, displayName: 'test.mp4' }],
      creativeAnalysis: FAKE_ANALYSIS,
      actions: FAKE_ACTIONS_STATE.actions,
      keyframes: [],
      videos: [],
    });

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });

    // Creative analysis is shown since creativeAnalysis is populated
    await expect(page.getByText('Creative Analysis')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Confirm & Review Actions/i }).click();

    // Now on Stage 2
    await expect(page.getByRole('heading', { name: /Define & Enrich Actions/i })).toBeVisible({ timeout: 5000 });
    // Use exact: true — the creativeAnalysis paragraph also contains these strings as substrings
    await expect(page.getByText('Person walks through a doorway in silhouette', { exact: true })).toBeVisible();
    await expect(page.getByText('Camera pans slowly across an empty street at dusk', { exact: true })).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-05: Stage 2 — AI Enrich All calls GPT-4o, editable enriched text
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-05: Stage 2 — Enrich with AI calls OpenAI and updates action prompts', async ({ page }) => {
    test.setTimeout(20000);
    injectRFState(page, FAKE_ACTIONS_STATE);
    mockOpenAI(page);

    const openAICalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/openai')) {
        try { openAICalls.push(r.postDataJSON()); } catch { openAICalls.push(null); }
      }
    });

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Define & Enrich Actions/i })).toBeVisible({ timeout: 5000 });

    // Actions are displayed (use exact: true — creativeAnalysis paragraph contains these as substrings)
    await expect(page.getByText('Person walks through a doorway in silhouette', { exact: true })).toBeVisible();

    // Click "Enrich with AI"
    await page.getByRole('button', { name: /Enrich with AI/i }).click();

    // Wait for enrichment to complete — action cards with imagePrompt textareas appear
    // .first() because the button appears in both the enriched-actions header and bottom nav
    await expect(page.getByRole('button', { name: /Generate Keyframes for/i }).first()).toBeVisible({ timeout: 10000 });

    // Verify OpenAI was called (not Gemini)
    expect(openAICalls.length).toBeGreaterThan(0);
    const call = openAICalls[0];
    // Should have messages array with system + user
    expect(Array.isArray(call?.messages)).toBe(true);
    expect(call.messages.some((m) => m.role === 'system')).toBe(true);
    // model should be gpt-4o (sent as top-level field in request body)
    expect(call?.model).toMatch(/gpt-4o/i);

    await page.screenshot({ path: 'test-results/RF-05-after-enrich.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-06: Stage 2 — action enriched text is editable
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-06: Stage 2 — enriched textarea is editable', async ({ page }) => {
    injectRFState(page, FAKE_ACTIONS_STATE);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Define & Enrich Actions/i })).toBeVisible({ timeout: 5000 });

    // Find the first enriched textarea
    const textarea = page.locator('textarea').first();
    await textarea.fill('Custom cinematic description added by tester');
    await expect(textarea).toHaveValue('Custom cinematic description added by tester');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-07: Stage 2 → Stage 3 transition (confirm actions)
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-07: Stage 2 confirm → Stage 3 keyframes (Generate All + per-keyframe approve)', async ({ page }) => {
    test.setTimeout(30000);
    injectRFState(page, FAKE_ACTIONS_STATE);
    mockGeminiAnalyze(page); // mocks generate mode for keyframes

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Define & Enrich Actions/i })).toBeVisible({ timeout: 5000 });

    // Confirm to advance to Stage 3 — use .first() because the button appears in both
    // the enriched-actions header and the bottom navigation bar
    await page.getByRole('button', { name: /Generate Keyframes for/i }).first().click();

    await expect(page.getByRole('heading', { name: /Generate Keyframes/i })).toBeVisible({ timeout: 5000 });

    // Approve button disabled before generation (keyframe is idle)
    const approveBtn = page.getByRole('button', { name: /Approve/i }).first();
    await expect(approveBtn).toBeDisabled();

    // Generate All
    await page.getByRole('button', { name: /Generate All/i }).click();

    // After generation, approve button becomes enabled
    await expect(approveBtn).not.toBeDisabled({ timeout: 15000 });

    // Approve one keyframe
    await approveBtn.click();
    await expect(approveBtn).toContainText('Approved');

    // "Animate N Keyframes" button appears (use .first() — appears in both header and bottom nav)
    await expect(page.getByRole('button', { name: /Animate.*Keyframe/i }).first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/RF-07-keyframes.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-08: Stage 3 — "Approve at least one" message when none approved
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-08: Stage 3 — shows message when no keyframe is approved', async ({ page }) => {
    // All keyframes done but none approved
    const stateNoApproval = {
      ...FAKE_KEYFRAMES_STATE,
      keyframes: [
        { ...FAKE_KEYFRAMES_STATE.keyframes[0], approved: false },
      ],
    };
    injectRFState(page, stateNoApproval);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Generate Keyframes/i })).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/Approve at least one keyframe to continue/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Animate/i })).not.toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-09: Stage 3 → Stage 4 — editable per-card prompt in videos stage
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-09: Stage 4 — video prompt textarea is always visible and editable', async ({ page }) => {
    injectRFState(page, FAKE_VIDEOS_STATE);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Keyframes/i })).toBeVisible({ timeout: 5000 });

    // Editable prompt textarea is visible even when status=idle
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toBeVisible();
    await expect(promptTextarea).toHaveValue('Person walks through a doorway in silhouette'); // vid.videoPrompt

    // Can be edited
    await promptTextarea.fill('Slow motion figure steps through an arched doorway');
    await expect(promptTextarea).toHaveValue('Slow motion figure steps through an arched doorway');

    // "Generate Video" button is visible per card when status=idle
    await expect(page.getByRole('button', { name: /Generate Video/i })).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-10: Stage 4 — generate video calls Replicate with custom prompt
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-10: Stage 4 — generate video mocks Replicate, video URL shown on completion', async ({ page }) => {
    test.setTimeout(30000);
    injectRFState(page, FAKE_VIDEOS_STATE);
    mockReplicate(page);

    const replicateCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/replicate') && r.method() === 'POST') {
        try { replicateCalls.push(r.postDataJSON()); } catch { replicateCalls.push(null); }
      }
    });

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Keyframes/i })).toBeVisible({ timeout: 5000 });

    // Edit prompt then generate
    const promptTextarea = page.locator('textarea').first();
    await promptTextarea.fill('Dramatic silhouette emergence');
    await page.getByRole('button', { name: /Generate Video/i }).click();

    // "All N videos generated" message should appear after mock completes
    await expect(page.getByText(/video.*generated successfully/i)).toBeVisible({ timeout: 15000 });

    // Verify Replicate was called
    expect(replicateCalls.length).toBeGreaterThan(0);
    const call = replicateCalls[0];
    expect(call?.model).toMatch(/kling/i);
    expect(call?.input?.prompt).toContain('Dramatic silhouette emergence');

    await page.screenshot({ path: 'test-results/RF-10-video-done.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-11: Back navigation — Stage 4 → 3 → 2 → 1
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-11: Back navigation goes videos → keyframes → actions → upload', async ({ page }) => {
    injectRFState(page, FAKE_VIDEOS_STATE);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Keyframes/i })).toBeVisible({ timeout: 5000 });

    // Back to keyframes
    await page.getByRole('button', { name: /Back to Keyframes/i }).click();
    await expect(page.getByRole('heading', { name: /Generate Keyframes/i })).toBeVisible({ timeout: 5000 });

    // Back to actions
    await page.getByRole('button', { name: /Back to Actions/i }).click();
    await expect(page.getByRole('heading', { name: /Define & Enrich Actions/i })).toBeVisible({ timeout: 5000 });

    // Back to upload/analysis
    await page.getByRole('button', { name: /Back to Analysis/i }).click();
    await expect(page.getByRole('heading', { name: /Upload Real Footage/i })).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/RF-11-back-to-upload.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-12: Stage 2 — approve/unapprove toggles action border styling
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-12: Stage 2 — toggling action approve changes its visual state', async ({ page }) => {
    injectRFState(page, FAKE_ACTIONS_STATE);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Define & Enrich Actions/i })).toBeVisible({ timeout: 5000 });

    // Target the Unapprove button directly — the [class*="rounded-xl"] filter also matched
    // the creativeAnalysis card (which contains the action text as substring but has no buttons)
    const checkBtn = page.getByRole('button', { name: 'Unapprove' }).first();

    // It's currently checked (approved) — click to unapprove
    await checkBtn.click();

    // The "Generate Keyframes for N" count should decrease
    // (0 approved now → button should disappear or count changes)
    // Actually both start approved (2), after unchecking one it should show "1"
    // .first() because this button appears in both the enriched-actions header and bottom nav
    const confirmBtn = page.getByRole('button', { name: /Generate Keyframes for 1 Action/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-13: Stage 3 — prompt textarea is editable before generation
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-13: Stage 3 — keyframe prompt textarea is editable', async ({ page }) => {
    injectRFState(page, FAKE_KEYFRAMES_STATE);

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Generate Keyframes/i })).toBeVisible({ timeout: 5000 });

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    await textarea.fill('Custom cinematic keyframe description for testing');
    await expect(textarea).toHaveValue('Custom cinematic keyframe description for testing');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-14: Stage 3 — "Generate All" button triggers generate for all keyframes
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-14: Stage 3 — Generate All fires API for idle keyframes', async ({ page }) => {
    test.setTimeout(20000);
    // Start with one idle keyframe
    const stateOneIdle = {
      ...FAKE_KEYFRAMES_STATE,
      keyframes: [
        {
          id: 'kf2',
          actionId: 'act2',
          imagePrompt: 'Camera pans slowly across an empty street at dusk, cinematic',
          videoPrompt: 'Slow aerial dolly along empty street, dusk light fading',
          base64: null,
          mimeType: 'image/jpeg',
          status: 'idle',
          approved: false,
        },
      ],
    };
    injectRFState(page, stateOneIdle);
    mockGeminiAnalyze(page);

    const geminiCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/gemini')) geminiCalls.push(1);
    });

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Generate Keyframes/i })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Generate All/i }).click();

    // Gemini should be called (for image generation)
    await page.waitForTimeout(2000);
    expect(geminiCalls.length).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-15: Stage 1 — local preflight blocks unsupported MIME without API call
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-15: Unsupported MIME is rejected locally and does not call upload endpoint', async ({ page }) => {
    await clearRFState(page);

    const uploadCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/gemini-upload')) uploadCalls.push(r.method());
    });

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    const fileInput = page.locator('input[type="file"][accept="video/*"]');

    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a video'),
    });

    await expect(page.getByText('invalid.txt')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Unsupported video format/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/All uploads failed.*selected format is not supported/i)).toBeVisible({ timeout: 5000 });
    expect(uploadCalls.length).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RF-16: Stage 1 — endpoint error contract is surfaced in slot + aggregate
  // ────────────────────────────────────────────────────────────────────────────
  test('RF-16: FILE_TOO_LARGE endpoint error is shown with actionable aggregate summary', async ({ page }) => {
    await clearRFState(page);
    page.route('**/api/studio/gemini-upload', async (route) => {
      await route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'FILE_TOO_LARGE',
          message: 'File too large. Max allowed is 50 MB.',
          retryable: false,
        }),
      });
    });

    await page.goto('/studio/real-footage', { waitUntil: 'domcontentloaded' });
    const fileInput = page.locator('input[type="file"][accept="video/*"]');
    await fileInput.setInputFiles({
      name: 'huge.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('tiny content but mocked error'),
    });

    await expect(page.getByText('huge.mp4')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/File too large\. Max allowed is 50 MB\./i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/All uploads failed.*most clips exceed the allowed size/i)).toBeVisible({ timeout: 5000 });
  });

});
