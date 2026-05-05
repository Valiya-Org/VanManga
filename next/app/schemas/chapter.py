from datetime import datetime
from pydantic import BaseModel


class ChapterOut(BaseModel):
    id: int
    manga_id: int
    source_chapter_id: str
    number: float
    title: str
    content_type: str
    status: str
    file_path: str
    downloaded_at: datetime | None
    retry_count: int

    model_config = {"from_attributes": True}
