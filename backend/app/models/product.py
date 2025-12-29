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
    is_for_sale: bool = False  # Товар для покупки (с диапазоном цен)
    price_from: Optional[float] = None  # Цена от (для товаров для покупки с диапазоном)
    price_to: Optional[float] = None  # Цена до (для товаров для покупки с диапазоном)
    price_fixed: Optional[float] = None  # Фиксированная цена покупки (для товаров для покупки с фиксированной ценой)
    price_type: str = 'range'  # Тип цены: 'range' (от-до) или 'fixed' (фиксированная)
    quantity_from: Optional[int] = None  # Количество от (для товаров для покупки)
    quantity_unit: Optional[str] = None  # Единица измерения количества (шт или кг)
    quantity_show_enabled: Optional[bool] = None  # Индивидуальная настройка показа количества (null = использовать общую настройку магазина)

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
    quantity_unit: Optional[str] = None

class MadeToOrderUpdate(BaseModel):
    is_made_to_order: bool

class BulkMadeToOrderUpdate(BaseModel):
    is_made_to_order: bool

class ForSaleUpdate(BaseModel):
    is_for_sale: bool
    price_from: Optional[float] = None
    price_to: Optional[float] = None
    price_fixed: Optional[float] = None
    price_type: str = 'range'  # 'range' или 'fixed'
    quantity_from: Optional[int] = None
    quantity_unit: Optional[str] = None

class QuantityShowEnabledUpdate(BaseModel):
    quantity_show_enabled: Optional[bool] = None  # null = использовать общую настройку магазина



