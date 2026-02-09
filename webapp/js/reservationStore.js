// Единый store для хранения выбранного количества резервации
// Это источник истины для синхронизации между Bottom Sheet и модальным окном резервации

// Хранилище: productId -> selectedQuantity
const reservationQuantityStore = new Map();

/**
 * Установить выбранное количество для резервации товара
 * @param {number} productId - ID товара
 * @param {number} quantity - Выбранное количество
 */
export function setReservationQuantity(productId, quantity) {
    if (!productId || quantity < 1) {
        console.warn('[RESERVATION STORE] Invalid productId or quantity:', { productId, quantity });
        return;
    }
    reservationQuantityStore.set(productId, quantity);
    console.log('[RESERVATION STORE] Set quantity:', { productId, quantity });
}

/**
 * Получить выбранное количество для резервации товара
 * @param {number} productId - ID товара
 * @param {number} defaultValue - Значение по умолчанию, если количество не установлено
 * @returns {number} - Выбранное количество или defaultValue
 */
export function getReservationQuantity(productId, defaultValue = 1) {
    if (!productId) {
        return defaultValue;
    }
    const quantity = reservationQuantityStore.get(productId);
    return quantity !== undefined && quantity !== null ? quantity : defaultValue;
}

/**
 * Очистить выбранное количество для товара (после создания резервации)
 * @param {number} productId - ID товара
 */
export function clearReservationQuantity(productId) {
    if (productId) {
        reservationQuantityStore.delete(productId);
        console.log('[RESERVATION STORE] Cleared quantity for product:', productId);
    }
}

/**
 * Очистить все выбранные количества (при необходимости)
 */
export function clearAllReservationQuantities() {
    reservationQuantityStore.clear();
    console.log('[RESERVATION STORE] Cleared all quantities');
}
