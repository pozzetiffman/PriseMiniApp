// ========== REFACTORING STEP 9.1: createPurchaseAPI() ==========
// Модуль для работы с покупками
// Дата начала: 2024-12-19
// Статус: В процессе

import { API_BASE, getBaseHeaders } from './config.js';
import { getInitData } from '../telegram.js';

// Создание заявки на покупку
export async function createPurchaseAPI(productId, formData) {
    const url = `${API_BASE}/api/purchases/`;
    console.log(`Creating purchase for product ${productId}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Telegram-Init-Data': getInitData(),
            'ngrok-skip-browser-warning': '69420'
            // Не устанавливаем Content-Type для FormData - браузер сам установит правильный boundary
        },
        body: formData
    });
    
    const responseText = await response.text();
    console.log(`Create purchase response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось создать заявку на покупку';
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


// ========== END REFACTORING STEP 9.1 ==========

// ========== REFACTORING STEP 9.2: getMyPurchasesAPI() ==========
// Получение моих покупок
export async function getMyPurchasesAPI() {
    const url = `${API_BASE}/api/purchases/my`;
    console.log(`Getting my purchases`);
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Telegram-Init-Data': getInitData(),
                'ngrok-skip-browser-warning': '69420'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseText = await response.text();
        console.log(`Get my purchases response: status=${response.status}`);
        
        if (!response.ok) {
            let errorMessage = 'Не удалось загрузить покупки';
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = responseText;
            }
            throw new Error(errorMessage);
        }
        
        return JSON.parse(responseText);
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ getMyPurchasesAPI timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки покупок. Сервер не отвечает.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            console.error("❌ Network error fetching purchases:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу.");
        }
        
        throw e;
    }
}


// ========== END REFACTORING STEP 9.2 ==========

// ========== REFACTORING STEP 9.3: cancelPurchaseAPI() ==========
// Отмена покупки (user_id определяется на backend из initData)
export async function cancelPurchaseAPI(purchaseId) {
    const url = `${API_BASE}/api/purchases/${purchaseId}`;
    console.log(`Cancel purchase URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Cancel purchase response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось отменить покупку';
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


// ========== END REFACTORING STEP 9.3 ==========

// ========== REFACTORING STEP 9.4: getPurchasesHistoryAPI() ==========
// Загрузка истории покупок (все покупки пользователя)
export async function getPurchasesHistoryAPI() {
    const url = `${API_BASE}/api/purchases/history`;
    console.log(`Getting purchases history`);

    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Telegram-Init-Data': getInitData(),
                'ngrok-skip-browser-warning': '69420'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();
        console.log(`Get purchases history response: status=${response.status}`);

        if (!response.ok) {
            let errorMessage = 'Не удалось загрузить историю продаж';
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = responseText;
            }
            throw new Error(errorMessage);
        }

        return JSON.parse(responseText);
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ getPurchasesHistoryAPI timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки истории покупок. Сервер не отвечает.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            console.error("❌ Network error fetching purchases history:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу.");
        }
        
        throw e;
    }
}


// ========== END REFACTORING STEP 9.4 ==========

// ========== REFACTORING STEP 9.5: getAllPurchasesAPI() ==========
// Получение всех покупок для админа
export async function getAllPurchasesAPI(shopOwnerId) {
    const url = `${API_BASE}/api/purchases/all?user_id=${shopOwnerId}`;
    console.log(`Getting all purchases for shop owner ${shopOwnerId}`);
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Telegram-Init-Data': getInitData(),
            'ngrok-skip-browser-warning': '69420'
        }
    });
    
    const responseText = await response.text();
    console.log(`Get all purchases response: status=${response.status}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось загрузить покупки';
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


// ========== END REFACTORING STEP 9.5 ==========

// ========== REFACTORING STEP 9.6: updatePurchaseStatusAPI() ==========
// Обновление статуса покупки (для владельца магазина)
export async function updatePurchaseStatusAPI(purchaseId, shopOwnerId, statusData) {
    const url = `${API_BASE}/api/purchases/${purchaseId}?user_id=${shopOwnerId}`;
    console.log(`Updating purchase status: purchaseId=${purchaseId}, shopOwnerId=${shopOwnerId}`, statusData);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(statusData)
    });
    
    const responseText = await response.text();
    console.log(`Update purchase status response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус покупки';
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


// ========== END REFACTORING STEP 9.6 ==========

// ========== REFACTORING STEP 9.7: clearPurchasesHistoryAPI() ==========
// Очистить историю продаж
export async function clearPurchasesHistoryAPI() {
    const url = `${API_BASE}/api/purchases/history/clear`;
    console.log(`Clear purchases history URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Clear purchases history response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось очистить историю продаж';
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


// ========== END REFACTORING STEP 9.7 ==========

