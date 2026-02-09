# Кнопка «К оформлению» на странице корзины — полное устройство

На странице корзины (**cart-page-new**) нижняя панель с кнопкой оформления — это **не** Bottom Sheet (как на product-page или избранном), а **фиксированный футер** (`#cart-new-footer`) с одной кнопкой. Позиционирование — overlay над контентом, визуально над нижним меню.

---

## 1. HTML-структура

```html
<!-- index.html: внутри #cart-page-new -->
<div id="cart-page-new" class="cart-page" style="display: none;">
    <div class="cart-new-top-menu">...</div>
    <div class="cart-page-content">
        <div id="cart-new-items">...</div>
        <div id="cart-new-summary">...</div>
    </div>

    <!-- Футер с кнопкой — вне .cart-page-content, на одном уровне с контентом -->
    <div id="cart-new-footer" class="cart-new-footer" style="display: none;">
        <button id="cart-new-checkout-btn" class="cart-checkout-btn">
            <span id="cart-footer-count-text" class="cart-checkout-count">0 товаров</span>
            <span class="cart-checkout-label">к оформлению</span>
            <span id="cart-footer-total-amount" class="cart-checkout-price">0₽</span>
            <span id="cart-footer-old-price" class="cart-checkout-old-price" style="display: none;"></span>
        </button>
    </div>
</div>
```

- **#cart-new-footer** — контейнер панели (position: fixed).
- **#cart-new-checkout-btn** — кнопка «К оформлению».
- Футер по умолчанию скрыт (`display: none`), показывается через JS при наличии товаров.

---

## 2. Позиционирование (CSS)

### 2.1. Базовые стили футера (`.cart-new-footer`)

| Свойство | Значение | Назначение |
|----------|----------|------------|
| `position` | `fixed` | Overlay относительно viewport |
| `bottom` | `0` | Базовое значение (переопределяется для #cart-page-new) |
| `left` | `0` | На всю ширину |
| `right` | `0` | На всю ширину |
| `z-index` | `400` | Ниже меню (10010), над контентом |
| `--menu-height` | `64px` | Переменная для расчёта отступа от меню |

Остальное:
- фон: `var(--bg-glass)`, `backdrop-filter`
- рамка сверху, тень, padding: 8px 16px сверху, снизу max(6px, 6px + safe-area)
- `display: flex`, `flex-direction: column`, `gap: 8px`

### 2.2. Переопределение только для корзины

**Футер:** всегда `bottom: 0` (без расчёта от menu-height).

```css
#cart-page-new .cart-new-footer {
    bottom: 0;
}
```

**Кнопка:** вертикальный отступ от меню задаётся через `margin-bottom` (чтобы визуальный уровень совпадал с product-page и favorites).

**Desktop (по умолчанию):**

```css
#cart-page-new .cart-checkout-btn {
    margin-bottom: calc(
        var(--menu-height, 64px)
        + 10px
        + var(--tg-safe-area-inset-bottom, 0px)
    );
}
```

**Mobile (≤768px):**

```css
@media (max-width: 768px) {
    #cart-page-new .cart-checkout-btn {
        margin-bottom: calc(
            var(--menu-height, 64px)
            + 4px
            + var(--tg-safe-area-inset-bottom, 0px)
        );
    }
}
```

- На мобильных зазор между кнопкой и меню **4px**.

### 2.3. Контент корзины (чтобы не уезжал под футер)

```css
#cart-page-new .cart-page-content {
    padding-bottom: calc(
        var(--menu-height, 64px)
        + 40px
        + var(--tg-safe-area-inset-bottom, 0px)
    );
    /* ... */
    background: transparent; /* фон у #cart-page-new */
}
```

- Стандарт проекта: **menu-height + 40px + safe-area** (без учёта высоты кнопки, кнопка — overlay).

---

## 3. Схема по вертикали

```
  ↑ top
  │
  │  ┌─────────────────────────────────────┐
  │  │  .cart-new-top-menu (фикс. шапка)     │
  │  └─────────────────────────────────────┘
  │  ┌─────────────────────────────────────┐
  │  │  .cart-page-content                 │
  │  │  (список, summary)                   │
  │  │  padding-bottom: menu + 40px + safe   │
  │  ├─────────────────────────────────────┤
  │  │  #cart-new-footer (position: fixed)  │  z-index: 400, bottom: 0
  │  │  [ К оформлению ] margin-bottom:      │  ← отступ от меню на кнопке
  │  │    menu + 10px/4px + safe             │
  │  ├─────────────────────────────────────┤
  │  │  header (нижнее меню)                │  z-index: 10010
  │  │  bottom: 0                           │
  │  └─────────────────────────────────────┘
  ↓ bottom
```

---

## 4. Устройство кнопки «К оформлению» (полностью)

### 4.1. HTML

Кнопка — единственный дочерний элемент футера. Внутри — четыре `<span>` (счётчик, подпись, сумма, старая цена).

```html
<button id="cart-new-checkout-btn" class="cart-checkout-btn">
    <span id="cart-footer-count-text" class="cart-checkout-count">0 товаров</span>
    <span class="cart-checkout-label">к оформлению</span>
    <span id="cart-footer-total-amount" class="cart-checkout-price">0₽</span>
    <span id="cart-footer-old-price" class="cart-checkout-old-price" style="display: none;"></span>
</button>
```

| Элемент | id | Класс | Назначение |
|--------|----|-------|------------|
| Кнопка | `cart-new-checkout-btn` | `cart-checkout-btn` | Контейнер, клик |
| Счётчик | `cart-footer-count-text` | `cart-checkout-count` | «N товаров» |
| Подпись | — | `cart-checkout-label` | «к оформлению» |
| Сумма | `cart-footer-total-amount` | `cart-checkout-price` | «0₽» |
| Старая цена | `cart-footer-old-price` | `cart-checkout-old-price` | Зачёркнутая при скидке |

---

### 4.2. CSS — сама кнопка (`.cart-checkout-btn`)

| Свойство | Значение | Назначение |
|----------|----------|------------|
| `width` | `100%` | На всю ширину футера |
| `padding` | `12px 16px` | Внутренние отступы |
| `background` | `linear-gradient(135deg, rgba(90,200,250,0.75), rgba(90,200,250,0.55))` | Градиент фона |
| `border` | `1px solid rgba(90, 200, 250, 0.4)` | Рамка |
| `border-radius` | `16px` | Скругление |
| `color` | `#ffffff` | Цвет текста |
| `font-size` | `16px` | Размер шрифта кнопки |
| `font-weight` | `700` | Жирный |
| `cursor` | `pointer` | Курсор |
| `transition` | `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)` | Плавность |
| `box-shadow` | `0 4px 16px rgba(90, 200, 250, 0.25)` | Тень |
| `display` | `flex` | Flex-контейнер |
| `align-items` | `center` | Вертикальное выравнивание |
| `justify-content` | `space-between` | Элементы по краям и между |
| `gap` | `6px` | Расстояние между span |
| `flex-wrap` | `nowrap` | В одну строку |
| `white-space` | `nowrap` | Текст не переносится |
| `overflow` | `hidden` | Обрезка при переполнении |
| `min-width` | `0` | Чтобы flex сжимался |

**Только на странице корзины** (`#cart-page-new .cart-checkout-btn`):

- `margin-bottom: calc(var(--menu-height, 64px) + 10px + var(--tg-safe-area-inset-bottom, 0px));` — отступ от нижнего меню (desktop).

**Mobile (≤768px)** (`#cart-page-new #cart-new-checkout-btn`):

- `margin-bottom: calc(var(--menu-height, 64px) + 4px + var(--tg-safe-area-inset-bottom, 0px));` — меньший зазор.

**Состояния:**

- **:hover** — более яркий градиент, тень сильнее, `transform: translateY(-2px)`.
- **:active** — `transform: translateY(0) scale(0.98)`.

---

### 4.3. CSS — внутренние span

| Класс | Назначение | Типичные стили |
|-------|------------|----------------|
| `.cart-checkout-count` | Количество выбранных | font-size: 12px, font-weight: 600, white-space: nowrap, flex-shrink: 0 |
| `.cart-checkout-label` | «к оформлению» | font-size: 12px, font-weight: 500, opacity: 0.8 |
| `.cart-checkout-price` | Итоговая сумма | font-size: 15px, font-weight: 700 |
| `.cart-checkout-old-price` | Старая цена при скидке | font-size: 12px, text-decoration: line-through, opacity: 0.6 |

У всех: `color: #ffffff`, `white-space: nowrap`, `flex-shrink: 0` (кроме кнопки, у неё `min-width: 0`).

---

### 4.4. JS (cartNew.js)

- **Показ футера с кнопкой:** в `renderCart()` при `items.length > 0` у `#cart-new-footer` ставится `display: 'flex'`, иначе `'none'`.
- **Текст кнопки:** `updateCartFooter()` обновляет:
  - `#cart-footer-count-text` — «N товар / товара / товаров» (по выбранным);
  - `#cart-footer-total-amount` — сумма по выбранным в формате «0₽»;
  - `#cart-footer-old-price` — при скидке показывается старая сумма, иначе `display: none`.
- **Клик:** на `#cart-new-checkout-btn` один обработчик — заглушка `alert('Оформление заказа будет реализовано позже')`.

---

## 5. Логика в JS (cartNew.js)

### Показ/скрытие футера

- В **renderCart()**: при `items.length > 0` — `cartFooter.style.display = 'flex'`, иначе `cartFooter.style.display = 'none'`.
- Футер виден только когда в корзине есть хотя бы один товар.

### Обновление текста кнопки

- **updateCartFooter()** вызывается после рендера и при изменениях выбора:
  - `cart-footer-count-text` — количество выбранных и слово «товар/товара/товаров».
  - `cart-footer-total-amount` — сумма по выбранным.
  - `cart-footer-old-price` — показывается при скидке, иначе скрыт.

### Клик по кнопке

- На **#cart-new-checkout-btn** висит один обработчик: пока заглушка `alert('Оформление заказа будет реализовано позже')`.

---

## 6. Сводка формул

| Что | Формула |
|-----|--------|
| **bottom футера** | `0` (всегда) |
| **margin-bottom кнопки (desktop)** | `calc(var(--menu-height, 64px) + 10px + var(--tg-safe-area-inset-bottom, 0px))` |
| **margin-bottom кнопки (mobile ≤768px)** | `calc(var(--menu-height, 64px) + 4px + var(--tg-safe-area-inset-bottom, 0px))` |
| **padding-bottom контента** | `calc(var(--menu-height, 64px) + 40px + var(--tg-safe-area-inset-bottom, 0px))` |

- **vh** и отрицательные отступы не используются.
- Фон страницы у внешнего контейнера **#cart-page-new**, у контента — `background: transparent`.
