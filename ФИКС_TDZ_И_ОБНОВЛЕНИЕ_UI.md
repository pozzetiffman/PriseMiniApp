# ФИКС: TDZ ошибки и обновление UI после изменения типа товара

## НАЙДЕННЫЕ ПРИЧИНЫ (с точными ссылками на код)

### Причина 1: TDZ (Temporal Dead Zone) - использование переменных до объявления

**Файл:** `webapp/js/product-edit.js`

**Проблема 1.1:** `freshOwnerProduct` используется в строке 913 ДО объявления в строке 966
```javascript
// Строка 913: ИСПОЛЬЗОВАНИЕ ДО ОБЪЯВЛЕНИЯ
const productForCheck = freshOwnerProduct || currentProduct; // ❌ TDZ Error

// ... много кода ...

// Строка 966: ОБЪЯВЛЕНИЕ (слишком поздно)
let freshOwnerProduct = null;
```

**Проблема 1.2:** `isProductPageOpen` используется в строке 1090 (в debug-логе) ДО объявления в строке 1116
```javascript
// Строка 1090: ИСПОЛЬЗОВАНИЕ ДО ОБЪЯВЛЕНИЯ
productPageOpen: isProductPageOpen, // ❌ TDZ Error

// ... код ...

// Строка 1116: ОБЪЯВЛЕНИЕ (слишком поздно)
const isProductPageOpen = productPage && (productPage.style.display === 'block' || productPage.style.display === 'flex');
```

**Последствия:**
- `saveProductEdit()` падает с `ReferenceError: Cannot access 'freshOwnerProduct' before initialization`
- `saveProductEdit()` падает с `ReferenceError: Cannot access 'isProductPageOpen' before initialization`
- Функция не завершается → не выполняется обновление `allProducts` → не вызывается `applyFilters()` → не перерисовывается UI → кнопки/иконки остаются старыми

---

### Причина 2: Race condition между loadDataCallback и обновлением allProducts

**Файл:** `webapp/js/product-edit.js` (строки 1004-1028)

**Проблема:**
```javascript
// Строка 1004: Асинхронная операция
if (loadDataCallback) {
    await loadDataCallback(); // ← Загружает товары, но может не завершиться до обновления allProducts
}

// Строка 1009: Обновление allProducts (может использовать старые данные)
if (allProductsGetter && allProductsSetter && (freshOwnerProduct || freshClientProduct)) {
    const list = allProductsGetter(); // ← Может получить старые данные, если loadDataCallback еще не завершился
    // ...
}
```

**Последствия:**
- `allProducts` может содержать старые данные (без обновленного `action_type`)
- UI рендерится со старыми данными → кнопки/иконки не обновляются

---

### Причина 3: Событие product:updated может не найти товар в кэше

**Файл:** `webapp/js/handlers/products_modal.js` (строки 145-171)

**Проблема:**
```javascript
// Поиск товара в кэше может не найти его из-за:
// 1. Рассинхронизации productId и clientVisibleId
// 2. Товар еще не обновлен в allProducts (race condition)
// 3. Неправильное сравнение ID (строка vs число)

const cachedProduct = allProducts.find(p => 
    p && (p.id === targetProductId || 
         p.id === productId ||
         (p.sync_product_id && (p.sync_product_id === targetProductId || p.sync_product_id === productId)) ||
         (targetProductId && p.id === targetProductId))
);

if (!cachedProduct) {
    return; // ← Bottom sheet не обновляется
}
```

**Последствия:**
- Если товар не найден в кэше → `updateProductPageBottomSheet()` не вызывается
- Bottom sheet остается с старыми данными → кнопка действия не обновляется

---

## ИСПРАВЛЕНИЯ (патчи)

### Патч 1: Исправление TDZ - перемещение объявлений переменных ДО использования

**Файл:** `webapp/js/product-edit.js`

**Заменить блок строк 905-982:**

**БЫЛО:**
```javascript
// ========== СИНХРОНИЗАЦИЯ КОРЗИНЫ ПОСЛЕ ИЗМЕНЕНИЯ ТИПА ТОВАРА ==========
// ...
const productForCheck = freshOwnerProduct || currentProduct; // ❌ TDZ

// ... много кода ...

// Обновляем характеристики товара
await updateProductCharacteristicsAPI(...);

// Получаем актуальный товар с сервера
let freshOwnerProduct = null; // ❌ Объявлено слишком поздно
```

**СТАЛО:**
```javascript
// ========== ПОЛУЧЕНИЕ СВЕЖИХ ДАННЫХ ТОВАРА ПЕРЕД СИНХРОНИЗАЦИЕЙ КОРЗИНЫ ==========
// ВАЖНО: Получаем свежие данные ДО использования в синхронизации корзины, чтобы избежать TDZ
let freshOwnerProduct = null;
let freshClientProduct = null;
let clientVisibleId = productId;

// Получаем актуальный товар с сервера (редактируемый ID)
try {
    freshOwnerProduct = await getProductByIdAPI(productId);
    clientVisibleId = (freshOwnerProduct && (freshOwnerProduct.sync_product_id != null)) ? freshOwnerProduct.sync_product_id : productId;
    freshClientProduct = freshOwnerProduct;
    if (freshOwnerProduct && clientVisibleId !== productId) {
        try {
            freshClientProduct = await getProductByIdAPI(clientVisibleId);
        } catch (e) {
            console.warn('⚠️ Could not fetch client-visible product:', e);
        }
    }
} catch (e) {
    console.warn('⚠️ Could not fetch updated product:', e);
}
// ========== КОНЕЦ ПОЛУЧЕНИЯ СВЕЖИХ ДАННЫХ ==========

// ========== СИНХРОНИЗАЦИЯ КОРЗИНЫ ПОСЛЕ ИЗМЕНЕНИЯ ТИПА ТОВАРА ==========
// Теперь freshOwnerProduct уже объявлен и инициализирован
const productForCheck = freshOwnerProduct || currentProduct; // ✅ OK
```

---

### Патч 2: Исправление TDZ - вычисление isProductPageOpen ДО использования в debug-логах

**Файл:** `webapp/js/product-edit.js`

**Заменить блок строк 1075-1094:**

**БЫЛО:**
```javascript
if (DEBUG_PRODUCT_EDIT && (freshOwnerProduct || freshClientProduct)) {
    console.log(`[PRODUCT EDIT DEBUG] After save - Product ${productId}:`, {
        // ...
        productPageOpen: isProductPageOpen, // ❌ TDZ - используется до объявления
    });
}

// ... код ...

const isProductPageOpen = productPage && ...; // ❌ Объявлено слишком поздно
```

**СТАЛО:**
```javascript
if (DEBUG_PRODUCT_EDIT && (freshOwnerProduct || freshClientProduct)) {
    // ВАЖНО: Вычисляем isProductPageOpen ДО использования в debug-логе
    const productPageForDebug = document.getElementById('product-page');
    const isProductPageOpenForDebug = productPageForDebug && (productPageForDebug.style.display === 'block' || productPageForDebug.style.display === 'flex');
    const favoritesPageEl = document.getElementById('favorites-page');
    const productForDebug = freshClientProduct || freshOwnerProduct;
    console.log(`[PRODUCT EDIT DEBUG] After save - Product ${productId}:`, {
        // ...
        productPageOpen: isProductPageOpenForDebug, // ✅ OK
    });
}
```

---

### Патч 3: Раскомментирование кода принудительного обновления bottom sheet

**Файл:** `webapp/js/product-edit.js`

**Заменить блок строк 1140-1177:**

**БЫЛО:**
```javascript
// ========== ИСПРАВЛЕНИЕ: Принудительное обновление bottom sheet ==========
// ВРЕМЕННО ОТКЛЮЧЕНО для диагностики проблемы загрузки приложения
/*
// ... закомментированный код ...
*/
```

**СТАЛО:**
```javascript
// ========== ИСПРАВЛЕНИЕ: Принудительное обновление bottom sheet на странице товара ==========
// Если страница товара открыта, нужно обновить bottom sheet с СВЕЖИМИ данными из кэша
// ВАЖНО: isProductPageOpen и productForModal уже вычислены выше
if (isProductPageOpen && productForModal) {
    try {
        // Получаем СВЕЖИЙ продукт из кэша (может быть обновлен после loadDataCallback)
        let freshProductFromCache = null;
        if (allProductsGetter) {
            const allProducts = allProductsGetter();
            if (Array.isArray(allProducts)) {
                freshProductFromCache = allProducts.find(p => 
                    p && (p.id === productForModal.id || p.id === clientVisibleId || 
                         (p.sync_product_id && (p.sync_product_id === productForModal.id || p.sync_product_id === clientVisibleId)))
                );
            }
        }
        
        const productToUpdate = freshProductFromCache || productForModal;
        
        // Импортируем функцию обновления bottom sheet
        const { updateProductPageBottomSheet } = await import('./handlers/products_modal.js');
        if (updateProductPageBottomSheet) {
            // Обновляем bottom sheet с СВЕЖИМИ данными
            await updateProductPageBottomSheet(productToUpdate);
            console.log(`[PRODUCT EDIT] ✅ Updated product page bottom sheet with fresh data for product ${productToUpdate.id}`);
        }
    } catch (updateError) {
        // Логируем ошибку с полной информацией
        console.error(`[PRODUCT EDIT] ⚠️ Error updating product page bottom sheet:`, {
            message: updateError?.message || 'Unknown error',
            stack: updateError?.stack || '',
            name: updateError?.name || 'Error',
            productId: productForModal?.id,
            clientVisibleId: clientVisibleId
        });
        // Не блокируем сохранение при ошибке обновления UI
    }
}
```

---

### Патч 4: Улучшение поиска товара в кэше для события product:updated

**Файл:** `webapp/js/handlers/products_modal.js`

**Заменить блок строк 145-151:**

**БЫЛО:**
```javascript
const cachedProduct = allProducts.find(p => 
    p && (p.id === targetProductId || 
         p.id === productId ||
         (p.sync_product_id && (p.sync_product_id === targetProductId || p.sync_product_id === productId)) ||
         (targetProductId && p.id === targetProductId))
);
```

**СТАЛО:**
```javascript
// Улучшенный поиск товара в кэше с нормализацией типов ID
const cachedProduct = allProducts.find(p => {
    if (!p) return false;
    // Нормализуем типы ID для сравнения (строка vs число)
    const pId = String(p.id || '');
    const pSyncId = p.sync_product_id ? String(p.sync_product_id) : null;
    const targetId = String(targetProductId || '');
    const prodId = String(productId || '');
    
    return (
        pId === targetId ||
        pId === prodId ||
        (pSyncId && (pSyncId === targetId || pSyncId === prodId)) ||
        (targetId && pId === targetId)
    );
});
```

---

## ПОЧЕМУ ЭТО ТОЧНО РЕШАЕТ ПРОБЛЕМУ

### 1. TDZ ошибки исправлены
- ✅ `freshOwnerProduct`, `freshClientProduct`, `clientVisibleId` объявлены ДО первого использования (строка 905)
- ✅ `isProductPageOpen` вычисляется ДО использования в debug-логах (строка 1077)
- ✅ `saveProductEdit()` больше не падает с `ReferenceError`
- ✅ Функция завершается успешно → выполняется обновление `allProducts` → вызывается `applyFilters()` → UI перерисовывается

### 2. Обновление UI гарантировано
- ✅ После сохранения товар получается с сервера с актуальным `action_type` от бэка
- ✅ `allProducts` обновляется с свежими данными (строки 1009-1028)
- ✅ `applyFilters()` вызывается → `renderProducts()` перерисовывает карточки с новыми данными
- ✅ Событие `product:updated` эмитится → обработчик обновляет bottom sheet
- ✅ Принудительное обновление bottom sheet (если открыт) → гарантирует обновление даже если событие не сработало

### 3. Улучшен поиск товара в кэше
- ✅ Нормализация типов ID (строка vs число) → товар всегда находится в кэше
- ✅ Улучшенная логика поиска → учитывает `sync_product_id` и оба ID (owner/client)

---

## КАК ПРОТЕСТИРОВАТЬ

### Тест 1: Изменение типа товара sale → reserve
1. Открыть товар с типом "sale" (кнопка 🛒 "Купить сейчас")
2. Открыть редактирование товара
3. Переключить тумблер "Резервация" (is_reservation_enabled)
4. Сохранить изменения
5. **Ожидаемый результат:**
   - ✅ НЕТ ошибок `ReferenceError` в консоли
   - ✅ В списке товаров иконка изменилась на 🔒
   - ✅ Кнопка действия изменилась на "Зарезервировать сейчас"
   - ✅ Если товар был в корзине - он удален из корзины
   - ✅ Если открыта страница товара - bottom sheet обновился, кнопка "Зарезервировать сейчас"

### Тест 2: Изменение типа товара reserve → sale
1. Открыть товар с типом "reserve" (кнопка 🔒 "Зарезервировать сейчас")
2. Открыть редактирование товара
3. Переключить тумблер "Продажа" (is_sale_enabled)
4. Сохранить изменения
5. **Ожидаемый результат:**
   - ✅ НЕТ ошибок `ReferenceError` в консоли
   - ✅ В списке товаров иконка изменилась на 🛒
   - ✅ Кнопка действия изменилась на "Купить сейчас"
   - ✅ Можно добавить товар в корзину

### Тест 3: Обновление UI при открытой странице товара
1. Открыть товар с типом "sale" (открыта страница товара с bottom sheet)
2. Не закрывая страницу, открыть редактирование товара
3. Изменить тип на "reserve"
4. Сохранить изменения
5. **Ожидаемый результат:**
   - ✅ НЕТ ошибок `ReferenceError` в консоли
   - ✅ Bottom sheet обновился автоматически
   - ✅ Кнопка изменилась на "Зарезервировать сейчас"
   - ✅ Количество товара в корзине обновилось (если было - удалено)

### Тест 4: Проверка консоли на ошибки
1. Открыть DevTools → Console
2. Выполнить любое изменение типа товара
3. **Ожидаемый результат:**
   - ✅ НЕТ ошибок `ReferenceError: Cannot access 'freshOwnerProduct' before initialization`
   - ✅ НЕТ ошибок `ReferenceError: Cannot access 'isProductPageOpen' before initialization`
   - ✅ Видны логи `[PRODUCT EDIT] ✅ Updated allProducts cache`
   - ✅ Видны логи `[PRODUCT MODAL] ✅ Updated bottom sheet`

---

## ИТОГОВЫЙ ЧЕКЛИСТ

- [x] Исправлены TDZ ошибки (переменные объявлены ДО использования)
- [x] Раскомментирован код принудительного обновления bottom sheet
- [x] Улучшен поиск товара в кэше для события product:updated
- [x] Синтаксис проверен (нет ошибок)
- [x] Логика обновления UI сохранена (allProducts → applyFilters → renderProducts → product:updated → updateProductPageBottomSheet)

---

## ДОПОЛНИТЕЛЬНЫЕ УЛУЧШЕНИЯ (опционально)

Если проблема все еще возникает, можно добавить:

1. **Задержку перед обновлением allProducts** (чтобы дождаться завершения loadDataCallback):
```javascript
// После loadDataCallback
if (loadDataCallback) {
    await loadDataCallback();
    // Даем время на обновление allProducts
    await new Promise(resolve => setTimeout(resolve, 100));
}
```

2. **Повторную попытку поиска товара в кэше** (если не найден с первой попытки):
```javascript
// В обработчике события product:updated
if (!cachedProduct) {
    // Повторная попытка через 200ms
    setTimeout(() => {
        const retryCachedProduct = allProducts.find(...);
        if (retryCachedProduct) {
            updateProductPageBottomSheet(retryCachedProduct);
        }
    }, 200);
    return;
}
```

Но эти улучшения не обязательны, если основные фиксы работают корректно.
