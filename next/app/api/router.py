from fastapi import APIRouter
from app.api import sources, manga, tasks, logs, admin, kavita

api_router = APIRouter()
api_router.include_router(sources.router)
api_router.include_router(manga.router)
api_router.include_router(tasks.router)
api_router.include_router(logs.router)
api_router.include_router(admin.router)
api_router.include_router(kavita.router)
