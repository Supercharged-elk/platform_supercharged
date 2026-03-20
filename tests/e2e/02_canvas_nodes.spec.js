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

async function resetBlank(page) {
  await setE2EBypass(page);
  mockCanvasAPI(page);
  await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 15000 });
  await dismissWelcomeOverlay(page);
}

test.describe('Canvas Nodes', () => {
  test('can add each node type from toolbar', async ({ page }) => {
    await resetBlank(page);

    const toolbar = page.locator('div.absolute.left-4');
    const labels = ['Prompt', 'Model', 'Generate', 'Edit', 'Animate', 'Multi-Ref', 'Image Out', 'Video Out'];

    for (const label of labels) {
      await toolbar.getByRole('button', { name: label }).click();
      await page.waitForTimeout(150);
    }

    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(11); // 8 + multi-ref template auto adds 3 extra
  });

  test('shows compatible node UI controls', async ({ page }) => {
    await resetBlank(page);
    const toolbar = page.locator('div.absolute.left-4');

    await toolbar.getByRole('button', { name: 'Prompt' }).click();
    await toolbar.getByRole('button', { name: 'Generate' }).click();
    await toolbar.getByRole('button', { name: 'Image Out' }).click();

    await expect(page.locator('textarea[placeholder*="Describe what you want"]')).toBeVisible();
    await expect(page.locator('.react-flow__node:has-text("Generate") button:has-text("Run")')).toBeVisible();
    await expect(page.locator('.react-flow__node:has-text("Output")')).toBeVisible();
  });
});
