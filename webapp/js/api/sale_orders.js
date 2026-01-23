// Модуль для работы с заказами на покупку (когда мы продаем товар клиенту)
// Аналогично orders.js, но для sale_orders

import { API_BASE, getBaseHeaders } from './config.js';

// Создание заказа на покупку
export async function createSaleOrderAPI(orderData) {
    const url = `${API_BASE}/api/sale-orders/`;
    console.log(`📦 [SALE ORDER] Creating sale order:`, orderData);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders(),
        body: JSON.stringify(orderData)
    });
    
    const responseText = await response.text();
    console.log(`📦 [SALE ORDER] Response: status=${response.status}, body=${responseText.substring(0, 200)}`);
    
    if (!response.ok) {
        let errorMessage = 'Ошибка при создании заказа на покупку';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}

// Получить все заказы на покупку текущего пользователя (как покупателя)
export async function getMySaleOrdersAPI() {
    const url = `${API_BASE}/api/sale-orders/`;
    console.log(`📦 [SALE ORDER] Fetching my sale orders from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sale orders error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ [SALE ORDER] My sale orders fetched: ${data.length}`);
    return data;
}

// Получить историю заказов на покупку (завершенные и отмененные)
export async function getSaleOrdersHistoryAPI() {
    const url = `${API_BASE}/api/sale-orders/history`;
    console.log(`📦 [SALE ORDER] Fetching sale orders history from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sale orders history error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ [SALE ORDER] Sale orders history fetched: ${data.length}`);
    return data;
}

// Отменить заказ на покупку
export async function cancelSaleOrderAPI(saleOrderId) {
    const url = `${API_BASE}/api/sale-orders/${saleOrderId}/cancel`;
    console.log(`📦 [SALE ORDER] Cancelling sale order: ${saleOrderId}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`📦 [SALE ORDER] Cancel response: status=${response.status}, body=${responseText.substring(0, 200)}`);
    
    if (!response.ok) {
        let errorMessage = 'Ошибка при отмене заказа на покупку';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}
