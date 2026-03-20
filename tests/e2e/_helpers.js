const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://qxhuyctdrbdbzprblhmz.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_KEY = 'sb-qxhuyctdrbdbzprblhmz-auth-token';
const CACHED_USER_PATH = path.join(__dirname, '.test-user-cache.json');

/**
 * Refresh an anonymous session using the refresh_token.
 * Returns new session or null if refresh fails.
 */
async function refreshSession(refreshToken) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await resp.json();
  if (!data.access_token) return null;
  return {
    access_token: data.access_token,
    token_type: data.token_type || 'bearer',
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    expires_in: data.expires_in,
    user: data.user,
  };
}

async function createTestUser() {
  // Check if we have a cached user that's still valid (or refreshable)
  if (fs.existsSync(CACHED_USER_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHED_USER_PATH, 'utf8'));
      const now = Math.floor(Date.now() / 1000);
      // If token expires in > 60s, use it directly
      if (cached.session && cached.session.expires_at > now + 60) {
        // Top up credits back to 10 before using (previous runs may have deducted them)
        await fetch(`${SUPABASE_URL}/rest/v1/credits?user_id=eq.${cached.userId}`, {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: 'Bearer ' + SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ generate_credits: 10, edit_credits: 5, animate_credits: 2 }),
        });
        console.log('Reusing cached test user:', cached.userId);
        return { session: cached.session, userId: cached.userId, token: cached.session.access_token };
      }
      // Token expired — try to refresh
      if (cached.session && cached.session.refresh_token) {
        const refreshed = await refreshSession(cached.session.refresh_token);
        if (refreshed) {
          const updated = { session: refreshed, userId: cached.userId };
          fs.writeFileSync(CACHED_USER_PATH, JSON.stringify(updated, null, 2));
          // Top up credits
          await fetch(`${SUPABASE_URL}/rest/v1/credits?user_id=eq.${cached.userId}`, {
            method: 'PATCH',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: 'Bearer ' + SERVICE_KEY,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({ generate_credits: 10, edit_credits: 5, animate_credits: 2 }),
          });
          console.log('Refreshed cached test user:', cached.userId);
          return { session: refreshed, userId: cached.userId, token: refreshed.access_token };
        }
      }
    } catch (e) {
      console.log('Cache read failed, creating new user:', e.message);
    }
  }

  // Create a fresh anonymous user
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Failed to create test user: ' + JSON.stringify(data));

  const userId = data.user.id;
  const session = {
    access_token: data.access_token,
    token_type: 'bearer',
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    expires_in: data.expires_in,
    user: data.user,
  };

  // Trigger Next.js credits route to seed the credits row
  await fetch('http://localhost:3000/api/canvas/credits', {
    headers: { Authorization: 'Bearer ' + data.access_token },
  }).catch(() => {}); // non-fatal if server not up

  // PATCH to set real credits — POST would 409 because row now exists from above seed
  await fetch(`${SUPABASE_URL}/rest/v1/credits?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ generate_credits: 10, edit_credits: 5, animate_credits: 2 }),
  });

  // Cache for future runs
  fs.writeFileSync(CACHED_USER_PATH, JSON.stringify({ session, userId }, null, 2));
  console.log('Created and cached new test user:', userId);

  return { session, userId, token: data.access_token };
}

/**
 * Encode a session object as the "base64-..." cookie value used by @supabase/ssr.
 */
function encodeSessionCookie(session) {
  const json = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  return 'base64-' + Buffer.from(json).toString('base64');
}

async function injectSession(page, session) {
  await page.context().addCookies([{
    name: STORAGE_KEY,
    value: encodeSessionCookie(session),
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }]);
}

async function setE2EBypass(page) {
  await page.context().addCookies([{
    name: 'e2e_auth_bypass',
    value: '1',
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }]);
}

async function goToCanvas(page, session) {
  // Inject session cookie BEFORE navigating so @supabase/ssr finds it on first load
  await injectSession(page, session);
  await page.goto('http://localhost:3000/canvas', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 30000 });
  await page.waitForTimeout(2000);
}

async function dismissWelcomeOverlay(page) {
  const overlayTitle = page.getByRole('heading', { name: 'Welcome to Canvas' });
  if (await overlayTitle.isVisible().catch(function() { return false; })) {
    const startBlank = page.getByRole('button', { name: 'Start blank' });
    if (await startBlank.isVisible().catch(function() { return false; })) {
      await startBlank.click();
      await expect(overlayTitle).toBeHidden({ timeout: 5000 });
    }
  }
}

async function waitForNodeComplete(page, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 180000;
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Done \u2713' }).first())
    .toBeVisible({ timeout: timeoutMs });
}

/**
 * Create a workflow via the API with a pre-built connected graph.
 * Returns the workflow ID to be loaded via ?workflow=ID.
 */
async function createWorkflow(token, name, graphJson) {
  const resp = await fetch('http://localhost:3000/api/canvas/workflows', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, graph_json: graphJson }),
  });
  const data = await resp.json();
  if (!data.id) throw new Error('Failed to create workflow: ' + JSON.stringify(data));
  return data.id;
}

/**
 * Load a workflow by ID — navigates to /canvas?workflow=ID
 */
async function goToWorkflow(page, session, workflowId) {
  await injectSession(page, session);
  await page.goto(`http://localhost:3000/canvas?workflow=${workflowId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 30000 });
  await page.waitForTimeout(2000);
}

module.exports = {
  createTestUser,
  injectSession,
  setE2EBypass,
  goToCanvas,
  goToWorkflow,
  createWorkflow,
  dismissWelcomeOverlay,
  waitForNodeComplete,
  SUPABASE_URL,
  ANON_KEY,
  SERVICE_KEY,
};
