"""GET /generations — Historial de generaciones del usuario"""
from fastapi import APIRouter, Depends, Query
from auth import get_auth, AuthContext, get_supabase

router = APIRouter()


@router.get("/generations")
async def list_generations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(get_auth),
):
    if not auth.user_id:
        return {"generations": [], "total": 0}
    sb = get_supabase()
    result = (
        sb.table("generations")
        .select("id, mode, model_used, image_url, video_url, user_prompt, created_at, workflow_id", count="exact")
        .eq("user_id", auth.user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {
        "generations": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }
