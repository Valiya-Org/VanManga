"""
Log query API.

Reads the rotating log files produced by RotatingFileHandler + gzip backup.
Supports filtering by level and a simple text search, with pagination.
"""
import gzip
import os
import re
from fastapi import APIRouter, Request, HTTPException

router = APIRouter(prefix="/logs", tags=["logs"])

_LEVEL_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+(DEBUG|INFO|WARNING|ERROR)\s+")


def _read_log_lines(log_path: str) -> list[str]:
    """Read all lines from the active log file and any gzip-compressed backups."""
    lines: list[str] = []

    # Compressed backups (oldest first)
    backups = sorted(
        [f for f in os.listdir(os.path.dirname(log_path) or ".")
         if f.startswith(os.path.basename(log_path)) and f.endswith(".gz")],
    )
    for backup in backups:
        path = os.path.join(os.path.dirname(log_path) or ".", backup)
        try:
            with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
                lines.extend(f.readlines())
        except OSError:
            pass

    # Active log file
    if os.path.exists(log_path):
        try:
            with open(log_path, encoding="utf-8", errors="replace") as f:
                lines.extend(f.readlines())
        except OSError:
            pass

    return lines


@router.get("")
async def query_logs(
    request: Request,
    level: str | None = None,
    search: str | None = None,
    page: int = 1,
    size: int = 100,
):
    from app.core.config import get_settings
    log_path = get_settings().log_path

    if not os.path.exists(log_path) and not any(
        f.endswith(".gz") for f in os.listdir(os.path.dirname(log_path) or ".")
        if f.startswith(os.path.basename(log_path))
    ):
        return {"lines": [], "total": 0}

    all_lines = _read_log_lines(log_path)

    if level:
        level_upper = level.upper()
        all_lines   = [l for l in all_lines if f" {level_upper} " in l]

    if search:
        all_lines = [l for l in all_lines if search.lower() in l.lower()]

    total  = len(all_lines)
    # Most recent first
    paged  = list(reversed(all_lines))[(page - 1) * size : page * size]

    return {
        "lines": [l.rstrip("\n") for l in paged],
        "total": total,
        "page":  page,
        "size":  size,
    }
