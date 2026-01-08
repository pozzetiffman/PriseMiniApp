// ========== REFACTORING STEP 2.1: getContext() ==========
// Модуль контекста и настроек магазина
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорт необходимых зависимостей
import { requireTelegram } from '../telegram.js';
import { API_BASE, getBaseHeaders } from './config.js';

// Получение контекста магазина
export async function getContext(shopOwnerId = null) {
    console.log('📡 getContext called, shopOwnerId:', shopOwnerId);
    
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    // requireTelegram() бросает исключение если Telegram недоступен
    requireTelegram();
    
    // Получаем заголовки с initData
    const headers = getBaseHeaders();
    
    let url = `${API_BASE}/api/context`;
    if (shopOwnerId !== null) {
        url += `?shop_owner_id=${shopOwnerId}`;
    }
    
    console.log("📡 Fetching context from:", url);
    console.log("📡 Headers keys:", Object.keys(headers));
    
    try {
        const response = await fetch(url, {
            headers: headers
        });
        
        console.log("📡 Context response status:", response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Context error response:", errorText);
            throw new Error(`Ошибка загрузки контекста: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log("✅ Context data received:", data);
        return data;
    } catch (e) {
        console.error("❌ getContext fetch error:", e);
        console.error("❌ Error stack:", e.stack);
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
            console.error("❌ Network error fetching context:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.");
        }
        
        // Пробрасываем другие ошибки как есть
        throw e;
    }
}

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] getContext() loaded from api/context.js');

// ========== END REFACTORING STEP 2.1 ==========

// ========== REFACTORING STEP 2.2: getShopSettings() ==========
// Получение настроек магазина
export async function getShopSettings(shopOwnerId = null) {
    let url = `${API_BASE}/api/shop-settings`;
    if (shopOwnerId !== null) {
        url += `?shop_owner_id=${shopOwnerId}`;
    }
    console.log(`Fetching shop settings from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Shop settings error:", response.status, errorText);
        throw new Error(`Shop settings error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log("✅ Shop settings fetched:", data);
    return data;
}

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] getShopSettings() loaded from api/context.js');

// ========== END REFACTORING STEP 2.2 ==========

// ========== REFACTORING STEP 2.3: updateShopSettings() ==========
// Обновление настроек магазина
export async function updateShopSettings(settingsUpdate) {
    const url = `${API_BASE}/api/shop-settings`;
    console.log(`Updating shop settings:`, settingsUpdate);
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: getBaseHeaders(),
        body: JSON.stringify(settingsUpdate)
    });
    
    const responseText = await response.text();
    console.log(`Shop settings update response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить настройки';
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

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] updateShopSettings() loaded from api/context.js');

// ========== END REFACTORING STEP 2.3 ==========

