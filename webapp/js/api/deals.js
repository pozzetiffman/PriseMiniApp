/**
 * API сделок (оформление корзины как одна сделка).
 * Двухэтапный flow: start (draft) -> confirm (данные + списание остатков).
 */
import { API_BASE, getBaseHeaders } from './config.js';

/**
 * Этап 1: создать черновую сделку (draft).
 * @param {{ items: Array<{ product_id: number, quantity: number }> }} payload
 * @returns {Promise<{ deal_id: number, status: string, total_items_count: number, total_amount: number?, currency: string? }>}
 */
export async function startDealCheckoutAPI(payload) {
    const url = `${API_BASE}/api/deals/checkout/start`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload),
    });
    // ========== УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК ==========
    if (!response.ok) {
        let errorMessage = 'Не удалось начать оформление';
        let errorDetails = null;
        
        try {
            const errorText = await response.text();
            console.error(`[DEALS API] Error response text:`, errorText);
            
            // Пытаемся распарсить JSON
            try {
                errorDetails = JSON.parse(errorText);
                errorMessage = errorDetails.message || errorDetails.detail || errorMessage;
                
                // Если есть детали ошибки от бэка - используем их
                if (errorDetails.error === 'NOT_SALE') {
                    errorMessage = errorDetails.message || `Товар нельзя оформить. Тип: ${errorDetails.action_type || 'неизвестно'}`;
                } else if (Array.isArray(errorDetails.detail)) {
                    errorMessage = errorDetails.detail.map(d => d.msg || d).join(', ');
                }
            } catch (parseError) {
                // Если не JSON - используем текст как есть
                errorMessage = errorText || errorMessage;
            }
        } catch (readError) {
            console.error(`[DEALS API] Failed to read error response:`, readError);
        }
        
        // Логируем полную информацию об ошибке для remote logs
        console.error(`[DEALS API] Checkout start error:`, {
            message: errorMessage,
            status: response.status,
            statusText: response.statusText,
            bodyText: errorDetails || 'could not read body',
            url: url
        });
        
        throw new Error(errorMessage);
        // ========== КОНЕЦ УЛУЧШЕННОЙ ОБРАБОТКИ ОШИБОК ==========
    }
    
    const text = await response.text();
    return JSON.parse(text);
}

/**
 * Этап 2: подтвердить сделку (данные оформления + списание остатков).
 * @param {Object} payload - { deal_id, payment_method, delivery_method, customer_name, customer_phone, delivery_address?, customer_comment? }
 * @returns {Promise<Object>} Подтверждённая сделка (id, deal_number, status, ...)
 */
export async function confirmDealCheckoutAPI(payload) {
    const url = `${API_BASE}/api/deals/checkout/confirm`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
        let message = 'Ошибка при подтверждении сделки';
        try {
            const data = JSON.parse(text);
            message = data.detail || (Array.isArray(data.detail) ? data.detail.map(d => d.msg || d).join(', ') : message);
        } catch (e) {
            if (text) message = text;
        }
        throw new Error(message);
    }
    return JSON.parse(text);
}

/**
 * [Deprecated] Оформить корзину одной операцией (без шага оформления).
 * Эквивалентно start + confirm с дефолтами. Оставлено для совместимости.
 */
export async function createDealCheckoutAPI(payload) {
    const url = `${API_BASE}/api/deals/checkout`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
        let message = 'Ошибка при оформлении сделки';
        try {
            const data = JSON.parse(text);
            message = data.detail || (Array.isArray(data.detail) ? data.detail.map(d => d.msg || d).join(', ') : message);
        } catch (e) {
            if (text) message = text;
        }
        throw new Error(message);
    }
    return JSON.parse(text);
}

/**
 * Активные сделки текущего пользователя.
 * @returns {Promise<Array>}
 */
export async function getMyDealsAPI() {
    const url = `${API_BASE}/api/deals/my`;
    const response = await fetch(url, { headers: getBaseHeaders() });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Deals error: ${response.status} - ${errText}`);
    }
    return response.json();
}

/**
 * История сделок (завершённые и отменённые).
 * @returns {Promise<Array>}
 */
export async function getDealsHistoryAPI() {
    const url = `${API_BASE}/api/deals/history`;
    const response = await fetch(url, { headers: getBaseHeaders() });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Deals history error: ${response.status} - ${errText}`);
    }
    return response.json();
}

/**
 * Детали одной сделки (с позициями и snapshot товаров).
 * @param {number} dealId
 * @returns {Promise<Object>}
 */
export async function getDealDetailAPI(dealId) {
    const url = `${API_BASE}/api/deals/${dealId}`;
    const response = await fetch(url, { headers: getBaseHeaders() });
    if (!response.ok) {
        if (response.status === 404) throw new Error('Сделка не найдена');
        const errText = await response.text();
        throw new Error(`Deal detail error: ${response.status} - ${errText}`);
    }
    return response.json();
}
