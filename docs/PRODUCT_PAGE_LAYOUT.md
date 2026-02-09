# Структура страницы товара (Product Page)

Полное описание разметки и порядка элементов страницы товара `#product-page`.

---

## 1. Общая структура (порядок сверху вниз)

Страница товара — это **фиксированный полноэкранный слой** (`position: fixed; inset: 0; z-index: 1000`), внутри которого элементы идут в таком порядке:

```
#product-page
├── 1. product-new-top-menu          ← фиксированный хедер (при скролле остаётся на месте)
├── 2. product-page-content          ← прокручиваемый контент
│   ├── product-page-image
│   ├── product-page-hot-offer-control
│   ├── product-page-edit-control
│   ├── product-page-name
│   ├── product-page-description
│   ├── product-page-price-container
│   ├── product-page-quantity
│   ├── product-page-reservation-status
│   └── product-page-reservation-button
└── 3. product-page-bottom-sheet     ← нижняя панель (для клиентов; фиксирована внизу)
```

---

## 2. Элементы по порядку

### 2.1. Верхнее меню (фиксированное)

**Класс:** `product-new-top-menu`  
**Позиция:** `position: fixed`, верх экрана, `z-index: 400`. При прокрутке контента меню остаётся на месте; при скролле вниз получает класс `scrolled` (фон + blur).

| Элемент | ID / класс | Назначение |
|--------|------------|------------|
| Кнопка «Назад» | `#product-page-close` / `.product-top-menu-close` | Закрыть страницу товара (←) |
| Центр заголовка | `.product-top-menu-title-container` | Пустой блок для центрирования |
| Кнопка избранное | `#product-top-menu-favorite` / `.product-top-menu-favorite` | Сердечко (показывается только клиентам, через JS) |

Порядок в меню: **слева** — закрыть, **по центру** — пусто, **справа** — избранное.

---

### 2.2. Контент (прокручиваемая область)

**Класс:** `product-page-content`  
**Поведение:** вертикальный скролл, `max-width: 600px`, по центру. Верхний отступ компенсирует высоту фиксированного меню; нижний — под bottom sheet.

Элементы внутри идут **строго в таком порядке**:

---

#### ① Блок изображения

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Контейнер фото | `#product-page-image` | `product-page-image` | Слайдер фото (или плейсхолдер). Внутри могут быть: `.product-slider`, слайды, индикатор точек, бейджи «Горячее предложение» / «Скрыт». |

- Ширина на весь экран (`100vw`), скругление только снизу (`border-radius: 0 0 20px 20px`).
- Соотношение сторон: `aspect-ratio: 3/3.4`.
- Подгружается через `showProductPageImage()` в `products_modal.js`.

---

#### ② Горячее предложение и скрытие (админ)

| Элемент | ID | Видимость |
|--------|----|------------|
| Блок переключателей | `#product-page-hot-offer-control` | Показывается только админу: «Горячее предложение» (вкл/выкл), «Скрыт» (вкл/выкл). |

По умолчанию `display: none`; при открытии страницы админом заполняется и показывается через JS.

---

#### ③ Кнопки редактирования (админ)

| Элемент | ID | Видимость |
|--------|----|------------|
| Блок кнопок | `#product-page-edit-control` | Только для админа: «Редактировать», «Продано», «Удалить». |

По умолчанию `display: none`; при роли админа показывается как `display: flex`, внутри — кнопки в ряд.

---

#### ④ Название товара

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Название | `#product-page-name` | `product-page-name` | Текст: `prod.name`. |

Стиль: крупный шрифт (24px), жирный.

---

#### ⑤ Описание

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Описание | `#product-page-description` | `product-page-description` | Текст: `prod.description`. Если пусто — блок скрыт (`display: none`). |

Стиль: 16px, цвет вторичного текста, `pre-wrap`, перенос длинных слов.

---

#### ⑥ Блок цен

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Контейнер цен | `#product-page-price-container` | `product-page-price-container` | HTML от `renderProductPricesBlock(prod)` из `productCardParts.js`. |

**Порядок внутри блока цен (по ТЗ):**

1. **Наличные** (если есть): сумма + иконка наличных, зелёный акцент (`.prices--no-cash` для карты или общий `.prices--has-cash`).
2. **Карта**: цена + иконка карты; при скидке — старая цена зачёркнута. Красный акцент, если есть и наличные, и карта (`.prices--has-cash`).

Классы обёртки: `prices-wrap`, плюс `prices--has-cash` или `prices--no-cash`.

---

#### ⑦ Количество / наличие

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Блок количества | `#product-page-quantity` | `product-page-quantity` | Текст вроде «От N шт», «Покупка», «Под заказ», «В наличии: N из M», «В наличии» и т.п. в зависимости от типа товара и резервов. |

По умолчанию скрыт; показывается при необходимости через JS.

---

#### ⑧ Статус резервации

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Статус резерва | `#product-page-reservation-status` | `product-page-reservation-status` | Текст о том, что товар зарезервирован (например: «Зарезервировано: N из M до …»). |

По умолчанию скрыт; при активных резервациях показывается и заполняется.

---

#### ⑨ Кнопки резервации

| Элемент | ID | Класс | Содержимое |
|--------|----|--------|------------|
| Контейнер кнопок | `#product-page-reservation-button` | `product-page-reservation-button` | Кнопки «Зарезервировать» / «Отменить резерв» и т.п. (заполняются через JS). |

Может быть пустым; при необходимости в него добавляются кнопки.

---

### 2.3. Bottom Sheet (нижняя панель)

**ID:** `#product-page-bottom-sheet`  
**Классы:** `cart-bottom-sheet`, `product-page-bottom-sheet`  
**Видимость:** по умолчанию `display: none`. Показывается только **клиентам** (`appContext.role === 'client'`); админам не показывается.

Структура:

```
#product-page-bottom-sheet
├── .cart-bottom-sheet-backdrop
└── .cart-bottom-sheet-content
    ├── .cart-bottom-sheet-handle
    ├── .cart-bottom-sheet-header
    │   └── .cart-bottom-sheet-product
    │       ├── .cart-bottom-sheet-product-image
    │       └── .cart-bottom-sheet-product-info
    │           ├── .cart-bottom-sheet-product-name
    │           └── .cart-bottom-sheet-product-price
    └── .cart-bottom-sheet-body
        └── .cart-bottom-sheet-actions-row
            ├── .cart-bottom-sheet-actions
            │   ├── #product-page-bottom-sheet-primary-btn   («Купить сейчас»)
            │   └── #product-page-bottom-sheet-secondary-btn («Продать сейчас», по умолчанию скрыт)
            └── .cart-bottom-sheet-quantity-controls
                ├── кнопка −
                ├── input (количество)
                └── кнопка +
```

Содержимое (изображение, название, цена, количество) заполняется в `updateProductPageBottomSheet(product)` в `products_modal.js`.

---

## 3. Порядок заполнения при открытии страницы

В `showProductModal()` (products_modal.js) элементы заполняются в таком порядке:

1. Прокрутка страницы в верх.
2. Изображения: `showProductPageImage(0)`.
3. Хот-оффер и скрытие (админ): `#product-page-hot-offer-control`.
4. Кнопки редактирования (админ): `#product-page-edit-control`.
5. Название: `#product-page-name`.
6. Описание: `#product-page-description`.
7. Цены: `#product-page-price-container` ← `renderProductPricesBlock(prod)`.
8. Количество: `#product-page-quantity`.
9. Резервация: `#product-page-reservation-status`, `#product-page-reservation-button`.
10. Кнопка «Избранное» в шапке (или на изображении — по текущей реализации).
11. Bottom sheet: `updateProductPageBottomSheet(prod)`.

---

## 4. Z-index и позиционирование

| Элемент | Z-index / позиция |
|--------|--------------------|
| `#product-page` | `z-index: 1000`, `position: fixed`, `inset: 0` |
| Фон страницы (::before) | `z-index: 0` |
| `.product-page-content` | `z-index: 2` |
| `.product-page-image` | `z-index: 3` |
| `.product-new-top-menu` | `z-index: 400`, `position: fixed` |
| Bottom sheet | Фиксирован внизу внутри `#product-page` |

---

## 5. Файлы, где задаётся разметка и логика

- **Разметка:** `webapp/index.html` — блок `#product-page` и вложенные div’ы.
- **Стили:** `webapp/css/style.css` — от `.product-page` до `.product-page-bottom-sheet` и связанные классы.
- **Логика открытия/заполнения:** `webapp/js/handlers/products_modal.js` — `showProductModal()`, `showProductPageImage()`, `updateProductPageBottomSheet()`, `closeProductPage()`.
- **Блок цен:** `webapp/js/utils/productCardParts.js` — `renderProductPricesBlock(prod)`.

Если нужно изменить порядок или состав элементов на странице товара, править в первую очередь: `index.html` (структура), `style.css` (расположение и отступы), `products_modal.js` (заполнение и видимость).

---

## 6. Вид страницы товара для админа (расположение кнопок и тумблеров)

Для **владельца магазина** (`appContext.role === 'owner'` и `prod.user_id === appContext.shop_owner_id`) на странице товара отображаются дополнительные блоки: тумблеры «Горящее предложение» / «Скрыт» и кнопки «Редактировать», «Продан», «Удалить». Нижняя панель (bottom sheet) **не показывается** админу.

Схема расположения (сверху вниз):

```
┌─────────────────────────────────────────────────────────────┐
│  product-new-top-menu (фиксированный хедер)                 │
│  [ ← ]              (пусто)                    (избранное  │
│   закрыть                                              скрыто для админа)
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  product-page-image                                         │
│  (слайдер фото, бейджи «Горячее» / «Скрыт» поверх фото)     │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  #product-page-hot-offer-control (только для админа)         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔥 Горящее предложение                    [====○]   │   │  ← тумблер .toggle-switch
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👁️ Виден клиентам / 👁️‍🗨️ Скрыт от клиентов  [====○]   │   │  ← тумблер .toggle-switch
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  #product-page-edit-control (только для админа)              │
│  [ ✏️ Редактировать ]  [ ✅ Продан ]  [ 🗑️ Удалить ]        │   ← кнопки в ряд, gap: 8px
│  («Продан» показывается только если товар НЕ is_for_sale)    │
└─────────────────────────────────────────────────────────────┘
│  #product-page-name          Название товара                │
│  #product-page-price-container   Цены (наличные / карта)     │
│  #product-page-delivery       Доставка                       │
│  #product-page-reviews        Отзывы                         │
│  О товаре / #product-page-description                        │
│  Все характеристики / #product-page-specs-content           │
│  #product-page-quantity       Количество / наличие           │
│  #product-page-reservation-status / #product-page-reservation-button
└─────────────────────────────────────────────────────────────┘
  (bottom sheet для админа не отображается)
```

### Детали блоков для админа

| Блок | Расположение | Содержимое |
|------|--------------|------------|
| **Горящее предложение** | Первая карточка в `#product-page-hot-offer-control` | Слева: иконка 🔥 + текст «Горящее предложение». Справа: тумблер (`.toggle-switch`, 50×28px). Вкл/выкл — `prod.is_hot_offer`. |
| **Скрыт от клиентов** | Вторая карточка в `#product-page-hot-offer-control` | Слева: иконка 👁️ или 👁️‍🗨️ + «Виден клиентам» / «Скрыт от клиентов». Справа: тумблер. Вкл/выкл — `prod.is_hidden`. |
| **Кнопки управления** | `#product-page-edit-control` | Flex-ряд: **✏️ Редактировать** (голубой акцент), **✅ Продан** (зелёный, только если не C2C), **🗑️ Удалить** (красный акцент). `flex-wrap: wrap`, `gap: 8px`. |

Тумблеры — общий компонент `.toggle-switch`: ширина 50px, высота 28px, круглый ползунок; включённое состояние — цвет кнопки темы Telegram (`--tg-theme-button-color`).
