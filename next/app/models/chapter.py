from datetime import datetime
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("manga_id", "source_chapter_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[int] = mapped_column(Integer, ForeignKey("manga.id"), nullable=False)

    source_chapter_id: Mapped[str] = mapped_column(String, nullable=False)
    number: Mapped[float] = mapped_column(Float, nullable=False)
    title: Mapped[str] = mapped_column(String, default="")

    # tankobon | chapter | other
    content_type: Mapped[str] = mapped_column(String, default="other")

    # not_downloaded | downloading | downloaded | failed
    status: Mapped[str] = mapped_column(String, default="not_downloaded")

    file_path: Mapped[str] = mapped_column(String, default="")
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    manga: Mapped["Manga"] = relationship("Manga", back_populates="chapters")  # noqa: F821
