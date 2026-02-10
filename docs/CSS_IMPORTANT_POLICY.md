# Политика использования `!important` в CSS (этап 3.3)

Файл: `webapp/css/style.css`.  
Цель: зафиксировать правила, чтобы не ломать UI при дальнейшем рефакторинге.

---

## 1. Классификация K1 / K2 / K3

| Категория | Описание | Действие |
|-----------|----------|----------|
| **K1** | Критичные правила: safe-area, fixed-панели, overlays/backdrop, z-index, pointer-events, телеграмные override, видимость страниц по .is-active. | **Не трогать** без явной причины. |
| **K2** | Правила со средней специфичностью или возможным конфликтом (например, display в модалках/страницах). | Удалять `!important` только при подтверждённом усилении селектора/порядка. |
| **K3** | Селектор уже сильный (#id + .class, контекст страницы) и правило — типографика/цвет/фон/отступы/косметика внутри страницы. | Допустимо **безопасно убирать** `!important` батчами (K3-only). |

---

## 2. K1 whitelist — где `!important` допустим

- **Safe-area и отступы:** `--tg-safe-area-inset-*`, `padding-bottom`/`height` с `var(--tg-safe-area-inset-bottom)`, `--edit-product-bottom-gap`, `content`/`display`/`height` у псевдоэлементов для bottom gap.
- **Fixed-панели и меню:** `header` (position: fixed, z-index, pointer-events), нижнее меню, `.main-menu-dropdown`, `.main-menu-dropdown-backdrop` (z-index, pointer-events, opacity, transform).
- **Overlays / backdrop:** bottom-sheet, cart-bottom-sheet, product-page-bottom-sheet, backdrop (background, backdrop-filter, pointer-events).
- **Видимость страниц:** `#page.is-active`, `.page.is-active` с `display: block` (источник истины после этапа 4).
- **Кнопки корзины/избранного в header:** `.cart-button`, `.cart-button.is-visible`, `.cart-button.is-disabled` (display, opacity, pointer-events) в контексте header.
- **Телеграмная среда:** переопределения в `body`, `html`, корень WebApp, блоки `.min-app` для тем/ориентации.
- **Скрытие от экранных читалок:** визуально скрытые элементы (position: absolute, left: -9999px, opacity: 0, pointer-events: none).
- **Dropdown/фильтры:** position: fixed, z-index, overflow: visible, pointer-events в контексте выпадающих списков.

---

## 3. Правило добавления `!important`

- Добавлять **только** при подтверждённом конфликте специфичности (например, инлайн-стили или более поздние правила перебивают нужное поведение).
- Сначала пытаться: усилить селектор, изменить порядок правил, вынести в более специфичный контекст (#page-id .block).
- Не добавлять «на всякий случай».

---

## 4. Проверка регрессии после правок

- **Главная:** сетка/список товаров, бейджи, цены, кнопка корзины.
- **Product-page:** фото, кнопки, цены, «Купить/Заказать/Резерв», верхнее меню.
- **Корзина (cart-page-new):** список, цены, footer, bottom gap.
- **Избранное:** список, переход в карточку товара.
- **Профиль / Настройки / Админка:** навигация, контент, вкладки.
- **Edit-product:** нижний отступ (safe-area + gap) не сломан.
- **Меню (dropdown):** открытие/закрытие, backdrop, кликабельность.

После батча K3-only: визуал и поведение должны остаться 1:1.
