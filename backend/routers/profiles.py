"""GET/PATCH /profiles/me — Perfil del usuario autenticado"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_auth, AuthContext, get_supabase

router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None


@router.get("/profiles/me")
async def get_profile(auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Auth required")
    sb = get_supabase()
    profile = sb.table("user_profiles").select("*").eq("user_id", auth.user_id).limit(1).execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile.data


@router.patch("/profiles/me")
async def update_profile(req: ProfileUpdate, auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Auth required")
    sb = get_supabase()
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    # Upsert: create profile if it doesn't exist yet
    existing = sb.table("user_profiles").select("user_id").eq("user_id", auth.user_id).limit(1).execute()
    if not existing.data:
        result = sb.table("user_profiles").insert({"user_id": auth.user_id, **updates}).execute()
    else:
        result = sb.table("user_profiles").update(updates).eq("user_id", auth.user_id).execute()
    return result.data[0] if result.data else {}
