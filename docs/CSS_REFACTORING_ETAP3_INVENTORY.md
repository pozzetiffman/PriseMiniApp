# Этап 3: Инвентаризация и классификация `!important`

Файл: `webapp/css/style.css`. Текущее количество: **337** вхождений.

---

## A) Команды для инвентаризации

**Подсчёт:**
```bash
grep -c "!important" webapp/css/style.css
# или
grep -n "!important" webapp/css/style.css | wc -l
```
Результат: **337**.

**Список с контекстом (номера строк):**
```bash
grep -n "!important" webapp/css/style.css
```

---

## Классификация (3 категории)

### Критерии

| Категория | Критерий | Примеры |
|-----------|----------|---------|
| **K1 — ОПРАВДАНО** | Переопределение Telegram/системных стилей; safe-area и фиксированные панели (header, bottom sheet, top-menu); антикейсы, где без !important правило перебивается внешним контекстом. | `body` color, `header` position/z-index/pointer-events, `#edit-product-page` padding-bottom/::after в медиа, `body.bottom-sheet-open`, `body:has(.admin-page)` overflow, button :focus outline |
| **K2 — СТРАНИЧНЫЕ ОВЕРРАЙДЫ** | Правила внутри страницы/блока (#page-id .block), где !important использован для перебивания общих стилей. Можно снять за счёт порядка или более точного селектора. | Переопределения внутри #products-grid, .admin-modal, .operation-page-content, карточки цен |
| **K3 — ИСТОРИЧЕСКОЕ / ДОЛЖНО УБРАТЬСЯ** | Высокая специфичность селектора уже есть (например #id.class .element), конкурирующего правила с той же специфичностью нет; !important избыточен. | #products-grid.products-list-view .product-card background, #products-grid.products-grid-view … display:none, часть .cart-item-* при наличии контекста |

### Распределение (оценочно)

- **K1:** ~80–100 (body, header, admin overlay, edit-product bottom gap, button focus, dropdown fixed, z-index, pointer-events).
- **K2:** ~120–150 (страницы, модалки, карточки, формы, табы).
- **K3:** ~100–130 (избыточные !important при уже высокой специфичности: products-grid view modes, бейджи, часть типографики/цветов).

---

## План батчей (минимум 4)

| Батч | Цель | Типы правил | Ожидаемое снижение |
|------|------|-------------|--------------------|
| **#1** | Режимы отображения каталога (#products-grid) | K3: display:none и background в .products-grid-view / .products-list-view | −14 |
| **#2** | Бейджи и типографика в списке товаров | K3: .discount-badge-list, .hot-offer-badge-list, .reservation-badge-list, .product-quantity-badge-list | −25…30 |
| **#3** | Карточки товара и цены на главной | K2/K3: .prices--has-cash/.prices--no-cash, .product-name, .loading, .product-price-container (без safe-area) | −15…20 |
| **#4** | Корзина и категории | K2/K3: .cart-item-price, .cart-item-time, .category-badge, .category-dropdown (overflow/display где избыточен) | −20…25 |
| **#5+** | Модалки, админка, формы | K2: цвет/фон/display в модалках и админке, сохраняя K1 | до цели ≤200 |

После батчей #1–#4 ожидаемое снижение: 337 → ~250 (цель 3.1). Дальше — батчи по админке/модалкам для цели ≤200.

---

## B) Батч #1 — выполнено

**Цель:** Снять избыточный `!important` в правилах режимов отображения каталога (#products-grid). Селекторы уже имеют высокую специфичность (#id.class .element), конкурирующих правил с той же специфичностью нет.

**Ожидаемое снижение:** −14. **Факт:** 337 → 323 (−14).

---

## C) Батч #1: изменения по пунктам

| # | Файл | Строки | Селектор | Свойство | Было → Стало | Метод снятия | Риск | Как проверить |
|---|------|--------|----------|----------|--------------|--------------|------|----------------|
| 1 | webapp/css/style.css | 1213 | #products-grid.products-grid-view .product-top-badges-list, … .cart-button-list | display | display: none !important → display: none | Специфичность #id.class уже достаточна, конкурирующего правила нет | Низкий | Главная: переключить вид на «сетка» — элементы списка (бейджи, название, описание, цены, корзина) скрыты в сетке |
| 2 | webapp/css/style.css | 1231 | #products-grid.products-list-view .product-card | background | background: var(--bg-glass) !important → var(--bg-glass) | То же | Низкий | Главная: переключить на «список» — карточки с фоном var(--bg-glass) |
| 3 | webapp/css/style.css | 1241 | #products-grid.products-list-view .product-image | display | display: none !important → display: none | То же | Низкий | В режиме списка у карточек нет большого фото |
| 4 | webapp/css/style.css | 1246 | #products-grid.products-list-view .product-image-indicators | display | display: none !important → display: none | То же | Низкий | В режиме списка нет индикаторов слайдера |
| 5 | webapp/css/style.css | 1251 | #products-grid.products-list-view .product-image .favorite-button-card:not(.favorite-button-list) | display | display: none !important → display: none | То же | Низкий | В режиме списка сердечко не на фото, а в углу карточки |
| 6 | webapp/css/style.css | 1256 | #products-grid:not(.products-list-view) .favorite-button-list | display | display: none !important → display: none | То же | Низкий | В режиме сетки кнопка .favorite-button-list скрыта |
| 7 | webapp/css/style.css | 1261 | #products-grid.products-list-view .product-name | display | display: none !important → display: none | То же | Низкий | В режиме списка старое .product-name скрыто, видно .product-name-list |
| 8 | webapp/css/style.css | 1265 | #products-grid.products-list-view .product-description | display | display: none !important → display: none | То же | Низкий | В режиме списка старое описание скрыто |
| 9 | webapp/css/style.css | 1269–1285 | #products-grid.products-list-view .old-price-container, .product-price-container, .product-cash-price-container, .product-quantity-text, .product-quantity-badge:not(.product-quantity-badge-list) | display | display: none !important → display: none | То же | Низкий | В режиме списка старые блоки цен/количества скрыты, видны списковые варианты |
| 10 | webapp/css/style.css | 1490 | #products-grid.products-list-view .product-image .cart-button-card:not(.cart-button-list) | display | display: none !important → display: none | То же | Низкий | В режиме списка корзина не на фото, а в правой части карточки |

---

## D) Definition of Done для батча #1

- [x] Количество `!important` уменьшилось на **14** (337 → 323).
- [ ] Регрессия пройдена по мини-чеклисту ниже.
- **Коммит-месседж (точный):**  
  `refactor(css): reduce !important in products-grid view modes (batch 1)`

---

## E) Мини-чеклист регрессии для батча #1

- [ ] **Product-page:** открыть товар из каталога — цены, кнопки, модалки без изменений.
- [ ] **Admin:** вкладки, модалки, фокус полей — без изменений.
- [ ] **Edit-product:** отступ снизу и safe-area без изменений.
- [ ] **Главная (каталог):** переключение «сетка» ↔ «список»: в сетке скрыты элементы списка (бейджи сверху, название/описание списком, цены списком, корзина списком); в списке карточки в колонку, фон карточки стеклянный, скрыты большое фото и индикаторы, скрыта корзина на фото, видны списковые название/описание/цены/корзина и статус.

---

## F) Команды для метрик после батча

**Подсчёт `!important`:**
```bash
grep -c "!important" webapp/css/style.css
```
После батча #1: **323**.

**Список оставшихся (для выборочной проверки K3):**
```bash
grep -n "!important" webapp/css/style.css
```
K3 по-прежнему можно отбирать по селекторам #products-grid (бейджи, типографика) для батча #2.

---

## Батч #2 — бейджи и типографика каталога (выполнено)

### A) Кандидаты (line → selector → property)

| Строки | Селектор | Свойства с !important |
|--------|----------|------------------------|
| 1300–1305 | #products-grid.products-list-view .discount-badge-list | font-size, padding, border-radius, background, color, font-weight |
| 1314–1320 | #products-grid.products-list-view .hot-offer-badge-list | padding, border-radius, background, color, font-weight, overflow |
| 1349–1354 | #products-grid.products-list-view .reservation-badge-list | font-size, padding, border-radius, background, color, font-weight |
| 1475–1478, 1482 | #products-grid.products-list-view .product-quantity-badge-list | font-size, font-weight, margin, padding, display |
| 1554 | @media (max-width:768px) #products-grid.products-list-view .product-quantity-badge-list | font-size |
| 1123–1124 | .subcategory-badge | font-size, padding |
| 1137 | .subcategory-badge.active | background |
| 1187–1188, 1194–1195, 1201–1202 | @media (landscape) #products-grid | row-gap, column-gap (6 вхождений) |

### B) Таблица изменений

| # | Файл | Строки | Селектор | Свойство | Было → Стало | Метод снятия | Риск | Как проверить |
|---|------|--------|----------|----------|--------------|--------------|------|----------------|
| 1–6 | webapp/css/style.css | 1300–1305 | #products-grid.products-list-view .discount-badge-list | font-size, padding, border-radius, background, color, font-weight | убран суффикс !important | Специфичность #id.class .class достаточна | Низкий | Список: бейдж скидки красный, размер/отступы как раньше |
| 7–13 | webapp/css/style.css | 1314–1320 | #products-grid.products-list-view .hot-offer-badge-list | padding, border-radius, background, color, font-weight, overflow | то же | То же | Низкий | Список: бейдж «горящее» без фона, текст наследуется |
| 14–19 | webapp/css/style.css | 1349–1354 | #products-grid.products-list-view .reservation-badge-list | font-size, padding, border-radius, background, color, font-weight | то же | То же | Низкий | Список: бейдж резерва жёлтый, размер как раньше |
| 20–24 | webapp/css/style.css | 1475–1478, 1482 | #products-grid.products-list-view .product-quantity-badge-list | font-size, font-weight, margin, padding, display | то же | То же | Низкий | Список: статус товара справа внизу, блок, шрифт 11px |
| 25 | webapp/css/style.css | 1554 | (в @media max-width:768px) #products-grid... .product-quantity-badge-list | font-size | 10px !important → 10px | То же внутри медиа | Низкий | На ширине ≤768 в списке статус 10px |
| 26–27 | webapp/css/style.css | 1123–1124 | .subcategory-badge | font-size, padding | то же | Класс один, контекст фильтра | Низкий | Подкатегории: размер/отступ бейджа |
| 28 | webapp/css/style.css | 1137 | .subcategory-badge.active | background | то же | То же | Низкий | Активная подкатегория — синий фон |
| 29–34 | webapp/css/style.css | 1187–1188, 1194–1195, 1201–1202 | #products-grid в @media (orientation: landscape) | row-gap, column-gap | то же | #products-grid в медиа уже уникален | Низкий | Landscape 600px: сетка с уменьшенными зазорами |

### C) Метрики

| Метрика | Значение |
|---------|----------|
| Было !important | 323 |
| Стало !important | 290 |
| Снято | 33 |

### D) Коммит-месседж

`refactor(css): reduce !important in catalog badges and list typography (batch 2)`

### E) Мини-регрессия (батч #2)

- [ ] **Главная:** переключение сетка ↔ список — бейджи скидки/горящее/резерв и статус (кол-во) на карточках в списке на месте; подкатегории в фильтре — размер и активный фон.
- [ ] **Карточка в списке:** название, описание, цены, бейджи не съехали.
- [ ] **Переход в product-page:** без изменений.
- [ ] **Admin + Edit-product:** быстрый sanity check (батч их не затрагивал).

---

## Батч #3 — карточки товара и цены в каталоге (выполнено)

### A) Кандидаты (line → selector → property)

| Строки | Селектор | Свойства с !important |
|--------|----------|------------------------|
| 1589 | .product-card | background |
| 1622, 1624 | .product-image | aspect-ratio, background |
| 1960 | .prices--has-cash .product-price | color |
| 1964 | .prices--no-cash .product-price | color |
| 1990 | .product-cash-price | color |
| 2013 | .old-price | color |
| 2035 | .loading | color |
| 2053 | .product-name | color |
| 2067 | .product-description | color |

Все селекторы относятся к каталогу (сетка/карточки на главной). Не трогали: product-page, modal, safe-area, fixed.

### B) Таблица изменений

| # | Файл | Строки | Селектор | Свойство | Было → Стало | Метод | Риск | Как проверить |
|---|------|--------|----------|----------|--------------|-------|------|----------------|
| 1 | webapp/css/style.css | 1589 | .product-card | background | transparent !important → transparent | Специфичность: в list view уже есть #products-grid.products-list-view .product-card { background } | Низкий | Сетка: карточки без фона; список: стеклянный фон |
| 2–3 | webapp/css/style.css | 1622, 1624 | .product-image | aspect-ratio, background | убран !important | Класс в контексте карточки каталога | Низкий | Пропорции и белый фон фото в карточке |
| 4–5 | webapp/css/style.css | 1960, 1964 | .prices--has-cash .product-price, .prices--no-cash .product-price | color | убран !important | Два класса, контекст каталога | Низкий | Цвет цены (красный/зелёный) на карточках |
| 6 | webapp/css/style.css | 1990 | .product-cash-price | color | убран !important | То же | Низкий | Цена наличными на карточке |
| 7 | webapp/css/style.css | 2013 | .old-price | color | убран !important | То же | Низкий | Зачёркнутая старая цена |
| 8 | webapp/css/style.css | 2035 | .loading | color | убран !important | Один класс в каталоге | Низкий | Текст загрузки в сетке |
| 9 | webapp/css/style.css | 2053 | .product-name | color | убран !important | То же | Низкий | Название товара в карточке |
| 10 | webapp/css/style.css | 2067 | .product-description | color | убран !important | То же | Низкий | Описание в карточке |

### C) Метрики

| Метрика | Значение |
|---------|----------|
| Было !important | 290 |
| Стало !important | 280 |
| Снято | 10 |

### D) Коммит-месседж

`refactor(css): reduce !important in catalog product cards and prices (batch 3)`

### E) Мини-регрессия (батч #3)

- [ ] **Главная:** сетка ↔ список — карточки выглядят как раньше (фон, фото, имя, описание, цены).
- [ ] **Карточка:** имя, описание, цены, бейджи, кнопки не съехали.
- [ ] **Product-page:** переход из каталога без изменений.
- [ ] **Admin + Edit-product:** быстрый sanity check.

---

## Батч #4 — корзина и категории (выполнено)

### A) Кандидаты (line → selector → property)

| Строки | Селектор | Свойства с !important |
|--------|----------|------------------------|
| 703–706 | .cart-item-price | margin, font-size, color, font-weight |
| 710–712 | .cart-item-time | margin, font-size, color |
| 781, 788 | .category-badge | background, color |
| 800, 803, 804 | .category-badge.active | background, color, border-color |
| 834, 841 | .search-input | background, color |
| 857 | .search-input:focus | background |
| 935 | .category-dropdown-list | background |
| 5249, 5254 | .filter-button | background, color |
| 5285 | .filter-button:hover | background |
| 5294 | .filter-button.active | background |
| 5346 | .filter-dropdown | background |

Не трогали: #categories-nav (display/overflow), .category-filter-dropdown (position/z-index/pointer-events — K1), .scroll-x overflow, safe-area, edit-product bottom gap.

### B) Таблица изменений

| # | Файл | Строки | Селектор | Свойство | Было → Стало | Метод | Риск | Как проверить |
|---|------|--------|----------|----------|--------------|--------|------|----------------|
| 1–4 | webapp/css/style.css | 703–706 | .cart-item-price | margin, font-size, color, font-weight | убран !important | Селектор один класс, конкурирующих правил нет | Низкий | Корзина: цена товара, отступы и цвет |
| 5–7 | webapp/css/style.css | 710–712 | .cart-item-time | margin, font-size, color | то же | То же | Низкий | Корзина: время/подпись под ценой |
| 8–9 | webapp/css/style.css | 781, 788 | .category-badge | background, color | то же | То же | Низкий | Бейджи категорий: фон и цвет текста |
| 10–12 | webapp/css/style.css | 800, 803, 804 | .category-badge.active | background, color, border-color | то же | То же | Низкий | Активная категория: подсветка |
| 13–14 | webapp/css/style.css | 834, 841 | .search-input | background, color | то же | То же | Низкий | Поле поиска: фон и цвет текста |
| 15 | webapp/css/style.css | 857 | .search-input:focus | background | то же | То же | Низкий | Фокус поиска: фон |
| 16 | webapp/css/style.css | 935 | .category-dropdown-list | background | то же | То же | Низкий | Выпадающий список категорий: фон |
| 17–18 | webapp/css/style.css | 5249, 5254 | .filter-button | background, color | то же | То же | Низкий | Кнопка фильтра: фон и текст |
| 19 | webapp/css/style.css | 5285 | .filter-button:hover | background | то же | То же | Низкий | Hover кнопки фильтра |
| 20 | webapp/css/style.css | 5294 | .filter-button.active | background | то же | То же | Низкий | Активная кнопка фильтра |
| 21 | webapp/css/style.css | 5346 | .filter-dropdown | background | то же | То же | Низкий | Выпадающий фильтр: фон |

### C) Метрики

| Метрика | Значение |
|---------|----------|
| Было !important | 280 |
| Стало !important | 259 |
| Снято | 21 |
| Цель 3.1 ≤250 | 259 > 250 — не достигнута, осталось снять 9 |

### D) Коммит-месседж

`refactor(css): reduce !important in cart and category UI (batch 4)`

### E) Мини-регрессия (батч #4)

- [ ] **cart-page-new:** список товаров, цены, время, футер/кнопка, отступ снизу без изменений.
- [ ] **Переходы:** товар из корзины → product-page без изменений.
- [ ] **Категории:** бейджи, выпадающие списки, активное состояние; поиск и кнопка фильтра с выпадающим списком — как раньше.
- [ ] **Admin + Edit-product:** быстрый sanity check.
