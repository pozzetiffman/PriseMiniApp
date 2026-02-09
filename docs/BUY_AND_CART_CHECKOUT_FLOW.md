# «Купить» на карточке и оформление в корзине — полная логика

Документ описывает: как работает кнопка **«Купить»** на карточке товара, какие формы и расчёты используются, и как устроено **оформление в корзине** (кнопка «К оформлению»). Оба сценария используют **единую форму оформления сделки** (#deal-checkout-page) и один тип операции — **Deal**.

---

## Часть 1. «Купить» на карточке товара (один товар) — поток Deal

### 1.1 Когда показывается «Купить»

- **Файл:** `webapp/js/utils/productActionType.js`
- Тип действия определяется функцией **`getProductActionType(product, appContext, shopSettings)`**.
- Кнопка **«Купить сейчас»** показывается, когда возвращается тип **`sale`**:
  - `is_client_sale` → C2C (клиент продаёт клиенту);
  - или `is_sale_enabled` → магазин продаёт клиенту.
- Текст кнопки: **`getActionButtonText('sale')`** → `"Купить сейчас"`.

### 1.2 Откуда вызывается «Купить»

1. **Со страницы избранного (Bottom Sheet корзины)**  
   - Пользователь нажимает иконку корзины на карточке → товар добавляется в корзину, открывается **Bottom Sheet**.  
   - Для типа `sale` кнопка — «Купить сейчас». При клике: **startDealCheckoutAPI({ items: [{ product_id, quantity }] })** → **openDealCheckoutPage(deal_id, summary, { source: 'single' })** — открывается единая форма **#deal-checkout-page**.

2. **Из модалки товара (страница товара)**  
   - Кнопка «Купить» в модалке вызывает **showSaleOrderModal(product)** из `sale_orders.js`, который внутри вызывает **openBuyCheckoutForProduct(product, 1)** — тот же поток: start Deal → #deal-checkout-page с `source: 'single'`.

**Файлы:** `webapp/js/cart/cartBottomSheet.js` (case 'sale'), `webapp/js/sale_orders.js` (showSaleOrderModal → openBuyCheckoutForProduct).

---

### 1.3 Страница оформления покупки одного товара — единая форма #deal-checkout-page

При покупке одного товара с карточки/избранного используется **та же форма**, что и при оформлении из корзины: **#deal-checkout-page** (`webapp/js/dealCheckout.js`). Форма **#sale-order-page** в клиентском потоке больше не используется (оставлена для совместимости).

Ниже описана единая форма оформления сделки (4 шага).

#### Шаг 1 — Способ оплаты

| name | Значения |
|------|----------|
| `deal-payment-method` | card (по умолчанию), cash, transfer, other |

При смене вызывается **refreshQuoteAndSummary()** (quote по deal_id).

#### Шаг 2 — Доставка

| name | Значения |
|------|----------|
| `deal-delivery-method` | pickup (по умолчанию), courier, none |

При «Курьером» показывается поле **#deal-checkout-address**. При смене — refreshQuoteAndSummary().

#### Шаг 3 — Контакты

| Поле | ID | Обязательность |
|------|-----|----------------|
| Имя | `#deal-checkout-name` | * |
| Телефон | `#deal-checkout-phone` | * |

Валидация при «Продолжить»: имя и телефон не пустые → переход на шаг 4.

#### Шаг 4 — Комментарий и подтверждение

| Поле | ID |
|------|-----|
| Комментарий | `#deal-checkout-comment` |

Кнопка **«Подтвердить покупку»** → **confirmDealCheckoutAPI(payload)**. При открытии с карточки (`source: 'single'`) корзина не очищается после confirm.

---

### 1.4 Отправка (один товар и корзина — одна и та же форма)

Итог в форме берётся с бэкенда: **refreshQuoteAndSummary()** → **getPricingQuoteAPI({ deal_id, payment_method, delivery_method })** → **POST /api/pricing/quote**.

Подтверждение: **confirmDealCheckoutAPI(payload)** → **POST /api/deals/checkout/confirm** с полями: deal_id, payment_method, delivery_method, customer_name, customer_phone, delivery_address, customer_comment.

После успеха: уведомление «Сделка №… оформлена», переход в «Покупки» и открытие детали сделки. При `source: 'single'` выбранные позиции корзины не удаляются.

---

### 1.5 Бэкенд: один товар и корзина — один поток Deal

**Покупка одного товара с карточки:**  
1. **POST /api/deals/checkout/start** с телом `{ items: [{ product_id, quantity: 1 }] }` → создаётся draft Deal с одним DealItem и snapshot.  
2. Далее те же шаги, что и при оформлении из корзины: quote по deal_id, форма #deal-checkout-page, **POST /api/deals/checkout/confirm**.  
3. При confirm бэкенд пересчитывает суммы через **build_quote_for_deal** (payment_method, delivery_method), обновляет Deal и DealItems, списывает остатки, присваивает номер сделки.

**POST /api/sale-orders/** оставлен для совместимости; клиентский UI туда не ведёт.

---

### 1.6 Связанные файлы — «Купить» одним товаром (поток Deal)

| Назначение | Файлы |
|------------|--------|
| Тип действия (Купить/Заказать/…) | `webapp/js/utils/productActionType.js` |
| Bottom Sheet → start Deal + openDealCheckoutPage | `webapp/js/cart/cartBottomSheet.js` |
| Модалка товара: showSaleOrderModal → openBuyCheckoutForProduct | `webapp/js/sale_orders.js` |
| Единая форма оформления сделки | `webapp/js/dealCheckout.js`, `webapp/index.html` (#deal-checkout-page) |
| API start/confirm сделки, quote | `webapp/js/api/deals.js`, `webapp/js/api/pricing.js` |
| Бэкенд сделок и расчёт при confirm | `backend/app/routers/deals.py`, `backend/app/services/pricing.py` |

---

## Часть 2. Оформление в корзине («К оформлению»)

### 2.1 Вход в оформление

- Страница корзины: **`#cart-page-new`** (новая корзина).  
- Кнопка **«К оформлению»**: `#cart-new-checkout-btn`.  
- **Файл:** `webapp/js/cart/cartNew.js` (строки 134–160).

Логика по клику:

1. **`getSelectedCartItemsForCheckout()`** из `cartStore.js`: возвращает массив выбранных позиций в формате `[{ product_id, quantity }]` (только те, у которых `item.selected === true` и есть `product.id`).
2. Если массив пустой — показ сообщения «Выберите товары для оформления», выход.
3. Вызов **`startDealCheckoutAPI({ items })`** → **POST /api/deals/checkout/start** с телом `{ items: [{ product_id, quantity }, ...] }`.
4. В ответе ожидаются: `deal_id`, `total_items_count`, `total_amount`, `currency`.
5. Открытие страницы оформления сделки: **`openDealCheckoutPage(result.deal_id, { total_items_count, total_amount, currency })`** из `dealCheckout.js`.

Итого: оформление в корзине — это **сделка (Deal)**, а не отдельные sale orders.

---

### 2.2 Страница оформления сделки (#deal-checkout-page)

**Файл:** `webapp/js/dealCheckout.js`  
**Разметка:** `webapp/index.html` — блок `#deal-checkout-page`.

Четыре шага; итог подтягивается с бэкенда через **POST /api/pricing/quote** с `deal_id`.

#### Сводка вверху страницы

- **`#deal-checkout-summary`** — заполняется из quote: количество товаров, сумма по товарам, доставка, итого.  
- При открытии сначала показывается предварительная сводка из ответа **checkout/start**, затем вызывается **`refreshQuoteAndSummary()`** с текущими способом оплаты и доставки.

#### Шаг 1 — Способ оплаты

| name | Значения |
|------|----------|
| `deal-payment-method` | `card` (по умолчанию), `cash`, `transfer`, `other` |

При смене способа оплаты вызывается **`refreshQuoteAndSummary()`** (quote пересчитывается с новым `payment_method`).

#### Шаг 2 — Доставка

| name | Значения |
|------|----------|
| `deal-delivery-method` | `pickup` (по умолчанию), `courier`, `none` |

При выборе «Курьером» показывается блок **`#deal-checkout-address-wrap`** с полем **`#deal-checkout-address`** (адрес доставки). При смене способа доставки — **`refreshQuoteAndSummary()`** и обновление видимости поля адреса.

#### Шаг 3 — Контакты

| Поле | ID | Обязательность |
|------|-----|----------------|
| Имя | `#deal-checkout-name` | * |
| Телефон | `#deal-checkout-phone` | * |

Валидация при «Продолжить»: имя и телефон не пустые → переход на шаг 4.

#### Шаг 4 — Комментарий и подтверждение

| Поле | ID |
|------|-----|
| Комментарий | `#deal-checkout-comment` |

Кнопка **«Подтвердить покупку»** — `#deal-checkout-step-4-submit` → собирается payload и вызывается **`confirmDealCheckoutAPI(payload)`**.

---

### 2.3 Расчёт итога на странице оформления сделки

- **`refreshQuoteAndSummary()`** в `dealCheckout.js`:  
  - читает выбранные способ оплаты и доставки из формы (**`getSelectedPaymentAndDelivery()`**);  
  - вызывает **`getPricingQuoteAPI({ deal_id: currentDealId, payment_method, delivery_method })`** → **POST /api/pricing/quote**;  
  - в сводку подставляет: `total_items_count` (из текущей сделки/quote), `items_amount`, `delivery_fee`, `total_amount`.  
- Итог на экране оформления сделки всегда приходит с бэкенда (единый источник истины для цен и доставки).

---

### 2.4 Подтверждение сделки

**Файл:** `webapp/js/dealCheckout.js` — обработчик кнопки «Подтвердить покупку».

Собирается **payload**:

- `deal_id`  
- `payment_method`, `delivery_method` — из формы  
- `customer_name` (из `#deal-checkout-name` или «Клиент»)  
- `customer_phone` (из `#deal-checkout-phone` или «—»)  
- `delivery_address` — из `#deal-checkout-address` (если курьер), иначе null  
- `customer_comment` — из `#deal-checkout-comment` или null  

Вызов: **`confirmDealCheckoutAPI(payload)`** → **POST /api/deals/checkout/confirm**.

После успеха:

- удаление выбранных позиций из корзины (**`removeSelectedCartItems()`**);
- уведомление «Сделка №… оформлена»;
- обновление счётчиков операций (**`updateActivityCounts()`**);
- закрытие страницы оформления и корзины;
- переход в профиль → «Покупки» и открытие детали созданной сделки (**`openDealDetailPage(fullDeal)`**).

---

### 2.5 Бэкенд: сделка (checkout/start и checkout/confirm)

**Файл:** `backend/app/routers/deals.py`.

#### POST /api/deals/checkout/start

- Тело: `{ items: [{ product_id, quantity }, ...] }`.
- Авторизация по Telegram init data → `buyer_user_id`.
- Для каждой позиции: проверка существования товара, доступности для продажи (`is_sale_enabled` или `is_for_sale`), что покупатель не владелец, проверка доступного остатка (с учётом резерваций).
- Цена за единицу: **`_get_unit_price_for_sale(product)`** — используется `price_card` или `price` (и скидка); **`price_cash` при start не используется**, сумма считается «по карте».
- Создание snapshot по каждой позиции, создание **Deal** в статусе `draft` с **DealItem** (product_id, snapshot_id, quantity, price_per_unit, line_total), подсчёт `total_items_count` и `total_amount`.
- Ответ: `deal_id`, `total_items_count`, `total_amount`, `currency`.

#### POST /api/deals/checkout/confirm

- Тело: deal_id, payment_method, delivery_method, customer_name, customer_phone, delivery_address, customer_comment.
- Бэкенд сохраняет эти данные в сделке; итоговую сумму при confirm пересчитывает единый модуль pricing (с учётом способа оплаты и доставки), присваивает номер сделки, переводит сделку в актив и списывает остатки по позициям.

---

### 2.6 Корзина: итог и способ оплаты (до перехода в оформление)

**Файлы:** `webapp/js/cart/cartStore.js`, `webapp/js/cart/cartNew.js`.

- Итог по выбранным позициям: **`getSelectedCartTotal(promoCode, paymentMethod)`** в `cartStore.js`.  
  Для каждой позиции: **`getEffectiveUnitPrice(item.product, paymentMethod)`** × quantity; промокод в коде не применяется (TODO).
- Способ оплаты в корзине хранится в хранилище корзины: **`getCartPaymentMethod()`** / **`setCartPaymentMethod('cash' | null)`**. В блоке итогов на странице корзины две строки: «По карте» и «Наличными» (`data-payment="card"` / `data-payment="cash"`). При выборе вызываются `setCartPaymentMethod` и **`updateCartSummary()`** в `cartNew.js` — пересчитывается итог в футере и в блоке сводки.
- **`getEffectiveUnitPrice(product, paymentMethod)`** в `priceUtils.js`: при способе «наличные» и наличии `price_cash` используется цена наличными, иначе цена по карте (или fallback для is_for_sale).  
- **`getSelectedCartItemsForCheckout()`** возвращает только выбранные позиции в виде `[{ product_id, quantity }]` для передачи в **checkout/start**.

---

### 2.7 Связанные файлы — оформление в корзине

| Назначение | Файлы |
|------------|--------|
| Кнопка «К оформлению», вызов start и открытие страницы | `webapp/js/cart/cartNew.js` |
| Выбранные позиции для checkout | `webapp/js/cart/cartStore.js` (getSelectedCartItemsForCheckout) |
| Страница оформления сделки (шаги, quote, confirm) | `webapp/js/dealCheckout.js` |
| API start/confirm сделки | `webapp/js/api/deals.js` |
| API quote для сделки | `webapp/js/api/pricing.js` |
| Разметка формы сделки | `webapp/index.html` (#deal-checkout-page) |
| Бэкенд сделок | `backend/app/routers/deals.py` |
| Расчёт quote по deal_id | `backend/app/routers/pricing.py`, `backend/app/services/pricing.py` (build_quote_for_deal) |

---

## Часть 3. Сводная схема потоков

```
[Карточка товара / Избранное]
    │
    ├─ Кнопка корзины → товар в корзину → Bottom Sheet
    │       │
    │       └─ Тип товара "sale" → кнопка «Купить сейчас»
    │               → startDealCheckoutAPI({ items: [{ product_id, quantity }] })
    │               → openDealCheckoutPage(deal_id, summary, { source: 'single' })
    │               → #deal-checkout-page (шаги 1–4) → quote по deal_id → confirm
    │               → POST /api/deals/checkout/confirm → Сделка в «Покупки»
    │
    └─ Модалка товара «Купить» → showSaleOrderModal(product) → openBuyCheckoutForProduct(product)
            → тот же поток: start Deal → #deal-checkout-page → confirm

[Корзина #cart-page-new]
    │
    └─ Выбор товаров → «К оформлению»
            → getSelectedCartItemsForCheckout()
            → startDealCheckoutAPI({ items }) → POST /api/deals/checkout/start
            → openDealCheckoutPage(deal_id, summary)
            → #deal-checkout-page (шаги 1–4)
            → refreshQuoteAndSummary() ← GET quote (deal_id + payment + delivery)
            → confirmDealCheckoutAPI(payload) → POST /api/deals/checkout/confirm
            → Сделка создана, корзина очищена по выбранным, переход в деталь сделки
```

---

## Часть 4. Расчёты и цены — кратко

| Место | Источник суммы | Учёт способа оплаты |
|-------|----------------|---------------------|
| Форма sale order (один товар) | **POST /api/pricing/quote** (items + payment + delivery) | Да: quote зависит от payment_method и delivery_method. |
| Корзина (страница) | **getSelectedCartTotal(paymentMethod)** через getEffectiveUnitPrice | Да: карта / наличные. |
| Оформление сделки | **POST /api/pricing/quote** (deal_id + payment + delivery) | Да: сводка из quote. |
| Бэкенд sale order | **build_quote** при создании заказа | Да: сохраняются items_amount, delivery_fee, total_amount. |
| Бэкенд deal (start) | **_get_unit_price_for_sale** (price_card/price, без price_cash) | При start сумма по «карте»; при confirm пересчёт в pricing по payment/delivery. |

Единый расчёт на бэкенде для quote и при confirm: **`backend/app/services/pricing.py`** (build_quote, build_quote_for_deal).

---

Если нужно, можно отдельно расписать только бэкенд (модели Deal, DealItem, SaleOrder, pricing) или только поля и валидации форм по шагам.
