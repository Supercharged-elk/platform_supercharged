/**
 * Studio — Illustrations pipeline E2E tests
 *
 * All AI/external API calls are mocked via page.route().
 * Zustand state is seeded via localStorage for mid-pipeline stage testing.
 *
 * Stages:
 *   1. Upload B&W sketches  →  Gemini colorization
 *   2. Review video prompts  →  Gemini vision (regenerate)
 *   3. Animate videos  →  WaveSpeed (wan-2.2 + LoRA)
 */
const { test, expect } = require('@playwright/test');

// ── helpers ───────────────────────────────────────────────────────────────────

async function clearILState(page) {
  await page.addInitScript(() => {
    localStorage.removeItem('studio-illustrations');
  });
}

function injectILState(page, partialState) {
  page.addInitScript((state) => {
    localStorage.setItem('studio-illustrations', JSON.stringify({ state, version: 0 }));
  }, partialState);
}

// Minimal valid 1x1 JPEG base64
const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

// Shared fake state objects
const FAKE_COLORIZED_STATE = {
  stage: 'upload',
  colorized: [
    {
      id: 'col1',
      originalBase64: TINY_JPEG_B64,
      originalMimeType: 'image/jpeg',
      colorizedBase64: TINY_JPEG_B64,
      mimeType: 'image/jpeg',
      status: 'done',
      approved: true,
      instruction: '',
      referenceBase64: null,
      referenceMimeType: 'image/jpeg',
    },
    {
      id: 'col2',
      originalBase64: TINY_JPEG_B64,
      originalMimeType: 'image/jpeg',
      colorizedBase64: null,
      mimeType: 'image/jpeg',
      status: 'idle',
      approved: true,
      instruction: '',
      referenceBase64: null,
      referenceMimeType: 'image/jpeg',
    },
  ],
  prompts: [],
  videos: [],
};

const FAKE_PROMPTS_STATE = {
  stage: 'prompts',
  colorized: FAKE_COLORIZED_STATE.colorized,
  prompts: [
    {
      id: 'prm1',
      colorizedId: 'col1',
      source: 'colorized',
      imageBase64: TINY_JPEG_B64,
      mimeType: 'image/jpeg',
      action: '',
      prompt: 'A smooth animation of this illustration coming to life with gentle movement',
      promptStatus: 'done',
      approved: true,
      endImageBase64: null,
      endImageMimeType: 'image/jpeg',
    },
  ],
  videos: [],
};

const FAKE_VIDEOS_STATE = {
  stage: 'videos',
  colorized: FAKE_COLORIZED_STATE.colorized,
  prompts: FAKE_PROMPTS_STATE.prompts,
  videos: [
    {
      id: 'vid1',
      promptId: 'prm1',
      imageBase64: TINY_JPEG_B64,
      mimeType: 'image/jpeg',
      prompt: 'A smooth animation of this illustration coming to life with gentle movement',
      endImageBase64: null,
      endImageMimeType: 'image/jpeg',
      videoUrl: null,
      status: 'idle',
    },
  ],
};

// ── mock helpers ──────────────────────────────────────────────────────────────

function mockGeminiColorize(page) {
  page.route('**/api/studio/gemini', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === 'colorize') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ base64: TINY_JPEG_B64, mimeType: 'image/jpeg' }),
      });
    } else if (body?.mode === 'vision') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Gentle watercolor strokes flow across the canvas, colors bloom softly.' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Generic Gemini response' }),
      });
    }
  });
}

function mockWaveSpeed(page) {
  // Return completed immediately from POST so pollWavespeedPrediction is never called (no 3s sleep)
  page.route('**/api/studio/wavespeed', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'wave-test-001',
        status: 'completed',
        outputs: ['https://cdn.example.com/test-animation.mp4'],
      }),
    });
  });
  page.route('**/api/studio/wavespeed/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'wave-test-001',
        status: 'completed',
        outputs: ['https://cdn.example.com/test-animation.mp4'],
      }),
    });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Studio — Illustrations pipeline', () => {

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
  // IL-01: Illustrations page renders with upload zone
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-01: Illustrations page renders upload zone', async ({ page }) => {
    await clearILState(page);
    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible();
    await expect(page.getByText(/B&W sketch images/i)).toBeVisible();
    await expect(page.getByText(/JPG, PNG, WebP/i)).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-02: Upload sketch → colorize (mock Gemini) → item shows colorized result
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-02: Upload sketch → Colorize All → item shows done state', async ({ page }) => {
    test.setTimeout(20000);
    await clearILState(page);
    mockGeminiColorize(page);

    const geminiCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/gemini')) {
        try { geminiCalls.push(r.postDataJSON()); } catch { geminiCalls.push(null); }
      }
    });

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });

    // Upload a fake PNG sketch
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({
      name: 'sketch.png',
      mimeType: 'image/png',
      buffer: Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // bit depth, color type, CRC
      ]),
    });

    // Colorize All button appears after upload
    const colorizeBtn = page.getByRole('button', { name: /Colorize All/i });
    await expect(colorizeBtn).toBeVisible({ timeout: 5000 });

    // Click Colorize All
    await colorizeBtn.click();

    // Wait for done state (approve button becomes active)
    await expect(page.getByRole('button', { name: /Approved|Approve/i }).first()).not.toBeDisabled({ timeout: 10000 });

    // Gemini was called with mode=colorize
    expect(geminiCalls.some((c) => c?.mode === 'colorize')).toBe(true);

    await page.screenshot({ path: 'test-results/IL-02-colorized.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-03: Colorization instruction field appears after first upload
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-03: Instruction field appears after upload, changes trigger warning after items are done', async ({ page }) => {
    injectILState(page, FAKE_COLORIZED_STATE);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible({ timeout: 5000 });

    // Instruction field visible
    const instructionField = page.getByPlaceholder(/warm earthy tones/i);
    await expect(instructionField).toBeVisible();
    await expect(page.getByText(/Global colorization instructions/i)).toBeVisible();

    // Since col1 is 'done', changing the instruction shows a warning
    await instructionField.fill('cool blue tones, minimal shadows');
    await expect(page.getByText(/Instructions changed.*Regenerate/i)).toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: 'test-results/IL-03-instruction-warning.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-04: Individual item "Click to colorize" triggers per-item API call
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-04: Per-item colorize uses the current instruction field value', async ({ page }) => {
    test.setTimeout(15000);
    injectILState(page, FAKE_COLORIZED_STATE);
    mockGeminiColorize(page);

    const geminiCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/gemini')) {
        try { geminiCalls.push(r.postDataJSON()); } catch { geminiCalls.push(null); }
      }
    });

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible({ timeout: 5000 });

    // Set instruction
    await page.getByPlaceholder(/warm earthy tones/i).fill('warm sepia tones');

    // Click the per-item "Click to colorize" for the idle item (col2)
    await page.getByText('Click to colorize').click();

    // Wait for API call
    await page.waitForTimeout(2000);

    // Gemini called with mode=colorize
    expect(geminiCalls.some((c) => c?.mode === 'colorize')).toBe(true);
    // The prompt should include the instruction
    const colorizeCall = geminiCalls.find((c) => c?.mode === 'colorize');
    expect(colorizeCall?.prompt ?? '').toMatch(/warm sepia tones/i);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-05: Stage 1 → Stage 2 — confirm approved items advances to prompts
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-05: Confirm approved colorized items → Stage 2 prompts', async ({ page }) => {
    injectILState(page, FAKE_COLORIZED_STATE);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible({ timeout: 5000 });

    // "Continue with N Colorized Images" button is visible (col1 is done+approved)
    const confirmBtn = page.getByRole('button', { name: /Continue with/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Now on Stage 2
    await expect(page.getByRole('heading', { name: /Review Animation Prompts/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder(/Describe the action/i)).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-06: Stage 2 — prompt textarea is editable, regenerate calls Gemini vision
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-06: Stage 2 — edit prompt + regenerate calls Gemini vision', async ({ page }) => {
    test.setTimeout(20000);
    injectILState(page, FAKE_PROMPTS_STATE);
    mockGeminiColorize(page); // also handles mode=vision

    const geminiCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/gemini')) {
        try { geminiCalls.push(r.postDataJSON()); } catch { geminiCalls.push(null); }
      }
    });

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Review Animation Prompts/i })).toBeVisible({ timeout: 5000 });

    // Prompt textarea is editable
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toBeVisible();
    await promptTextarea.fill('Colors dance and shimmer as the illustration awakens');
    await expect(promptTextarea).toHaveValue('Colors dance and shimmer as the illustration awakens');

    // Regenerate prompt button
    await page.getByRole('button', { name: /Generate/i }).click();

    // Wait for regenerated text
    await expect(page.locator('textarea').first()).toContainText('watercolor', { timeout: 10000 });

    // Gemini was called with mode=vision
    expect(geminiCalls.some((c) => c?.mode === 'vision')).toBe(true);

    await page.screenshot({ path: 'test-results/IL-06-regenerated-prompt.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-07: Stage 2 — approve toggle + confirm to Stage 3
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-07: Stage 2 — approve toggle works, confirm advances to Stage 3', async ({ page }) => {
    injectILState(page, FAKE_PROMPTS_STATE);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Review Animation Prompts/i })).toBeVisible({ timeout: 5000 });

    // Item starts approved — "Animate N Images" button should be visible
    const confirmBtn = page.getByRole('button', { name: /Animate/i }).first();
    await expect(confirmBtn).toBeVisible();

    // Toggle to unapprove
    await page.getByRole('button', { name: /Approved/i }).click();
    // Now unapproved → confirm button should disappear (0 approved)
    await expect(page.getByRole('button', { name: /Animate/i })).not.toBeVisible({ timeout: 3000 });

    // Re-approve
    await page.getByRole('button', { name: /Approve/i }).click();
    // Confirm button reappears
    await expect(page.getByRole('button', { name: /Animate/i })).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();

    // Now on Stage 3
    await expect(page.getByRole('heading', { name: /Animate Illustrations/i })).toBeVisible({ timeout: 5000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-08: Stage 3 — video prompt is editable, generate calls WaveSpeed with LoRA
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-08: Stage 3 — video prompt editable, generate calls WaveSpeed with LoRA params', async ({ page }) => {
    test.setTimeout(30000);
    injectILState(page, FAKE_VIDEOS_STATE);
    mockWaveSpeed(page);

    const waveSpeedCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/wavespeed') && r.method() === 'POST') {
        try { waveSpeedCalls.push(r.postDataJSON()); } catch { waveSpeedCalls.push(null); }
      }
    });

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Illustrations/i })).toBeVisible({ timeout: 5000 });

    // Prompt textarea is visible and editable
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toBeVisible();

    await promptTextarea.fill('Custom animated illustration prompt for testing LoRA');

    // Generate video
    await page.getByRole('button', { name: /Generate Video/i }).click();

    // Wait for WaveSpeed call
    await page.waitForTimeout(3000);

    expect(waveSpeedCalls.length).toBeGreaterThan(0);
    const call = waveSpeedCalls[0];

    // Model should be WAN-2.2 LoRA
    expect(call?.model).toMatch(/wan-2\.2.*lora/i);

    // Input should contain LoRA params (sent as arrays)
    const input = call?.input ?? {};
    expect(Array.isArray(input.high_noise_loras) && input.high_noise_loras.length > 0).toBe(true);
    expect(Array.isArray(input.low_noise_loras) && input.low_noise_loras.length > 0).toBe(true);
    expect(input.high_noise_loras[0].scale).toBe(1.2);
    expect(input.low_noise_loras[0].scale).toBe(0.3);
    expect(input.prompt).toContain('Custom animated illustration prompt');
    expect(input.duration).toBe(5);
    expect(input.resolution).toBe('720p');

    await page.screenshot({ path: 'test-results/IL-08-wavespeed-call.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-09: Stage 3 — "Generate All Videos" button triggers all idle videos
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-09: Stage 3 — Generate All Videos calls WaveSpeed for each idle video', async ({ page }) => {
    test.setTimeout(20000);
    const stateMultipleVideos = {
      ...FAKE_VIDEOS_STATE,
      videos: [
        { ...FAKE_VIDEOS_STATE.videos[0] },
        {
          id: 'vid2',
          promptId: 'prm1',
          imageBase64: TINY_JPEG_B64,
          mimeType: 'image/jpeg',
          prompt: 'Second animation prompt',
          videoUrl: null,
          status: 'idle',
        },
      ],
    };
    injectILState(page, stateMultipleVideos);
    mockWaveSpeed(page);

    const waveSpeedCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/studio/wavespeed') && r.method() === 'POST') waveSpeedCalls.push(1);
    });

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Illustrations/i })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Generate All/i }).click();
    await page.waitForTimeout(3000);

    // Should have called WaveSpeed twice (once per video)
    expect(waveSpeedCalls.length).toBeGreaterThanOrEqual(2);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-10: Stage 3 — WaveSpeed completes → "All N videos generated" shown
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-10: Stage 3 — video completion shows success banner', async ({ page }) => {
    test.setTimeout(30000);
    injectILState(page, FAKE_VIDEOS_STATE);
    mockWaveSpeed(page);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Illustrations/i })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Generate Video/i }).click();

    await expect(page.getByText(/video.*generated successfully/i)).toBeVisible({ timeout: 20000 });

    await page.screenshot({ path: 'test-results/IL-10-video-done.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-11: Back navigation — Stage 3 → 2 → 1
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-11: Back navigation goes videos → prompts → colorize', async ({ page }) => {
    injectILState(page, FAKE_VIDEOS_STATE);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Animate Illustrations/i })).toBeVisible({ timeout: 5000 });

    // Back to prompts
    await page.getByRole('button', { name: /Back to Prompts/i }).click();
    await expect(page.getByRole('heading', { name: /Review Animation Prompts/i })).toBeVisible({ timeout: 5000 });

    // Back to colorize
    await page.getByRole('button', { name: /Back to Colorize/i }).click();
    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/IL-11-back-to-colorize.png' });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-12: Stage 1 — remove item removes it from the list
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-12: Stage 1 — removing an item hides it from the list', async ({ page }) => {
    injectILState(page, FAKE_COLORIZED_STATE);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible({ timeout: 5000 });

    // Two items visible (they render as image cards)
    const cards = page.locator('[class*="rounded-xl"][class*="border"]').filter({ hasText: 'Original' });
    await expect(cards).toHaveCount(2, { timeout: 5000 });

    // Remove the first item
    await page.getByRole('button', { name: /Remove/i }).first().click();

    // Now only one remains
    await expect(cards).toHaveCount(1, { timeout: 5000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-13: Stage 1 — approve/unapprove toggle affects confirm button count
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-13: Stage 1 — approve toggle updates "Generate Prompts for N" count', async ({ page }) => {
    injectILState(page, FAKE_COLORIZED_STATE);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Upload & Colorize Sketches/i })).toBeVisible({ timeout: 5000 });

    // col1 is done+approved → "Continue with 1 Colorized Image"
    await expect(page.getByRole('button', { name: /Continue with 1 Colorized Image/i })).toBeVisible({ timeout: 5000 });

    // Unapprove col1
    const approveBtn = page.getByRole('button', { name: /Approved/i }).first();
    await approveBtn.click();

    // Button should disappear (0 approved done)
    await expect(page.getByRole('button', { name: /Continue with/i })).not.toBeVisible({ timeout: 3000 });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // IL-14: Stage 2 — Regenerate Prompt uses Gemini vision and updates textarea
  // ────────────────────────────────────────────────────────────────────────────
  test('IL-14: Stage 2 — regenerating prompt replaces textarea content', async ({ page }) => {
    test.setTimeout(20000);
    injectILState(page, FAKE_PROMPTS_STATE);
    mockGeminiColorize(page);

    await page.goto('/studio/illustrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Review Animation Prompts/i })).toBeVisible({ timeout: 5000 });

    const before = await page.locator('textarea').first().inputValue();

    await page.getByRole('button', { name: /Generate/i }).click();
    await page.waitForTimeout(3000);

    const after = await page.locator('textarea').first().inputValue();
    // The mock returns a different text than the seeded prompt
    expect(after).not.toBe(before);
    expect(after).toContain('watercolor');
  });

});
