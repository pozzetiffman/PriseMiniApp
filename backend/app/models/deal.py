"""Pydantic-схемы для сделок (Deal)."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DealCheckoutItem(BaseModel):
    """Один товар в запросе на оформление сделки."""
    product_id: int
    quantity: int


class DealCheckoutRequest(BaseModel):
    """Тело запроса POST /api/deals/checkout и POST /api/deals/checkout/start."""
    items: List[DealCheckoutItem]


class DealConfirmRequest(BaseModel):
    """Тело запроса POST /api/deals/checkout/confirm."""
    deal_id: int
    payment_method: str  # card, cash, transfer, other
    delivery_method: str  # pickup, courier, none
    customer_name: str
    customer_phone: str
    delivery_address: Optional[str] = None
    customer_comment: Optional[str] = None


class DealItemProduct(BaseModel):
    """Товар из snapshot для отображения в позиции сделки."""
    id: Optional[int] = None
    name: Optional[str] = None
    price: Optional[float] = None
    price_card: Optional[float] = None
    price_cash: Optional[float] = None
    discount: float = 0.0
    image_url: Optional[str] = None
    images_urls: Optional[List[str]] = None
    is_unavailable: bool = False


class DealItemResponse(BaseModel):
    """Позиция в сделке для API."""
    id: int
    product_id: Optional[int] = None
    snapshot_id: Optional[str] = None
    seller_user_id: Optional[int] = None
    quantity: int
    price_per_unit: Optional[float] = None
    line_total: Optional[float] = None
    product: Optional[DealItemProduct] = None

    class Config:
        from_attributes = True


class DealSummary(BaseModel):
    """Краткая сводка сделки для списка."""
    id: int
    deal_number: Optional[str] = None
    buyer_user_id: int
    created_at: datetime
    status: str
    total_items_count: int
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    # Первая картинка из первого item (опционально для карточки)
    first_image_url: Optional[str] = None

    class Config:
        from_attributes = True


class DealDetailResponse(BaseModel):
    """Детали сделки с позициями для GET /api/deals/{id}."""
    id: int
    deal_number: Optional[str] = None
    buyer_user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    status: str
    total_items_count: int
    items_amount: Optional[float] = None  # Сумма по товарам без доставки
    delivery_fee: Optional[float] = None  # Стоимость доставки
    total_amount: Optional[float] = None  # items_amount + delivery_fee
    currency: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_method: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    customer_comment: Optional[str] = None
    seller_comment: Optional[str] = None
    items: List[DealItemResponse] = []

    class Config:
        from_attributes = True


class DealCheckoutStartResponse(BaseModel):
    """Ответ POST /api/deals/checkout/start: создана черновая сделка."""
    deal_id: int
    status: str = "draft"
    total_items_count: int
    total_amount: Optional[float] = None
    currency: Optional[str] = None

    class Config:
        from_attributes = True


class DealCheckoutResponse(BaseModel):
    """Ответ после успешного оформления сделки (confirm)."""
    id: int
    deal_number: Optional[str] = None
    created_at: datetime
    status: str
    total_items_count: int
    items_amount: Optional[float] = None
    delivery_fee: Optional[float] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None

    class Config:
        from_attributes = True
