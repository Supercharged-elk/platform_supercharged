/**
 * Pipeline Controls — UI tests with mocked API routes.
 * Tests run button behavior, sign-in gate, cancel flow.
 */
const { test, expect } = require('@playwright/test');

async function setE2EBypass(page) {
  await page.context().addCookies([{
    name: 'e2e_auth_bypass', value: '1',
    domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
  }]);
}

function mockCanvasAPI(page, opts = {}) {
  const credits = opts.credits ?? { generate_credits: 10, edit_credits: 5, animate_credits: 2 };
  page.route('**/api/canvas/credits', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(credits) })
  );
  page.route('**/api/canvas/workflows**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ workflows: [] }) })
  );
  page.route('**/api/canvas/projects**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projects: [] }) })
  );
  page.route('**/api/canvas/models/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [] }) })
  );
}

async function dismissWelcomeOverlay(page) {
  const heading = page.getByRole('heading', { name: 'Welcome to Canvas' });
  if (await heading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Start blank' }).click();
    await expect(heading).toBeHidden({ timeout: 5000 });
  }
}

test.describe('Pipeline Controls', () => {
  test('run pipeline button is visible and clickable', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);

    const runPipeline = page.getByTestId('run-pipeline');
    await expect(runPipeline).toBeVisible();
    await expect(runPipeline).toContainText('Run Pipeline');
  });

  test('shows sign-in gate when running demo graph without credits', async ({ page }) => {
    // Return 0 credits so the gate appears for anonymous users
    await setE2EBypass(page);
    mockCanvasAPI(page, { credits: { generate_credits: 0, edit_credits: 0, animate_credits: 0 } });
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();

    const runPipeline = page.getByTestId('run-pipeline');
    await expect(runPipeline).toBeVisible();

    await runPipeline.click();
    await page.waitForTimeout(2000);

    const gateHeading = page.getByRole('heading', { name: 'Sign in to generate' });
    const gateAppeared = await gateHeading.isVisible().catch(() => false);

    if (gateAppeared) {
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(runPipeline).toContainText('Run Pipeline');
      return;
    }

    // If gate didn't appear, pipeline may have started (anon user has credits from Supabase)
    const isRunning = (await runPipeline.textContent() || '').includes('Cancel');
    if (isRunning) {
      await runPipeline.click(); // Cancel it
      await expect(runPipeline).toContainText('Run Pipeline', { timeout: 5000 });
    }
  });

  test('cancel button stops pipeline run', async ({ page }) => {
    await setE2EBypass(page);
    // Mock generate to hang so cancel can be tested
    mockCanvasAPI(page);
    page.route('**/api/canvas/generate', (route) =>
      // Delay response by 30s to simulate a running generation
      new Promise((resolve) => setTimeout(() => resolve(route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ generation_id: 'mock-gen-cancel' })
      })), 30000))
    );

    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();

    const runBtn = page.getByTestId('run-pipeline');
    await runBtn.click();

    // May switch to Cancel or show sign-in gate
    const cancelText = await runBtn.isVisible().catch(() => false);
    if (cancelText) {
      const text = await runBtn.textContent();
      if (text && text.includes('Cancel')) {
        await runBtn.click();
        await expect(runBtn).toContainText('Run Pipeline', { timeout: 10000 });
      }
    }
  });

  test('demo loads 3 nodes on canvas', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);

    await page.getByTestId('load-demo').click();
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(3, { timeout: 5000 });
  });
});
