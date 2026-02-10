# Stage 5: Разбиение style.css на модули

Файл-точка входа: `webapp/css/style.css` (только импорты).  
Стили вынесены в `webapp/css/modules/`. Порядок подключения сохраняет каскад.

## Список модулей и содержимое

| Модуль | Назначение |
|--------|------------|
| `00-tokens.css` | `:root` — цвета, bg, safe-area, price tokens, blur, CSS variables |
| `01-base.css` | html, body (в т.ч. theme override, scrollbar, ::before), body.bottom-sheet-open, button reset |
| `10-layout.css` | header (нижнее меню), header-keyboard-hidden, кнопки избранного/корзины в меню, cart-title, cart-tabs, scroll-x, контейнеры до #categories-nav |
| `20-components.css` | #categories-nav, поиск, выпадающие списки категорий/фильтров, #products-grid, карточки товара, бейджи, цены, режим списка/сетки |
| `30-modals-overlays.css` | .modal, .modal.is-open, .modal-content, keyframes; .menu-btn, .main-menu-dropdown (K1), backdrop, content; .cart-bottom-sheet (K1), .product-page-bottom-sheet (K1); **batch 2:** .cart-bottom-sheet-handle/header/product/body/actions/quantity/action-btn, keyframes slideUp/DownBottomSheet |
| `40-product-page-core.css` | **Stage 7 batch 2:** из 40-product-page. .product-page, #product-page, top-menu, content, image (контейнер). |
| `41-product-page-slider.css` | **Stage 7 batch 2:** из 40-product-page. Слайдер фото: .product-slider-container, .product-slider, track, slide, indicator, dots, placeholder; hot-offer/edit-control. |
| `42-product-page-prices.css` | **Stage 7 batch 2:** из 40-product-page. #product-page-price-container (карточка, строки, label/value), размеры шрифтов, quantity, reservation; batch 3 price fix. |
| `43-product-page-sections.css` | **Stage 7 batch 2:** из 40-product-page. Delivery, reviews, about, specs (описание, характеристики). |
| `44-product-page-toast-anim.css` | **Stage 7 batch 2:** из 40-product-page. keyframes productPageSlideIn, #product-page.is-active animation, toast-host, product-toast, app-toast, keyframes productToastFadeIn/appToastFadeIn. |
| `40-product-page.css` | **DEPRECATED (Stage 7 batch 2):** заглушка. Контент разнесён по 40-product-page-core / 41-product-page-slider / 42-product-page-prices / 43-product-page-sections / 44-product-page-toast-anim. Не импортируется. |
| `42-cart-page.css` | **Stage 6 batch 1:** из 40-pages. .cart-page, #cart-page-new, .cart-new-top-menu, cart-page-content, cartPageSlideIn |
| `43-checkout-page.css` | **Stage 6 batch 1:** из 40-pages. .sale-order-page, оформление покупки, sale-order-form-field, delivery-option, saleOrderPageSlideIn |
| `44-favorites-page.css` | **Stage 6 batch 1:** из 40-pages. .favorites-page, #favorites-page, favorites-new-top-menu, favorites-items |
| `45-operations-page.css` | **Stage 6 batch 1:** из 40-pages. .operation-detail-deal-* (Deals UI), .operation-item-card-deal |
| `41-edit-product-page.css` | **batch 2:** #edit-product-page — отступы, safe-area, form layout, actions, saving state, debug (--ep-debug, --edit-product-bottom-gap) |
| `90-admin-core.css` | **Stage 6 batch 3:** из 90-admin. .admin-page, #admin-page.is-active, admin-page-header/back/content, .admin-page .admin-tabs, .admin-tabs-info, keyframes adminPageSlideIn. |
| `91-admin-modals-core.css` | **Stage 7 batch 3:** из 91-admin-modals. keyframes modalSlideInFade, .admin-button, .admin-modal, .admin-modal-content/header, .admin-close, .admin-modal-body. |
| `92-admin-modals-product-modal.css` | **Stage 7 batch 3:** из 91-admin-modals. Product modal UI: .modal-close, .modal-image/name/description/price/quantity, .modal-old-price, .modal-reservation-*, .reserve-btn, .btn-edit/.btn-sold/.btn-delete, #purchase-modal .order-form, .reservation-*. |
| `93-admin-modals-tabs.css` | **Stage 7 batch 3:** из 91-admin-modals. .admin-tabs, .admin-tab, .admin-tab-content, scrollbar, .admin-page .admin-tabs/.admin-modal-body. |
| `94-admin-modals-forms.css` | **Stage 7 batch 3:** из 91-admin-modals. Favorites page, main, @media (480px) overrides (в т.ч. .edit-product-field, .delivery-option, .admin-modal .admin-tabs), плейсхолдеры, фильтры, scroll-x, tap-highlight. |
| `91-admin-modals.css` | **DEPRECATED (Stage 7 batch 3):** заглушка. Контент разнесён по 91-admin-modals-core, 92-admin-modals-product-modal, 93-admin-modals-tabs, 94-admin-modals-forms. Не импортируется. |
| `92-admin-stats-lists.css` | **Stage 6 batch 3:** из 90-admin. .stats-content, .stat-card, .stat-value, фильтры статистики, .sold-products-list, .orders-list, .reservations-list, .admin-page .order-item, .admin-setting, toggle, .admin-notification, keyframes slideIn/slideOut/fadeIn. |

*Удалено (Stage 6 batch 2):* `99-legacy.css`, `40-pages.css` — импорт убран, файлы удалены.

*Stage 7 batch 1:* импорты page-модулей сгруппированы и нормализованы в entrypoint (содержимое модулей не менялось).

## Что куда вынесено (кратко)

- **00-tokens:** только блок `:root` (1–36).
- **01-base:** тема html/body, html/body стили, body::before, body.bottom-sheet-open, button reset (37–155).
- **10-layout:** от `header` до конца блока перед `#categories-nav` (156–814).
- **20-components:** от `#categories-nav` до конца блока перед `.modal` (815–2146).
- **30-modals-overlays:** блок `.modal` (2148–2216) + блок от `.menu-btn` / `.main-menu-dropdown` до конца стилей `.product-page-bottom-sheet` (6777–9681). K1-селекторы `[style*="..."]` перенесены как есть.
- **Product page (Stage 7 batch 2):** 40-product-page разнесён на 40-product-page-core, 41-product-page-slider, 42-product-page-prices, 43-product-page-sections, 44-product-page-toast-anim (move-only). Порядок в PAGES: 40-core → 41-slider → 42-prices → 43-sections → 44-toast-anim → 41-edit-product-page → 42-cart-page → 43-checkout-page → 44-favorites-page → 45-operations-page.
- **90-admin-core / 91-admin-modals / 92-admin-stats-lists (Stage 6 batch 3):** бывший 90-admin.css разнесён (move-only). **Stage 7 batch 3:** 91-admin-modals разнесён на 91-admin-modals-core, 92-admin-modals-product-modal, 93-admin-modals-tabs, 94-admin-modals-forms (move-only). Порядок импортов в блоке ADMIN: 90-admin-core → 91-admin-modals-core → 92-admin-modals-product-modal → 93-admin-modals-tabs → 94-admin-modals-forms → 92-admin-stats-lists.

## Правило на будущее

- **Новые стили** добавлять в соответствующий модуль (tokens / base / layout / components / modals-overlays / pages / admin), **а не** в `style.css`.
- В `style.css` — только импорты и при необходимости минимальный комментарий; порядок импортов не менять без явной задачи по каскаду.
- **Правки по edit-product:** добавлять в `41-edit-product-page.css`.
- **Правки по bottom-sheet (шторки корзины / product-page):** добавлять в `30-modals-overlays.css`.
- **Правки по страницам:** только в соответствующий page-модуль (42-cart-page, 43-checkout-page, 44-favorites-page, 45-operations-page). Правки по product-page — в соответствующий подмодуль (40-product-page-core, 41-product-page-slider, 42-product-page-prices, 43-product-page-sections, 44-product-page-toast-anim).
- **Правки по админке:** core (страница, header, back, tabs-info) — 90-admin-core.css; модалки админки — соответствующий подмодуль: каркас модалки (admin-modal, admin-close, admin-modal-body) — 91-admin-modals-core.css; product modal UI (.modal-close, .modal-image и т.д.) — 92-admin-modals-product-modal.css; табы (.admin-tabs, .admin-tab, .admin-tab-content) — 93-admin-modals-tabs.css; формы/оверрайды (edit-product-field, delivery-option в @media, favorites, фильтры) — 94-admin-modals-forms.css; статистика и списки — 92-admin-stats-lists.css.
- Все page-модули подключаются единым блоком PAGES в style.css; порядок страниц менять только по явной задаче каскада.

## Метрики после batch 1

- **!important:** 169 (без изменений, только перенос).
- **\[style*=\]:** 21 (в 01-base 1, в 30-modals-overlays 20; K1/S3 без изменений).
- Строк в исходном файле: 10125 → в модулях суммарно 10125 строк; `style.css` — 11 строк (entry point).

## Batch 2 (разгрузка 99-legacy)

**Вынесено из 99-legacy:**
- В **30-modals-overlays.css:** все стили bottom-sheet: .cart-bottom-sheet-handle, .cart-bottom-sheet-header, .cart-bottom-sheet-product*, .cart-bottom-sheet-body, .cart-bottom-sheet-actions-row, .cart-bottom-sheet-actions, .cart-bottom-sheet-quantity-*, .cart-bottom-sheet-action-btn, overrides для .product-page-bottom-sheet (quantity-controls, body, actions-row), @keyframes slideUpBottomSheet / slideDownBottomSheet. Перенос 1:1, без изменений.
- В **41-edit-product-page.css** (новый файл): все блоки #edit-product-page — edit-delivery-actions, edit-delivery-save-btn, is-saving, ep-spin, --ep-debug / --edit-product-bottom-gap, operation-page-content/form-page-content, edit-product-form, edit-product-actions. Импорт добавлен в `style.css` после 40-pages, до 90-admin.

**Размер 99-legacy после batch 2:** ~93 строки (было ~445). Осталось: #product-page-price-container (product page), .operation-detail-deal-* (Deals UI). В начале файла комментарий «TEMP LEGACY — must be reduced».

**Метрики после batch 2:** !important 169, [style*=] 21 — без изменений.

## Batch 3 (очистка 99-legacy)

**Перенесено из 99-legacy в 40-pages.css (в конец файла, 1:1):**
- Блок **#product-page-price-container** (Product page — FIX: stretch price rows to full width and push values to right edge). Комментарий в 40-pages: «Stage 5 batch 3: из 99-legacy — Product page price container fix».
- Блоки **.operation-detail-deal-*** (Deals UI: .operation-detail-deal-items, .operation-detail-deal-item-card, .operation-detail-deal-item-info/name/price, .operation-item-card-deal .operation-item-info). Комментарий в 40-pages: «Stage 5 batch 3: из 99-legacy — Operation detail Deals UI».

**99-legacy после batch 3:** только два комментария («TEMP LEGACY — must be reduced» и «Файл оставлен пустым намеренно (batch 3: весь контент перенесён в 40-pages)»). Контента 0 строк.

**Метрики после batch 3:** !important и [style*=] без изменений (move-only).

## Stage 6: split pages module (batch 1)

**Цель:** разнести монолитный 40-pages.css по подмодулям страниц. **Move-only:** без изменений значений, селекторов, порядка строк; каскад сохранён.

**Новые файлы (в `webapp/css/modules/`):**
- `40-product-page.css` — .product-page, #product-page, top-menu, content, image, slider, prices, delivery, reviews, about, specs, toast, keyframes; блок #product-page-price-container fix (из batch 3).
- `42-cart-page.css` — .cart-page, #cart-page-new, .cart-new-top-menu, cart-page-content, cartPageSlideIn.
- `43-checkout-page.css` — .sale-order-page, оформление покупки, sale-order-form-field, delivery-option, saleOrderPageSlideIn.
- `44-favorites-page.css` — .favorites-page, #favorites-page, favorites-new-top-menu, favorites-items.
- `45-operations-page.css` — .operation-detail-deal-* (Deals UI), .operation-item-card-deal .operation-item-info.

**style.css:** импорт `40-pages.css` заменён на пять импортов в порядке: 40-product-page → 42-cart-page → 43-checkout-page → 44-favorites-page → 45-operations-page; затем 41-edit-product-page (без изменений). Импорт 40-pages.css удалён.

**40-pages.css:** весь контент удалён, оставлена только заглушка: «DEPRECATED: Stage 6 batch 1 split into … Do not add styles here.»

**Правило:** стили страниц добавлять только в соответствующий page-модуль (40/42/43/44/45).

**Метрики:** !important и [style*=] без изменений (move-only).

## Stage 6 batch 2: cleanup stubs (remove legacy import + delete empty files)

**Сделано:**
- Удалён импорт `@import url("./modules/99-legacy.css");` из `webapp/css/style.css`.
- Удалён файл `webapp/css/modules/99-legacy.css` (пустая заглушка).
- Удалён файл `webapp/css/modules/40-pages.css` (deprecated заглушка, не импортировался).

**Каскад и UI:** без изменений (удалены только пустые/неиспользуемые файлы и один импорт).

**Коммит:** `chore(css): remove deprecated stub modules (stage 6 batch 2)`.

## Stage 6 batch 3: split admin module (move-only)

**Цель:** разнести 90-admin.css на три подмодуля с сохранением каскада и UI 1:1.

**Новые файлы (в `webapp/css/modules/`):**
- `90-admin-core.css` — .admin-page, #admin-page.is-active, admin-page-header/back/content, .admin-page .admin-tabs, .admin-tabs-info, keyframes adminPageSlideIn (исходные строки 1–182).
- `91-admin-modals.css` — .modal-close, .modal-image/name/description/price, .admin-button, .admin-modal, .admin-close, .admin-modal-body, .admin-tabs, .admin-tab, .admin-tab-content, edit-product-form, order form, delivery-option (исходные строки 183–1785).
- `92-admin-stats-lists.css` — .stats-content, .stat-card, .stat-value, stats-filter, .sold-products-list, .orders-list, .reservations-list, .admin-page .order-item, .admin-setting, toggle-switch, .admin-notification, keyframes slideIn/slideOut/fadeIn (исходные строки 1786–2731).

**style.css:** импорт `90-admin.css` заменён на три импорта в порядке: 90-admin-core → 91-admin-modals → 92-admin-stats-lists (позиция в файле не менялась).

**90-admin.css:** удалён после разнесения.

**Правило:** правки по админке — в соответствующий подмодуль (core / modals / stats-lists).

**Метрики:** !important и [style*=] без изменений (move-only).

## Stage 7 batch 1: normalize pages entrypoints

**Сделано:** в `webapp/css/style.css` импорты page-модулей сгруппированы в один блок с комментарием «PAGES (Stage 7 batch 1): page-scoped modules. Keep together to preserve cascade.» и приведены к единому порядку: 40-product-page → 41-edit-product-page → 42-cart-page → 43-checkout-page → 44-favorites-page → 45-operations-page. Блок PAGES расположен после 30-modals-overlays.css и до admin-модулей (90/91/92). Добавлен комментарий «ADMIN» перед импортами админки. Содержимое файлов в `webapp/css/modules/*.css` не менялось.

**Каскад / UI:** без изменений (только порядок и группировка импортов в entrypoint).

**Коммит:** `chore(css): stage 7 batch 1 — normalize pages imports block in entrypoint`.

## Stage 7 batch 2: split product-page module (move-only)

**Цель:** разнести 40-product-page.css на пять подмодулей с сохранением каскада и UI 1:1.

**Новые файлы (в `webapp/css/modules/`):**
- `40-product-page-core.css` — общая структура: .product-page, #product-page.is-active, header, top-menu, content, .product-page-image (контейнер).
- `41-product-page-slider.css` — слайдер фото: .product-slider-container, .product-slider, track, slide, indicator, dots, placeholder; #product-page-hot-offer-control, #product-page-edit-control.
- `42-product-page-prices.css` — #product-page-price-container (карточка, pp-price-row/label/value, discount, savings), контейнер цен — размеры шрифтов, quantity, reservation; блок batch 3 (price container fix).
- `43-product-page-sections.css` — #product-page-delivery, #product-page-reviews, .product-page-about-section, .product-page-description, .product-page-specs-section, specs-content.
- `44-product-page-toast-anim.css` — @keyframes productPageSlideIn, #product-page.is-active { animation }, #product-page-toast-host, .product-toast, .app-toast, @keyframes productToastFadeIn, appToastFadeIn.

**style.css:** в блоке PAGES импорт `40-product-page.css` заменён на пять импортов в порядке: 40-product-page-core → 41-product-page-slider → 42-product-page-prices → 43-product-page-sections → 44-product-page-toast-anim; далее без изменений 41-edit-product-page, 42-cart-page и т.д.

**40-product-page.css:** содержимое удалено, оставлена заглушка «DEPRECATED: Stage 7 batch 2 split into … Do not add styles here.» Файл не импортируется.

**Каскад / UI:** без изменений (move-only).

**Коммит:** `refactor(css): stage 7 batch 2 — split product page module into core/slider/prices/sections/toast (move-only)`.

## Stage 7 batch 3: split admin modals module (move-only)

**Цель:** разгрузить 91-admin-modals.css, сохранив каскад и UI 1:1. Только move-only: значения свойств, селекторы и порядок строк внутри блоков не менялись.

**Новые файлы (в `webapp/css/modules/`):**
- `91-admin-modals-core.css` — keyframes modalSlideInFade, .admin-button, .admin-modal, .admin-modal-content, .admin-modal-header, .admin-close, .admin-modal-body.
- `92-admin-modals-product-modal.css` — product modal UI: .modal-close, .modal-image/name/description/price/quantity, .modal-old-price, .modal-reservation-*, .reserve-btn, .btn-edit/.btn-sold/.btn-delete, #purchase-modal .order-form, .reservation-*.
- `93-admin-modals-tabs.css` — .admin-tabs, .admin-tab, .admin-tab-content, scrollbar, .admin-page .admin-tabs/.admin-modal-body.
- `94-admin-modals-forms.css` — блок до клюфреймов админки: favorites page, main, @media (480px) (в т.ч. .edit-product-field, .delivery-option, .admin-modal .admin-tabs), плейсхолдеры, фильтры, scroll-x, tap-highlight.

**style.css:** в блоке ADMIN импорт `91-admin-modals.css` заменён на четыре импорта в порядке: 91-admin-modals-core → 92-admin-modals-product-modal → 93-admin-modals-tabs → 94-admin-modals-forms; далее 92-admin-stats-lists без изменений.

**91-admin-modals.css:** содержимое удалено, оставлена заглушка «DEPRECATED: Stage 7 batch 3 split into … Do not add styles here.» Файл не импортируется.

**Каскад / UI:** без изменений (move-only). Правки по админ-модалкам/табам/формам — в соответствующий подмодуль; в deprecated файл стили не добавлять.

**Коммит:** `refactor(css): stage 7 batch 3 — split admin modals module into core/product-modal/tabs/forms (move-only)`.

## Stage 8: finalize entrypoint + cleanup stubs + regression checklist

**Цель:** закрыть рефакторинг модулей: убрать артефакты после сплитов, убедиться что deprecated-файлы не импортируются, зафиксировать метрики и чеклист регрессии. Без изменений UI.

**Проверено:**
- **Deprecated не импортируются:** в `webapp/css/style.css` нет импортов `40-product-page.css` и `91-admin-modals.css`; импортируются только подмодули (40-product-page-core/41-slider/42-prices/43-sections/44-toast-anim и 91-admin-modals-core/92-product-modal/93-tabs/94-forms).
- **Порядок импортов:** TOKENS → BASE → LAYOUT → COMPONENTS → MODALS/OVERLAYS → PAGES → ADMIN. Внутри PAGES: 40-product-page-core, 41-product-page-slider, 42-product-page-prices, 43-product-page-sections, 44-product-page-toast-anim, 41-edit-product-page, 42-cart-page, 43-checkout-page, 44-favorites-page, 45-operations-page. Внутри ADMIN: 90-admin-core, 91-admin-modals-core, 92-admin-modals-product-modal, 93-admin-modals-tabs, 94-admin-modals-forms, 92-admin-stats-lists.
- **Синтаксис:** из `40-product-page-core.css` удалены лишняя одиночная `}` и дублирующий комментарий Stage 6 batch 1 (cleanup Stage 8).
- **style.css:** только импорты и короткие комментарии разделов (TOKENS, BASE, LAYOUT, COMPONENTS, MODALS/OVERLAYS, PAGES, ADMIN).

**Файлы с DEPRECATED (не импортируются):**
- `webapp/css/modules/40-product-page.css`
- `webapp/css/modules/91-admin-modals.css`

**Метрики (после Stage 8):**
- **!important:** 169 (в webapp/css/modules)
- **[style*=]:** 21 (в webapp/css/modules)

**Definition of Done:** entrypoint содержит только импорты и комментарии; порядок разделов зафиксирован; deprecated-файлы не в импортах; синтаксический мусор убран; метрики и чеклист регрессии зафиксированы в документе.

**Чеклист регрессии (ручная проверка, ToDo):**
- [ ] **Главная:** сетка/список, бейджи, цены, корзина в шапке
- [ ] **Product page:** top-menu, слайдер, точки, цены (cash/card/old), delivery/reviews/about/specs, toast
- [ ] **Cart + Checkout:** safe-area/отступы, формы, кнопки
- [ ] **Favorites:** список, удаление из избранного
- [ ] **Operations:** карточки deals
- [ ] **Overlays:** main-menu-dropdown, bottom-sheets (cart, product)
- [ ] **Admin:** открыть/закрыть product modal, табы, формы доставки/редактирования

**Коммит:** `chore(css): stage 8 — finalize entrypoint order, ensure deprecated not imported, record metrics (no UI changes)`.

### Stage 10: regression sign-off

Шаблон для фиксации прохождения ручной регрессии. В CI добавлен job `css-guardrails` (`.github/workflows/css-guardrails.yml`): при push/PR в main или master выполняется `npm run check:css`.

| Поле | Значение |
|------|----------|
| **Date** | YYYY-MM-DD (placeholder) |
| **Tested by** | (placeholder) |
| **Build/commit** | (placeholder) |

**Чеклист (отмечать [x] после прохождения):**

- [ ] **Главная:** сетка/список, бейджи, цены, корзина в шапке  
  _Как проверять:_ открыть главную, переключить сетка/список, убедиться в бейджах, ценах и иконке корзины в шапке.

- [ ] **Product page:** top-menu, слайдер, точки, цены (cash/card/old), delivery/reviews/about/specs, toast  
  _Как проверять:_ открыть товар, проверить верхнее меню, пролистать слайдер и точки, блок цен, секции доставка/отзывы/о товаре/характеристики, показать toast.

- [ ] **Cart + Checkout:** safe-area/отступы, формы, кнопки  
  _Как проверять:_ открыть корзину и оформление заказа, проверить отступы и safe-area, заполнение полей, кнопки.

- [ ] **Favorites:** список, удаление из избранного  
  _Как проверять:_ открыть избранное, проверить список и удаление товара из избранного.

- [ ] **Operations:** карточки deals  
  _Как проверять:_ открыть раздел операций, проверить отображение карточек deals.

- [ ] **Overlays:** main-menu-dropdown, bottom-sheets (cart, product)  
  _Как проверять:_ открыть выпадающее меню, шторку корзины и шторку страницы товара, убедиться в корректном открытии/закрытии.

- [ ] **Admin:** открыть/закрыть product modal, табы, формы доставки/редактирования  
  _Как проверять:_ в админке открыть модалку товара, переключать табы, проверить формы доставки и редактирования товара.

## Stage 9: enforcement (entrypoint guardrails)

**Цель:** закрепить результат рефакторинга: запретить импорт deprecated-модулей, запретить стили в style.css, зафиксировать порядок секций, выводить метрики одной командой.

**Запуск проверки:** из корня репозитория:
```bash
npm run check:css
```
или
```bash
bash scripts/check-css-entrypoint.sh
```

**Что проверяется:**
- **A) Deprecated не импортируются:** скрипт падает с ошибкой, если в `webapp/css/style.css` есть импорт `./modules/40-product-page.css` или `./modules/91-admin-modals.css`.
- **B) Только @import и комментарии:** в style.css запрещены любые CSS-правила (фигурные скобки `{}`), селекторы и прочий контент; допускаются только строки `@import url("./modules/...");`, комментарии `/* ... */` и пустые строки.
- **C) Порядок секций:** комментарии разделов должны встречаться ровно по одному разу в таком порядке: `/* TOKENS */`, `/* BASE */`, `/* LAYOUT */`, `/* COMPONENTS */`, `/* MODALS/OVERLAYS */`, `/* PAGES */`, `/* ADMIN */`.
- **D) Метрики:** в конце (при успехе) выводятся `count !important` и `count [style*=]` по `webapp/css/modules`.

При провале A/B/C — exit 1 и сообщение, что именно нарушено. При успехе — exit 0 и строка `OK: css entrypoint validated`.

**Файлы:** `scripts/check-css-entrypoint.sh`, npm-скрипт `check:css` в `package.json`. Husky не добавлялся (в проекте нет).

**Коммит:** `chore(css): stage 9 — add entrypoint guardrails (no UI changes)`.

## Stage 11: CSS linting for modules

**Цель:** линтить только `webapp/css/modules/**/*.css` (без изменений UI; правки только синтаксис/форматирование по autofix при необходимости). Entrypoint по-прежнему охраняется Stage 9 (`check:css`).

**Запуск локально:**
```bash
npm run lint:css
npm run lint:css:fix
```

**Что проверяется (минимальный набор):**
- `block-no-empty` — пустые блоки запрещены.
- `color-no-invalid-hex` — невалидные hex-цвета.
- `property-no-unknown` — неизвестные свойства.
- `selector-type-no-unknown` — неизвестные типы селекторов (исключения: `tg-*`, псевдоэлементы scrollbar).
- `function-no-unknown` отключён (из-за зависимости в пакете).
- `declaration-block-no-duplicate-properties` отключён из-за намеренных дубликатов в коде (переопределения с `!important` и т.п.); при желании можно включить после рефактора.

**Конфиг:** `.stylelintrc.json`. Игнорируются: `webapp/css/style.css`, `**/backup/**`, `**/vendor/**`. Без пресета форматирования (indentation/color-hex-length и т.д.), без max-specificity и жёстких правил именования.

**CI:** в `.github/workflows/css-guardrails.yml` добавлен job `css-lint`: `npm ci`/`npm install` и `npm run lint:css` на push/PR в main/master.

**Зависимости (dev):** stylelint, stylelint-config-standard (не используется в конфиге — только минимальные правила), stylelint-order (в конфиге не задействован). Используется stylelint 14 из-за совместимости с окружением.

**Коммит:** `chore(css): stage 11 — add stylelint for modules (no UI changes)`.

## Команды проверки

```bash
grep -R "DEPRECATED:" -n webapp/css/modules
grep -n '@import url("./modules/' webapp/css/style.css
grep -R "!important" webapp/css/modules | wc -l
grep -R '\[style\*=' webapp/css/modules | wc -l
```

## Дальнейшие шаги

- При необходимости — дальнейшее разбиение 90-admin или других крупных модулей по поддоменам.
