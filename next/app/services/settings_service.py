"""
SettingsService — reads admin_settings from DB on every call (no in-memory
cache) so admin changes take effect immediately without restart.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_settings import AdminSetting

logger = logging.getLogger(__name__)


class SettingsService:
    def __init__(self, session_factory):
        self._factory = session_factory

    async def get(self, key: str, default: str = "") -> str:
        async with self._factory() as db:
            row: AdminSetting | None = await db.get(AdminSetting, key)
            return row.value if row else default

    async def get_bool(self, key: str, default: bool = False) -> bool:
        val = await self.get(key, str(default).lower())
        return val.lower() in ("true", "1", "yes")

    async def get_int(self, key: str, default: int = 0) -> int:
        try:
            return int(await self.get(key, str(default)))
        except ValueError:
            return default

    async def set(self, key: str, value: str, updated_by: str = "") -> None:
        from datetime import datetime
        async with self._factory() as db:
            row = await db.get(AdminSetting, key)
            if row is None:
                logger.warning("Attempted to set unknown setting key: %s", key)
                return
            row.value      = value
            row.updated_by = updated_by
            row.updated_at = datetime.utcnow()
            await db.commit()

    async def snapshot(self) -> dict[str, str]:
        """Return all settings as a plain dict (for passing to source.apply_settings)."""
        from sqlalchemy import select
        async with self._factory() as db:
            rows = (await db.execute(select(AdminSetting))).scalars().all()
            return {r.key: r.value for r in rows}
