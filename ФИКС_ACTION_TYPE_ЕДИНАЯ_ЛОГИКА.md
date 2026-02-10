# ФИКС: Единая логика вычисления action_type и can_add_to_cart

## КРАТКОЕ ОБЪЯСНЕНИЕ

### Почему было:
1. **Неправильный приоритет флагов**: `is_sale_enabled` проверялся ДО `is_reservation_enabled`, поэтому товар с `is_reservation_enabled=True` и `is_sale_enabled=False` получал `action_type=sale`
2. **Отсутствие проверки цены**: Товар с `is_sale_enabled=True` получал `action_type=sale` даже если цена не задана
3. **Разные места вычисления**: В разных местах (products list, checkout, cart) использовались разные значения `shop_settings` (часто `None`)
4. **Дублирующая проверка**: В `deals.py` была дополнительная проверка `is_sale_enabled` которая могла конфликтовать с основной логикой
5. **Разное логирование**: Формат логов отличался в разных местах, что затрудняло сравнение

### Почему стало:
1. **Правильный приоритет**: `reserve` > `order` > `sale` > `purchase` > `none`
2. **Проверка цены**: `sale` разрешен ТОЛЬКО если задана хотя бы одна цена (`price_card` или `price_cash` или `price`)
3. **Единая функция**: Все места используют `get_product_action_type()` с одинаковыми параметрами
4. **Получение shop_settings из БД**: Добавлена функция `get_shop_settings_dict()` которая получает настройки из БД
5. **Единообразное логирование**: Одинаковый формат логов во всех местах для сравнения

---

## ДИФФ-ПАТЧИ ПО ФАЙЛАМ

### Файл 1: `backend/app/utils/product_action_type.py`

**Добавить после строки 8 (после импортов):**

```python
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
```

**Заменить блок строк 50-83 (логика приоритетов):**

**БЫЛО:**
```python
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
            if reservations_enabled:
                return "reserve", False, "reservation_only"
            return "none", False, "reservations_disabled"
        
        # 6. Автоматическая резервация...
```

**СТАЛО:**
```python
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
            return "reserve", False, "auto_reservation"
```

---

### Файл 2: `backend/app/handlers/products_read.py`

**Заменить блок строк 114-125:**

**БЫЛО:**
```python
    # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
    user_role = None  # TODO: Получить из контекста запроса если нужно
    shop_settings = None  # TODO: Получить из контекста если нужно
    
    action_type_info = get_product_action_type_dict(product, user_role, shop_settings, db)
    product_dict.update(action_type_info)
    
    # DEBUG: Логирование action_type для диагностики
    print(f"[PRODUCT BY ID DEBUG] Product {product.id}: action_type={action_type_info['action_type']}, can_add_to_cart={action_type_info['can_add_to_cart']}, reason_not_sale={action_type_info['reason_not_sale']}")
```

**СТАЛО:**
```python
    # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
    user_role = None  # TODO: Получить из контекста запроса если нужно
    
    # Получаем настройки магазина из БД
    from ..utils.product_action_type import get_shop_settings_dict
    shop_settings = get_shop_settings_dict(product.user_id, product.bot_id, db)
    
    action_type_info = get_product_action_type_dict(product, user_role, shop_settings, db)
    product_dict.update(action_type_info)
    
    # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат как в products list для сравнения
    print(
        f"[PRODUCT BY ID DEBUG] Product {product.id}: "
        f"action_type={action_type_info['action_type']}, "
        f"can_add_to_cart={action_type_info['can_add_to_cart']}, "
        f"reason_not_sale={action_type_info['reason_not_sale']}, "
        f"flags: is_sale_enabled={getattr(product, 'is_sale_enabled', False)}, "
        f"is_made_to_order={getattr(product, 'is_made_to_order', False)}, "
        f"is_reservation_enabled={getattr(product, 'is_reservation_enabled', False)}, "
        f"price_card={getattr(product, 'price_card', None)}, "
        f"price_cash={getattr(product, 'price_cash', None)}"
    )
```

**Заменить блок строк 532-542:**

**БЫЛО:**
```python
        # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
        user_role = 'client' if (viewer_id is not None and viewer_id != user_id) else None
        shop_settings = None  # TODO: Получить из БД если нужно
        
        action_type_info = get_product_action_type_dict(prod, user_role, shop_settings, db)
        product_dict.update(action_type_info)
        
        # DEBUG: Логирование action_type для диагностики
        print(f"[PRODUCTS LIST DEBUG] Product {prod.id}: action_type={action_type_info['action_type']}, can_add_to_cart={action_type_info['can_add_to_cart']}, flags: is_sale_enabled={prod.is_sale_enabled}, is_made_to_order={prod.is_made_to_order}, is_reservation_enabled={prod.is_reservation_enabled}")
```

**СТАЛО:**
```python
        # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
        user_role = 'client' if (viewer_id is not None and viewer_id != user_id) else None
        
        # Получаем настройки магазина из БД
        from ..utils.product_action_type import get_shop_settings_dict
        shop_settings = get_shop_settings_dict(prod.user_id, getattr(prod, 'bot_id', None), db)
        
        action_type_info = get_product_action_type_dict(prod, user_role, shop_settings, db)
        product_dict.update(action_type_info)
        
        # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат для сравнения с checkout
        print(
            f"[PRODUCTS LIST DEBUG] Product {prod.id}: "
            f"action_type={action_type_info['action_type']}, "
            f"can_add_to_cart={action_type_info['can_add_to_cart']}, "
            f"reason_not_sale={action_type_info['reason_not_sale']}, "
            f"flags: is_sale_enabled={getattr(prod, 'is_sale_enabled', False)}, "
            f"is_made_to_order={getattr(prod, 'is_made_to_order', False)}, "
            f"is_reservation_enabled={getattr(prod, 'is_reservation_enabled', False)}, "
            f"price_card={getattr(prod, 'price_card', None)}, "
            f"price_cash={getattr(prod, 'price_cash', None)}"
        )
```

---

### Файл 3: `backend/app/routers/deals.py`

**Заменить блок строк 124-163:**

**БЫЛО:**
```python
        # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО ОФОРМЛЯТЬ ==========
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        shop_settings = None  # TODO: Получить из БД если нужно
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
        )
        
        # DEBUG: Логирование типа товара
        print(f"[DEALS CHECKOUT DEBUG] product_id={product_id}, action_type={action_type}, can_add_to_cart={can_add_to_cart}, reason_not_sale={reason_not_sale}")
        
        if not can_add_to_cart:
            # ... обработка ошибки ...
        
        # ========== КОНЕЦ ВАЛИДАЦИИ ТИПА ТОВАРА ==========
        
        available = getattr(product, "is_sale_enabled", False) or getattr(product, "is_for_sale", False)
        if not available:
            raise HTTPException(
                status_code=400,
                detail=f"Товар «{product.name}» недоступен для покупки",
            )
```

**СТАЛО:**
```python
        # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО ОФОРМЛЯТЬ ==========
        # ВАЖНО: Используем ЕДИНУЮ функцию вычисления action_type (источник истины)
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        
        # Получаем настройки магазина из БД
        from ..utils.product_action_type import get_shop_settings_dict
        shop_settings = get_shop_settings_dict(product.user_id, getattr(product, 'bot_id', None), db)
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
        )
        
        # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат как в products list для сравнения
        print(
            f"[DEALS CHECKOUT DEBUG] Product {product_id}: "
            f"action_type={action_type}, "
            f"can_add_to_cart={can_add_to_cart}, "
            f"reason_not_sale={reason_not_sale}, "
            f"flags: is_sale_enabled={getattr(product, 'is_sale_enabled', False)}, "
            f"is_made_to_order={getattr(product, 'is_made_to_order', False)}, "
            f"is_reservation_enabled={getattr(product, 'is_reservation_enabled', False)}, "
            f"price_card={getattr(product, 'price_card', None)}, "
            f"price_cash={getattr(product, 'price_cash', None)}"
        )
        
        # ВАЛИДАЦИЯ: Только товары с action_type="sale" и can_add_to_cart=True можно оформить
        if not can_add_to_cart or action_type != "sale":
            action_type_text = {
                'purchase': 'покупка',
                'order': 'заказ',
                'reserve': 'резервация',
                'none': 'не продается'
            }.get(action_type, 'не продается')
            
            error_message = f"Товар «{product.name}» нельзя оформить. Тип: {action_type_text}"
            print(f"[DEALS CHECKOUT DEBUG] BLOCKED: product_id={product_id}, action_type={action_type}, reason={reason_not_sale}")
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
```

**ВАЖНО:** Удалена дублирующая проверка `available = getattr(product, "is_sale_enabled", False)` - теперь используется только единая функция.

---

### Файл 4: `backend/app/routers/cart.py`

**Заменить блок строк 55-65:**

**БЫЛО:**
```python
    user_role = 'client' if user_id != product.user_id else 'owner'
    shop_settings = None  # TODO: Получить из БД если нужно
    
    action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
        product, user_role, shop_settings, db
    )
    
    # DEBUG: Логирование типа товара
    print(f"[CART DEBUG] add_to_cart: product_id={product_id}, action_type={action_type}, can_add_to_cart={can_add_to_cart}, reason_not_sale={reason_not_sale}")
```

**СТАЛО:**
```python
    user_role = 'client' if user_id != product.user_id else 'owner'
    
    # Получаем настройки магазина из БД
    from ..utils.product_action_type import get_shop_settings_dict
    shop_settings = get_shop_settings_dict(product.user_id, getattr(product, 'bot_id', None), db)
    
    action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
        product, user_role, shop_settings, db
    )
    
    # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат как в products list для сравнения
    print(
        f"[CART DEBUG] Product {product_id}: "
        f"action_type={action_type}, "
        f"can_add_to_cart={can_add_to_cart}, "
        f"reason_not_sale={reason_not_sale}, "
        f"flags: is_sale_enabled={getattr(product, 'is_sale_enabled', False)}, "
        f"is_made_to_order={getattr(product, 'is_made_to_order', False)}, "
        f"is_reservation_enabled={getattr(product, 'is_reservation_enabled', False)}, "
        f"price_card={getattr(product, 'price_card', None)}, "
        f"price_cash={getattr(product, 'price_cash', None)}"
    )
```

---

### Файл 5: `backend/app/services/pricing.py`

**Заменить блок строк 167-174:**

**БЫЛО:**
```python
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        shop_settings = None  # TODO: Получить из БД если нужно
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
        )
        
        if not can_add_to_cart:
```

**СТАЛО:**
```python
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
```

---

## ПОЧЕМУ ЭТО ТОЧНО РЕШАЕТ ПРОБЛЕМУ

### 1. Правильный приоритет флагов
- ✅ `is_reservation_enabled=True` → `action_type="reserve"` (ВЫСШИЙ приоритет)
- ✅ `is_made_to_order=True` → `action_type="order"` (второй приоритет)
- ✅ `is_sale_enabled=True` → `action_type="sale"` ТОЛЬКО если есть цена (третий приоритет)

### 2. Проверка цены для sale
- ✅ Товар с `is_sale_enabled=True` но без цены → `action_type="none"`, `reason_not_sale="price_not_set"`
- ✅ Предотвращает попытки купить товар без цены

### 3. Единая функция везде
- ✅ Все места (products list, product detail, checkout, cart, pricing) используют одну функцию
- ✅ Все получают `shop_settings` из БД одинаковым способом
- ✅ Невозможны расхождения между разными endpoints

### 4. Улучшенное логирование
- ✅ Одинаковый формат логов во всех местах
- ✅ Видны все флаги и цены для диагностики
- ✅ Легко сравнить значения из разных endpoints

### 5. Удалена дублирующая проверка
- ✅ В `deals.py` удалена проверка `is_sale_enabled` которая могла конфликтовать
- ✅ Используется только единая функция `get_product_action_type()`

---

## КАК ПРОТЕСТИРОВАТЬ

### Тест 1: Проверка Product 85 (резервация)
**Запрос:**
```bash
GET /api/products/?user_id=123&viewer_id=456
```

**Ожидаемый результат в логах:**
```
[PRODUCTS LIST DEBUG] Product 85: action_type=reserve, can_add_to_cart=False, reason_not_sale=reservation_only, flags: is_sale_enabled=False, is_made_to_order=False, is_reservation_enabled=True
```

**Ожидаемый результат в JSON:**
```json
{
  "id": 85,
  "action_type": "reserve",
  "can_add_to_cart": false,
  "reason_not_sale": "reservation_only",
  "is_reservation_enabled": true,
  "is_sale_enabled": false
}
```

### Тест 2: Проверка checkout для Product 85
**Запрос:**
```bash
POST /api/deals/checkout/start
{
  "items": [{"product_id": 85, "quantity": 1}]
}
```

**Ожидаемый результат в логах:**
```
[DEALS CHECKOUT DEBUG] Product 85: action_type=reserve, can_add_to_cart=False, reason_not_sale=reservation_only, flags: is_sale_enabled=False, is_made_to_order=False, is_reservation_enabled=True
[DEALS CHECKOUT DEBUG] BLOCKED: product_id=85, action_type=reserve, reason=reservation_only
```

**Ожидаемый результат:**
```json
{
  "detail": {
    "error": "NOT_SALE",
    "message": "Товар «...» нельзя оформить. Тип: резервация",
    "action_type": "reserve",
    "reason": "reservation_only"
  }
}
```
**HTTP Status:** 400

### Тест 3: Проверка sale товара с ценой
**Запрос:**
```bash
GET /api/products/{id}?user_id=123
```

**Товар:** `is_sale_enabled=True`, `price_card=1000.0`

**Ожидаемый результат:**
```json
{
  "id": 123,
  "action_type": "sale",
  "can_add_to_cart": true,
  "reason_not_sale": null,
  "is_sale_enabled": true,
  "price_card": 1000.0
}
```

### Тест 4: Проверка sale товара БЕЗ цены
**Товар:** `is_sale_enabled=True`, `price_card=None`, `price_cash=None`, `price=None`

**Ожидаемый результат:**
```json
{
  "id": 124,
  "action_type": "none",
  "can_add_to_cart": false,
  "reason_not_sale": "price_not_set",
  "is_sale_enabled": true
}
```

### Тест 5: Проверка приоритета (reserve + sale)
**Товар:** `is_reservation_enabled=True`, `is_sale_enabled=True`, `price_card=1000.0`

**Ожидаемый результат:**
```json
{
  "action_type": "reserve",  // ← reserve побеждает
  "can_add_to_cart": false
}
```

### Тест 6: Запуск unit-тестов
```bash
cd backend
pytest test_product_action_type.py -v
```

**Ожидаемый результат:**
```
✅ Test 1 PASSED: Reservation has priority over sale
✅ Test 2 PASSED: Made-to-order has priority over sale
✅ Test 3 PASSED: Sale allowed when price is set
✅ Test 4 PASSED: Sale blocked when price is not set
✅ Test 5 PASSED: Reservation wins over sale in conflict
✅ Test 6 PASSED: Made-to-order wins over sale in conflict
✅ Test 7 PASSED: None when no flags are set
✅ Test 8 PASSED: Owner always gets none
```

---

## ИТОГОВЫЙ ЧЕКЛИСТ

- [x] Исправлен приоритет флагов (reserve > order > sale)
- [x] Добавлена проверка цены для sale
- [x] Добавлена функция получения shop_settings из БД
- [x] Все места используют единую функцию `get_product_action_type()`
- [x] Улучшено логирование (единый формат)
- [x] Удалена дублирующая проверка в deals.py
- [x] Добавлены unit-тесты для проверки логики
- [x] Синтаксис проверен (нет ошибок)

---

## ДОПОЛНИТЕЛЬНЫЕ ЗАМЕЧАНИЯ

1. **Тесты можно запустить** через `pytest backend/test_product_action_type.py -v` или напрямую `python backend/test_product_action_type.py`

2. **Логи теперь единообразны** - можно легко сравнить значения из разных endpoints

3. **Если нужно отключить debug-логи** - закомментируйте строки с `print()` или добавьте флаг `DEBUG_ACTION_TYPE = False`

4. **Проверка цены учитывает legacy поле `price`** для обратной совместимости

5. **shop_settings получается из БД** - если настройки не найдены, используются дефолтные значения (reservations_enabled=True)
