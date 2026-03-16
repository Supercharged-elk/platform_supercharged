const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/canvas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Cookie es base64 encoded
  const cookies = await context.cookies();
  const sbCookie = cookies.find(c => c.name.includes('auth-token'));
  let token = null;
  if (sbCookie) {
    try {
      const raw = sbCookie.value.replace('base64-', '');
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      token = parsed.access_token || (Array.isArray(parsed) ? parsed[0]?.access_token : null);
    } catch(e) {
      console.log('Error:', e.message);
    }
  }
  console.log('JWT:', token ? '✅ ' + token.substring(0, 40) + '...' : '❌');

  if (token) {
    const res = await page.request.post('http://localhost:8000/generate', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'test soldier' }
    });
    const body = await res.text();
    console.log('GENERATE', res.status(), body.substring(0, 300));

    const credits = await page.request.get('http://localhost:8000/credits', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('CREDITS', credits.status(), await credits.text());
  }

  await browser.close();
})();
