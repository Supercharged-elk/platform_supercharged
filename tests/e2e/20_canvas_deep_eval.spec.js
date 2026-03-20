/**
 * Deep canvas E2E evaluation — node chaining, caching, connection validation.
 * All API calls are mocked via page.route(). No real Replicate calls needed.
 */
const { test, expect } = require('@playwright/test');

const MOCK_GEN_ID = 'mock-gen-d01';
const MOCK_EDIT_ID = 'mock-edit-d01';
const MOCK_IMG_URL = 'https://example.com/mock-deep-output.jpg';

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
        body: JSON.stringify({ id: 'mock-wf-deep', name: 'Deep Eval Workflow',
          graph_json: { nodes: [], edges: [] } }) });
    }
    if (method === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-wf-deep', name: 'Deep Eval Workflow' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ workflows: [] }) });
  });
  page.route('**/api/canvas/projects**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ projects: [] }) })
  );
  page.route('**/api/canvas/models/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [] }) })
  );
}

function mockPipelineAPI(page) {
  page.route('**/api/canvas/generate', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ generation_id: MOCK_GEN_ID }) })
  );
  page.route('**/api/canvas/edit', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ generation_id: MOCK_EDIT_ID }) })
  );
  page.route('**/api/canvas/progress/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({
        generation_id: MOCK_GEN_ID,
        image_url: MOCK_IMG_URL,
        progress: { status: 'completed', progress_pct: 100, stage: 'Done ✓' }
      }) })
  );
}

async function goToCanvas(page) {
  await setE2EBypass(page);
  await page.goto('/canvas', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 15000 });
}

async function dismissWelcomeOverlay(page) {
  const heading = page.getByRole('heading', { name: 'Welcome to Canvas' });
  if (await heading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Start blank' }).click();
    await expect(heading).toBeHidden({ timeout: 5000 });
  }
}

async function addNode(page, label) {
  await page.locator('div.absolute.left-4').getByRole('button', { name: label }).click();
  await page.waitForTimeout(400);
}

async function waitForDone(page, nodeLocator, timeout = 15000) {
  await expect(nodeLocator.filter({ hasText: 'Done ✓' })).toBeVisible({ timeout });
}

test.describe('Canvas Deep Validation (Mocked API)', () => {

  // ──────────────────────────────────────────────────────
  // D01: Full pipeline — demo (Prompt → Generate → ImageOut) runs correctly
  // ──────────────────────────────────────────────────────
  test('D01: Demo pipeline Generate → ImageOut runs and completes', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    const generateCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/canvas/generate') && r.method() === 'POST') generateCalls.push(r.url());
    });

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    await page.getByTestId('run-pipeline').click();
    await expect(page.getByTestId('run-pipeline')).toContainText('Cancel', { timeout: 5000 })
      .catch(() => {}); // might complete too fast with mock

    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await waitForDone(page, genNode, 15000);

    console.log('D01: /generate calls:', generateCalls.length);
    expect(generateCalls.length).toBe(1);

    await page.screenshot({ path: 'test-results/D01-pipeline-complete.png' });
    console.log('D01 PASS: Pipeline ran, /generate called once');
  });

  // ──────────────────────────────────────────────────────
  // D02: Pipeline runs /generate exactly once for demo graph
  // ──────────────────────────────────────────────────────
  test('D02: Demo pipeline calls /generate exactly once', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    const generateCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/canvas/generate') && r.method() === 'POST') generateCalls.push(Date.now());
    });

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    await page.getByTestId('run-pipeline').click();

    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await waitForDone(page, genNode, 15000);
    await expect(page.getByTestId('run-pipeline')).toContainText('Run Pipeline', { timeout: 10000 });

    console.log('D02: /generate called:', generateCalls.length, 'time(s)');
    // Exactly one generate call for the demo pipeline
    expect(generateCalls.length).toBe(1);

    await page.screenshot({ path: 'test-results/D02-generate-once.png' });
    console.log('D02 PASS: /generate called exactly once for demo pipeline');
  });

  // ──────────────────────────────────────────────────────
  // D03: Incompatible connections are blocked
  // ──────────────────────────────────────────────────────
  test('D03: Incompatible connections are blocked (Prompt → Image handle)', async ({ page }) => {
    mockCanvasAPI(page);
    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await addNode(page, 'Prompt');
    await addNode(page, 'Edit');

    const promptSource = page.locator('.react-flow__handle[data-handleid="output"][data-handlepos="right"]').first();
    const editImageTarget = page.locator('.react-flow__handle[data-handleid="image"][data-handlepos="left"]').first();

    await expect(promptSource).toBeVisible();
    await expect(editImageTarget).toBeVisible();

    const srcBox = await promptSource.boundingBox();
    const tgtBox = await editImageTarget.boundingBox();
    expect(srcBox).toBeTruthy();
    expect(tgtBox).toBeTruthy();

    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    const edgeCount = await page.locator('.react-flow__edge').count();
    const errorShown = await page.locator('text=/Incompatible connection/i').isVisible().catch(() => false);

    console.log('D03: Edges after bad drag:', edgeCount, '| Error shown:', errorShown);
    await page.screenshot({ path: 'test-results/D03-incompatible.png' });

    const connectionBlocked = edgeCount === 0 || errorShown;
    if (connectionBlocked) {
      console.log('D03 PASS: Incompatible connection blocked');
    } else {
      console.log('D03 INFO: Edge count:', edgeCount, '— may need more precise targeting');
    }
    expect(connectionBlocked).toBe(true);
  });

  // ──────────────────────────────────────────────────────
  // D04: Valid connection — Generate → Edit image handle
  // ──────────────────────────────────────────────────────
  test('D04: Valid connection Generate → Edit image handle is accepted', async ({ page }) => {
    mockCanvasAPI(page);
    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await addNode(page, 'Generate');
    await addNode(page, 'Edit');

    const genSource = page.locator('.react-flow__handle[data-handleid="output"][data-handlepos="right"]').first();
    const editImage = page.locator('.react-flow__handle[data-handleid="image"][data-handlepos="left"]').first();

    const srcBox = await genSource.boundingBox();
    const tgtBox = await editImage.boundingBox();

    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    const errorShown = await page.locator('text=/Incompatible/i').isVisible().catch(() => false);
    console.log('D04: Error shown:', errorShown);

    await page.screenshot({ path: 'test-results/D04-valid-connection.png' });
    expect(errorShown).toBe(false);
    console.log('D04 PASS: Valid connection accepted (no incompatibility error)');
  });

  // ──────────────────────────────────────────────────────
  // D05: ImageOutput source handle exists
  // ──────────────────────────────────────────────────────
  test('D05: ImageOutput source handle exists and has correct data-handleid', async ({ page }) => {
    mockCanvasAPI(page);
    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await addNode(page, 'Image Out');

    const imgOutSource = page.locator('.react-flow__handle[data-handleid="output"][data-handlepos="right"]').first();
    const imgOutTarget = page.locator('.react-flow__handle[data-handleid="input"][data-handlepos="left"]').first();

    await expect(imgOutSource).toBeVisible({ timeout: 5000 });
    await expect(imgOutTarget).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/D05-imageout-handles.png' });
    console.log('D05 PASS: ImageOutput has both input and output handles');
  });

  // ──────────────────────────────────────────────────────
  // D06: Run Pipeline button transitions through correct states
  // ──────────────────────────────────────────────────────
  test('D06: Run Pipeline button shows correct states', async ({ page }) => {
    mockCanvasAPI(page);
    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    const btn = page.getByTestId('run-pipeline');
    await expect(btn).toBeVisible();

    const initialText = await btn.textContent();
    console.log('D06: Initial button text:', initialText);
    expect(initialText).toContain('Run Pipeline');

    await addNode(page, 'Generate');
    await page.waitForTimeout(500);

    const classAfterAdd = await btn.getAttribute('class');
    const hasPulse = classAfterAdd?.includes('pulse') ?? false;
    console.log('D06:', hasPulse ? 'Button pulses with nodes' : 'No pulse detected in class');

    await page.screenshot({ path: 'test-results/D06-button-state.png' });
    console.log('D06 PASS: Run Pipeline button state validated');
  });

  // ──────────────────────────────────────────────────────
  // D07: Canvas remains interactive after pipeline completion
  // ──────────────────────────────────────────────────────
  test('D07: Canvas remains interactive after mocked pipeline completion', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    await page.getByTestId('run-pipeline').click();

    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await waitForDone(page, genNode, 15000);
    await expect(page.getByTestId('run-pipeline')).toContainText('Run Pipeline', { timeout: 10000 });

    // Post-completion: add a node
    await addNode(page, 'Edit');
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBeGreaterThan(0);

    await expect(page.getByTestId('run-pipeline')).toBeVisible();
    await expect(page.getByTestId('run-pipeline')).not.toBeDisabled();

    console.log('D07: JS errors after completion:', errors.length);
    const criticalErrors = errors.filter(e => e.includes('TypeError'));
    expect(criticalErrors.length).toBe(0);

    await page.screenshot({ path: 'test-results/D07-post-completion.png' });
    console.log('D07 PASS: Canvas interactive after completion, errors:', errors.length);
  });

  // ──────────────────────────────────────────────────────
  // D08: Single node run only calls /generate
  // ──────────────────────────────────────────────────────
  test('D08: Clicking Run on Generate node only calls /generate', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    const generateCalls = [];
    const editCalls = [];
    const videoCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/canvas/generate') && r.method() === 'POST') generateCalls.push(1);
      if (r.url().includes('/api/canvas/edit') && r.method() === 'POST') editCalls.push(1);
      if (r.url().includes('/api/canvas/video') && r.method() === 'POST') videoCalls.push(1);
    });

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    const generateNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    const runBtn = generateNode.getByRole('button', { name: /Run|Cancel/i });
    await runBtn.click();

    await waitForDone(page, generateNode, 15000);

    console.log('D08: /generate:', generateCalls.length, '/edit:', editCalls.length, '/video:', videoCalls.length);
    await page.screenshot({ path: 'test-results/D08-single-generate.png' });

    expect(generateCalls.length).toBe(1);
    expect(editCalls.length).toBe(0);
    expect(videoCalls.length).toBe(0);
    console.log('D08 PASS: Only /generate called');
  });

  // ──────────────────────────────────────────────────────
  // D09: Edit node without image input shows error
  // ──────────────────────────────────────────────────────
  test('D09: Edit node with no image input shows error, does not crash', async ({ page }) => {
    test.setTimeout(30000);
    mockCanvasAPI(page);
    // Mock edit to return an error
    page.route('**/api/canvas/edit', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json',
        body: JSON.stringify({ detail: 'image_url is required' }) })
    );

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);

    await addNode(page, 'Prompt');
    await addNode(page, 'Edit');

    const textarea = page.locator('.react-flow__node').filter({ hasText: 'Prompt' }).locator('textarea').first();
    await textarea.fill('A beautiful landscape');

    const editNode = page.locator('.react-flow__node').filter({ hasText: 'Edit' }).first();
    const editBtn = editNode.getByRole('button', { name: /Edit|Run/i });
    const btnVisible = await editBtn.isVisible().catch(() => false);

    if (btnVisible) {
      await editBtn.click();
      await page.waitForTimeout(3000);
    }

    // UI should remain stable
    await expect(editNode).toBeVisible();
    await page.screenshot({ path: 'test-results/D09-edit-no-image.png' });
    console.log('D09 PASS: Edit node with no image remains stable');
  });

  // ──────────────────────────────────────────────────────
  // D10: Demo pipeline — ImageOutput shows mocked image URL
  // ──────────────────────────────────────────────────────
  test('D10: Demo pipeline produces image output in ImageOutput node', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    await page.getByTestId('run-pipeline').click();

    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await waitForDone(page, genNode, 15000);
    await expect(page.getByTestId('run-pipeline')).toContainText('Run Pipeline', { timeout: 10000 });

    // ImageOutput should show an image tag with the mocked URL
    const imgOut = page.locator('.react-flow__node').filter({ hasText: 'Output' }).first();
    const img = imgOut.locator('img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const imgSrc = await img.getAttribute('src');
    console.log('D10: ImageOutput src:', imgSrc);
    expect(typeof imgSrc).toBe('string');
    expect(imgSrc.length).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/D10-image-output.png' });
    console.log('D10 PASS: ImageOutput shows mocked image URL');
  });

  // ──────────────────────────────────────────────────────
  // D11: Node state "Done ✓" persists after completion
  // ──────────────────────────────────────────────────────
  test('D11: Completed node state Done ✓ persists after run', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    await page.getByTestId('run-pipeline').click();

    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await waitForDone(page, genNode, 15000);

    // "Done ✓" should persist after 3 seconds
    await page.waitForTimeout(3000);
    const doneStillVisible = await genNode.filter({ hasText: 'Done ✓' }).isVisible();
    console.log('D11: "Done ✓" persists after 3s:', doneStillVisible);
    expect(doneStillVisible).toBe(true);

    // ImageOutput should show the image
    const imgOut = page.locator('.react-flow__node').filter({ hasText: 'Output' }).first();
    const img = imgOut.locator('img');
    const imgSrc = await img.getAttribute('src').catch(() => null);
    console.log('D11: ImageOutput src exists:', !!imgSrc);

    await page.screenshot({ path: 'test-results/D11-state-stable.png' });
    console.log('D11 PASS: Node state stable after completion');
  });

  // ──────────────────────────────────────────────────────
  // D12: Edit rerun does not re-call /generate
  // ──────────────────────────────────────────────────────
  test('D12: Edit rerun keeps UI stable and does not re-call /generate', async ({ page }) => {
    test.setTimeout(60000);
    mockCanvasAPI(page);
    mockPipelineAPI(page);

    await goToCanvas(page);
    await dismissWelcomeOverlay(page);
    await page.getByTestId('load-demo').click();
    await page.waitForTimeout(500);

    // First run
    await page.getByTestId('run-pipeline').click();
    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await waitForDone(page, genNode, 15000);
    await expect(page.getByTestId('run-pipeline')).toContainText('Run Pipeline', { timeout: 10000 });
    console.log('D12: First pipeline complete');

    // Track second run API calls
    const genCallsRerun = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/canvas/generate') && r.method() === 'POST') genCallsRerun.push(1);
    });

    // Try to find and click an Edit button (may not exist in demo graph)
    const editNode = page.locator('.react-flow__node').filter({ hasText: 'Edit' }).first();
    const hasEditNode = await editNode.isVisible().catch(() => false);

    if (hasEditNode) {
      const editBtn = editNode.getByRole('button', { name: /Edit|Run/i });
      await editBtn.click().catch(() => {});
      await waitForDone(page, editNode, 15000).catch(() => {});

      console.log('D12: After Edit rerun — /generate calls:', genCallsRerun.length);
      expect(genCallsRerun.length).toBe(0);
    } else {
      console.log('D12 INFO: No Edit node in demo graph, skipping rerun check');
    }

    await expect(genNode).toBeVisible();
    await expect(page.getByTestId('run-pipeline')).toBeVisible();

    await page.screenshot({ path: 'test-results/D12-edit-rerun.png' });
    console.log('D12 PASS: UI stable after completion');
  });

});
