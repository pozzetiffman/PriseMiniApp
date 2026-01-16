// ========== REFACTORING STEP 3.1: fetchCategories() ==========
// API для работы с категориями
// Дата начала: 2024-12-19
// Статус: В процессе

import { API_BASE, getBaseHeadersNoAuth } from './config.js';

// Загрузка категорий (не требует авторизации - только просмотр)
export async function fetchCategories(shopOwnerId, botId = null, flat = false) {
    let url = `${API_BASE}/api/categories/?user_id=${shopOwnerId}`;
    if (botId !== null && botId !== undefined) {
        url += `&bot_id=${botId}`;
    }
    if (flat) {
        url += `&flat=true`;
    }
    console.log("📂 Fetching categories from:", url, "botId:", botId, "flat:", flat);
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeadersNoAuth(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Categories error:", response.status, errorText);
            throw new Error(`Ошибка загрузки категорий: ${response.status} - ${errorText}`);
        }
        
        // === ИСПРАВЛЕНИЕ: Безопасный парсинг JSON с защитой от ошибок ===
        let data = null;
        try {
            const responseText = await response.text();
            console.log("📂 Categories response text length:", responseText.length);
            
            // === ИСПРАВЛЕНИЕ: Проверка на пустой ответ ===
            if (!responseText || responseText.trim() === '') {
                console.warn('⚠️ [CATEGORIES API] Empty response, returning empty array');
                return [];
            }
            
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error("❌ JSON parse error in categories:", parseError);
            console.error("❌ Response status:", response.status);
            console.error("❌ Response text preview:", responseText?.substring(0, 200));
            throw new Error(`Ошибка парсинга категорий: ${parseError.message}`);
        }
        
        // === ИСПРАВЛЕНИЕ: Валидация данных категорий ===
        if (!Array.isArray(data)) {
            console.warn('⚠️ [CATEGORIES API] Response is not an array:', typeof data, data);
            return [];
        }
        
        console.log("✅ Categories fetched:", data.length);
        return data;
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ Categories request timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки категорий. Сервер не отвечает. Попробуйте позже.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
            console.error("❌ Network error fetching categories:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.");
        }
        // Пробрасываем другие ошибки как есть
        throw e;
    }
}
// ========== END REFACTORING STEP 3.1 ==========

