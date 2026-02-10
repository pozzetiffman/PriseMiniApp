# ПОЛНАЯ ДИАГНОСТИКА: UI не обновляет кнопки/иконки после изменения типа товара

## 1. FILES INVOLVED (Список файлов с назначением)

### Backend (Источник истины)
| Файл | Назначение | Ключевые функции/классы |
|------|-----------|-------------------------|
| `backend/app/utils/product_action_type.py` | **ИСТОЧНИК ИСТИНЫ** - вычисление `action_type` и `can_add_to_cart` | `get_product_action_type()`, `get_product_action_type_dict()` |
| `backend/app/handlers/products_read.py` | Сериализация товаров с `action_type` | `get_product_by_id()`, `get_products_list()` (строки 114-125, 532-542) |
| `backend/app/handlers/products_update.py` | Обновление флагов товара | `update_sale_enabled()` (строка 563), `update_reservation_enabled()` (строка 619), `update_made_to_order()` (строка 480) |
| `backend/app/models/product.py` | Модель товара | Поля: `action_type`, `can_add_to_cart`, `reason_not_sale`, `is_sale_enabled`, `is_made_to_order`, `is_reservation_enabled` |

### Frontend - Данные и кэш
| Файл | Назначение | Ключевые переменные/функции |
|------|-----------|------------------------------|
| `webapp/js/app.js` | Главный entry point, управление `allProducts` | `let allProducts = []` (строка 59), `window.getAllProducts = () => allProducts` (строка 332) |
| `webapp/js/data.js` | Загрузка товаров, обновление `allProducts` | `loadData()` (строка 27), `allProductsSetter(products)` (строка 197), `window.getAllProducts()` (строка 203) |
| `webapp/js/filters.js` | Фильтрация и рендеринг | `applyFilters()` (строка 333), вызывает `renderProductsCallback(filteredProducts)` (строка 490) |

### Frontend - Рендеринг товаров
| Файл | Назначение | Ключевые функции |
|------|-----------|------------------|
| `webapp/js/handlers/products_render.js` | Рендеринг карточек товаров, кнопок действий | `renderProducts()` (строка 65), рендер action button (строки 384-553), обработчик клика (строки 463-552) |
| `webapp/js/utils/productActionType.js` | Определение типа действия и иконки | `getProductActionType()` (строка 21), `getActionIcon()` (строка 94), `canAddToCart()` (строка 145) |

### Frontend - Модальные окна и bottom sheets
| Файл | Назначение | Ключевые функции |
|------|-----------|------------------|
| `webapp/js/handlers/products_modal.js` | Страница товара, bottom sheet | `showProductModal()` (строка 809), `updateProductPageBottomSheet()` (строка 1626), обработчик события `product:updated` (строки 113-179) |
| `webapp/js/cart/cartBottomSheet.js` | Bottom sheet для корзины/действий | `showCartBottomSheet()` (строка 648), `primaryBtnHandler()` (строка 488), использует `currentProduct` (строка 495) |

### Frontend - Редактирование товара
| Файл | Назначение | Ключевые функции |
|------|-----------|------------------|
| `webapp/js/product-edit.js` | Редактирование товара, сохранение | `saveProductEdit()` (строка 652), обновление `allProducts` (строки 1008-1088), эмиссия события `product:updated` (строки 1032-1066) |
| `webapp/js/api/products_update.js` | API вызовы для обновления флагов | `updateProductSaleEnabledAPI()` (строка 360), `updateProductReservationEnabledAPI()` (строка 402) |

### Frontend - Дополнительные модули
| Файл | Назначение | Ключевые функции |
|------|-----------|------------------|
| `webapp/js/favorites.js` | Страница избранного | Использует `renderProducts()` из `products_render.js` |
| `webapp/js/cart/cartStore.js` | Хранилище корзины | `getCartItems()`, `isProductInCart()`, `getProductQuantityInCart()` |
| `webapp/js/cart/cartNew.js` | Логика корзины | `addProductToCart()` (строка 686) |

---

## 2. DATA FLOW (Поток данных)

### Источник истины (Backend)
```
1. БД (SQLite) → models.Product
   ├── is_sale_enabled (Boolean)
   ├── is_made_to_order (Boolean)
   ├── is_reservation_enabled (Boolean)
   └── другие поля...

2. Backend вычисляет action_type:
   backend/app/utils/product_action_type.py
   ├── get_product_action_type() → (action_type, can_add_to_cart, reason_not_sale)
   └── Приоритет: purchase > sale (C2C) > sale (shop) > order > reserve > none

3. Сериализация в API ответ:
   backend/app/handlers/products_read.py
   ├── get_product_by_id() → добавляет action_type_info в product_dict (строка 120)
   └── get_products_list() → добавляет action_type_info для каждого товара (строка 537)
```

### Frontend - Загрузка и кэширование
```
1. Начальная загрузка:
   app.js:59 → let allProducts = []
   ↓
   data.js:27 → loadData()
   ├── fetchProducts() → API /api/products/
   ├── allProductsSetter(products) → обновляет allProducts (data.js:197)
   ├── window.getAllProducts = () => allProducts (data.js:203)
   └── applyFilters() → вызывает renderProducts(filteredProducts) (filters.js:490)

2. Структура кэша allProducts:
   - Хранится в app.js:59 как let allProducts = []
   - Доступ через window.getAllProducts() (app.js:332, data.js:203)
   - Обновляется через allProductsSetter (передается из app.js в data.js)
   - Каждый продукт содержит: { id, action_type, can_add_to_cart, is_sale_enabled, ... }
```

### Frontend - Обновление после редактирования
```
1. Сохранение в product-edit.js:
   saveProductEdit(productId) (строка 652)
   ├── API PATCH → updateProductSaleEnabledAPI() / updateProductReservationEnabledAPI()
   ├── Получение свежего товара: fetchProductById() → freshOwnerProduct / freshClientProduct
   ├── loadDataCallback() → перезагружает все товары (строка 1005)
   └── Обновление кэша allProducts (строки 1009-1028)
       ├── allProductsGetter() → получает текущий список
       ├── map() → заменяет старый товар на freshOwnerProduct/freshClientProduct
       ├── allProductsSetter(next) → обновляет кэш
       ├── applyFiltersCallback() → перерисовывает сетку
       └── dispatchEvent('product:updated') → эмитит событие (строка 1044)

2. Обработка события product:updated:
   products_modal.js:113 → productUpdateHandler()
   ├── Проверяет, открыта ли product-page
   ├── Ищет товар в allProducts по ID
   └── updateProductPageBottomSheet(cachedProduct) → обновляет bottom sheet (строка 159)
```

---

## 3. RENDER FLOW (Поток рендеринга)

### A) Начальная загрузка
```
app.js:init() 
  → data.js:loadData()
     → fetchProducts() → products[]
     → allProductsSetter(products) → обновляет allProducts
     → filters.js:applyFilters()
        → filters.js:renderProductsCallback(filteredProducts)
           → products_render.js:renderProducts(products)
              → Для каждого prod:
                 ├── Создает карточку товара
                 ├── Определяет action_type:
                 │   ├── ПРИОРИТЕТ: prod.action_type (от бэка) (строка 393)
                 │   └── FALLBACK: getProductActionType(prod, ...) (строка 405)
                 ├── getActionIcon(actionType) → иконка (🛒/🔒/📦/💰)
                 └── Создает actionButton с обработчиком клика
                    → onClick → получает freshProduct из allProducts (строки 477-499)
                    → showCartBottomSheet(actualProduct)
```

### B) Открытие товара (product-page)
```
products_render.js:actionButton.onclick (строка 463)
  → showProductModal(prod, ...) (products_modal.js:809)
     ├── Заполняет product-page (изображение, название, цена)
     ├── updateProductPageBottomSheet(product) (строка 1596)
     │   ├── Получает freshProduct из allProducts (строки 1632-1643)
     │   ├── Определяет action_type через getProductActionType(freshProduct, ...)
     │   ├── getActionButtonText(actionType) → текст кнопки
     │   └── Обновляет DOM: primaryBtn.textContent = "Купить сейчас" / "Зарезервировать" / ...
     └── Устанавливает обработчик клика на primaryBtn
        → primaryBtnHandler() → выполняет действие (sale/reserve/order/purchase)
```

### C) Изменение тумблера в редактировании
```
product-edit.js:showEditProductForm() (строка 644)
  → Пользователь меняет тумблер (sale_enabled / made_to_order / reservation_enabled)
  → saveProductEdit(productId) (строка 652)
     ├── updateProductSaleEnabledAPI() → PATCH /api/products/{id}/update-sale-enabled
     │   → backend: update_sale_enabled() → обновляет БД
     │   → Возвращает { is_sale_enabled: true/false }
     ├── loadDataCallback() → перезагружает все товары (строка 1005)
     ├── Обновление allProducts кэша (строки 1009-1028):
     │   ├── allProductsGetter() → получает список
     │   ├── map() → заменяет товар на freshOwnerProduct/freshClientProduct
     │   │   └── ВАЖНО: freshOwnerProduct содержит action_type от бэка
     │   ├── allProductsSetter(next) → обновляет кэш
     │   └── applyFiltersCallback() → перерисовывает сетку
     ├── dispatchEvent('product:updated') → эмитит событие (строка 1044)
     └── products_modal.js:productUpdateHandler() → слушает событие
        ├── Проверяет, открыта ли product-page
        ├── Ищет товар в allProducts
        └── updateProductPageBottomSheet(cachedProduct) → обновляет bottom sheet
```

### D) Проблема: UI не обновляется
```
ПРОБЛЕМА: После saveProductEdit() UI может не обновиться, потому что:

1. renderProducts() вызывается с filteredProducts из applyFilters()
   → Но если товар уже отрендерен, обработчик клика использует prod из замыкания
   → Обработчик получает freshProduct из allProducts (строки 477-499)
   → НО: если карточка не перерисована, actionButton.dataset.actionType остается старым

2. updateProductPageBottomSheet() получает freshProduct из кэша (строки 1632-1643)
   → НО: если событие product:updated не сработало или товар не найден в кэше
   → Bottom sheet остается с старым action_type

3. currentProduct в cartBottomSheet.js может быть устаревшим
   → Строка 495: actualProduct = currentProduct (из замыкания)
   → Получает freshProduct из allProducts (строки 497-504)
   → НО: если currentProduct не обновлен, может использоваться старый объект
```

---

## 4. TOGGLE FLOW (Поток изменения тумблеров)

### Таблица тумблеров и их влияние

| Тумблер | UI Element | Handler Function | API Endpoint | Fields Changed | Expected action_type | Expected Icon/Button |
|---------|-----------|-----------------|-------------|----------------|---------------------|---------------------|
| **is_sale_enabled** | `#edit-sale-enabled-input` | `product-edit.js:396` | `PATCH /api/products/{id}/update-sale-enabled` | `is_sale_enabled` (Boolean) | `"sale"` (если true) | 🛒 "Купить сейчас" |
| **is_made_to_order** | `#edit-made-to-order-input` | `product-edit.js:424` | `PATCH /api/products/{id}/update-made-to-order` | `is_made_to_order` (Boolean) | `"order"` (если true) | 📦 "Заказать сейчас" |
| **is_reservation_enabled** | `#edit-reservation-enabled-input` | `product-edit.js:401` | `PATCH /api/products/{id}/update-reservation-enabled` | `is_reservation_enabled` (Boolean) | `"reserve"` (если true) | 🔒 "Зарезервировать сейчас" |

### Взаимоисключение тумблеров
```
product-edit.js:406-417
- Только один из трех может быть включен: sale > order > reserve
- При включении одного другие автоматически выключаются
- Нормализация на бэкенде: normalize_action_flags() (products_update.py)
```

### Цепочка обновления после изменения тумблера
```
1. Пользователь меняет тумблер:
   editSaleEnabledInput.onchange → saveProductEdit()

2. API вызов:
   product-edit.js:882 → updateProductSaleEnabledAPI(productId, shopOwnerId, isSaleEnabled)
   → PATCH /api/products/{id}/update-sale-enabled
   → backend: update_sale_enabled() (products_update.py:563)
      ├── Обновляет БД: db_product.is_sale_enabled = bool(...)
      ├── normalize_action_flags() → сбрасывает order/reservation если sale=true
      ├── Синхронизирует с sync_siblings (боты)
      └── Возвращает { is_sale_enabled: bool }

3. Обновление кэша:
   product-edit.js:1005 → loadDataCallback() → перезагружает все товары
   product-edit.js:1009-1028 → обновляет allProducts с freshOwnerProduct/freshClientProduct
   → ВАЖНО: freshOwnerProduct содержит action_type от бэка (вычислен на бэке)

4. Перерисовка UI:
   product-edit.js:1029 → applyFiltersCallback() → renderProducts(filteredProducts)
   → products_render.js:renderProducts() → перерисовывает карточки
   → НО: если карточка уже отрендерена, обработчик клика может использовать старый prod

5. Обновление bottom sheet:
   product-edit.js:1044 → dispatchEvent('product:updated')
   → products_modal.js:productUpdateHandler() → updateProductPageBottomSheet(cachedProduct)
   → НО: если событие не сработало или товар не найден → bottom sheet не обновится
```

---

## 5. STALE OBJECT RISKS (Риски устаревших объектов)

### Риск 1: Обработчик клика использует prod из замыкания
**Файл:** `webapp/js/handlers/products_render.js`  
**Строки:** 463-552  
**Проблема:**
```javascript
actionButton.addEventListener('click', async (e) => {
    // prod захвачен из замыкания при создании карточки
    let actualProduct = prod; // ← Может быть устаревшим
    
    // Получает freshProduct из allProducts (строки 477-499)
    const freshProduct = allProducts.find(p => p.id === prod.id);
    if (freshProduct) actualProduct = freshProduct; // ← Исправлено, но...
    
    // НО: если allProducts не обновлен или товар не найден → используется старый prod
});
```
**Воспроизведение:**
1. Открыть товар с типом "sale" (кнопка 🛒)
2. Изменить тип на "reserve" в редактировании
3. Сохранить изменения
4. Кликнуть на кнопку действия на карточке
5. **Ожидаемый результат:** Кнопка должна быть 🔒, но может остаться 🛒

**Почему перерисовка не происходит:**
- `renderProducts()` перерисовывает карточки, но если обработчик уже создан, он использует `prod` из замыкания
- Исправление есть (строки 477-499), но если `allProducts` не обновлен → используется старый `prod`

---

### Риск 2: updateProductPageBottomSheet использует переданный product
**Файл:** `webapp/js/handlers/products_modal.js`  
**Строки:** 1626-1654  
**Проблема:**
```javascript
export async function updateProductPageBottomSheet(product) {
    // product передан как параметр → может быть устаревшим
    let freshProduct = product; // ← По умолчанию использует переданный
    
    // Получает freshProduct из кэша (строки 1632-1643) ← ИСПРАВЛЕНО
    const cachedProduct = allProducts.find(p => p.id === product.id);
    if (cachedProduct) freshProduct = cachedProduct;
    
    // НО: если товар не найден в кэше → используется переданный product
}
```
**Воспроизведение:**
1. Открыть товар с типом "sale" (bottom sheet показывает "Купить сейчас")
2. Изменить тип на "reserve" в редактировании
3. Сохранить изменения
4. **Ожидаемый результат:** Bottom sheet должен обновиться на "Зарезервировать сейчас"
5. **Проблема:** Если событие `product:updated` не сработало или товар не найден в кэше → bottom sheet остается с старым текстом

**Почему перерисовка не происходит:**
- Событие `product:updated` эмитится (строка 1044), но обработчик может не найти товар в кэше (строки 145-156)
- Если товар не найден → `updateProductPageBottomSheet()` не вызывается

---

### Риск 3: currentProduct в cartBottomSheet.js устаревший
**Файл:** `webapp/js/cart/cartBottomSheet.js`  
**Строки:** 490-508  
**Проблема:**
```javascript
let currentProduct = null; // ← Глобальная переменная

async function primaryBtnHandler() {
    // currentProduct установлен при открытии bottom sheet
    let actualProduct = currentProduct; // ← Может быть устаревшим
    
    // Получает freshProduct из allProducts (строки 497-504) ← ИСПРАВЛЕНО
    const freshProduct = allProducts.find(p => p.id === currentProduct.id);
    if (freshProduct) actualProduct = freshProduct;
    
    // НО: если allProducts не обновлен → используется старый currentProduct
}
```
**Воспроизведение:**
1. Открыть bottom sheet для товара с типом "sale"
2. Изменить тип на "reserve" в редактировании
3. Сохранить изменения
4. Кликнуть на primary button в bottom sheet
5. **Ожидаемый результат:** Должно открыться модальное окно резервации
6. **Проблема:** Может открыться модальное окно покупки (sale), если `currentProduct` устарел

**Почему перерисовка не происходит:**
- `currentProduct` устанавливается при открытии bottom sheet и не обновляется автоматически
- Исправление есть (строки 497-504), но если `allProducts` не обновлен → используется старый `currentProduct`

---

### Риск 4: showProductModal использует переданный prod
**Файл:** `webapp/js/handlers/products_modal.js`  
**Строки:** 809-1110  
**Проблема:**
```javascript
export function showProductModal(prod, finalPrice, fullImages, ...) {
    // prod передан как параметр → может быть устаревшим
    modalState.currentProduct = prod; // ← Сохраняется в состояние
    
    // updateProductPageBottomSheet(prod) вызывается с переданным prod (строка 1596)
    // НО: внутри функции получает freshProduct из кэша (строки 1632-1643) ← ИСПРАВЛЕНО
}
```
**Воспроизведение:**
1. Открыть товар с типом "sale"
2. Изменить тип на "reserve" в редактировании
3. Сохранить изменения
4. `showProductModalCallback(productForModal, ...)` вызывается (product-edit.js:1109)
5. **Ожидаемый результат:** Страница товара должна обновиться с новым типом
6. **Проблема:** Если `productForModal` устарел → `modalState.currentProduct` остается старым

**Почему перерисовка не происходит:**
- `productForModal` берется из `freshClientProduct || freshOwnerProduct` (строка 1095)
- Но если эти переменные не обновлены → передается старый объект

---

### Риск 5: Обработчик события product:updated не находит товар в кэше
**Файл:** `webapp/js/handlers/products_modal.js`  
**Строки:** 113-179  
**Проблема:**
```javascript
productUpdateHandler = (event) => {
    const { productId, clientVisibleId } = event.detail;
    const targetProductId = clientVisibleId || productId;
    
    // Ищет товар в кэше (строки 145-151)
    const cachedProduct = allProducts.find(p => 
        p && (p.id === targetProductId || 
             p.id === productId ||
             (p.sync_product_id && p.sync_product_id === targetProductId))
    );
    
    if (!cachedProduct) {
        // Товар не найден → ничего не делаем ← ПРОБЛЕМА
        return;
    }
    
    updateProductPageBottomSheet(cachedProduct); // ← Не вызывается, если товар не найден
}
```
**Воспроизведение:**
1. Открыть товар с типом "sale"
2. Изменить тип на "reserve" в редактировании
3. Сохранить изменения
4. Событие `product:updated` эмитится (product-edit.js:1044)
5. **Ожидаемый результат:** Bottom sheet должен обновиться
6. **Проблема:** Если товар не найден в кэше (например, из-за рассинхронизации ID) → bottom sheet не обновляется

**Почему перерисовка не происходит:**
- Поиск товара в кэше может не найти его из-за:
  - Рассинхронизации `productId` и `clientVisibleId`
  - Товар еще не обновлен в `allProducts` (race condition)
  - Неправильное сравнение ID (строка vs число)

---

## 6. MOST LIKELY ROOT CAUSES (Наиболее вероятные причины)

### Причина 1: Race condition между loadDataCallback и обновлением allProducts
**Файлы:** `webapp/js/product-edit.js` (строки 1004-1028)  
**Проблема:**
```javascript
// Сначала перезагружаем все товары
if (loadDataCallback) {
    await loadDataCallback(); // ← Асинхронная операция
}

// Затем обновляем allProducts кэш
if (allProductsGetter && allProductsSetter && (freshOwnerProduct || freshClientProduct)) {
    const list = allProductsGetter(); // ← Может получить старые данные, если loadDataCallback еще не завершился
    // ...
}
```
**Гипотеза:**
- `loadDataCallback()` вызывает `loadData()`, который асинхронно загружает товары
- Но обновление `allProducts` происходит сразу после вызова `loadDataCallback()`, не дожидаясь завершения загрузки
- В результате `allProductsGetter()` может вернуть старые данные

**Доказательства:**
- В `data.js:197` `allProductsSetter(products)` вызывается после `fetchProducts()`
- Но если `loadDataCallback()` не дождался завершения → `allProducts` не обновлен

---

### Причина 2: Событие product:updated не находит товар в кэше из-за рассинхронизации ID
**Файлы:** `webapp/js/handlers/products_modal.js` (строки 145-156)  
**Проблема:**
```javascript
const targetProductId = clientVisibleId || productId;
const cachedProduct = allProducts.find(p => 
    p && (p.id === targetProductId || 
         p.id === productId ||
         (p.sync_product_id && p.sync_product_id === targetProductId))
);

if (!cachedProduct) {
    return; // ← Товар не найден → bottom sheet не обновляется
}
```
**Гипотеза:**
- Поиск товара в кэше может не найти его из-за:
  - `productId` (owner) и `clientVisibleId` (client) могут отличаться
  - `sync_product_id` может быть не установлен или не совпадать
  - Тип данных ID (строка vs число) может не совпадать

**Доказательства:**
- В `product-edit.js:1095` используется `freshClientProduct || freshOwnerProduct`
- Но в событии `product:updated` поиск может не найти товар, если ID не совпадают

---

### Причина 3: renderProducts() не перерисовывает карточки, если товар уже отрендерен
**Файлы:** `webapp/js/handlers/products_render.js` (строка 65)  
**Проблема:**
```javascript
export async function renderProducts(products) {
    // Очищает сетку и перерисовывает все карточки
    productsGrid.innerHTML = ''; // ← Очищает сетку
    
    for (const prod of products) {
        // Создает новую карточку с новым обработчиком клика
        // НО: если товар уже отрендерен в другом месте (например, в избранном)
        // → обработчик клика может использовать старый prod из замыкания
    }
}
```
**Гипотеза:**
- `renderProducts()` перерисовывает карточки в основной сетке
- Но если товар отрендерен в другом месте (избранное, страница товара) → обработчики клика могут использовать старый `prod`

**Доказательства:**
- В `favorites.js` используется `renderProducts()` из `products_render.js`
- Но обработчики клика создаются при рендере и захватывают `prod` из замыкания

---

### Причина 4: updateProductPageBottomSheet вызывается с устаревшим product
**Файлы:** `webapp/js/product-edit.js` (строки 1112-1154 - ЗАКОММЕНТИРОВАНО)  
**Проблема:**
```javascript
// ========== ИСПРАВЛЕНИЕ: Принудительное обновление bottom sheet ==========
// ВРЕМЕННО ОТКЛЮЧЕНО для диагностики проблемы загрузки приложения
/*
if (isProductPageOpen && productForModal) {
    // Получаем СВЕЖИЙ продукт из кэша
    const freshProductFromCache = allProducts.find(...);
    await updateProductPageBottomSheet(productToUpdate);
}
*/
```
**Гипотеза:**
- Код для принудительного обновления bottom sheet **ЗАКОММЕНТИРОВАН**
- После сохранения bottom sheet не обновляется принудительно
- Полагается только на событие `product:updated`, которое может не сработать

**Доказательства:**
- В `product-edit.js:1113` код закомментирован с пометкой "ВРЕМЕННО ОТКЛЮЧЕНО"
- Событие `product:updated` может не найти товар в кэше (см. Причину 2)

---

### Причина 5: action_type от бэка не сохраняется в allProducts после обновления
**Файлы:** `webapp/js/product-edit.js` (строки 1015-1023)  
**Проблема:**
```javascript
if (freshOwnerProduct && p.id === freshOwnerProduct.id) {
    changed = true;
    // ========== ВАЖНО: Сохраняем action_type и can_add_to_cart от бэка ==========
    return { ...freshOwnerProduct }; // ← Должно содержать action_type от бэка
}
```
**Гипотеза:**
- `freshOwnerProduct` получается из API ответа после сохранения
- Но если API не вернул `action_type` → товар в `allProducts` не будет содержать `action_type`
- В результате `getProductActionType()` будет вычислять `action_type` на фронте (fallback)

**Доказательства:**
- В `backend/app/handlers/products_update.py:612` возвращается только `{ id, is_sale_enabled, message }`
- НО: `freshOwnerProduct` получается из `fetchProductById()` (product-edit.js:970), который должен содержать `action_type`
- Если `fetchProductById()` не вызывает правильный endpoint → `action_type` может отсутствовать

---

## 7. DEBUG PATCHES (Временные debug-логи)

### Патч 1: Логирование после получения продуктов от API
**Файл:** `webapp/js/data.js`  
**Вставить после строки 197:**
```javascript
        // ========== DEBUG: Логирование продуктов после загрузки ==========
        const DEBUG_DATA_LOAD = true; // Установить в false для отключения
        if (DEBUG_DATA_LOAD && products.length > 0) {
            console.log(`[DATA DEBUG] Loaded ${products.length} products`);
            // Логируем первые 2 товара с action_type
            products.slice(0, 2).forEach((p, idx) => {
                console.log(`[DATA DEBUG] Product ${idx + 1}:`, {
                    id: p.id,
                    name: p.name?.substring(0, 30),
                    action_type: p.action_type,
                    can_add_to_cart: p.can_add_to_cart,
                    is_sale_enabled: p.is_sale_enabled,
                    is_made_to_order: p.is_made_to_order,
                    is_reservation_enabled: p.is_reservation_enabled
                });
            });
        }
        // ========== КОНЕЦ DEBUG ==========
```

---

### Патч 2: Логирование перед renderProducts
**Файл:** `webapp/js/filters.js`  
**Вставить после строки 488 (перед вызовом renderProductsCallback):**
```javascript
        // ========== DEBUG: Логирование перед рендерингом ==========
        const DEBUG_FILTERS_RENDER = true; // Установить в false для отключения
        if (DEBUG_FILTERS_RENDER && filteredProducts.length > 0) {
            console.log(`[FILTERS DEBUG] Rendering ${filteredProducts.length} products`);
            // Логируем первые 2 товара
            filteredProducts.slice(0, 2).forEach((p, idx) => {
                console.log(`[FILTERS DEBUG] Product ${idx + 1} before render:`, {
                    id: p.id,
                    name: p.name?.substring(0, 30),
                    action_type: p.action_type,
                    can_add_to_cart: p.can_add_to_cart
                });
            });
        }
        // ========== КОНЕЦ DEBUG ==========
```

---

### Патч 3: Логирование при рендере кнопки в products_render.js
**Файл:** `webapp/js/handlers/products_render.js`  
**Вставить после строки 432 (после блока DEBUG):**
```javascript
                // ========== DEBUG: Логирование выбранного текста кнопки ==========
                const DEBUG_BUTTON_TEXT = true; // Установить в false для отключения
                if (DEBUG_BUTTON_TEXT) {
                    const { getActionButtonText } = await import('../utils/productActionType.js');
                    const buttonText = getActionButtonText(actionType);
                    console.log(`[PRODUCTS RENDER DEBUG] Action button for product ${prod.id}:`, {
                        productId: prod.id,
                        actionType,
                        actionIcon,
                        buttonText,
                        action_type_backend: prod.action_type,
                        can_add_to_cart_backend: prod.can_add_to_cart
                    });
                }
                // ========== КОНЕЦ DEBUG ==========
```

---

### Патч 4: Логирование при открытии bottom sheet
**Файл:** `webapp/js/handlers/products_modal.js`  
**Вставить после строки 1642 (после получения cachedProduct):**
```javascript
                    // ========== DEBUG: Логирование найденного товара в кэше ==========
                    const DEBUG_BOTTOM_SHEET_CACHE = true; // Установить в false для отключения
                    if (DEBUG_BOTTOM_SHEET_CACHE) {
                        console.log(`[PRODUCT MODAL DEBUG] Found product in cache for ${product.id}:`, {
                            productId: product.id,
                            cachedProductId: cachedProduct.id,
                            action_type: cachedProduct.action_type,
                            can_add_to_cart: cachedProduct.can_add_to_cart,
                            is_sale_enabled: cachedProduct.is_sale_enabled,
                            is_made_to_order: cachedProduct.is_made_to_order,
                            is_reservation_enabled: cachedProduct.is_reservation_enabled
                        });
                    }
                    // ========== КОНЕЦ DEBUG ==========
```

---

### Патч 5: Логирование после saveProductEdit
**Файл:** `webapp/js/product-edit.js`  
**Вставить после строки 1087 (после блока DEBUG):**
```javascript
                    // ========== DEBUG: Логирование обновления allProducts ==========
                    const DEBUG_ALLPRODUCTS_UPDATE = true; // Установить в false для отключения
                    if (DEBUG_ALLPRODUCTS_UPDATE) {
                        const updatedProduct = next.find(p => p && (p.id === productId || p.id === clientVisibleId));
                        console.log(`[PRODUCT EDIT DEBUG] allProducts updated:`, {
                            productId,
                            clientVisibleId,
                            updatedProductFound: !!updatedProduct,
                            updatedProductActionType: updatedProduct?.action_type,
                            updatedProductCanAddToCart: updatedProduct?.can_add_to_cart,
                            allProductsLength: next.length
                        });
                    }
                    // ========== КОНЕЦ DEBUG ==========
```

---

### Патч 6: Логирование при клике на кнопку действия
**Файл:** `webapp/js/handlers/products_render.js`  
**Вставить после строки 500 (после получения actualProduct):**
```javascript
                        // ========== DEBUG: Логирование продукта в обработчике клика ==========
                        const DEBUG_CLICK_HANDLER = true; // Установить в false для отключения
                        if (DEBUG_CLICK_HANDLER) {
                            console.log(`[PRODUCTS RENDER DEBUG] Click handler for product ${prod.id}:`, {
                                productId: prod.id,
                                prodFromClosure: {
                                    id: prod.id,
                                    action_type: prod.action_type,
                                    can_add_to_cart: prod.can_add_to_cart
                                },
                                actualProductFromCache: {
                                    id: actualProduct.id,
                                    action_type: actualProduct.action_type,
                                    can_add_to_cart: actualProduct.can_add_to_cart
                                },
                                isSameObject: prod === actualProduct,
                                allProductsLength: allProducts?.length || 0
                            });
                        }
                        // ========== КОНЕЦ DEBUG ==========
```

---

### Патч 7: Логирование события product:updated
**Файл:** `webapp/js/handlers/products_modal.js`  
**Вставить после строки 156 (после проверки cachedProduct):**
```javascript
            // ========== DEBUG: Логирование поиска товара в кэше ==========
            const DEBUG_EVENT_SEARCH = true; // Установить в false для отключения
            if (DEBUG_EVENT_SEARCH) {
                console.log(`[PRODUCT MODAL DEBUG] Searching for product in cache:`, {
                    productId,
                    clientVisibleId,
                    targetProductId,
                    allProductsLength: allProducts.length,
                    cachedProductFound: !!cachedProduct,
                    cachedProductId: cachedProduct?.id,
                    cachedProductActionType: cachedProduct?.action_type
                });
            }
            // ========== КОНЕЦ DEBUG ==========
```

---

## ИТОГОВЫЙ ЧЕКЛИСТ ДИАГНОСТИКИ

- [x] Собраны все файлы, связанные с рендерингом товаров и кнопок действий
- [x] Построены полные цепочки вызовов (Data Flow, Render Flow, Toggle Flow)
- [x] Определены источники данных и места, где они могут устаревать
- [x] Найдены все точки принятия решения про action_type / can_add_to_cart / иконку / текст кнопки
- [x] Выявлены обработчики кликов и места с рисками замыкания на старый prod
- [x] Описано, как обновляется UI после сохранения в product-edit
- [x] Выявлены 5 наиболее вероятных причин проблемы
- [x] Добавлены 7 debug-патчей для диагностики

---

## СЛЕДУЮЩИЕ ШАГИ

1. **Применить debug-патчи** (раздел 7) для сбора данных
2. **Проверить race condition** между `loadDataCallback()` и обновлением `allProducts`
3. **Проверить поиск товара в кэше** в обработчике события `product:updated`
4. **Раскомментировать код** принудительного обновления bottom sheet (product-edit.js:1112-1154)
5. **Проверить, что API возвращает action_type** после сохранения товара
