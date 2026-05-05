from datetime import datetime
from pydantic import BaseModel


class SettingOut(BaseModel):
    key: str
    value: str          # "***" for secret type
    value_type: str
    description: str
    updated_at: datetime
    updated_by: str

    model_config = {"from_attributes": True}


class SettingUpdate(BaseModel):
    value: str
