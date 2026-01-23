// ========== REFACTORING STEP 2.1: getContext() ==========
// Модуль контекста и настроек магазина
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорт необходимых зависимостей
import { requireTelegram } from '../telegram.js';
import { API_BASE, getBaseHeaders } from './config.js';

// Получение контекста магазина
export async function getContext(shopOwnerId = null) {
    console.log('📡 [CONTEXT API] getContext called, shopOwnerId:', shopOwnerId);
    console.log('📡 [CONTEXT API] API_BASE:', API_BASE);
    
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    // === ИСПРАВЛЕНИЕ: Проверка fallback состояния ===
    const telegramUser = requireTelegram();
    if (telegramUser && telegramUser.isFallback) {
        throw new Error('Приложение должно открываться через Telegram-бота');
    }
    
    // Получаем заголовки с initData
    const headers = getBaseHeaders();
    
    let url = `${API_BASE}/api/context`;
    if (shopOwnerId !== null) {
        url += `?shop_owner_id=${shopOwnerId}`;
    }
    
    console.log("📡 [CONTEXT API] Fetching context from:", url);
    console.log("📡 [CONTEXT API] Headers keys:", Object.keys(headers));
    console.log("📡 [CONTEXT API] Has X-Telegram-Init-Data:", !!headers["X-Telegram-Init-Data"]);
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
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
        clearTimeout(timeoutId);
        
        console.error("❌ getContext fetch error:", e);
        console.error("❌ Error stack:", e.stack);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ Context request timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки контекста. Сервер не отвечает. Попробуйте позже.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
            console.error("❌ Network error fetching context:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.");
        }
        
        // Пробрасываем другие ошибки как есть
        throw e;
    }
}


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


// ========== END REFACTORING STEP 2.3 ==========

