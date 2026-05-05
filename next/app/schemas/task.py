from datetime import datetime
from pydantic import BaseModel


class TaskOut(BaseModel):
    id: int
    manga_id: int
    task_type: str
    status: str
    priority: int
    chapter_ids: str | None
    content_types: str | None
    progress: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    manga_id: int
    task_type: str = "full"
    chapter_ids: list[int] | None = None
    priority: int = 0
