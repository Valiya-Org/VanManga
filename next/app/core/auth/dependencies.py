from typing import Annotated
from fastapi import Depends, Request

from app.core.auth.base import AuthProvider, AdminUser


def _get_auth_provider(request: Request) -> AuthProvider:
    return request.app.state.auth_provider


async def require_admin(
    request: Request,
    provider: Annotated[AuthProvider, Depends(_get_auth_provider)],
) -> AdminUser:
    return await provider.require_admin(request)


RequireAdmin = Annotated[AdminUser, Depends(require_admin)]
