"""
Утилита для определения типа действия товара (action_type) и возможности добавления в корзину.
Единый источник истины на бэкенде - используется в сериализации товаров и валидации корзины.
"""
from typing import Optional, Tuple, Dict
from sqlalchemy.orm import Session
from ..db import models


def get_shop_settings_dict(shop_owner_id: int, bot_id: Optional[int], db: Session) -> Optional[Dict]:
    """
    Получить настройки магазина из БД в виде словаря.
    
    Args:
        shop_owner_id: ID владельца магазина
        bot_id: ID бота (может быть None для основного магазина)
        db: Сессия БД
    
    Returns:
        Словарь с настройками магазина или None если не найдено
    """
    try:
        shop_settings = db.query(models.ShopSettings).filter(
            models.ShopSettings.user_id == shop_owner_id,
            models.ShopSettings.bot_id == bot_id
        ).first()
        
        if shop_settings:
            return {
                "reservations_enabled": getattr(shop_settings, 'reservations_enabled', True),
                "quantity_enabled": getattr(shop_settings, 'quantity_enabled', True),
                "shop_name": getattr(shop_settings, 'shop_name', None)
            }
    except Exception as e:
        print(f"[SHOP SETTINGS ERROR] Failed to get shop settings for user_id={shop_owner_id}, bot_id={bot_id}: {e}")
    
    # Возвращаем дефолтные значения если настройки не найдены
    return {
        "reservations_enabled": True,
        "quantity_enabled": True,
        "shop_name": None
    }


def normalize_bool(value) -> bool:
    """Нормализация boolean значения из разных форматов."""
    if value is True or value == 1 or value == '1':
        return True
    if isinstance(value, str) and value.lower() == 'true':
        return True
    return False


def get_product_action_type(
    product: models.Product,
    user_role: Optional[str] = None,
    shop_settings: Optional[dict] = None,
    db: Optional[Session] = None
) -> Tuple[str, bool, Optional[str]]:
    """
    Определяет тип действия товара и возможность добавления в корзину.
    
    Args:
        product: Объект товара из БД
        user_role: Роль пользователя ('client' или 'owner')
        shop_settings: Настройки магазина (dict с reservations_enabled и т.д.)
        db: Сессия БД (для проверки прав на резервацию, если нужно)
    
    Returns:
        Tuple[action_type, can_add_to_cart, reason_not_sale]:
        - action_type: "sale" | "reserve" | "order" | "purchase" | "none"
        - can_add_to_cart: True только если action_type == "sale"
        - reason_not_sale: Строка с причиной, если can_add_to_cart == False (для UI)
    """
    if not product:
        return "none", False, "product_not_found"
    
    # Нормализуем boolean флаги
    is_for_sale = normalize_bool(getattr(product, 'is_for_sale', False))
    is_client_sale = normalize_bool(getattr(product, 'is_client_sale', False))
    is_sale_enabled = normalize_bool(getattr(product, 'is_sale_enabled', False))
    is_made_to_order = normalize_bool(getattr(product, 'is_made_to_order', False))
    is_reservation_enabled = normalize_bool(getattr(product, 'is_reservation_enabled', False))
    
    # Для клиентов определяем тип действия по приоритету
    # ВАЖНО: Приоритет строгий и последовательный (reserve > order > sale > purchase)
    if user_role == 'client':
        # 1. is_reservation_enabled → 'reserve' (ВЫСШИЙ ПРИОРИТЕТ)
        # Резервация имеет приоритет над всеми остальными режимами
        if is_reservation_enabled:
            reservations_enabled = shop_settings.get('reservations_enabled', True) if shop_settings else True
            if reservations_enabled:
                return "reserve", False, "reservation_only"
            return "none", False, "reservations_disabled"
        
        # 2. is_made_to_order → 'order' (ВТОРОЙ ПРИОРИТЕТ)
        # Под заказ имеет приоритет над продажей
        if is_made_to_order:
            return "order", False, "order_only"
        
        # 3. is_sale_enabled → 'sale' (ТРЕТИЙ ПРИОРИТЕТ)
        # Продажа разрешена ТОЛЬКО если задана цена (price_card или price_cash)
        if is_sale_enabled:
            price_card = getattr(product, 'price_card', None)
            price_cash = getattr(product, 'price_cash', None)
            price_legacy = getattr(product, 'price', None)  # Legacy поле для обратной совместимости
            
            # Проверяем наличие хотя бы одной цены
            has_price = (
                (price_card is not None and price_card > 0) or
                (price_cash is not None and price_cash > 0) or
                (price_legacy is not None and price_legacy > 0)
            )
            
            if has_price:
                return "sale", True, None
            else:
                # Цена не задана - товар нельзя продать
                return "none", False, "price_not_set"
        
        # 4. is_client_sale → 'sale' (C2C - клиент продает клиенту)
        # Для C2C тоже нужна цена
        if is_client_sale:
            price_card = getattr(product, 'price_card', None)
            price_cash = getattr(product, 'price_cash', None)
            price_legacy = getattr(product, 'price', None)
            
            has_price = (
                (price_card is not None and price_card > 0) or
                (price_cash is not None and price_cash > 0) or
                (price_legacy is not None and price_legacy > 0)
            )
            
            if has_price:
                return "sale", True, None
            else:
                return "none", False, "price_not_set"
        
        # 5. is_for_sale → 'purchase' (клиент продает магазину)
        if is_for_sale:
            return "purchase", False, "purchase_only"
        
        # 6. Автоматическая резервация (если нет явных флагов, но подходит под резервацию)
        # ТОЛЬКО если резервации включены в магазине И нет других флагов
        reservations_enabled = shop_settings.get('reservations_enabled', True) if shop_settings else True
        if reservations_enabled and not is_made_to_order and not is_sale_enabled and not is_client_sale and not is_for_sale:
            # TODO: Проверка прав пользователя на резервацию через db если нужно
            return "reserve", False, "auto_reservation"
    
    # Для владельца или если роль не указана - возвращаем none
    return "none", False, "not_for_clients"


def get_product_action_type_dict(
    product: models.Product,
    user_role: Optional[str] = None,
    shop_settings: Optional[dict] = None,
    db: Optional[Session] = None
) -> dict:
    """
    Возвращает словарь с action_type, can_add_to_cart и reason_not_sale.
    Удобно для добавления в сериализацию товаров.
    """
    action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
        product, user_role, shop_settings, db
    )
    return {
        "action_type": action_type,
        "can_add_to_cart": can_add_to_cart,
        "reason_not_sale": reason_not_sale
    }
