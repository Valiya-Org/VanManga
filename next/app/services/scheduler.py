"""
SchedulerService

Manages two recurring jobs:
  1. auto_update  — daily check for new chapters for all managed manga
  2. kavita_sync  — periodic Kavita library metadata pull

Both jobs re-read their schedules from admin_settings on each reschedule
call, so admin changes take effect after the next settings update.
"""
import httpx
import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

logger = logging.getLogger(__name__)

_JOB_AUTO_UPDATE  = "auto_update"
_JOB_KAVITA_SYNC  = "kavita_sync"


class SchedulerService:
    def __init__(self, session_factory, queue_manager, settings_svc):
        self._factory   = session_factory
        self._queue     = queue_manager
        self._settings  = settings_svc
        self._scheduler = AsyncIOScheduler(timezone="UTC")

    async def start(self) -> None:
        self._scheduler.start()
        await self.reschedule()
        logger.info("Scheduler started")

    async def stop(self) -> None:
        self._scheduler.shutdown(wait=False)

    async def reschedule(self) -> None:
        """Re-read settings and rebuild jobs.  Called on startup and after settings changes."""
        await self._setup_auto_update()
        await self._setup_kavita_sync()

    # ── Auto update ───────────────────────────────────────────────────────────

    async def _setup_auto_update(self) -> None:
        enabled = await self._settings.get_bool("auto_update_enabled", True)
        cron    = await self._settings.get("auto_update_cron", "01:30")

        if self._scheduler.get_job(_JOB_AUTO_UPDATE):
            self._scheduler.remove_job(_JOB_AUTO_UPDATE)

        if not enabled:
            logger.info("Auto-update disabled")
            return

        try:
            hour, minute = cron.split(":")
        except ValueError:
            hour, minute = "1", "30"

        self._scheduler.add_job(
            self._run_auto_update,
            trigger="cron",
            hour=int(hour),
            minute=int(minute),
            id=_JOB_AUTO_UPDATE,
            # replace_existing=True 使 reschedule() 能直接覆盖旧 job，
            # 无需先 remove_job 再 add_job（remove 后 add 之间有竞态窗口）。
            replace_existing=True,
        )
        logger.info("Auto-update scheduled at %s:%s UTC", hour, minute)

    async def _run_auto_update(self) -> None:
        logger.info("Auto-update: starting")
        from app.models.manga import Manga
        async with self._factory() as db:
            rows = (await db.execute(
                select(Manga).where(Manga.auto_update.is_(True))
            )).scalars().all()

        for manga in rows:
            await self._queue.enqueue(manga.id, "update", priority=-1)

        logger.info("Auto-update: enqueued %d manga", len(rows))

    # ── Kavita sync ───────────────────────────────────────────────────────────

    async def _setup_kavita_sync(self) -> None:
        enabled  = await self._settings.get_bool("kavita_enabled", False)
        interval = await self._settings.get_int("kavita_sync_interval_hours", 6)

        if self._scheduler.get_job(_JOB_KAVITA_SYNC):
            self._scheduler.remove_job(_JOB_KAVITA_SYNC)

        if not enabled:
            return

        self._scheduler.add_job(
            self._run_kavita_sync,
            trigger="interval",
            hours=max(1, interval),
            id=_JOB_KAVITA_SYNC,
            replace_existing=True,
            # next_run_time=now 使 job 在注册后立即执行一次，
            # 确保管理员刚启用 Kavita 集成时不必等待第一个 interval 到期。
            next_run_time=datetime.utcnow(),
        )
        logger.info("Kavita sync scheduled every %dh", interval)

    async def _run_kavita_sync(self) -> None:
        from app.models.manga import Manga

        logger.info("Kavita sync: starting")
        snap = await self._settings.snapshot()

        base_url   = snap.get("kavita_base_url", "")
        expose_url = snap.get("kavita_expose_url", "")
        api_key    = snap.get("kavita_admin_apikey", "")
        lib_id     = snap.get("kavita_lib_id", "1")

        if not all([base_url, expose_url, api_key]):
            logger.warning("Kavita sync skipped: incomplete configuration")
            return

        auth_url = f"{base_url}/api/Plugin/authenticate?apiKey={api_key}&pluginName=vanmanga-next"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r   = await client.post(auth_url)
                r.raise_for_status()
                jwt = r.json()["token"]

                headers = {"Authorization": f"Bearer {jwt}"}
                r       = await client.post(
                    f"{base_url}/api/Series/all-v2", headers=headers, json={}
                )
                series = r.json()
        except Exception as exc:
            logger.error("Kavita sync HTTP error: %s", exc)
            return

        async with self._factory() as db:
            for s in series:
                folder = s.get("folderPath", "")
                if "$" not in folder:
                    continue
                source_manga_id  = folder.split("$")[1]
                kavita_series_id = s["id"]

                row = (await db.execute(
                    select(Manga).where(Manga.source_manga_id == source_manga_id)
                )).scalar_one_or_none()

                if row:
                    row.kavita_url = f"{expose_url}/library/{lib_id}/series/{kavita_series_id}"

            await db.commit()

        logger.info("Kavita sync: complete")
