# Real Footage Step 1 — Endpoint Validation Report

Date: 2026-03-17

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

4. Real-world clip verification (outside app proxy):
   - Direct Gemini resumable upload (same API key) for `Video_13.mp4` (63 MB): `HTTP 200`
   - Local endpoint `/api/studio/gemini-upload` for same file before cap adjustment: `HTTP 413 FILE_TOO_LARGE`
   - Conclusion: failure source was local max-size guardrail, not Gemini key validity.

5. Vercel-safe upload flow verification (after fix):
   - `POST /api/studio/gemini-upload` with `{ action: "start" }` returns `uploadUrl`
   - Browser-equivalent upload to returned `uploadUrl` with 63 MB clip returns Gemini file metadata (`state=PROCESSING`)
   - `POST /api/studio/gemini-upload` with `{ action: "finalize", fileName }` returns normalized file ref payload
   - Final result: `HTTP 200` with `fileUri` for the same 63 MB clip

## Contract Verified
- Error payload supports:
  - `code`
  - `message`
  - `retryable`
  - `details` (optional)
  - `error` (legacy compatibility alias)

## Notes
- Direct ad-hoc HTTP probing from this sandbox environment was limited by local port binding/loopback constraints.
- Validation was completed through production code-path checks (`next build`) and E2E automation.
