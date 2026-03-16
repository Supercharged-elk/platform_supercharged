"""
Gestión de créditos — descuenta según modo de generación.
"""
import os
from fastapi import HTTPException
from supabase import Client

CREDIT_COSTS = {
    "generate": ("generate_credits", 1),
    "edit": ("edit_credits", 1),
    "video": ("animate_credits", 1),
    "multi_ref": ("generate_credits", 2),
}

DEFAULT_GENERATE_CREDITS = int(os.getenv("INITIAL_GENERATE_CREDITS", "10"))
DEFAULT_EDIT_CREDITS = int(os.getenv("INITIAL_EDIT_CREDITS", "5"))
DEFAULT_ANIMATE_CREDITS = int(os.getenv("INITIAL_ANIMATE_CREDITS", "2"))

# Reduced credits for anonymous users to prevent farming
ANON_GENERATE_CREDITS = int(os.getenv("ANON_GENERATE_CREDITS", "3"))
ANON_EDIT_CREDITS = int(os.getenv("ANON_EDIT_CREDITS", "1"))
ANON_ANIMATE_CREDITS = int(os.getenv("ANON_ANIMATE_CREDITS", "0"))


def _first(result) -> dict | None:
    """Extrae el primer registro de un execute() result, compatible con supabase-py v2."""
    if result is None:
        return None
    data = result.data
    if not data:
        return None
    if isinstance(data, list):
        return data[0] if data else None
    return data


async def check_and_deduct(sb: Client, user_id: str, mode: str, is_anonymous: bool = False) -> None:
    column, cost = CREDIT_COSTS.get(mode, ("generate_credits", 1))

    result = sb.table("credits").select(column).eq("user_id", user_id).limit(1).execute()
    row = _first(result)
    if not row:
        _seed_default_credits(sb, user_id, is_anonymous)
        result = sb.table("credits").select(column).eq("user_id", user_id).limit(1).execute()
        row = _first(result)
        if not row:
            raise HTTPException(status_code=402, detail="No credit record found")

    balance = row.get(column, 0)
    if balance < cost:
        raise HTTPException(status_code=402, detail=f"Insufficient {column}: need {cost}, have {balance}")

    # Atomic optimistic-lock: UPDATE only if balance hasn't changed since we read it.
    # Concurrent requests that read the same balance will find 0 rows here and get 402.
    updated = (
        sb.table("credits")
        .update({column: balance - cost})
        .eq("user_id", user_id)
        .eq(column, balance)   # guard: reject if another request already deducted
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=402, detail=f"Insufficient {column} (concurrent request)")


def get_balance(sb: Client, user_id: str, is_anonymous: bool = False) -> dict:
    result = sb.table("credits").select("generate_credits, edit_credits, animate_credits").eq("user_id", user_id).limit(1).execute()
    row = _first(result)
    if not row:
        _seed_default_credits(sb, user_id, is_anonymous)
        result = sb.table("credits").select("generate_credits, edit_credits, animate_credits").eq("user_id", user_id).limit(1).execute()
        row = _first(result)
    if not row:
        return {"generate_credits": 0, "edit_credits": 0, "animate_credits": 0}
    return row


def _seed_default_credits(sb: Client, user_id: str, is_anonymous: bool = False) -> None:
    gen = ANON_GENERATE_CREDITS if is_anonymous else DEFAULT_GENERATE_CREDITS
    edit = ANON_EDIT_CREDITS if is_anonymous else DEFAULT_EDIT_CREDITS
    anim = ANON_ANIMATE_CREDITS if is_anonymous else DEFAULT_ANIMATE_CREDITS
    sb.table("credits").upsert(
        {
            "user_id": user_id,
            "generate_credits": gen,
            "edit_credits": edit,
            "animate_credits": anim,
        }
    ).execute()
