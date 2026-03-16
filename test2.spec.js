const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capturar requests fallidas
  const failed = [];
  page.on('requestfailed', req => {
    failed.push({ url: req.url(), failure: req.failure()?.errorText });
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      failed.push({ url: res.url(), status: res.status() });
    }
  });

  await page.goto('http://localhost:3000/canvas', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);

  // Verificar localStorage para sesión Supabase
  const session = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const sbKey = keys.find(k => k.includes('supabase') || k.includes('auth'));
    return sbKey ? { key: sbKey, value: localStorage.getItem(sbKey)?.substring(0, 100) } : null;
  });
  console.log('=== SESIÓN SUPABASE (localStorage) ===');
  console.log(session ? `✅ Key: ${session.key}\n   Value: ${session.value}...` : '❌ No hay sesión');

  // Ver requests fallidas con detalle
  console.log('\n=== REQUESTS CON ERROR ===');
  if (failed.length === 0) {
    console.log('✅ Ninguna');
  } else {
    for (const f of failed) {
      console.log(`❌ ${f.status || f.failure} → ${f.url}`);
      // Si es del backend, obtener el body
      if (f.url?.includes('localhost:8000') && f.status) {
        try {
          const r = await page.request.get(f.url);
          console.log('   Body:', await r.text());
        } catch {}
      }
    }
  }

  // Verificar que el DOM tiene los elementos clave
  console.log('\n=== DOM CHECK ===');
  const header = await page.$('header');
  console.log('Header:', header ? '✅' : '❌');
  const toolbar = await page.$('.react-flow');
  console.log('React Flow canvas:', toolbar ? '✅' : '❌');
  const addNodeBtn = await page.$$('button');
  console.log('Botones en toolbar:', addNodeBtn.length);

  await browser.close();
})();
