from datetime import datetime
from sqlalchemy import Integer, String, Boolean, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Manga(Base):
    __tablename__ = "manga"
    __table_args__ = (UniqueConstraint("source_id", "source_manga_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_id: Mapped[str] = mapped_column(String, nullable=False)
    source_manga_id: Mapped[str] = mapped_column(String, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)
    artist: Mapped[str] = mapped_column(String, default="")
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_update: Mapped[bool] = mapped_column(Boolean, default=True)

    cover_path: Mapped[str] = mapped_column(String, default="")
    kavita_url: Mapped[str] = mapped_column(String, default="")

    add_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    chapters: Mapped[list["Chapter"]] = relationship(  # noqa: F821
        "Chapter", back_populates="manga", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["DownloadTask"]] = relationship(  # noqa: F821
        "DownloadTask", back_populates="manga", cascade="all, delete-orphan"
    )
