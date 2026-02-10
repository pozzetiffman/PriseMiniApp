# Этап 4: Замена селекторов `[style*="..."]` на классы состояния

Цель: снизить хрупкость CSS, перевести «открыто/закрыто» на классы (`.is-open` / `.is-visible` / `.is-hidden`). Не трогать K1: overlay/backdrop/menu-dropdown/bottom-sheet/safe-area.

---

## A) ТОП-10 самых рискованных/часто используемых `[style*="..."]`

| № | Строки | Селектор (фрагмент) | Назначение |
|---|--------|----------------------|------------|
| 1 | 6852–6909 | `.main-menu-dropdown[style*="display: block"]`, backdrop, content | Открытие меню и backdrop (K1 — не трогать) |
| 2 | 453–546 | `.cart-button[style*="opacity"]`, `[style*="display: none"]`, `:not([style*="display: block"])` | Видимость/состояние кнопки корзины (visible/hidden/disabled) |
| 3 | 9584–9660 | `.cart-bottom-sheet[style*="display: flex"]`, `.product-page-bottom-sheet[style*="display: flex"]` | Открытие bottom-sheet (K1 — не трогать) |
| 4 | 103, 108 | `body:has(.admin-page[style*="display: block"])` | Блокировка body при открытой админке |
| 5 | 2167–2168 | `.modal[style*="display: block"]` | Модалка товара (display flex) |
| 6 | 5606–5607, 4229 | `.admin-page[style*="display: block"]`, `.admin-modal[style*="display: block"]` | Видимость страницы админки и модалки админки |
| 7 | 2270–2318, 3209 | `.product-page[style*="display: block"]`, `#product-page[style*="display: block"]` | Видимость product-page и топ-меню |
| 8 | 3508–3596, 3357–3358 | `.cart-page[style*="display: block"]`, `#cart-page-new[style*="display: block"]` | Видимость страниц корзины |
| 9 | 4945–4960 | `.cart-button[style*="display: block"]` (в @media 480px) | Корзина в узком экране |
| 10 | 7037–7072 | `.profile-button[style*="display: none"]`, `.settings-button`, `.admin-button` | Скрытие пунктов меню (на самом деле .main-menu-item в DOM) |

---

## B) Выбранный батч 1 (3–5 компонентов)

1. **Кнопка избранного** (`.favorites-button`) — один селектор, один файл JS (app.js).
2. **Кнопка переключения вида** (`.card-view-toggle-button`) — один селектор, app.js.
3. **Модалка админки** (`#admin-modal` / `.admin-modal`) — два селектора, admin.js.
4. **Пункты выпадающего меню** (`#menu-item-profile`, `#menu-item-settings`, `#menu-item-admin` → класс `.main-menu-item`) — четыре селектора в CSS (profile/settings/admin), menu.js.
5. **Кнопка корзины** (`.cart-button`) — три состояния: visible / hidden / disabled; много селекторов в CSS, cartUI.js + cartNew.js.

В первом батче реализуем **1–4** (без корзины), чтобы не трогать критичный поток и сложные состояния. Корзину — во втором батче.

---

## C) Схема по компонентам (батч 1)

### 1. Favorites button

- Класс: `.is-visible` (показан) / `.is-hidden` (скрыт). По умолчанию в HTML уже `style="display: none"` — считаем скрытым.
- Вешаем на: `#favorites-button` (сам элемент).
- CSS: заменить `.favorites-button[style*="display: none"]` на `.favorites-button.is-hidden`. Добавить `.favorites-button.is-visible { display: flex; }`, `.favorites-button.is-hidden { display: none; }`.
- JS: в app.js при показе: `favoritesButton.classList.add('is-visible'); favoritesButton.classList.remove('is-hidden'); favoritesButton.style.display = '';` (или оставить `display = 'flex'` для совместимости). При скрытии: `classList.remove('is-visible'); classList.add('is-hidden'); style.display = 'none';` или только классы и убрать style.

### 2. Card view toggle button

- Класс: `.is-visible` (показан).
- Вешаем на: `#card-view-toggle-button`.
- CSS: заменить `.card-view-toggle-button[style*="display: none"]` на `.card-view-toggle-button:not(.is-visible)` или добавить `.card-view-toggle-button.is-visible { display: flex !important; }` и убрать селектор по style.
- JS: app.js при показе: `cardViewToggleButton.classList.add('is-visible'); cardViewToggleButton.style.display = 'flex';` или только класс.

### 3. Admin modal

- Класс: `.is-open` на контейнере модалки.
- Вешаем на: `#admin-modal` / `.admin-modal`.
- CSS: заменить `.admin-modal[style*="display: block"]`, `.admin-modal[style*="display:flex"]` на `.admin-modal.is-open { display: flex !important; }` (или без !important при достаточной специфичности).
- JS: admin.js при открытии: `adminModal.classList.add('is-open'); adminModal.style.display = 'flex';` (style можно оставить как fallback). При закрытии: `classList.remove('is-open'); style.display = 'none';`.

### 4. Пункты меню (profile / settings / admin)

- Класс: `.is-hidden` когда пункт скрыт.
- Вешаем на: `#menu-item-profile`, `#menu-item-settings`, `#menu-item-admin` (у них класс `.main-menu-item`).
- CSS: заменить `.profile-button[style*="display: none"], .settings-button[style*="display: none"], .admin-button[style*="display: none"]` на `.main-menu-item.is-hidden`. Второй блок (стр. 7072) — тоже `.main-menu-item.is-hidden`.
- JS: menu.js в `setupMainMenuButton`: вместо `profileItem.style.display = showProfile ? 'flex' : 'none'` — добавлять/удалять класс `is-hidden` и при необходимости выставлять `style.display` для fallback.

### 5. Cart button (батч 2)

- Классы: `.is-visible` (показан и активен), `.is-hidden` (скрыт), `.is-disabled` (показан, но opacity 0.3, pointer-events: none).
- Вешаем на: `#cart-button`.
- CSS: все селекторы вида `.cart-button[style*="display: none"]`, `:not([style*="display: block"])`, `[style*="opacity: 0.3"]`, `[style*="opacity:1"]` заменить на `.cart-button.is-hidden`, `.cart-button.is-visible`, `.cart-button.is-disabled` с теми же правилами.
- JS: cartUI.js `updateCartButtonVisibility`, cartNew.js — выставлять классы и при необходимости оставить установку style на один релиз как fallback.

---

## D) Таблица изменений CSS (батч 1)

| Файл | Строки | Было | Стало |
|------|--------|------|--------|
| webapp/css/style.css | 286 | `.favorites-button[style*="display: none"]` | `.favorites-button.is-hidden` |
| webapp/css/style.css | 7119 | `.card-view-toggle-button[style*="display: none"]` | `.card-view-toggle-button:not(.is-visible)` (или добавить правило `.is-visible`) |
| webapp/css/style.css | 5606–5607 | `.admin-modal[style*="display: block"], .admin-modal[style*="display:flex"]` | `.admin-modal.is-open` |
| webapp/css/style.css | 4088–4089 | `.admin-page[style*="display: block"], .admin-page[style*="display:flex"]` | (оставляем в батче 1 или вводим .is-visible для страницы — опционально) |
| webapp/css/style.css | 4229 | `.admin-page[style*="display: block"]` (анимация) | `.admin-page.is-visible` (если введём класс страницы) |
| webapp/css/style.css | 7037–7039, 7072 | `.profile-button[style*="display: none"], .settings-button..., .admin-button...` | `.main-menu-item.is-hidden` |
| webapp/css/style.css | 5565 | `.admin-button[style*="display: none"]` | `.main-menu-item.is-hidden` |

Примечание: в батче 1 не меняем body:has(.admin-page), не трогаем main-menu-dropdown и bottom-sheet.

---

## E) Таблица изменений JS (батч 1)

| Файл | Функция/место | Было | Стало |
|------|----------------|------|--------|
| webapp/js/app.js | инициализация, показ кнопки избранного | `favoritesButton.style.display = 'flex'` / `'none'` | Добавить `classList.add('is-visible')` / `classList.add('is-hidden')`, при желании оставить style для fallback |
| webapp/js/app.js | инициализация card view toggle | `cardViewToggleButton.style.display = 'flex'` | `cardViewToggleButton.classList.add('is-visible')`, при желании оставить style |
| webapp/js/admin.js | открытие модалки | `adminModal.style.display = 'flex'` | `adminModal.classList.add('is-open')` + style |
| webapp/js/admin.js | закрытие модалки | `adminModal.style.display = 'none'` | `adminModal.classList.remove('is-open')` + style |
| webapp/js/menu.js | setupMainMenuButton | `profileItem.style.display = showProfile ? 'flex' : 'none'` (и settings, admin) | Добавить/удалять `is-hidden` у profileItem, settingsItem, adminItem; при желании оставить style |

---

## F) Метрики (после батча 1)

- Было `[style*]` в style.css: **79** (grep `[style\s*\*=`).
- Стало: **70**.
- Снято: **9** (цель этапа — минус 20+ за счёт следующих батчей: корзина, страницы и т.д.).

---

## G) Коммит и регрессия

- Коммит: `refactor(css): replace style-attribute selectors with state classes (stage 4 batch 1)`
- Регрессия: главная (кнопки избранного, переключение вида), открытие/закрытие меню (пункты профиль/настройки/админка), открытие/закрытие модалки админки, кликабельность меню и backdrop, без изменений в bottom-sheet и меню dropdown.

---

## Выполненные правки (батч 1)

- **CSS:** замены для `.favorites-button`, `.card-view-toggle-button`, `.admin-modal`, `.main-menu-item` (вместо `.profile-button`/`.settings-button`/`.admin-button` по `[style*="display: none"]`). Добавлены классы `.is-visible`, `.is-hidden`, `.is-open`.
- **JS:** app.js (favorites + card-view-toggle), menu.js (profile/settings/admin items), admin.js (admin modal close). Inline-стили оставлены как fallback.
- **HTML:** у `#favorites-button` добавлен класс `is-hidden` по умолчанию.
