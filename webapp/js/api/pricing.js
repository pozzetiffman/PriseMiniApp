/**
 * API предварительного расчёта цен (quote).
 * Единый источник истины на бэкенде: итог с учётом payment_method и delivery_fee.
 */
import { API_BASE, getBaseHeaders } from './config.js';

/**
 * Получить расчёт суммы (quote) для отображения до confirm.
 * @param {Object} payload - { deal_id?: number, items?: Array<{ product_id: number, quantity: number }>, payment_method: string, delivery_method: string }
 * @returns {Promise<{ items: Array<{ product_id, quantity, unit_price, line_total }>, items_amount: number, delivery_fee: number, total_amount: number, currency: string }>}
 */
export async function getPricingQuoteAPI(payload) {
    const url = `${API_BASE}/api/pricing/quote`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload),
    });
    // ========== УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК ==========
    if (!response.ok) {
        let errorMessage = 'Не удалось рассчитать стоимость';
        let errorDetails = null;
        
        try {
            const errorText = await response.text();
            console.error(`[PRICING API] Error response text:`, errorText);
            
            // Пытаемся распарсить JSON
            try {
                errorDetails = JSON.parse(errorText);
                errorMessage = errorDetails.message || errorDetails.detail || errorMessage;
                
                // Если есть детали ошибки от бэка - используем их
                if (errorDetails.error === 'NOT_SALE') {
                    errorMessage = errorDetails.message || `Товар нельзя рассчитать. Тип: ${errorDetails.action_type || 'неизвестно'}`;
                } else if (Array.isArray(errorDetails.detail)) {
                    errorMessage = errorDetails.detail.map(d => d.msg || d).join(', ');
                }
            } catch (parseError) {
                // Если не JSON - используем текст как есть
                errorMessage = errorText || errorMessage;
            }
        } catch (readError) {
            console.error(`[PRICING API] Failed to read error response:`, readError);
        }
        
        // Логируем полную информацию об ошибке для remote logs
        console.error(`[PRICING API] Quote error:`, {
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
