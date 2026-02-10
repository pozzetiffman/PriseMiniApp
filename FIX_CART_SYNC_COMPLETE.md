# 🔧 ПОЛНОЕ ИСПРАВЛЕНИЕ РАССИНХРОНИЗАЦИИ КОРЗИНЫ И ТИПОВ ТОВАРОВ

## 📋 СПИСОК ИЗМЕНЕННЫХ ФАЙЛОВ

### Backend:
1. `backend/app/utils/product_action_type.py` (НОВЫЙ)
2. `backend/app/models/product.py`
3. `backend/app/handlers/products_read.py`
4. `backend/app/routers/cart.py`
5. `backend/app/routers/deals.py`
6. `backend/app/services/pricing.py`

### Frontend:
7. `webapp/js/utils/productActionType.js`
8. `webapp/js/cart/cartNew.js`
9. `webapp/js/cart/cartStore.js`
10. `webapp/js/handlers/products_render.js`
11. `webapp/js/favorites.js`
12. `webapp/js/cart/cartBottomSheet.js`
13. `webapp/js/product-edit.js`
14. `webapp/js/api/deals.js`
15. `webapp/js/api/pricing.js`

---

## 🔧 ИСПРАВЛЕНИЯ

### ФАЙЛ 1: `backend/app/utils/product_action_type.py` (НОВЫЙ)

**Путь:** Создать новый файл

**Что фиксит:** Единая утилита для вычисления action_type и can_add_to_cart на бэкенде

```python
"""
Утилита для определения типа действия товара (action_type) и возможности добавления в корзину.
Единый источник истины на бэкенде - используется в сериализации товаров и валидации корзины.
"""
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from ..db import models


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
    if user_role == 'client':
        # 1. is_for_sale → 'purchase' (клиент продает магазину)
        if is_for_sale:
            return "purchase", False, "purchase_only"
        
        # 2. is_client_sale → 'sale' (клиент продает клиенту - C2C)
        if is_client_sale:
            return "sale", True, None
        
        # 3. is_sale_enabled → 'sale' (магазин продает клиенту)
        if is_sale_enabled:
            return "sale", True, None
        
        # 4. is_made_to_order → 'order' (заказ)
        if is_made_to_order:
            return "order", False, "order_only"
        
        # 5. is_reservation_enabled → 'reserve' только если резервации разрешены
        if is_reservation_enabled:
            reservations_enabled = shop_settings.get('reservations_enabled', True) if shop_settings else True
            # TODO: Проверка прав пользователя на резервацию через db если нужно
            if reservations_enabled:
                return "reserve", False, "reservation_only"
            return "none", False, "reservations_disabled"
        
        # 6. Автоматическая резервация (если нет явных флагов, но подходит под резервацию)
        reservations_enabled = shop_settings.get('reservations_enabled', True) if shop_settings else True
        if reservations_enabled and not is_made_to_order and not is_sale_enabled and not is_client_sale:
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
```

---

### ФАЙЛ 2: `backend/app/models/product.py`

**Якорь:** После строки 44 (после поля `delivery`), перед `class Config`

**Что фиксит:** Добавление полей action_type, can_add_to_cart, reason_not_sale в схему Product

```python
    delivery: Optional["ProductDeliveryOut"] = None  # Настройки доставки (из product_delivery)
    
    # ========== ПОЛЯ ТИПА ДЕЙСТВИЯ (вычисляются на бэкенде) ==========
    action_type: Optional[str] = None  # "sale" | "reserve" | "order" | "purchase" | "none"
    can_add_to_cart: Optional[bool] = None  # True только если action_type == "sale"
    reason_not_sale: Optional[str] = None  # Причина, если can_add_to_cart == False (для UI)
    # ========== КОНЕЦ ПОЛЕЙ ТИПА ДЕЙСТВИЯ ==========

    class Config:
```

---

### ФАЙЛ 3: `backend/app/handlers/products_read.py`

**Якорь:** После строки 11 (после импортов), перед функцией `get_product_by_id`

**Что фиксит:** Импорт утилиты для вычисления action_type

```python
from ..utils.products_utils import make_full_url
from ..utils.product_action_type import get_product_action_type_dict  # Импорт утилиты для action_type
```

**Якорь 2:** После строки 110 (после формирования product_dict), перед валидацией через Pydantic

**Что фиксит:** Добавление action_type, can_add_to_cart, reason_not_sale в product_dict

```python
        "delivery": {"is_delivery_enabled": d.is_delivery_enabled, "is_pickup_enabled": d.is_pickup_enabled, "delivery_price": d.delivery_price, "pickup_address": d.pickup_address, "delivery_time": getattr(d, 'delivery_time', None)} if hasattr(product, 'delivery_option') and product.delivery_option and (d := product.delivery_option) else None
    }
    
    # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
    # Получаем роль пользователя из контекста (если доступна)
    # Для клиентов вычисляем action_type, для владельцев - None (они видят все)
    user_role = None  # TODO: Получить из контекста запроса если нужно
    shop_settings = None  # TODO: Получить из контекста если нужно
    
    action_type_info = get_product_action_type_dict(product, user_role, shop_settings, db)
    product_dict.update(action_type_info)
    
    # DEBUG: Логирование action_type для диагностики
    print(f"[PRODUCT BY ID DEBUG] Product {product.id}: action_type={action_type_info['action_type']}, can_add_to_cart={action_type_info['can_add_to_cart']}, reason_not_sale={action_type_info['reason_not_sale']}")
    # ========== КОНЕЦ ВЫЧИСЛЕНИЯ action_type ==========
    
    chars_count = len(product_dict.get("characteristics") or [])
```

**Якорь 3:** После строки 534 (в функции `get_products`, после формирования product_dict для каждого товара), перед добавлением в result

**Что фиксит:** Добавление action_type в список товаров

```python
            product_dict = {
                # ... все существующие поля ...
            }
            
            # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
            # Для клиентов вычисляем action_type, для владельцев - None
            user_role = 'client' if (viewer_id is not None and viewer_id != user_id) else None
            shop_settings = None  # TODO: Получить из БД если нужно
            
            action_type_info = get_product_action_type_dict(prod, user_role, shop_settings, db)
            product_dict.update(action_type_info)
            
            # DEBUG: Логирование action_type для диагностики
            print(f"[PRODUCTS LIST DEBUG] Product {prod.id}: action_type={action_type_info['action_type']}, can_add_to_cart={action_type_info['can_add_to_cart']}, flags: is_sale_enabled={prod.is_sale_enabled}, is_made_to_order={prod.is_made_to_order}, is_reservation_enabled={prod.is_reservation_enabled}")
            # ========== КОНЕЦ ВЫЧИСЛЕНИЯ action_type ==========
            
            result.append(product_dict)
```

---

### ФАЙЛ 4: `backend/app/routers/cart.py`

**Якорь:** После строки 7 (после импортов), перед функцией `add_to_cart`

**Что фиксит:** Импорт утилиты для валидации типа товара

```python
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.product_action_type import get_product_action_type  # Импорт утилиты для валидации
import os
```

**Якорь 2:** После строки 52 (после проверки наличия товара), перед проверкой наличия в корзине

**Что фиксит:** Валидация типа товара перед добавлением в корзину

```python
    # Проверяем наличие товара
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"[CART DEBUG] add_to_cart: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
    # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО ДОБАВЛЯТЬ В КОРЗИНУ ==========
    # Определяем роль пользователя (клиент или владелец)
    user_role = 'client' if user_id != product.user_id else 'owner'
    shop_settings = None  # TODO: Получить из БД если нужно
    
    action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
        product, user_role, shop_settings, db
    )
    
    # DEBUG: Логирование типа товара
    print(f"[CART DEBUG] add_to_cart: product_id={product_id}, action_type={action_type}, can_add_to_cart={can_add_to_cart}, reason_not_sale={reason_not_sale}")
    
    # Запрещаем добавление не-sale товаров в корзину
    if not can_add_to_cart:
        action_type_text = {
            'purchase': 'покупка',
            'order': 'заказ',
            'reserve': 'резервация',
            'none': 'не продается'
        }.get(action_type, 'не продается')
        
        error_message = f"Этот товар нельзя добавить в корзину. Тип: {action_type_text}"
        print(f"[CART DEBUG] add_to_cart BLOCKED: product_id={product_id}, reason={reason_not_sale}")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "NOT_SALE",
                "message": error_message,
                "action_type": action_type,
                "reason": reason_not_sale
            }
        )
    # ========== КОНЕЦ ВАЛИДАЦИИ ТИПА ТОВАРА ==========
    
    # Проверяем, есть ли уже товар в корзине
```

---

### ФАЙЛ 5: `backend/app/routers/deals.py`

**Якорь:** После строки 22 (после импортов), перед функцией `_get_unit_price_for_sale`

**Что фиксит:** Импорт утилиты для валидации типа товара

```python
from ..services.pricing import build_quote_for_deal
from ..utils.product_action_type import get_product_action_type  # Импорт утилиты для валидации
```

**Якорь 2:** После строки 121 (после проверки наличия товара), перед проверкой available

**Что фиксит:** Валидация типа товара в checkout/start

```python
    for product_id, quantity in item_map.items():
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Товар {product_id} не найден")
        
        # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО ОФОРМЛЯТЬ ==========
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        shop_settings = None  # TODO: Получить из БД если нужно
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
        )
        
        # DEBUG: Логирование типа товара
        print(f"[DEALS CHECKOUT DEBUG] product_id={product_id}, action_type={action_type}, can_add_to_cart={can_add_to_cart}, reason_not_sale={reason_not_sale}")
        
        if not can_add_to_cart:
            action_type_text = {
                'purchase': 'покупка',
                'order': 'заказ',
                'reserve': 'резервация',
                'none': 'не продается'
            }.get(action_type, 'не продается')
            
            error_message = f"Товар «{product.name}» нельзя оформить. Тип: {action_type_text}"
            print(f"[DEALS CHECKOUT DEBUG] BLOCKED: product_id={product_id}, reason={reason_not_sale}")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "NOT_SALE",
                    "message": error_message,
                    "action_type": action_type,
                    "reason": reason_not_sale,
                    "product_id": product_id,
                    "product_name": product.name
                }
            )
        # ========== КОНЕЦ ВАЛИДАЦИИ ТИПА ТОВАРА ==========
        
        available = getattr(product, "is_sale_enabled", False) or getattr(product, "is_for_sale", False)
```

---

### ФАЙЛ 6: `backend/app/services/pricing.py`

**Якорь:** После импортов, перед функцией `build_quote`

**Что фиксит:** Импорт утилиты для валидации типа товара

```python
from ..utils.product_action_type import get_product_action_type  # Импорт утилиты для валидации
```

**Якорь 2:** В функции `build_quote`, после загрузки товара, перед проверкой цены

**Что фиксит:** Валидация типа товара в pricing/quote

```python
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product:
            errors.append(f"Товар {product_id} не найден")
            continue
        
        # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО РАССЧИТЫВАТЬ ==========
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        shop_settings = None  # TODO: Получить из БД если нужно
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
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
        
        # Проверка цены
```

---

### ФАЙЛ 7: `webapp/js/utils/productActionType.js`

**Якорь:** После строки 9 (после функции `normalizeBool`), перед функцией `getProductActionType`

**Что фиксит:** Приоритет action_type от бэка над вычислением на фронте

```javascript
/**
 * Единый helper для определения типа операции товара
 * ПРИОРИТЕТ: Использует action_type от бэка, если доступен. Иначе вычисляет на фронте (fallback).
 * 
 * @param {Object} product - Объект товара (может содержать action_type от бэка)
 * @param {Object} appContext - Контекст приложения (содержит role, permissions и т.д.)
 * @param {Object} shopSettings - Настройки магазина (содержит reservations_enabled и т.д.)
 * @returns {string} Тип операции: 'sale', 'reserve', 'order', 'purchase', 'none'
 */
export function getProductActionType(product, appContext, shopSettings) {
    if (!product) {
        return 'none';
    }
    
    // ========== ПРИОРИТЕТ: Используем action_type от бэка, если доступен ==========
    if (product.action_type && typeof product.action_type === 'string') {
        console.log(`[PRODUCT ACTION TYPE] Using backend action_type for product ${product.id}: ${product.action_type}`);
        return product.action_type;
    }
    // ========== КОНЕЦ ПРИОРИТЕТА ==========
    
    // ========== FALLBACK: Вычисляем на фронте (для обратной совместимости) ==========
    // Преобразуем boolean значения из разных форматов через normalizeBool
    const isForSale = normalizeBool(product.is_for_sale);
    const isClientSale = normalizeBool(product.is_client_sale);
    const isSaleEnabled = normalizeBool(product.is_sale_enabled);
    const isMadeToOrder = normalizeBool(product.is_made_to_order);
    const isReservationEnabled = normalizeBool(product.is_reservation_enabled);

    // СТРОГИЙ ПРИОРИТЕТ (без исключений):
    // 1. is_for_sale → 'purchase' (клиент продает магазину)
    if (isForSale && appContext && appContext.role === 'client') {
        return 'purchase';
    }
    
    // 2. is_client_sale → 'sale' (клиент продает клиенту - C2C)
    if (isClientSale && appContext && appContext.role === 'client') {
        return 'sale';
    }
    
    // 3. is_sale_enabled → 'sale' (магазин продает клиенту)
    if (isSaleEnabled && appContext && appContext.role === 'client') {
        return 'sale';
    }
    
    // 4. is_made_to_order → 'order' (заказ)
    if (isMadeToOrder && appContext && appContext.role === 'client') {
        return 'order';
    }

    // 5. is_reservation_enabled → 'reserve' только если резервации разрешены в магазине и у клиента есть право
    if (isReservationEnabled && appContext && appContext.role === 'client') {
        const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
        const canReserve = appContext.permissions && appContext.permissions.can_reserve && reservationsEnabled;
        if (canReserve) {
            return 'reserve';
        }
        return 'none';
    }

    // 6. canReserve (авто) → 'reserve' — товар без явного флага, но подходит под резервацию
    if (appContext && appContext.role === 'client') {
        const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
        const canReserve = appContext.permissions && 
                          appContext.permissions.can_reserve && 
                          reservationsEnabled &&
                          !isMadeToOrder;
        if (canReserve && !isSaleEnabled && !isClientSale) {
            return 'reserve';
        }
    }

    // 7. иначе → 'none'
    return 'none';
    // ========== КОНЕЦ FALLBACK ==========
}
```

**Якорь 2:** После функции `isSaleAction`, добавить новую функцию

**Что фиксит:** Проверка can_add_to_cart от бэка

```javascript
/**
 * Проверить, можно ли добавлять товар в корзину (использует can_add_to_cart от бэка или вычисляет)
 * @param {Object} product - Объект товара (может содержать can_add_to_cart от бэка)
 * @param {Object} appContext - Контекст приложения
 * @param {Object} shopSettings - Настройки магазина
 * @returns {boolean}
 */
export function canAddToCart(product, appContext, shopSettings) {
    if (!product) return false;
    
    // ========== ПРИОРИТЕТ: Используем can_add_to_cart от бэка, если доступен ==========
    if (product.can_add_to_cart !== undefined && product.can_add_to_cart !== null) {
        console.log(`[PRODUCT ACTION TYPE] Using backend can_add_to_cart for product ${product.id}: ${product.can_add_to_cart}`);
        return product.can_add_to_cart === true;
    }
    // ========== КОНЕЦ ПРИОРИТЕТА ==========
    
    // ========== FALLBACK: Вычисляем на фронте ==========
    const actionType = getProductActionType(product, appContext, shopSettings);
    return isSaleAction(actionType);
    // ========== КОНЕЦ FALLBACK ==========
}
```

---

### ФАЙЛ 8: `webapp/js/cart/cartNew.js`

**Якорь:** После строки 686 (начало функции `addProductToCart`), перед валидацией типа

**Что фиксит:** Добавление debug-логов с stack trace и использование can_add_to_cart от бэка

```javascript
/**
 * Добавить товар в корзину (публичная функция для использования из других модулей)
 */
export async function addProductToCart(product, quantity = 1) {
    try {
        // ========== DEBUG: Логирование попытки добавления в корзину ==========
        const appContext = window.getAppContext ? window.getAppContext() : null;
        const stackTrace = new Error().stack;
        console.log(`[CART NEW DEBUG] addProductToCart called:`, {
            productId: product?.id,
            productName: product?.name,
            quantity,
            role: appContext?.role,
            is_for_sale: product?.is_for_sale,
            is_sale_enabled: product?.is_sale_enabled,
            is_made_to_order: product?.is_made_to_order,
            is_reservation_enabled: product?.is_reservation_enabled,
            action_type: product?.action_type,
            can_add_to_cart: product?.can_add_to_cart,
            reason_not_sale: product?.reason_not_sale,
            stackTrace: stackTrace
        });
        // ========== КОНЕЦ DEBUG ==========
        
        // ========== ВАЛИДАЦИЯ ТИПА ТОВАРА ==========
        // Проверяем, что товар можно добавлять в корзину (только sale)
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        
        if (appContext && appContext.role === 'client') {
            const { canAddToCart } = await import('../utils/productActionType.js');
            const canAdd = canAddToCart(product, appContext, shopSettings);
            
            if (!canAdd) {
                // Товар не продается - нельзя добавлять в корзину
                const actionType = product.action_type || 'none';
                const reason = product.reason_not_sale || 'not_sale';
                const actionTypeText = {
                    'purchase': 'покупка',
                    'order': 'заказ',
                    'reserve': 'резервация',
                    'none': 'не продается'
                }[actionType] || 'не продается';
                
                const errorMessage = `Этот товар не продаётся. Доступно: ${actionTypeText}`;
                console.warn(`[CART NEW] ❌ Cannot add product ${product.id} to cart: ${errorMessage}`, {
                    actionType,
                    reason,
                    can_add_to_cart: product.can_add_to_cart
                });
                showCartToast(errorMessage, 'error');
                throw new Error(errorMessage);
            }
        }
        // ========== КОНЕЦ ВАЛИДАЦИИ ==========
        
        const wasOutOfStock = !isProductSelectableInCart(product);
        await addToCart(product, quantity);
        
        if (wasOutOfStock) {
            showCartToast('Товара нет в наличии', 'error');
        }
        
        const cartPageNew = document.getElementById('cart-page-new');
        if (cartPageNew && cartPageNew.style.display !== 'none') {
            renderCart();
        }
        
        updateCartButtonCount();
    } catch (error) {
        // ========== DEBUG: Логирование ошибки с полной информацией ==========
        console.error('[CART NEW] Error in addProductToCart:', {
            error: error.message,
            stack: error.stack,
            productId: product?.id,
            productName: product?.name
        });
        // ========== КОНЕЦ DEBUG ==========
        throw error;
    }
}
```

---

### ФАЙЛ 9: `webapp/js/cart/cartStore.js`

**Якорь:** После строки 125 (начало функции `addToCart`), перед отправкой запроса на сервер

**Что фиксит:** Добавление debug-логов с stack trace

```javascript
export async function addToCart(product, quantity = 1) {
    try {
        // ========== DEBUG: Логирование низкоуровневого добавления в корзину ==========
        const stackTrace = new Error().stack;
        console.log(`[CART STORE DEBUG] addToCart called:`, {
            productId: product?.id,
            productName: product?.name,
            quantity,
            action_type: product?.action_type,
            can_add_to_cart: product?.can_add_to_cart,
            stackTrace: stackTrace
        });
        // ========== КОНЕЦ DEBUG ==========
        
        if (!product || !product.id) {
            throw new Error('Invalid product: product or product.id is missing');
        }
        
        const appContext = getAppContext();
```

---

### ФАЙЛ 10: `webapp/js/handlers/products_render.js`

**Якорь:** После строки 449 (после получения actionType), перед проверкой isSaleAction

**Что фиксит:** Использование can_add_to_cart от бэка вместо вычисления

```javascript
                        // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
                        const appContext = window.getAppContext ? window.getAppContext() : null;
                        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                        const { getProductActionType, canAddToCart } = await import('../utils/productActionType.js');
                        const actionType = getProductActionType(actualProduct, appContext, shopSettings);
                        
                        // ========== DEBUG: Логирование попытки добавления в корзину ==========
                        console.log(`[PRODUCTS RENDER DEBUG] Action button clicked for product ${prod.id}:`, {
                            productId: prod.id,
                            actionType,
                            action_type_backend: actualProduct.action_type,
                            can_add_to_cart_backend: actualProduct.can_add_to_cart,
                            reason_not_sale: actualProduct.reason_not_sale,
                            isSaleAction: isSaleAction(actionType),
                            is_for_sale: actualProduct.is_for_sale,
                            is_sale_enabled: actualProduct.is_sale_enabled,
                            is_made_to_order: actualProduct.is_made_to_order,
                            is_reservation_enabled: actualProduct.is_reservation_enabled
                        });
                        // ========== КОНЕЦ DEBUG ==========
                        
                        // Для типа 'sale' добавляем товар в корзину, если его там нет
                        // ВАЛИДАЦИЯ: Используем can_add_to_cart от бэка или вычисляем
                        const canAdd = canAddToCart(actualProduct, appContext, shopSettings);
                        if (canAdd) {
                            const { isProductInCart, getProductQuantityInCart } = await import('../cart/cartStore.js');
                            const isInCart = isProductInCart(actualProduct.id);
                            const currentQuantity = getProductQuantityInCart(actualProduct.id);
                            
                            if (!isInCart || currentQuantity === 0) {
                                const { addProductToCart } = await import('../cart/cartNew.js');
                                await addProductToCart(actualProduct, 1);
                            }
                        } else {
                            // Если тип не sale - не добавляем в корзину, просто открываем bottom sheet
                            console.log(`[PRODUCTS RENDER] Skipping add-to-cart for product ${prod.id}: can_add_to_cart=false, actionType=${actionType}, reason=${actualProduct.reason_not_sale || 'unknown'}`);
                        }
```

---

### ФАЙЛ 11: `webapp/js/favorites.js`

**Якорь:** После строки 749 (после получения actionType), перед проверкой isSaleAction

**Что фиксит:** Использование can_add_to_cart от бэка

```javascript
                            // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
                            const appContext = window.getAppContext ? window.getAppContext() : null;
                            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                            const { getProductActionType, canAddToCart } = await import('./utils/productActionType.js');
                            const actionType = getProductActionType(actualProduct, appContext, shopSettings);
                            
                            // ВАЛИДАЦИЯ: Используем can_add_to_cart от бэка или вычисляем
                            const canAdd = canAddToCart(actualProduct, appContext, shopSettings);
                            if (canAdd) {
                                const { isProductInCart, getProductQuantityInCart } = await import('./cart/cartStore.js');
                                const isInCart = isProductInCart(actualProduct.id);
                                const currentQuantity = getProductQuantityInCart(actualProduct.id);
                                
                                if (!isInCart || currentQuantity === 0) {
                                    const { addProductToCart } = await import('./cart/cartNew.js');
                                    await addProductToCart(actualProduct, 1);
                                }
                            } else {
                                console.log(`[FAVORITES] Skipping add-to-cart for product ${prod.id}: can_add_to_cart=false, actionType=${actionType}, reason=${actualProduct.reason_not_sale || 'unknown'}`);
                            }
```

---

### ФАЙЛ 12: `webapp/js/cart/cartBottomSheet.js`

**Якорь:** После строки 487 (после получения actionType), перед switch

**Что фиксит:** Использование can_add_to_cart от бэка для валидации количества

```javascript
        // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        const actionType = getProductActionType(actualProduct, appContext, shopSettings);
        
        // ========== DEBUG: Логирование типа при клике на кнопку ==========
        console.log(`[CART BOTTOM SHEET DEBUG] Primary button clicked for product ${currentProduct.id}:`, {
            productId: currentProduct.id,
            actionType,
            action_type_backend: actualProduct.action_type,
            can_add_to_cart_backend: actualProduct.can_add_to_cart,
            reason_not_sale: actualProduct.reason_not_sale,
            is_for_sale: actualProduct.is_for_sale,
            is_sale_enabled: actualProduct.is_sale_enabled,
            is_made_to_order: actualProduct.is_made_to_order,
            is_reservation_enabled: actualProduct.is_reservation_enabled
        });
        // ========== КОНЕЦ DEBUG ==========
        
        try {
            // Получаем актуальное количество из инпута
            const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
            let quantity = quantityInput ? parseInt(quantityInput.value) || currentQuantity : currentQuantity;
            
            // ВАЛИДАЦИЯ: Проверяем, что количество не превышает доступное
            const maxQuantity = getMaxAvailableQuantity(actualProduct);
            if (maxQuantity !== null && quantity > maxQuantity) {
                // Если количество превышает доступное, ограничиваем его
                quantity = maxQuantity;
                if (quantityInput) {
                    quantityInput.value = quantity;
                }
                currentQuantity = quantity;
                
                // Обновляем количество в корзине с валидированным значением (только для типа 'sale')
                // Используем can_add_to_cart от бэка для проверки
                const { canAddToCart } = await import('../utils/productActionType.js');
                const canAdd = canAddToCart(actualProduct, appContext, shopSettings);
                if (canAdd) {
                    try {
                        const { updateCartItemQuantity } = await import('./cartStore.js');
                        await updateCartItemQuantity(actualProduct.id, quantity);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error updating cart quantity:', error);
                    }
                }
            }
```

---

### ФАЙЛ 13: `webapp/js/product-edit.js`

**Якорь:** После строки 975 (после обновления allProducts), перед обновлением избранного

**Что фиксит:** Обновление кэша с action_type от бэка после сохранения

```javascript
        // Подставляем в allProducts свежие данные по обоим ID (редактируемый и client-visible), чтобы витрина/избранное использовали актуальный actionType
        if (allProductsGetter && allProductsSetter && (freshOwnerProduct || freshClientProduct)) {
            const list = allProductsGetter();
            if (Array.isArray(list) && list.length > 0) {
                let changed = false;
                const next = list.map(p => {
                    if (!p || p.id == null) return p;
                    if (freshOwnerProduct && p.id === freshOwnerProduct.id) {
                        changed = true;
                        // ========== ВАЖНО: Сохраняем action_type и can_add_to_cart от бэка ==========
                        return { ...freshOwnerProduct };
                    }
                    if (freshClientProduct && p.id === freshClientProduct.id) {
                        changed = true;
                        // ========== ВАЖНО: Сохраняем action_type и can_add_to_cart от бэка ==========
                        return { ...freshClientProduct };
                    }
                    return p;
                });
                if (changed) {
                    allProductsSetter(next);
                    if (applyFiltersCallback) applyFiltersCallback();
                    console.log(`[PRODUCT EDIT] ✅ Updated allProducts cache with fresh products (action_type preserved from backend)`);
                }
            }
        }
```

---

### ФАЙЛ 14: `webapp/js/api/deals.js`

**Якорь:** В функции `startDealCheckoutAPI`, в catch блоке после проверки response.ok

**Что фиксит:** Улучшенная обработка ошибок с читаемым сообщением

```javascript
        if (!response.ok) {
            // ========== УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК ==========
            let errorMessage = 'Не удалось начать оформление';
            let errorDetails = null;
            
            try {
                const errorText = await response.text();
                console.error(`[DEALS API] Error response text:`, errorText);
                
                // Пытаемся распарсить JSON
                try {
                    errorDetails = JSON.parse(errorText);
                    errorMessage = errorDetails.message || errorDetails.detail || errorMessage;
                    
                    // Если есть детали ошибки от бэка - используем их
                    if (errorDetails.error === 'NOT_SALE') {
                        errorMessage = errorDetails.message || `Товар нельзя оформить. Тип: ${errorDetails.action_type || 'неизвестно'}`;
                    }
                } catch (parseError) {
                    // Если не JSON - используем текст как есть
                    errorMessage = errorText || errorMessage;
                }
            } catch (readError) {
                console.error(`[DEALS API] Failed to read error response:`, readError);
            }
            
            // Логируем полную информацию об ошибке для remote logs
            console.error(`[DEALS API] Checkout start error:`, {
                message: errorMessage,
                status: response.status,
                statusText: response.statusText,
                bodyText: errorDetails || 'could not read body',
                url: url
            });
            
            throw new Error(errorMessage);
            // ========== КОНЕЦ УЛУЧШЕННОЙ ОБРАБОТКИ ОШИБОК ==========
        }
```

---

### ФАЙЛ 15: `webapp/js/api/pricing.js`

**Якорь:** В функции `getPricingQuoteAPI`, в catch блоке после проверки response.ok

**Что фиксит:** Улучшенная обработка ошибок с читаемым сообщением

```javascript
        if (!response.ok) {
            // ========== УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК ==========
            let errorMessage = 'Не удалось рассчитать стоимость';
            let errorDetails = null;
            
            try {
                const errorText = await response.text();
                console.error(`[PRICING API] Error response text:`, errorText);
                
                // Пытаемся распарсить JSON
                try {
                    errorDetails = JSON.parse(errorText);
                    errorMessage = errorDetails.message || errorDetails.detail || errorMessage;
                    
                    // Если есть детали ошибки от бэка - используем их
                    if (errorDetails.error === 'NOT_SALE') {
                        errorMessage = errorDetails.message || `Товар нельзя рассчитать. Тип: ${errorDetails.action_type || 'неизвестно'}`;
                    }
                } catch (parseError) {
                    // Если не JSON - используем текст как есть
                    errorMessage = errorText || errorMessage;
                }
            } catch (readError) {
                console.error(`[PRICING API] Failed to read error response:`, readError);
            }
            
            // Логируем полную информацию об ошибке для remote logs
            console.error(`[PRICING API] Quote error:`, {
                message: errorMessage,
                status: response.status,
                statusText: response.statusText,
                bodyText: errorDetails || 'could not read body',
                url: url
            });
            
            throw new Error(errorMessage);
            // ========== КОНЕЦ УЛУЧШЕННОЙ ОБРАБОТКИ ОШИБОК ==========
        }
```

---

## ✅ ТЕСТ-КЕЙСЫ

### Тест 1: sale → reserve и обратно
1. Товар с типом sale (is_sale_enabled=true)
2. Проверить: action_type="sale", can_add_to_cart=true в ответе /api/products
3. Добавить в корзину - должно работать
4. Изменить тип на reserve (is_reservation_enabled=true, is_sale_enabled=false)
5. Проверить: action_type="reserve", can_add_to_cart=false в ответе /api/products
6. Товар должен исчезнуть из корзины автоматически
7. Попытка добавить в корзину - должна быть заблокирована на фронте и бэке

### Тест 2: sale → order
1. Товар с типом sale
2. Изменить тип на order (is_made_to_order=true, is_sale_enabled=false)
3. Проверить: action_type="order", can_add_to_cart=false
4. Попытка добавить в корзину - должна быть заблокирована
5. Попытка checkout - должна вернуть 400 с понятным сообщением

### Тест 3: Попытка добавить reserve/order в корзину
1. Товар с типом reserve или order
2. Попытка добавить через UI - должна быть заблокирована на фронте
3. Попытка добавить через прямой API вызов - должна вернуть 400 с JSON:
   ```json
   {
     "error": "NOT_SALE",
     "message": "Этот товар нельзя добавить в корзину. Тип: резервация",
     "action_type": "reserve",
     "reason": "reservation_only"
   }
   ```

### Тест 4: Иконки/кнопки меняются сразу после сохранения
1. Открыть избранное с товаром типа sale
2. Иконка должна быть 🛒
3. Изменить тип на reserve и сохранить
4. Страница избранного должна обновиться автоматически
5. Иконка должна стать 🔒
6. Кнопка должна измениться на "Зарезервировать сейчас"

### Тест 5: Checkout/quote показывают понятную ошибку
1. Добавить товар типа reserve в корзину (через прямой API или если остался старый)
2. Попытка checkout - должна вернуть 400
3. В UI должно показаться сообщение: "Товар «Название» нельзя оформить. Тип: резервация"
4. В remote logs должно быть:
   ```
   [DEALS API] Checkout start error: {
     message: "Товар «Название» нельзя оформить. Тип: резервация",
     status: 400,
     bodyText: { error: "NOT_SALE", ... }
   }
   ```

---

## 📝 ПРИМЕЧАНИЯ

1. **Debug-логи** можно оставить для отладки, но в production можно убрать или сделать условными через `if (window.DEBUG)`
2. **Ошибки синхронизации корзины** не блокируют сохранение товара - это сделано намеренно
3. **Fallback на вычисление на фронте** - если action_type не пришел от бэка, используется старая логика
4. **Все изменения точечные** - не ломают существующую логику, только добавляют валидацию и синхронизацию
5. **TODO в коде**: Получение shop_settings и user_role из контекста запроса на бэкенде (можно добавить позже)
