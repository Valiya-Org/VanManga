import httpx
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/kavita", tags=["kavita"])


class KavitaLoginBody(BaseModel):
    base_url: str
    expose_url: str
    api_key: str
    lib_id: str = "1"


@router.get("/status")
async def kavita_status(request: Request):
    svc      = request.app.state.settings_service
    enabled  = await svc.get_bool("kavita_enabled")
    base_url = await svc.get("kavita_base_url")
    return {"enabled": enabled, "configured": bool(base_url)}


@router.post("/login")
async def kavita_login(body: KavitaLoginBody, request: Request):
    """Validate Kavita credentials and persist them to admin_settings."""
    url = f"{body.base_url}/api/Plugin/authenticate?apiKey={body.api_key}&pluginName=vanmanga-next"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url)
            resp.raise_for_status()
            token = resp.json().get("token", "")
    except Exception as exc:
        raise HTTPException(400, f"Kavita authentication failed: {exc}")

    svc = request.app.state.settings_service
    await svc.set("kavita_base_url",     body.base_url)
    await svc.set("kavita_expose_url",   body.expose_url)
    await svc.set("kavita_admin_apikey", body.api_key)
    await svc.set("kavita_lib_id",       body.lib_id)
    await svc.set("kavita_enabled",      "true")

    await request.app.state.scheduler_service.reschedule()

    return {"ok": True, "token": token}
