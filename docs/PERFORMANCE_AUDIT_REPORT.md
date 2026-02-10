# Аудит производительности и сетевых запросов — PriseMiniApp

**Дата:** 2025-02-10  
**Область:** статический анализ frontend (JS) + backend (FastAPI), без добавления нового кода.

---

## A) Executive summary

Лавину запросов создают в основном **избранное (favorites)** и цепочки перезагрузки данных:

1. **Рендер карточек:** при каждом вызове `renderProducts(products)` выполняется **1 запрос** `GET /api/favorites/list` (syncFavoritesCache) и **по одному** `GET /api/favorites/check/{id}` **на каждый товар**. При 50 товарах это 1 + 50 = 51 запрос на каждую загрузку/фильтрацию.
2. **Повторный рендер:** смена фильтра/поиска вызывает `applyFilters()` → `renderProducts(filteredProducts)` → снова syncFavoritesCache + N×check. Один ввод в поиск = ещё 1 + N запросов.
3. **Дублирование count:** `updateFavoritesCount()` вызывается из initFavorites (setTimeout 500ms), из app init (setTimeout 600ms), при каждом клике по кнопке корзины, после каждого toggle и в нескольких местах после toggle повторно — без дедупликации.
4. **Закрытие страницы избранного:** `closeFavoritesPage()` вызывает `syncFavoritesCache()`, затем `loadData()`, что снова запускает `renderProducts` → ещё 1 list + N check.
5. **Страница товара:** при открытии страницы товара запускается асинхронный `checkFavorite(prod.id)`. Если пользователь успевает нажать «лайк» до ответа, срабатывает optimistic UI и toggle; когда позже приходит ответ первого check с `is_favorite: false`, он перезаписывает UI и снимает класс `favorite-active` — отсюда баг «лайк на странице товара не показывается».

Итого: основные источники — **N×check при каждом рендере**, **повторные list/count без кэша/дедупа** и **гонка check vs toggle на странице товара**.

---

## B) Таблица Endpoints (favorites и ключевые вызовы)

| Endpoint | Где вызывается | Триггер | Частота (оценка) | Риск |
|----------|----------------|---------|------------------|------|
| `GET /api/favorites/check/{product_id}` | `webapp/js/favorites.js` — `checkFavorite()` (стр. 21–51) | Вызывается из: (1) `products_render.js` — `safeCheckFavorite(prod.id)` в цикле для каждой карточки (стр. 259) и для кнопки списка (стр. 996); (2) `products_modal.js` — при открытии страницы товара в async IIFE (стр. 1480–1482); (3) `favorites.js` — `refreshFavoritesOnMainPage()` в цикле для товаров с рассинхроном (стр. 407); (4) `cartNew.js` — при отрисовке карточки в корзине (стр. 437–438) | На 1 рендер сетки: **N запросов** (N = число товаров). На открытие страницы товара: **1**. При закрытии избранного и refresh: до **M** (M = число несовпадений) | **P0** |
| `POST /api/favorites/toggle/{product_id}` | `webapp/js/favorites.js` — `toggleFavorite()` (стр. 58–93) | Клик по кнопке избранного: карточка (products_render.js 306), список (1007–1018), страница товара (products_modal.js 1521–1522), страница избранного (favorites.js 704), корзина (cartNew.js 459) | 1 на клик | P1 (многократный count после — см. ниже) |
| `GET /api/favorites/list?shop_owner_id=...` | `webapp/js/favorites.js` — `syncFavoritesCache()` (98–132), `getFavorites()` (136–164) | (1) В начале `renderProducts()` — syncFavoritesCache (products_render.js 94–96). (2) initFavorites — setTimeout 500ms → syncFavoritesCache (favorites.js 231). (3) closeFavoritesPage → syncFavoritesCache (favorites.js 306). (4) loadFavoritesPage → getFavorites (favorites.js 419). (5) refreshFavoritesOnMainPage не вызывает list сам, но closeFavoritesPage перед ним уже вызвал sync | На 1 loadData/applyFilters: **1**. При открытии избранного: **1**. При закрытии избранного: **1** + затем loadData → снова 1 в renderProducts | **P0** |
| `GET /api/favorites/count?shop_owner_id=...` | `webapp/js/favorites.js` — `updateFavoritesCount()` (166–191) | (1) Внутри toggleFavorite после каждого toggle (favorites.js 86). (2) app.js — tryUpdateFavoritesCount по setTimeout 600ms (707) и по клику на cart-button (715). (3) initFavorites — setTimeout 500ms → updateFavoritesCount (app.js 110–112). (4) products_modal.js после toggle (1524–1525). (5) products_render.js после toggle на карточке и списке (316–317, 1021–1022). (6) favorites.js — loadFavoritesPage в конце (872), при удалении из избранного на странице избранного (709) | Один toggle даёт **1 count** из toggleFavorite + часто **ещё 1–2** из обработчиков (modal, render). Init: **2** (500ms и 600ms). Каждый клик по корзине: **1** | **P1** |

Остальные API (products, categories, cart, orders, etc.) вызываются по сценарию (открытие страницы, действие пользователя); лавину дают в основном favorites.

---

## C) Таблица Hotspots (топ-10 источников дубликатов)

| № | Причина | Где | Как проявляется | Как исправить (минимально) |
|---|--------|-----|-----------------|----------------------------|
| 1 | N запросов check на каждый рендер | `webapp/js/handlers/products_render.js`: в начале `renderProducts()` вызывается syncFavoritesCache (1 list), затем в цикле `products.forEach(prod => ...)` для каждой карточки и для кнопки списка вызывается `safeCheckFavorite(prod.id)` (стр. 259, 996) | При загрузке главной, смене категории/поиска/фильтра — 1 list + N check. 50 товаров = 51 запрос за один «экран» | После syncFavoritesCache не вызывать check по одному. Использовать результат list (или кэш в favorites.js): передать в рендер множество id избранного и выставлять favorite-active по нему без запросов check |
| 2 | Повторный list + N check при закрытии избранного | `webapp/js/favorites.js`: closeFavoritesPage (296–331) вызывает syncFavoritesCache(), затем loadData(). loadData в data.js в конце вызывает applyFilters() → renderProducts() → снова syncFavoritesCache + N×safeCheckFavorite | Закрытие страницы избранного даёт 1 list (close) + полный loadData (categories + products) + ещё 1 list и N check в renderProducts | Не вызывать loadData() после sync в closeFavoritesPage, или вызывать только обновление состояния кнопок по уже полученному sync (без полного перерендера). Либо один раз sync + обновить UI карточек из кэша без нового рендера |
| 3 | Двойной вызов updateFavoritesCount при инициализации | `webapp/js/app.js`: tryInitFavorites (100–118) — setTimeout 500ms → updateFavoritesCount; отдельно шаг 12 (705–709) — setTimeout 600ms → tryUpdateFavoritesCount. Оба делают одно и то же | В первые секунды после загрузки — 2 запроса GET /api/favorites/count | Один точку входа: либо только tryUpdateFavoritesCount через 500–600ms, либо только в initFavorites; убрать второй вызов |
| 4 | updateFavoritesCount при каждом открытии корзины | `webapp/js/app.js` (712–716): на кнопку корзины вешается tryUpdateFavoritesCount. Каждый клик по корзине = 1 count | Частое открытие корзины без смены избранного даёт лишние count | Вызывать count только при закрытии страницы избранного или после toggle; не при открытии корзины. Либо дедуп по времени (не чаще 1 раз в N секунд) |
| 5 | Многократный count после одного toggle | После toggle вызывается updateFavoritesCount: (1) внутри toggleFavorite (favorites.js 86); (2) в products_render в обработчике клика (316–317); (3) в products_modal в обработчике (1524–1525); (4) в favorites.js на странице избранного (709) | Один клик «лайк» может дать 2–3 запроса count | Оставить один вызов updateFavoritesCount — только внутри toggleFavorite; убрать повторные вызовы из обработчиков в products_render, products_modal, favorites.js |
| 6 | refreshFavoritesOnMainPage вызывает check для «несовпадений» | `webapp/js/favorites.js` (377–416): собираются productIds с рассинхроном (визуально в избранном ≠ кэш), затем для каждого вызывается checkFavorite(productId) через Promise.all | После закрытия избранного при наличии рассинхрона — до M запросов check | Устранить причину рассинхрона (гонка check/toggle). После syncFavoritesCache обновлять UI только из кэша, не перепроверять check по одному |
| 7 | loadData при любом действии админа/настройках | `webapp/js/admin.js` (492, 619, 654), admin_settings.js (63, 213, 249), product-edit (1074, 1316, 1370, 1464), reservations/orders/purchases/sale_orders при завершении/отмене вызывают loadDataCallback() | Каждое такое действие = полная перезагрузка данных и снова renderProducts → 1 list + N check | Не обязательно менять архитектуру: достаточно в renderProducts убрать N×check (см. п.1); тогда каждый loadData даст только 1 list |
| 8 | Нет дедупа/отмены для check при быстром переключении | При быстром переключении категорий/поиска несколько вызовов renderProducts могут выполняться подряд; старые safeCheckFavorite не отменяются | Много «висящих» check, часть приходит после смены контента | Использовать один список избранного из sync (п.1). При необходимости оставить check — использовать AbortController и отменять при новом рендере |
| 9 | Страница товара: check после открытия без учёта toggle | `webapp/js/handlers/products_modal.js` (1477–1487): при открытии страницы запускается async IIFE с checkFavorite(prod.id) и затем updateFavoriteUIForProduct(prod.id, isFavorite). Обработчик клика делает optimistic update и toggle | Гонка: ответ check приходит после toggle и перезаписывает UI устаревшим is_favorite (часто false) | См. раздел D (Favorites bug) |
| 10 | loadFavoritesPage вызывает renderProducts и updateFavoritesCount | `webapp/js/favorites.js`: loadFavoritesPage (419) вызывает getFavorites (1 list), затем renderProducts(products) (647) — что снова вызывает syncFavoritesCache + N check в renderProducts; в конце ещё updateFavoritesCount (872) | Открытие страницы избранного: 1 list (getFavorites) + при renderProducts ещё 1 list (sync) + N check + 1 count | Не вызывать renderProducts для страницы избранного так, чтобы он делал sync + N check. Либо рендерить список из уже полученного getFavorites без повторного sync/check; один count в конце оставить |

---

## D) Раздел «Favorites bug»

### Симптом

Если лайкнуть на **странице товара** — товар добавляется в избранное, но UI **не показывает** active ни на странице, ни на карточке. Если лайкнуть с **карточки** — всё работает.

### Реальная причина (конкретный баг)

**Гонка между первым check при открытии страницы и ответом после toggle.**

- В `webapp/js/handlers/products_modal.js` при показе страницы товара (около 1464–1487):
  - Выставляется `productTopMenuFavorite.dataset.productId = prod.id` (стр. 1467).
  - Запускается **асинхронная** IIFE без await:
    - `const isFavorite = await favoritesModule.checkFavorite(prod.id);`
    - `updateFavoriteUIForProduct(prod.id, isFavorite);`
  - Вешается обработчик клика на кнопку избранного (optimistic update + toggle + updateFavoriteUIForProduct по ответу).

- Пользователь быстро нажимает «лайк»:
  - Optimistic update ставит `favorite-active` на кнопку страницы и через `updateFavoriteUIForProduct` — на все кнопки с этим productId.
  - Уходит `toggleFavorite(prod.id)`.
  - Ответ toggle приходит, вызывается `updateFavoriteUIForProduct(prod.id, result.is_favorite)` — UI остаётся правильным.
  - **Позже** приходит ответ **первого** `checkFavorite(prod.id)` (запроса при открытии страницы). Он был отправлен **до** toggle и возвращает старое состояние `is_favorite: false`. Код в IIFE вызывает `updateFavoriteUIForProduct(prod.id, isFavorite)` с этим false и **перезаписывает** класс на кнопке страницы и карточках, снимая `favorite-active`.

- На карточке тот же перезаписывающий вызов из IIFE отсутствует (для карточки нет такого отложенного check после открытия страницы), поэтому при лайке с карточки гонки нет и UI остаётся верным.

Итог: **не «не тот элемент» и не «dataset не установлен»** — элемент и dataset корректны. Баг именно в том, что **поздний ответ check перетирает результат toggle**.

### План минимальной правки

1. **Optimistic на странице товара (уже есть):** при клике сразу вызывать `updateFavoriteUIForProduct(productId, newFavoriteState)` — это уже делается (стр. 1516).
2. **Не дать check перетирать toggle:** в `products_modal.js` в async IIFE после `await favoritesModule.checkFavorite(prod.id)` **не вызывать** `updateFavoriteUIForProduct(prod.id, isFavorite)`, если пользователь уже нажимал кнопку (например, проверять `favoriteButton.dataset.processing === 'true'` или отдельный флаг «toggle уже выполнялся для этого продукта на этой странице»). Либо: сохранить при старте IIFE «версию» (например, timestamp или счётчик) и при ответе check вызывать update только если пользователь не делал toggle (например, флаг `userHasToggledFavorite` сбрасывать при открытии страницы и ставить в true в обработчике клика; в IIFE применять результат check только если !userHasToggledFavorite).
3. **Синхронизация кнопки страницы и карточек:** оставить единую точку обновления — `updateFavoriteUIForProduct(productId, isFavorite)` из `products_render.js`: она уже обновляет и `.favorite-button-card[data-product-id]`, и `#product-top-menu-favorite` при совпадении `topBtn.dataset.productId === id`. После устранения перетирания из IIFE синхронизация будет работать.
4. **Исключить конфликт check/toggle:** как в п.2 — не применять результат начального check, если уже был toggle; тогда «check перетирает toggle» исчезнет.

Конкретно в коде: в блоке IIFE (стр. 1477–1487) перед вызовом `updateFavoriteUIForProduct(prod.id, isFavorite)` добавить условие: не обновлять, если кнопка уже в состоянии «обработка» или если установлен флаг «пользователь уже нажал избранное на этой странице». Минимально — один флаг при открытии страницы (false), при клике на favorite ставить true; в IIFE вызывать update только если флаг false.

---

## E) Чек-лист ручной проверки (без кода)

- **Что открыть:** фронт на localhost:5173 (или раздача из backend), бэкенд на localhost:8000; авторизация через Telegram (initData).
- **DevTools → Network:** фильтр по «favorites» или по URL `/api/favorites/`. Смотреть столбец Initiator (или вкладку Initiator в деталях запроса) — откуда вызван fetch (файл/строка).
- **Сценарии для подсчёта запросов:**
  1. Полная загрузка приложения (до появления сетки): ожидаем 1 list + N check (N = число товаров), 1–2 count. После правок по отчёту: 1 list, 0 check, 1 count.
  2. Ввод в поиск (одно изменение): сейчас — ещё 1 list + N check. После правок — 0 лишних (если рендер использует только кэш list).
  3. Открытие страницы товара: 1 check. Клик «лайк»: 1 toggle + 1–2 count. Убедиться, что после клика класс `favorite-active` остаётся на кнопке и на карточке (проверка бага из раздела D).
  4. Закрытие страницы избранного: сейчас — 1 list (close) + полный loadData и снова list + N check. После правок — без второго list и без N check.
  5. Открытие корзины по клику: сейчас — 1 count при каждом открытии. После правок — без лишнего count или с дедупом.
- **Подтверждение причины:** в Network при «лайк на странице товара» увидеть два запроса к favorites для одного product_id: один GET check (инициирован при открытии страницы), один POST toggle (при клике). Если ответ check приходит после toggle и при этом UI сбрасывается — причина подтверждена.

---

## Дополнительно: цепочки вызовов (для отладки)

- **loadData:** `app.js` DOMContentLoaded → loadData() → data.js loadData() → fetchCategories, fetchProducts, applyFilters() → filters.js applyFiltersCallback() → **renderProducts(filteredProducts)** → products_render.js: syncFavoritesCache() + для каждого товара safeCheckFavorite(prod.id).
- **Страница товара:** products_modal.js (showProductModal / отрисовка страницы) → productTopMenuFavorite.dataset.productId = prod.id; async IIFE: checkFavorite(prod.id) → updateFavoriteUIForProduct. Клик: updateFavoriteUIForProduct(optimistic) → toggleFavorite(prod.id) → updateFavoritesCount() → updateFavoriteUIForProduct(prod.id, result.is_favorite).
- **Инициализация избранного:** app.js tryInitFavorites → initFavorites() (favorites.js) → setTimeout 500ms syncFavoritesCache, app.js шаг 12 setTimeout 600ms tryUpdateFavoritesCount → оба дают list/count.

Все выводы и рекомендации основаны только на анализе существующих файлов и конфигов; правки в коде не вносились.
