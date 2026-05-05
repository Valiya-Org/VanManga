"""
QueueManager — SQLite-backed persistent download queue.

• One task runs at a time.
• On startup any task left in status="running" is reset to "pending" (crash recovery).
• Chapters left in status="downloading" are reset to "not_downloaded".
• Callers enqueue tasks via enqueue(); the worker loop picks them up automatically.
"""
import asyncio
import json
import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import DownloadTask
from app.models.chapter import Chapter

logger = logging.getLogger(__name__)


class QueueManager:
    def __init__(self, session_factory, download_manager, ws_manager):
        self._factory   = session_factory
        self._dl        = download_manager
        self._ws        = ws_manager
        # asyncio.Event 作为"有新任务"信号：比轮询更省 CPU，比 Queue 更容易
        # 与 SQLite 持久化结合——入队写 DB 后 set()，worker 从 DB 读取真实状态。
        self._notify    = asyncio.Event()
        self._worker: asyncio.Task | None = None
        self._running   = False

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        # 恢复必须在 worker 启动之前完成，否则 worker 可能在恢复写库的同时
        # 就开始执行，导致同一个任务被运行两次。
        await self._recover()
        self._running = True
        self._worker  = asyncio.create_task(self._loop(), name="queue-worker")

    async def stop(self) -> None:
        self._running = False
        # set() 唤醒可能阻塞在 wait() 的 worker，让它检查 _running 标志后退出。
        self._notify.set()
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass

    # ── Public API ────────────────────────────────────────────────────────────

    async def enqueue(
        self,
        manga_id: int,
        task_type: str,
        chapter_ids: list[int] | None = None,
        content_types: list[str] | None = None,
        priority: int = 0,
    ) -> DownloadTask:
        async with self._factory() as db:
            task = DownloadTask(
                manga_id=manga_id,
                task_type=task_type,
                status="pending",
                priority=priority,
                chapter_ids=json.dumps(chapter_ids) if chapter_ids else None,
                content_types=json.dumps(content_types) if content_types else None,
            )
            db.add(task)
            await db.commit()
            await db.refresh(task)

        logger.info("Enqueued task %d (%s) for manga %d", task.id, task_type, manga_id)
        self._notify.set()
        return task

    async def cancel(self, task_id: int) -> bool:
        async with self._factory() as db:
            task = await db.get(DownloadTask, task_id)
            # running 状态的任务正在 ThreadPoolExecutor 中执行，取消需要更复杂
            # 的中断机制，目前不支持。只允许取消尚未开始的 pending 任务。
            if task is None or task.status not in ("pending",):
                return False
            task.status = "cancelled"
            await db.commit()
        logger.info("Cancelled task %d", task_id)
        return True

    # ── Worker loop ───────────────────────────────────────────────────────────

    async def _loop(self) -> None:
        while self._running:
            # 外层循环：等待"有新任务"信号后进入内层消费循环。
            await self._notify.wait()
            self._notify.clear()

            # 内层循环：持续消费直到队列为空，避免在多个任务同时入队时
            # 每次只处理一个就回到 wait()（信号可能只 set 了一次）。
            while self._running:
                task = await self._pop_next()
                if task is None:
                    break
                await self._run_task(task)

    async def _pop_next(self) -> DownloadTask | None:
        async with self._factory() as db:
            stmt = (
                select(DownloadTask)
                .where(DownloadTask.status == "pending")
                .order_by(DownloadTask.priority.desc(), DownloadTask.created_at)
                .limit(1)
            )
            result = await db.execute(stmt)
            task   = result.scalar_one_or_none()
            if task is None:
                return None

            # SELECT + UPDATE 在同一个事务中完成，确保即使将来引入多 worker，
            # 同一个任务也不会被两个 worker 同时领取（乐观锁语义）。
            task.status     = "running"
            task.started_at = datetime.utcnow()
            await db.commit()
            return task

    async def _run_task(self, task: DownloadTask) -> None:
        logger.info("Starting task %d (%s)", task.id, task.task_type)
        await self._ws.broadcast("task_started", {"task_id": task.id, "task_type": task.task_type})

        async with self._factory() as db:
            # _pop_next 用的 session 已关闭，ORM 对象变为 detached 状态，
            # 必须在新 session 中重新 get() 才能安全读写其属性。
            task = await db.get(DownloadTask, task.id)
            try:
                await self._dl.execute_task(task, db)
                task.status       = "completed"
                task.completed_at = datetime.utcnow()
                logger.info("Task %d completed", task.id)
            except Exception as exc:
                task.status        = "failed"
                task.completed_at  = datetime.utcnow()
                task.error_message = str(exc)
                logger.error("Task %d failed: %s", task.id, exc)
            finally:
                # finally 保证无论成功/失败/异常，状态都能写回 DB，
                # 不留 status=running 的僵尸任务。
                await db.commit()

        await self._ws.broadcast("task_finished", {
            "task_id": task.id, "status": task.status, "error": task.error_message
        })

    # ── Crash recovery ────────────────────────────────────────────────────────

    async def _recover(self) -> None:
        async with self._factory() as db:
            # status=running 说明上次进程在任务执行中途崩溃，重置为 pending 重跑。
            # 章节下载是幂等的（已有 zip 文件会被覆盖），重跑没有副作用。
            await db.execute(
                update(DownloadTask)
                .where(DownloadTask.status == "running")
                .values(status="pending", started_at=None)
            )
            # status=downloading 的章节同理：图片已下载的部分会在重跑时被覆盖，
            # 未下载的部分会补全，最终结果一致。
            await db.execute(
                update(Chapter)
                .where(Chapter.status == "downloading")
                .values(status="not_downloaded")
            )
            await db.commit()
        logger.info("Queue recovery complete")
