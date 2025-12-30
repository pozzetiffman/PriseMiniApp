import json
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional
from .order import ProductInfo

class SaleBase(BaseModel):
    product_id: Optional[int]  # Может быть None, если товар был удален
    quantity: int = 1

class SaleCreate(SaleBase):
    promo_code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    delivery_method: Optional[str] = None  # delivery или pickup

class Sale(SaleBase):
    id: int
    user_id: int  # Владелец магазина
    sold_by_user_id: int  # Кто продал
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



