# Spec: Real Footage Step 1 Upload Reliability

## Status
In progress (diagnosis validated in production)

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

Step 1 can still hit a server-side multipart proxy path (`POST /api/studio/gemini-upload` with `form-data`). In Vercel serverless this path is constrained by platform payload limits. When payload is blocked at the edge/runtime, all slots move to `error`, surfacing the aggregate banner.

Secondary causes to handle explicitly:
- Missing `GOOGLE_AI_API_KEY` in deployment env.
- Unsupported MIME/container returned by browser (`video/quicktime`, etc.).
- Timeout during Gemini processing poll.

## Root Cause Validated (2026-03-18, production probes)
- Deployed endpoint `POST /api/studio/gemini-upload` with `action=start` returns `200` and resumable `uploadUrl`.
- Deployed endpoint multipart upload fails with `413 FUNCTION_PAYLOAD_TOO_LARGE`:
  - 63 MB clip (`Video_13.mp4`) -> `413`
  - 6.1 MB clip (`Video_12.mp4`) -> `413`
- Full direct path (`start` -> browser upload to Gemini upload URL -> `finalize`) succeeds for `Video_13.mp4` and returns `fileUri`.
- Therefore, production failures are caused by requests still taking the multipart path through Vercel. Gemini/API key are not the blocker.

## Additional Root Cause (2026-03-18)
- Browser direct upload to Gemini returned `Failed to fetch` intermittently in UI despite upstream `200` responses in network traces.
- Proxy chunk workaround through Vercel failed with:
  - `FUNCTION_PAYLOAD_TOO_LARGE` for large chunks due Vercel request body limits.
  - Gemini resumable constraint requiring `8MB` chunk granularity for non-final chunks.
- Combined effect: Vercel request size limits and Gemini chunk constraints are incompatible for browser->Vercel chunk relay.

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
- No hard max-size block in client for video uploads (avoid false negatives on large clips).
- Optional per-file duration check (if needed after field testing).

Rejected files should become slots in `error` with immediate local message (no network call).

### C) Upload transport strategy
Implement resilient upload path in `/api/studio/gemini-upload`:
- Keep multipart proxy path only as legacy fallback.
- Production path must be two-phase direct upload:
  - `action=start` (server): create Gemini resumable session and return `uploadUrl`.
  - Browser uploads binary directly to Gemini `uploadUrl` (no binary payload through Vercel route).
  - `action=finalize` (server): poll and return normalized `{ fileUri, mimeType, name, displayName }`.
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
8. Large clip uploads (e.g. >50 MB) do not send binary payload through app server and complete via direct Gemini resumable upload flow.

## Endpoint Validation Gate
Before implementation is considered done, validate `/api/studio/gemini-upload` with evidence for:
- Request parsing (`multipart/form-data`) and file presence checks.
- MIME and size policy enforcement.
- Small-file multipart upload path.
- Large-file direct-resumable handshake path (`start` + browser upload + `finalize`).
- Stable error contract (`code`, `message`, `retryable`) for known failure modes.
- Polling behavior to `ACTIVE` and timeout classification.

## Spec-Driven Correction Plan
1. Use Supabase Storage as upload staging.
- Add `storage_start` action in `/api/studio/gemini-upload` to mint signed upload URL/token for a temp object.
- Browser uploads video directly to Supabase Storage using signed URL (no large request to Vercel).

2. Ingest from Supabase to Gemini on server side.
- Add `storage_ingest` action in `/api/studio/gemini-upload`.
- Route downloads staged object from Supabase with service-role credentials.
- Route uploads buffer to Gemini (multipart/resumable as needed), polls to `ACTIVE`, returns normalized file ref.
- Cleanup staged object after successful ingest (best effort).

3. Keep backwards compatibility.
- Preserve existing `start/finalize` and legacy multipart paths to avoid breaking other workflows.
- Stage 1 switches to `storage_start -> uploadToSignedUrl -> storage_ingest`.

4. Validation gate.
- `npm run build` must pass.
- Verify with real problematic clips.
- Verify no `FUNCTION_PAYLOAD_TOO_LARGE` from Vercel during client upload phase.
- Verify returned payload includes `fileUri`.

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
1. Remove hard max-size guardrails for video uploads in client/server app layer.
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
