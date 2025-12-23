from pydantic import BaseModel
from typing import Optional, List

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    image_url: Optional[str] = None  # Для обратной совместимости
    images_urls: Optional[List[str]] = None  # Массив URL изображений (до 5 фото)
    discount: float = 0.0
    category_id: int
    is_hot_offer: bool = False  # Горящее предложение
    quantity: int = 0  # Количество товара на складе
    is_made_to_order: bool = False  # Товар под заказ

class ProductCreate(ProductBase):
    pass

class Product(ProductBase):
    id: int
    user_id: Optional[int] = None
    reservation: Optional[dict] = None  # Информация о резервации

    class Config:
        from_attributes = True

class HotOfferUpdate(BaseModel):
    is_hot_offer: bool

class PriceDiscountUpdate(BaseModel):
    price: float
    discount: float

class NameDescriptionUpdate(BaseModel):
    name: str
    description: Optional[str] = None

class QuantityUpdate(BaseModel):
    quantity: int

class MadeToOrderUpdate(BaseModel):
    is_made_to_order: bool



