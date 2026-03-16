const { test, expect } = require('@playwright/test');
const { dismissWelcomeOverlay } = require('./_helpers');

async function resetBlank(page) {
  await page.goto('/canvas', { waitUntil: 'networkidle' });
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
