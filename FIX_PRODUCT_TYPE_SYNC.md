# 🔧 ИСПРАВЛЕНИЕ РАССИНХРОНИЗАЦИИ ТИПОВ ТОВАРОВ

## 📊 ШАГ 0: ДИАГНОСТИКА

### Найденные проблемы:

1. **products_render.js использует старый `prod` из замыкания**
   - Обработчик клика на actionButton использует `prod` из замыкания (строка 433-475)
   - После редактирования товара `prod` не обновляется
   - `dataset.actionType` устанавливается при рендере и не обновляется

2. **allProducts кэш обновляется, но не синхронизируется с корзиной**
   - В `product-edit.js` строки 953-975 обновляют allProducts
   - Но корзина не проверяется на товары с изменившимся типом
   - Товары с `actionType !== 'sale'` остаются в корзине

3. **addProductToCart не валидирует тип товара**
   - `cartNew.js` строка 686: `addProductToCart` не проверяет `actionType`
   - Можно добавить товар с типом `reserve`/`order` в корзину

4. **bottom sheet использует старый currentProduct**
   - `cartBottomSheet.js` строка 629: `currentProduct = product` устанавливается при открытии
   - После редактирования товара `currentProduct` не обновляется

5. **isClientSale может быть undefined**
   - В `productActionType.js` строка 22 используется `isClientSale`, но он может быть не объявлен если поле отсутствует

---

## 🔧 ИСПРАВЛЕНИЯ

### ФАЙЛ 1: `webapp/js/utils/productActionType.js`

**Якорь:** После строки 9, перед функцией `getProductActionType`

**Что фиксит:** Унификация нормализации boolean значений и добавление helper для проверки типа sale

```javascript
/**
 * Нормализация boolean значения из разных форматов (true, 1, "1", "true")
 * @param {any} value - Значение для нормализации
 * @returns {boolean}
 */
function normalizeBool(value) {
    if (value === true || value === 1 || value === '1') return true;
    if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
    return false;
}

/**
 * Единый helper для определения типа операции товара
 * Используется во всех частях UI для консистентности
 * 
 * @param {Object} product - Объект товара
 * @param {Object} appContext - Контекст приложения (содержит role, permissions и т.д.)
 * @param {Object} shopSettings - Настройки магазина (содержит reservations_enabled и т.д.)
 * @returns {string} Тип операции: 'sale', 'reserve', 'order', 'purchase', 'none'
 */
export function getProductActionType(product, appContext, shopSettings) {
    if (!product) {
        return 'none';
    }
    
    // Преобразуем boolean значения из разных форматов через normalizeBool
    const isForSale = normalizeBool(product.is_for_sale);
    const isClientSale = normalizeBool(product.is_client_sale);
    const isSaleEnabled = normalizeBool(product.is_sale_enabled);
    const isMadeToOrder = normalizeBool(product.is_made_to_order);
    const isReservationEnabled = normalizeBool(product.is_reservation_enabled);

    // СТРОГИЙ ПРИОРИТЕТ (без исключений):
    // 1. is_for_sale → 'purchase' (клиент продает магазину)
    if (isForSale && appContext && appContext.role === 'client') {
        return 'purchase';
    }
    
    // 2. is_client_sale → 'sale' (клиент продает клиенту - C2C)
    if (isClientSale && appContext && appContext.role === 'client') {
        return 'sale';
    }
    
    // 3. is_sale_enabled → 'sale' (магазин продает клиенту)
    if (isSaleEnabled && appContext && appContext.role === 'client') {
        return 'sale';
    }
    
    // 4. is_made_to_order → 'order' (заказ)
    if (isMadeToOrder && appContext && appContext.role === 'client') {
        return 'order';
    }

    // 5. is_reservation_enabled → 'reserve' только если резервации разрешены в магазине и у клиента есть право
    if (isReservationEnabled && appContext && appContext.role === 'client') {
        const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
        const canReserve = appContext.permissions && appContext.permissions.can_reserve && reservationsEnabled;
        if (canReserve) {
            return 'reserve';
        }
        return 'none';
    }

    // 6. canReserve (авто) → 'reserve' — товар без явного флага, но подходит под резервацию
    if (appContext && appContext.role === 'client') {
        const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
        const canReserve = appContext.permissions && 
                          appContext.permissions.can_reserve && 
                          reservationsEnabled &&
                          !isMadeToOrder;
        if (canReserve && !isSaleEnabled && !isClientSale) {
            return 'reserve';
        }
    }

    // 7. иначе → 'none'
    return 'none';
}

// ... остальной код без изменений ...

/**
 * Проверить, является ли тип действия типом продажи (можно добавлять в корзину)
 * @param {string} actionType - Тип операции из getProductActionType
 * @returns {boolean}
 */
export function isSaleAction(actionType) {
    return actionType === 'sale';
}
```

---

### ФАЙЛ 2: `webapp/js/product-edit.js`

**Якорь:** После строки 902 (после всех `await updateProduct...API` вызовов), перед строкой 905 (`// Обновляем характеристики товара`)

**Что фиксит:** Синхронизация корзины после изменения типа товара - удаление товаров с `actionType !== 'sale'` из корзины

```javascript
            await updateProductQuantityShowEnabledAPI(productId, appContext.shop_owner_id, quantityShowEnabledToSave);
        }
        
        // ========== СИНХРОНИЗАЦИЯ КОРЗИНЫ ПОСЛЕ ИЗМЕНЕНИЯ ТИПА ТОВАРА ==========
        // Проверяем, нужно ли удалить товар из корзины, если он стал не-sale
        try {
            const { getProductActionType } = await import('./utils/productActionType.js');
            const { isProductInCart, removeFromCart } = await import('./cart/cartStore.js');
            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
            
            // Проверяем текущий тип товара (используем свежие данные если есть, иначе старые)
            const productForCheck = freshOwnerProduct || currentProduct;
            if (productForCheck && appContext) {
                const currentActionType = getProductActionType(productForCheck, appContext, shopSettings);
                const wasInCart = isProductInCart(productId);
                
                // Если товар был в корзине и стал не-sale - удаляем его
                if (wasInCart && currentActionType !== 'sale') {
                    console.log(`[PRODUCT EDIT] Removing product ${productId} from cart: actionType changed to ${currentActionType}`);
                    try {
                        await removeFromCart(productId);
                        // Показываем уведомление пользователю
                        const actionTypeText = {
                            'purchase': 'покупка',
                            'order': 'заказ',
                            'reserve': 'резервация',
                            'none': 'не продается'
                        }[currentActionType] || 'не продается';
                        console.log(`[PRODUCT EDIT] ✅ Product ${productId} removed from cart (type: ${actionTypeText})`);
                    } catch (cartError) {
                        console.error(`[PRODUCT EDIT] ⚠️ Failed to remove product from cart:`, cartError);
                    }
                }
            }
        } catch (syncError) {
            console.error(`[PRODUCT EDIT] ⚠️ Error syncing cart after type change:`, syncError);
            // Не блокируем сохранение при ошибке синхронизации корзины
        }
        // ========== КОНЕЦ СИНХРОНИЗАЦИИ КОРЗИНЫ ==========
        
        // Обновляем характеристики товара (замена списком)
```

**Якорь 2:** После строки 1005 (`if (typeof window.updateCartButtonsState === 'function') window.updateCartButtonsState();`)

**Что фиксит:** Добавление debug-логов и принудительное обновление корзины после сохранения

```javascript
        if (typeof window.updateCartButtonsState === 'function') window.updateCartButtonsState();

        // ========== DEBUG: Логирование изменений типа товара ==========
        if (freshOwnerProduct || freshClientProduct) {
            const productForDebug = freshClientProduct || freshOwnerProduct;
            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
            const { getProductActionType } = await import('./utils/productActionType.js');
            const newActionType = getProductActionType(productForDebug, appContext, shopSettings);
            console.log(`[PRODUCT EDIT DEBUG] Product ${productId} type changed:`, {
                productId,
                clientVisibleId,
                is_for_sale: productForDebug.is_for_sale,
                is_sale_enabled: productForDebug.is_sale_enabled,
                is_made_to_order: productForDebug.is_made_to_order,
                is_reservation_enabled: productForDebug.is_reservation_enabled,
                newActionType
            });
        }
        // ========== КОНЕЦ DEBUG ==========

        // Bottom sheet: если открыт по этому товару — переоткрыть со свежим client-visible продуктом
```

---

### ФАЙЛ 3: `webapp/js/handlers/products_render.js`

**Якорь:** Строка 433, внутри обработчика `actionButton.addEventListener('click', async (e) => {`

**Что фиксит:** Использование актуального продукта из кэша вместо старого из замыкания, валидация типа перед добавлением в корзину

```javascript
                // Обработчик клика на кнопку действия - показываем bottom sheet только на странице избранного
                actionButton.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Предотвращаем открытие модального окна товара
                    e.preventDefault(); // Предотвращаем стандартное поведение
                    
                    // Проверяем, что мы все еще на странице избранного
                    const favoritesPage = document.getElementById('favorites-page');
                    const isOnFavoritesPage = favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex');
                    
                    if (!isOnFavoritesPage) {
                        return; // Не показываем bottom sheet, если не на странице избранного
                    }
                    
                    try {
                        // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ==========
                        // Получаем актуальный продукт из allProducts кэша (может быть обновлен после редактирования)
                        let actualProduct = prod;
                        if (allProductsGetter) {
                            const allProducts = allProductsGetter();
                            if (Array.isArray(allProducts)) {
                                const freshProduct = allProducts.find(p => p && p.id === prod.id);
                                if (freshProduct) {
                                    actualProduct = freshProduct;
                                    console.log(`[PRODUCTS RENDER] Using fresh product from cache for ${prod.id}`);
                                }
                            }
                        }
                        // Также проверяем window.getAllProducts как fallback
                        if (!actualProduct || actualProduct === prod) {
                            const allProducts = window.getAllProducts ? window.getAllProducts() : null;
                            if (Array.isArray(allProducts)) {
                                const freshProduct = allProducts.find(p => p && p.id === prod.id);
                                if (freshProduct) {
                                    actualProduct = freshProduct;
                                    console.log(`[PRODUCTS RENDER] Using fresh product from window.getAllProducts for ${prod.id}`);
                                }
                            }
                        }
                        // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
                        
                        // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
                        const appContext = window.getAppContext ? window.getAppContext() : null;
                        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                        const { getProductActionType, isSaleAction } = await import('../utils/productActionType.js');
                        const actionType = getProductActionType(actualProduct, appContext, shopSettings);
                        
                        // ========== DEBUG: Логирование попытки добавления в корзину ==========
                        console.log(`[PRODUCTS RENDER DEBUG] Action button clicked for product ${prod.id}:`, {
                            productId: prod.id,
                            actionType,
                            isSaleAction: isSaleAction(actionType),
                            is_for_sale: actualProduct.is_for_sale,
                            is_sale_enabled: actualProduct.is_sale_enabled,
                            is_made_to_order: actualProduct.is_made_to_order,
                            is_reservation_enabled: actualProduct.is_reservation_enabled
                        });
                        // ========== КОНЕЦ DEBUG ==========
                        
                        // Для типа 'sale' добавляем товар в корзину, если его там нет
                        // ВАЛИДАЦИЯ: Только sale-товары можно добавлять в корзину
                        if (isSaleAction(actionType)) {
                            const { isProductInCart, getProductQuantityInCart } = await import('../cart/cartStore.js');
                            const isInCart = isProductInCart(actualProduct.id);
                            const currentQuantity = getProductQuantityInCart(actualProduct.id);
                            
                            if (!isInCart || currentQuantity === 0) {
                                const { addProductToCart } = await import('../cart/cartNew.js');
                                await addProductToCart(actualProduct, 1);
                            }
                        } else {
                            // Если тип не sale - не добавляем в корзину, просто открываем bottom sheet
                            console.log(`[PRODUCTS RENDER] Skipping add-to-cart for product ${prod.id}: actionType=${actionType} (not sale)`);
                        }
                        
                        // Открываем bottom sheet с АКТУАЛЬНЫМ продуктом (он сам определит правильную кнопку через helper)
                        const { showCartBottomSheet } = await import('../cart/cartBottomSheet.js');
                        await showCartBottomSheet(actualProduct);
                        
                        // Обновляем состояние кнопок корзины
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error showing bottom sheet:', error);
                        alert('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
                    }
                });
```

**Якорь 2:** Строка 1093, внутри обработчика `actionButtonList.addEventListener('click', async (e) => {` (для режима списка)

**Что фиксит:** То же самое для режима списка

```javascript
                // Обработчик клика на кнопку действия в режиме списка - показываем bottom sheet только на странице избранного
                actionButtonList.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Предотвращаем открытие модального окна товара
                    e.preventDefault(); // Предотвращаем стандартное поведение
                    
                    // Проверяем, что мы все еще на странице избранного
                    const favoritesPageForList = document.getElementById('favorites-page');
                    const isOnFavoritesPageForList = favoritesPageForList && (favoritesPageForList.style.display === 'block' || favoritesPageForList.style.display === 'flex');
                    
                    if (!isOnFavoritesPageForList) {
                        return; // Не показываем bottom sheet, если не на странице избранного
                    }
                    
                    try {
                        // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ==========
                        let actualProduct = prod;
                        if (allProductsGetter) {
                            const allProducts = allProductsGetter();
                            if (Array.isArray(allProducts)) {
                                const freshProduct = allProducts.find(p => p && p.id === prod.id);
                                if (freshProduct) actualProduct = freshProduct;
                            }
                        }
                        if (!actualProduct || actualProduct === prod) {
                            const allProducts = window.getAllProducts ? window.getAllProducts() : null;
                            if (Array.isArray(allProducts)) {
                                const freshProduct = allProducts.find(p => p && p.id === prod.id);
                                if (freshProduct) actualProduct = freshProduct;
                            }
                        }
                        // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
                        
                        // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
                        const appContext = window.getAppContext ? window.getAppContext() : null;
                        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                        const { getProductActionType, isSaleAction } = await import('../utils/productActionType.js');
                        const actionType = getProductActionType(actualProduct, appContext, shopSettings);
                        
                        // ВАЛИДАЦИЯ: Только sale-товары можно добавлять в корзину
                        if (isSaleAction(actionType)) {
                            const { isProductInCart, getProductQuantityInCart } = await import('../cart/cartStore.js');
                            const isInCart = isProductInCart(actualProduct.id);
                            const currentQuantity = getProductQuantityInCart(actualProduct.id);
                            
                            if (!isInCart || currentQuantity === 0) {
                                const { addProductToCart } = await import('../cart/cartNew.js');
                                await addProductToCart(actualProduct, 1);
                            }
                        } else {
                            console.log(`[PRODUCTS RENDER] Skipping add-to-cart (list mode) for product ${prod.id}: actionType=${actionType} (not sale)`);
                        }
                        
                        // Открываем bottom sheet с АКТУАЛЬНЫМ продуктом
                        const { showCartBottomSheet } = await import('../cart/cartBottomSheet.js');
                        await showCartBottomSheet(actualProduct);
                        
                        // Обновляем состояние кнопок корзины
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error showing bottom sheet:', error);
                        alert('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
                    }
                });
```

**Якорь 3:** Строка 390-396, где устанавливается `actionType` и `actionIcon` при рендере

**Что фиксит:** Обновление `dataset.actionType` при изменении типа товара (для отладки)

```javascript
        if (isClient && isOnFavoritesPage) {
            // Получаем тип операции через единый helper
            const currentAppContextForAction = appContextGetter ? appContextGetter() : null;
            const shopSettings = getCurrentShopSettings();
            const actionType = getProductActionType(prod, currentAppContextForAction, shopSettings);
            const actionIcon = getActionIcon(actionType);
            
            // Показываем кнопку только если есть действие
            if (actionIcon) {
                actionButton = document.createElement('button');
                actionButton.className = 'cart-button-card';
                actionButton.setAttribute('aria-label', 'Действие с товаром');
                actionButton.dataset.productId = prod.id;
                actionButton.dataset.actionType = actionType; // Сохраняем тип для отладки
                
                // ========== DEBUG: Логирование типа при рендере ==========
                console.log(`[PRODUCTS RENDER DEBUG] Rendering action button for product ${prod.id}:`, {
                    productId: prod.id,
                    actionType,
                    actionIcon,
                    is_for_sale: prod.is_for_sale,
                    is_sale_enabled: prod.is_sale_enabled,
                    is_made_to_order: prod.is_made_to_order,
                    is_reservation_enabled: prod.is_reservation_enabled
                });
                // ========== КОНЕЦ DEBUG ==========
```

---

### ФАЙЛ 4: `webapp/js/cart/cartNew.js`

**Якорь:** Строка 686, начало функции `addProductToCart`

**Что фиксит:** Валидация типа товара перед добавлением в корзину - только sale-товары можно добавлять

```javascript
/**
 * Добавить товар в корзину (публичная функция для использования из других модулей)
 */
export async function addProductToCart(product, quantity = 1) {
    try {
        // ========== ВАЛИДАЦИЯ ТИПА ТОВАРА ==========
        // Проверяем, что товар можно добавлять в корзину (только sale)
        const appContext = window.getAppContext ? window.getAppContext() : null;
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        
        if (appContext && appContext.role === 'client') {
            const { getProductActionType, isSaleAction } = await import('../utils/productActionType.js');
            const actionType = getProductActionType(product, appContext, shopSettings);
            
            if (!isSaleAction(actionType)) {
                // Товар не продается - нельзя добавлять в корзину
                const actionTypeText = {
                    'purchase': 'покупка',
                    'order': 'заказ',
                    'reserve': 'резервация',
                    'none': 'не продается'
                }[actionType] || 'не продается';
                
                const errorMessage = `Этот товар не продаётся. Доступно: ${actionTypeText}`;
                console.warn(`[CART NEW] ❌ Cannot add product ${product.id} to cart: ${errorMessage}`);
                showCartToast(errorMessage, 'error');
                throw new Error(errorMessage);
            }
        }
        // ========== КОНЕЦ ВАЛИДАЦИИ ==========
        
        const wasOutOfStock = !isProductSelectableInCart(product);
        await addToCart(product, quantity);
        
        if (wasOutOfStock) {
            showCartToast('Товара нет в наличии', 'error');
        }
        
        const cartPageNew = document.getElementById('cart-page-new');
        if (cartPageNew && cartPageNew.style.display !== 'none') {
            renderCart();
        }
        
        updateCartButtonCount();
    } catch (error) {
        console.error('[CART NEW] Error in addProductToCart:', error);
        throw error;
    }
}
```

---

### ФАЙЛ 5: `webapp/js/cart/cartBottomSheet.js`

**Якорь:** Строка 487, начало функции `primaryBtnHandler`

**Что фиксит:** Получение актуального продукта из кэша перед выполнением действия

```javascript
    // Создаем новый обработчик для основной кнопки
    primaryBtnHandler = async () => {
        if (!currentProduct) return;
        
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext) return;
        
        // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ==========
        // Получаем актуальный продукт из allProducts кэша (может быть обновлен после редактирования)
        let actualProduct = currentProduct;
        try {
            const allProducts = window.getAllProducts ? window.getAllProducts() : null;
            if (Array.isArray(allProducts)) {
                const freshProduct = allProducts.find(p => p && p.id === currentProduct.id);
                if (freshProduct) {
                    actualProduct = freshProduct;
                    console.log(`[CART BOTTOM SHEET] Using fresh product from cache for ${currentProduct.id}`);
                }
            }
        } catch (e) {
            console.warn(`[CART BOTTOM SHEET] Could not get fresh product from cache:`, e);
        }
        // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
        
        // Загружаем helper если еще не загружен
        await loadProductActionTypeHelper();
        
        // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        const actionType = getProductActionType(actualProduct, appContext, shopSettings);
        
        // ========== DEBUG: Логирование типа при клике на кнопку ==========
        console.log(`[CART BOTTOM SHEET DEBUG] Primary button clicked for product ${currentProduct.id}:`, {
            productId: currentProduct.id,
            actionType,
            is_for_sale: actualProduct.is_for_sale,
            is_sale_enabled: actualProduct.is_sale_enabled,
            is_made_to_order: actualProduct.is_made_to_order,
            is_reservation_enabled: actualProduct.is_reservation_enabled
        });
        // ========== КОНЕЦ DEBUG ==========
        
        try {
            // Получаем актуальное количество из инпута
            const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
            let quantity = quantityInput ? parseInt(quantityInput.value) || currentQuantity : currentQuantity;
            
            // ВАЛИДАЦИЯ: Проверяем, что количество не превышает доступное
            const maxQuantity = getMaxAvailableQuantity(actualProduct);
            if (maxQuantity !== null && quantity > maxQuantity) {
                // Если количество превышает доступное, ограничиваем его
                quantity = maxQuantity;
                if (quantityInput) {
                    quantityInput.value = quantity;
                }
                currentQuantity = quantity;
                
                // Обновляем количество в корзине с валидированным значением (только для типа 'sale')
                if (actionType === 'sale') {
                    try {
                        const { updateCartItemQuantity } = await import('./cartStore.js');
                        await updateCartItemQuantity(actualProduct.id, quantity);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error updating cart quantity:', error);
                    }
                }
            }
            
            // Выполняем действие в зависимости от типа операции
            closeBottomSheet();
            
            switch (actionType) {
                case 'purchase':
                    // Продать - когда клиент продает нам
                    try {
                        const { showPurchasePage } = await import('../purchases.js');
                        closeBottomSheet();
                        showPurchasePage(actualProduct); // Используем актуальный продукт
                    } catch (error) {
                        console.error('❌ Error importing showPurchasePage:', error);
                        alert('Ошибка при открытии формы продажи');
                    }
                    break;
                    
                case 'sale':
                    // Купить — единый поток через Deal: start -> deal-checkout-page -> confirm (как из корзины)
                    try {
                        const { startDealCheckoutAPI } = await import('../api/deals.js');
                        const { openDealCheckoutPage } = await import('../dealCheckout.js');
                        const quantity = quantityInput ? Math.max(1, parseInt(quantityInput.value) || 1) : currentQuantity;
                        const result = await startDealCheckoutAPI({
                            items: [{ product_id: actualProduct.id, quantity }], // Используем актуальный продукт
                        });
                        openDealCheckoutPage(result.deal_id, {
                            total_items_count: result.total_items_count,
                            total_amount: result.total_amount,
                            currency: result.currency,
                        }, { source: 'single' });
                    } catch (error) {
                        console.error('❌ Error starting deal checkout (buy from card):', error);
                        alert('Ошибка при оформлении: ' + (error.message || 'не удалось начать оформление'));
                    }
                    break;
                    
                case 'order':
                    // Заказать - когда клиент делает заказ
                    try {
                        const { showOrderPage } = await import('../orders.js');
                        closeBottomSheet();
                        showOrderPage(actualProduct.id, false); // Используем актуальный продукт
                    } catch (error) {
                        console.error('❌ Error importing showOrderPage:', error);
                        alert('Ошибка при открытии формы заказа');
                    }
                    break;
                    
                case 'reserve':
                    // Резервировать - когда клиент делает резервацию
                    try {
                        const { showReservationModal } = await import('../reservations.js');
                        showReservationModal(actualProduct.id); // Используем актуальный продукт
                    } catch (error) {
                        console.error('❌ Error importing showReservationModal:', error);
                        alert('Ошибка при открытии формы резервации');
                    }
                    break;
                    
                default:
                    // Для остальных товаров - просто закрываем bottom sheet
                    // Количество уже обновлено при изменении в bottom sheet
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                    break;
            }
        } catch (error) {
            console.error('❌ Error in primary button action:', error);
            alert('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
        }
    };
```

**Якорь 2:** Строка 629, где устанавливается `currentProduct` при открытии bottom sheet

**Что фиксит:** Получение актуального продукта из кэша при открытии bottom sheet

```javascript
    currentProduct = product;
    
    // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ПРИ ОТКРЫТИИ ==========
    // Получаем актуальный продукт из allProducts кэша (может быть обновлен после редактирования)
    try {
        const allProducts = window.getAllProducts ? window.getAllProducts() : null;
        if (Array.isArray(allProducts)) {
            const freshProduct = allProducts.find(p => p && p.id === product.id);
            if (freshProduct) {
                currentProduct = freshProduct;
                console.log(`[CART BOTTOM SHEET] Using fresh product from cache on open for ${product.id}`);
            }
        }
    } catch (e) {
        console.warn(`[CART BOTTOM SHEET] Could not get fresh product from cache on open:`, e);
    }
    // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
    
    // НОВАЯ ЛОГИКА: Получаем текущее количество товара в корзине
```

---

### ФАЙЛ 6: `webapp/js/favorites.js`

**Якорь:** Строка 740, внутри обработчика клика на кнопку корзины в избранном

**Что фиксит:** Использование актуального продукта и валидация типа перед добавлением в корзину

```javascript
                // Восстанавливаем обработчик клика на кнопку корзины - показываем bottom sheet
                const cartButton = clonedCard.querySelector('.cart-button-card:not(.cart-button-list)');
                if (cartButton) {
                    cartButton.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Предотвращаем открытие модального окна товара
                        e.preventDefault(); // Предотвращаем стандартное поведение
                        
                        try {
                            // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ==========
                            let actualProduct = prod;
                            const allProducts = window.getAllProducts ? window.getAllProducts() : null;
                            if (Array.isArray(allProducts)) {
                                const freshProduct = allProducts.find(p => p && p.id === prod.id);
                                if (freshProduct) actualProduct = freshProduct;
                            }
                            // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
                            
                            // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
                            const appContext = window.getAppContext ? window.getAppContext() : null;
                            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                            const { getProductActionType, isSaleAction } = await import('./utils/productActionType.js');
                            const actionType = getProductActionType(actualProduct, appContext, shopSettings);
                            
                            // ВАЛИДАЦИЯ: Только sale-товары можно добавлять в корзину
                            if (isSaleAction(actionType)) {
                                const { isProductInCart, getProductQuantityInCart } = await import('./cart/cartStore.js');
                                const isInCart = isProductInCart(actualProduct.id);
                                const currentQuantity = getProductQuantityInCart(actualProduct.id);
                                
                                if (!isInCart || currentQuantity === 0) {
                                    const { addProductToCart } = await import('./cart/cartNew.js');
                                    await addProductToCart(actualProduct, 1);
                                }
                            } else {
                                console.log(`[FAVORITES] Skipping add-to-cart for product ${prod.id}: actionType=${actionType} (not sale)`);
                            }
                            
                            // Открываем bottom sheet с АКТУАЛЬНЫМ продуктом
                            const { showCartBottomSheet } = await import('./cart/cartBottomSheet.js');
                            await showCartBottomSheet(actualProduct);
                            
                            // Обновляем состояние кнопок корзины
                            if (window.updateCartButtonsState) {
                                window.updateCartButtonsState();
                            }
                        } catch (error) {
                            console.error('❌ Error showing bottom sheet:', error);
                            alert('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
                        }
                    });
                }
```

---

## ✅ ТЕСТ-КЕЙСЫ

После применения исправлений проверьте:

1. **Товар был sale → переключили в reservation**
   - ✅ В избранном иконка стала 🔒
   - ✅ В карточке кнопка "Зарезервировать сейчас"
   - ✅ Товар исчез из корзины если был там
   - ✅ Badge корзины убрался с кнопки действия

2. **Товар был sale → переключили в order**
   - ✅ Иконка 📦
   - ✅ Кнопка "Заказать сейчас"
   - ✅ add-to-cart больше не работает (показывает ошибку)
   - ✅ Товар удален из корзины

3. **Товар был reservation → переключили обратно в sale**
   - ✅ Появляется 🛒
   - ✅ Кнопка "Купить сейчас"
   - ✅ Снова можно в корзину
   - ✅ Badge корзины появляется при добавлении

4. **Открытый bottom sheet до сохранения**
   - ✅ После сохранения и повторного открытия показывает правильную кнопку
   - ✅ Использует актуальный продукт из кэша

5. **Никаких "залипших" старых кнопок**
   - ✅ После редактирования все кнопки обновляются
   - ✅ Иконки соответствуют текущему типу товара

---

## 📝 ПРИМЕЧАНИЯ

1. **Debug-логи** можно оставить для отладки, но в production можно убрать или сделать условными через `if (window.DEBUG)`
2. **Ошибки синхронизации корзины** не блокируют сохранение товара - это сделано намеренно
3. **Fallback на старый продукт** - если не удалось получить из кэша, используется переданный продукт
4. **Все изменения точечные** - не ломают существующую логику, только добавляют валидацию и синхронизацию
