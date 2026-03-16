const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000/canvas', { waitUntil: 'networkidle', timeout: 30000 });

    await page.getByRole('button', { name: 'Multi-Ref' }).click();
    await page.waitForTimeout(700);

    const canvasNodes = page.locator('.react-flow__node');
    const nodeCount = await canvasNodes.count();
    if (nodeCount < 4) {
      throw new Error(`Multi-Ref template did not load correctly. Nodes detected: ${nodeCount}`);
    }

    const pipelineButton = page.getByTestId('run-pipeline');
    await pipelineButton.click();
    await page.waitForTimeout(1200);

    const runningLabel = await pipelineButton.textContent();
    if (!runningLabel) {
      throw new Error('Run Pipeline button label not found after click');
    }

    // If the run is actually in progress, validate cancel->idle flow.
    if (runningLabel.toLowerCase().includes('cancel')) {
      await pipelineButton.click();
      await page.waitForTimeout(700);
      const idleLabel = await pipelineButton.textContent();
      if (!idleLabel || !idleLabel.toLowerCase().includes('run pipeline')) {
        throw new Error('Run Pipeline did not return to idle state after cancel');
      }
    }

    console.log('✅ E2E demo pipeline checks passed');
  } catch (error) {
    console.error('❌ E2E demo pipeline checks failed:', error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
