"""GET /credits y POST /credits — Saldo y gestión de créditos"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import get_auth, AuthContext, get_supabase
from credit_manager import get_balance

router = APIRouter()


@router.get("/credits")
async def get_credits(auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        return {"generate_credits": 0, "edit_credits": 0, "animate_credits": 0}
    sb = get_supabase()
    return get_balance(sb, auth.user_id, auth.is_anonymous)


class AddCreditsRequest(BaseModel):
    user_id: str
    generate_credits: int = Field(default=0, ge=0)
    edit_credits: int = Field(default=0, ge=0)
    animate_credits: int = Field(default=0, ge=0)


@router.post("/credits")
async def add_credits(req: AddCreditsRequest, auth: AuthContext = Depends(get_auth)):
    if not auth.user_id or not auth.organization_id:
        raise HTTPException(status_code=403, detail="Organization member authentication required")
    if auth.plan not in ("pro", "enterprise"):
        raise HTTPException(status_code=403, detail="Requires pro or enterprise plan")

    sb = get_supabase()
    actor_profile_res = (
        sb.table("user_profiles")
        .select("organization_id, role")
        .eq("user_id", auth.user_id)
        .limit(1)
        .execute()
    )
    actor_profile = actor_profile_res.data[0] if actor_profile_res and actor_profile_res.data else None
    if not actor_profile:
        raise HTTPException(status_code=403, detail="Profile not found")
    if actor_profile.get("organization_id") != auth.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if actor_profile.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Owner/admin role required")

    target_profile_res = (
        sb.table("user_profiles")
        .select("organization_id")
        .eq("user_id", req.user_id)
        .limit(1)
        .execute()
    )
    target_profile = target_profile_res.data[0] if target_profile_res and target_profile_res.data else None
    if not target_profile:
        raise HTTPException(status_code=404, detail="Target user profile not found")
    if target_profile.get("organization_id") != auth.organization_id:
        raise HTTPException(status_code=403, detail="Target user is outside your organization")

    current = get_balance(sb, req.user_id)
    sb.table("credits").update({
        "generate_credits": current["generate_credits"] + req.generate_credits,
        "edit_credits": current["edit_credits"] + req.edit_credits,
        "animate_credits": current["animate_credits"] + req.animate_credits,
    }).eq("user_id", req.user_id).execute()

    return get_balance(sb, req.user_id)
