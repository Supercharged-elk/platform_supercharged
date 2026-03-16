"""GET /progress/{id} — Estado de progreso de una generación"""
import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException
from auth import get_auth, AuthContext, get_supabase

router = APIRouter()


@router.get("/progress/{generation_id}")
async def get_progress(generation_id: str, auth: AuthContext = Depends(get_auth)):
    try:
        _uuid.UUID(generation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid generation_id")

    sb = get_supabase()

    gen_res = sb.table("generations").select("id, user_id, organization_id, image_url, video_url") \
        .eq("id", generation_id).limit(1).execute()

    gen = gen_res.data[0] if gen_res and gen_res.data else None
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")
    if auth.user_id:
        same_user = gen.get("user_id") == auth.user_id
        same_org = bool(auth.organization_id) and gen.get("organization_id") == auth.organization_id
        if not (same_user or same_org):
            raise HTTPException(status_code=403, detail="Access denied")
    elif auth.organization_id:
        if gen.get("organization_id") != auth.organization_id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    progress_res = sb.table("generation_progress").select("*") \
        .eq("generation_id", generation_id).limit(1).execute()
    progress = progress_res.data[0] if progress_res and progress_res.data else {"status": "pending", "progress_pct": 0}

    return {
        "generation_id": generation_id,
        "image_url": gen.get("image_url"),
        "video_url": gen.get("video_url"),
        "progress": progress,
    }


@router.post("/progress/{generation_id}/complete")
async def mark_complete_endpoint(generation_id: str, auth: AuthContext = Depends(get_auth)):
    try:
        _uuid.UUID(generation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid generation_id")

    sb = get_supabase()
    # Verify ownership before allowing state change
    gen_res = sb.table("generations").select("user_id, organization_id").eq("id", generation_id).limit(1).execute()
    gen = gen_res.data[0] if gen_res and gen_res.data else None
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")
    if auth.user_id:
        same_user = gen.get("user_id") == auth.user_id
        same_org = bool(auth.organization_id) and gen.get("organization_id") == auth.organization_id
        if not (same_user or same_org):
            raise HTTPException(status_code=403, detail="Access denied")
    elif auth.organization_id:
        if gen.get("organization_id") != auth.organization_id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    from datetime import datetime, timezone
    sb.table("generation_progress").update({
        "status": "completed",
        "progress_pct": 100,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("generation_id", generation_id).execute()
    return {"ok": True}
