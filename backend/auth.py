"""
JWT middleware — acepta:
  1. JWT Supabase (HS256 o ES256 — verificado via Supabase API)
  2. api_token de organizations (clientes B2B)
"""
import os
import httpx
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client, Client

security = HTTPBearer(auto_error=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_sb_client: Client | None = None


def get_supabase() -> Client:
    global _sb_client
    if _sb_client is None:
        _sb_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _sb_client


class AuthContext:
    def __init__(self, user_id: str | None, organization_id: str | None, plan: str, is_anonymous: bool = False):
        self.user_id = user_id
        self.organization_id = organization_id
        self.plan = plan
        self.is_anonymous = is_anonymous


async def _verify_supabase_jwt(token: str) -> dict | None:
    """Verifica el JWT llamando a Supabase Auth API — funciona con HS256 y ES256."""
    anon_key = SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": anon_key,
            },
            timeout=5.0,
        )
    if res.status_code == 200:
        return res.json()
    return None


async def get_auth(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> AuthContext:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No credentials")

    token = credentials.credentials

    # 1. Verificar como JWT Supabase (soporta HS256 y ES256)
    user_data = await _verify_supabase_jwt(token)
    if user_data and user_data.get("id"):
        user_id = user_data["id"]

        sb = get_supabase()
        plan = "free"
        org_id = None
        try:
            profile_res = sb.table("user_profiles").select("organization_id, role").eq("user_id", user_id).limit(1).execute()
            profile = profile_res.data[0] if profile_res and profile_res.data else None
            if profile:
                org_id = profile.get("organization_id")
                if org_id:
                    org_res = sb.table("organizations").select("plan_type").eq("id", org_id).limit(1).execute()
                    org = org_res.data[0] if org_res and org_res.data else None
                    if org:
                        plan = org.get("plan_type", "free")
        except Exception:
            pass

        is_anonymous = user_data.get("is_anonymous", False)
        return AuthContext(user_id=user_id, organization_id=org_id, plan=plan, is_anonymous=is_anonymous)

    # 2. Intentar como api_token de organización (B2B)
    sb = get_supabase()
    org_res = sb.table("organizations").select("id, plan_type").eq("api_token", token).eq("active", True).limit(1).execute()
    org = org_res.data[0] if org_res and org_res.data else None
    if org:
        return AuthContext(
            user_id=None,
            organization_id=org["id"],
            plan=org.get("plan_type", "enterprise"),
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
