from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ReservationBase(BaseModel):
    product_id: Optional[int] = None  # Может быть None, если товар удален
    reserved_until: datetime

class ReservationCreate(ReservationBase):
    product_id: int  # При создании product_id обязателен

class Reservation(ReservationBase):
    id: int
    user_id: int  # Владелец магазина
    reserved_by_user_id: int  # Кто зарезервировал
    created_at: datetime
    is_active: bool
    snapshot_id: Optional[str] = None  # ID snapshot товара на момент резервации

    class Config:
        from_attributes = True










