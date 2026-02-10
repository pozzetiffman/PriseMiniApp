# Правила дизайн-системы и стилей

Короткие правила, примеры и чеклисты для единообразной работы со стилями. Язык: русский.

---

## 1. Архитектура CSS после рефакторинга

- **Точка входа:** `webapp/css/style.css` — **только** импорты и комментарии секций. Реальные правила в нём не добавлять.
- **Секции в порядке:** TOKENS → BASE → LAYOUT → COMPONENTS → MODALS/OVERLAYS → PAGES → ADMIN.
- **Все стили** лежат в `webapp/css/modules/*.css`.

**Куда вносить правки:**

| Область | Файл(ы) |
|--------|---------|
| Страница редактирования товара | `41-edit-product-page.css` |
| Bottom-sheets, overlays, модалки, меню | `30-modals-overlays.css` |
| Product page: структура, top-menu, контент | `40-product-page-core.css` |
| Product page: слайдер, точки | `41-product-page-slider.css` |
| Product page: цены | `42-product-page-prices.css` |
| Product page: delivery, reviews, about, specs | `43-product-page-sections.css` |
| Product page: toast, анимации | `44-product-page-toast-anim.css` |
| Админка: страница, header, content | `90-admin-core.css` |
| Админка: каркас модалок | `91-admin-modals-core.css` |
| Админка: product modal UI | `92-admin-modals-product-modal.css` |
| Админка: табы | `93-admin-modals-tabs.css` |
| Админка: формы, оверрайды | `94-admin-modals-forms.css` |
| Админка: статистика, списки | `92-admin-stats-lists.css` |

---

## 2. Deprecated-модули — не использовать

- **`40-product-page.css`** и **`91-admin-modals.css`** — заглушки после сплита (Stage 7). Контент перенесён в подмодули (40-*-core, 41-*-slider, … и 91-*-core, 92-*-product-modal, …).
- **Не импортировать** эти файлы и **не добавлять** в них стили. В `style.css` они не подключены; CI падает при их импорте (Stage 9).

---

## 3. Каскад и специфичность

- **Минимизировать `!important`.** Допустимые случаи:
  - K1: safe-area, фиксированные панели, overlay z-index, переопределения стилей Telegram (например, кнопки/цвета в WebApp).
- **Селекторы `[style*="..."]`** — не добавлять новые. Существующие K1 оставить; использовать только если иначе достичь результата нельзя.
- **При конфликте:** сначала порядок импортов и селекторы, затем при необходимости `!important`.

**Чеклист перед добавлением !important:**  
□ Уже пробовал усилить селектор / перенести правило в более поздний модуль?  
□ Это именно overlay/fixed/safe-area или Telegram override?

---

## 4. Токены (CSS-переменные)

- **Цвета, фоны, акценты** задавать через токены из `00-tokens.css`. Новые хардкод-цвета (#hex, rgb без переменной) — только при обоснованной причине (например, фиксированный цвет для конкретного контраста).

**Примеры:**
- Цена наличными: `color: var(--color-price-cash);`
- Цена картой: `color: var(--color-price-card);`
- Акцент (с прозрачностью): `rgba(var(--color-accent-rgb), 0.2)`
- Фон стекла: `background: var(--bg-glass);`, `var(--bg-glass-light)`
- Текст: `var(--text-primary)`, `var(--text-secondary)`, `var(--text-hint)`

Добавление нового токена — в `00-tokens.css` в блоке `:root`.

---

## 5. Визуальный язык (Glass / Liquid)

- **Фон:** полупрозрачные фоны + `backdrop-filter: var(--blur-small)` / `var(--blur-medium)` / `var(--blur-large)`.
- **Тени:** `var(--shadow-light)`, `var(--shadow-medium)`, `var(--shadow-glass)`.
- **Скругления:** типично 12px, 16px, 24px для блоков и модалок.
- **Контраст текста:** основной — `var(--text-primary)`, вторичный — `var(--text-secondary)`, подсказки — `var(--text-hint)`.

**Отступы:** базовые паттерны 8px, 12px, 16px (gap, padding, margin). Для крупных блоков — 20px, 24px.

**Типографика:** размеры и веса через переменные и токены; не плодить магические числа (например, 14px/16px/18px для текста, 600/700 для заголовков).

**Интерактивность:**
- Hover/active — плавные переходы, лёгкое изменение фона/тени.
- Focus: предпочтительно `:focus-visible` для доступности.
- Tap: `-webkit-tap-highlight-color: transparent` где нужно.
- Disabled/loading: снижение opacity, cursor, при необходимости pointer-events.

---

## 6. Safe-area (Telegram WebApp)

- Использовать переменные **`--tg-safe-area-inset-top`**, **`--tg-safe-area-inset-bottom`** (и при необходимости `--tg-content-safe-area-inset-top`).
- Формула отступа: `calc(базовый_отступ + var(--tg-safe-area-inset-bottom, 0px))` (аналогично для top).

**Когда добавлять:**
- Фиксированные панели снизу/сверху (header, footer, нижнее меню).
- Формы с кнопками действий внизу — `padding-bottom` контейнера с учётом safe-area, чтобы контент не уходил под «островок» или индикатор жестов.

**Пример для фиксированной панели снизу:**
```css
.container {
    padding-bottom: calc(80px + var(--tg-safe-area-inset-bottom, 0px));
}
```

**Пример для fullscreen-страницы с верхним отступом:**
```css
.page {
    padding-top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px) + 12px);
}
```

---

## 7. Как добавлять новую страницу или компонент

- **Новая страница (PAGES):** создать файл в `webapp/css/modules/`, например `4X-название-page.css`. Подключить в `style.css` в блоке `/* PAGES */` **после** существующих page-модулей, сохраняя порядок (product-page подмодули → edit-product → cart → checkout → favorites → operations). Не ломать каскад: не ставить стили новой страницы перед более общими.
- **Новый компонент общего назначения:** в `20-components.css` или новый модуль в `modules/` при большом объёме; импорт в нужной секции (COMPONENTS или свой блок).
- **Админка:** новый контент — в соответствующий admin-модуль (core / modals-core / product-modal / tabs / forms / stats-lists). Новый файл при необходимости — в блоке `/* ADMIN */` после 90–94 и перед `92-admin-stats-lists.css`.
- **Именование:** префикс по типу (страница — `*-page.css`, компонент — по смыслу). Не использовать имена deprecated-файлов.

---

## 8. Чеклист PR по стилям

- [ ] **Локально:** `npm run check:css` — проходит (нет импорта deprecated, в style.css только импорты и комментарии, порядок секций).
- [ ] **Локально:** `npm run lint:css` — без ошибок (см. Stage 11).
- [ ] **Ручной sanity:** Главная (сетка/список, цены, корзина) → Product page (меню, слайдер, цены, секции, toast) → Overlays (меню, bottom-sheets) → Admin (модалки, табы, формы) → Edit product (отступы, кнопки, сохранение).
- [ ] Не добавлялись правила в `style.css`.
- [ ] Не подключались deprecated-модули (`40-product-page.css`, `91-admin-modals.css`).

---

## 9. Автопроверки

Правила entrypoint охраняются **Stage 9:** скрипт `scripts/check-css-entrypoint.sh` (запуск: `npm run check:css`) проверяет отсутствие импорта deprecated, отсутствие правил в style.css и порядок секций. Линтинг модулей — **Stage 11:** `npm run lint:css` (stylelint только для `webapp/css/modules/**/*.css`). Оба шага завязаны на CI.

---

## 10. FAQ / частые ошибки

**Правило не применяется.** Проверить по порядку:  
1) Специфичность (селектор слабее другого?).  
2) Каскад и порядок импортов (модуль подключается раньше того, где переопределение?).  
3) Inline-стили в разметке (перебивают классы?).  
4) Использование `!important` в другом месте — по возможности заменить на более точный селектор или порядок.

**Z-index и слои.** Держать в разумных диапазонах (например, контент 0–10, панели 10–100, overlay 100–500, модалки 500–1000). Избегать лишних `transform`/`opacity`/`filter`, создающих новый stacking context без необходимости.

---

## 11. Примеры

**Добавление токена в `00-tokens.css`:**
```css
:root {
    /* ... существующие ... */
    --color-success: #00A82E;
}
```

**Правка компонента в `20-components.css`:**
```css
.product-card {
    border-radius: 16px;
    background: var(--bg-glass);
    box-shadow: 0 4px 20px var(--shadow-light);
}
```

**Правка overlay в `30-modals-overlays.css`:**
```css
.modal-content {
    max-width: 95%;
    border-radius: 24px;
    border: 1px solid var(--border-glass);
    padding: 20px;
}
```

**Page-scoped правило для страницы редактирования в `41-edit-product-page.css`:**
```css
#edit-product-page .edit-product-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

#edit-product-page .edit-product-actions {
    margin-top: 16px;
    padding-bottom: calc(16px + var(--tg-safe-area-inset-bottom, 0px));
}
```
