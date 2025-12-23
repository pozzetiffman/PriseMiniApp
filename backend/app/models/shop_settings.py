from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ShopSettingsBase(BaseModel):
    reservations_enabled: bool = True
    quantity_enabled: bool = True  # Включен ли показ количества товаров и учет резервации
    shop_name: Optional[str] = None  # Название магазина
    welcome_image_url: Optional[str] = None  # Приветственное изображение/логотип магазина
    welcome_description: Optional[str] = None  # Приветственное описание/примечание магазина

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


