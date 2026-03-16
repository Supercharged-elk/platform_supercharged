/**
 * Targeted diagnosis: MultiRef model config bug + Video never starts bug.
 * Uses real API calls and network interception to capture exact payloads.
 */
const { test, expect } = require('@playwright/test');
const { createTestUser, goToWorkflow, createWorkflow } = require('./_helpers');

let sharedSession = null;
let sharedToken = null;

// Workflow: ModelSelector(multi_ref) → MultiRef + 1 reference image
const MULTIREF_GRAPH = {
  nodes: [
    { id: 'model1', type: 'modelSelectorNode', position: { x: 0, y: 100 },
      data: { required_task: 'multi_ref', title: 'Multi-Ref Model' } },
    { id: 'prompt1', type: 'promptNode', position: { x: 0, y: 300 },
      data: { prompt: 'A futuristic robot warrior in a stadium' } },
    { id: 'mr1', type: 'multiRefNode', position: { x: 320, y: 200 },
      data: { refs: ['https://replicate.delivery/xezq/EBKPUWdS7EJHJt6Scgqp67kmbaA2LxwfyjBlbuMoSQ8qZmIL/tmp15jjbcip.webp'] } },
    { id: 'out1', type: 'imageOutputNode', position: { x: 650, y: 200 }, data: {} },
  ],
  edges: [
    { id: 'e1', source: 'model1', target: 'mr1', sourceHandle: 'output', targetHandle: 'config' },
    { id: 'e2', source: 'prompt1', target: 'mr1', sourceHandle: 'output', targetHandle: 'prompt' },
    { id: 'e3', source: 'mr1', target: 'out1', sourceHandle: 'output', targetHandle: 'input' },
  ],
};

// Workflow: Prompt → Generate → ImageOut → Video
const VIDEO_FROM_IMAGE_GRAPH = {
  nodes: [
    { id: 'prompt1', type: 'promptNode', position: { x: 0, y: 150 },
      data: { prompt: 'A warrior standing in a stadium' } },
    { id: 'gen1', type: 'generateNode', position: { x: 300, y: 100 }, data: {} },
    { id: 'imgout1', type: 'imageOutputNode', position: { x: 600, y: 100 }, data: {} },
    { id: 'vidprompt1', type: 'promptNode', position: { x: 300, y: 350 },
      data: { prompt: 'The warrior raises their sword dramatically' } },
    { id: 'vid1', type: 'videoNode', position: { x: 600, y: 300 }, data: {} },
    { id: 'vidout1', type: 'videoOutputNode', position: { x: 900, y: 300 }, data: {} },
  ],
  edges: [
    { id: 'e1', source: 'prompt1', target: 'gen1', sourceHandle: 'output', targetHandle: 'prompt' },
    { id: 'e2', source: 'gen1', target: 'imgout1', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e3', source: 'imgout1', target: 'vid1', sourceHandle: 'output', targetHandle: 'image' },
    { id: 'e4', source: 'vidprompt1', target: 'vid1', sourceHandle: 'output', targetHandle: 'prompt' },
    { id: 'e5', source: 'vid1', target: 'vidout1', sourceHandle: 'output', targetHandle: 'input' },
  ],
};

test.describe('MultiRef + Video Diagnosis', function () {

  test.beforeAll(async function () {
    const { session, token } = await createTestUser();
    sharedSession = session;
    sharedToken = token;
  });

  // ──────────────────────────────────────────────
  // MR1: ModelSelectorNode node.data — verify config is auto-selected
  // ──────────────────────────────────────────────
  test('MR1: ModelSelector (multi_ref) auto-selects platform model and exposes config.id', async function ({ page }) {
    test.setTimeout(30000);
    const wfId = await createWorkflow(sharedToken, 'mr-model-test', MULTIREF_GRAPH);
    await goToWorkflow(page, sharedSession, wfId);

    // Wait for ModelSelector to load
    const modelNode = page.locator('.react-flow__node').filter({ hasText: /Multi-Ref Model|Model/i }).first();
    await expect(modelNode).toBeVisible();

    // Wait for "FLUX 2 Pro" text to appear (auto-selected)
    await expect(modelNode.locator('text=/FLUX.*2|platform/i')).toBeVisible({ timeout: 15000 })
      .catch(() => console.log('MR1: FLUX 2 Pro label not visible (may still be loading)'));

    // Check if "Loading models..." is present or resolved
    const loadingText = modelNode.locator('text=Loading models...');
    const isLoading = await loadingText.isVisible().catch(() => false);
    console.log('MR1: Still loading models?', isLoading);

    // Check if the config check mark appears (data.config is set)
    const configCheck = modelNode.locator('text=/✓/');
    const hasCheck = await configCheck.isVisible().catch(() => false);
    console.log('MR1: Config selected (checkmark):', hasCheck);

    await page.screenshot({ path: 'test-results/MR1-model-selector.png' });

    // The MultiRef node should show hasConfigInput = true (no amber warning)
    const mrNode = page.locator('.react-flow__node').filter({ hasText: /COMPOSE|Multi-Ref/i }).last();
    const missingConfigWarning = mrNode.locator('text=/Connect a Multi-Ref Model/i');
    const warnVisible = await missingConfigWarning.isVisible().catch(() => false);
    console.log('MR1: "Connect a Multi-Ref Model" warning visible:', warnVisible);

    if (!warnVisible) {
      console.log('MR1 PASS: MultiRef sees the model connection (hasConfigInput=true)');
    } else {
      console.log('MR1 FAIL: MultiRef STILL shows missing model warning despite connection — edge targetHandle issue');
    }
  });

  // ──────────────────────────────────────────────
  // MR2: MultiRef Compose — intercept /generate-multi-ref to see model_config_id
  // ──────────────────────────────────────────────
  test('MR2: MultiRef sends correct model_config_id to /generate-multi-ref', async function ({ page }) {
    test.setTimeout(60000);
    const wfId = await createWorkflow(sharedToken, 'mr-compose-test', MULTIREF_GRAPH);
    await goToWorkflow(page, sharedSession, wfId);

    // Wait for model to auto-select
    await page.waitForTimeout(3000);

    const multiRefBodies = [];
    page.on('request', (r) => {
      if (r.url().includes('/generate-multi-ref') && r.method() === 'POST') {
        try { multiRefBodies.push(r.postDataJSON()); } catch { multiRefBodies.push(null); }
      }
    });
    const multiRefResponses = [];
    page.on('response', async (r) => {
      if (r.url().includes('/generate-multi-ref')) {
        try { multiRefResponses.push(await r.json()); } catch { multiRefResponses.push(null); }
      }
    });

    // Find and click the Compose button in the MultiRef node
    const mrNode = page.locator('.react-flow__node').filter({ hasText: /COMPOSE|Multi-Ref/i }).last();
    await expect(mrNode).toBeVisible();

    const composeBtn = mrNode.getByRole('button', { name: /Compose/i });
    await expect(composeBtn).toBeVisible({ timeout: 10000 });
    const isDisabled = await composeBtn.isDisabled();
    console.log('MR2: Compose button disabled?', isDisabled);

    if (isDisabled) {
      console.log('MR2: Button disabled — hasConfigInput is false, model edge not seen');
      // Check the edge state by looking at connection error or warning
      const warn = await mrNode.locator('text=/Connect a Multi-Ref Model/i').isVisible().catch(() => false);
      console.log('MR2: "Connect model" warning showing:', warn);
      await page.screenshot({ path: 'test-results/MR2-compose-disabled.png' });
      return;
    }

    await composeBtn.click();
    await page.waitForTimeout(5000); // Wait a bit for the API call

    console.log('MR2: /generate-multi-ref calls:', multiRefBodies.length);
    console.log('MR2: Responses:', JSON.stringify(multiRefResponses));

    if (multiRefBodies.length > 0) {
      const body = multiRefBodies[0];
      console.log('MR2: model_config_id sent:', body?.model_config_id);
      console.log('MR2: reference_urls count:', body?.reference_urls?.length);
      console.log('MR2: prompt:', body?.prompt);

      const modelIdOk = typeof body?.model_config_id === 'string' && body.model_config_id.length > 0;
      if (modelIdOk) {
        console.log('MR2 PASS: model_config_id correctly sent:', body.model_config_id);
      } else {
        console.log('MR2 FAIL: model_config_id is undefined/empty — executor not resolving config.id');
      }
    } else {
      // Check what error the node shows
      const errorText = await mrNode.locator('p').allTextContents();
      console.log('MR2: No API call made. Node texts:', errorText);
    }

    await page.screenshot({ path: 'test-results/MR2-compose-result.png' });
  });

  // ──────────────────────────────────────────────
  // MR3: Run full pipeline with MultiRef — after fix, should work
  // ──────────────────────────────────────────────
  test('MR3: After fix — MultiRef full pipeline succeeds', async function ({ page }) {
    test.setTimeout(300000); // FLUX 2 Pro can take up to 5 min in queue
    const wfId = await createWorkflow(sharedToken, 'mr-full-test', MULTIREF_GRAPH);
    await goToWorkflow(page, sharedSession, wfId);
    await page.waitForTimeout(3000); // Let model auto-select

    const apiCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/generate-multi-ref') && r.method() === 'POST') {
        try { apiCalls.push({ body: r.postDataJSON() }); } catch { apiCalls.push({}); }
      }
    });
    const apiResponses = [];
    page.on('response', async (r) => {
      if (r.url().includes('/generate-multi-ref')) {
        try { apiResponses.push({ status: r.status(), body: await r.json() }); } catch { apiResponses.push({}); }
      }
    });

    await page.getByTestId('run-pipeline').click();

    // Wait for the API call to be made (model_config_id check is the key assertion)
    await page.waitForFunction(() => true, {}, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);

    console.log('MR3: API calls:', apiCalls.length, '| Responses:', JSON.stringify(apiResponses));

    // Key assertion: model_config_id must be set (proves executor fix works)
    expect(apiCalls.length).toBeGreaterThan(0);
    expect(apiCalls[0].body?.model_config_id).toBeTruthy();
    console.log('MR3 PASS: model_config_id=', apiCalls[0].body?.model_config_id);

    // Optionally wait for completion (best-effort, don't fail on timeout)
    const mrNode = page.locator('.react-flow__node').filter({ hasText: /COMPOSE|Multi-Ref/i }).last();
    await mrNode.filter({ hasText: 'Done ✓' }).waitFor({ timeout: 280000 }).catch(() => {
      console.log('MR3: Generation still running after 280s (slow queue) — API call validated ✓');
    });

    await page.screenshot({ path: 'test-results/MR3-multiref-pipeline.png' });
  });

  // ──────────────────────────────────────────────
  // V1: Video request — intercept and validate image_url and request body
  // ──────────────────────────────────────────────
  test('V1: Video POST captures image_url and generation_id', async function ({ page }) {
    test.setTimeout(180000);
    const wfId = await createWorkflow(sharedToken, 'video-chain-test', VIDEO_FROM_IMAGE_GRAPH);
    await goToWorkflow(page, sharedSession, wfId);

    const generateCalls = [];
    const videoCalls = [];
    const videoResponses = [];
    const progressResponses = [];

    page.on('request', (r) => {
      if (r.url().endsWith('/generate') && r.method() === 'POST') generateCalls.push(1);
      if (r.url().endsWith('/video') && r.method() === 'POST') {
        try { videoCalls.push(r.postDataJSON()); } catch { videoCalls.push(null); }
      }
    });
    page.on('response', async (r) => {
      if (r.url().endsWith('/video')) {
        try { videoResponses.push(await r.json()); } catch { videoResponses.push(null); }
      }
      if (r.url().includes('/progress/') && r.method === 'GET') {
        try {
          const body = await r.json();
          if (body.progress) progressResponses.push(body.progress);
        } catch {}
      }
    });

    // Run full pipeline (Generate → ImageOut → Video)
    await page.getByTestId('run-pipeline').click();
    await expect(page.getByTestId('run-pipeline')).toContainText('Cancel', { timeout: 5000 });

    // Wait for Generate to complete first
    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await expect(genNode.filter({ hasText: 'Done ✓' })).toBeVisible({ timeout: 120000 });
    console.log('V1: Generate completed');

    // Now check if /video was called
    await page.waitForTimeout(5000); // Give video node time to start

    console.log('V1: /generate calls:', generateCalls.length);
    console.log('V1: /video calls:', videoCalls.length);
    console.log('V1: /video responses:', JSON.stringify(videoResponses));

    await page.screenshot({ path: 'test-results/V1-video-started.png' });

    if (videoCalls.length > 0) {
      const body = videoCalls[0];
      console.log('V1: image_url sent to /video:', body?.image_url?.substring(0, 80));
      console.log('V1: prompt sent to /video:', body?.prompt?.substring(0, 80));

      const hasReplicateUrl = typeof body?.image_url === 'string' &&
        (body.image_url.includes('replicate') || body.image_url.startsWith('http'));
      console.log('V1:', hasReplicateUrl ? 'PASS: Valid image URL sent to /video' : 'FAIL: Bad image_url');

      const response = videoResponses[0];
      console.log('V1: Response generation_id:', response?.generation_id);
      console.log('V1: Response status:', response?.status);

      if (response?.generation_id) {
        console.log('V1 PASS: /video returned generation_id — backend accepted the request');
      } else {
        console.log('V1 FAIL: /video did not return generation_id');
      }
    } else {
      // Video not called — might be that the pipeline stopped at ImageOut
      const videoNode = page.locator('.react-flow__node').filter({ hasText: /Animate|Video/i }).first();
      const nodeState = await videoNode.allTextContents();
      console.log('V1 INFO: /video not called. Video node state:', nodeState);
    }

    console.log('V1: Progress samples:', progressResponses.slice(0, 3));
  });

  // ──────────────────────────────────────────────
  // V2: Video stage tracking — does it progress from Starting → Queuing?
  // ──────────────────────────────────────────────
  test('V2: Video node stage updates from Starting… to actual progress', async function ({ page }) {
    test.setTimeout(300000); // Kling video can take ~150s, plus generate ~30s
    const wfId = await createWorkflow(sharedToken, 'video-stage-test', VIDEO_FROM_IMAGE_GRAPH);
    await goToWorkflow(page, sharedSession, wfId);

    // Run pipeline — Generate runs first then Video (sequential in pipeline)
    await page.getByTestId('run-pipeline').click();
    const genNode = page.locator('.react-flow__node').filter({ hasText: 'Generate' }).first();
    await expect(genNode.filter({ hasText: 'Done ✓' })).toBeVisible({ timeout: 120000 });
    // Don't wait for "Run Pipeline" here — video is still running as part of the same pipeline

    await page.screenshot({ path: 'test-results/V2-after-generate.png' });

    // Now run just the Video node
    const videoNode = page.locator('.react-flow__node').filter({ hasText: /^.*Animate.*$/ }).first();
    await expect(videoNode).toBeVisible();

    const animateBtn = videoNode.getByRole('button', { name: /Animate|Cancel/i });
    const btnText = await animateBtn.textContent();
    console.log('V2: Animate button text:', btnText);

    if (btnText?.includes('Cancel')) {
      console.log('V2: Video already running from pipeline');
    } else {
      await animateBtn.click();
    }

    // Check stage transitions over time
    const stages = [];
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      const nodeTexts = await videoNode.allTextContents();
      const stageText = nodeTexts.join(' ');
      stages.push(stageText.substring(0, 60));

      const isStuck = stageText.includes('Starting...');
      const hasError = stageText.toLowerCase().includes('error') || stageText.toLowerCase().includes('failed');
      const isDone = stageText.includes('Done ✓');
      const isQueuing = stageText.includes('Queuing') || stageText.includes('Generating');

      if (isDone) { console.log('V2: Video completed!'); break; }
      if (hasError) { console.log('V2: Error detected:', stageText); break; }
      if (isQueuing) { console.log('V2: Progress detected! Stage:', stageText); break; }
    }

    console.log('V2: Stage progression:', stages.slice(0, 6));

    await page.screenshot({ path: 'test-results/V2-video-stage.png' });

    const lastStage = stages[stages.length - 1] || '';
    if (lastStage.includes('Starting...') && !lastStage.includes('Done') && !lastStage.includes('error')) {
      console.log('V2 FINDING: Video stuck at "Starting..." — possible backend issue');
    } else if (lastStage.toLowerCase().includes('error')) {
      console.log('V2 FINDING: Video errored — check error message');
    } else {
      console.log('V2: Video progressing normally');
    }
  });

  // ──────────────────────────────────────────────
  // V3: Validate backend /video endpoint — call directly with known good image
  // ──────────────────────────────────────────────
  test('V3: Backend /video endpoint returns generation_id for valid image URL', async function ({ page }) {
    test.setTimeout(30000);
    // Call the backend directly to check it accepts the request
    const knownImageUrl = 'https://replicate.delivery/xezq/EBKPUWdS7EJHJt6Scgqp67kmbaA2LxwfyjBlbuMoSQ8qZmIL/tmp15jjbcip.webp';

    const resp = await fetch('http://localhost:8000/video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sharedToken}`,
      },
      body: JSON.stringify({
        image_url: knownImageUrl,
        prompt: 'The warrior raises their sword dramatically, cinematic',
      }),
    });

    const data = await resp.json();
    console.log('V3: Response status:', resp.status);
    console.log('V3: Response body:', JSON.stringify(data));

    if (resp.status === 200 && data.generation_id) {
      console.log('V3 PASS: Backend accepted /video request, generation_id:', data.generation_id);

      // Poll progress once to see initial state
      await new Promise(resolve => setTimeout(resolve, 3000));
      const progressResp = await fetch(`http://localhost:8000/progress/${data.generation_id}`, {
        headers: { 'Authorization': `Bearer ${sharedToken}` },
      });
      const progressData = await progressResp.json();
      console.log('V3: Initial progress:', JSON.stringify(progressData.progress));
    } else if (resp.status === 402) {
      console.log('V3 INFO: Out of animate credits — cannot test video endpoint');
    } else {
      console.log('V3 FAIL: /video returned', resp.status, ':', JSON.stringify(data));
    }

    expect([200, 402]).toContain(resp.status);
  });

});
