const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Interceptar respuesta del signup con body
  page.on('response', async res => {
    if (res.url().includes('/auth/v1/signup') || res.url().includes('/auth/v1/token')) {
      const status = res.status();
      let body = '';
      try { body = await res.text(); } catch {}
      console.log(`AUTH ${status}: ${res.url()}`);
      console.log('Body:', body);
    }
  });

  await page.goto('http://localhost:3000/canvas', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);

  await browser.close();
})();
