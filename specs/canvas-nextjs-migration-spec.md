# Spec: Canvas — Migración a Next.js API Routes

## Status
In progress

## Contexto y Problema

El Canvas depende de un backend FastAPI separado (`http://localhost:8000`) que en la práctica
nunca está corriendo. Esto causa que **43 de 73 tests E2E fallen**, que el Canvas no funcione
en Vercel sin infraestructura adicional, y que el modelo de deployment sea más complejo de lo necesario.

Studio ya demostró el patrón correcto: Next.js API routes autosuficientes, mocks en tests E2E.

### Root cause de los test failures

- `AuthGuard.init()` → `fetchCredits()` → `api.get("/credits")` → `http://localhost:8000/credits`
- `waitUntil: 'networkidle'` bloquea hasta que ese fetch falla/timeout (~15s)
- Todos los tests que hacen `page.goto('/canvas', { waitUntil: 'networkidle' })` fallan

## Arquitectura objetivo

```
ANTES:
  Frontend (Next.js :3000) → api.ts → FastAPI (:8000) → Replicate / Supabase

DESPUÉS:
  Frontend (Next.js :3000) → api.ts → Next.js API Routes → Replicate / Supabase
                                                           ↑
                                          (mismo patrón que Studio)
```

Todos los endpoints de generación y datos viven en `/api/canvas/*` dentro del mismo proceso Next.js.
No se requiere ningún proceso Python adicional.

## Rutas Next.js a crear

### Datos (Supabase directo)

| Ruta | Método | Descripción |
|---|---|---|
| `/api/canvas/credits` | GET | Leer balance de créditos del usuario |
| `/api/canvas/models` | GET | Lista de modelos disponibles (incluye plataforma) |
| `/api/canvas/workflows` | GET | Listar workflows del usuario |
| `/api/canvas/workflows` | POST | Crear workflow |
| `/api/canvas/workflows/[id]` | GET | Obtener workflow por ID |
| `/api/canvas/workflows/[id]` | PATCH | Actualizar workflow |
| `/api/canvas/workflows/[id]` | DELETE | Eliminar workflow |
| `/api/canvas/projects` | GET | Listar proyectos |
| `/api/canvas/projects` | POST | Crear proyecto |
| `/api/canvas/generations` | GET | Historial de generaciones |
| `/api/canvas/progress/[id]` | GET | Estado de una generación |

### Generación (Replicate)

| Ruta | Método | Descripción |
|---|---|---|
| `/api/canvas/generate` | POST | Texto→imagen (FLUX 1.1 Pro) |
| `/api/canvas/edit` | POST | Editar imagen (FLUX Kontext Pro) |
| `/api/canvas/video` | POST | Imagen→video (Kling v2.1) |
| `/api/canvas/multiref` | POST | Multi-referencia (FLUX 2 Pro) |

### Uploads

| Ruta | Método | Descripción |
|---|---|---|
| `/api/canvas/uploads/image` | POST | Subir imagen a Supabase Storage |

## Cambios en el Frontend

### `lib/api.ts`
- Cambiar `BACKEND_URL` de `NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"` a `""`
  (rutas relativas: `/credits` → `/api/canvas/credits`)
- Alternativamente: prefijo configurable `NEXT_PUBLIC_API_PREFIX = "/api/canvas"`

### `lib/executor.ts`
- Las rutas que usa: `/generate`, `/edit`, `/video`, `/generate-multi-ref`, `/progress/{id}`
- Se actualizan a: `/api/canvas/generate`, etc. — automático si cambia `BACKEND_URL`

### `store/auth.ts`
- `fetchCredits()` llama `api.get("/credits")` → pasará a `/api/canvas/credits`

### `store/canvas.ts`
- Carga workflows: `api.get("/workflows/{id}")` → `/api/canvas/workflows/{id}`

### `app/canvas/page.tsx`
- Guarda workflows: `api.post("/workflows", ...)` → `/api/canvas/workflows`
- Carga: `api.get("/workflows/{id}")` → `/api/canvas/workflows/{id}`

### `components/canvas/ProjectSelector.tsx`
- Proyectos: `api.get("/projects")`, `api.post("/projects", ...)` → `/api/canvas/projects/*`

### `components/canvas/WorkflowControls.tsx`
- Save/patch: `/workflows/{id}` → `/api/canvas/workflows/{id}`

## Variables de entorno necesarias (`.env.local`)

```env
# Ya configuradas para Studio — reusar
NEXT_PUBLIC_SUPABASE_URL=https://qxhuyctdrbdbzprblhmz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Nuevas para Canvas generation
REPLICATE_API_TOKEN=r8_...   # Para FLUX y Kling

# Opcionales (ya existen para Studio)
GOOGLE_AI_API_KEY=...        # Prompt enrichment si se quiere
```

## Patrón de autenticación en API routes

Cada ruta de Canvas debe verificar el JWT de Supabase:

```typescript
// lib/canvas-auth.ts (nuevo helper compartido)
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export async function getCanvasUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id, isAnonymous: user.is_anonymous ?? false };
}
```

## Patrón de generación con Replicate

Las rutas de generación siguen el patrón:
1. Verificar auth y deducir créditos en Supabase
2. Crear registro en tabla `generations`
3. Lanzar predicción en Replicate (async)
4. Devolver `{ generation_id }` inmediatamente
5. Background: poll Replicate hasta completion, escribir resultado en `generation_progress` y `generations`

```typescript
// Patrón para generate route
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function POST(req: NextRequest) {
  const user = await getCanvasUser(req);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // ... deducir créditos, crear generation, lanzar prediction en background
  return NextResponse.json({ generation_id });
}
```

## Plan de tests E2E

### Tests 01-04 (UI Shell, Nodes, Projects, Pipeline Gate)
**Estrategia**: Mockear `/api/canvas/credits`, `/api/canvas/models`, `/api/canvas/workflows` via `page.route()`.
Eliminar `waitUntil: 'networkidle'` → usar `waitUntil: 'domcontentloaded'` + esperar elementos.

```javascript
// beforeEach compartido para tests 01-04
async function mockCanvasAPI(page) {
  await page.route('**/api/canvas/credits', (route) =>
    route.fulfill({ json: { generate_credits: 10, edit_credits: 5, animate_credits: 2 } })
  );
  await page.route('**/api/canvas/models', (route) =>
    route.fulfill({ json: { models: PLATFORM_MODELS } })
  );
  await page.route('**/api/canvas/workflows', (route) =>
    route.fulfill({ json: { workflows: [] } })
  );
  await page.route('**/api/canvas/projects', (route) =>
    route.fulfill({ json: { projects: [] } })
  );
}
```

### Tests 10, 20, 30 (Full evaluation, Deep eval, MultiRef/Video)
**Estrategia**: Reescribir para mockear generación (como Studio).
Los tests actuales requieren Replicate real (4-5 min por test).
Con mocks son deterministas y corren en <1s.

```javascript
function mockCanvasGenerate(page) {
  const GEN_ID = 'test-gen-001';
  page.route('**/api/canvas/generate', (route) =>
    route.fulfill({ json: { generation_id: GEN_ID } })
  );
  page.route(`**/api/canvas/progress/${GEN_ID}`, (route) =>
    route.fulfill({ json: {
      generation_id: GEN_ID,
      image_url: 'https://cdn.example.com/test-image.jpg',
      progress: { status: 'completed', progress_pct: 100, stage: 'Done' }
    }})
  );
}
```

## Issues a corregir en código existente

### E-01: `api.ts` usa `BACKEND_URL` hardcoded a `localhost:8000`
**Fix**: Cambiar a rutas relativas con prefijo `/api/canvas`

### E-02: `executor.ts` usa paths sin prefijo (`/generate`, `/edit`, etc.)
**Fix**: Automático si `api.ts` usa el prefijo correcto

### E-03: Tests 01-04 usan `waitUntil: 'networkidle'` que bloquea
**Fix**: Cambiar a `domcontentloaded` + mockear API calls + esperar elemento específico

### E-04: Tests 10, 20, 30 requieren FastAPI real + Replicate real
**Fix**: Reescribir con mocks de Next.js routes (misma estrategia que Studio 40/41)

### E-05: `dismissWelcomeOverlay` en _helpers.js puede fallar si overlay no aparece
**Fix**: Agregar `{ timeout: 10000 }` y manejo de caso donde no hay overlay

### E-06: Tests 10/20 crean usuarios reales en Supabase (slow setup, flakey)
**Fix**: Reusar el patrón `e2e_auth_bypass` cookie de Studio

### E-07: `WelcomeOverlay` — `dismissWelcomeOverlay` busca "Start blank" pero puede tener otro texto
**Fix**: Verificar texto real del botón y alinear

## Acceptance Criteria

1. `npm run test:e2e` — todos los tests E2E de canvas (01-04, 10, 20, 30) pasan
2. Studio tests (40, 41) siguen pasando — sin regresión
3. `npm run build` pasa sin errores TypeScript
4. Canvas funciona en `http://localhost:3000` sin correr FastAPI
5. Operaciones de Canvas (generate, edit, video) funcionan con `REPLICATE_API_TOKEN` en `.env.local`
6. Credits se leen/deducen desde Supabase directamente
7. Workflows se guardan/cargan desde Supabase directamente

## Implementation Checklist

### Fase 1: Infraestructura base (no rompe nada)
- [ ] Crear `frontend/src/lib/canvas-auth.ts` — helper JWT verification
- [ ] Crear `frontend/src/app/api/canvas/credits/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/models/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/workflows/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/workflows/[id]/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/projects/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/generations/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/progress/[id]/route.ts`

### Fase 2: Generación (requiere REPLICATE_API_TOKEN)
- [ ] Crear `frontend/src/app/api/canvas/generate/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/edit/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/video/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/multiref/route.ts`
- [ ] Crear `frontend/src/app/api/canvas/uploads/image/route.ts`

### Fase 3: Frontend wiring
- [ ] Actualizar `lib/api.ts` — rutas relativas con prefijo `/api/canvas`
- [ ] Verificar `lib/executor.ts` — rutas correctas
- [ ] Verificar `store/auth.ts` — `fetchCredits()` apunta correcto
- [ ] Verificar `store/canvas.ts` — workflow loading apunta correcto
- [ ] Verificar `app/canvas/page.tsx` — workflow save/load
- [ ] Verificar `components/canvas/ProjectSelector.tsx`
- [ ] Verificar `components/canvas/WorkflowControls.tsx`

### Fase 4: Tests E2E
- [ ] Reescribir `tests/e2e/01_canvas_shell.spec.js` con mocks
- [ ] Reescribir `tests/e2e/02_canvas_nodes.spec.js` con mocks
- [ ] Reescribir `tests/e2e/03_projects_workflows.spec.js` con mocks
- [ ] Reescribir `tests/e2e/04_pipeline_ui.spec.js` con mocks
- [ ] Reescribir `tests/e2e/10_canvas_full_eval.spec.js` con mocks
- [ ] Reescribir `tests/e2e/20_canvas_deep_eval.spec.js` con mocks
- [ ] Reescribir `tests/e2e/30_multiref_video_eval.spec.js` con mocks
- [ ] Confirmar 43/43 canvas tests pasan
- [ ] Confirmar 30/30 Studio tests siguen pasando
- [ ] Confirmar TypeScript build pasa
