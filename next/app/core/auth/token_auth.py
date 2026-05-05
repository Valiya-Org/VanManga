import bcrypt
import secrets
import logging
from fastapi import Request, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.base import AuthProvider, AdminUser

logger = logging.getLogger(__name__)


def _hash_token(token: str) -> str:
    return bcrypt.hashpw(token.encode(), bcrypt.gensalt()).decode()


def _verify_token(token: str, hashed: str) -> bool:
    return bcrypt.checkpw(token.encode(), hashed.encode())

_SETTING_KEY = "admin_token_hash"


class TokenAuthProvider(AuthProvider):
    """
    Standalone single-token auth.

    On first boot the token is auto-generated, printed to console,
    and its bcrypt hash is stored in admin_settings.
    The caller may also pre-seed via ADMIN_TOKEN env var.
    """

    def __init__(self, preset_token: str | None = None, session_factory=None):
        self._preset          = preset_token
        self._session_factory = session_factory

    async def bootstrap(self, db: AsyncSession) -> None:
        from app.models.admin_settings import AdminSetting

        row = await db.get(AdminSetting, _SETTING_KEY)
        if row:
            # 幂等：已存在 hash 说明之前已经初始化过，直接返回。
            # 这保证意外多次调用（如重启竞争）不会覆盖已有 token。
            return

        token  = self._preset or secrets.token_urlsafe(32)
        hashed = _hash_token(token)

        db.add(AdminSetting(
            key=_SETTING_KEY,
            value=hashed,
            value_type="secret",
            description="bcrypt hash of the admin token",
        ))
        await db.commit()

        # 只在 token 是自动生成时才打印：若用户通过 ADMIN_TOKEN 环境变量预设，
        # 说明他已经知道这个值，打印反而增加日志泄露风险。
        if not self._preset:
            logger.warning("=" * 60)
            logger.warning("Admin Token (shown once — store it safely):")
            logger.warning("  %s", token)
            logger.warning("=" * 60)

    async def _get_hash(self, db: AsyncSession) -> str | None:
        from app.models.admin_settings import AdminSetting

        row = await db.get(AdminSetting, _SETTING_KEY)
        return row.value if row else None

    async def require_admin(self, request: Request) -> AdminUser:
        token = request.headers.get("X-Admin-Token", "")
        if not token:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin token required")

        async with self._session_factory() as db:
            hashed = await self._get_hash(db)

        # _pwd_ctx.verify 使用 bcrypt，单次验证耗时约 100ms——这是刻意的设计，
        # 目的是抵御暴力枚举。不要用字符串直接比较来"优化"这里。
        if not hashed or not _verify_token(token, hashed):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid admin token")

        return AdminUser(id="admin", display_name="Admin")
