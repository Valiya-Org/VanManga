"""
DownloadManager

Concurrency model
─────────────────
• One manga task runs at a time (enforced by QueueManager).
• Within that task, up to `chapter_concurrent` chapters download in parallel
  (asyncio.Semaphore), default 2, configurable 1-5 via admin_settings.
• Within each chapter, images are downloaded sequentially (original logic)
  in a ThreadPoolExecutor to avoid blocking the event loop.
• Image-level rate limiting and 429 back-off are handled inside
  scraper.download_image (1-2 s per image, exponential back-off on 429).
"""
import asyncio
import json
import logging
import os
import zipfile
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.manga import Manga
from app.models.chapter import Chapter
from app.models.task import DownloadTask
from app.sources.registry import SourceRegistry
from app.sources.base import ChapterInfo, ContentType
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)

# 模块级单例：复用线程池，避免每次任务创建/销毁的开销。
# 线程数不设上限（ThreadPoolExecutor 默认），因为同时运行的章节下载数
# 已经由 Semaphore 限制在 1-5 之内。
_executor = ThreadPoolExecutor(thread_name_prefix="dl")


class DownloadManager:
    def __init__(
        self,
        registry: SourceRegistry,
        ws_manager,
        settings_svc: SettingsService,
    ):
        self._registry     = registry
        self._ws           = ws_manager
        self._settings_svc = settings_svc

    # ── Public entry point ────────────────────────────────────────────────────

    async def execute_task(self, task: DownloadTask, db: AsyncSession) -> None:
        manga: Manga = await db.get(Manga, task.manga_id)
        if manga is None:
            raise RuntimeError(f"Manga {task.manga_id} not found")

        source = self._registry.get(manga.source_id)
        if source is None:
            raise RuntimeError(f"Unknown source '{manga.source_id}'")

        # 每次任务开始前从 DB 读取最新设置，而非用缓存值——这是热更新生效的关键。
        snap = await self._settings_svc.snapshot()
        source.apply_settings({
            "flaresolverr_enabled": snap.get("flaresolverr_enabled", "false").lower() == "true",
            "flaresolverr_url":     snap.get("flaresolverr_url", ""),
            "error_backoff_base":   int(snap.get("error_backoff_base", "40")),
        })
        # error_state 在任务间共享于 source 实例上，必须在每次任务开始时重置，
        # 否则上一次任务积累的 g_error_count 会让这次任务的退避时间异常偏长。
        source.reset_error_state()

        from app.core.config import get_settings as _get_settings
        manga_base         = _get_settings().manga_base_path
        chapter_concurrent = max(1, min(5, int(snap.get("chapter_concurrent", "2"))))
        request_delay_base = max(0, int(snap.get("request_delay_base", "2")))

        chapters = await self._resolve_chapters(task, manga, db, source, snap)
        if not chapters:
            logger.info("Task %d: no chapters to download", task.id)
            return

        await self._update_progress(task, db, total=len(chapters), done=0)

        semaphore  = asyncio.Semaphore(chapter_concurrent)
        done_count = 0

        async def process(ch_row: Chapter, ch_info: ChapterInfo):
            nonlocal done_count
            async with semaphore:
                await self._download_chapter(
                    task, manga, ch_row, ch_info, source, db, manga_base, request_delay_base
                )
                # done_count 的读写全在同一个事件循环线程里，不存在数据竞争，
                # 无需加锁。asyncio 的并发是协作式的，await 是唯一切换点。
                done_count += 1
                await self._update_progress(
                    task, db, total=len(chapters), done=done_count,
                    current=ch_info.title,
                )

        # gather 一次性提交全部章节协程，由 Semaphore 控制实际并发数。
        # 这比分批提交更简单：不需要手动切片，进度计数也是原子更新的。
        await asyncio.gather(*[process(row, info) for row, info in chapters])

    # ── Chapter resolution ────────────────────────────────────────────────────

    async def _resolve_chapters(
        self, task: DownloadTask, manga: Manga, db: AsyncSession,
        source, snap: dict
    ) -> list[tuple[Chapter, ChapterInfo]]:
        """
        For full/update tasks: sync chapter list from source then return
        all not_downloaded/failed chapters.
        For redownload tasks: return only the specified chapter ids.
        """
        if task.task_type in ("full", "update"):
            await self._sync_chapters(manga, db, source)

        stmt = select(Chapter).where(Chapter.manga_id == manga.id)

        if task.chapter_ids:
            ids = json.loads(task.chapter_ids)
            stmt = stmt.where(Chapter.id.in_(ids))
        else:
            stmt = stmt.where(Chapter.status.in_(["not_downloaded", "failed"]))

        if task.content_types:
            allowed = json.loads(task.content_types)
            stmt = stmt.where(Chapter.content_type.in_(allowed))

        rows = (await db.execute(stmt)).scalars().all()

        # ChapterInfo 从 DB 行重建，而非从 source 重新抓取——source_chapter_id
        # 存的就是 URL 路径，足以让 scraper 直接发起请求，不需要再解析章节列表。
        pairs = []
        for row in rows:
            info = ChapterInfo(
                source_chapter_id=row.source_chapter_id,
                number=row.number,
                title=row.title,
                content_type=ContentType(row.content_type),
            )
            pairs.append((row, info))

        pairs.sort(key=lambda p: p[0].number)
        return pairs

    async def _sync_chapters(self, manga: Manga, db: AsyncSession, source) -> None:
        """Fetch the latest chapter list and upsert into DB."""
        loop   = asyncio.get_event_loop()
        # get_manga_detail 是同步阻塞调用（requests + BS4），放入 executor
        # 避免阻塞事件循环，导致 WS 推送和其他协程无响应。
        detail = await loop.run_in_executor(
            _executor,
            lambda: source.get_manga_detail(manga.source_manga_id)
        )
        if isinstance(detail, int):
            logger.error("Failed to fetch chapter list for %s (code %d)", manga.name, detail)
            return

        existing = {
            row.source_chapter_id: row
            for row in (
                await db.execute(select(Chapter).where(Chapter.manga_id == manga.id))
            ).scalars().all()
        }

        for info in detail.all_chapters():
            # 只插入新章节，不修改已有记录——已下载的章节状态不应被重置。
            if info.source_chapter_id not in existing:
                db.add(Chapter(
                    manga_id=manga.id,
                    source_chapter_id=info.source_chapter_id,
                    number=info.number,
                    title=info.title,
                    content_type=info.content_type.value,
                    status="not_downloaded",
                ))

        manga.is_completed = detail.is_completed
        await db.commit()

    # ── Single chapter download ───────────────────────────────────────────────

    async def _download_chapter(
        self,
        task: DownloadTask,
        manga: Manga,
        ch_row: Chapter,
        ch_info: ChapterInfo,
        source,
        db: AsyncSession,
        manga_base: str,
        request_delay_base: int,
    ) -> None:
        logger.info("Task %d: downloading chapter '%s'", task.id, ch_info.title)

        ch_row.status = "downloading"
        await db.commit()
        await self._ws.broadcast("chapter_status", {
            "manga_id": manga.id, "chapter_id": ch_row.id, "status": "downloading"
        })

        loop = asyncio.get_event_loop()
        try:
            # 整个章节的图片抓取和写盘都是同步操作，必须在 executor 中运行。
            # lambda 捕获当前的局部变量快照，避免协程切换后变量被覆盖。
            success, zip_path = await loop.run_in_executor(
                _executor,
                lambda: _blocking_download_chapter(
                    source, manga, ch_row, ch_info, manga_base, request_delay_base
                ),
            )
        except Exception as exc:
            logger.error("Chapter '%s' raised exception: %s", ch_info.title, exc)
            success, zip_path = False, ""

        if success:
            ch_row.status        = "downloaded"
            ch_row.file_path     = zip_path
            ch_row.downloaded_at = datetime.utcnow()
            ch_row.retry_count   = 0
        else:
            ch_row.status      = "failed"
            ch_row.retry_count += 1

        await db.commit()
        await self._ws.broadcast("chapter_status", {
            "manga_id": manga.id,
            "chapter_id": ch_row.id,
            "status": ch_row.status,
        })

    # ── Progress helper ───────────────────────────────────────────────────────

    async def _update_progress(
        self, task: DownloadTask, db: AsyncSession,
        total: int, done: int, current: str = ""
    ) -> None:
        task.progress = json.dumps({"total": total, "done": done, "current_chapter": current})
        await db.commit()
        await self._ws.broadcast("task_progress", {
            "task_id": task.id, "total": total, "done": done, "current_chapter": current
        })


# ── Blocking helper (runs in ThreadPoolExecutor) ──────────────────────────────

def _blocking_download_chapter(
    source, manga: Manga, ch_row: Chapter, ch_info: ChapterInfo,
    manga_base: str, request_delay_base: int,
) -> tuple[bool, str]:
    """
    同步函数，在 ThreadPoolExecutor 线程中运行。
    负责：获取图片列表 → 顺序下载 → 失败重试 → 打包 zip。
    """
    import time
    import random as _random

    pages = source.get_chapter_images(manga.source_manga_id, ch_info)
    if isinstance(pages, int):
        logger.error("get_chapter_images returned error code %d for '%s'", pages, ch_info.title)
        return False, ""

    # 路径格式与原项目一致：{漫画名}${manga_id}/{漫画名}/{章节名}/
    # "$" 分隔符用于 Kavita 集成时解析 manga_id（见 scheduler.py kavita_sync）。
    safe_name   = manga.name.replace("/", "-")
    folder_root = os.path.join(manga_base, f"{safe_name}${manga.source_manga_id}", safe_name)
    chapter_dir = os.path.join(folder_root, ch_info.title)
    os.makedirs(chapter_dir, exist_ok=True)

    failed_count = 0
    failed_pages = []

    from app.sources.dogemanga.scraper import download_image

    for label, url in pages:
        # 超过 10 张失败视为章节不可用，提前终止避免无谓等待。
        if failed_count >= 10:
            logger.warning("Chapter '%s': too many failures, aborting", ch_info.title)
            return False, ""

        dest = os.path.join(chapter_dir, f"{label}.jpg")
        if not download_image(label, url, dest, source.cf_dict, source.error_state):
            failed_pages.append((label, url))
            failed_count += 1

    # 二次重试：首轮下载完整走完后再统一重试失败项，
    # 避免因一张图失败就中断影响后续正常图片的下载进度。
    for label, url in failed_pages:
        dest = os.path.join(chapter_dir, f"{label}.jpg")
        download_image(label, url, dest, source.cf_dict, source.error_state)

    zip_path = chapter_dir + ".zip"
    _zip_dir(chapter_dir, zip_path)

    # 章节间延迟：在 blocking 函数里 sleep 不影响事件循环，
    # 因为整个函数已经在独立线程中运行。
    time.sleep(request_delay_base + int(_random.random() * 3))

    return True, zip_path


def _zip_dir(src: str, dest: str) -> None:
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(src):
            for fname in files:
                # "~$" 前缀是 Office 临时锁文件，打进 zip 会导致阅读器报错。
                if fname.startswith("~$"):
                    continue
                fpath = os.path.join(root, fname)
                zf.write(fpath, os.path.relpath(fpath, src))
    # zip 完成后删除原始图片文件夹，不保留冗余副本。
    shutil.rmtree(src)
