// Хранилище корзины с синхронизацией через сервер
// Управление состоянием корзины

import { API_BASE, getBaseHeaders } from '../api.js';

let cartItems = []; // Массив товаров в корзине: [{ product, quantity, selected }]
let syncInProgress = false; // Флаг для предотвращения одновременных синхронизаций

/**
 * Получить контекст приложения
 */
function getAppContext() {
    return window.getAppContext ? window.getAppContext() : null;
}

/**
 * Получить все товары в корзине
 */
export function getCartItems() {
    return [...cartItems]; // Возвращаем копию
}

/**
 * Синхронизировать корзину с сервером
 */
export async function syncCartFromServer() {
    if (syncInProgress) {
        console.log('[CART STORE] Sync already in progress, skipping...');
        return getCartItems();
    }
    
    syncInProgress = true;
    
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            console.warn('[CART STORE] ⚠️ Cannot sync cart: appContext not available');
            syncInProgress = false;
            return getCartItems();
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        const url = `${API_BASE}/api/cart/list?shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Sync cart error: ${response.status} - ${errorText}`);
        }
        
        const items = await response.json();
        
        // Преобразуем формат данных с сервера в локальный формат
        cartItems = items.map(item => ({
            product: item.product,
            quantity: item.quantity,
            selected: item.selected !== undefined ? item.selected : true
        }));
        
        // Сохраняем в localStorage как резервную копию
        saveCartToStorage();
        
        console.log(`[CART STORE] ✅ Synced ${cartItems.length} items from server`);
        
        // Обновляем счетчик в меню после синхронизации
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error syncing cart from server:', error);
        // При ошибке загружаем из localStorage как fallback
        loadCartFromStorage();
        return getCartItems();
    } finally {
        syncInProgress = false;
    }
}

/**
 * Добавить товар в корзину или увеличить количество
 */
export async function addToCart(product, quantity = 1) {
    try {
        if (!product || !product.id) {
            throw new Error('Invalid product: product or product.id is missing');
        }
        
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/add?product_id=${product.id}&quantity=${quantity}&shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Add to cart error: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // Обновляем локальное состояние
        const existingItem = cartItems.find(item => item.product.id === product.id);
        
        if (existingItem) {
            existingItem.quantity = result.quantity;
        } else {
            cartItems.push({
                product: product,
                quantity: result.quantity,
                selected: result.selected !== undefined ? result.selected : true
            });
        }
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        // Обновляем счетчик в меню
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        console.log(`[CART STORE] ✅ Product ${product.id} added to cart, quantity: ${result.quantity}`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in addToCart:', error);
        throw error;
    }
}

/**
 * Удалить товар из корзины
 */
export async function removeFromCart(productId) {
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/remove?product_id=${productId}&shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Remove from cart error: ${response.status} - ${errorText}`);
        }
        
        // Обновляем локальное состояние
        cartItems = cartItems.filter(item => item.product.id !== productId);
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        // Обновляем счетчик в меню
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        console.log(`[CART STORE] ✅ Product ${productId} removed from cart`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in removeFromCart:', error);
        throw error;
    }
}

/**
 * Изменить количество товара в корзине
 */
export async function updateCartItemQuantity(productId, quantity) {
    try {
        if (quantity <= 0) {
            // Если количество 0 или меньше, удаляем товар
            return await removeFromCart(productId);
        }
        
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/update?product_id=${productId}&quantity=${quantity}&shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Update cart item error: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // Обновляем локальное состояние
        const item = cartItems.find(item => item.product.id === productId);
        if (item) {
            item.quantity = result.quantity;
            if (result.selected !== undefined) {
                item.selected = result.selected;
            }
        }
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        // Обновляем счетчик в меню
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        console.log(`[CART STORE] ✅ Product ${productId} quantity updated to ${result.quantity}`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in updateCartItemQuantity:', error);
        throw error;
    }
}

/**
 * Переключить выбор товара
 */
export async function toggleCartItemSelection(productId) {
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/toggle-selection?product_id=${productId}&shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Toggle selection error: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // Обновляем локальное состояние
        const item = cartItems.find(item => item.product.id === productId);
        if (item) {
            item.selected = result.selected;
        }
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        console.log(`[CART STORE] ✅ Product ${productId} selection toggled to ${result.selected}`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in toggleCartItemSelection:', error);
        throw error;
    }
}

/**
 * Выбрать все товары
 */
export async function selectAllCartItems() {
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/select-all?shop_owner_id=${shopOwnerId}&selected=true${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Select all error: ${response.status} - ${errorText}`);
        }
        
        // Обновляем локальное состояние
        cartItems.forEach(item => {
            item.selected = true;
        });
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        console.log(`[CART STORE] ✅ All items selected`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in selectAllCartItems:', error);
        throw error;
    }
}

/**
 * Снять выбор со всех товаров
 */
export async function deselectAllCartItems() {
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/select-all?shop_owner_id=${shopOwnerId}&selected=false${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Deselect all error: ${response.status} - ${errorText}`);
        }
        
        // Обновляем локальное состояние
        cartItems.forEach(item => {
            item.selected = false;
        });
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        console.log(`[CART STORE] ✅ All items deselected`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in deselectAllCartItems:', error);
        throw error;
    }
}

/**
 * Удалить выбранные товары
 */
export async function removeSelectedCartItems() {
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/remove-selected?shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Remove selected error: ${response.status} - ${errorText}`);
        }
        
        // Обновляем локальное состояние
        cartItems = cartItems.filter(item => !item.selected);
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        // Обновляем счетчик в меню
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        console.log(`[CART STORE] ✅ Selected items removed`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in removeSelectedCartItems:', error);
        throw error;
    }
}

/**
 * Получить количество товаров в корзине
 */
export function getCartItemsCount() {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Получить количество выбранных товаров
 */
export function getSelectedCartItemsCount() {
    return cartItems
        .filter(item => item.selected)
        .reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Получить итоговую сумму выбранных товаров без скидки
 */
export function getSelectedCartTotalOriginal(promoCode = null) {
    const selectedItems = cartItems.filter(item => item.selected);
    
    let total = selectedItems.reduce((sum, item) => {
        const product = item.product;
        let price = 0;
        
        // Определяем цену товара (без скидки)
        if (product.price_fixed !== null && product.price_fixed !== undefined) {
            price = product.price_fixed;
        } else if (product.price_from !== null && product.price_from !== undefined) {
            price = product.price_from;
        } else if (product.price !== null && product.price !== undefined) {
            price = product.price;
        }
        
        return sum + (price * item.quantity);
    }, 0);
    
    return total;
}

/**
 * Получить итоговую сумму выбранных товаров
 */
export function getSelectedCartTotal(promoCode = null) {
    const selectedItems = cartItems.filter(item => item.selected);
    
    let total = selectedItems.reduce((sum, item) => {
        const product = item.product;
        let price = 0;
        
        // Определяем цену товара
        if (product.price_fixed !== null && product.price_fixed !== undefined) {
            // Фиксированная цена
            price = product.price_fixed;
        } else if (product.price_from !== null && product.price_from !== undefined) {
            // Цена от
            price = product.price_from;
        } else if (product.price !== null && product.price !== undefined) {
            // Обычная цена
            price = product.price;
        }
        
        // Применяем скидку, если есть
        if (product.discount > 0) {
            price = Math.round(price * (1 - product.discount / 100));
        }
        
        return sum + (price * item.quantity);
    }, 0);
    
    // Применяем промокод, если есть (пока просто заглушка)
    if (promoCode) {
        // TODO: Применить промокод
    }
    
    return total;
}

/**
 * Проверить, есть ли товар в корзине
 */
export function isProductInCart(productId) {
    return cartItems.some(item => item.product.id === productId);
}

/**
 * Получить количество конкретного товара в корзине
 */
export function getProductQuantityInCart(productId) {
    const item = cartItems.find(item => item.product.id === productId);
    return item ? item.quantity : 0;
}

/**
 * Сохранить корзину в localStorage (как резервную копию)
 */
function saveCartToStorage() {
    try {
        localStorage.setItem('cart_items', JSON.stringify(cartItems));
    } catch (e) {
        console.warn('⚠️ Failed to save cart to localStorage:', e);
    }
}

/**
 * Загрузить корзину из localStorage (только как fallback)
 */
export function loadCartFromStorage() {
    try {
        const stored = localStorage.getItem('cart_items');
        if (stored) {
            cartItems = JSON.parse(stored);
            // Убеждаемся, что все товары выбраны по умолчанию
            cartItems.forEach(item => {
                if (item.selected === undefined) {
                    item.selected = true;
                }
            });
        }
    } catch (e) {
        console.warn('⚠️ Failed to load cart from localStorage:', e);
        cartItems = [];
    }
    return getCartItems();
}

/**
 * Очистить корзину
 */
export async function clearCart() {
    try {
        const appContext = getAppContext();
        if (!appContext || !appContext.shop_owner_id) {
            throw new Error('App context not available');
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        
        // Отправляем запрос на сервер
        const url = `${API_BASE}/api/cart/clear?shop_owner_id=${shopOwnerId}${botId ? `&bot_id=${botId}` : ''}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Clear cart error: ${response.status} - ${errorText}`);
        }
        
        // Обновляем локальное состояние
        cartItems = [];
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        // Обновляем счетчик в меню
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        console.log(`[CART STORE] ✅ Cart cleared`);
        
        return getCartItems();
    } catch (error) {
        console.error('[CART STORE] ❌ Error in clearCart:', error);
        throw error;
    }
}

/**
 * Обновить данные товаров в корзине из API
 * @param {Array} freshProducts - Массив актуальных товаров из API
 */
export function updateCartProductsFromAPI(freshProducts) {
    if (!Array.isArray(freshProducts)) {
        console.warn('[CART STORE] updateCartProductsFromAPI: freshProducts is not an array');
        return getCartItems();
    }
    
    // Создаем Map для быстрого поиска товаров по ID
    const productsMap = new Map();
    freshProducts.forEach(product => {
        if (product && product.id) {
            productsMap.set(product.id, product);
        }
    });
    
    let updatedCount = 0;
    let removedCount = 0;
    
    // Обновляем товары в корзине
    cartItems.forEach(item => {
        const productId = item.product.id;
        const freshProduct = productsMap.get(productId);
        
        if (freshProduct) {
            // Товар найден в API - обновляем его данные
            // Сохраняем количество и выбранное состояние
            const quantity = item.quantity;
            const selected = item.selected;
            
            // Глубокое копирование актуального товара
            const updatedProduct = JSON.parse(JSON.stringify(freshProduct));
            
            // Обновляем товар в корзине
            item.product = updatedProduct;
            item.quantity = quantity;
            item.selected = selected;
            
            updatedCount++;
        } else {
            // Товар не найден в API - помечаем для удаления
            console.warn(`[CART STORE] ⚠️ Product ${productId} not found in API, will be removed from cart`);
            removedCount++;
        }
    });
    
    // Удаляем товары, которых нет в API
    if (removedCount > 0) {
        const productIdsToKeep = new Set(freshProducts.map(p => p.id));
        const beforeCount = cartItems.length;
        cartItems = cartItems.filter(item => productIdsToKeep.has(item.product.id));
        const afterCount = cartItems.length;
        console.log(`[CART STORE] Removed ${beforeCount - afterCount} products that are no longer available`);
    }
    
    // Сохраняем обновленную корзину
    if (updatedCount > 0 || removedCount > 0) {
        saveCartToStorage();
        console.log(`[CART STORE] ✅ Cart updated: ${updatedCount} products updated, ${removedCount} products removed`);
    }
    
    return getCartItems();
}
