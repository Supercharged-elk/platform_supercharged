"""
Canvas Platform — FastAPI Backend
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

load_dotenv()

from limiter import limiter
from auth import get_supabase
from routers import generate, edit, video, multiref, models, progress, credits, workflows, profiles, projects, uploads, generations

app = FastAPI(title="Canvas Platform API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — configurable por variable de entorno
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(generate.router)
app.include_router(edit.router)
app.include_router(video.router)
app.include_router(multiref.router)
app.include_router(models.router)
app.include_router(progress.router)
app.include_router(credits.router)
app.include_router(workflows.router)
app.include_router(profiles.router)
app.include_router(projects.router)
app.include_router(uploads.router)
app.include_router(generations.router)


@app.on_event("startup")
async def validate_schema():
    sb = get_supabase()
    try:
        sb.table("generations").select("id, user_id, organization_id").limit(1).execute()
    except Exception as exc:
        msg = str(exc)
        if "organization_id" in msg and ("column" in msg or "schema" in msg):
            raise RuntimeError(
                "Database schema is outdated: missing generations.organization_id. "
                "Apply migration 010_generations_organization_ownership.sql before starting the backend."
            ) from exc
        raise RuntimeError(
            "Cannot connect to Supabase during startup schema validation. "
            "Check SUPABASE_URL/network and retry."
        ) from exc


@app.get("/health")
async def health():
    return {"status": "ok", "service": "canvas-platform"}
