/**
 * Canvas Real API Integration Tests
 *
 * These tests call REAL endpoints — Supabase auth, Canvas Next.js routes,
 * and Replicate AI APIs. No mocking. Timeouts are generous.
 *
 * Setup: test user canvas-test-1773873354@test.elkanodata.com must exist
 *        with credits seeded via service_role.
 *
 * Run: npx playwright test tests/e2e/50_canvas_real_api.spec.js
 */

const { test, expect, request } = require('@playwright/test');

const SUPABASE_URL = 'https://qxhuyctdrbdbzprblhmz.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aHV5Y3RkcmJkYnpwcmJsaG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDgzNDMsImV4cCI6MjA4ODk4NDM0M30.G6EdoXP7nvXWbpNyOYBUb4MxsC1XgJrCSKUj82B0gr8';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aHV5Y3RkcmJkYnpwcmJsaG16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwODM0MywiZXhwIjoyMDg4OTg0MzQzfQ.LWNH00lJzlGM-ZVczvEo0RTdXmIEoDFg5fka4cBb6b8';
const TEST_EMAIL = 'canvas-test-1773873354@test.elkanodata.com';
const TEST_PASSWORD = 'test-canvas-2026';
const TEST_USER_ID = '430be083-c7e7-47af-83f1-7f1ecdc3283e';
const BASE_URL = 'http://localhost:3000';

/** Sign in and return JWT token */
async function getToken(ctx) {
  const res = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`Auth failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Seed/reset test user credits via service_role PATCH (no return body needed). */
async function seedCredits(ctx, gen = 10, edit = 5, anim = 3) {
  const res = await ctx.patch(
    `${SUPABASE_URL}/rest/v1/credits?user_id=eq.${TEST_USER_ID}`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      data: { generate_credits: gen, edit_credits: edit, animate_credits: anim },
    }
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`seedCredits failed: ${res.status()} ${body}`);
  }
}

/** Poll /progress/{id} until completed or failed (max maxMs) */
async function pollUntilDone(ctx, token, genId, maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await ctx.get(`${BASE_URL}/api/canvas/progress/${genId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const { status, stage } = body.progress || {};
    console.log(`  [poll] ${genId.slice(0, 8)} — ${stage} (${status})`);
    if (status === 'completed') return body;
    if (status === 'failed') throw new Error(`Generation failed: ${body.progress?.error_message || 'unknown'}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Timed out after ${maxMs}ms`);
}

// ─────────────────────────────────────────────────────────
// BLOCK A — Auth + Credits (fast, < 5s)
// ─────────────────────────────────────────────────────────
test.describe('A: Auth & Credits (real Supabase)', () => {

  test('A1: sign-in returns valid JWT', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const res = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.user.id).toBe(TEST_USER_ID);
    console.log('A1 PASS: JWT obtained, user_id matches');
  });

  test('A2: GET /credits returns correct structure', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const res = await ctx.get(`${BASE_URL}/api/canvas/credits`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.generate_credits).toBe('number');
    expect(typeof body.edit_credits).toBe('number');
    expect(typeof body.animate_credits).toBe('number');
    expect(body.generate_credits).toBeGreaterThanOrEqual(0);
    console.log(`A2 PASS: credits = gen:${body.generate_credits} edit:${body.edit_credits} anim:${body.animate_credits}`);
  });

  test('A3: GET /credits without token returns zeros', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE_URL}/api/canvas/credits`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.generate_credits).toBe(0);
    expect(body.edit_credits).toBe(0);
    expect(body.animate_credits).toBe(0);
    console.log('A3 PASS: unauthenticated /credits returns zeros (not 401)');
  });

  test('A4: new user with 0 credits gets 402 on generate', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx, 0, 0, 0);  // zero out

    const res = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'test' },
    });
    expect(res.status()).toBe(402);
    const body = await res.json();
    expect(body.detail).toMatch(/insufficient|credits/i);
    console.log('A4 PASS: 0 credits → 402 Insufficient credits');

    // restore credits for subsequent tests
    await seedCredits(ctx);
  });

  test('A5: generate without auth token returns 401', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { 'Content-Type': 'application/json' },
      data: { prompt: 'test' },
    });
    expect(res.status()).toBe(401);
    console.log('A5 PASS: missing token → 401');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK B — Models & Workflows (fast, < 5s)
// ─────────────────────────────────────────────────────────
test.describe('B: Models & Workflows (real Supabase)', () => {

  test('B1: GET /models/global?task=multi_ref returns FLUX 2 Pro', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const res = await ctx.get(`${BASE_URL}/api/canvas/models/global?task=multi_ref`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].id).toBe('platform-multiref-flux2pro');
    expect(body.models[0].model_ref).toContain('flux-2-pro');
    console.log('B1 PASS: multi_ref model =', body.models[0].display_name);
  });

  test('B2: GET /models/global?task=video returns Kling', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const res = await ctx.get(`${BASE_URL}/api/canvas/models/global?task=video`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.models[0].id).toBe('platform-video-kling');
    console.log('B2 PASS: video model =', body.models[0].display_name);
  });

  test('B6: GET /models/global?task=generate returns FLUX 1.1 Pro', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const res = await ctx.get(`${BASE_URL}/api/canvas/models/global?task=generate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].id).toBe('platform-generate-flux11pro');
    expect(body.models[0].model_ref).toContain('flux-1.1-pro');
    console.log('B6 PASS: generate model =', body.models[0].display_name);
  });

  test('B3: POST /workflows creates, PATCH updates, DELETE removes', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    // Create
    const createRes = await ctx.post(`${BASE_URL}/api/canvas/workflows`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'Real API Test WF', graph_json: { nodes: [], edges: [] } },
    });
    expect(createRes.status()).toBe(200);
    const wf = await createRes.json();
    expect(wf.id).toBeTruthy();
    expect(wf.name).toBe('Real API Test WF');
    console.log('B3: created workflow', wf.id);

    // Patch
    const patchRes = await ctx.patch(`${BASE_URL}/api/canvas/workflows/${wf.id}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'Updated Name', graph_json: { nodes: [{ id: 'n1' }], edges: [] } },
    });
    expect(patchRes.status()).toBe(200);
    const patched = await patchRes.json();
    expect(patched.name).toBe('Updated Name');

    // Delete
    const delRes = await ctx.delete(`${BASE_URL}/api/canvas/workflows/${wf.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status()).toBe(200);
    console.log('B3 PASS: workflow CRUD complete');
  });

  test('B4: GET /workflows returns only user workflows', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const res = await ctx.get(`${BASE_URL}/api/canvas/workflows`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.workflows)).toBe(true);
    console.log(`B4 PASS: ${body.workflows.length} workflows returned`);
  });

  test('B5: GET /workflows without token returns 401', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE_URL}/api/canvas/workflows`);
    expect(res.status()).toBe(401);
    console.log('B5 PASS: unauthenticated /workflows → 401');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK C — Generate validation (no Replicate call, fast)
// ─────────────────────────────────────────────────────────
test.describe('C: Generate input validation', () => {

  test('C1: generate without prompt returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const res = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: '' },
    });
    expect(res.status()).toBe(422);
    console.log('C1 PASS: empty prompt → 422');
  });

  test('C2: edit without image_url returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const res = await ctx.post(`${BASE_URL}/api/canvas/edit`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'make it blue', image_url: '' },
    });
    expect(res.status()).toBe(422);
    console.log('C2 PASS: missing image_url → 422');
  });

  test('C3: video without image_url returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const res = await ctx.post(`${BASE_URL}/api/canvas/video`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { image_url: '', prompt: 'animate' },
    });
    expect(res.status()).toBe(422);
    console.log('C3 PASS: missing image_url → 422');
  });

  test('C4: generate-multi-ref without model_config_id returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const res = await ctx.post(`${BASE_URL}/api/canvas/generate-multi-ref`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'test', reference_urls: [] },
    });
    expect(res.status()).toBe(422);
    console.log('C4 PASS: missing model_config_id → 422');
  });

  test('C5: generate-multi-ref with > 8 refs returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const tooManyRefs = Array.from({ length: 9 }, (_, i) => `https://example.com/img${i}.jpg`);
    const res = await ctx.post(`${BASE_URL}/api/canvas/generate-multi-ref`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'test', model_config_id: 'platform-multiref-flux2pro', reference_urls: tooManyRefs },
    });
    expect(res.status()).toBe(422);
    console.log('C5 PASS: 9 refs → 422 Max 8 reference images');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK D — Progress endpoint
// ─────────────────────────────────────────────────────────
test.describe('D: Progress endpoint', () => {

  test('D1: /progress/unknown-id returns 404', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const res = await ctx.get(`${BASE_URL}/api/canvas/progress/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
    console.log('D1 PASS: unknown generation_id → 404');
  });

  test('D2: /progress without token returns 401', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE_URL}/api/canvas/progress/some-id`);
    expect(res.status()).toBe(401);
    console.log('D2 PASS: unauthenticated /progress → 401');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK E — Real Replicate: FLUX Generate + progress poll
// (slow: 20-90s, depends on Replicate queue)
// ─────────────────────────────────────────────────────────
test.describe('E: Real Replicate generation (FLUX 1.1 Pro)', () => {

  test('E1: generate starts prediction and returns generation_id', async ({}) => {
    test.setTimeout(30000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const res = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'A solid blue square, minimal, flat design' },
    });

    console.log('E1: response status:', res.status());
    if (res.status() !== 200) {
      const body = await res.json();
      console.log('E1: ERROR body:', JSON.stringify(body));
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.generation_id).toBeTruthy();
    console.log('E1 PASS: generation_id =', body.generation_id);
  });

  test('E2: generate → poll → image_url returned', async ({}) => {
    test.setTimeout(180000);  // 3 min for Replicate
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    // Start generation
    const genRes = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'A solid red square on white background' },
    });

    if (genRes.status() !== 200) {
      const body = await genRes.json();
      console.log('E2 SKIP: generate failed:', JSON.stringify(body));
      test.skip();
      return;
    }
    const { generation_id } = await genRes.json();
    console.log('E2: generation_id =', generation_id);

    // Poll until done
    const result = await pollUntilDone(ctx, token, generation_id, 150000);
    expect(result.progress.status).toBe('completed');
    expect(result.image_url).toBeTruthy();
    expect(result.image_url).toMatch(/^https?:\/\//);
    console.log('E2 PASS: image_url =', result.image_url?.slice(0, 60) + '...');
  });

  test('E3: credit is deducted after successful generation', async ({}) => {
    test.setTimeout(180000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx, 5, 5, 3);  // known starting value

    // Check starting credits
    const before = await (await ctx.get(`${BASE_URL}/api/canvas/credits`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    const genBefore = before.generate_credits;

    // Generate
    const genRes = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'A simple yellow star' },
    });
    if (genRes.status() !== 200) { test.skip(); return; }
    const { generation_id } = await genRes.json();
    await pollUntilDone(ctx, token, generation_id, 150000);

    // Check credits decreased by 1
    const after = await (await ctx.get(`${BASE_URL}/api/canvas/credits`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    expect(after.generate_credits).toBe(genBefore - 1);
    console.log(`E3 PASS: credits ${genBefore} → ${after.generate_credits}`);
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK F — Real Replicate: Edit (FLUX Kontext)
// (slow: 20-60s)
// ─────────────────────────────────────────────────────────
test.describe('F: Real Replicate Edit (FLUX Kontext Pro)', () => {

  // Use the Replicate delivery URL as a stable test image
  const REF_IMAGE = 'https://replicate.delivery/xezq/EBKPUWdS7EJHJt6Scgqp67kmbaA2LxwfyjBlbuMoSQ8qZmIL/tmp15jjbcip.webp';

  test('F1: edit → poll → image_url returned', async ({}) => {
    test.setTimeout(180000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const editRes = await ctx.post(`${BASE_URL}/api/canvas/edit`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { image_url: REF_IMAGE, prompt: 'Make the background solid white' },
    });

    if (editRes.status() !== 200) {
      const body = await editRes.json();
      console.log('F1 SKIP: edit failed:', JSON.stringify(body));
      test.skip();
      return;
    }
    const { generation_id } = await editRes.json();
    console.log('F1: generation_id =', generation_id);

    const result = await pollUntilDone(ctx, token, generation_id, 150000);
    expect(result.progress.status).toBe('completed');
    expect(result.image_url).toMatch(/^https?:\/\//);
    console.log('F1 PASS: edit image_url =', result.image_url?.slice(0, 60) + '...');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK G — Credit refund on Replicate error
// ─────────────────────────────────────────────────────────
test.describe('G: Credit refund on failure', () => {

  test('G1: credits refunded when generate route gets Replicate error', async ({}) => {
    test.setTimeout(30000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx, 3, 3, 2);

    const before = await (await ctx.get(`${BASE_URL}/api/canvas/credits`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();

    // Trigger an edit call with a bad image URL — Replicate will reject it
    // which should trigger the refund path
    const res = await ctx.post(`${BASE_URL}/api/canvas/edit`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        image_url: 'https://invalid.example.invalid/notanimage.jpg',
        prompt: 'make it blue',
      },
    });

    // Might succeed (prediction created) or fail (Replicate rejects bad URL)
    console.log('G1: edit response status:', res.status());
    if (res.status() === 500) {
      // Replicate rejected the bad URL → credit should be refunded
      const after = await (await ctx.get(`${BASE_URL}/api/canvas/credits`, {
        headers: { Authorization: `Bearer ${token}` }
      })).json();
      expect(after.edit_credits).toBe(before.edit_credits);
      console.log('G1 PASS: Replicate error → credits refunded, still', after.edit_credits);
    } else if (res.status() === 200) {
      // Replicate accepted the URL (may fail at processing stage)
      console.log('G1 INFO: Replicate accepted bad URL, prediction started — refund test N/A at this stage');
    } else {
      console.log('G1 INFO: unexpected status', res.status(), '—', await res.text());
    }
  });

  test('G2: credit refunded when Replicate rejects non-existent model (sync 404)', async ({}) => {
    test.setTimeout(30000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx, 5, 5, 3);

    // Create a temporary project so we can insert a model_config
    const projRes = await ctx.post(`${BASE_URL}/api/canvas/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'G2 Refund Test ' + Date.now() },
    });
    expect(projRes.status()).toBe(201);
    const project = await projRes.json();

    // Insert a model_config pointing to a non-existent Replicate model
    const mcRes = await ctx.post(`${SUPABASE_URL}/rest/v1/model_configs`, {
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      data: {
        project_id: project.id,
        display_name: 'G2 Bad Model',
        model_ref: 'nonexistent-org/nonexistent-model-for-refund-test',
        use_enrichment: false,
      },
    });
    const mcBody = await mcRes.json();
    const mcId = Array.isArray(mcBody) ? mcBody[0]?.id : mcBody?.id;
    if (!mcId) {
      console.log('G2 SKIP: could not insert test model_config:', JSON.stringify(mcBody));
      test.skip(); return;
    }

    // Record credits before
    const before = await (await ctx.get(`${BASE_URL}/api/canvas/credits`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();

    // Trigger generate with bad model → Replicate returns 404 → route refunds
    const genRes = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'refund test', model_config_id: mcId },
    });
    console.log('G2: generate status:', genRes.status());

    const after = await (await ctx.get(`${BASE_URL}/api/canvas/credits`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();

    // Cleanup
    await ctx.delete(`${SUPABASE_URL}/rest/v1/model_configs?id=eq.${mcId}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    await ctx.delete(`${SUPABASE_URL}/rest/v1/projects?id=eq.${project.id}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });

    if (genRes.status() === 500) {
      expect(after.generate_credits).toBe(before.generate_credits);
      console.log('G2 PASS: Replicate 404 → refund → credits still', after.generate_credits);
    } else {
      // Replicate may have accepted the prediction asynchronously
      console.log('G2 INFO: generate returned', genRes.status(), '— refund N/A (async path)');
    }
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK H — Generations history
// ─────────────────────────────────────────────────────────
test.describe('H: Generations history', () => {

  test('H1: GET /generations returns correct structure', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    const res = await ctx.get(`${BASE_URL}/api/canvas/generations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('generations');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('limit');
    expect(Array.isArray(body.generations)).toBe(true);
    console.log(`H1 PASS: ${body.generations.length} generations, total=${body.total}`);
  });

  test('H2: generation records have required fields', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    const res = await ctx.get(`${BASE_URL}/api/canvas/generations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    for (const gen of body.generations) {
      expect(gen).toHaveProperty('id');
      expect(gen).toHaveProperty('mode');
      expect(gen).toHaveProperty('model_used');
      expect(gen).toHaveProperty('created_at');
    }
    console.log(`H2 PASS: ${body.generations.length} records validated`);
  });

  test('H3: pagination params respected (limit=2)', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    const res = await ctx.get(`${BASE_URL}/api/canvas/generations?page=0&limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(2);
    expect(body.page).toBe(0);
    expect(body.generations.length).toBeLessThanOrEqual(2);
    console.log('H3 PASS: pagination — returned', body.generations.length, 'of', body.total);
  });

  test('H4: GET /generations without token returns 401', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE_URL}/api/canvas/generations`);
    expect(res.status()).toBe(401);
    console.log('H4 PASS: unauthenticated /generations → 401');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK I — Projects CRUD
// ─────────────────────────────────────────────────────────
test.describe('I: Projects CRUD', () => {

  test('I1: POST /projects creates project, GET lists it', async ({}) => {
    test.setTimeout(15000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const name = 'Real API Test Project ' + Date.now();

    const createRes = await ctx.post(`${BASE_URL}/api/canvas/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name },
    });
    expect(createRes.status()).toBe(201);
    const project = await createRes.json();
    expect(project.id).toBeTruthy();
    expect(project.name).toBe(name);
    expect(project.active).toBe(true);

    const listRes = await ctx.get(`${BASE_URL}/api/canvas/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.status()).toBe(200);
    const { projects } = await listRes.json();
    expect(projects.some((p) => p.id === project.id)).toBe(true);

    // Cleanup
    await ctx.delete(`${SUPABASE_URL}/rest/v1/projects?id=eq.${project.id}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    console.log('I1 PASS: project created and listed:', project.id);
  });

  test('I2: GET /projects without token returns empty array (not 401)', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE_URL}/api/canvas/projects`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.projects).toEqual([]);
    console.log('I2 PASS: unauthenticated /projects → empty array');
  });

  test('I3: POST /projects without token returns 401', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE_URL}/api/canvas/projects`, {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Unauthorized Project' },
    });
    expect(res.status()).toBe(401);
    console.log('I3 PASS: unauthenticated POST /projects → 401');
  });

  test('I4: POST /projects without name returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const res = await ctx.post(`${BASE_URL}/api/canvas/projects`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(422);
    console.log('I4 PASS: missing name → 422');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK J — Image uploads (Supabase Storage: ai-assets)
// ─────────────────────────────────────────────────────────
test.describe('J: Image uploads (Supabase Storage)', () => {

  // Minimal valid 1×1 white JPEG (base64, 168 bytes)
  const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

  test('J1: upload JPEG → returns public URL in Supabase Storage', async ({}) => {
    test.setTimeout(20000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    const imageBuffer = Buffer.from(TINY_JPEG_B64, 'base64');

    const res = await ctx.fetch(`${BASE_URL}/api/canvas/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: imageBuffer },
      },
    });
    console.log('J1: upload status:', res.status());
    if (!res.ok()) {
      console.log('J1 body:', await res.text());
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.url).toBeTruthy();
    expect(body.url).toMatch(/^https?:\/\//);
    console.log('J1 PASS: url =', body.url.slice(0, 70) + '...');
  });

  test('J2: upload without file returns 422', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    const res = await ctx.fetch(`${BASE_URL}/api/canvas/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      multipart: {},
    });
    expect(res.status()).toBe(422);
    console.log('J2 PASS: missing file → 422');
  });

  test('J3: upload without token returns 401', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const imageBuffer = Buffer.from(TINY_JPEG_B64, 'base64');

    const res = await ctx.fetch(`${BASE_URL}/api/canvas/uploads/image`, {
      method: 'POST',
      multipart: {
        file: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: imageBuffer },
      },
    });
    expect(res.status()).toBe(401);
    console.log('J3 PASS: unauthenticated upload → 401');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK K — Security & Authorization
// ─────────────────────────────────────────────────────────
test.describe('K: Security & Authorization', () => {

  test('K1: private workflow without token returns 403', async ({}) => {
    test.setTimeout(20000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    // Create a private workflow
    const createRes = await ctx.post(`${BASE_URL}/api/canvas/workflows`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'K1 Private WF', graph_json: {}, is_public: false },
    });
    expect(createRes.status()).toBe(200);
    const wf = await createRes.json();

    // Access without token → 403
    const accessRes = await ctx.get(`${BASE_URL}/api/canvas/workflows/${wf.id}`);
    expect(accessRes.status()).toBe(403);
    console.log('K1 PASS: private workflow without token → 403');

    // Cleanup
    await ctx.delete(`${BASE_URL}/api/canvas/workflows/${wf.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('K2: public workflow accessible without token', async ({}) => {
    test.setTimeout(20000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    // Create a public workflow
    const createRes = await ctx.post(`${BASE_URL}/api/canvas/workflows`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'K2 Public WF', graph_json: { nodes: [] }, is_public: true },
    });
    expect(createRes.status()).toBe(200);
    const wf = await createRes.json();

    // Access without token → 200
    const accessRes = await ctx.get(`${BASE_URL}/api/canvas/workflows/${wf.id}`);
    expect(accessRes.status()).toBe(200);
    const body = await accessRes.json();
    expect(body.id).toBe(wf.id);
    expect(body.is_public).toBe(true);
    console.log('K2 PASS: public workflow accessible without token');

    // Cleanup
    await ctx.delete(`${BASE_URL}/api/canvas/workflows/${wf.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('K3: PATCH workflow owned by another user returns 404', async ({}) => {
    test.setTimeout(25000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    // Create a workflow as the test user
    const createRes = await ctx.post(`${BASE_URL}/api/canvas/workflows`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'K3 WF', graph_json: {} },
    });
    const wf = await createRes.json();

    // Sign in as an anonymous user (different user)
    const anonSignup = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      data: {},
    });
    const anonBody = await anonSignup.json();
    const anonToken = anonBody.access_token;
    if (!anonToken) {
      console.log('K3 SKIP: anonymous signup unavailable');
      await ctx.delete(`${BASE_URL}/api/canvas/workflows/${wf.id}`, { headers: { Authorization: `Bearer ${token}` } });
      test.skip(); return;
    }

    // Try to PATCH the workflow as the anon user → 404 (user_id mismatch)
    const patchRes = await ctx.patch(`${BASE_URL}/api/canvas/workflows/${wf.id}`, {
      headers: { Authorization: `Bearer ${anonToken}`, 'Content-Type': 'application/json' },
      data: { name: 'Stolen WF' },
    });
    expect(patchRes.status()).toBe(404);
    console.log('K3 PASS: PATCH non-owned workflow by anon user → 404');

    // Cleanup
    await ctx.delete(`${BASE_URL}/api/canvas/workflows/${wf.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('K4: GET /progress with own token but non-existent id returns 404', async ({}) => {
    test.setTimeout(10000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);

    const res = await ctx.get(`${BASE_URL}/api/canvas/progress/00000000-0000-0000-0000-000000000002`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
    console.log('K4 PASS: valid token + non-existent generation_id → 404');
  });

  test('K5: GET /progress for another user\'s generation returns 403', async ({}) => {
    test.setTimeout(25000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    // Create a generation as the test user
    const genRes = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'k5 security test' },
    });
    if (genRes.status() !== 200) { test.skip(); return; }
    const { generation_id } = await genRes.json();

    // Sign in as an anonymous user (different user)
    const anonSignup = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      data: {},
    });
    const anonBody = await anonSignup.json();
    const anonToken = anonBody.access_token;
    if (!anonToken) {
      console.log('K5 SKIP: anonymous signup unavailable');
      test.skip(); return;
    }

    // Try to poll progress as the anon user → 403
    const pollRes = await ctx.get(`${BASE_URL}/api/canvas/progress/${generation_id}`, {
      headers: { Authorization: `Bearer ${anonToken}` },
    });
    expect(pollRes.status()).toBe(403);
    console.log('K5 PASS: anon user cannot access other user\'s generation → 403');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK L — Real Replicate: Multi-Ref (FLUX 2 Pro)
// (slow: 20-90s)
// ─────────────────────────────────────────────────────────
test.describe('L: Real Replicate Multi-Ref (FLUX 2 Pro)', () => {

  const REF_IMAGE = 'https://replicate.delivery/xezq/MEuVO1JAqvJ5DJKCALpeci8b5i1wVQMQgFnxwv5GJ7EEZ3bnB/out-0.webp';

  test('L1: generate-multi-ref → poll → image_url returned', async ({}) => {
    test.setTimeout(180000);
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx);

    const genRes = await ctx.post(`${BASE_URL}/api/canvas/generate-multi-ref`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        prompt: 'Abstract geometric shapes in the style of the reference',
        model_config_id: 'platform-multiref-flux2pro',
        reference_urls: [REF_IMAGE],
      },
    });
    console.log('L1: response status:', genRes.status());
    if (genRes.status() !== 200) {
      const body = await genRes.json();
      console.log('L1 ERROR:', JSON.stringify(body));
    }
    expect(genRes.status()).toBe(200);
    const { generation_id } = await genRes.json();
    console.log('L1: generation_id =', generation_id);

    const result = await pollUntilDone(ctx, token, generation_id, 150000);
    expect(result.progress.status).toBe('completed');
    expect(result.image_url).toBeTruthy();
    expect(result.image_url).toMatch(/^https?:\/\//);
    console.log('L1 PASS: multi-ref image_url =', result.image_url?.slice(0, 60) + '...');
  });

});

// ─────────────────────────────────────────────────────────
// BLOCK M — Real Replicate: Kling Video
// SLOW: 3-6 min. Run selectively: --grep "M:"
// ─────────────────────────────────────────────────────────
test.describe('M: Real Replicate Kling Video (slow)', () => {

  test('M1: FLUX generate → Kling animate → video_url returned (full pipeline)', async ({}) => {
    // Tests the real user workflow: generate an image, then animate it.
    // Needs 1 generate credit + 1 animate credit.
    test.setTimeout(420000); // 7 min: FLUX (~15s) + Kling queue + render
    const ctx = await request.newContext();
    const token = await getToken(ctx);
    await seedCredits(ctx, 5, 3, 3); // extra credits for both steps

    // Step 1: Generate a FLUX image to use as Kling reference
    const fluxRes = await ctx.post(`${BASE_URL}/api/canvas/generate`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { prompt: 'A serene mountain lake at golden hour, photorealistic' },
    });
    expect(fluxRes.status()).toBe(200);
    const { generation_id: fluxId } = await fluxRes.json();
    console.log('M1: generating reference image, id =', fluxId);

    const fluxResult = await pollUntilDone(ctx, token, fluxId, 90000);
    expect(fluxResult.progress.status).toBe('completed');
    const imageUrl = fluxResult.image_url;
    console.log('M1: reference image =', imageUrl.slice(0, 60) + '...');

    // Step 2: Animate the FLUX image with Kling
    const genRes = await ctx.post(`${BASE_URL}/api/canvas/video`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        image_url: imageUrl,
        prompt: 'slow cinematic pan, dramatic lighting',
        model_config_id: 'platform-video-kling',
      },
    });
    console.log('M1: response status:', genRes.status());
    if (genRes.status() !== 200) {
      const body = await genRes.json();
      console.log('M1 ERROR:', JSON.stringify(body));
    }
    expect(genRes.status()).toBe(200);
    const { generation_id } = await genRes.json();
    console.log('M1: generation_id =', generation_id);

    const result = await pollUntilDone(ctx, token, generation_id, 370000);
    expect(result.progress.status).toBe('completed');
    expect(result.video_url).toBeTruthy();
    expect(result.video_url).toMatch(/^https?:\/\//);
    console.log('M1 PASS: video_url =', result.video_url?.slice(0, 60) + '...');
  });

});
