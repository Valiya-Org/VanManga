from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum


class ContentType(str, Enum):
    TANKOBON = "tankobon"   # 单行本（合订卷）
    CHAPTER  = "chapter"    # 单章（连载）
    OTHER    = "other"      # 番外 / 特典 / 未分类


@dataclass
class SearchResult:
    source_manga_id: str
    name: str
    artist: str
    cover_url: str
    is_completed: bool
    newest_chapter: str = ""
    thumbnail_b64: str = ""     # base64 encoded cover, filled by source if available


@dataclass
class ChapterInfo:
    source_chapter_id: str      # URL path or unique ID on the source site
    number: float               # Numeric order for sorting; use negative for extras
    title: str
    content_type: ContentType


@dataclass
class ContentGroup:
    """Chapters of the same logical type grouped together."""
    content_type: ContentType
    label: str                  # Human-readable label, e.g. "單行本" / "連載" / "番外"
    chapters: list[ChapterInfo] = field(default_factory=list)


@dataclass
class MangaDetail:
    source_manga_id: str
    name: str
    artist: str
    cover_url: str
    is_completed: bool
    groups: list[ContentGroup] = field(default_factory=list)

    def all_chapters(self) -> list[ChapterInfo]:
        result = []
        for g in self.groups:
            result.extend(g.chapters)
        return result


class MangaSource(ABC):
    source_id: str       # e.g. "dogemanga" — used as FK in DB
    display_name: str    # e.g. "DogeManga"

    @abstractmethod
    def search(self, query: str, cf_dict: dict) -> list[SearchResult]:
        """Search for manga by title. Returns up to 10 results."""
        ...

    @abstractmethod
    def get_manga_detail(self, source_manga_id: str, cf_dict: dict) -> MangaDetail:
        """Fetch full manga metadata and grouped chapter list."""
        ...

    @abstractmethod
    def get_chapter_images(
        self, source_manga_id: str, chapter: ChapterInfo, cf_dict: dict
    ) -> list[tuple[str, str]]:
        """
        Return ordered list of (page_label, image_url) for every page in the chapter.
        The caller downloads them sequentially.
        """
        ...
