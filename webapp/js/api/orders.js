// ========== REFACTORING STEP 8.1: createOrderAPI() ==========
// Модуль для работы с заказами
// Дата начала: 2024-12-XX
// Статус: В процессе

import { API_BASE, getBaseHeaders } from './config.js';

// Создание заказа (ordered_by_user_id определяется на backend из initData)
export async function createOrderAPI(orderData) {
    // Поддерживаем старый формат для обратной совместимости
    let url, body;
    if (typeof orderData === 'object' && orderData.product_id) {
        // Новый формат: объект с данными формы
        url = `${API_BASE}/api/orders/`;
        body = JSON.stringify(orderData);
    } else {
        // Старый формат: productId, quantity
        const productId = arguments[0];
        const quantity = arguments[1] || 1;
        url = `${API_BASE}/api/orders/?product_id=${productId}&quantity=${quantity}`;
        body = null;
    }
    
    console.log(`Order URL: ${url}`);
    console.log(`Order data:`, orderData);
    
    const fetchOptions = {
        method: 'POST',
        headers: getBaseHeaders()
    };
    
    if (body) {
        fetchOptions.body = body;
    }
    
    const response = await fetch(url, fetchOptions);
    
    const responseText = await response.text();
    console.log(`Order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Ошибка при создании заказа';
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


// ========== END REFACTORING STEP 8.1 ==========

// ========== REFACTORING STEP 8.2: getShopOrdersAPI() ==========
// Получить заказы магазина (для владельца)
export async function getShopOrdersAPI() {
    const url = `${API_BASE}/api/orders/shop`;
    console.log(`Fetching shop orders from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shop orders error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Shop orders fetched: ${data.length}`);
    return data;
}


// ========== END REFACTORING STEP 8.2 ==========

// ========== REFACTORING STEP 8.3: getUserUsernameAPI() ==========
// Получить username пользователя по его ID
export async function getUserUsernameAPI(userId) {
    const url = `${API_BASE}/api/orders/user/${userId}/username`;
    console.log(`Fetching username for user: ${userId}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Failed to get username for user ${userId}: ${response.status} - ${errorText}`);
        return { username: null, user_id: userId };
    }
    
    const data = await response.json();
    return data;
}


// ========== END REFACTORING STEP 8.3 ==========

// ========== REFACTORING STEP 8.4: getMyOrdersAPI() ==========
// Получить мои заказы (для клиента)
export async function getMyOrdersAPI() {
    const url = `${API_BASE}/api/orders/my`;
    console.log(`Fetching my orders from: ${url}`);

    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeaders(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`My orders error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`✅ My orders fetched: ${data.length}`);
        return data;
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ getMyOrdersAPI timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки заказов. Сервер не отвечает.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            console.error("❌ Network error fetching orders:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу.");
        }
        
        throw e;
    }
}


// ========== END REFACTORING STEP 8.4 ==========

// ========== REFACTORING STEP 8.5: getOrdersHistoryAPI() ==========
// Загрузка истории заказов (все заказы пользователя)
export async function getOrdersHistoryAPI() {
    const url = `${API_BASE}/api/orders/history`;
    console.log(`Fetching orders history from: ${url}`);
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeaders(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Orders history error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Orders history fetched: ${data.length}`);
        return data;
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ getOrdersHistoryAPI timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки истории заказов. Сервер не отвечает.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            console.error("❌ Network error fetching orders history:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу.");
        }
        
        throw e;
    }
}


// ========== END REFACTORING STEP 8.5 ==========

// ========== REFACTORING STEP 8.6: completeOrderAPI() ==========
// Выполнить заказ (только владелец магазина)
export async function completeOrderAPI(orderId) {
    const url = `${API_BASE}/api/orders/${orderId}/complete`;
    console.log(`Complete order URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Complete order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось выполнить заказ';
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


// ========== END REFACTORING STEP 8.6 ==========

// ========== REFACTORING STEP 8.7: cancelOrderAPI() ==========
// Отменить заказ (владелец магазина или заказчик)
export async function cancelOrderAPI(orderId) {
    const url = `${API_BASE}/api/orders/${orderId}`;
    console.log(`Cancel order URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Cancel order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось отменить заказ';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return true;
}


// ========== END REFACTORING STEP 8.7 ==========

// ========== REFACTORING STEP 8.8: deleteOrderAPI() ==========
// Удалить заказ (только владелец магазина)
export async function deleteOrderAPI(orderId) {
    const url = `${API_BASE}/api/orders/${orderId}/delete`;
    console.log(`Delete order URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Delete order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить заказ';
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


// ========== END REFACTORING STEP 8.8 ==========

// ========== REFACTORING STEP 8.9: deleteOrdersAPI() ==========
// Удалить несколько заказов (только владелец магазина)
export async function deleteOrdersAPI(orderIds) {
    const url = `${API_BASE}/api/orders/batch-delete`;
    console.log(`Delete orders URL: ${url}, orderIds=${orderIds}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            ...getBaseHeaders(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderIds)
    });
    
    const responseText = await response.text();
    console.log(`Delete orders response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить заказы';
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


// ========== END REFACTORING STEP 8.9 ==========

// ========== REFACTORING STEP 8.10: clearOrdersHistoryAPI() ==========
// Очистить историю заказов
export async function clearOrdersHistoryAPI() {
    const url = `${API_BASE}/api/orders/history/clear`;
    console.log(`Clear orders history URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Clear orders history response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось очистить историю заказов';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 8.10 ==========

