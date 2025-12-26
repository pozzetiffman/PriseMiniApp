import json
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, Union

class OrderBase(BaseModel):
    product_id: Optional[int]  # Может быть None, если товар был удален
    quantity: int = 1

class OrderCreate(OrderBase):
    promo_code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    delivery_method: Optional[str] = None  # delivery или pickup

class ProductInfo(BaseModel):
    id: int
    name: str
    price: float
    discount: float = 0.0
    image_url: Optional[str] = None
    images_urls: Optional[list] = None
    
    @field_validator('images_urls', mode='before')
    @classmethod
    def parse_images_urls(cls, v):
        """Преобразует images_urls из JSON строки в список"""
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

class Order(OrderBase):
    id: int
    user_id: int  # Владелец магазина
    ordered_by_user_id: int  # Кто заказал
    created_at: datetime
    is_completed: bool
    is_cancelled: bool
    promo_code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    delivery_method: Optional[str] = None
    status: Optional[str] = 'pending'
    product: Optional[ProductInfo] = None  # Информация о товаре

    class Config:
        from_attributes = True

