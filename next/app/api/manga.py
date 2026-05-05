from typing import Annotated
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth.dependencies import RequireAdmin
from app.models.manga import Manga
from app.models.chapter import Chapter
from app.schemas.manga import MangaCreate, MangaOut, MangaUpdate
from app.schemas.chapter import ChapterOut

router = APIRouter(prefix="/manga", tags=["manga"])

DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[MangaOut])
async def list_manga(db: DB, page: int = 1, size: int = 20):
    stmt   = select(Manga).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MangaOut, status_code=201)
async def add_manga(body: MangaCreate, request: Request, db: DB):
    registry = request.app.state.source_registry
    source   = registry.get(body.source_id)
    if source is None:
        raise HTTPException(404, f"Source '{body.source_id}' not found")

    # Duplicate check
    existing = (await db.execute(
        select(Manga).where(
            Manga.source_id == body.source_id,
            Manga.source_manga_id == body.source_manga_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Manga already in library")

    # Download cover
    cover_path = ""
    if body.cover_url:
        cover_path = await _save_cover(body, request)

    manga = Manga(
        source_id=body.source_id,
        source_manga_id=body.source_manga_id,
        name=body.name,
        artist=body.artist,
        is_completed=body.is_completed,
        cover_path=cover_path,
    )
    db.add(manga)
    await db.commit()
    await db.refresh(manga)

    # Enqueue full download
    queue = request.app.state.queue_manager
    content_types = [ct.value for ct in body.content_types] if body.content_types else None
    await queue.enqueue(manga.id, "full", content_types=content_types)

    return manga


@router.get("/{manga_id}", response_model=MangaOut)
async def get_manga(manga_id: int, db: DB):
    manga = await db.get(Manga, manga_id)
    if manga is None:
        raise HTTPException(404, "Manga not found")
    return manga


@router.patch("/{manga_id}", response_model=MangaOut)
async def update_manga(manga_id: int, body: MangaUpdate, db: DB):
    manga = await db.get(Manga, manga_id)
    if manga is None:
        raise HTTPException(404, "Manga not found")
    if body.auto_update is not None:
        manga.auto_update = body.auto_update
    if body.kavita_url is not None:
        manga.kavita_url = body.kavita_url
    await db.commit()
    await db.refresh(manga)
    return manga


@router.delete("/{manga_id}", status_code=204)
async def delete_manga(manga_id: int, db: DB, admin: RequireAdmin):
    manga = await db.get(Manga, manga_id)
    if manga is None:
        raise HTTPException(404, "Manga not found")
    await db.delete(manga)
    await db.commit()


@router.get("/{manga_id}/chapters", response_model=list[ChapterOut])
async def list_chapters(manga_id: int, db: DB):
    rows = (await db.execute(
        select(Chapter)
        .where(Chapter.manga_id == manga_id)
        .order_by(Chapter.content_type, Chapter.number)
    )).scalars().all()
    return rows


@router.post("/{manga_id}/redownload", status_code=202)
async def redownload_chapters(manga_id: int, chapter_ids: list[int], request: Request, db: DB):
    manga = await db.get(Manga, manga_id)
    if manga is None:
        raise HTTPException(404, "Manga not found")

    queue = request.app.state.queue_manager
    task  = await queue.enqueue(manga_id, "redownload", chapter_ids=chapter_ids)
    return {"task_id": task.id}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _save_cover(body: MangaCreate, request: Request) -> str:
    import os, asyncio, requests as req
    from concurrent.futures import ThreadPoolExecutor

    settings   = request.app.state.settings_service
    manga_base = await settings.get("manga_base_path") or "./manga"
    safe_name  = body.name.replace("/", "-")
    folder     = os.path.join(manga_base, f"{safe_name}${body.source_manga_id}")
    os.makedirs(folder, exist_ok=True)
    cover_path = os.path.join(folder, "cover.jpg")

    def _fetch():
        r = req.get(body.cover_url, timeout=15)
        with open(cover_path, "wb") as f:
            f.write(r.content)

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(ThreadPoolExecutor(max_workers=1), _fetch)
    except Exception:
        return ""

    return cover_path
