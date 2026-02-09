"""
Единый модуль расчёта цен и итогов для сделок и заказов на покупку.
Источник истины на бэкенде: unit_price с учётом payment_method, delivery_fee, items_amount, total_amount.
"""
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from ..db import models
from ..utils.product_action_type import get_product_action_type  # Импорт утилиты для валидации


def _to_float(v) -> Optional[float]:
    """Безопасное приведение к float; 0 и положительные числа допускаются."""
    if v is None or v == "":
        return None
    try:
        n = float(v)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def normalize_payment_method(payment_method: Optional[str]) -> Optional[str]:
    """
    Нормализация способа оплаты для расчёта цены.
    cash => 'cash' (цена наличными), иначе None (цена по карте / перевод / другое).
    """
    if not payment_method or not str(payment_method).strip():
        return None
    s = str(payment_method).lower().strip()
    if s in ("cash", "nal", "наличные", "c"):
        return "cash"
    return None


def get_unit_price(product: "models.Product", payment_method: Optional[str]) -> Optional[float]:
    """
    Цена за единицу с учётом способа оплаты и скидки.
    - card / transfer / other => price_card (или price) со скидкой.
    - cash => price_cash если есть (со скидкой по той же логике), иначе fallback на price_card/price.
    Возвращает None если цена не определена (цена по запросу).
    """
    if not product:
        return None

    is_cash = normalize_payment_method(payment_method) == "cash"

    # Базовая цена по карте: price_card или price
    base_card = _to_float(getattr(product, "price_card", None)) or _to_float(product.price)
    discount = _to_float(getattr(product, "discount", None)) or 0

    def apply_discount(price: Optional[float]) -> Optional[float]:
        if price is None:
            return None
        if discount and discount > 0:
            return round(price * (1 - discount / 100), 2)
        return round(price, 2)

    # Цена по карте (финальная)
    card_price = apply_discount(base_card) if base_card is not None else None

    if is_cash:
        price_cash_raw = _to_float(getattr(product, "price_cash", None))
        if price_cash_raw is not None and price_cash_raw > 0:
            # Есть отдельная цена наличными — применяем скидку согласованно с картой
            if discount and discount > 0 and base_card is not None:
                delta = base_card - price_cash_raw
                card_final = apply_discount(base_card)
                if card_final is not None:
                    return round(card_final - delta, 2)
            return apply_discount(price_cash_raw)
        # cash без price_cash -> fallback на карту
        return card_price

    # is_for_sale / is_sale_enabled: те же поля, но приоритет price_card/price уже учтён в base_card
    if getattr(product, "is_sale_enabled", False) or getattr(product, "is_for_sale", False):
        price_type = getattr(product, "price_type", None) or "range"
        if price_type == "fixed":
            fixed = _to_float(getattr(product, "price_fixed", None))
            if fixed is not None:
                return round(fixed, 2)
        if price_type == "range":
            from_val = _to_float(getattr(product, "price_from", None))
            to_val = _to_float(getattr(product, "price_to", None))
            if from_val is not None:
                return round(from_val, 2)
            if to_val is not None:
                return round(to_val, 2)

    return card_price


def _get_product_delivery_price(db: Session, product_id: int) -> float:
    """
    Стоимость доставки для одного товара: из ProductDelivery.delivery_price или Product.delivery_price.
    Возвращает 0 если не задано.
    """
    delivery = db.query(models.ProductDelivery).filter(
        models.ProductDelivery.product_id == product_id,
    ).first()
    if delivery and getattr(delivery, "delivery_price", None) is not None:
        v = _to_float(delivery.delivery_price)
        return v if v is not None else 0.0
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        return 0.0
    v = _to_float(getattr(product, "delivery_price", None))
    return v if v is not None else 0.0


def calc_delivery_fee(
    db: Session,
    product_ids: List[int],
    delivery_method: Optional[str],
) -> float:
    """
    Стоимость доставки для набора товаров.
    - pickup / none / пусто => 0.
    - courier => максимум из delivery_price по всем товарам (одна доставка на заказ).
    В будущем можно заменить на настройки магазина (ShopSettings.delivery_fee).
    """
    if not delivery_method or str(delivery_method).strip().lower() in ("pickup", "none", ""):
        return 0.0
    if str(delivery_method).strip().lower() != "courier":
        return 0.0
    if not product_ids:
        return 0.0
    fees = [_get_product_delivery_price(db, pid) for pid in product_ids]
    return round(max(fees or [0]), 2)


def build_quote(
    db: Session,
    items: List[Dict[str, Any]],
    payment_method: str,
    delivery_method: str,
    buyer_user_id: int,
) -> Dict[str, Any]:
    """
    Строит предварительный или финальный расчёт (quote) по списку позиций.
    items: [ {"product_id": int, "quantity": int}, ... ]
    Возвращает:
      items: [ {"product_id", "quantity", "unit_price", "line_total"}, ... ]
      items_amount: сумма по позициям
      delivery_fee: стоимость доставки
      total_amount: items_amount + delivery_fee
      currency: "RUB"
      errors: список строк с ошибками (если есть)
    При ошибках (нет товара, нет цены, нельзя купить) в items будут только валидные позиции,
    а в errors — описание проблем; total_amount считается по валидным.
    """
    result_items: List[Dict[str, Any]] = []
    errors: List[str] = []
    product_ids_for_delivery: List[int] = []

    for it in items:
        product_id = it.get("product_id")
        quantity = it.get("quantity", 1)
        if not product_id or quantity < 1:
            continue
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product:
            errors.append(f"Товар {product_id} не найден")
            continue
        
        # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО РАССЧИТЫВАТЬ ==========
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        
        # Получаем настройки магазина из БД
        from ..utils.product_action_type import get_shop_settings_dict
        shop_settings = get_shop_settings_dict(product.user_id, getattr(product, 'bot_id', None), db)
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
        )
        
        # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат как в products list для сравнения
        print(
            f"[PRICING DEBUG] Product {product.id}: "
            f"action_type={action_type}, "
            f"can_add_to_cart={can_add_to_cart}, "
            f"reason_not_sale={reason_not_sale}, "
            f"flags: is_sale_enabled={getattr(product, 'is_sale_enabled', False)}, "
            f"is_made_to_order={getattr(product, 'is_made_to_order', False)}, "
            f"is_reservation_enabled={getattr(product, 'is_reservation_enabled', False)}, "
            f"price_card={getattr(product, 'price_card', None)}, "
            f"price_cash={getattr(product, 'price_cash', None)}"
        )
        
        if not can_add_to_cart:
            action_type_text = {
                'purchase': 'покупка',
                'order': 'заказ',
                'reserve': 'резервация',
                'none': 'не продается'
            }.get(action_type, 'не продается')
            
            errors.append(f"Товар «{product.name}» нельзя оформить. Тип: {action_type_text}")
            continue
        # ========== КОНЕЦ ВАЛИДАЦИИ ТИПА ТОВАРА ==========
        
        # Нельзя купить свой товар
        if buyer_user_id == product.user_id:
            errors.append(f"Нельзя купить свой товар «{product.name}»")
            continue

        unit_price = get_unit_price(product, payment_method)
        if unit_price is None:
            errors.append(f"У товара «{product.name}» не указана цена для выбранного способа оплаты")
            continue

        line_total = round(unit_price * quantity, 2)
        result_items.append({
            "product_id": product_id,
            "quantity": quantity,
            "unit_price": unit_price,
            "line_total": line_total,
        })
        product_ids_for_delivery.append(product_id)

    items_amount = round(sum(row["line_total"] for row in result_items), 2)
    delivery_fee = calc_delivery_fee(db, product_ids_for_delivery, delivery_method)
    total_amount = round(items_amount + delivery_fee, 2)

    return {
        "items": result_items,
        "items_amount": items_amount,
        "delivery_fee": delivery_fee,
        "total_amount": total_amount,
        "currency": "RUB",
        "errors": errors,
    }


def build_quote_for_deal(
    db: Session,
    deal_id: int,
    payment_method: str,
    delivery_method: str,
    buyer_user_id: int,
) -> Optional[Dict[str, Any]]:
    """
    Строит quote по уже созданной черновой сделке (draft).
    Берёт позиции из DealItem, пересчитывает unit_price и line_total по payment_method,
    добавляет delivery_fee. Если сделка не найдена или не draft — возвращает None.
    """
    deal = db.query(models.Deal).filter(
        models.Deal.id == deal_id,
        models.Deal.buyer_user_id == buyer_user_id,
        models.Deal.status == "draft",
    ).first()
    if not deal:
        return None
    deal_items = db.query(models.DealItem).filter(models.DealItem.deal_id == deal_id).all()
    items = [{"product_id": di.product_id, "quantity": di.quantity} for di in deal_items if di.product_id]
    return build_quote(db, items, payment_method, delivery_method, buyer_user_id)
