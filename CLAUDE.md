# Canvas Platform — Claude Context

> Read this first. Full spec: `PLAN.md`. Dev skills: `.claude/commands/`.

## Stack at a glance

| Layer | Tech | Entry point |
|---|---|---|
| Frontend | Next.js 14, React Flow, Zustand, Tailwind | `frontend/src/app/canvas/page.tsx` |
| Backend | FastAPI 0.111, Python 3.11 | `backend/main.py` |
| DB/Auth | Supabase (Postgres + ES256 JWT) | `backend/auth.py` |
| AI | Replicate (FLUX, Kling) | `backend/routers/{generate,edit,video,multiref}.py` |

## Critical file map

```
backend/
  main.py              — app, SlowAPIMiddleware, router mounts
  auth.py              — get_auth() → AuthContext(user_id, is_anonymous, plan, org_id)
  credit_manager.py    — check_and_deduct(), get_balance(), _seed_default_credits()
  limiter.py           — shared slowapi Limiter instance (20/min on gen endpoints)
  routers/
    generate.py        — POST /generate   (FLUX 1.1 Pro)
    edit.py            — POST /edit       (FLUX Kontext Pro)
    video.py           — POST /video      (Kling v2.1)
    multiref.py        — POST /generate-multi-ref (FLUX 2 Pro)
    models.py          — GET /models/{project_id}, GET /models/global
    credits.py         — GET/POST /credits
    workflows.py       — CRUD /workflows
    projects.py        — CRUD /projects
    uploads.py         — POST /uploads/image → Supabase Storage
    progress.py        — GET/POST /progress/{id}
    profiles.py        — GET/PATCH /profiles/me

frontend/src/
  app/canvas/page.tsx        — main canvas page, WelcomeOverlay logic
  store/canvas.ts            — Zustand: nodes, edges, nodeStates, loadGraph()
  store/auth.ts              — Zustand: user, credits, isAnonymous, fetchCredits()
  lib/executor.ts            — BFS upstream + topo-sort + Replicate polling (1500ms)
  lib/api.ts                 — typed fetch wrapper (adds Bearer token)
  components/canvas/
    Canvas.tsx               — ReactFlow wrapper + nodeTypes registry
    Toolbar.tsx              — node palette (drag to add)
    RunPipelineButton.tsx    — runs executePipeline(), cancel, empty-guard
    WorkflowControls.tsx     — save/load workflow (Cmd+S)
    ProjectSelector.tsx      — dropdown + inline create
    WelcomeOverlay.tsx       — shown on empty canvas, no workflow param
    DemoTemplateButton.tsx   — loads demo graph into store
  components/nodes/
    PromptNode.tsx           — text input, outputs "text"
    ModelSelectorNode.tsx    — dropdown, outputs "config"; fetches /models/global for multiref/video
    GenerateNode.tsx         — calls /generate, shows model label + completion
    EditNode.tsx             — calls /edit
    VideoNode.tsx            — calls /video
    MultiRefNode.tsx         — calls /generate-multi-ref, up to 8 ref image inputs
    ImageOutputNode.tsx      — displays image + download
    VideoOutputNode.tsx      — displays video + download
  components/auth/
    UserMenu.tsx             — credits display (amber warning when low), Google/GitHub OAuth
    AuthGuard.tsx            — auto-signs in anonymously if no session
```

## Key invariants — NEVER break these

1. **UUID validation before every Supabase query on UUID columns** — `uuid.UUID(id)` in Python, returns 404/400 on ValueError. PostgreSQL throws `22P02` otherwise.
2. **Platform model IDs are NOT UUIDs** — `"platform-multiref-flux2pro"`, `"platform-video-kling"`. Check `PLATFORM_MODEL_MAP` in `multiref.py` before any DB lookup.
3. **`linkIdentity` is disabled in Supabase** — always use `signInWithOAuth` for social login.
4. **Rate limiting** — all generation endpoints already have `@limiter.limit("20/minute")` + `request: Request` as first param.
5. **Anonymous credits** — anonymous users seeded with 3/1/0 (gen/edit/anim). Real users get 10/5/2. Controlled by env vars `ANON_*_CREDITS`.
6. **`check_and_deduct` signature** — `(sb, user_id, mode, is_anonymous=False)`. Pass `auth.is_anonymous`.

## Data types for edge validation (`canvas.ts`)

| Source node | Output type |
|---|---|
| promptNode | `text` |
| modelSelectorNode | `config` |
| generateNode / editNode / multiRefNode | `image` |
| videoNode | `video` |

Incompatible connections are silently dropped (P8 in PLAN.md will add toast feedback).

## Adding a new generation endpoint — checklist

1. Add router file `backend/routers/newrouter.py` (see `generate.py` as template)
2. Import `limiter` from `limiter.py`, add `@limiter.limit("20/minute")`, `request: Request` first param
3. Pass `auth.is_anonymous` to `check_and_deduct`
4. Mount in `main.py`
5. Add node type: see `.claude/commands/add-node.md`

## Adding a new node type — checklist

1. Create `frontend/src/components/nodes/NewNode.tsx` (see `EditNode.tsx` as template)
2. Register in `Canvas.tsx` nodeTypes map
3. Export from `components/nodes/index.ts`
4. Add source/target data type to `getSourceDataType`/`getTargetDataType` in `canvas.ts`
5. Add to Toolbar drag palette

## Current score & next priorities

Score: **98/100 — Production Ready** — see `PLAN.md` for full tracker.

Session 6 completado (2026-03-15):
- Bucket `ai-assets` creado en Supabase Storage → uploads funcionando
- `GET /generations` endpoint + `/app/generations/` history page con thumbnails + paginación
- Workflow sharing toggle (Globe/Lock) con copia de URL al clipboard
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z) con history stack de 50 estados
- Node duplication (Ctrl+D) — clona nodos seleccionados
- Delete/Backspace elimina nodos seleccionados en ReactFlow
- linkIdentity → signInWithOAuth (OAuth anónimos corregido)
- enricher.py try/except + fallback (no rompe generaciones sin OPENAI_API_KEY)
- progress.py + multiref.py UUID validation (500 → 400)
- profiles.py upsert (404 → crea perfil si no existe)
- OnboardingBanner setTimeout en render → useEffect (memory leak)
- Handle colors EditNode/VideoNode (prompt=yellow)
- nodrag/nowheel en textareas
- MultiRef handle overflow corregido (top 83%/92%)
- Node widths normalizados a w-56 (Generate/Edit/Video)
- Pipeline Done banner global

Next pending:
- **P18** Edge labels con tipo de dato (text/image/config/video)
- **P15** Video job browser notification
- **P16** B2B org token rotation

Run `/project:sprint` to pick up next sprint items. Run `/project:add-node` or `/project:add-endpoint` for guided scaffolding.
