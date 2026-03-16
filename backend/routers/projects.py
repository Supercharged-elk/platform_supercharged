"""GET/POST /projects — lista y crea proyectos del usuario"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from auth import get_auth, AuthContext, get_supabase

router = APIRouter()


@router.get("/projects")
async def list_projects(auth: AuthContext = Depends(get_auth)):
    sb = get_supabase()

    # Usuarios autenticados: proyectos de su organización o creados por el usuario
    if auth.user_id:
        if auth.organization_id:
            result = (
                sb.table("projects")
                .select("id, name, active, created_at")
                .eq("organization_id", auth.organization_id)
                .eq("active", True)
                .order("created_at", desc=True)
                .execute()
            )
        else:
            result = (
                sb.table("projects")
                .select("id, name, active, created_at")
                .eq("created_by", auth.user_id)
                .eq("active", True)
                .order("created_at", desc=True)
                .execute()
            )
        return {"projects": result.data or []}

    # Modo organization token (B2B)
    if auth.organization_id:
        result = (
            sb.table("projects")
            .select("id, name, active, created_at")
            .eq("organization_id", auth.organization_id)
            .eq("active", True)
            .order("created_at", desc=True)
            .execute()
        )
        return {"projects": result.data or []}

    return {"projects": []}


class CreateProjectRequest(BaseModel):
    name: str


@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(req: CreateProjectRequest, auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User authentication required")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Project name required")

    sb = get_supabase()
    insert_data: dict = {"name": name, "created_by": auth.user_id, "active": True}
    if auth.organization_id:
        insert_data["organization_id"] = auth.organization_id

    result = sb.table("projects").insert(insert_data).execute()
    row = result.data[0] if result and result.data else None
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create project")
    return {"id": row["id"], "name": row["name"], "created_at": row.get("created_at")}
