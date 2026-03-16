const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', req => {
    networkErrors.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`);
  });

  console.log('\n=== 1. INITIAL LOAD ===');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  console.log('URL after redirect:', page.url());

  await page.waitForTimeout(3000);
  console.log('Final URL:', page.url());

  // Check auth
  const cookies = await context.cookies();
  const sbCookie = cookies.find(c => c.name.includes('auth-token'));
  let token = null;
  if (sbCookie) {
    try {
      const raw = sbCookie.value.replace('base64-', '');
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      token = parsed.access_token || (Array.isArray(parsed) ? parsed[0]?.access_token : null);
    } catch(e) {}
  }
  console.log('Supabase session:', sbCookie ? '✅ cookie found' : '❌ no cookie');
  console.log('JWT token:', token ? '✅ present' : '❌ missing');

  console.log('\n=== 2. CANVAS UI ELEMENTS ===');
  const canvasLoaded = await page.locator('.react-flow').isVisible().catch(() => false);
  console.log('React Flow canvas:', canvasLoaded ? '✅' : '❌');

  const toolbar = await page.locator('[class*="absolute left-4"]').isVisible().catch(() => false);
  console.log('Left toolbar:', toolbar ? '✅' : '❌');

  // Check toolbar buttons
  const toolbarBtns = await page.locator('[class*="absolute left-4"] button').count().catch(() => 0);
  console.log('Toolbar buttons count:', toolbarBtns);

  // Check header
  const header = await page.locator('header').isVisible().catch(() => false);
  console.log('Header:', header ? '✅' : '❌');

  const headerText = await page.locator('header').textContent().catch(() => '');
  console.log('Header content:', headerText?.substring(0, 100));

  // Project ID input in header
  const projectInput = await page.locator('input[placeholder*="roject"]').count().catch(() => 0);
  console.log('Project ID inputs:', projectInput);

  // Credits display
  const creditsEl = await page.locator('[class*="credit"], [data-testid*="credit"]').count().catch(() => 0);
  console.log('Credit elements:', creditsEl);

  console.log('\n=== 3. TOOLBAR NODE TYPES ===');
  const btnLabels = await page.locator('[class*="absolute left-4"] button span').allTextContents().catch(() => []);
  console.log('Node types in toolbar:', btnLabels);

  console.log('\n=== 4. ADD NODES - CLICK EACH TYPE ===');
  const nodeTypes = ['Prompt', 'Model', 'Generate', 'Edit', 'Animate', 'Multi-Ref', 'Image Out', 'Video Out'];
  for (const label of nodeTypes) {
    const btn = page.locator(`[class*="absolute left-4"] button:has-text("${label}")`);
    const exists = await btn.isVisible().catch(() => false);
    if (exists) {
      await btn.click();
      await page.waitForTimeout(200);
      console.log(`  Click "${label}": ✅`);
    } else {
      console.log(`  Click "${label}": ❌ not found`);
    }
  }

  await page.waitForTimeout(1000);

  console.log('\n=== 5. NODES RENDERED ===');
  const allNodes = await page.locator('.react-flow__node').count().catch(() => 0);
  console.log('Total nodes on canvas:', allNodes);

  // Check each node type
  const nodeSelectors = [
    ['PromptNode', '[class*="promptNode"], [data-id*="promptNode"]'],
    ['ModelSelectorNode', '[class*="modelSelectorNode"], [data-id*="modelSelectorNode"]'],
    ['GenerateNode', '[class*="generateNode"], [data-id*="generateNode"]'],
    ['MultiRefNode', '[class*="multiRefNode"], [data-id*="multiRefNode"]'],
    ['ImageOutputNode', '[class*="imageOutputNode"], [data-id*="imageOutputNode"]'],
  ];

  for (const [name, sel] of nodeSelectors) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (count === 0) {
      // Try by data-testid or aria
      const count2 = await page.locator(`.react-flow__node`).count();
      console.log(`  ${name}: nodes found via data-id approach... total nodes: ${count2}`);
    } else {
      console.log(`  ${name}: ${count} ✅`);
    }
  }

  // Check node content
  const nodeContents = await page.locator('.react-flow__node').allTextContents().catch(() => []);
  for (const content of nodeContents.slice(0, 10)) {
    console.log(`  Node content: "${content.substring(0, 60)}"`);
  }

  console.log('\n=== 6. PROMPT NODE INTERACTION ===');
  const promptTextarea = await page.locator('textarea[placeholder*="Prompt"], textarea[placeholder*="prompt"]').first();
  const promptVisible = await promptTextarea.isVisible().catch(() => false);
  if (promptVisible) {
    await promptTextarea.fill('a beautiful landscape');
    console.log('  Prompt textarea: ✅ - filled');
  } else {
    console.log('  Prompt textarea: ❌ not visible');
  }

  console.log('\n=== 7. MODEL SELECTOR NODE ===');
  const projectIdInput = await page.locator('input[placeholder="Project ID"]').first();
  const projVisible = await projectIdInput.isVisible().catch(() => false);
  console.log('  Project ID input:', projVisible ? '✅' : '❌');

  console.log('\n=== 8. CREDITS API CHECK ===');
  if (token) {
    const credRes = await page.request.get('http://localhost:8000/credits', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const credBody = await credRes.text();
    console.log('  Credits status:', credRes.status(), credBody.substring(0, 200));

    console.log('\n=== 9. GENERATE ENDPOINT (no credits seeded?) ===');
    const genRes = await page.request.post('http://localhost:8000/generate', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'test image' }
    });
    console.log('  Generate status:', genRes.status(), (await genRes.text()).substring(0, 200));

    console.log('\n=== 10. MODELS ENDPOINT ===');
    const modRes = await page.request.get('http://localhost:8000/models/test-project-123', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('  Models status:', modRes.status(), (await modRes.text()).substring(0, 200));
  } else {
    console.log('  Skipped (no token)');
  }

  console.log('\n=== 11. CONSOLE ERRORS ===');
  if (errors.length === 0) console.log('  No JS errors ✅');
  else errors.forEach(e => console.log('  ❌', e.substring(0, 150)));

  console.log('\n=== 12. NETWORK ERRORS ===');
  if (networkErrors.length === 0) console.log('  No network errors ✅');
  else networkErrors.forEach(e => console.log('  ❌', e.substring(0, 150)));

  console.log('\n=== 13. SCREENSHOT ===');
  await page.screenshot({ path: '/tmp/canvas_analysis.png', fullPage: false });
  console.log('  Screenshot saved to /tmp/canvas_analysis.png');

  await browser.close();
})();
