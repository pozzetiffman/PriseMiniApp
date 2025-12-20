# ARCHITECTURE_AUDIT.md  
## Аудит текущей реализации Telegram Mini App (магазины + корзина)

---

## 📌 Контекст проекта

Проект — Telegram Mini App, работающий **исключительно через Telegram**, без классического сайта.

Есть **бот-конструктор магазинов**, где:
- любой пользователь Telegram может создать магазин;
- этот же пользователь может быть клиентом других магазинов;
- один и тот же пользователь может одновременно:
  - быть владельцем магазина (owner),
  - быть клиентом (viewer) в другом магазине.

Навигация и доступ происходят **только через Telegram**, без публичных URL-сценариев.

---

## 🧠 Целевая архитектурная модель (как ДОЛЖНО быть)

### Роли
- **viewer (client)** — текущий пользователь Telegram, который открыл Mini App;
- **owner (store owner)** — владелец магазина, который сейчас открыт.

### Принципы
- Telegram user.id — **единственный источник идентификации пользователя**;
- frontend **НЕ определяет роли**, **НЕ выбирает магазин**, **НЕ фильтрует бизнес-логику**;
- backend — **единственный источник истины**;
- URL **не участвует** в бизнес-логике;
- Mini App **не должен работать корректно вне Telegram**.

---

## ❌ Несоответствия текущего кода архитектуре

Ниже — точечный разбор **того, что именно не соответствует**, строго по логам и поведению.

---

### 1️⃣ URL участвует в бизнес-логике ❌

#### Факт из кода:

**Файл:** `webapp/js/user.js:83-99`
```javascript
export function getUserId() {
    // Проверяем URL параметры (для просмотра чужой витрины)
    const urlParams = new URLSearchParams(window.location.search);
    const urlUserId = urlParams.get('user_id');
    if (urlUserId) {
        console.log(`📌 getUserId: Using user_id from URL (store owner): ${urlUserId}`);
        return parseInt(urlUserId, 10);
    }
    // Если нет в URL, берем из Telegram (пользователь смотрит свою витрину)
    const telegramId = getCurrentViewerId();
    if (telegramId) {
        console.log(`📌 getUserId: Using Telegram ID (own store): ${telegramId}`);
        return telegramId;
    }
    console.error('❌ getUserId: Cannot determine store owner ID');
    return null;
}
```

**Использование в:** `webapp/js/app.js:10,37`
```javascript
const isViewingOtherStore = new URLSearchParams(window.location.search).has('user_id');
// ...
userId = getUserId(); // Определяет владельца магазина из URL
```

#### Почему это ошибка:
- URL не должен определять:
  - владельца магазина;
  - контекст;
  - роль пользователя.
- Сейчас frontend сам решает, чей магазин открыт.
- Прямой доступ по URL `?user_id=309699106` позволяет обойти Telegram-контекст.

#### Как должно быть:
- frontend **вообще не читает user_id из URL**;
- backend сам сообщает контекст через единый endpoint:
```json
{
  "viewer_id": 8295794143,
  "shop_owner_id": 309699106,
  "role": "client"
}
```

---

### 2️⃣ Frontend сам определяет роль пользователя ❌

#### Факт из кода:

**Файл:** `webapp/js/app.js:288-323`
```javascript
const currentViewerId = getCurrentViewerId();
const isOwner = prod.user_id === parseInt(userId);
let hasActiveReservation = false;

// ...

const isProductOwner = currentViewerId && prod.user_id === currentViewerId;
const isReserver = currentViewerId && prod.reservation.reserved_by_user_id === currentViewerId;
const canCancel = isProductOwner || isReserver;

// ...

const isViewingAsGuest = isViewingOtherStore || (currentViewerId && prod.user_id !== currentViewerId);
if (!hasActiveReservation && isViewingAsGuest) {
    // Показываем кнопку резервации
}
```

**Файл:** `webapp/js/user.js:52-79`
```javascript
export function getCurrentViewerId() {
    // Способ 1: Пробуем получить из Telegram
    const telegramUserId = getCurrentUserId();
    if (telegramUserId) {
        return telegramUserId;
    }
    
    // Способ 2: Пробуем получить из sessionStorage
    const savedUserId = sessionStorage.getItem('telegram_user_id');
    if (savedUserId) {
        return parseInt(savedUserId, 10);
    }
    
    // 🔴🔴🔴 DEBUG MODE - ВРЕМЕННО ДЛЯ ПРОВЕРКИ UI 🔴🔴🔴
    console.warn('⚠️⚠️⚠️ DEBUG MODE: forcing viewer ID = 8295794143');
    return 8295794143; // ВРЕМЕННО для проверки UI
}
```

#### Почему это ошибка:
- frontend делает предположения:
  - если нет viewer → owner;
  - если user_id в URL → owner;
  - используется DEBUG MODE для подмены ролей.
- frontend не имеет права решать:
  - owner или client;
  - чей магазин открыт;
  - роли — это бизнес-логика → backend.

#### Как должно быть:
```javascript
const context = await api.getContext();

if (context.role === "owner") {
  renderOwnerUI();
} else {
  renderClientUI();
}
```

---

### 3️⃣ Frontend фильтрует резервации по времени ❌

#### Факт из кода:

**Файл:** `webapp/js/cart.js:85-95`
```javascript
// Проверка 3: резервация не должна быть истекшей
const reservedUntil = new Date(r.reserved_until);
const now = new Date();
const isNotExpired = reservedUntil > now;

console.log(`    ⏰ Reservation ${r.id}: reserved_until=${r.reserved_until}, now=${now}, isNotExpired=${isNotExpired}`);

if (!isNotExpired) {
    console.log(`    ❌ Reservation ${r.id}: skipped - expired`);
    return false;
}
```

**Также в:** `webapp/js/cart.js:222-226`
```javascript
const activeReservations = myReservations.filter(r => {
    if (!r.is_active) return false;
    const reservedUntil = new Date(r.reserved_until);
    return reservedUntil > new Date();
});
```

**И в:** `webapp/js/app.js:291-293`
```javascript
if (prod.reservation && prod.reservation.reserved_until) {
    const reservedUntil = new Date(prod.reservation.reserved_until);
    hasActiveReservation = reservedUntil > new Date();
}
```

#### Факт из backend:

**Файл:** `backend/app/routers/reservations.py:347-368`
```python
@router.get("/user/{user_id}", response_model=List[schemas.Reservation])
def get_user_reservations(user_id: int, db: Session = Depends(database.get_db)):
    reservations = db.query(models.Reservation).filter(
        and_(
            or_(
                models.Reservation.user_id == user_id,
                models.Reservation.reserved_by_user_id == user_id
            ),
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()  # Backend уже фильтрует!
        )
    ).order_by(models.Reservation.created_at.desc()).all()
    
    return reservations
```

#### Почему это критично:
- backend уже фильтрует по `reserved_until > datetime.utcnow()`;
- frontend **дублирует** эту проверку;
- возникает два источника истины;
- возможны расхождения из-за разницы времени между клиентом и сервером;
- если backend считает резервацию активной, а frontend — просроченной, возникает конфликт.

#### Как должно быть:
- ТОЛЬКО backend:
  - проверяет `reserved_until`;
  - обновляет `is_active`;
  - возвращает только активные резервации.
- frontend:
```javascript
// Backend уже вернул только активные резервации
if (!reservation.is_active) return; // Дополнительная проверка только на is_active
```

---

### 4️⃣ Поддерживается прямой вход по URL ❌

#### Факт из кода:

**Файл:** `webapp/js/telegram.js:22-25`
```javascript
} else {
    console.warn('⚠️ Telegram WebApp не найден - возможно, открыто в браузере');
    return false; // НО ПРИЛОЖЕНИЕ ПРОДОЛЖАЕТ РАБОТАТЬ!
}
```

**Файл:** `webapp/js/user.js:52-79`
```javascript
export function getCurrentViewerId() {
    const telegramUserId = getCurrentUserId();
    if (telegramUserId) {
        return telegramUserId;
    }
    
    // Fallback на sessionStorage
    const savedUserId = sessionStorage.getItem('telegram_user_id');
    if (savedUserId) {
        return parseInt(savedUserId, 10);
    }
    
    // DEBUG MODE позволяет работать без Telegram
    console.warn('⚠️⚠️⚠️ DEBUG MODE: forcing viewer ID = 8295794143');
    return 8295794143;
}
```

**Факт из веб-страницы:**
```
https://webapp-eight-vert.vercel.app/?user_id=309699106
```
Mini App продолжает работать:
- без Telegram user;
- с DEBUG-подменами;
- с реальными API-запросами.

#### Почему это ошибка:
- Mini App без Telegram — невалиден;
- такой вход должен быть:
  - запрещён,
  - либо read-only,
  - либо dev-only.

#### Как должно быть:
```javascript
if (!Telegram.WebApp.initDataUnsafe?.user) {
    showError("Откройте приложение через Telegram-бота");
    return;
}

// Или на уровне backend:
// Проверка initData в каждом запросе
```

---

### 5️⃣ DEV MODE смешан с прод-логикой ❌

#### Факт из кода:

**Файл:** `webapp/js/user.js:73-78`
```javascript
// 🔴🔴🔴 DEBUG MODE - ВРЕМЕННО ДЛЯ ПРОВЕРКИ UI 🔴🔴🔴
console.warn('⚠️⚠️⚠️ DEBUG MODE: forcing viewer ID = 8295794143');
console.warn('⚠️⚠️⚠️ Это временно для проверки UI! УДАЛИТЬ ПОСЛЕ ТЕСТА!');
return 8295794143; // ВРЕМЕННО для проверки UI
// 🔴🔴🔴 КОНЕЦ DEBUG MODE 🔴🔴🔴
```

#### Почему это опасно:
- DEV MODE не изолирован;
- тестовые действия = реальные данные;
- создаются реальные резервации;
- отправляются Telegram-уведомления;
- используется реальный backend.

#### Как должно быть:
- DEV MODE:
  - без реальных резерваций;
  - без уведомлений;
  - без изменения состояния;
  - только mock-данные для UI.

---

### 6️⃣ Отсутствие валидации Telegram initData на backend ❌

#### Факт из кода:

**Проверка:** `grep -r "initData\|init_data\|validate.*telegram" backend/`
```
No matches found
```

**Файл:** `backend/app/routers/products.py:14-19`
```python
@router.get("/", response_model=List[schemas.Product])
def get_products(
    user_id: int,  # ❌ Принимает user_id напрямую без проверки
    category_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
```

**Файл:** `backend/app/routers/reservations.py:24-30`
```python
@router.post("/", response_model=schemas.Reservation)
def create_reservation(
    product_id: int = Query(...),
    reserved_by_user_id: int = Query(...),  # ❌ Принимает user_id без проверки
    hours: int = Query(..., ge=1, le=3),
    db: Session = Depends(database.get_db)
):
```

#### Почему это критично:
- **Любой может подделать user_id** и получить доступ к чужим данным;
- нет проверки, что запрос действительно пришел из Telegram;
- нет валидации подписи `initData`;
- можно создать резервацию от имени другого пользователя;
- можно получить доступ к чужим товарам/резервациям.

#### Как должно быть:
```python
from telegram import WebAppDataValidator

@router.get("/api/products")
async def get_products(
    init_data: str = Header(..., alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    # 1. Валидировать init_data
    validator = WebAppDataValidator(bot_token=TELEGRAM_BOT_TOKEN)
    data = validator.validate(init_data)
    
    # 2. Извлечь user_id из валидированных данных
    viewer_id = data.user.id
    
    # 3. Определить shop_owner_id из контекста
    # ...
```

---

### 7️⃣ Контекст магазина хранится на frontend ❌

#### Факт из кода:

**Файл:** `webapp/js/app.js:10,37,73-102`
```javascript
const isViewingOtherStore = new URLSearchParams(window.location.search).has('user_id');
// ...
userId = getUserId(); // Frontend определяет владельца магазина
// ...
async function loadData() {
    if (!userId) {
        productsGrid.innerHTML = '<p class="loading">Ошибка: не удалось определить пользователя</p>';
        return;
    }
    
    const userIdNum = parseInt(userId, 10);
    // ...
    const categories = await fetchCategories(userIdNum);
    const products = await fetchProducts(userIdNum, currentCategoryId);
}
```

**Файл:** `webapp/js/api.js:14-23,26-38`
```javascript
export async function fetchCategories(userId) {
    const url = `${API_BASE}/api/categories/?user_id=${userId}`;
    // Frontend передает user_id в запрос
}

export async function fetchProducts(userId, categoryId = null) {
    let url = `${API_BASE}/api/products/?user_id=${userId}`;
    // Frontend передает user_id в запрос
}
```

#### Почему это ошибка:
- frontend знает:
  - чей магазин;
  - какие товары грузить;
  - backend просто фильтрует по user_id.
- frontend не должен хранить контекст;
- backend должен возвращать уже готовый контекст.

#### Как должно быть:
```
Frontend → GET /api/context
Backend → готовый контекст магазина и роли
```

---

## 🧠 Итог

### Сейчас:
- ❌ **НЕТ валидации Telegram initData на backend** (критическая уязвимость безопасности)
- ❌ frontend решает бизнес-логику
- ❌ URL участвует в логике
- ❌ frontend и backend расходятся
- ❌ фильтрация времени дублируется
- ❌ DEV MODE в прод-коде
- ❌ работа без Telegram

### Должно быть:
- ✅ backend = единственный источник истины
- ✅ frontend = отображение данных
- ✅ Telegram = контекст и идентификация
- ✅ единый endpoint для контекста
- ✅ проверка Telegram на каждом запросе

---

## 🎯 Ключевой следующий шаг (обязательный)

### Ввести единый endpoint:

**GET `/api/context`**

Он должен:
1. Проверять Telegram `initData` (валидация подписи)
2. Определять `viewer_id` из Telegram
3. Определять `shop_owner_id` из контекста (возможно, из того же `initData` или параметра, но валидированного на backend)
4. Возвращать роль и права:

```json
{
  "viewer_id": 8295794143,
  "shop_owner_id": 309699106,
  "role": "client",
  "permissions": {
    "can_create_products": false,
    "can_reserve": true,
    "can_cancel_reservation": false
  }
}
```

### После этого:
- ✅ полностью убрать `user_id` из frontend-логики;
- ✅ убрать фильтрацию времени на frontend;
- ✅ убрать предположения ролей;
- ✅ отключить рабочий UI вне Telegram;
- ✅ убрать DEBUG MODE из прод-кода.

---

## 📌 Главная мысль

**Backend знает ВСЁ.**  
**Frontend ничего не предполагает.**  
**Telegram — единственный вход.**

---

## 🔍 Детальный разбор проблемных мест

### Проблема 1: Дублирование фильтрации времени

**Backend:** `backend/app/routers/reservations.py:360-368`
```python
reservations = db.query(models.Reservation).filter(
    and_(
        # ...
        models.Reservation.is_active == True,
        models.Reservation.reserved_until > datetime.utcnow()  # ✅ Backend фильтрует
    )
).all()
```

**Frontend:** `webapp/js/cart.js:85-95`
```javascript
const reservedUntil = new Date(r.reserved_until);
const now = new Date();
if (!isNotExpired) {
    return false; // ❌ Frontend дублирует фильтрацию
}
```

**Проблема:** Если время на клиенте отличается от сервера, могут быть расхождения.

---

### Проблема 2: Определение роли на frontend

**Файл:** `webapp/js/app.js:288-316`
```javascript
const currentViewerId = getCurrentViewerId();
const isOwner = prod.user_id === parseInt(userId);  // ❌ Frontend решает роль
const isProductOwner = currentViewerId && prod.user_id === currentViewerId;
const isReserver = currentViewerId && prod.reservation.reserved_by_user_id === currentViewerId;
const canCancel = isProductOwner || isReserver;  // ❌ Frontend решает права
```

**Проблема:** Frontend сам определяет, кто может что делать. Это должно быть на backend.

---

### Проблема 3: URL как источник истины

**Файл:** `webapp/js/user.js:83-99`
```javascript
export function getUserId() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlUserId = urlParams.get('user_id');  // ❌ URL определяет магазин
    if (urlUserId) {
        return parseInt(urlUserId, 10);
    }
    // ...
}
```

**Проблема:** Любой может подменить URL и получить доступ к чужому магазину (если нет проверки на backend).

---

### Проблема 4: DEBUG MODE в прод-коде

**Файл:** `webapp/js/user.js:73-78`
```javascript
console.warn('⚠️⚠️⚠️ DEBUG MODE: forcing viewer ID = 8295794143');
return 8295794143;  // ❌ Hardcoded ID в прод-коде
```

**Проблема:** Это создает реальные резервации с тестовым ID в продакшене.

---

### Проблема 5: Отсутствие проверки Telegram

**Файл:** `webapp/js/telegram.js:22-25`
```javascript
} else {
    console.warn('⚠️ Telegram WebApp не найден - возможно, открыто в браузере');
    return false;  // ❌ Но приложение продолжает работать
}
```

**Проблема:** Нет блокировки работы без Telegram.

---

## ✅ Рекомендации по исправлению

### Шаг 1: Добавить валидацию Telegram initData

**Установить библиотеку:**
```bash
pip install python-telegram-bot
```

**Создать middleware или dependency:**
```python
from telegram import WebAppDataValidator
from fastapi import Header, HTTPException

async def validate_telegram_init_data(
    init_data: str = Header(..., alias="X-Telegram-Init-Data")
):
    validator = WebAppDataValidator(bot_token=TELEGRAM_BOT_TOKEN)
    try:
        data = validator.validate(init_data)
        return data
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid Telegram initData")
```

### Шаг 2: Создать endpoint `/api/context`

```python
@router.get("/api/context")
async def get_context(
    telegram_data: WebAppData = Depends(validate_telegram_init_data),
    shop_owner_id: Optional[int] = Query(None),  # Опционально, если смотрим чужой магазин
    db: Session = Depends(database.get_db)
):
    viewer_id = telegram_data.user.id
    
    # Если shop_owner_id не указан, значит смотрим свой магазин
    if shop_owner_id is None:
        shop_owner_id = viewer_id
        role = "owner"
    else:
        role = "client"
    
    # Определить права
    permissions = {
        "can_create_products": role == "owner",
        "can_reserve": role == "client",
        "can_cancel_reservation": True  # Может отменить свою резервацию
    }
    
    return {
        "viewer_id": viewer_id,
        "shop_owner_id": shop_owner_id,
        "role": role,
        "permissions": permissions
    }
```

### Шаг 2: Убрать логику из frontend

- Удалить `getUserId()` из `user.js`
- Удалить фильтрацию времени из `cart.js`
- Удалить определение ролей из `app.js`
- Удалить DEBUG MODE

### Шаг 3: Добавить проверку Telegram

```javascript
if (!Telegram.WebApp.initDataUnsafe?.user) {
    showError("Откройте приложение через Telegram-бота");
    return;
}
```

### Шаг 4: Использовать контекст везде

```javascript
const context = await api.getContext();
// Использовать context.viewer_id, context.shop_owner_id, context.role
```

---

## 📊 Приоритет исправлений

1. **КРИТИЧНО:** Добавить валидацию Telegram initData на backend
2. **КРИТИЧНО:** Создать `/api/context` endpoint
3. **КРИТИЧНО:** Убрать DEBUG MODE
4. **ВАЖНО:** Убрать фильтрацию времени на frontend
5. **ВАЖНО:** Убрать определение ролей на frontend
6. **ВАЖНО:** Добавить проверку Telegram на frontend
7. **СРЕДНЕ:** Убрать использование URL для бизнес-логики

