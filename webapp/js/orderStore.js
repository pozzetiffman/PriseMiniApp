// Единый store для хранения выбранного количества заказа
// Это источник истины для синхронизации между Bottom Sheet и модальным окном заказа

// Хранилище: productId -> selectedQuantity
const orderQuantityStore = new Map();

/**
 * Установить выбранное количество для заказа товара
 * @param {number} productId - ID товара
 * @param {number} quantity - Выбранное количество
 */
export function setOrderQuantity(productId, quantity) {
    if (!productId || quantity < 1) {
        console.warn('[ORDER STORE] Invalid productId or quantity:', { productId, quantity });
        return;
    }
    orderQuantityStore.set(productId, quantity);
    console.log('[ORDER STORE] Set quantity:', { productId, quantity });
}

/**
 * Получить выбранное количество для заказа товара
 * @param {number} productId - ID товара
 * @param {number} defaultValue - Значение по умолчанию, если количество не установлено
 * @returns {number} - Выбранное количество или defaultValue
 */
export function getOrderQuantity(productId, defaultValue = 1) {
    if (!productId) {
        return defaultValue;
    }
    const quantity = orderQuantityStore.get(productId);
    return quantity !== undefined && quantity !== null ? quantity : defaultValue;
}

/**
 * Очистить выбранное количество для товара (после создания заказа)
 * @param {number} productId - ID товара
 */
export function clearOrderQuantity(productId) {
    if (productId) {
        orderQuantityStore.delete(productId);
        console.log('[ORDER STORE] Cleared quantity for product:', productId);
    }
}

/**
 * Очистить все выбранные количества (при необходимости)
 */
export function clearAllOrderQuantities() {
    orderQuantityStore.clear();
    console.log('[ORDER STORE] Cleared all quantities');
}
