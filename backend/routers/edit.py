"""POST /edit — FLUX Kontext Pro (editar imagen existente)"""
import asyncio
import uuid
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from auth import get_auth, AuthContext, get_supabase
from limiter import limiter
from credit_manager import check_and_deduct
from progress_tracker import run_prediction_with_progress, mark_complete, mark_failed

router = APIRouter()

MODEL = "black-forest-labs/flux-kontext-pro"


class EditRequest(BaseModel):
    image_url: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1, description="Edit instruction (required, non-empty)")
    model_config_id: str | None = None
    strength: float = 0.8
    steps: int = 28
    guidance: float = 3.5
    workflow_id: str | None = None


@router.post("/edit")
@limiter.limit("20/minute")
async def edit(request: Request, req: EditRequest, auth: AuthContext = Depends(get_auth)):
    sb = get_supabase()
    model_ref = MODEL

    if req.model_config_id:
        cfg = sb.table("model_configs").select("model_ref").eq("id", req.model_config_id).limit(1).execute()
        cfg_row = cfg.data[0] if cfg and cfg.data else None
        if cfg_row and cfg_row.get("model_ref"):
            model_ref = cfg_row["model_ref"]

    if auth.user_id:
        await check_and_deduct(sb, auth.user_id, "edit", auth.is_anonymous)

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
        "mode": "edit",
        "model_used": model_ref,
    }).execute()

    sb.table("generation_progress").insert({
        "generation_id": gen_id,
        "status": "pending",
        "progress_pct": 0,
        "stage": "Queuing...",
    }).execute()

    asyncio.create_task(_run_edit(sb, gen_id, model_ref, req))
    return {"generation_id": gen_id, "status": "processing"}


async def _run_edit(sb, gen_id: str, model_ref: str, req: EditRequest):
    try:
        image_url = await run_prediction_with_progress(
            sb,
            gen_id,
            "edit",
            model_ref,
            {
                "image": req.image_url,
                "prompt": req.prompt,
                "strength": req.strength,
                "num_inference_steps": req.steps,
                "guidance_scale": req.guidance,
            },
        )
        sb.table("generations").update({"image_url": image_url}).eq("id", gen_id).execute()
        await mark_complete(sb, gen_id)

    except Exception as e:
        await mark_failed(sb, gen_id, str(e))
