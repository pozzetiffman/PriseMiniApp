# ПАТЧИ: Обновление UI после редактирования товара через событийную систему

## РЕШЕНИЕ

Вместо динамических импортов используется событийная система (CustomEvent):
1. После сохранения товара эмитится событие `product:updated`
2. `products_modal.js` подписывается на событие и обновляет UI
3. Все модули используют свежие данные из кэша `allProducts`

## ИЗМЕНЕННЫЕ ФАЙЛЫ

### 1. `webapp/js/data.js`

**ВСТАВИТЬ ПОСЛЕ строки 197** (после `allProductsSetter(products);`):

```javascript
        // ========== ЭКСПОРТ ФУНКЦИЙ ДЛЯ РАБОТЫ С allProducts ==========
        // Экспортируем функции для безопасного доступа к allProducts из других модулей
        if (typeof window !== 'undefined') {
            window.getAllProducts = () => {
                const products = allProductsGetter ? allProductsGetter() : [];
                return Array.isArray(products) ? products : [];
            };
            window.setAllProducts = (next) => {
                if (allProductsSetter && Array.isArray(next)) {
                    allProductsSetter(next);
                }
            };
        }
        // ========== КОНЕЦ ЭКСПОРТА ==========
```

**Комментарий:** Экспортирует функции для безопасного доступа к `allProducts` из других модулей.

---

### 2. `webapp/js/product-edit.js`

**ЗАМЕНИТЬ блок после строки 1027** (внутри `if (changed)`):

```javascript
                if (changed) {
                    allProductsSetter(next);
                    if (applyFiltersCallback) applyFiltersCallback();
                    console.log(`[PRODUCT EDIT] ✅ Updated allProducts cache with fresh products (action_type preserved from backend)`);
                    
                    // ========== ЭМИССИЯ СОБЫТИЯ ОБНОВЛЕНИЯ ТОВАРА ==========
                    // Эмитим событие для обновления UI в других модулях (products_modal.js, products_render.js)
                    try {
                        const updateEvent = new CustomEvent('product:updated', {
                            detail: {
                                productId: productId,
                                clientVisibleId: clientVisibleId,
                                ownerProduct: freshOwnerProduct,
                                clientProduct: freshClientProduct,
                                timestamp: Date.now()
                            }
                        });
                        window.dispatchEvent(updateEvent);
                        
                        // ========== DEBUG: Логирование события ==========
                        const DEBUG_PRODUCT_EDIT = true; // Установить в false для отключения
                        if (DEBUG_PRODUCT_EDIT) {
                            const productForDebug = freshClientProduct || freshOwnerProduct;
                            console.log(`[PRODUCT EDIT] ✅ Dispatched product:updated event for product ${productId}:`, {
                                productId: productId,
                                clientVisibleId: clientVisibleId,
                                action_type: productForDebug?.action_type,
                                can_add_to_cart: productForDebug?.can_add_to_cart,
                                timestamp: updateEvent.detail.timestamp
                            });
                        }
                        // ========== КОНЕЦ DEBUG ==========
                    } catch (eventError) {
                        console.warn(`[PRODUCT EDIT] ⚠️ Failed to dispatch product:updated event:`, {
                            message: eventError?.message || 'Unknown error',
                            productId: productId
                        });
                        // Не блокируем сохранение при ошибке события
                    }
                    // ========== КОНЕЦ ЭМИССИИ СОБЫТИЯ ==========
                    
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
                }
```

**Комментарий:** После обновления `allProducts` эмитится событие `product:updated` с данными обновленного товара.

---

### 3. `webapp/js/handlers/products_modal.js`

**ВСТАВИТЬ ПЕРЕД функцией `initProductModalDependencies`** (перед строкой 104):

```javascript
// ========== ПОДПИСКА НА СОБЫТИЕ ОБНОВЛЕНИЯ ТОВАРА ==========
// Подписываемся на событие product:updated для обновления UI при изменении товара
let productUpdateHandler = null;

function setupProductUpdateListener() {
    if (productUpdateHandler) {
        // Уже подписаны, не дублируем
        return;
    }
    
    productUpdateHandler = (event) => {
        const { productId, clientVisibleId, ownerProduct, clientProduct } = event.detail || {};
        if (!productId) return;
        
        // ========== DEBUG: Логирование получения события ==========
        const DEBUG_PRODUCT_MODAL = true; // Установить в false для отключения
        if (DEBUG_PRODUCT_MODAL) {
            console.log(`[PRODUCT MODAL] Received product:updated event for product ${productId}:`, {
                productId,
                clientVisibleId,
                action_type: clientProduct?.action_type || ownerProduct?.action_type,
                can_add_to_cart: clientProduct?.can_add_to_cart || ownerProduct?.can_add_to_cart
            });
        }
        // ========== КОНЕЦ DEBUG ==========
        
        // Проверяем, открыта ли страница товара
        const productPage = document.getElementById('product-page');
        const isProductPageOpen = productPage && (productPage.style.display === 'block' || productPage.style.display === 'flex');
        
        if (!isProductPageOpen) {
            // Страница товара не открыта, ничего не делаем
            return;
        }
        
        // Проверяем, что это тот же товар (по ID или sync_product_id)
        try {
            // Получаем текущий продукт из кэша для сравнения
            const allProducts = typeof window.getAllProducts === 'function' ? window.getAllProducts() : [];
            if (!Array.isArray(allProducts)) return;
            
            // Ищем продукт в кэше по ID или sync_product_id
            const targetProductId = clientVisibleId || productId;
            const cachedProduct = allProducts.find(p => 
                p && (p.id === targetProductId || 
                     p.id === productId ||
                     (p.sync_product_id && (p.sync_product_id === targetProductId || p.sync_product_id === productId)) ||
                     (targetProductId && p.id === targetProductId))
            );
            
            if (!cachedProduct) {
                // Продукт не найден в кэше, возможно еще не загружен
                return;
            }
            
            // Обновляем bottom sheet с СВЕЖИМ продуктом из кэша
            updateProductPageBottomSheet(cachedProduct).catch(error => {
                console.warn(`[PRODUCT MODAL] Failed to update bottom sheet after product:updated event:`, {
                    message: error?.message || 'Unknown error',
                    productId: productId
                });
            });
            
            if (DEBUG_PRODUCT_MODAL) {
                console.log(`[PRODUCT MODAL] ✅ Updated bottom sheet for product ${productId} after product:updated event`);
            }
        } catch (error) {
            console.warn(`[PRODUCT MODAL] Error handling product:updated event:`, {
                message: error?.message || 'Unknown error',
                stack: error?.stack || '',
                productId: productId
            });
        }
    };
    
    window.addEventListener('product:updated', productUpdateHandler);
}

// Инициализация зависимостей для showProductModal
export function initProductModalDependencies(dependencies) {
    // Настраиваем подписку на событие обновления товара
    setupProductUpdateListener();
```

**ЗАМЕНИТЬ блок в функции `updateProductPageBottomSheet`** (строки 2130-2142):

```javascript
    // Также убеждаемся, что товар добавлен в корзину (если его там еще нет)
    // ВАЖНО: Добавляем только если товар типа 'sale' и can_add_to_cart === true
    try {
        // Проверяем, можно ли добавлять товар в корзину
        const canAddToCart = freshProduct.can_add_to_cart === true || 
                            (freshProduct.action_type === 'sale' && freshProduct.can_add_to_cart !== false);
        
        if (canAddToCart) {
            // Безопасно импортируем функции корзины
            try {
                const cartModule = await import('../cart/cartStore.js');
                if (cartModule && cartModule.getCartItems && cartModule.addProductToCart) {
                    const cartItems = cartModule.getCartItems();
                    const existingItem = cartItems.find(item => item.product && item.product.id === freshProduct.id);
                    if (!existingItem) {
                        // Если товара нет в корзине, добавляем его
                        await cartModule.addProductToCart(freshProduct, currentQuantity);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    }
                }
            } catch (importError) {
                // Если импорт не удался, просто логируем и продолжаем
                console.warn(`[PRODUCT MODAL] Could not import cartStore for ensureProductInCart:`, {
                    message: importError?.message || 'Unknown error',
                    productId: freshProduct?.id
                });
            }
        }
    } catch (error) {
        // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
        console.error('❌ Error ensuring product in cart:', {
            message: error?.message || 'Unknown error',
            stack: error?.stack || '',
            name: error?.name || 'Error',
            productId: freshProduct?.id,
            productName: freshProduct?.name,
            currentQuantity: currentQuantity,
            can_add_to_cart: freshProduct?.can_add_to_cart,
            action_type: freshProduct?.action_type
        });
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
    }
```

**Комментарий:** 
1. Подписка на событие `product:updated` при инициализации модуля
2. При получении события проверяется, открыта ли страница товара и тот ли это товар
3. Если да - обновляется bottom sheet с свежими данными из кэша
4. Исправлена проблема с `addProductToCart` - добавлены безопасные проверки

---

### 4. `webapp/js/handlers/products_render.js`

**ЗАМЕНИТЬ блок в функции рендеринга action button** (строки 390-395):

```javascript
        if (isClient && isOnFavoritesPage) {
            // ========== ПРИОРИТЕТ: Используем action_type от бэка, если доступен ==========
            let actionType = null;
            if (prod.action_type && typeof prod.action_type === 'string') {
                actionType = prod.action_type;
                // ========== DEBUG: Логирование использования action_type от бэка ==========
                const DEBUG_PRODUCTS_RENDER = true; // Установить в false для отключения
                if (DEBUG_PRODUCTS_RENDER) {
                    console.log(`[PRODUCTS RENDER] Using backend action_type for product ${prod.id}: ${actionType}`);
                }
                // ========== КОНЕЦ DEBUG ==========
            } else {
                // Fallback: вычисляем на фронте (для обратной совместимости)
                const currentAppContextForAction = appContextGetter ? appContextGetter() : null;
                const shopSettings = getCurrentShopSettings();
                actionType = getProductActionType(prod, currentAppContextForAction, shopSettings);
            }
            // ========== КОНЕЦ ПРИОРИТЕТА ==========
            const actionIcon = getActionIcon(actionType);
```

**ЗАМЕНИТЬ блок в функции рендеринга action button (list mode)** (строка 1131):

```javascript
            // ========== ПРИОРИТЕТ: Используем action_type от бэка, если доступен ==========
            let actionType = null;
            if (prod.action_type && typeof prod.action_type === 'string') {
                actionType = prod.action_type;
                // ========== DEBUG: Логирование использования action_type от бэка ==========
                const DEBUG_PRODUCTS_RENDER = true; // Установить в false для отключения
                if (DEBUG_PRODUCTS_RENDER) {
                    console.log(`[PRODUCTS RENDER] Using backend action_type (list mode) for product ${prod.id}: ${actionType}`);
                }
                // ========== КОНЕЦ DEBUG ==========
            } else {
                // Fallback: вычисляем на фронте (для обратной совместимости)
                actionType = getProductActionType(prod, currentAppContextForActionList, shopSettings);
            }
            // ========== КОНЕЦ ПРИОРИТЕТА ==========
            const actionIcon = getActionIcon(actionType);
```

**ОБНОВИТЬ DEBUG логирование** (строка 406):

```javascript
                // ========== DEBUG: Логирование типа при рендере ==========
                const DEBUG_PRODUCTS_RENDER = true; // Установить в false для отключения
                if (DEBUG_PRODUCTS_RENDER) {
                    console.log(`[PRODUCTS RENDER DEBUG] Rendering action button for product ${prod.id}:`, {
                        productId: prod.id,
                        actionType,
                        action_type_backend: prod.action_type,
                        can_add_to_cart_backend: prod.can_add_to_cart,
                        actionIcon,
                        is_for_sale: prod.is_for_sale,
                        is_sale_enabled: prod.is_sale_enabled,
                        is_made_to_order: prod.is_made_to_order,
                        is_reservation_enabled: prod.is_reservation_enabled
                    });
                }
                // ========== КОНЕЦ DEBUG ==========
```

**Комментарий:** 
1. Приоритет использования `action_type` от бэка вместо вычисления на фронте
2. Fallback на вычисление для обратной совместимости
3. Улучшенное debug-логирование

---

## ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

1. Пользователь редактирует товар и меняет тип (sale/reserve/order/purchase)
2. После сохранения:
   - Обновляется `allProducts` кэш
   - Эмитится событие `product:updated`
3. `products_modal.js` получает событие:
   - Проверяет, открыта ли страница товара
   - Если да - обновляет bottom sheet с свежими данными из кэша
4. `products_render.js` при следующем рендере:
   - Использует `action_type` от бэка (если доступен)
   - Показывает правильные иконки и кнопки

## DEBUG-ЛОГИ

Все debug-логи можно отключить установкой флагов:
- `DEBUG_PRODUCT_EDIT = false` в `product-edit.js`
- `DEBUG_PRODUCT_MODAL = false` в `products_modal.js`
- `DEBUG_PRODUCTS_RENDER = false` в `products_render.js`

## ПРОВЕРКА

После применения патчей проверьте:
1. Откройте товар типа "sale"
2. Измените тип на "reserve" и сохраните
3. **Ожидаемый результат:**
   - Bottom sheet обновился автоматически
   - Кнопка изменилась на "Зарезервировать сейчас"
   - В консоли видны логи события `product:updated`
   - В списке товаров иконка изменилась на 🔒
