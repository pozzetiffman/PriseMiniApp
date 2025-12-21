from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ShopSettingsBase(BaseModel):
    reservations_enabled: bool = True

class ShopSettingsCreate(ShopSettingsBase):
    pass

class ShopSettingsUpdate(ShopSettingsBase):
    pass

class ShopSettings(ShopSettingsBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


