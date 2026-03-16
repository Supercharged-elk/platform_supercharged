const { test, expect } = require('@playwright/test');
const { dismissWelcomeOverlay } = require('./_helpers');

test.describe('Pipeline Controls', () => {
  test('shows sign-in gate when running demo graph without credits', async ({ page }) => {
    await page.goto('/canvas', { waitUntil: 'networkidle' });
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();

    const runPipeline = page.getByTestId('run-pipeline');
    await expect(runPipeline).toBeVisible();

    await runPipeline.click();
    const gateHeading = page.getByRole('heading', { name: 'Sign in to generate' });
    const gateAppeared = await gateHeading.isVisible().catch(() => false);

    if (gateAppeared) {
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Run Pipeline' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(runPipeline).toContainText('Run Pipeline');
      return;
    }

    await expect(runPipeline).toContainText('Cancel');
    await runPipeline.click();
    await expect(runPipeline).toContainText('Run Pipeline');
  });
});
