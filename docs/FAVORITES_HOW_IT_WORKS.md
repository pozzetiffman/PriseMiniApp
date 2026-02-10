# Избранное (Favorites) — как устроено и где используется

Полное описание: логика, стили, места использования, потоки данных.

---

## 1. Общая схема

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKEND: /api/favorites/                                                     │
│  GET /check/{id}  POST /toggle/{id}  GET /list  GET /count                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  webapp/js/favorites.js — единый модуль избранного                           │
│  • favoritesCache (Set<productId>) — заполняется только из list               │
│  • getFavoritesIdsSet() / isFavoriteCached(id) — чтение кэша                  │
│  • syncFavoritesCache() → GET /list → заполняет кэш + favoritesCount           │
│  • toggleFavorite(id) → POST /toggle → обновляет кэш + updateFavoritesCount() │
│  • checkFavorite(id) → GET /check (точечно, не в цикле)                       │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────────────┐   ┌─────────────────────────────────┐
│ Рендер сетки │   │ Страница товара     │   │ Страница «Избранное»            │
│ (карточки)   │   │ #product-top-menu-  │   │ #favorites-page                 │
│              │   │ favorite            │   │ loadFavoritesPage() → список   │
│ Класс на     │   │ + check при открытии │   │ из getFavorites() + клоны      │
│ кнопках из   │   │ + флаг userHasToggle │   │ карточек с сердечками           │
│ кэша         │   │ чтобы check не       │   │                                │
│              │   │ перетирал UI         │   │                                │
└──────────────┘   └──────────────────────┘   └─────────────────────────────────┘
```

---

## 2. Где используется избранное (UI и ID)

### 2.1 HTML (index.html)

| Элемент | ID / класс | Назначение |
|--------|------------|------------|
| Кнопка избранного в шапке (нижнее меню) | `#favorites-button`, `.favorites-button` | Открывает страницу избранного; класс `.favorites-has-items` — есть избранные (подсветка). |
| Страница избранного | `#favorites-page`, `.favorites-page` | Контейнер страницы; при показе получает `.is-active`. |
| Заголовок страницы избранного | `#favorites-top-menu-count` | Текст «0 товаров» / «1 товар» / «N товаров». |
| Контент страницы избранного | `#favorites-items`, `.favorites-items` | Сюда рендерятся карточки избранных товаров. |
| Кнопка избранного на странице товара | `#product-top-menu-favorite`, `.product-top-menu-favorite` | Сердечко в шапке страницы товара; `data-product-id` выставляется в JS при открытии. |

Кнопки на карточках (создаются в JS, не в HTML):

- На фото товара: класс `.favorite-button-card`, атрибут `data-product-id`.
- В режиме списка: `.favorite-button-card.favorite-button-list`, тот же `data-product-id`.

### 2.2 Где в коде что делается

| Файл | Что делает |
|------|------------|
| **favorites.js** | Кэш, API (sync/list/check/toggle/count), init, открытие/закрытие страницы избранного, загрузка списка в `#favorites-items`, обновление счётчика в шапке и кнопки `.favorites-has-items`. |
| **handlers/products_render.js** | Рендер карточек: после `syncFavoritesCache()` берёт `getFavoritesIdsSet()`, выставляет `favorite-active` по кэшу; клик по сердечку → optimistic UI + `toggleFavorite` + `updateFavoriteUIForProduct`. Экспорт `updateFavoriteUIForProduct(productId, isFavorite)` — единая точка обновления всех кнопок по productId. |
| **handlers/products_modal.js** | Страница товара: при открытии ставит `dataset.productId`, запускает `checkFavorite(prod.id)` в async IIFE; применяет результат только если `!userHasToggledFavorite`. По клику на сердечко — optimistic + toggle + `updateFavoriteUIForProduct`. |
| **cart/cartNew.js** | В корзине у каждой позиции кнопка `.cart-item-favorite-btn`: при отрисовке вызывается `checkFavorite(product.id)` и ставится/снимается `favorite-active`; по клику — `toggleFavorite`. |
| **app.js** | Для роли client вызывает `initFavorites()`, по таймеру — `tryUpdateFavoritesCount()`; по клику на кнопку корзины — тоже `tryUpdateFavoritesCount()`. |
| **cartBottomSheet.js**, **dealCheckout.js**, **product-edit.js**, **sale_orders.js**, **operationsBase.js** | Упоминают `#favorites-page` для навигации/скрытия/определения «вернуться на избранное». |

---

## 3. Логика по шагам

### 3.1 Кэш (favorites.js)

- **favoritesCache** — `Set` с id товаров. Заполняется только из:
  - `syncFavoritesCache()` → GET `/api/favorites/list`
  - `getFavorites(shopOwnerId)` → тот же list (при открытии страницы избранного).
- **favoritesCount** — число избранных; обновляется из ответа list или из `updateFavoritesCount()` (GET `/api/favorites/count`), последний вызывается только внутри `toggleFavorite()` после успешного toggle.
- **getFavoritesIdsSet()** — возвращает копию Set (для рендера карточек без N×check).
- **isFavoriteCached(productId)** — проверка по кэшу без запроса.

### 3.2 Рендер карточек (products_render.js)

1. В начале `renderProducts(products)` один раз вызывается `syncFavoritesCache()`.
2. Берётся `favoritesIdsSet = getFavoritesIdsSet()`.
3. В цикле по каждому товару:
   - для карточки (сетка): `isFavorite = favoritesIdsSet.has(prod.id)`, сразу `updateFavoriteUIForProduct(prod.id, isFavorite)`;
   - для кнопки в режиме списка: то же по кэшу, без вызова check.
4. Клик по кнопке избранного на карточке/списке:
   - optimistic: `updateFavoriteUIForProduct(prod.id, newState)`;
   - `safeToggleFavorite(prod.id)` (внутри — `toggleFavorite` и один раз `updateFavoritesCount()`);
   - по ответу — снова `updateFavoriteUIForProduct(prod.id, result.is_favorite)`.

Запросов GET `/api/favorites/check/{id}` в цикле рендера нет.

### 3.3 Страница товара (products_modal.js)

1. При открытии страницы: `userHasToggledFavorite = false`, на кнопку вешается `dataset.productId = prod.id`.
2. Запускается async IIFE: `checkFavorite(prod.id)` → при ответе вызывается `updateFavoriteUIForProduct(prod.id, isFavorite)` только если `!userHasToggledFavorite` (чтобы поздний ответ не перетирал лайк).
3. Клик по сердечку: `userHasToggledFavorite = true`, optimistic `updateFavoriteUIForProduct(...)`, затем `toggleFavorite(prod.id)` и по ответу снова `updateFavoriteUIForProduct`. Счётчик count обновляется только внутри `toggleFavorite`.

### 3.4 Страница «Избранное» (favorites.js)

1. **openFavoritesPage()** — скрывает остальные страницы, показывает `#favorites-page`, вызывает `loadFavoritesPage()`.
2. **loadFavoritesPage()** — `getFavorites(shop_owner_id)` (GET list), заполняет кэш и `favoritesCount`, пишет в `#favorites-items`. Карточки создаются через `renderProducts(products)` в временный контейнер, затем клонируются в `#favorites-items` с уже выставленным `favorite-active` для избранных и своими обработчиками (удаление из избранного, корзина, переход на товар).
3. **closeFavoritesPage()** — скрывает страницу, вызывает `syncFavoritesCache()` и при необходимости `loadData()`; при рассинхроне в `refreshFavoritesOnMainPage()` обновляются кнопки по кэшу.

### 3.5 Единое обновление UI по productId (products_render.js)

```js
updateFavoriteUIForProduct(productId, isFavorite)
```

- Находит все кнопки с селектором `.favorite-button-card[data-product-id="${id}"]` и выставляет/снимает класс `favorite-active`.
- Отдельно обновляет `#product-top-menu-favorite`, если у него `dataset.productId === id`.

Так синхронизируются: сердечко на карточке (сетка и список), сердечко на странице товара и любые другие кнопки с тем же `data-product-id`.

---

## 4. Стили (CSS): классы и файлы

### 4.1 Ключевые классы

| Класс | Где | Эффект |
|-------|-----|--------|
| **favorite-active** | Кнопки избранного (карточка, страница товара) | Залитое красное сердце (#ff3b30), свечение. |
| **favorites-has-items** | `#favorites-button` (кнопка в шапке) | Подсветка кнопки и иконки, если есть избранные. |
| **favorite-button-card** | Кнопка на фото карточки товара | Круглая кнопка поверх изображения, справа снизу. |
| **favorite-button-list** | Кнопка избранного в режиме списка | Та же логика, другое позиционирование в списке. |
| **product-top-menu-favorite** | Кнопка в шапке страницы товара | Квадратная кнопка в top-menu. |

### 4.2 Файлы стилей

| Файл | Что задаёт |
|------|------------|
| **css/modules/10-layout.css** | `.favorites-button` (кнопка в меню), `.favorites-button.favorites-has-items`, `.favorite-button-card`, `.favorite-button-card.favorite-active .favorite-heart`, `.favorite-heart`, hover/active. |
| **css/modules/20-components.css** | Позиционирование `.favorite-button-card` и `.favorite-button-list` в режиме списка/сетки. |
| **css/modules/40-product-page-core.css** | `.product-top-menu-favorite`, `.product-top-menu-favorite.favorite-active .product-top-menu-favorite-path` (заливка пути SVG). |
| **css/modules/44-favorites-page.css** | Страница избранного: `.favorites-page`, `.favorites-new-top-menu`, `.favorites-top-menu-count`, `.favorites-items` и т.д. |
| **css/modules/30-modals-overlays.css** | При необходимости — доп. правила для страниц/оверлеев; в т.ч. `.cart-item-favorite-btn.favorite-active` для кнопки в корзине. |
| **css/modules/94-admin-modals-forms.css** | Упоминания `.favorites-page`, грид избранного в админке. |

### 4.3 Визуал сердечка

- **Без favorite-active:** контур (stroke), без заливки (fill: none).
- **С favorite-active:** заливка и обводка красным (#ff3b30), лёгкий drop-shadow.
- Кнопка в шапке главной: при `favorites-has-items` — красное свечение иконки.

---

## 5. API (backend)

Роутер: `backend/app/routers/favorites.py`, префикс `/api/favorites`.

| Метод и путь | Назначение |
|--------------|------------|
| GET `/check/{product_id}` | Проверка: в избранном ли товар у текущего пользователя. Ответ: `{ "is_favorite": true/false }`. |
| POST `/toggle/{product_id}` | Добавить/убрать из избранного. Ответ: `{ "is_favorite": true/false }`. |
| GET `/list?shop_owner_id=...` | Список избранных товаров магазина (объекты товаров). |
| GET `/count?shop_owner_id=...` | Количество избранных. Ответ: `{ "count": number }`. |

Авторизация: заголовок `X-Telegram-Init-Data` (Telegram WebApp).

---

## 6. Краткий поток «как это работает»

1. **Старт приложения (клиент):** `initFavorites()` → через 500 ms `syncFavoritesCache()` (один GET list), кэш и счётчик заполнены; кнопка в меню показывает состояние через `favorites-has-items` и при клике открывает страницу избранного.
2. **Загрузка главной:** `loadData()` → `applyFilters()` → `renderProducts(products)`. В `renderProducts` один раз `syncFavoritesCache()` и `getFavoritesIdsSet()`, по кэшу выставляется `favorite-active` на кнопках карточек без запросов check.
3. **Клик «лайк» на карточке:** optimistic `updateFavoriteUIForProduct` → `toggleFavorite(id)` (POST toggle + внутри один GET count) → по ответу снова `updateFavoriteUIForProduct`. Все кнопки с этим productId (карточки + страница товара, если открыта) синхронизируются через одну функцию.
4. **Открытие страницы товара:** ставится `dataset.productId`, запускается один `checkFavorite(prod.id)`; при ответе UI обновляется только если пользователь ещё не нажимал лайк (`!userHasToggledFavorite`). Клик по лайку на странице товара — как на карточке: optimistic, toggle, один count, обновление всех кнопок по productId.
5. **Открытие страницы «Избранное»:** `getFavorites()` (один GET list), рендер клонами карточек в `#favorites-items` с уже выставленным `favorite-active`. Удаление из избранного на этой странице — toggle, внутри один count; при нуле товаров показывается заглушка.
6. **Закрытие страницы избранного:** `syncFavoritesCache()` (актуальный list), при необходимости перезагрузка данных; кнопки на главной обновляются по кэшу в `refreshFavoritesOnMainPage()`.

Вся визуальная индикация «в избранном» держится на классе **favorite-active** на кнопках и на классе **favorites-has-items** на кнопке избранного в шапке; логика — в модуле **favorites.js** (кэш + API) и в **updateFavoriteUIForProduct** в **products_render.js** (единое обновление по productId).
