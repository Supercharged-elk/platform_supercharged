# Debug — diagnose a specific error in canvas-platform

Argument: `$ARGUMENTS` — paste the error message or describe the symptom

## Diagnostic playbook

### Backend 500 on UUID column
**Pattern:** `invalid input syntax for type uuid` or `22P02`
**Fix:** Add `uuid.UUID(id)` validation before the Supabase query. Returns 404/400 on ValueError.
**Files to check:** whichever router handles the failing endpoint.

### Platform model IDs returning 500
**Pattern:** `"platform-multiref-flux2pro"` or `"platform-video-kling"` cause DB errors
**Fix:** Check `PLATFORM_MODEL_MAP` dict in `backend/routers/multiref.py`. Non-UUID model IDs must bypass DB lookup.

### Google OAuth "not enabled"
**Pattern:** `signInWithGoogle` throws or Supabase returns error
**Root cause:** `linkIdentity` requires Manual Linking. We use `signInWithOAuth` instead.
**File:** `frontend/src/store/auth.ts`

### 401 on page load (race condition)
**Pattern:** API calls fire before session is set
**Fix:** Gate `useEffect` on `session` from `useAuthStore`. Only fetch when session is truthy.
**Example:** `ProjectSelector.tsx`

### Credits not refreshing after generation
**Fix:** All execution nodes must call `void fetchCredits()` in `onNodeComplete`.
Check: `GenerateNode`, `EditNode`, `VideoNode`, `MultiRefNode`, `RunPipelineButton`.

### Rate limit errors (429)
**Pattern:** `429 Too Many Requests` from generation endpoints
**Config:** `backend/limiter.py` — default 20/min per IP. Adjust via `@limiter.limit(...)` in each router.

### TypeScript errors after node changes
Run: `cd frontend && npx tsc --noEmit`
Common cause: missing data type mapping in `getSourceDataType`/`getTargetDataType` in `canvas.ts`.

## Log locations
- Backend: stdout of `uvicorn` process
- Frontend: browser console + Next.js terminal
- Supabase errors: returned in `error` field of supabase-py response (`result.error`)
