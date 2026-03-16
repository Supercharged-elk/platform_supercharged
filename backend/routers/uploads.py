"""POST /uploads/image — Subir imagen de referencia y obtener URL"""
import os
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth import AuthContext, SUPABASE_URL, get_auth, get_supabase

router = APIRouter()

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ASSETS_BUCKET = os.getenv("ASSETS_BUCKET", "ai-assets")

# Magic bytes → (extension, mime)
_MAGIC: list[tuple[bytes, str, str]] = [
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"RIFF", "webp", "image/webp"),   # validated further below
    (b"GIF87a", "gif", "image/gif"),
    (b"GIF89a", "gif", "image/gif"),
]


def _detect_image_type(data: bytes) -> tuple[str, str] | None:
    for magic, ext, mime in _MAGIC:
        if data[:len(magic)] == magic:
            if ext == "webp" and data[8:12] != b"WEBP":
                continue
            return ext, mime
    return None


def _extract_url(value) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("signedURL", "signed_url", "publicURL", "public_url"):
            url = value.get(key)
            if isinstance(url, str) and url:
                return url
    return None


@router.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(get_auth),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 15MB)")

    detected = _detect_image_type(raw)
    if not detected:
        raise HTTPException(status_code=400, detail="File is not a valid image (PNG, JPEG, WebP, GIF)")
    extension, content_type = detected

    user_scope = auth.organization_id or auth.user_id or "anon"
    object_path = f"{user_scope}/refs/{uuid.uuid4().hex}.{extension}"

    sb = get_supabase()
    try:
        sb.storage.from_(ASSETS_BUCKET).upload(
            object_path,
            raw,
            {"content-type": content_type, "upsert": "false"},
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Upload failed: {err}")

    # Prefer signed URL (works with private bucket), fallback to public URL.
    resolved_url: str | None = None
    try:
        signed = sb.storage.from_(ASSETS_BUCKET).create_signed_url(object_path, 60 * 60 * 24 * 30)
        resolved_url = _extract_url(signed)
        if resolved_url and resolved_url.startswith("/") and SUPABASE_URL:
            resolved_url = f"{SUPABASE_URL}/storage/v1{resolved_url}"
    except Exception:
        resolved_url = None

    if not resolved_url:
        try:
            public = sb.storage.from_(ASSETS_BUCKET).get_public_url(object_path)
            resolved_url = _extract_url(public)
        except Exception:
            resolved_url = None

    if not resolved_url:
        raise HTTPException(status_code=500, detail="Could not resolve file URL")

    return {"url": resolved_url, "path": object_path, "bucket": ASSETS_BUCKET}
