from typing import Annotated
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth.dependencies import RequireAdmin
from app.models.task import DownloadTask
from app.schemas.task import TaskOut

router = APIRouter(prefix="/tasks", tags=["tasks"])

DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    db: DB,
    status: str | None = None,
    manga_id: int | None = None,
    page: int = 1,
    size: int = 30,
):
    stmt = select(DownloadTask).order_by(DownloadTask.created_at.desc())
    if status:
        stmt = stmt.where(DownloadTask.status == status)
    if manga_id:
        stmt = stmt.where(DownloadTask.manga_id == manga_id)
    stmt   = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: int, db: DB):
    task = await db.get(DownloadTask, task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/{task_id}", status_code=204)
async def cancel_task(task_id: int, request: Request, admin: RequireAdmin):
    queue   = request.app.state.queue_manager
    success = await queue.cancel(task_id)
    if not success:
        raise HTTPException(409, "Task cannot be cancelled (not in pending state)")
