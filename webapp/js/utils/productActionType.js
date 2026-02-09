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
 * ПРИОРИТЕТ: Использует action_type от бэка, если доступен. Иначе вычисляет на фронте (fallback).
 * 
 * @param {Object} product - Объект товара (может содержать action_type от бэка)
 * @param {Object} appContext - Контекст приложения (содержит role, permissions и т.д.)
 * @param {Object} shopSettings - Настройки магазина (содержит reservations_enabled и т.д.)
 * @returns {string} Тип операции: 'sale', 'reserve', 'order', 'purchase', 'none'
 */
export function getProductActionType(product, appContext, shopSettings) {
    if (!product) {
        return 'none';
    }
    
    // ========== ПРИОРИТЕТ: Используем action_type от бэка, если доступен ==========
    if (product.action_type && typeof product.action_type === 'string') {
        console.log(`[PRODUCT ACTION TYPE] Using backend action_type for product ${product.id}: ${product.action_type}`);
        return product.action_type;
    }
    // ========== КОНЕЦ ПРИОРИТЕТА ==========
    
    // ========== FALLBACK: Вычисляем на фронте (для обратной совместимости) ==========
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
    // ========== КОНЕЦ FALLBACK ==========
}

/**
 * Получить иконку действия для типа операции
 * @param {string} actionType - Тип операции из getProductActionType
 * @returns {string} Эмодзи иконки
 */
export function getActionIcon(actionType) {
    switch (actionType) {
        case 'sale':
            return '🛒'; // корзина
        case 'reserve':
            return '🔒'; // замок
        case 'order':
            return '📦'; // посылка
        case 'purchase':
            return '💰'; // рука с деньгами
        default:
            return null; // без иконки
    }
}

/**
 * Получить текст primary-кнопки для типа операции
 * @param {string} actionType - Тип операции из getProductActionType
 * @returns {string} Текст кнопки
 */
export function getActionButtonText(actionType) {
    switch (actionType) {
        case 'sale':
            return 'Купить сейчас';
        case 'reserve':
            return 'Зарезервировать сейчас';
        case 'order':
            return 'Заказать сейчас';
        case 'purchase':
            return 'Продать сейчас';
        default:
            return 'Готово';
    }
}

/**
 * Проверить, является ли тип действия типом продажи (можно добавлять в корзину)
 * @param {string} actionType - Тип операции из getProductActionType
 * @returns {boolean}
 */
export function isSaleAction(actionType) {
    return actionType === 'sale';
}

/**
 * Проверить, можно ли добавлять товар в корзину (использует can_add_to_cart от бэка или вычисляет)
 * @param {Object} product - Объект товара (может содержать can_add_to_cart от бэка)
 * @param {Object} appContext - Контекст приложения
 * @param {Object} shopSettings - Настройки магазина
 * @returns {boolean}
 */
export function canAddToCart(product, appContext, shopSettings) {
    if (!product) return false;
    
    // ========== ПРИОРИТЕТ: Используем can_add_to_cart от бэка, если доступен ==========
    if (product.can_add_to_cart !== undefined && product.can_add_to_cart !== null) {
        console.log(`[PRODUCT ACTION TYPE] Using backend can_add_to_cart for product ${product.id}: ${product.can_add_to_cart}`);
        return product.can_add_to_cart === true;
    }
    // ========== КОНЕЦ ПРИОРИТЕТА ==========
    
    // ========== FALLBACK: Вычисляем на фронте ==========
    const actionType = getProductActionType(product, appContext, shopSettings);
    return isSaleAction(actionType);
    // ========== КОНЕЦ FALLBACK ==========
}
