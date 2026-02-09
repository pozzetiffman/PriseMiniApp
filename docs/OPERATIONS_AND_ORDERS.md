# Операции в личном кабинете и создание заказов

Документ описывает, как устроены операции (заказы, резервации, продажи, покупки) в личном кабинете и как создаются заказы.

---

## 1. Где живут операции

### 1.1 Вход в личный кабинет

- **Меню** (иконка ☰) → пункт «Личный кабинет» → открывается **страница профиля** (`#profile-page`).
- На странице профиля блок **«📦 Мои операции»** с четырьмя кнопками:
  - **🛒 Заказы** — оформленные покупки (как клиент).
  - **🔒 Резервации** — зарезервированные товары.
  - **💰 Продажи** — товары, которые пользователь продал (как продавец).
  - **🛍️ Покупки** — заказы на покупку (C2C, «покупки» в смысле «я покупаю у других»).

Кнопки ведут на отдельные **страницы операций** (orders-page, reservations-page, purchases-page, sale-orders-page). У каждой страницы единая структура: верхнее меню, вкладки «Активные» / «Завершённые», список карточек. Клик по карточке открывает **страницу детали операции** (`#operation-detail-page`).

### 1.2 Связь модулей

| Действие | Модуль |
|----------|--------|
| Открытие профиля, кнопки операций | `webapp/js/profile.js` |
| Базовая логика страниц операций (вкладки, закрытие, карточки) | `webapp/js/operationsBase.js` |
| Страница заказов | `webapp/js/operationsOrders.js` |
| Страница резерваций | `webapp/js/operationsReservations.js` |
| Страница продаж | `webapp/js/operationsPurchases.js` |
| Страница покупок (sale-orders) | `webapp/js/operationsSaleOrders.js` |
| Детальная страница (заказ/покупка/продажа) | `webapp/js/operationsDetail.js` |
| Счётчики активных операций (индикаторы) | `webapp/js/activityIndicators.js` |

---

## 2. Как выглядят страницы операций

### 2.1 Профиль (HTML)

```html
<!-- index.html: блок операций на #profile-page -->
<div class="profile-section">
    <h3 class="profile-section-title">📦 Мои операции</h3>
    <div class="profile-operations-grid">
        <button id="profile-orders-btn" class="profile-operation-card" data-type="orders">...</button>
        <button id="profile-reservations-btn" ...>...</button>
        <button id="profile-purchases-btn" ...>...</button>
        <button id="profile-sale-orders-btn" ...>...</button>
    </div>
</div>
```

На кнопках при наличии активных элементов показываются индикаторы (`.activity-indicator`). Счётчики берутся из API в `activityIndicators.js` (getMyOrdersAPI, fetchUserReservations, getMyPurchasesAPI, getMySaleOrdersAPI).

### 2.2 Страница одного типа операций (например, заказы)

У всех четырёх типов единая схема:

- **Верхнее меню** (`.operation-top-menu`): кнопка «←» (закрыть → возврат в профиль), заголовок (🛒 Заказы / 🔒 Резервации / 💰 Продажи / 🛍️ Покупки).
- **Вкладки**: «Активные» и «Завершённые» (`.operation-tab`, `data-status="active"` / `"completed"`).
- **Контент**: два блока — для активных и для завершённых. В каждом блок — контейнер списка, например `#orders-active-items`, `#orders-completed-items`.

Пример для заказов:

```html
<div id="orders-page" class="operation-page">
    <div class="operation-top-menu">...</div>
    <div class="operation-page-content">
        <div class="operation-tabs">
            <button class="operation-tab active" data-status="active">Активные</button>
            <button class="operation-tab" data-status="completed">Завершённые</button>
        </div>
        <div id="orders-active-content" class="operation-content active">
            <div id="orders-active-items" class="operation-items"></div>
        </div>
        <div id="orders-completed-content" class="operation-content" style="display: none;">
            <div id="orders-completed-items" class="operation-items"></div>
        </div>
    </div>
</div>
```

### 2.3 Карточка операции (список)

Карточки создаются в `operationsBase.js` функцией **createOperationCard(item, type, status)**.

- Один элемент — **карточка** (`.operation-item-card`) с `data-type` (orders, reservations, purchases, sale-orders) и `data-status` (active, completed).
- В карточке: изображение товара (80×80), название, цена, количество, дата, статус (бейдж), для резерваций — «До HH:MM».
- Цвет полоски слева у карточки задаётся в CSS по `data-type` (заказы — зелёный, резервации — оранжевый, продажи — фиолетовый, покупки — синий).
- Для заказов/покупок/продаж карточка кликабельна (`.operation-item-card-clickable`), клик открывает страницу детали.

### 2.4 Страница детали операции

Открывается из списка заказов/продаж/покупок (резервации не используют эту страницу в том же виде).

- **Верхнее меню**: «←» (назад в список), заголовок «🛒 Детали заказа» / «💰 Детали продажи» / «🛍️ Детали покупки».
- **Блоки контента** (все данные из snapshot сделки):
  1. Статус и дата.
  2. Карточка товара (фото, название, цена; при наличии товара — переход в модалку товара).
  3. Детали заказа: количество, цена, скидка, итого, способ доставки/оплаты.
  4. Контактная информация: ФИО, телефон, email, адрес.

HTML структура:

```html
<div id="operation-detail-page" class="operation-page operation-detail-page">
    <div class="operation-top-menu">...</div>
    <div class="operation-detail-content">
        <div id="operation-detail-status-row" class="operation-detail-status-row"></div>
        <div class="operation-detail-section operation-detail-product-section">
            <div id="operation-detail-product-card" class="operation-detail-product-card-wrap"></div>
        </div>
        <div class="operation-detail-section operation-detail-order-section">
            <div id="operation-detail-order-block" class="operation-detail-order-block"></div>
        </div>
        <div class="operation-detail-section operation-detail-contact-section">
            <div id="operation-detail-contact-block" class="operation-detail-contact-block"></div>
        </div>
    </div>
</div>
```

Логика заполнения — в `operationsDetail.js` (openOperationDetailPage → renderOperationDetail, createOperationProductCard).

---

## 3. Как создаются заказы

### 3.1 Текущие точки входа

- **Страница товара / Bottom Sheet корзины**  
  Действие «Купить сейчас» (или аналог) открывает **страницу оформления заказа** (`#order-page`). Там форма: количество, контакты, доставка и т.д. Отправка формы вызывает **createOrderAPI** и создаёт один заказ по одному товару.

- **Корзина (новая, cart-page-new)**  
  Кнопка «К оформлению» пока **не создаёт заказы**: в `cartNew.js` на `#cart-new-checkout-btn` висит заглушка `alert('Оформление заказа будет реализовано позже')`. То есть массовое оформление корзины ещё не подключено к API заказов.

### 3.2 Фронт: создание одного заказа

1. Открытие страницы заказа: **showOrderPage(productId, fromCart)** в `orders.js`.  
   - Заполняется форма (количество, контакты при наличии), вызывается **setupOrderFormHandlers(productId)**.
2. Отправка формы: собирается объект **orderData** (product_id, quantity, first_name, last_name, phone, email, delivery_method и т.д.) и вызывается **createOrderAPI(orderData)** из `api/orders.js`.
3. **createOrderAPI**:  
   - URL: `POST ${API_BASE}/api/orders/`  
   - Тело: `JSON.stringify(orderData)`  
   - Заголовки: getBaseHeaders() (в т.ч. X-Telegram-Init-Data).
4. После успешного ответа: сообщение «Заказ оформлен», закрытие/возврат, при необходимости обновление корзины и списка заказов.

### 3.3 Бэкенд: создание заказа

- Роутер: `backend/app/routers/orders.py`.
- Эндпоинт: **POST /api/orders/** (функция **create_order**).
- Поддерживаются два формата:
  - **Body**: `OrderCreate` (product_id, quantity, first_name, last_name, phone, email, delivery_method и т.д.).
  - **Query**: `product_id`, `quantity` (старый формат).
- По заголовку **X-Telegram-Init-Data** определяется **ordered_by_user_id** (клиент).
- Проверки: товар существует, товар «под заказ» (is_made_to_order), клиент не владелец товара.
- Создаётся **snapshot** товара (create_product_snapshot, operation_type='order'), затем запись **Order** (product_id, snapshot_id, user_id владельца, ordered_by_user_id, quantity, контакты, delivery_method, status='pending', is_completed=False, is_cancelled=False).
- Владельцу магазина при наличии бота отправляется уведомление в Telegram.

После создания заказ попадает в «Мои заказы» и отображается на странице заказов в личном кабинете (активный, затем при смене статуса — в завершённых).

---

## 4. API операций (кратко)

| Операция | API (фронт) | Эндпоинт (бэкенд) |
|----------|-------------|-------------------|
| Мои заказы (активные) | getMyOrdersAPI() | GET /api/orders/my |
| История заказов | getOrdersHistoryAPI() | GET /api/orders/history |
| Создать заказ | createOrderAPI(orderData) | POST /api/orders/ |
| Резервации пользователя | fetchUserReservations() | GET /api/reservations/ (или аналог) |
| Мои продажи | getMyPurchasesAPI() | GET /api/purchases/my |
| Мои покупки (sale-orders) | getMySaleOrdersAPI() | GET /api/sale_orders/my |

Страницы операций при открытии запрашивают свои списки (активные + завершённые где есть), разбивают по вкладкам и рендерят карточки через **createOperationCard**. Данные для детали берутся из объекта операции (в т.ч. product из snapshot).

---

## 5. Сводка по потокам

1. **Просмотр операций**  
   Меню → Личный кабинет → одна из кнопок (Заказы / Резервации / Продажи / Покупки) → страница списка (Активные / Завершённые) → клик по карточке → страница детали (для заказов/продаж/покупок).

2. **Создание заказа (один товар)**  
   Товар → «Купить сейчас» (или из корзины через будущий поток) → страница оформления заказа (#order-page) → заполнение формы → отправка → createOrderAPI → заказ создаётся, появляется в «Заказы» в личном кабинете.

3. **Корзина → оформление**  
   Сейчас не реализовано: кнопка «К оформлению» на странице корзины показывает alert. Для полноценного оформления нужно вызывать createOrderAPI (или отдельный bulk-эндпоинт) по выбранным товарам и обрабатывать успех/ошибки.

Если нужно, могу отдельно расписать только создание заказов (по шагам в коде) или только вёрстку/стили страниц операций.
