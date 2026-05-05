from datetime import datetime
from pydantic import BaseModel
from app.sources.base import ContentType


class MangaBase(BaseModel):
    name: str
    artist: str = ""
    is_completed: bool = False
    auto_update: bool = True
    kavita_url: str = ""


class MangaCreate(BaseModel):
    source_id: str
    source_manga_id: str
    name: str
    artist: str = ""
    is_completed: bool = False
    cover_url: str = ""
    # Which content types to download. None / omitted = download all types.
    # Valid values: "tankobon", "chapter", "other"
    content_types: list[ContentType] | None = None


class MangaUpdate(BaseModel):
    auto_update: bool | None = None
    kavita_url: str | None = None


class MangaOut(MangaBase):
    id: int
    source_id: str
    source_manga_id: str
    cover_path: str
    add_date: datetime

    model_config = {"from_attributes": True}


class SearchResultOut(BaseModel):
    source_manga_id: str
    name: str
    artist: str
    cover_url: str
    is_completed: bool
    newest_chapter: str = ""
    thumbnail_b64: str = ""
