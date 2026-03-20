# Spec: Studio Pipeline Reliability — v2

## Status
Complete

## Context
Both pipelines (Illustrations, Real Footage) are deployed on Vercel and accessible
to internal Elkano Data users. This spec addresses reliability issues identified
during pre-release evaluation.

## Issues

### I-01: Illustrations — localStorage quota overflow [CRITICAL]
**Root cause**: `useIllustrations.ts` `partialize` persists the complete `colorized`,
`prompts`, and `videos` arrays, including all base64 image fields:
- `ColorizedItem.originalBase64` — uploaded sketch (~100–500 KB each)
- `ColorizedItem.colorizedBase64` — Gemini-generated colorized image (~100–500 KB)
- `ColorizedItem.referenceBase64` — optional color reference (~50–200 KB)
- `PromptItem.imageBase64` — carried colorized or external image (~100–500 KB)
- `PromptItem.endImageBase64` — optional end frame (~100–200 KB)
- `VideoItem.imageBase64` / `VideoItem.endImageBase64` — same, carried to Stage 3

3–5 sketches × (original + colorized + reference) ≈ **1.5–5 MB** of base64 per
session. Browser localStorage quota is 5–10 MB, so 3 images routinely overflows.

**Symptom**: "El almacenamiento está lleno" banner fires during or after colorization
— even when everything works correctly — because the Zustand persist write throws
`QuotaExceededError`, which the `safeStorage` wrapper catches and reports as a
`studio:storage-full` event.

**Contrast with Real Footage**: `useRealFootage` explicitly strips base64 from
keyframes and videos in `partialize` (sets to `null`/`""`, resets status to `idle`).
Illustrations never got this treatment.

### I-02: Ambiguous Gemini video analysis error [LOW]
**Root cause**: `gemini/route.ts:176` returns a single error string when Gemini
returns empty text for video analysis. It conflates unsupported format, expired
Gemini File API reference, and transient API error into one message.

### I-03: Missing event tracking [MEDIUM]
`usage_events` is missing events for:
- `image_generated` — Gemini `generate` mode (keyframe generation in Real Footage)
- `video_analyzed` — Gemini `video` mode (Real Footage Step 1 analysis)

Currently tracked: `prompt_enriched`, `colorize_succeeded/failed`, `video_started`.

## Non-Issues (confirmed)
- "no files" message: not a literal UI string. Likely confused with Supabase
  `downloadError.message` ("Object not found") surfaced through `storage_ingest`.
  Error contract is correct.
- Real Footage upload: confirmed working (16/16 E2E tests pass).
- Real Footage localStorage: correctly excludes base64 (null + idle reset pattern).

## Fix Plan

### Fix I-01: Strip base64 from Illustrations persistence
**File**: `useIllustrations.ts:391–396`

Update `partialize` to mirror the Real Footage pattern:
- `colorized`: strip `originalBase64`, `colorizedBase64`, `referenceBase64`;
  reset `status → "idle"`, `approved → false`
- `prompts`: strip `imageBase64`, `endImageBase64`; reset `promptStatus → "idle"`,
  `approved → false`
- `videos`: strip `imageBase64`, `endImageBase64`; reset status from `"done" → "idle"`;
  **keep `videoUrl`** (external URL, small, useful for re-download)

Guards added to `colorizeItem` and `generateVideo` to return a descriptive error
when called without the required base64 (items reloaded from stale persisted state).

**On reload UX**:
- Items exist in their arrays (metadata preserved: id, mimeType, instruction, prompt,
  action, videoUrl) but without images.
- Status is `idle` — items appear as ready to re-generate.
- If user tries to colorize a reloaded item, they see: _"Image not available —
  remove this item and re-upload the sketch."_
- If user tries to generate a video for a reloaded item, they see: _"Image not
  available — go back to Prompts and regenerate."_

### Fix I-02: Improve video analysis error message
**File**: `gemini/route.ts:175–177`

Separate the empty-text case from Gemini API errors. Add clearer message that
distinguishes empty response from upstream errors.

### Fix I-03: Add missing tracking events
**File**: `gemini/route.ts`

- `generate` mode success → `logStudioEvent(..., "image_generated", { pipeline })`
- `video` mode success → `logStudioEvent(..., "video_analyzed", { file_count })`

## Acceptance Criteria
1. No `studio:storage-full` event fires during a normal Illustrations session with
   5+ sketches colorized.
2. On page reload mid-session, Illustrations items appear in idle state; attempting
   to colorize without an original shows a clear re-upload message.
3. `video_analyzed` and `image_generated` events appear in `usage_events` on success.
4. All 16 E2E tests continue passing (`npm run test:e2e`).
5. `npm run build` passes with no TypeScript errors.

## Implementation Checklist
- [x] Strip base64 from `useIllustrations` partialize
- [x] Add guard in `colorizeItem` for null `originalBase64`
- [x] Add guard in `generateVideo` for empty `imageBase64`
- [x] Improve video analysis error message in `gemini/route.ts`
- [x] Add `image_generated` tracking in `gemini/route.ts`
- [x] Add `video_analyzed` tracking in `gemini/route.ts`
- [x] Fix IL E2E test selectors to match actual component text (14/14 IL tests passing)
- [x] Confirm 30/30 Studio E2E tests pass (16 RF + 14 IL)
- [x] Confirm TypeScript build passes
