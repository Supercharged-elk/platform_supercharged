# Real Footage Step 1 — Endpoint Validation Report

Date: 2026-03-18

## Scope
- Endpoint contract alignment for `POST /api/studio/gemini-upload`
- Client-side preflight behavior in `Stage1Creative`
- End-to-end behavior in Real Footage Step 1

## Validation Executed
1. Frontend compile/type-check:
   - Command: `npm run build` (in `frontend/`)
   - Result: PASS

2. Real Footage E2E suite:
   - Command: `npx playwright test tests/e2e/40_studio_real_footage.spec.js`
   - Result: PASS (16/16)

3. New validation tests added:
   - `RF-15`: unsupported MIME rejected locally, no call to `/api/studio/gemini-upload`
  - `RF-16`: endpoint `FILE_TOO_LARGE` error contract is surfaced in slot + aggregate summary

4. Production endpoint probes (`platform-supercharged.vercel.app`):
   - `POST /api/studio/gemini-upload` with `{ action: "start" }`: `HTTP 200` + resumable `uploadUrl`.
   - Multipart upload with `Video_13.mp4` (63 MB): `HTTP 413` + `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`.
   - Multipart upload with `Video_12.mp4` (6.1 MB): `HTTP 413` + `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`.
   - Conclusion: deployed multipart path is blocked by Vercel payload limits, independent of Gemini logic.

5. Direct resumable end-to-end (production):
   - `start` on deployed endpoint returns `uploadUrl`.
   - Binary upload to Gemini `uploadUrl` succeeds when `fileSize` is exact.
   - `finalize` on deployed endpoint returns normalized payload with `fileUri`.
   - Final result for `Video_13.mp4` (63 MB): success via direct path (`finalize_ok=true`).

6. Frontend compile/type-check (after transport selection patch):
   - Command: `npm run build` (in `frontend/`)
   - Result: PASS

## Contract Verified
- Error payload supports:
  - `code`
  - `message`
  - `retryable`
  - `details` (optional)
  - `error` (legacy compatibility alias)

## Notes
- The observed UI message `most clips exceed the allowed size` maps to `FILE_TOO_LARGE`, which can be triggered by upstream `413`.
- In production the client must avoid multipart route for binary uploads and use direct resumable flow (`start/upload/finalize`).
- Playwright suite in this local environment is currently unstable due environment/runtime mismatch (blank-page/timeouts), so deployment diagnosis was based on direct production HTTP probes with real files.
