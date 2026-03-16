"""POST /generate — FLUX 1.1 Pro + LoRA (texto a imagen)"""
import asyncio
import uuid
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from auth import get_auth, AuthContext, get_supabase
from limiter import limiter
from credit_manager import check_and_deduct
from enricher import enrich_prompt
from progress_tracker import run_prediction_with_progress, mark_complete, mark_failed

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Generation prompt (required, non-empty)")
    model_config_id: str | None = None
    width: int = 1024
    height: int = 1024
    steps: int = 28
    guidance: float = 3.5
    workflow_id: str | None = None


@router.post("/generate")
@limiter.limit("20/minute")
async def generate(request: Request, req: GenerateRequest, auth: AuthContext = Depends(get_auth)):
    sb = get_supabase()

    # Obtener config del modelo si se especifica
    model_ref = "black-forest-labs/flux-1.1-pro"
    trigger_word = None
    use_enrichment = False
    brand_rules = None
    negative_constraints = None
    brand_tone = None
    quality_bar = None

    if req.model_config_id:
        cfg = sb.table("model_configs").select("*").eq("id", req.model_config_id).limit(1).execute()
        cfg_row = cfg.data[0] if cfg and cfg.data else None
        if cfg_row:
            model_ref = cfg_row.get("model_ref", model_ref)
            trigger_word = cfg_row.get("trigger_word")
            use_enrichment = cfg_row.get("use_enrichment", False)
            brand_rules = cfg_row.get("brand_rules")
            negative_constraints = cfg_row.get("negative_constraints")
            brand_tone = cfg_row.get("brand_tone")
            quality_bar = cfg_row.get("quality_bar")

    # Enriquecer prompt si está configurado
    final_prompt = req.prompt
    if use_enrichment:
        final_prompt = await enrich_prompt(req.prompt, brand_rules, negative_constraints, brand_tone, quality_bar, trigger_word)
    elif trigger_word:
        final_prompt = f"{trigger_word} {req.prompt}"

    # Descontar créditos (solo usuarios, no org api_token anónimas)
    if auth.user_id:
        await check_and_deduct(sb, auth.user_id, "generate", auth.is_anonymous)

    # Crear registro de generación
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
        "final_prompt": final_prompt,
        "mode": "generate",
        "model_used": model_ref,
    }).execute()

    sb.table("generation_progress").insert({
        "generation_id": gen_id,
        "status": "pending",
        "progress_pct": 0,
        "stage": "Queuing...",
    }).execute()

    # Ejecutar generación en background
    asyncio.create_task(_run_generate(sb, gen_id, model_ref, final_prompt, req))

    return {"generation_id": gen_id, "status": "processing"}


async def _run_generate(sb, gen_id: str, model_ref: str, prompt: str, req: GenerateRequest):
    try:
        image_url = await run_prediction_with_progress(
            sb,
            gen_id,
            "generate",
            model_ref,
            {
                "prompt": prompt,
                "width": req.width,
                "height": req.height,
                "num_inference_steps": req.steps,
                "guidance_scale": req.guidance,
            },
        )
        sb.table("generations").update({"image_url": image_url}).eq("id", gen_id).execute()
        await mark_complete(sb, gen_id)

    except Exception as e:
        await mark_failed(sb, gen_id, str(e))
