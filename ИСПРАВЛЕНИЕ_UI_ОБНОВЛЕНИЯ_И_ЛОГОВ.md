# ИСПРАВЛЕНИЕ: UI не обновляет кнопки после редактирования + ошибки в логах

## ДИАГНОСТИКА ПРОБЛЕМЫ

### Проблема A: UI не обновляет кнопки после редактирования типа товара

**Цепочка проблемы:**
1. После сохранения в `product-edit.js` вызывается `loadDataCallback()` (строка 987)
2. `loadData()` в `data.js` загружает свежие товары и обновляет `allProducts` (строка 197)
3. `applyFilters()` вызывается и должен перерисовать товары через `renderProducts()`
4. **НО:** `updateProductPageBottomSheet()` в `products_modal.js` (строка 1546) использует переданный объект `product`, который может быть устаревшим
5. **НО:** Кнопки в `products_render.js` могут использовать старые данные из замыкания при клике

**Корневая причина:**
- После сохранения товар обновляется в `allProducts`, но открытый bottom sheet (`product-page-bottom-sheet`) не перезагружает данные из кэша
- `updateProductPageBottomSheet()` вызывается с объектом `product`, который был передан ранее, а не свежим из кэша
- В `product-edit.js` строка 1034 вызывается `showProductModalCallback(productForModal, ...)`, но если страница товара уже открыта, нужно принудительно обновить bottom sheet

### Проблема B: Ошибки превращаются в `{}`

**Цепочка проблемы:**
1. В `product-edit.js` строки 932 и 937 логируют ошибки: `console.error(..., syncError)` и `console.error(..., cartError)`
2. `remoteLogger.js` перехватывает `console.error` и сериализует аргументы (строка 128-147)
3. Если ошибка - это объект Error без собственных свойств, `JSON.stringify` может вернуть `{}`
4. В `products_modal.js` строка 2114: `console.error('❌ Error ensuring product in cart:', error)` - аналогично

**Корневая причина:**
- `remoteLogger.js` использует `JSON.stringify` для объектов, но Error объекты не сериализуются правильно
- Нужно извлекать `message`, `stack`, `name` из Error объектов перед логированием

---

## РЕШЕНИЕ

### Файл 1: `webapp/js/utils/remoteLogger.js`

**Проблема:** Error объекты сериализуются как `{}`

**Исправление:** Улучшить сериализацию ошибок

**Вставить после строки 128 (в функции `addLogToBuffer`):**

```javascript
    // Формируем сообщение
    let message = args.map(arg => {
        // ========== ИСПРАВЛЕНИЕ: Правильная сериализация Error объектов ==========
        if (arg instanceof Error) {
            // Извлекаем все доступные свойства из Error объекта
            const errorInfo = {
                name: arg.name || 'Error',
                message: arg.message || '',
                stack: arg.stack || '',
                // Дополнительные свойства, если есть
                ...(arg.cause ? { cause: String(arg.cause) } : {}),
                ...(arg.code ? { code: arg.code } : {}),
                ...(arg.status ? { status: arg.status } : {}),
                ...(arg.statusText ? { statusText: arg.statusText } : {}),
                ...(arg.url ? { url: arg.url } : {}),
                ...(arg.responseText ? { responseText: String(arg.responseText).substring(0, 500) } : {}),
                ...(arg.responseJson ? { responseJson: JSON.stringify(arg.responseJson).substring(0, 500) } : {})
            };
            try {
                return JSON.stringify(errorInfo, null, 2);
            } catch (e) {
                return `Error: ${arg.name || 'Error'} - ${arg.message || 'Unknown error'}`;
            }
        }
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
        
        if (typeof arg === 'object') {
            try {
                // ========== ИСПРАВЛЕНИЕ: Извлекаем Error-подобные свойства из объектов ==========
                // Если объект имеет свойства Error (message, stack), извлекаем их явно
                if (arg && typeof arg === 'object' && (arg.message || arg.stack || arg.error)) {
                    const errorLikeInfo = {
                        message: arg.message || arg.error?.message || '',
                        stack: arg.stack || arg.error?.stack || '',
                        name: arg.name || arg.error?.name || 'Error',
                        ...(arg.status ? { status: arg.status } : {}),
                        ...(arg.statusText ? { statusText: arg.statusText } : {}),
                        ...(arg.url ? { url: arg.url } : {}),
                        ...(arg.responseText ? { responseText: String(arg.responseText).substring(0, 500) } : {}),
                        ...(arg.responseJson ? { responseJson: JSON.stringify(arg.responseJson).substring(0, 500) } : {}),
                        // Сохраняем остальные свойства объекта (кроме вложенных больших объектов)
                        ...Object.keys(arg).reduce((acc, key) => {
                            if (!['message', 'stack', 'name', 'error', 'responseText', 'responseJson'].includes(key)) {
                                const value = arg[key];
                                if (typeof value !== 'object' || value === null) {
                                    acc[key] = value;
                                } else {
                                    try {
                                        const str = JSON.stringify(value);
                                        if (str.length <= 200) {
                                            acc[key] = value;
                                        } else {
                                            acc[key] = '[Object too large]';
                                        }
                                    } catch (e) {
                                        acc[key] = '[Non-serializable]';
                                    }
                                }
                            }
                            return acc;
                        }, {})
                    };
                    return JSON.stringify(errorLikeInfo, null, 2);
                }
                // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
                
                // Ограничиваем глубину вложенности для больших объектов
                return JSON.stringify(arg, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        // Ограничиваем размер объекта
                        const str = JSON.stringify(value);
                        if (str.length > 1000) {
                            return '[Object too large]';
                        }
                    }
                    return value;
                }, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
```

**Комментарий:** Теперь Error объекты и объекты с Error-подобными свойствами будут логироваться с полной информацией (message, stack, name, и другие свойства), а не как пустые `{}`.

---

### Файл 2: `webapp/js/product-edit.js`

**Проблема:** После сохранения UI не обновляется полностью, особенно bottom sheet на странице товара

**Исправление:** Принудительно обновить bottom sheet после сохранения, используя свежие данные из кэша

**Вставить после строки 1034 (после вызова `showProductModalCallback`):**

```javascript
        // ========== ИСПРАВЛЕНИЕ: Принудительное обновление bottom sheet на странице товара ==========
        // Если страница товара открыта, нужно обновить bottom sheet с СВЕЖИМИ данными из кэша
        const productPage = document.getElementById('product-page');
        const isProductPageOpen = productPage && (productPage.style.display === 'block' || productPage.style.display === 'flex');
        if (isProductPageOpen && productForModal) {
            try {
                // Получаем СВЕЖИЙ продукт из кэша (может быть обновлен после loadDataCallback)
                const freshProductFromCache = allProductsGetter ? allProductsGetter().find(p => 
                    p && (p.id === productForModal.id || p.id === clientVisibleId || 
                         (p.sync_product_id && (p.sync_product_id === productForModal.id || p.sync_product_id === clientVisibleId)))
                ) : null;
                
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
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
```

**Также исправить логирование ошибок в строках 932 и 937:**

**Заменить строку 932:**
```javascript
                    } catch (cartError) {
                        // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
                        console.error(`[PRODUCT EDIT] ⚠️ Failed to remove product from cart:`, {
                            message: cartError?.message || 'Unknown error',
                            stack: cartError?.stack || '',
                            name: cartError?.name || 'Error',
                            productId: productId,
                            actionType: currentActionType,
                            actionTypeText: actionTypeText
                        });
                        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
                    }
```

**Заменить строку 937:**
```javascript
        } catch (syncError) {
            // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
            console.error(`[PRODUCT EDIT] ⚠️ Error syncing cart after type change:`, {
                message: syncError?.message || 'Unknown error',
                stack: syncError?.stack || '',
                name: syncError?.name || 'Error',
                productId: productId,
                // Дополнительная информация для диагностики
                ...(syncError?.response ? { responseStatus: syncError.response.status, responseText: String(syncError.response.text || '').substring(0, 200) } : {})
            });
            // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
            // Не блокируем сохранение при ошибке синхронизации корзины
        }
```

**Комментарий:** 
1. После сохранения принудительно обновляем bottom sheet с данными из кэша, чтобы кнопки соответствовали новому типу товара
2. Ошибки логируются с полной информацией (message, stack, name), а не как пустые объекты

---

### Файл 3: `webapp/js/handlers/products_modal.js`

**Проблема:** `updateProductPageBottomSheet` использует переданный объект `product`, который может быть устаревшим

**Исправление:** Перед обновлением bottom sheet получать свежий продукт из кэша

**Вставить после строки 1546 (в начале функции `updateProductPageBottomSheet`):**

```javascript
async function updateProductPageBottomSheet(product) {
    // ========== ИСПРАВЛЕНИЕ: Получаем СВЕЖИЙ продукт из кэша перед обновлением UI ==========
    // Используем свежие данные из allProducts, чтобы гарантировать актуальность action_type и can_add_to_cart
    let freshProduct = product;
    try {
        // Пытаемся получить свежий продукт из кэша
        if (typeof window.getAllProducts === 'function') {
            const allProducts = window.getAllProducts();
            if (Array.isArray(allProducts)) {
                const cachedProduct = allProducts.find(p => 
                    p && (p.id === product.id || 
                         (p.sync_product_id && p.sync_product_id === product.id) ||
                         (product.sync_product_id && p.id === product.sync_product_id))
                );
                if (cachedProduct) {
                    freshProduct = cachedProduct;
                    console.log(`[PRODUCT MODAL] Using fresh product from cache for ${product.id}, action_type=${cachedProduct.action_type}, can_add_to_cart=${cachedProduct.can_add_to_cart}`);
                }
            }
        }
    } catch (cacheError) {
        // Если не удалось получить из кэша, используем переданный продукт
        console.warn(`[PRODUCT MODAL] Could not get fresh product from cache:`, {
            message: cacheError?.message || 'Unknown error',
            stack: cacheError?.stack || '',
            productId: product?.id
        });
    }
    // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
    
    const productPageBottomSheet = document.getElementById('product-page-bottom-sheet');
    // ... остальной код использует freshProduct вместо product ...
```

**Заменить все использования `product` на `freshProduct` в функции `updateProductPageBottomSheet`:**

- Строка 1580: `const existingItem = cartItems.find(item => item.product.id === freshProduct.id);`
- Строка 1600-1604: использовать `freshProduct.images_urls` и `freshProduct.image_url`
- Строка 1620: `productName.textContent = freshProduct.name || '';`
- Строка 1625: `const priceDisplay = getProductPriceDisplay(freshProduct);`
- Строка 1635: `const productQuantity = freshProduct.quantity !== undefined && freshProduct.quantity !== null ? freshProduct.quantity : null;`
- Строка 1636: `const activeReservationsCount = freshProduct.reservation && freshProduct.reservation.active_count`
- И все остальные использования `product` в этой функции заменить на `freshProduct`

**Также исправить логирование ошибки в строке 2114:**

**Заменить строку 2114:**
```javascript
    } catch (error) {
        // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
        console.error('❌ Error ensuring product in cart:', {
            message: error?.message || 'Unknown error',
            stack: error?.stack || '',
            name: error?.name || 'Error',
            productId: product?.id,
            productName: product?.name,
            currentQuantity: currentQuantity,
            ...(error?.response ? { responseStatus: error.response.status, responseText: String(error.response.text || '').substring(0, 200) } : {})
        });
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
    }
```

**Комментарий:** 
1. Перед обновлением bottom sheet получаем свежий продукт из кэша, чтобы гарантировать актуальность `action_type` и `can_add_to_cart`
2. Ошибки логируются с полной информацией

---

### Файл 4: `webapp/js/handlers/products_render.js`

**Проблема:** Кнопки действий могут использовать устаревшие данные из замыкания

**Исправление:** Уже исправлено в предыдущих патчах (строки 467, 478), но нужно убедиться, что используется `action_type` от бэка

**Проверить строки 406-520 (рендеринг action button):**

Убедиться, что используется приоритет `product.action_type` от бэка. Если нет - добавить:

**Вставить после строки 406 (в начале блока рендеринга action button):**

```javascript
                // ========== ИСПРАВЛЕНИЕ: Используем action_type от бэка как приоритет ==========
                // Получаем актуальный action_type из product (должен быть установлен бэком)
                const backendActionType = prod.action_type;
                const backendCanAddToCart = prod.can_add_to_cart;
                
                // Если action_type от бэка есть - используем его, иначе вычисляем на фронте
                let actionType = backendActionType;
                if (!actionType || typeof actionType !== 'string') {
                    // Fallback: вычисляем на фронте (для обратной совместимости)
                    const { getProductActionType } = await import('../utils/productActionType.js');
                    actionType = getProductActionType(prod, appContext, shopSettings);
                }
                
                // Аналогично для can_add_to_cart
                let canAddToCart = backendCanAddToCart;
                if (canAddToCart === undefined || canAddToCart === null) {
                    const { canAddToCart: canAddToCartFn } = await import('../utils/productActionType.js');
                    canAddToCart = canAddToCartFn(prod, appContext, shopSettings);
                }
                // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
```

**Комментарий:** Гарантируем использование `action_type` и `can_add_to_cart` от бэка как приоритет, с fallback на вычисление на фронте.

---

### Файл 5: `webapp/js/cart/cartBottomSheet.js`

**Проблема:** Bottom sheet может использовать устаревший `currentProduct`

**Исправление:** Уже частично исправлено (строки 502, 673), но нужно убедиться, что используется везде

**Проверить функцию `showCartBottomSheet` и `primaryBtnHandler`:**

Убедиться, что перед использованием `currentProduct` всегда получается свежий из кэша (как в строках 502 и 673).

**Комментарий:** Уже исправлено в предыдущих патчах, но нужно проверить все места использования `currentProduct`.

---

## ПЛАН РУЧНОГО ТЕСТИРОВАНИЯ

### Тест 1: Редактирование типа товара sale → reserve → sale
1. Открыть товар с типом "sale" (кнопка "Купить сейчас")
2. Открыть редактирование товара
3. Переключить тип на "reserve" (резервация)
4. Сохранить изменения
5. **Ожидаемый результат:**
   - В списке товаров иконка изменилась на 🔒
   - Кнопка действия изменилась на "Зарезервировать сейчас"
   - Если товар был в корзине - он удален из корзины
   - Если открыта страница товара - bottom sheet обновился, кнопка "Зарезервировать сейчас"
6. Переключить обратно на "sale"
7. Сохранить изменения
8. **Ожидаемый результат:**
   - В списке товаров иконка изменилась на 🛒
   - Кнопка действия изменилась на "Купить сейчас"
   - Можно добавить товар в корзину

### Тест 2: Редактирование типа товара sale → order → purchase → sale
1. Открыть товар с типом "sale"
2. Переключить на "order" (под заказ)
3. Сохранить
4. **Ожидаемый результат:** Иконка 📦, кнопка "Заказать сейчас", товар удален из корзины
5. Переключить на "purchase" (покупка у клиента)
6. Сохранить
7. **Ожидаемый результат:** Иконка 💰, кнопка "Продать магазину", товар удален из корзины
8. Переключить обратно на "sale"
9. Сохранить
10. **Ожидаемый результат:** Иконка 🛒, кнопка "Купить сейчас", можно добавить в корзину

### Тест 3: Обновление UI при открытой странице товара
1. Открыть товар с типом "sale" (открыта страница товара с bottom sheet)
2. Не закрывая страницу, открыть редактирование товара (в другом окне/вкладке или через админку)
3. Изменить тип на "reserve"
4. Сохранить изменения
5. Вернуться на страницу товара
6. **Ожидаемый результат:**
   - Bottom sheet обновился автоматически
   - Кнопка изменилась на "Зарезервировать сейчас"
   - Количество товара в корзине обновилось (если было - удалено)

### Тест 4: Проверка корзины после изменения типа
1. Добавить товар типа "sale" в корзину
2. Проверить, что товар в корзине
3. Изменить тип товара на "reserve"
4. Сохранить изменения
5. **Ожидаемый результат:**
   - Товар удален из корзины
   - Badge корзины обновился (уменьшился на 1)
   - В списке товаров кнопка корзины на карточке неактивна/скрыта

### Тест 5: Проверка избранного после изменения типа
1. Добавить товар типа "sale" в избранное
2. Открыть страницу избранного
3. Проверить иконку действия на карточке (должна быть 🛒)
4. Изменить тип товара на "order"
5. Сохранить изменения
6. Вернуться на страницу избранного (или обновить)
7. **Ожидаемый результат:**
   - Иконка действия изменилась на 📦
   - Кнопка действия изменилась на "Заказать сейчас"
   - Товар удален из корзины (если был там)

### Тест 6: Проверка клиента (viewer_id != owner_id)
1. Войти как клиент (не владелец магазина)
2. Открыть товар с типом "sale"
3. Проверить, что видна кнопка "Купить сейчас"
4. Владелец магазина изменяет тип на "reserve"
5. Клиент обновляет страницу или переходит на другую и обратно
6. **Ожидаемый результат:**
   - Иконка и кнопка обновились на "Зарезервировать сейчас"
   - Товар удален из корзины клиента (если был там)

### Тест 7: Проверка ошибок в логах
1. Открыть DevTools → Console (или проверить remote logs)
2. Выполнить любое действие, которое может вызвать ошибку (например, попытка добавить не-sale товар в корзину)
3. **Ожидаемый результат:**
   - В логах НЕТ записей вида `Error: {}`
   - Все ошибки содержат `message`, `stack`, `name`
   - Если есть HTTP ошибки - видны `status`, `statusText`, `url`

### Тест 8: Проверка синхронизации после сохранения
1. Открыть товар типа "sale"
2. Добавить в корзину (количество = 2)
3. Открыть редактирование товара
4. Изменить тип на "reserve"
5. Сохранить изменения
6. **Ожидаемый результат:**
   - Товар удален из корзины
   - Badge корзины обновился
   - Bottom sheet обновился (если открыт)
   - В логах НЕТ ошибок вида `Error syncing cart: {}`

### Тест 9: Проверка обновления списка товаров
1. Открыть список товаров
2. Найти товар типа "sale" с иконкой 🛒
3. Изменить тип на "order"
4. Сохранить изменения
5. **Ожидаемый результат:**
   - Список товаров автоматически обновился
   - Иконка изменилась на 📦
   - Кнопка действия изменилась на "Заказать сейчас"
   - Не нужно вручную обновлять страницу

### Тест 10: Проверка множественных изменений
1. Открыть несколько товаров в разных вкладках/окнах
2. Изменить тип одного товара на "reserve"
3. Сохранить изменения
4. **Ожидаемый результат:**
   - Все открытые страницы этого товара обновились
   - Bottom sheet обновился на всех страницах
   - Корзина синхронизирована на всех страницах

---

## ДОПОЛНИТЕЛЬНЫЕ DEBUG-ЛОГИ (временные, можно выключить флагом)

### Файл: `webapp/js/product-edit.js`

**Вставить после строки 1012 (после обновления allProducts):**

```javascript
        // ========== DEBUG: Временные логи для диагностики (можно выключить флагом) ==========
        const DEBUG_PRODUCT_EDIT = true; // Установить в false для отключения
        if (DEBUG_PRODUCT_EDIT && (freshOwnerProduct || freshClientProduct)) {
            const productForDebug = freshClientProduct || freshOwnerProduct;
            console.log(`[PRODUCT EDIT DEBUG] After save - Product ${productId}:`, {
                productId: productId,
                clientVisibleId: clientVisibleId,
                action_type: productForDebug.action_type,
                can_add_to_cart: productForDebug.can_add_to_cart,
                reason_not_sale: productForDebug.reason_not_sale,
                is_for_sale: productForDebug.is_for_sale,
                is_sale_enabled: productForDebug.is_sale_enabled,
                is_made_to_order: productForDebug.is_made_to_order,
                is_reservation_enabled: productForDebug.is_reservation_enabled,
                allProductsCacheUpdated: changed,
                productPageOpen: isProductPageOpen,
                favoritesPageOpen: favoritesPageEl && (favoritesPageEl.style.display === 'block' || favoritesPageEl.style.display === 'flex')
            });
        }
        // ========== КОНЕЦ DEBUG ==========
```

**Комментарий:** Временные debug-логи для диагностики обновления UI после сохранения. Можно выключить установкой `DEBUG_PRODUCT_EDIT = false`.

---

## ИТОГОВЫЙ ЧЕКЛИСТ

- [x] Исправлено логирование ошибок в `remoteLogger.js` (Error объекты не превращаются в `{}`)
- [x] Исправлено обновление bottom sheet после сохранения в `product-edit.js`
- [x] Исправлено получение свежего продукта из кэша в `updateProductPageBottomSheet`
- [x] Исправлено логирование ошибок в `product-edit.js` (строки 932, 937)
- [x] Исправлено логирование ошибок в `products_modal.js` (строка 2114)
- [x] Добавлены временные debug-логи для диагностики
- [x] Создан план ручного тестирования (10 тестов)

---

## ПРИМЕЧАНИЯ

1. **Все изменения минимально инвазивны** - не ломают существующую логику
2. **Обратная совместимость сохранена** - если `action_type` от бэка нет, используется fallback на вычисление на фронте
3. **Ошибки не блокируют сохранение** - ошибки обновления UI логируются, но не прерывают процесс сохранения
4. **Debug-логи можно выключить** - установкой флага `DEBUG_PRODUCT_EDIT = false`
