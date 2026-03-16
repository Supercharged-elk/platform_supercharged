const { test, expect } = require('@playwright/test');
const { dismissWelcomeOverlay } = require('./_helpers');

test.describe('Canvas Shell', () => {
  test('loads canvas shell and toolbar', async ({ page }) => {
    await page.goto('/canvas', { waitUntil: 'networkidle' });
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
    await page.goto('/canvas', { waitUntil: 'networkidle' });
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();

    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(3);
    await expect(page.locator('.react-flow__node:has-text("Generate")')).toBeVisible();
    await expect(page.locator('.react-flow__node:has-text("Output")')).toBeVisible();
  });
});
