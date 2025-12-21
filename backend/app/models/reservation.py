from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ReservationBase(BaseModel):
    product_id: int
    reserved_until: datetime

class ReservationCreate(ReservationBase):
    pass

class Reservation(ReservationBase):
    id: int
    user_id: int  # Владелец магазина
    reserved_by_user_id: int  # Кто зарезервировал
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


