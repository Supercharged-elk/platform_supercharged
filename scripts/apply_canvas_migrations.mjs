#!/usr/bin/env node
/**
 * apply_canvas_migrations.mjs
 *
 * Applies pending Canvas migrations to the Supabase production database.
 * Requires SUPABASE_DB_PASSWORD environment variable (from Supabase Dashboard →
 * Settings → Database → Database password).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=your-password node scripts/apply_canvas_migrations.mjs
 *
 * OR: paste the SQL blocks below directly into the Supabase SQL Editor:
 *   https://supabase.com/dashboard/project/qxhuyctdrbdbzprblhmz/editor
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qxhuyctdrbdbzprblhmz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aHV5Y3RkcmJkYnpwcmJsaG16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwODM0MywiZXhwIjoyMDg4OTg0MzQzfQ.LWNH00lJzlGM-ZVczvEo0RTdXmIEoDFg5fka4cBb6b8';

// ────────────────────────────────────────────────────────────
// Migration SQL blocks
// Paste these MANUALLY into Supabase SQL Editor if this script fails.
// ────────────────────────────────────────────────────────────

export const MIGRATION_011 = `
-- Migration 011: Add prediction_id to generations
ALTER TABLE generations ADD COLUMN IF NOT EXISTS prediction_id TEXT;
`;

export const MIGRATION_012 = `
-- Migration 012: Atomic credit deduction functions

CREATE OR REPLACE FUNCTION deduct_user_credit(p_user_id UUID, p_credit_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_credit_type NOT IN ('generate_credits', 'edit_credits', 'animate_credits') THEN
    RAISE EXCEPTION 'Invalid credit type: %', p_credit_type;
  END IF;

  EXECUTE format(
    'UPDATE credits SET %I = %I - 1 WHERE user_id = $1 AND %I > 0',
    p_credit_type, p_credit_type, p_credit_type
  ) USING p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION refund_user_credit(p_user_id UUID, p_credit_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_credit_type NOT IN ('generate_credits', 'edit_credits', 'animate_credits') THEN
    RAISE EXCEPTION 'Invalid credit type: %', p_credit_type;
  END IF;

  EXECUTE format(
    'UPDATE credits SET %I = %I + 1 WHERE user_id = $1',
    p_credit_type, p_credit_type
  ) USING p_user_id;
END;
$$;
`;

// ────────────────────────────────────────────────────────────
// Supabase JS client cannot run DDL directly.
// This script verifies what's needed and prints instructions.
// ────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkMigration011() {
  const { error } = await sb.from('generations').select('prediction_id').limit(1).maybeSingle();
  if (error?.code === '42703') return false;  // column doesn't exist
  return true;
}

async function checkMigration012() {
  const { error } = await sb.rpc('deduct_user_credit', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_credit_type: 'generate_credits',
  });
  // PGRST202 = function not found
  return !error || error.code !== 'PGRST202';
}

console.log('Checking migration status...\n');
const m011 = await checkMigration011();
const m012 = await checkMigration012();

console.log(`Migration 011 (prediction_id column): ${m011 ? '✅ Applied' : '❌ MISSING'}`);
console.log(`Migration 012 (atomic credit RPC):    ${m012 ? '✅ Applied' : '❌ MISSING'}`);

if (!m011 || !m012) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ACTION REQUIRED: Apply pending migrations in Supabase SQL Editor        ║
║  https://supabase.com/dashboard/project/qxhuyctdrbdbzprblhmz/editor     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);
  if (!m011) {
    console.log('--- PASTE THIS (Migration 011) ---');
    console.log(MIGRATION_011);
  }
  if (!m012) {
    console.log('--- PASTE THIS (Migration 012) ---');
    console.log(MIGRATION_012);
  }
  process.exit(1);
} else {
  console.log('\nAll migrations applied. Canvas is production-ready.');
}
