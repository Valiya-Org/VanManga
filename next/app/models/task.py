from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DownloadTask(Base):
    __tablename__ = "download_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[int] = mapped_column(Integer, ForeignKey("manga.id"), nullable=False)

    # full | update | redownload | rezip
    task_type: Mapped[str] = mapped_column(String, nullable=False)

    # pending | running | completed | failed | cancelled
    status: Mapped[str] = mapped_column(String, default="pending")

    priority: Mapped[int] = mapped_column(Integer, default=0)

    # JSON array of chapter DB ids; NULL means all pending chapters
    chapter_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON array of ContentType strings to download; NULL means all types
    # e.g. ["tankobon"], ["chapter", "other"]
    content_types: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON: {"total": N, "done": N, "current_chapter": "title"}
    progress: Mapped[str] = mapped_column(Text, default="{}")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, default="")

    manga: Mapped["Manga"] = relationship("Manga", back_populates="tasks")  # noqa: F821
