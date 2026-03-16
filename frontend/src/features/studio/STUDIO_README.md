# Studio — AI Production Pipelines

Two fully self-contained production pipelines living at `/studio/`.

## Architecture

```
src/
  app/
    studio/
      layout.tsx              ← shared nav bar (Canvas ← | Studio | RF | Illus)
      page.tsx                ← pipeline selection landing
      real-footage/page.tsx   ← Real Footage pipeline page
      illustrations/page.tsx  ← Illustrations pipeline page
    api/studio/
      gemini/route.ts         ← Gemini proxy (vision / generate / colorize)
      openai/route.ts         ← OpenAI proxy (text completion / structured output)
      replicate/
        route.ts              ← Start Replicate prediction
        [id]/route.ts         ← Poll Replicate prediction

  features/studio/
    _shared/
      utils.ts                ← fileToBase64, extractVideoFrames, nanoid, sleep
      services/
        gemini.ts             ← analyzeWithVision, generateImage, colorizeSketch
        openai.ts             ← chatWithOpenAI
        replicate.ts          ← startPrediction, pollPrediction, waitForPrediction
      StagesStepper.tsx       ← step indicator component
      ImageUploader.tsx       ← drag-and-drop file input
      GeneratingState.tsx     ← spinner + message
      ErrorBlock.tsx          ← error display + retry button

    real-footage/
      types.ts                ← DetectedAction, KeyframeItem, VideoItem, ...
      hooks/useRealFootage.ts ← Zustand store (persisted to localStorage)
      stages/
        Stage1Creative.tsx    ← Upload video → extract frames → Gemini analysis
        Stage2Actions.tsx     ← Review/enrich detected actions
        Stage3Keyframes.tsx   ← Generate keyframe images per action
        Stage4Videos.tsx      ← Animate keyframes with Kling v2.1
      RealFootageFlow.tsx     ← Orchestrator + StagesStepper

    illustrations/
      types.ts                ← ColorizedItem, PromptItem, VideoItem, ...
      hooks/useIllustrations.ts ← Zustand store (persisted to localStorage)
      stages/
        Stage1Colorize.tsx    ← Upload B&W sketches → Gemini colorize
        Stage2Prompts.tsx     ← Review/edit video prompts
        Stage3Videos.tsx      ← Animate colorized images with Kling v2.1
      IllustrationsFlow.tsx   ← Orchestrator + StagesStepper
```

## Environment Variables Required

```env
GOOGLE_AI_API_KEY=...          # Gemini Vision + Imagen 3 + Gemini 2.0 Flash image gen
REPLICATE_API_TOKEN=...        # Already required for canvas; reused here
OPENAI_API_KEY=...             # Already required; used for prompt generation

# Optional — enables LoRA-stylized video for Illustrations
ILLUSTRATION_LORA_URL=...
ILLUSTRATION_LORA_TRIGGER=...
```

## Real Footage Pipeline

| Stage | Input | AI Model | Output |
|---|---|---|---|
| 1. Upload & Analyze | Video file (browser) | Gemini 1.5 Flash (vision) | Creative analysis + detected actions |
| 2. Review Actions | Detected actions | Gemini 1.5 Flash (vision) | Enriched cinematic descriptions |
| 3. Generate Keyframes | Enriched prompts | Imagen 3.0 | Keyframe images (base64) |
| 4. Animate Videos | Keyframe images | Kling v2.1 (Replicate) | 5s video clips |

## Illustrations Pipeline

| Stage | Input | AI Model | Output |
|---|---|---|---|
| 1. Upload & Colorize | B&W sketch images | Gemini 2.0 Flash image gen | Colorized images (base64) |
| 2. Generate Prompts | Colorized images | Gemini 1.5 Flash (vision) | Video animation prompts |
| 3. Animate Videos | Colorized image + prompt | Kling v2.1 (Replicate) | 5s video clips |

## Key Design Decisions

- **Human-in-the-loop at every stage**: no automatic progression — user must click Confirm/Continue
- **Individual regeneration**: every item has a Regenerate button independent of others
- **Parallel generation**: `Promise.all` used for Generate All operations
- **localStorage persistence**: Zustand persist middleware (File objects excluded via `partialize`)
- **No new npm dependencies**: all API calls via native fetch; route handlers as server-side proxies
- **Zero backend changes**: entirely in Next.js app directory route handlers + client features
