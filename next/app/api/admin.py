import httpx
from typing import Annotated
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth.dependencies import RequireAdmin
from app.models.admin_settings import AdminSetting
from app.schemas.admin import SettingOut, SettingUpdate

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[AsyncSession, Depends(get_db)]

_SCHEDULER_KEYS = {
    "auto_update_enabled", "auto_update_cron",
    "kavita_enabled", "kavita_sync_interval_hours",
}


@router.get("/settings", response_model=list[SettingOut])
async def list_settings(db: DB, admin: RequireAdmin):
    rows = (await db.execute(select(AdminSetting))).scalars().all()
    return [_mask(r) for r in rows]


@router.patch("/settings/{key}", response_model=SettingOut)
async def update_setting(
    key: str,
    body: SettingUpdate,
    request: Request,
    db: DB,
    admin: RequireAdmin,
):
    row = await db.get(AdminSetting, key)
    if row is None:
        raise HTTPException(404, f"Setting '{key}' not found")

    _validate(key, body.value, row.value_type)

    svc = request.app.state.settings_service
    await svc.set(key, body.value, updated_by=admin.id)

    if key in _SCHEDULER_KEYS:
        await request.app.state.scheduler_service.reschedule()

    await db.refresh(row)
    return _mask(row)


@router.post("/settings/kavita/test")
async def test_kavita(request: Request, admin: RequireAdmin):
    svc      = request.app.state.settings_service
    base_url = await svc.get("kavita_base_url")
    api_key  = await svc.get("kavita_admin_apikey")
    if not base_url or not api_key:
        raise HTTPException(400, "kavita_base_url and kavita_admin_apikey are required")
    url = f"{base_url}/api/Plugin/authenticate?apiKey={api_key}&pluginName=vanmanga-next"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url)
            resp.raise_for_status()
        return {"ok": True, "message": "Kavita connection successful"}
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


@router.post("/settings/flaresolverr/test")
async def test_flaresolverr(request: Request, admin: RequireAdmin):
    svc = request.app.state.settings_service
    url = await svc.get("flaresolverr_url")
    if not url:
        raise HTTPException(400, "flaresolverr_url is required")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"cmd": "sessions.list"})
            resp.raise_for_status()
        return {"ok": True, "message": "FlareSolverr reachable"}
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mask(row: AdminSetting) -> AdminSetting:
    if row.value_type == "secret" and row.value:
        row.value = "***"
    return row


def _validate(key: str, value: str, value_type: str) -> None:
    if value_type == "bool" and value.lower() not in ("true", "false"):
        raise HTTPException(422, f"'{key}' must be 'true' or 'false'")
    if value_type == "int":
        try:
            int(value)
        except ValueError:
            raise HTTPException(422, f"'{key}' must be an integer")
    if key == "chapter_concurrent":
        v = int(value)
        if not (1 <= v <= 5):
            raise HTTPException(422, "chapter_concurrent must be between 1 and 5")
