const { test, expect } = require('@playwright/test');
const { dismissWelcomeOverlay } = require('./_helpers');

test.describe('Projects and Workflows', () => {
  test('project/workflow controls are usable and workflows page loads', async ({ page }) => {
    await page.goto('/canvas', { waitUntil: 'networkidle' });
    await dismissWelcomeOverlay(page);

    const projectSelect = page.locator('select').first();
    await expect(projectSelect).toBeVisible();
    await projectSelect.selectOption('__new__');

    const projectName = `QA Project ${Date.now()}`;
    await page.locator('input[placeholder="Project name"]').fill(projectName);
    await page.getByRole('button', { name: 'Create' }).click();

    const workflowName = `QA Workflow ${Date.now()}`;
    const wfInput = page.locator('header input[type="text"]').first();
    await wfInput.fill(workflowName);

    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();
    await expect(page.getByRole('link', { name: 'My Workflows' })).toBeVisible();

    await page.goto('/workflows', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'My Workflows' })).toBeVisible();
  });
});
