"""CRUD /workflows — Guardar y cargar grafos React Flow"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_auth, AuthContext, get_supabase

router = APIRouter()


class WorkflowSave(BaseModel):
    name: str
    graph_json: dict
    project_id: str | None = None
    is_public: bool = False


@router.get("/workflows")
async def list_workflows(auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Auth required")
    sb = get_supabase()
    result = sb.table("workflows") \
        .select("id, name, is_public, created_at, updated_at") \
        .eq("user_id", auth.user_id) \
        .order("updated_at", desc=True) \
        .execute()
    return {"workflows": result.data or []}


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, auth: AuthContext = Depends(get_auth)):
    import uuid as _uuid
    try:
        _uuid.UUID(workflow_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Workflow not found")
    sb = get_supabase()
    wf_res = sb.table("workflows").select("*").eq("id", workflow_id).limit(1).execute()
    wf = wf_res.data[0] if wf_res and wf_res.data else None
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if wf["user_id"] != auth.user_id and not wf["is_public"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return wf


@router.post("/workflows")
async def create_workflow(req: WorkflowSave, auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Auth required")
    sb = get_supabase()
    result = sb.table("workflows").insert({
        "user_id": auth.user_id,
        "name": req.name,
        "graph_json": req.graph_json,
        "project_id": req.project_id,
        "is_public": req.is_public,
    }).execute()
    return result.data[0]


@router.patch("/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, req: WorkflowSave, auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Auth required")
    sb = get_supabase()
    result = sb.table("workflows").update({
        "name": req.name,
        "graph_json": req.graph_json,
        "is_public": req.is_public,
        "project_id": req.project_id,
    }).eq("id", workflow_id).eq("user_id", auth.user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Workflow not found or access denied")
    return result.data[0]


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str, auth: AuthContext = Depends(get_auth)):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Auth required")
    sb = get_supabase()
    sb.table("workflows").delete().eq("id", workflow_id).eq("user_id", auth.user_id).execute()
    return {"ok": True}
