"""
migrate_library.py — 将旧版 manga_library.json 导入新版 SQLite 数据库

用法
----
  # 预览（不写库）
  python scripts/migrate_library.py --dry-run

  # 实际导入
  python scripts/migrate_library.py

  # 指定文件路径
  python scripts/migrate_library.py --library /path/to/manga_library.json

旧版字段说明
-----------
  manga_id        str   → source_manga_id（漫画在 DogeManga 的 ID）
  manga_name      str   → name
  artist_name     str   → artist
  serialization   int   → is_completed（0=连载中, 1=完结）
  download_switch int   → auto_update（0=开启自动更新, 1=关闭；取反）
  kavita_url      str   → kavita_url
  add_date        float → add_date（Unix 时间戳 → datetime）
  thumbnail       str   → 跳过（旧版是指向原服务器 API 的 URL，无法迁移）
  completed       bool  → 跳过（旧版标记"首次下载是否完成"，新版无对应字段）
  last_epi        int   → 跳过（旧版记录已下载章节数，新版用 chapters 表记录）
  last_epi_name   str   → 跳过（同上）

章节数据
-------
旧版库中不保存单章的 URL/ID，无法直接还原 chapters 表记录。
迁移完成后可通过 POST /api/tasks（task_type="update"）触发各漫画的章节同步。
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# 将项目根目录加入 sys.path，使 app.* 导入正常工作
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))


async def migrate(library_path: Path, dry_run: bool) -> None:
    # 延迟导入，确保 sys.path 已更新
    from app.core.database import init_db, AsyncSessionLocal
    from app.models.manga import Manga
    from sqlalchemy import select

    print(f"[migrate] 数据库路径：{_ROOT / 'data' / 'vanmanga.db'}")
    print(f"[migrate] 源文件路径：{library_path}")
    if dry_run:
        print("[migrate] *** DRY-RUN 模式，不会写入数据库 ***\n")

    # 读取旧版库文件
    with open(library_path, encoding="utf-8") as f:
        library: dict = json.load(f)

    total    = len(library)
    imported = 0
    skipped  = 0
    errors   = 0

    if not dry_run:
        await init_db()

    async with AsyncSessionLocal() as db:
        for manga_id, entry in library.items():
            name = entry.get("manga_name", "").strip()
            if not name:
                print(f"  [SKIP] {manga_id}: manga_name 为空，跳过")
                skipped += 1
                continue

            # 检查是否已存在
            existing = (await db.execute(
                select(Manga).where(
                    Manga.source_id == "dogemanga",
                    Manga.source_manga_id == manga_id,
                )
            )).scalar_one_or_none()

            if existing:
                print(f"  [SKIP] {manga_id} 《{name}》：数据库中已存在，跳过")
                skipped += 1
                continue

            # 字段映射
            artist      = entry.get("artist_name", "").strip()
            # serialization: 0=连载中, 1=完结 → is_completed
            is_completed = entry.get("serialization", 0) == 1
            # download_switch: 0=开启自动更新, 1=关闭 → auto_update（取反）
            auto_update  = entry.get("download_switch", 0) == 0
            kavita_url   = entry.get("kavita_url", "") or ""

            # add_date: Unix 时间戳（float）→ UTC datetime
            raw_ts = entry.get("add_date")
            try:
                add_date = datetime.fromtimestamp(raw_ts, tz=timezone.utc).replace(tzinfo=None)
            except (TypeError, ValueError, OSError):
                add_date = datetime.utcnow()

            # thumbnail 是旧服务器 API URL，无法迁移，置空
            # last_epi / last_epi_name 无对应字段，仅打印供参考
            last_epi      = entry.get("last_epi", 0)
            last_epi_name = entry.get("last_epi_name", "")
            old_completed = entry.get("completed", False)

            print(
                f"  [{'DRY' if dry_run else 'ADD'}] {manga_id} 《{name}》"
                f"  artist={artist or '(无)'}"
                f"  is_completed={is_completed}"
                f"  auto_update={auto_update}"
                f"  last_epi={last_epi}（{last_epi_name}）"
                f"  首次下载完成={old_completed}"
            )

            if not dry_run:
                manga = Manga(
                    source_id       = "dogemanga",
                    source_manga_id = manga_id,
                    name            = name,
                    artist          = artist,
                    is_completed    = is_completed,
                    auto_update     = auto_update,
                    kavita_url      = kavita_url,
                    cover_path      = "",   # 旧 thumbnail URL 无法迁移
                    add_date        = add_date,
                )
                db.add(manga)

            imported += 1

        if not dry_run:
            await db.commit()

    print()
    print("=" * 50)
    print(f"  总计    {total} 条")
    print(f"  导入    {imported} 条")
    print(f"  跳过    {skipped} 条（已存在）")
    if errors:
        print(f"  错误    {errors} 条")
    print("=" * 50)

    if imported and not dry_run:
        print()
        print("提示：章节记录未迁移（旧版库不保存章节 URL）。")
        print("请通过以下方式触发章节同步：")
        print("  POST /api/manga/{id}/redownload  （指定章节重下）")
        print("  或等待每日 auto_update 自动同步。")


def main() -> None:
    parser = argparse.ArgumentParser(description="将 manga_library.json 迁移到新版数据库")
    parser.add_argument(
        "--library",
        type=Path,
        default=_ROOT / "manga_library.json",
        help="旧版 manga_library.json 路径（默认：项目根目录）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅打印将执行的操作，不实际写入数据库",
    )
    args = parser.parse_args()

    if not args.library.exists():
        print(f"[ERROR] 找不到文件：{args.library}", file=sys.stderr)
        sys.exit(1)

    asyncio.run(migrate(args.library, args.dry_run))


if __name__ == "__main__":
    main()
