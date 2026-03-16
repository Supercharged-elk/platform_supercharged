const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capturar errores de consola
  const errors = [];
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    else logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  console.log('\n=== TEST 1: Carga de / → redirige a /canvas ===');
  const res = await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Status:', res.status());
  console.log('URL final:', page.url());

  console.log('\n=== TEST 2: Canvas carga sin crash ===');
  await page.waitForTimeout(3000);
  const title = await page.title();
  console.log('Page title:', title);

  // Verificar que el canvas React Flow existe
  const canvas = await page.$('.react-flow');
  console.log('ReactFlow presente:', canvas ? '✅' : '❌');

  // Verificar toolbar
  const toolbar = await page.$('button');
  console.log('Botones presentes:', toolbar ? '✅' : '❌');

  console.log('\n=== TEST 3: Sesión anónima Supabase ===');
  await page.waitForTimeout(2000);
  const cookies = await context.cookies();
  const sbCookie = cookies.find(c => c.name.includes('supabase') || c.name.includes('sb-'));
  console.log('Cookie Supabase:', sbCookie ? `✅ ${sbCookie.name}` : '❌ no encontrada');

  console.log('\n=== TEST 4: Backend health ===');
  const backendRes = await page.goto('http://localhost:8000/health');
  const body = await page.textContent('body');
  console.log('Backend health:', body);

  console.log('\n=== ERRORES DE CONSOLA ===');
  if (errors.length === 0) {
    console.log('✅ Sin errores');
  } else {
    errors.forEach(e => console.log('❌', e));
  }

  console.log('\n=== LOGS ===');
  logs.slice(0, 10).forEach(l => console.log(l));

  await browser.close();
})();
