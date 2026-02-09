// Хранилище корзины с синхронизацией через сервер
// Управление состоянием корзины

import { API_BASE, getBaseHeaders } from '../api.js';
import { getEffectiveUnitPrice, getOriginalUnitPrice } from '../utils/priceUtils.js';

let cartItems = []; // Массив товаров в корзине: [{ product, quantity, selected }]

/**
 * Получить максимально доступное количество товара (остаток).
 * Проверяет: stock, quantity, available_quantity, available_qty, qty_available, inventory.
 * Учитывает резервации.
 * @returns {number|null} Максимум или null если неограниченно
 */
export function getAvailableQuantity(product) {
    if (!product || typeof product !== 'object') return null;
    const keys = ['stock', 'quantity', 'available_quantity', 'available_qty', 'qty_available', 'inventory'];
    const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    let raw = null;
    for (const k of keys) {
        const v = product[k] ?? product[toCamel(k)];
        if (v !== undefined && v !== null && v !== '') {
            const n = Number(v);
            if (Number.isFinite(n) && n >= 0) {
                raw = n;
                break;
            }
        }
    }
    if (raw === null || raw === undefined) return null;
    const activeReservations = product.reservation?.active_count ?? 0;
    return Math.max(0, raw - activeReservations);
}

/**
 * Можно ли выбрать товар в корзине (есть остаток).
 */
export function isProductSelectableInCart(product) {
    const qty = getAvailableQuantity(product);
    return qty === null || qty > 0;
}
// Выбранный способ оплаты для расчёта итога: null = по карте (дефолт), 'cash' = наличными
let cartPaymentMethod = null;
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
        cartItems = items.map(item => {
            const prod = item.product;
            const selectable = isProductSelectableInCart(prod);
            const selected = selectable ? (item.selected !== undefined ? item.selected : true) : false;
            return { product: prod, quantity: item.quantity, selected };
        });
        
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
        // ========== DEBUG: Логирование низкоуровневого добавления в корзину ==========
        const stackTrace = new Error().stack;
        console.log(`[CART STORE DEBUG] addToCart called:`, {
            productId: product?.id,
            productName: product?.name,
            quantity,
            action_type: product?.action_type,
            can_add_to_cart: product?.can_add_to_cart,
            stackTrace: stackTrace
        });
        // ========== КОНЕЦ DEBUG ==========
        
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
        const selectable = isProductSelectableInCart(product);
        if (existingItem) {
            existingItem.quantity = result.quantity;
            if (!selectable) existingItem.selected = false;
        } else {
            cartItems.push({
                product: product,
                quantity: result.quantity,
                selected: selectable ? (result.selected !== undefined ? result.selected : true) : false
            });
        }
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        // Обновляем счетчик в меню
        if (window.updateCartButtonCount) {
            window.updateCartButtonCount();
        }
        
        // Обновляем состояние кнопок корзины на карточках товаров
        if (window.updateCartButtonsState) {
            window.updateCartButtonsState();
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
        
        // Обновляем состояние кнопок корзины на карточках товаров
        if (window.updateCartButtonsState) {
            window.updateCartButtonsState();
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
        
        // Обновляем состояние кнопок корзины на карточках товаров
        if (window.updateCartButtonsState) {
            window.updateCartButtonsState();
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
            item.selected = isProductSelectableInCart(item.product);
        });
        
        // Сохраняем в localStorage
        saveCartToStorage();
        
        console.log('[CART STORE] ✅ All items selected (only in-stock)');
        
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
        
        // Обновляем состояние кнопок корзины на карточках товаров
        if (window.updateCartButtonsState) {
            window.updateCartButtonsState();
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
 * Выбранные позиции для оформления сделки (checkout).
 * Возвращает [{ product_id, quantity }] только по выбранным товарам.
 */
export function getSelectedCartItemsForCheckout() {
    return cartItems
        .filter(item => item.selected && item.product && item.product.id)
        .map(item => ({ product_id: item.product.id, quantity: item.quantity }));
}

/**
 * Получить итоговую сумму выбранных товаров без скидки (исходная цена для выбранного способа оплаты).
 */
export function getSelectedCartTotalOriginal(promoCode = null, paymentMethod = null) {
    const selectedItems = cartItems.filter(item => item.selected);
    return selectedItems.reduce((sum, item) => {
        const price = getOriginalUnitPrice(item.product, paymentMethod);
        return sum + ((price != null ? price : 0) * item.quantity);
    }, 0);
}

/**
 * Получить итоговую сумму выбранных товаров по выбранному способу оплаты.
 * paymentMethod: null = по карте (дефолт), 'cash' = наличными. Используется getEffectiveUnitPrice.
 */
export function getSelectedCartTotal(promoCode = null, paymentMethod = null) {
    const selectedItems = cartItems.filter(item => item.selected);
    let total = selectedItems.reduce((sum, item) => {
        const price = getEffectiveUnitPrice(item.product, paymentMethod);
        return sum + ((price != null ? price : 0) * item.quantity);
    }, 0);
    if (promoCode) {
        // TODO: Применить промокод
    }
    return total;
}

/** Выбранный способ оплаты в корзине: null = по карте, 'cash' = наличными */
export function getCartPaymentMethod() {
    return cartPaymentMethod;
}

export function setCartPaymentMethod(method) {
    cartPaymentMethod = method;
}

/** Есть ли среди выбранных товаров хотя бы один с ценой наличными */
export function getSelectedCartHasAnyCash() {
    return cartItems.filter(item => item.selected).some(item => {
        const cash = item.product?.price_cash ?? item.product?.priceCash;
        return cash != null && Number(cash) > 0;
    });
}

/** Есть ли среди выбранных товары с "ценой по запросу" (без числовой цены при данном способе оплаты) */
export function getSelectedCartHasRequestPrice(paymentMethod = null) {
    return cartItems.filter(item => item.selected).some(item =>
        getEffectiveUnitPrice(item.product, paymentMethod) == null
    );
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
            cartItems.forEach(item => {
                const selectable = isProductSelectableInCart(item.product);
                if (!selectable) {
                    item.selected = false;
                } else if (item.selected === undefined) {
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
        
        // Обновляем состояние кнопок корзины на карточках товаров
        if (window.updateCartButtonsState) {
            window.updateCartButtonsState();
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
            item.selected = selected && isProductSelectableInCart(updatedProduct);
            
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
