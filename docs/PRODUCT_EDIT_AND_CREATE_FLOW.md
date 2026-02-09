# Редактирование и создание товара: как работают и как связаны

## Кратко

- **Редактирование** — только в **webapp**: страница товара → кнопка «Редактировать» → страница `edit-product-page` → сохранение через несколько **PATCH**-запросов.
- **Создание** — только в **Telegram-боте**: FSM «Добавить товар» → ввод полей → один **POST** на `/api/products/`.
- В одном UI они **не объединены**: в веб-приложении нет формы «Создать товар», только редактирование существующего. Общее — модель товара на бэкенде и набор полей (название, описание, цены, тип товара и т.д.).

---

## 1. Редактирование товара (webapp)

### 1.1 Точка входа

- Пользователь открывает **страницу товара** (`#product-page`), рендер в `webapp/js/handlers/products_modal.js`.
- Для владельца (`role === 'owner'` и `prod.user_id === appContext.shop_owner_id`) показывается кнопка **«✏️ Редактировать»**.
- По клику вызывается `showEditProductModalCallback(prod)`. В `app.js` этот колбэк подменён на **`showEditProductPage(prod)`** из `product-edit.js` (то есть открывается не модалка, а страница).

```text
products_modal.js (кнопка "Редактировать")
    → showEditProductModalCallback(prod)
    → в app.js передаётся showEditProductModal: showEditProductPage
    → product-edit.js: showEditProductPage(prod)
```

### 1.2 Открытие формы

**Файл:** `webapp/js/product-edit.js`

- **`showEditProductPage(prod)`**  
  - Скрывает все страницы (`hideAllPages()`), показывает `#edit-product-page`.  
  - Кнопка «Назад» ведёт в `closeEditProductPage()` (возврат на страницу товара).  
  - Вызывает **`showEditProductForm(prod, closeEditProductPage)`**.

- **`showEditProductForm(prod, onCancel)`**  
  - Устанавливает текущий товар: `currentProductSetter(prod)`.  
  - Заполняет форму значениями из `prod`:
    - название, описание;
    - для обычного товара: цена, скидка, количество, единица, «под заказ», «показ количества», «продажа»;
    - для товара «на продажу» (`is_for_sale`): тип цены (range/fixed), price_from, price_to, price_fixed, quantity_from, quantity_unit.
  - На кнопку **«💾 Сохранить»** вешает: `saveProductEdit(prod.id)`.
  - На **«❌ Отменить»** — `onCancel`.

То есть форма всегда работает с **уже существующим** товаром (`prod.id`).

### 1.3 Сохранение (редактирование)

**Функция:** `saveProductEdit(productId)` в `product-edit.js`

1. Читает значения из полей формы (`#edit-name`, `#edit-description`, `#edit-price`, и т.д.).
2. Определяет тип: обычный товар или «на продажу» (`isForSale` из `currentProduct`).
3. Валидация (название обязательно; для цен/количества — свои правила).
4. Вызовы API (все **PATCH**, `user_id` = `appContext.shop_owner_id`):
   - **Всегда:** `updateProductNameDescriptionAPI(productId, …, newName, newDescription)`.
   - Если **is_for_sale**:  
     `updateProductForSaleAPI(productId, …, { is_for_sale, price_type, price_from, price_to, price_fixed, quantity_from, quantity_unit })`.
   - Если **обычный товар**:  
     `updateProductAPI` (price/discount),  
     `updateProductQuantityAPI`,  
     `updateProductQuantityShowEnabledAPI`,  
     `updateProductMadeToOrderAPI`,  
     `updateProductSaleEnabledAPI`.
5. После успеха: закрытие страницы редактирования, `loadData()` для обновления списка, при открытой странице товара — обновление её данных через `showProductModalCallback(updatedProduct, …)`.

Итог: редактирование — это **только обновление** существующего товара по `productId`, через несколько раздельных PATCH-эндпоинтов.

---

## 2. Создание товара

### 2.1 Где создаётся

- В **webapp** создания товара **нет**: нет страницы «Добавить товар» и нет вызова POST на создание. В контексте есть флаг `can_create_products` (например, в `app.js` для owner), но отдельная форма создания в веб-интерфейсе не используется.
- Создание делается в **Telegram-боте**: сценарий «Добавить товар» (FSM в `bot/handlers/products.py`).

### 2.2 Бот: FSM и отправка на бэкенд

**Файл:** `bot/handlers/products.py`

- Пользователь по шагам вводит: название, категорию, тип товара (обычный / на продажу / под заказ / C2C), цены (в т.ч. price_card, price_cash при необходимости), описание, фото.
- Данные хранятся в FSM state (`state.get_data()`).
- В конце (например, по команде `/done` после фото) вызывается **`_create_product_from_state(message, state, photos_list)`**:
  - Собирается **FormData** из `state`: name, category_id, user_id, description, discount, quantity, is_made_to_order, is_for_sale, price_type, price_from, price_to, price_fixed, quantity_from, quantity_unit, price_card, price_cash, is_sale_enabled, is_client_sale и т.д.
  - Фото добавляются в форму как файлы.
  - Один запрос **POST** на `{API_URL}/products/` с этой формой.
- Ответ бэкенда обрабатывается, state очищается, показывается управление товарами.

### 2.3 Бэкенд: создание

- **Роутер:** `backend/app/routers/products.py` — эндпоинт **POST `/`** с полями `Form(...)` / `File(...)` (name, price, category_id, user_id, description, discount, is_for_sale, price_from, price_to, price_fixed, price_card, price_cash, images и др.).
- **Обработчик:** `backend/app/handlers/products_create.py` — **`create_product(...)`**:
  - Конвертирует строковые флаги в bool.
  - Для C2C при необходимости подставляет seller_id из контекста.
  - Сохраняет изображения, формирует `images_urls`.
  - Создаёт запись товара в БД и возвращает её (схема Product).

Итог: создание — **один POST** с полным набором полей и файлами; редактирование — **много PATCH** по разным атрибутам.

---

## 3. Как связаны редактирование и создание

### 3.1 Общее

- Одна и та же **модель товара** на бэкенде (Product) и те же поля: name, description, price (legacy), price_card, price_cash, price_old, discount, quantity, is_made_to_order, is_for_sale, price_type, price_from, price_to, price_fixed, quantity_from, quantity_unit, quantity_show_enabled, is_sale_enabled и т.д.
- Форма **редактирования** в webapp умеет и обычный товар, и «на продажу» (диапазон/фикс цены, количество «от» и т.д.) — те же концепции, что и при создании в боте.
- Бэкенд при создании принимает тот же набор полей, что потом редактируется через PATCH (разбиение на эндпоинты только при редактировании).

### 3.2 Различия

| Аспект              | Редактирование (webapp)           | Создание (бот)                |
|---------------------|-----------------------------------|-------------------------------|
| Где                 | Страница `#edit-product-page`     | Telegram FSM                  |
| Вход                | Уже выбранный товар `prod`        | Пошаговый ввод полей          |
| Запросы к API       | Несколько PATCH по productId     | Один POST на `/api/products/` |
| Наличие productId   | Всегда есть (`prod.id`)           | Нет (товар создаётся)         |

### 3.3 Нет единой формы «создать или редактировать»

- В webapp **нет** режима «создать новый товар»: не вызывается POST и не открывается форма без `prod.id`.
- Чтобы добавить товар, пользователь идёт в бота; чтобы изменить — в webapp открывает товар и нажимает «Редактировать».
- Теоретически форму `edit-product-page` можно было бы использовать и для создания: открывать с `prod = { пустые поля }` и в `saveProductEdit` при отсутствии `productId` вызывать POST. Сейчас так не сделано.

---

## 4. Схема потоков

```
Редактирование (webapp):
  product-page → "Редактировать" → showEditProductPage(prod)
       → edit-product-page, showEditProductForm(prod)
       → "Сохранить" → saveProductEdit(prod.id)
       → updateProductNameDescriptionAPI + updateProductAPI + updateProductQuantityAPI + ...

Создание (бот):
  /add или кнопка "Добавить товар" → FSM AddProduct
       → ввод name, category, price_card/price_cash, description, photos, ...
       → /done → _create_product_from_state(...)
       → POST /api/products/ (FormData)
       → backend create_product_handler → БД
```

---

## 5. Файлы для быстрого поиска

- **Редактирование (frontend):**  
  `webapp/js/product-edit.js` — `showEditProductPage`, `showEditProductForm`, `saveProductEdit`.  
  `webapp/js/handlers/products_modal.js` — кнопка «Редактировать».  
  `webapp/js/app.js` — подмена `showEditProductModal` на `showEditProductPage`.

- **API обновления:**  
  `webapp/js/api/products_update.js` и реэкспорт в `webapp/js/api.js` (updateProductAPI, updateProductNameDescriptionAPI, updateProductForSaleAPI и др.).

- **Создание (бот):**  
  `bot/handlers/products.py` — FSM AddProduct, `_create_product_from_state`, POST на `/products/`.

- **Создание (бэкенд):**  
  `backend/app/routers/products.py` — POST `/`.  
  `backend/app/handlers/products_create.py` — `create_product`.
