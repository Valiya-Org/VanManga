from abc import ABC, abstractmethod
from dataclasses import dataclass
from fastapi import Request, HTTPException, status


@dataclass
class AdminUser:
    id: str
    display_name: str


class AuthProvider(ABC):
    @abstractmethod
    async def require_admin(self, request: Request) -> AdminUser:
        """Raise HTTP 403 if the request does not carry valid admin credentials."""
        ...
