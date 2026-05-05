import logging
import logging.handlers
import gzip
import shutil
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.core.config import get_settings
from app.core.database import init_db, AsyncSessionLocal

logger = logging.getLogger(__name__)


def _setup_logging(log_path: str) -> None:
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )

    # RotatingFileHandler 默认用 rename 换名，重写 rotator/namer 使备份直接
    # gzip 压缩，省去二次处理步骤。namer 必须与 rotator 配套：rotator 写入
    # "<原名>.gz"，namer 让 handler 也用同一命名方案查找已有备份文件。
    def _gzip_rotator(source: str, dest: str) -> None:
        with open(source, "rb") as f_in, gzip.open(dest + ".gz", "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        os.remove(source)

    handler.rotator = _gzip_rotator
    handler.namer = lambda name: name + ".gz"

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)-8s %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(fmt)

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    root.addHandler(logging.StreamHandler())


async def _migrate_db() -> None:
    """Add columns introduced after the initial schema without requiring Alembic."""
    from sqlalchemy import text
    from app.core.database import engine

    migrations = [
        "ALTER TABLE download_tasks ADD COLUMN content_types TEXT",
    ]
    async with engine.begin() as conn:
        for stmt in migrations:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass  # column already exists


async def _init_admin_settings(db) -> None:
    from app.models.admin_settings import AdminSetting

    defaults = [
        ("flaresolverr_enabled",       "false",  "bool",   "CloudFlare 绕过开关"),
        ("flaresolverr_url",            "",       "url",    "FlareSolverr 服务地址"),
        ("kavita_enabled",              "false",  "bool",   "Kavita 集成总开关"),
        ("kavita_base_url",             "",       "url",    "Kavita 内部地址"),
        ("kavita_expose_url",           "",       "url",    "Kavita 外部访问地址"),
        ("kavita_admin_apikey",         "",       "secret", "Kavita Admin API Key"),
        ("kavita_lib_id",               "1",      "str",    "Kavita 库 ID"),
        ("kavita_sync_interval_hours",  "6",      "int",    "Kavita 元数据同步频率（小时）"),
        ("auto_update_enabled",         "true",   "bool",   "每日自动检查更新"),
        ("auto_update_cron",            "01:30",  "str",    "每日更新执行时间 HH:MM"),
        ("boot_scan_enabled",           "true",   "bool",   "启动时扫描已有库"),
        ("chapter_concurrent",          "2",      "int",    "同时下载章节数 (1-5)"),
        ("request_delay_base",          "2",      "int",    "章节间请求延迟基准（秒）"),
        ("error_backoff_base",          "40",     "int",    "429 退避基准时间（秒）"),
    ]

    for key, default, vtype, desc in defaults:
        # 只插入缺失的键，绝不覆盖已有值——保证重启后用户改过的设置不被还原。
        existing = await db.get(AdminSetting, key)
        if existing is None:
            db.add(AdminSetting(key=key, value=default, value_type=vtype, description=desc))

    await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # 日志必须最先初始化，后续所有步骤的错误才能被记录到文件。
    _setup_logging(settings.log_path)

    logger.info("VanManga Next starting up...")

    # 建表：必须在任何服务读写 DB 之前完成。
    await init_db()
    await _migrate_db()

    async with AsyncSessionLocal() as db:
        await _init_admin_settings(db)

    # Auth provider 初始化顺序有约束：
    #   token 模式的 bootstrap() 依赖 admin_settings 表已存在（上一步保证）。
    if settings.auth_mode == "jwt":
        from app.core.auth.jwt_auth import JWTAuthProvider
        auth_provider = JWTAuthProvider()
    else:
        from app.core.auth.token_auth import TokenAuthProvider
        auth_provider = TokenAuthProvider(
            preset_token=settings.admin_token,
            session_factory=AsyncSessionLocal,
        )
        async with AsyncSessionLocal() as db:
            await auth_provider.bootstrap(db)

    app.state.auth_provider = auth_provider

    # source registry 必须在 QueueManager 启动前就绪：
    # QueueManager.start() 会立即恢复 pending 任务并开始执行，
    # 执行时 DownloadManager 会通过 registry 查找 source。
    from app.sources.registry import SourceRegistry
    from app.sources.dogemanga.source import DogeMangaSource
    registry = SourceRegistry()
    registry.register(DogeMangaSource())
    app.state.source_registry = registry

    from app.ws.manager import WSManager
    ws_manager = WSManager()
    app.state.ws_manager = ws_manager

    from app.services.settings_service import SettingsService
    from app.services.download_manager import DownloadManager
    from app.services.queue_manager import QueueManager
    from app.services.scheduler import SchedulerService

    settings_svc  = SettingsService(AsyncSessionLocal)
    download_mgr  = DownloadManager(registry, ws_manager, settings_svc)
    queue_mgr     = QueueManager(AsyncSessionLocal, download_mgr, ws_manager)
    # SchedulerService 依赖 queue_mgr 来 enqueue 定时任务，必须最后创建。
    scheduler_svc = SchedulerService(AsyncSessionLocal, queue_mgr, settings_svc)

    app.state.settings_service  = settings_svc
    app.state.download_manager  = download_mgr
    app.state.queue_manager     = queue_mgr
    app.state.scheduler_service = scheduler_svc

    # queue 先于 scheduler 启动：scheduler 的第一次 kavita_sync 触发时
    # (next_run_time=now) 会立即 enqueue，queue 必须已处于监听状态。
    await queue_mgr.start()
    await scheduler_svc.start()

    logger.info("VanManga Next ready.")

    yield

    logger.info("VanManga Next shutting down...")
    # 关闭顺序与启动相反：先停调度器（不再产生新任务），再停队列（等当前任务结束）。
    await scheduler_svc.stop()
    await queue_mgr.stop()
