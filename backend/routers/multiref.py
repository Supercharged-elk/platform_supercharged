"""POST /generate-multi-ref — FLUX 2 Pro (imagen con 0-8 referencias)"""
import asyncio
import ipaddress
import socket
import uuid
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_auth, AuthContext, get_supabase
from limiter import limiter
from credit_manager import check_and_deduct
from progress_tracker import run_prediction_with_progress, mark_complete, mark_failed

router = APIRouter()

MODEL = "black-forest-labs/flux-2-pro"
MULTI_REF_MODEL_ALLOWLIST = {
    "black-forest-labs/flux-2-pro",
}


_RFC1918 = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _validate_reference_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"Invalid reference URL scheme: {url!r}")
    host = (parsed.hostname or "").strip()
    if not host:
        raise HTTPException(status_code=400, detail=f"Invalid reference URL host: {url!r}")
    if host.lower() in ("localhost",) or host.lower().endswith(".local"):
        raise HTTPException(status_code=400, detail=f"Reference URL host is not allowed: {url!r}")

    def _is_forbidden_ip(addr: object) -> bool:
        if not isinstance(addr, (ipaddress.IPv4Address, ipaddress.IPv6Address)):
            return True
        if any(addr in net for net in _RFC1918):
            return True
        return (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
            or addr.is_unspecified
        )

    try:
        addr = ipaddress.ip_address(host)
        if _is_forbidden_ip(addr):
            raise HTTPException(status_code=400, detail=f"Reference URL points to private address: {url!r}")
    except ValueError:
        # Hostname: resolve and block if any resolved IP is private/local.
        try:
            resolved = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
        except socket.gaierror:
            raise HTTPException(status_code=400, detail=f"Reference URL host could not be resolved: {url!r}")
        for info in resolved:
            resolved_host = info[4][0]
            try:
                resolved_addr = ipaddress.ip_address(resolved_host)
            except ValueError:
                continue
            if _is_forbidden_ip(resolved_addr):
                raise HTTPException(status_code=400, detail=f"Reference URL resolves to private address: {url!r}")


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


class MultiRefRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    reference_urls: list[str]   # 0-8 URLs de imágenes de referencia
    model_config_id: str
    workflow_id: str | None = None


@router.post("/generate-multi-ref")
@limiter.limit("20/minute")
async def multi_ref(request: Request, req: MultiRefRequest, auth: AuthContext = Depends(get_auth)):
    if not 0 <= len(req.reference_urls) <= 8:
        raise HTTPException(status_code=400, detail="Need 0-8 reference images")

    for url in req.reference_urls:
        _validate_reference_url(url)

    # Platform model IDs (non-UUID constants) — resolve directly without DB lookup
    PLATFORM_MODEL_MAP = {
        "platform-multiref-flux2pro": "black-forest-labs/flux-2-pro",
    }
    if req.model_config_id in PLATFORM_MODEL_MAP:
        model_ref = PLATFORM_MODEL_MAP[req.model_config_id]
    else:
        # Validate UUID before querying DB
        try:
            uuid.UUID(req.model_config_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid model_config_id")

        sb = get_supabase()
        cfg = sb.table("model_configs").select("model_ref, default_params").eq("id", req.model_config_id).limit(1).execute()
        cfg_row = cfg.data[0] if cfg and cfg.data else None
        if not cfg_row or not cfg_row.get("model_ref"):
            raise HTTPException(status_code=400, detail="Invalid model_config_id for Multi-Ref")
        if not supports_multi_ref(cfg_row):
            raise HTTPException(status_code=400, detail="Selected model does not support Multi-Ref")
        model_ref = cfg_row["model_ref"]

    sb = get_supabase()

    if auth.user_id:
        await check_and_deduct(sb, auth.user_id, "multi_ref", auth.is_anonymous)

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
        "mode": "multi_ref",
        "model_used": model_ref,
        "reference_count": len(req.reference_urls),
    }).execute()

    sb.table("generation_progress").insert({
        "generation_id": gen_id,
        "status": "pending",
        "progress_pct": 0,
        "stage": "Queuing...",
    }).execute()

    asyncio.create_task(_run_multi_ref(sb, gen_id, model_ref, req))
    return {"generation_id": gen_id, "status": "processing"}


async def _run_multi_ref(sb, gen_id: str, model_ref: str, req: MultiRefRequest):
    try:
        model_input: dict = {"prompt": req.prompt}
        if req.reference_urls:
            model_input["reference_images"] = req.reference_urls

        image_url = await run_prediction_with_progress(
            sb,
            gen_id,
            "multi_ref",
            model_ref,
            model_input,
        )
        sb.table("generations").update({"image_url": image_url}).eq("id", gen_id).execute()
        await mark_complete(sb, gen_id)

    except Exception as e:
        await mark_failed(sb, gen_id, str(e))
