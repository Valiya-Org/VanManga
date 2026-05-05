import logging
from typing import Any
import httpx
from jose import jwt, JWTError
from fastapi import Request, HTTPException, status

from app.core.auth.base import AuthProvider, AdminUser
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class JWTAuthProvider(AuthProvider):
    """
    External IdP JWT validation.

    Verifies the token signature via JWKS endpoint (RS256) or a shared
    secret (HS256).  No user data is stored locally — identity and role
    come entirely from the JWT claims.
    """

    def __init__(self):
        self._jwks_cache: list[dict[str, Any]] | None = None

    async def _get_key(self) -> Any:
        if settings.jwt_algorithm.startswith("HS"):
            return settings.jwt_secret

        if self._jwks_cache is None:
            async with httpx.AsyncClient() as client:
                resp = await client.get(settings.jwt_jwks_url, timeout=10)
                resp.raise_for_status()
                self._jwks_cache = resp.json().get("keys", [])

        return self._jwks_cache

    async def require_admin(self, request: Request) -> AdminUser:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bearer token required")

        raw_token = auth_header[7:]
        try:
            key = await self._get_key()
            payload = jwt.decode(
                raw_token,
                key,
                algorithms=[settings.jwt_algorithm],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            logger.debug("JWT decode failed: %s", exc)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

        claim_value = payload.get(settings.jwt_admin_claim)
        if isinstance(claim_value, list):
            is_admin = settings.jwt_admin_value in claim_value
        else:
            is_admin = claim_value == settings.jwt_admin_value

        if not is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")

        return AdminUser(
            id=payload.get("sub", ""),
            display_name=payload.get("name", payload.get("preferred_username", "")),
        )
