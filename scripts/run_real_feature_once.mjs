#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseEnv(content) {
  const out = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  const local = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
  return {
    BACKEND_URL: process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || local.BACKEND_URL || local.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
    SUPABASE_URL: process.env.SUPABASE_URL || local.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY,
  };
}

const { BACKEND_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = loadEnv();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const restBase = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

async function supabaseRequest(method, table, { query = '', body } = {}) {
  const url = `${restBase}/${table}${query ? `?${query}` : ''}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'POST' || method === 'PATCH') {
    headers.Prefer = 'return=representation';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Supabase ${method} ${table} failed: ${JSON.stringify(data)}`);
  return data;
}

async function apiRequest(pathName, { method = 'GET', token, body } = {}) {
  const url = `${BACKEND_URL.replace(/\/$/, '')}${pathName}`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${pathName} failed (${res.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function waitGeneration(token, generationId, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await apiRequest(`/progress/${generationId}`, { token });
    const progress = data?.progress || {};
    const status = progress.status;
    const pct = progress.progress_pct ?? 0;
    const stage = progress.stage || '';
    console.log(`[${generationId}] ${status} ${pct}% ${stage}`.trim());
    if (status === 'completed') return data;
    if (status === 'failed') throw new Error(`Generation ${generationId} failed: ${progress.error_message || 'unknown error'}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Timeout waiting for generation ${generationId}`);
}

async function createOrgToken() {
  const slug = `qa-e2e-${Date.now()}`;
  const apiToken = `orgtok_${crypto.randomUUID().replace(/-/g, '')}`;
  const rows = await supabaseRequest('POST', 'organizations', {
    body: [{ name: `QA E2E ${Date.now()}`, slug, plan_type: 'enterprise', api_token: apiToken, active: true }],
  });
  const org = Array.isArray(rows) ? rows[0] : null;
  if (!org?.id) throw new Error('Failed creating organization token');
  return { orgId: org.id, apiToken };
}

async function main() {
  console.log('--- Real feature execution (one run per feature) ---');
  const health = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/health`);
  if (!health.ok) throw new Error(`Backend health failed with ${health.status}`);
  console.log('Backend health OK');

  const { orgId, apiToken } = await createOrgToken();
  console.log(`Org token created for test org: ${orgId}`);

  const prompt = 'A cinematic product shot of a smartwatch on black stone, dramatic rim light';

  const gen = await apiRequest('/generate', {
    method: 'POST',
    token: apiToken,
    body: { prompt },
  });
  console.log(`generate started: ${gen.generation_id}`);
  const genDone = await waitGeneration(apiToken, gen.generation_id);
  const generatedImage = genDone.image_url;
  if (!generatedImage) throw new Error('Generate completed without image_url');

  const edit = await apiRequest('/edit', {
    method: 'POST',
    token: apiToken,
    body: { image_url: generatedImage, prompt: 'Turn it into a premium studio ad style, warmer highlights' },
  });
  console.log(`edit started: ${edit.generation_id}`);
  const editDone = await waitGeneration(apiToken, edit.generation_id);
  const editedImage = editDone.image_url;
  if (!editedImage) throw new Error('Edit completed without image_url');

  const video = await apiRequest('/video', {
    method: 'POST',
    token: apiToken,
    body: { image_url: editedImage, prompt: 'Slow cinematic dolly-in camera move', duration: 5, aspect_ratio: '16:9' },
  });
  console.log(`video started: ${video.generation_id}`);
  const videoDone = await waitGeneration(apiToken, video.generation_id, 15 * 60 * 1000);
  if (!videoDone.video_url) throw new Error('Video completed without video_url');

  const multi = await apiRequest('/generate-multi-ref', {
    method: 'POST',
    token: apiToken,
    body: {
      prompt: 'Combine references into one polished campaign visual, preserving product details',
      reference_urls: [generatedImage, editedImage],
      model_config_id: 'platform-multiref-flux2pro',
    },
  });
  console.log(`multi-ref started: ${multi.generation_id}`);
  const multiDone = await waitGeneration(apiToken, multi.generation_id);
  if (!multiDone.image_url) throw new Error('Multi-ref completed without image_url');

  console.log('✅ Real feature matrix complete');
  console.log(JSON.stringify({
    orgId,
    generate: genDone.image_url,
    edit: editDone.image_url,
    video: videoDone.video_url,
    multiRef: multiDone.image_url,
  }, null, 2));
}

main().catch((err) => {
  console.error('❌ Real feature matrix failed:', err.message);
  process.exit(1);
});
