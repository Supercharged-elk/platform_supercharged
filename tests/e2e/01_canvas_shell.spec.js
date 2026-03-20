/**
 * Canvas Shell — basic UI tests
 * All canvas API calls are mocked via page.route().
 */
const { test, expect } = require('@playwright/test');

async function setE2EBypass(page) {
  await page.context().addCookies([{
    name: 'e2e_auth_bypass', value: '1',
    domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
  }]);
}

function mockCanvasAPI(page) {
  page.route('**/api/canvas/credits', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ generate_credits: 10, edit_credits: 5, animate_credits: 2 }) })
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

test.describe('Canvas Shell', () => {

  test('loads canvas shell and toolbar', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);

    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('header').getByText('Canvas', { exact: true })).toBeVisible();
    await expect(page.getByTestId('run-pipeline')).toBeVisible();

    const toolbar = page.locator('div.absolute.left-4');
    await expect(toolbar).toBeVisible();

    for (const label of ['Prompt', 'Model', 'Generate', 'Edit', 'Animate', 'Multi-Ref', 'Image Out', 'Video Out']) {
      await expect(toolbar.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('loads the simple demo from header button', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();

    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.react-flow__node:has-text("Generate")')).toBeVisible();
    await expect(page.locator('.react-flow__node:has-text("Output")')).toBeVisible();
  });

});
