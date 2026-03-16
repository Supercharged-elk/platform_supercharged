const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('\n=== 1. LOAD CANVAS ===');
  await page.goto('http://localhost:3000/canvas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());

  console.log('\n=== 2. HEADER CONTENT ===');
  const headerText = await page.locator('header').textContent().catch(() => '');
  console.log('Header:', headerText?.trim());

  console.log('\n=== 3. GOOGLE BUTTON ===');
  const googleBtn = page.locator('button:has-text("Google"), button:has-text("Sign in with Google")');
  const googleVisible = await googleBtn.isVisible().catch(() => false);
  console.log('Google button visible:', googleVisible ? '✅' : '❌');
  if (googleVisible) {
    console.log('Button text:', await googleBtn.textContent());
  }

  const socialDisabled = await page.locator('text=Social login disabled').isVisible().catch(() => false);
  console.log('"Social login disabled" still showing:', socialDisabled ? '❌ YES (bad)' : '✅ NO (good)');

  console.log('\n=== 4. CLICK GOOGLE BUTTON ===');
  if (googleVisible) {
    // Capture where it redirects
    const [popup] = await Promise.all([
      page.waitForEvent('popup').catch(() => null),
      context.waitForEvent('page').catch(() => null),
    ]);

    const navPromise = page.waitForNavigation({ timeout: 5000 }).catch(() => null);
    await googleBtn.click();
    const nav = await navPromise;

    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log('After click URL:', currentUrl);

    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('google.com')) {
      console.log('✅ Redirected to Google OAuth');
    } else if (currentUrl.includes('supabase.co')) {
      console.log('✅ Redirected through Supabase OAuth');
    } else {
      console.log('URL after click:', currentUrl);
    }
  } else {
    console.log('Skipping click — button not visible');
  }

  console.log('\n=== 5. PROJECT SELECTOR ===');
  await page.goto('http://localhost:3000/canvas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const projectSelect = page.locator('select').first();
  const projectSelectVisible = await projectSelect.isVisible().catch(() => false);
  console.log('Project dropdown:', projectSelectVisible ? '✅' : '❌');
  if (projectSelectVisible) {
    const options = await projectSelect.locator('option').allTextContents();
    console.log('Options:', options);
  }

  console.log('\n=== 6. CREATE PROJECT ===');
  const newProjectOption = page.locator('option[value="__new__"]');
  const hasNewOption = await newProjectOption.isVisible().catch(() => false);
  console.log('+ New project option exists:', hasNewOption ? '✅' : '❌');

  if (projectSelectVisible) {
    await projectSelect.selectOption('__new__');
    await page.waitForTimeout(500);
    const nameInput = page.locator('input[placeholder="Project name"]');
    const nameInputVisible = await nameInput.isVisible().catch(() => false);
    console.log('Project name input appears:', nameInputVisible ? '✅' : '❌');

    if (nameInputVisible) {
      await nameInput.fill('My Test Project');
      const createBtn = page.locator('button:has-text("Create")');
      await createBtn.click();
      await page.waitForTimeout(1500);

      // Check if project appears in dropdown
      const optionsAfter = await projectSelect.locator('option').allTextContents();
      console.log('Options after create:', optionsAfter);
      const found = optionsAfter.some(o => o.includes('My Test Project'));
      console.log('New project in dropdown:', found ? '✅' : '❌');
    }
  }

  console.log('\n=== 7. MULTI-REF MODEL AUTO-LOAD ===');
  // Click Multi-Ref in toolbar to create template
  const multiRefBtn = page.locator('button:has-text("Multi-Ref")');
  await multiRefBtn.click();
  await page.waitForTimeout(1500);

  // Check if Multi-Ref Model node has platform model loaded
  const nodeContents = await page.locator('.react-flow__node').allTextContents();
  const multiRefModelNode = nodeContents.find(t => t.includes('Multi-Ref Model') || t.includes('Platform model'));
  console.log('Multi-Ref Model node:', multiRefModelNode ? '✅ ' + multiRefModelNode.substring(0, 80) : '❌ not found');

  const flux2ProLoaded = nodeContents.some(t => t.includes('FLUX 2 Pro'));
  console.log('FLUX 2 Pro auto-loaded:', flux2ProLoaded ? '✅' : '❌');

  console.log('\n=== 8. GENERATE NODE MODEL LABEL ===');
  const generateNode = nodeContents.find(t => t.includes('Generate') && t.includes('FLUX'));
  console.log('Generate node shows model:', generateNode ? '✅ ' + generateNode.substring(0, 60) : '❌');

  console.log('\n=== 9. CONSOLE ERRORS ===');
  if (errors.length === 0) console.log('No JS errors ✅');
  else errors.forEach(e => console.log('❌', e.substring(0, 150)));

  await page.screenshot({ path: '/tmp/google_auth_test.png' });
  console.log('\nScreenshot saved to /tmp/google_auth_test.png');

  await browser.close();
})();
