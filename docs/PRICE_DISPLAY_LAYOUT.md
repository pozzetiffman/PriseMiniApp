# Цена на карточках товара и на странице товара: расположение, переносы, размеры, цвета, порядок

Полное описание того, как отображается цена во всех контекстах: витрина (сетка/список), страница товара, корзина, заказы, продажи, покупки, резервации, детали операции.

---

## 1. Источники логики цен

- **`webapp/js/utils/priceUtils.js`** — расчёт и форматирование:
  - `getBasePrice(product)` — базовая цена: приоритет `price_card` > `price`
  - `getFinalCardPrice(product)` — цена по карте с учётом скидки
  - `getFinalCashPrice(product)` — цена наличными с учётом скидки
  - `getOldPriceForDisplay(product)` — старая цена (только при скидке)
  - `getProductPriceDisplay(prod)` — итоговая строка для отображения (обычный товар / «на продажу»: диапазон, фикс, «Цена по запросу»)
  - `getProductPriceView(product)` — единый «вид» цен для карточки и детали операции

- **`webapp/js/utils/productCardParts.js`** — общий рендер блока цен и инфо-блока:
  - `renderProductPricesBlock(prod)` — только блок цен (обёртка + наличные + карта)
  - `renderProductInfoBlock(prod, opts)` — название + описание + блок цен (используется на витрине и в детали операции)

---

## 2. Типы товаров и что показывается по цене

| Тип товара | Условие | Что показывается |
|------------|---------|-------------------|
| **Обычный** | не `is_for_sale` | Цена по карте (price_card/price), при скидке — старая зачёркнутая; при наличии `price_cash` — цена наличными + иконка. |
| **На продажу (покупка)** | `is_for_sale === true` | Одна строка: «от X до Y ₽», «от X ₽», «до Y ₽», фиксированная цена или «Цена по запросу». Без разделения карта/наличные. |

Цвета (только для обычного товара с ценой по карте):
- Если есть и карта, и наличные: **красный** `#E35E45` (карта), **зелёный** `#00A82E` (наличные).
- Если только карта: **зелёный** `#00A82E` для цены по карте.

---

## 3. Витрина — сетка карточек (grid)

**Файл:** `webapp/js/handlers/products_render.js`  
Инфо-блок карточки формируется одним вызовом:  
`card.insertAdjacentHTML('beforeend', renderProductInfoBlock(prod, { mode: 'grid' }));`

### HTML-структура блока цен (из `productCardParts.js`)

- Обёртка:  
  `<div class="prices-wrap prices--has-cash">` или `prices--no-cash`  
  (класс `prices--has-cash` только если есть и карта, и наличные).

- **Порядок строк (сверху вниз):**
  1. **Наличные** (если есть `price_cash`):  
     `<div class="product-cash-price-container">`  
     → `<span class="product-cash-price">1 500₽</span>` + `<span class="product-cash-icon">` (SVG наличных).
  2. **Карта:**  
     `<div class="product-price-container">`  
     → при скидке: `<span class="old-price">2 000₽</span>`  
     → `<span class="product-price">1 800₽</span>`  
     → `<span class="product-card-icon">` (SVG карты).

- Для товара **«на продажу»**: одна обёртка `prices-wrap prices--no-cash` и один блок с текстом от `getProductPriceDisplay(prod)` (без иконок карты/наличных).

### Переходы строк

- Каждая «строка» цен — отдельный блок:  
  `.product-cash-price-container` и `.product-price-container` — блочные, с `margin-bottom: 4px`.
- Внутри строки карты всё в одну линию:  
  `.product-price-container` — `display: flex; flex-wrap: nowrap; align-items: baseline; gap: 8px; white-space: nowrap` (без переноса).

### Размеры и цвета (сетка) — `webapp/css/style.css`

| Элемент | Стили |
|---------|--------|
| `.product-price-container` | flex row, nowrap, `margin-bottom: 4px`, `margin-left: 2.5%`, `width: 95%`. |
| `.product-price-container .product-price` | **13px**, font-weight 400. |
| `.prices--has-cash .product-price` | цвет **#E35E45**. |
| `.prices--no-cash .product-price` | цвет **#00A82E**. |
| `.product-card-icon svg` | 20×20px. |
| `.product-cash-price-container` | flex row, `margin-bottom: 4px`, `margin-left: 2.5%`, `width: 95%`. |
| `.product-cash-price` | **17px**, цвет **#00A82E**. |
| `.product-cash-icon svg` | 20×20px. |
| `.old-price` | **13px**, `color: var(--text-hint)`, `text-decoration: line-through`, opacity 0.7. |

---

## 4. Витрина — режим списка (list view)

**Файл:** `webapp/js/handlers/products_render.js` (блок с `product-list-prices`, `product-list-old-price`, `product-list-card-price`, `product-list-cash-price`, `product-list-price-single`).

В режиме списка блоки цен из мини-карточки (`.product-price-container`, `.product-cash-price-container`, `.old-price-container`) скрыты:

```css
#products-grid.products-list-view .product-price-container,
#products-grid.products-list-view .product-cash-price-container,
#products-grid.products-list-view .old-price-container { display: none !important; }
```

Вместо них строится своя разметка:

### Порядок (сверху вниз)

1. **Старая цена** (только при скидке):  
   `.product-list-old-price` — зачёркнутая серая, **14px**, `color: var(--text-hint)`.
2. **Цена по карте:**  
   `.product-list-card-price` — **18px**, bold, цвет **#E35E45**, + иконка карты (SVG 20×20).
3. **Цена наличными** (если есть):  
   `.product-list-cash-price` — **17px**, цвет **#00A82E**, + иконка наличных.

Для товара **«на продажу»**: одна строка `.product-list-price-single` — **18px**, bold, `color: var(--text-primary)`.

### Переходы строк и расположение

- Контейнер цен:  
  `.product-list-prices` — `display: flex; flex-direction: column; gap: 4px` (каждая цена — отдельная строка).
- Справа от цен — корзина и статус (`.product-list-right-side`).

---

## 5. Страница товара (#product-page)

**Файл:** `webapp/js/handlers/products_modal.js`  
Блок цен заполняется так:

```js
const productPagePriceContainer = document.getElementById('product-page-price-container');
productPagePriceContainer.innerHTML = renderProductPricesBlock(prod);
```

То есть используется тот же HTML, что и на мини-карточке: обёртка `.prices-wrap` и внутри блоки наличных и карты (порядок тот же: сначала наличные, потом карта; для «на продажу» — одна строка).

### Разметка страницы (порядок блоков в `index.html`)

Внутри `.product-page-content`:

1. `#product-page-image`
2. `#product-page-hot-offer-control`
3. `#product-page-edit-control`
4. `#product-page-name` — название
5. `#product-page-description` — описание
6. **`#product-page-price-container`** — контейнер цен (сюда вставляется `renderProductPricesBlock(prod)`)
7. `#product-page-quantity` — количество/«Под заказ»/«Покупка»
8. `#product-page-reservation-status` / `#product-page-reservation-button`

### Переходы строк

- Контейнер:  
  `#product-page-price-container.product-page-price-container` —  
  `display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 16px`.
- Внутри снова идут блоки наличных и карты (каждый на своей строке).

### Размеры и цвета на странице товара

| Элемент | Стили |
|---------|--------|
| `.product-page-price-container .product-price` | **28px**, font-weight **700**. |
| `.product-page-price-container .prices--has-cash .product-price` | **#E35E45**. |
| `.product-page-price-container .prices--no-cash .product-price` | **#00A82E**. |
| `.product-page-price-container .old-price` | **20px**, зачёркнутая, `color: var(--text-hint)`. |
| Иконки карты/наличных | те же цвета (E35E45 / 00A82E) в зависимости от `.prices--has-cash` / `.prices--no-cash`. |

---

## 6. Bottom sheet на странице товара (добавить в корзину)

**Файл:** `webapp/js/handlers/products_modal.js`  
Цена в шапке bottom sheet:

```js
const productPrice = sheetContent.querySelector('.cart-bottom-sheet-product-price');
// ...
productPrice.textContent = priceDisplay;  // getProductPriceDisplay(product)
```

В CSS:  
`.cart-bottom-sheet-product-price { display: none; }` — то есть по умолчанию строка с ценой в bottom sheet скрыта.

---

## 7. Корзина (cart)

**Файлы:** `webapp/js/cart/cartNew.js`, стили в `webapp/css/style.css`.

- Цена по позиции: используется форматирование из утилит цен; при скидке показывается старая цена в блоке `.cart-item-old-price` (**12px**, зачёркнутая, `var(--text-hint)`).
- Итог в футере: `.cart-checkout-price`, `.cart-checkout-old-price` (при скидке) — **15px** и **12px**, белый текст на кнопке.

---

## 8. Заказы, продажи, покупки (операции)

### Списки заказов/продаж/покупок

- **Заказы:** `webapp/js/orders.js` — в карточке заказа выводится, например, `product-price` с `finalPrice` и количеством.
- **Профиль / история:** `webapp/js/profileOrders.js` — строка вида «цена × кол-во шт.» (`.profile-order-price`).
- **Корзина (активная/история):** `webapp/js/cart/cartActive.js`, `webapp/js/cart/cartHistory.js` — `.cart-item-price` в формате «цена × кол-во».

### Детали операции (заказ / продажа / покупка)

**Файл:** `webapp/js/operationsDetail.js`

- Карточка товара в детали: **тот же** блок, что и на витрине —  
  `renderProductInfoBlock(product, { mode: 'operation_detail' })`  
  → внутри вызывается `renderProductPricesBlock(product)`.  
  То есть порядок и состав цен: наличные (если есть), затем карта со старой ценой при скидке; для «на продажу» — одна строка. Цвета и иконки — как на карточке (через те же классы `.prices-wrap`, `.product-price-container`, `.product-cash-price-container`).

- Стили блока цен в детали:  
  `.operation-detail-product-prices` — `display: flex; flex-direction: column; gap: 2px`.  
  Сама разметка цен приходит из `renderProductInfoBlock` (те же классы, что на витрине), поэтому фактические размеры/цвета — общие с карточкой (13px цена по карте, 17px наличные, старый ценник 13px и т.д.).

- Блок «Итого» под карточкой: отдельные строки (Количество, Цена за ед., Сумма/Итого, Скидка, Экономия, Способ оплаты/доставки). Цена за единицу и итог считаются через `getEffectiveUnitPrice(product, paymentMethod)` и форматируются через `formatPrice()`.

---

## 9. Резервации

**Файл:** `webapp/js/reservations.js`  
В коде резерваций отдельного рендера цен нет — показываются списки резервов; при необходимости отображение товара может использовать общие компоненты карточки. Явного отдельного блока «цена» только для резервации в описанных файлах нет.

---

## 10. Сводная таблица: где какая разметка и размеры

| Место | Разметка цен | Порядок | Переходы строк | Размер основной цены | Цвет карта / наличные |
|-------|--------------|---------|-----------------|----------------------|------------------------|
| Витрина (сетка) | `renderProductPricesBlock` | Наличные → Карта (внутри карты: старая → цена → иконка) | Каждый блок — новая строка; внутри строки — в одну линию | 13px (карта), 17px (наличные) | #E35E45 / #00A82E или только #00A82E |
| Витрина (список) | Своя разметка списка | Старая → Карта → Наличные | column, gap 4px | 18px карта, 17px наличные, 14px старая | #E35E45 карта, #00A82E наличные |
| Страница товара | `renderProductPricesBlock` | Как на сетке | column, gap 4px | 28px (основная), 20px старая | Те же (#E35E45 / #00A82E) |
| Детали операции | `renderProductInfoBlock` → `renderProductPricesBlock` | Как на сетке | Как на карточке | Как на карточке (13/17px) | Как на карточке |
| Корзина (позиция) | Своя разметка | Старая + итог по позиции | column, gap 2px | 14px итог, 12px старая | — |
| Корзина (футер) | Кнопка «Оформить» | Цена (и старая при скидке) | В одну строку | 15px / 12px | Белый на кнопке |

---

## 11. Файлы для быстрого поиска

- **Логика цен:** `webapp/js/utils/priceUtils.js`
- **Рендер блока цен и инфо-блока:** `webapp/js/utils/productCardParts.js`
- **Витрина (сетка и список):** `webapp/js/handlers/products_render.js`
- **Страница товара:** `webapp/js/handlers/products_modal.js` (и `#product-page-price-container` в `index.html`)
- **Детали операции:** `webapp/js/operationsDetail.js`
- **Стили цен:** `webapp/css/style.css` (блоки примерно 1261–1270, 1377–1450, 1875–1979, 2737–2771, 7821–7835, 8556–8692, 8971)
