# Spec: Real Footage Step 1 Upload Reliability

## Status
Draft for validation

## Context
In `Studio -> Real Footage -> Step 1`, users are seeing: `All uploads failed — remove the clips and try again.`

This banner is an aggregate UI state shown when every upload slot ends in `error` and none are `ready`.

## Current Behavior (Validated in code)
- The UI banner is triggered when `hasErrors && readyCount === 0 && !uploading`.
- Each clip upload calls `/api/studio/gemini-upload` through `uploadToGemini()`.
- The server route reads the whole video into memory (`file.arrayBuffer()`), then forwards as `uploadType=multipart`.
- The route itself documents hard limits: Vercel body size (Hobby ~4.5 MB / Pro ~50 MB) and “resumable upload (future work)”.

## Root Cause Hypothesis
Primary cause: architecture mismatch for real video clips.

Step 1 currently relies on a server-side multipart proxy path that is not robust for real-world video sizes and serverless limits. When clips exceed request/runtime constraints (or Gemini rejects multipart payloads), all slots transition to `error`, which surfaces the aggregate banner.

Secondary causes to handle explicitly:
- Missing `GOOGLE_AI_API_KEY` in deployment env.
- Unsupported MIME/container returned by browser (`video/quicktime`, etc.).
- Timeout during Gemini processing poll.

## Root Cause Validated (2026-03-17)
- Direct upload to Gemini Files API with the configured `GOOGLE_AI_API_KEY` succeeds for a 63 MB clip.
- Local endpoint `/api/studio/gemini-upload` rejected that same file with:
  - `code=FILE_TOO_LARGE`
  - `message=File too large. Max allowed is 50 MB.`
- Therefore the active production issue is a **local guardrail mismatch** (our cap too low), not an invalid Gemini key.

## Goals
1. Make Step 1 reliable for realistic clip sizes.
2. Return deterministic, user-actionable errors.
3. Prevent silent mass-failure UX.
4. Keep current Step 2+ flow unchanged.

## Non-Goals
- Redesign of the full Real Footage pipeline.
- Migrating analysis models.
- Replacing Zustand store behavior beyond upload metadata.

## Product Requirements
1. Uploads up to target size budget must succeed consistently in production.
2. Unsupported files are rejected before network upload.
3. If upload fails, user sees precise reason + remediation.
4. Mixed outcomes are supported (some clips ready, some failed).
5. No regression in existing mocked E2E flow.
6. Endpoint `/api/studio/gemini-upload` is explicitly validated end-to-end before rollout.

## Technical Design

### A) Error taxonomy and contract
Standardize `/api/studio/gemini-upload` JSON errors:
- `code`: `MISSING_API_KEY | FILE_TOO_LARGE | UNSUPPORTED_MIME | UPLOAD_TIMEOUT | UPSTREAM_ERROR | INVALID_FORM`
- `message`: user-safe message
- `retryable`: boolean
- `details` (optional): upstream status / diagnostics

`uploadToGemini()` will parse and map these codes to stable UI messages.

### B) Preflight validation (client)
Before sending to API:
- MIME allowlist for Gemini-supported video types.
- Configurable max size (e.g. `NEXT_PUBLIC_RF_MAX_UPLOAD_MB`) with high default aligned to Gemini capability.
- Optional per-file duration check (if needed after field testing).

Rejected files should become slots in `error` with immediate local message (no network call).

### C) Upload transport strategy
Implement resilient upload path in `/api/studio/gemini-upload`:
- Keep multipart path only for small files.
- Add resumable upload path for larger files (Gemini Files API resumable flow).
- Avoid unnecessary `Content-Length` manual header where runtime may override/reject.
- Preserve existing poll-to-`ACTIVE` logic with capped backoff and clearer timeout errors.

### D) Observability
Add structured server logs for upload attempts:
- file size, mime, upload mode (multipart/resumable), elapsed time, upstream status, error code.

Add client console telemetry hooks (non-blocking) for failure code distribution.

### E) UX hardening
In `Stage1Creative`:
- Keep per-slot error text visible.
- Aggregate banner should include top reason summary when all fail.
- Add “Remove failed clips” quick action.

## Acceptance Criteria
1. Given valid clips under size policy, at least one clip reaches `Ready for analysis` in production-grade env.
2. Given oversized clip, UI shows `File too large` without sending upload request.
3. Given missing API key, slot error shows explicit config message.
4. Given mixed batch (valid + invalid), valid clips can proceed to Analyze.
5. The aggregate message only appears when all slots failed and includes actionable reason.
6. Existing tests for RF-02/RF-03 keep passing.
7. Endpoint validation report exists for `/api/studio/gemini-upload` covering success path, error taxonomy, and timeout behavior.

## Endpoint Validation Gate
Before implementation is considered done, validate `/api/studio/gemini-upload` with evidence for:
- Request parsing (`multipart/form-data`) and file presence checks.
- MIME and size policy enforcement.
- Small-file multipart upload path.
- Large-file resumable upload path (when feature flag enabled).
- Stable error contract (`code`, `message`, `retryable`) for known failure modes.
- Polling behavior to `ACTIVE` and timeout classification.

## Test Plan

### Unit
- `uploadToGemini()` maps server error codes correctly.
- Client preflight validator (mime, size).
- Server error serializer returns stable shape.

### API Integration (route-level)
- multipart success (small file).
- resumable success (large-file path, mocked upstream).
- explicit failures: 400 invalid form, 413-like oversized, 500 missing key, upstream non-2xx.

### E2E (Playwright)
- Step 1: one file succeeds -> ready state.
- Step 1: all files fail -> aggregate error banner + per-slot reason.
- Step 1: mixed results -> warning + analyze enabled.

## Rollout Plan
1. Raise default size guardrails (client + server) and keep env overrides:
   - `NEXT_PUBLIC_RF_MAX_UPLOAD_MB`
   - `RF_MAX_UPLOAD_MB`
2. Ship behind feature flag `RF_RESUMABLE_UPLOAD` (default on in staging, off in prod initially).
3. Validate with real clips in staging (small, medium, large, >50MB).
4. Enable in prod for internal users.
5. Monitor failure-code distribution for 48h.
6. Remove legacy-only path once stable.

## Risks
- Gemini resumable API edge cases (session expiration, chunk retries).
- Runtime differences local vs Vercel.
- Increased implementation complexity in route handler.

## Implementation Checklist
- [ ] Define shared upload error types.
- [ ] Add client preflight validation and messages.
- [ ] Implement resumable upload branch in route.
- [ ] Improve route logging and timeout classification.
- [ ] Add aggregate failure reason summary in Step 1 UI.
- [ ] Add/adjust unit + API + E2E tests.
- [ ] Produce endpoint validation evidence for `/api/studio/gemini-upload` (test output + sample error payloads).
- [ ] Stage validation with real files.
