# Add Endpoint — scaffold a new FastAPI generation router

Argument: `$ARGUMENTS` — e.g. `POST /upscale` or `GET /exports`

## Steps

1. **Read `backend/routers/generate.py`** as the canonical template for generation endpoints.
   For non-generation CRUD, read `backend/routers/projects.py`.

2. **Create `backend/routers/{name}.py`**:

   ```python
   from fastapi import APIRouter, Depends, Request
   from auth import get_auth, AuthContext, get_supabase
   from credit_manager import check_and_deduct
   from limiter import limiter

   router = APIRouter()

   @router.post("/your-path")
   @limiter.limit("20/minute")          # only on generation endpoints
   async def handler(request: Request, req: RequestModel, auth: AuthContext = Depends(get_auth)):
       if auth.user_id:
           await check_and_deduct(sb, auth.user_id, "generate", auth.is_anonymous)
       ...
   ```

   **Required for generation endpoints:**
   - `request: Request` as first positional parameter (slowapi needs it)
   - `@limiter.limit("20/minute")` decorator
   - Pass `auth.is_anonymous` to `check_and_deduct`
   - UUID validation before any Supabase query on UUID columns:
     ```python
     import uuid as _uuid
     try:
         _uuid.UUID(some_id)
     except ValueError:
         raise HTTPException(status_code=404, detail="Not found")
     ```

3. **Mount in `backend/main.py`**:
   ```python
   from routers import ..., newrouter
   app.include_router(newrouter.router)
   ```

4. **Python syntax check**: `cd backend && python -c "import main"`

## Credit modes

| Mode string | Column deducted | Cost |
|---|---|---|
| `"generate"` | generate_credits | 1 |
| `"edit"` | edit_credits | 1 |
| `"video"` | animate_credits | 1 |
| `"multi_ref"` | generate_credits | 2 |

Add new modes to `CREDIT_COSTS` dict in `backend/credit_manager.py`.
