import json
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List

class PurchaseBase(BaseModel):
    product_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_number: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None  # cash или bank_transfer
    organization: Optional[str] = None

class PurchaseCreate(PurchaseBase):
    images_urls: Optional[List[str]] = None  # До 5 фото
    video_url: Optional[str] = None  # 1 видео

class ProductInfo(BaseModel):
    """Информация о товаре из snapshot для операций (совпадает с order.ProductInfo по полям)."""
    id: int
    name: str
    price: Optional[float] = None
    discount: float = 0.0
    image_url: Optional[str] = None
    images_urls: Optional[list] = None
    price_card: Optional[float] = None
    price_cash: Optional[float] = None
    price_old: Optional[float] = None
    description: Optional[str] = None
    is_for_sale: Optional[bool] = None
    price_from: Optional[float] = None
    price_to: Optional[float] = None
    price_fixed: Optional[float] = None
    price_type: Optional[str] = None

    @field_validator('images_urls', mode='before')
    @classmethod
    def parse_images_urls(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return []
        return []

    class Config:
        from_attributes = True
        extra = "allow"

class Purchase(PurchaseBase):
    id: int
    user_id: int  # Владелец магазина
    purchased_by_user_id: int  # Кто хочет продать товар
    created_at: datetime
    order_number: Optional[str] = None  # Уникальный номер операции (PUR-...); для старых записей может отсутствовать
    is_completed: bool
    is_cancelled: bool
    organization: Optional[str] = None
    images_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    status: Optional[str] = 'pending'
    product: Optional[ProductInfo] = None  # Информация о товаре

    class Config:
        from_attributes = True

class PurchaseUpdate(BaseModel):
    is_completed: Optional[bool] = None
    is_cancelled: Optional[bool] = None
    status: Optional[str] = None

