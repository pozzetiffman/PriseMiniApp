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
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeadersNoAuth()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Categories error:", response.status, errorText);
            throw new Error(`Ошибка загрузки категорий: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log("✅ Categories fetched:", data.length);
        return data;
    } catch (e) {
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

