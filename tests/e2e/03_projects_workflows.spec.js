/**
 * Projects and Workflows — UI tests with mocked API routes.
 * All calls to /api/canvas/* are intercepted via page.route().
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
  page.route('**/api/canvas/workflows**', (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-wf-001', name: 'QA Workflow',
          graph_json: { nodes: [], edges: [] } }) });
    }
    if (method === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-wf-001', name: 'QA Workflow' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ workflows: [] }) });
  });
  page.route('**/api/canvas/projects**', (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-proj-001', name: 'QA Project' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projects: [] }) });
  });
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

test.describe('Projects and Workflows', () => {
  test('project/workflow controls are usable and workflows page loads', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);

    // Workflow name input is visible in header
    const wfInput = page.locator('header input[type="text"]').first();
    await expect(wfInput).toBeVisible();

    // Save button is present
    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeVisible();

    // Click save — workflow POST is mocked, URL should update with workflow id
    await saveButton.click();
    await page.waitForTimeout(1500);

    // URL should now have ?workflow= after save
    const url = page.url();
    expect(url).toContain('workflow=');

    // My Workflows link is present
    await expect(page.getByRole('link', { name: 'My Workflows' })).toBeVisible();
  });

  test('workflows page loads and shows heading', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    // /workflows page renders independently — just navigate and check heading
    await page.goto('/workflows', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const url = page.url();
    expect(url).toContain('/workflows');

    await expect(page.getByRole('heading', { name: 'My Workflows' })).toBeVisible({ timeout: 10000 });
  });

  test('workflow name input accepts text changes', async ({ page }) => {
    await setE2EBypass(page);
    mockCanvasAPI(page);
    await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 15000 });
    await dismissWelcomeOverlay(page);

    const wfInput = page.locator('header input[type="text"]').first();
    await wfInput.click();
    await wfInput.fill('My Custom Workflow');
    await page.waitForTimeout(200);

    const value = await wfInput.inputValue();
    expect(value).toBe('My Custom Workflow');
  });
});
