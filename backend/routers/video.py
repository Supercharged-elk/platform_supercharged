"""POST /video — Kling v2.1 (imagen a video)"""
import asyncio
import uuid
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from auth import get_auth, AuthContext, get_supabase
from limiter import limiter
from credit_manager import check_and_deduct
from progress_tracker import run_prediction_with_progress, mark_complete, mark_failed

router = APIRouter()

MODEL = "kwaivgi/kling-v2.1"


class VideoRequest(BaseModel):
    image_url: str
    prompt: str
    model_config_id: str | None = None
    duration: int = 5       # segundos
    aspect_ratio: str = "16:9"
    workflow_id: str | None = None


@router.post("/video")
@limiter.limit("20/minute")
async def video(request: Request, req: VideoRequest, auth: AuthContext = Depends(get_auth)):
    sb = get_supabase()
    model_ref = MODEL

    if req.model_config_id:
        cfg = sb.table("model_configs").select("model_ref").eq("id", req.model_config_id).limit(1).execute()
        cfg_row = cfg.data[0] if cfg and cfg.data else None
        if cfg_row and cfg_row.get("model_ref"):
            model_ref = cfg_row["model_ref"]

    if auth.user_id:
        await check_and_deduct(sb, auth.user_id, "video", auth.is_anonymous)

    owner_fields: dict[str, str] = {}
    if auth.user_id:
        owner_fields["user_id"] = auth.user_id
    elif auth.organization_id:
        owner_fields["organization_id"] = auth.organization_id
    else:
        raise ValueError("Invalid auth context: missing owner identity")

    gen_id = str(uuid.uuid4())
    sb.table("generations").insert({
        "id": gen_id,
        **owner_fields,
        "workflow_id": req.workflow_id,
        "user_prompt": req.prompt,
        "final_prompt": req.prompt,
        "mode": "video",
        "model_used": model_ref,
    }).execute()

    sb.table("generation_progress").insert({
        "generation_id": gen_id,
        "status": "pending",
        "progress_pct": 0,
        "stage": "Queuing...",
    }).execute()

    asyncio.create_task(_run_video(sb, gen_id, model_ref, req))
    return {"generation_id": gen_id, "status": "processing"}


async def _run_video(sb, gen_id: str, model_ref: str, req: VideoRequest):
    try:
        video_url = await run_prediction_with_progress(
            sb,
            gen_id,
            "video",
            model_ref,
            {
                "start_image": req.image_url,
                "prompt": req.prompt,
                "duration": req.duration,
                "aspect_ratio": req.aspect_ratio,
            },
        )
        sb.table("generations").update({"video_url": video_url}).eq("id", gen_id).execute()
        await mark_complete(sb, gen_id)

    except Exception as e:
        await mark_failed(sb, gen_id, str(e))
