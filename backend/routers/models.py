"""GET /models/{project_id} — Modelos disponibles del proyecto"""
import uuid as _uuid
from fastapi import APIRouter, Depends, Query
from auth import get_auth, AuthContext, get_supabase

router = APIRouter()


MULTI_REF_MODEL_ALLOWLIST = {
    "black-forest-labs/flux-2-pro",
}


def supports_multi_ref(row: dict) -> bool:
    model_ref = (row.get("model_ref") or "").strip()
    if model_ref in MULTI_REF_MODEL_ALLOWLIST:
        return True

    default_params = row.get("default_params") or {}
    if isinstance(default_params, dict):
        if default_params.get("supports_multi_ref") is True:
            return True
        caps = default_params.get("capabilities")
        if isinstance(caps, list) and "multi_ref" in caps:
            return True
        if isinstance(caps, str) and "multi_ref" in caps.lower():
            return True

    return False


PLATFORM_MODELS = [
    {
        "id": "platform-generate-flux11pro",
        "display_name": "FLUX 1.1 Pro",
        "model_ref": "black-forest-labs/flux-1.1-pro",
        "trigger_word": None,
        "use_enrichment": False,
    },
    {
        "id": "platform-edit-fluxkontextpro",
        "display_name": "FLUX Kontext Pro (Edit)",
        "model_ref": "black-forest-labs/flux-kontext-pro",
        "trigger_word": None,
        "use_enrichment": False,
    },
    {
        "id": "platform-multiref-flux2pro",
        "display_name": "FLUX 2 Pro (Multi-Ref)",
        "model_ref": "black-forest-labs/flux-2-pro",
        "trigger_word": None,
        "use_enrichment": False,
    },
    {
        "id": "platform-video-kling",
        "display_name": "Kling v2.1 (Video)",
        "model_ref": "kwaivgi/kling-v2.1",
        "trigger_word": None,
        "use_enrichment": False,
    },
]

PLATFORM_MODEL_IDS = {m["id"] for m in PLATFORM_MODELS}


@router.get("/models/global")
async def get_global_models(
    task: str | None = Query(default=None),
    auth: AuthContext = Depends(get_auth),
):
    """Platform-wide fixed models (generate, multi_ref, video) — no project_id needed."""
    models = PLATFORM_MODELS
    if task == "generate":
        models = [m for m in models if "flux-1.1" in m["model_ref"]]
    elif task == "edit":
        models = [m for m in models if "kontext" in m["model_ref"]]
    elif task == "multi_ref":
        models = [m for m in models if m["model_ref"] in MULTI_REF_MODEL_ALLOWLIST]
    elif task == "video":
        models = [m for m in models if "kling" in m["model_ref"]]
    return {"models": models}


@router.get("/models/{project_id}")
async def get_models(
    project_id: str,
    task: str | None = Query(default=None),
    auth: AuthContext = Depends(get_auth),
):
    try:
        _uuid.UUID(project_id)
    except ValueError:
        return {"models": []}

    sb = get_supabase()
    try:
        result = sb.table("model_configs") \
            .select("id, display_name, model_ref, trigger_word, default_params, use_enrichment") \
            .eq("project_id", project_id) \
            .eq("active", True) \
            .execute()
    except Exception:
        return {"models": []}

    models = result.data or []
    if task == "multi_ref":
        models = [m for m in models if supports_multi_ref(m)]

    return {"models": models}
