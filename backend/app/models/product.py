from pydantic import BaseModel
from typing import Optional, List

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: Optional[float] = None  # Разрешаем null для "Цена по запросу"
    image_url: Optional[str] = None  # Для обратной совместимости
    images_urls: Optional[List[str]] = None  # Массив URL изображений (до 5 фото)
    discount: float = 0.0
    category_id: int
    is_hot_offer: bool = False  # Горящее предложение
    quantity: int = 0  # Количество товара на складе
    is_made_to_order: bool = False  # Товар под заказ
    is_for_sale: bool = False  # Товар для покупки (с диапазоном цен)
    is_sale_enabled: bool = False  # Товар доступен для продажи клиентам (когда мы продаем товар)
    is_reservation_enabled: bool = False  # Товар доступен для резервации (взаимоисключающий с sale/order)
    price_from: Optional[float] = None  # Цена от (для товаров для покупки с диапазоном)
    price_to: Optional[float] = None  # Цена до (для товаров для покупки с диапазоном)
    price_fixed: Optional[float] = None  # Фиксированная цена покупки (для товаров для покупки с фиксированной ценой)
    price_type: str = 'range'  # Тип цены: 'range' (от-до) или 'fixed' (фиксированная)
    quantity_from: Optional[int] = None  # Количество от (для товаров для покупки)
    quantity_unit: Optional[str] = None  # Единица измерения количества (шт или кг)
    quantity_show_enabled: Optional[bool] = None  # Индивидуальная настройка показа количества (null = использовать общую настройку магазина)
    is_hidden: bool = False  # Скрыт ли товар от клиентов (виден только админу)
    is_client_sale: bool = False  # Товар для продажи клиентом другим клиентам (C2C)
    seller_id: Optional[int] = None  # ID клиента-продавца (для C2C товаров)
    price_card: Optional[float] = None  # Цена по карте (для товаров с is_sale_enabled или is_made_to_order)
    price_cash: Optional[float] = None  # Цена наличными (для товаров с is_sale_enabled или is_made_to_order)
    price_old: Optional[float] = None  # Старая цена (зачёркнутая, для акций)
    delivery_time: Optional[str] = None  # Срок доставки (текст)
    delivery_price: Optional[float] = None  # Стоимость доставки (число, может быть 0)

class ProductCreate(ProductBase):
    pass

class Product(ProductBase):
    id: int
    user_id: Optional[int] = None
    bot_id: Optional[int] = None
    sync_product_id: Optional[int] = None  # ID "главной" копии (main bot); для клиента = какой товар виден на витрине
    reservation: Optional[dict] = None  # Информация о резервации
    characteristics: Optional[List[dict]] = None  # [{"name": "...", "value": "..."}, ...]
    delivery: Optional["ProductDeliveryOut"] = None  # Настройки доставки (из product_delivery)
    
    # ========== ПОЛЯ ТИПА ДЕЙСТВИЯ (вычисляются на бэкенде) ==========
    action_type: Optional[str] = None  # "sale" | "reserve" | "order" | "purchase" | "none"
    can_add_to_cart: Optional[bool] = None  # True только если action_type == "sale"
    reason_not_sale: Optional[str] = None  # Причина, если can_add_to_cart == False (для UI)
    # ========== КОНЕЦ ПОЛЕЙ ТИПА ДЕЙСТВИЯ ==========

    class Config:
        from_attributes = True

class HotOfferUpdate(BaseModel):
    is_hot_offer: bool

class PriceDiscountUpdate(BaseModel):
    price: Optional[float] = None  # Legacy: разрешаем null для "Цена по запросу"
    price_card: Optional[float] = None  # Цена по карте (приоритет над price для витрины)
    price_cash: Optional[float] = None  # Цена наличными
    discount: float = 0.0

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

class HiddenUpdate(BaseModel):
    is_hidden: bool  # Скрыть/показать товар для клиентов

class SaleEnabledUpdate(BaseModel):
    is_sale_enabled: bool  # Включить/выключить продажу товара клиентам

class ReservationEnabledUpdate(BaseModel):
    is_reservation_enabled: bool  # Включить/выключить резервацию товара


# === Характеристики товара (product_characteristics) ===

class ProductCharacteristicOut(BaseModel):
    """Схема характеристики товара в ответе API (id, name, value, sort_order)."""
    id: int
    name: str
    value: str
    sort_order: int


class ProductCharacteristicUpdateIn(BaseModel):
    """Один элемент списка при PATCH характеристик: id опционален (если нет — создаём новую)."""
    id: Optional[int] = None
    name: str
    value: str
    sort_order: int = 0


class ProductCharacteristicsUpdateIn(BaseModel):
    """Request body для PATCH /api/products/{id}/characteristics — замена списком."""
    characteristics: List[ProductCharacteristicUpdateIn]


# === Доставка (product_delivery) ===

class ProductDeliveryUpdateIn(BaseModel):
    """Request body для PATCH /api/products/{id}/delivery — полная замена настроек доставки."""
    is_delivery_enabled: bool = False
    is_pickup_enabled: bool = False
    delivery_time: Optional[str] = None
    delivery_price: Optional[float] = None
    pickup_address: Optional[str] = None


class ProductDeliveryOut(BaseModel):
    """Ответ: настройки доставки товара."""
    is_delivery_enabled: bool
    is_pickup_enabled: bool
    delivery_time: Optional[str] = None
    delivery_price: Optional[float] = None
    pickup_address: Optional[str] = None



