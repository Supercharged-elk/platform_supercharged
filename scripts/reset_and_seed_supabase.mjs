#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseDotEnv(content) {
  const env = {};
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
    env[key] = value;
  }
  return env;
}

function loadEnv() {
  const root = process.cwd();
  const envPath = path.join(root, '.env');
  const loaded = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, 'utf8')) : {};
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || loaded.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || loaded.SUPABASE_SERVICE_ROLE_KEY,
  };
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const full = args.has('--full');
const seedDemo = args.has('--seed-demo');
const confirmed = process.argv.includes('--confirm=RESET');

if (!dryRun && !confirmed) {
  console.error('Refusing to run destructive reset without --confirm=RESET');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = loadEnv();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env/.env');
  process.exit(1);
}

const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

async function request(method, table, { query = '', body, count = false, prefer } = {}) {
  const url = `${baseUrl}/${table}${query ? `?${query}` : ''}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (count) headers.Prefer = 'count=exact';
  if (prefer) headers.Prefer = headers.Prefer ? `${headers.Prefer},${prefer}` : prefer;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${table} failed (${res.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return { data, headers: res.headers };
}

async function countRows(table, filter) {
  const query = `select=id&${filter}`;
  const { headers } = await request('GET', table, { query, count: true });
  const range = headers.get('content-range');
  if (!range) return null;
  const total = range.split('/')[1];
  return total === '*' ? null : Number(total);
}

async function deleteAll(table, filter) {
  const query = `${filter}`;
  await request('DELETE', table, { query });
}

const deletePlan = [
  { table: 'generation_progress', filter: 'id=not.is.null' },
  { table: 'generations', filter: 'id=not.is.null' },
  { table: 'workflows', filter: 'id=not.is.null' },
  { table: 'model_configs', filter: 'id=not.is.null' },
  { table: 'projects', filter: 'id=not.is.null' },
  { table: 'credits', filter: 'id=not.is.null' },
];

if (full) {
  deletePlan.push(
    { table: 'user_profiles', filter: 'user_id=not.is.null' },
    { table: 'organizations', filter: 'id=not.is.null' },
  );
}

async function main() {
  console.log('--- Supabase reset plan ---');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Scope: ${full ? 'FULL (includes user_profiles/organizations)' : 'OPERATIONAL TABLES'}`);

  for (const step of deletePlan) {
    const total = await countRows(step.table, step.filter).catch(() => null);
    console.log(`Table ${step.table}: ${total ?? 'unknown'} rows`);
  }

  if (dryRun) {
    console.log('Dry run finished. No rows deleted.');
    return;
  }

  for (const step of deletePlan) {
    await deleteAll(step.table, step.filter);
    console.log(`Deleted rows from ${step.table}`);
  }

  let seeded = null;
  if (seedDemo) {
    const demoProjectName = `qa-demo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    const { data: projectRows } = await request('POST', 'projects', {
      body: [{ name: demoProjectName, active: true }],
      prefer: 'return=representation',
    });
    const project = Array.isArray(projectRows) ? projectRows[0] : null;
    if (project?.id) {
      const modelSeed = [
        {
          project_id: project.id,
          provider: 'replicate',
          model_ref: 'black-forest-labs/flux-1.1-pro',
          display_name: 'FLUX 1.1 Pro',
          active: true,
          use_enrichment: false,
          default_params: {},
        },
        {
          project_id: project.id,
          provider: 'replicate',
          model_ref: 'black-forest-labs/flux-2-pro',
          display_name: 'FLUX 2 Pro (Multi-Ref)',
          active: true,
          use_enrichment: false,
          default_params: { supports_multi_ref: true, capabilities: ['multi_ref'] },
        },
      ];
      await request('POST', 'model_configs', { body: modelSeed });
      seeded = { projectId: project.id, projectName: demoProjectName };
      console.log(`Seeded demo project/model configs: ${project.id}`);
    }
  }

  const resetRunId = crypto.randomUUID();
  console.log(`Reset complete. Run ID: ${resetRunId}`);
  if (seeded) {
    console.log(`Seed summary: ${JSON.stringify(seeded)}`);
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
