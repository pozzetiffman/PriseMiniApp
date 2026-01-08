// ========== REFACTORING STEP 4.1: fetchProducts() ==========
// Модуль для чтения товаров
// Дата начала: 2024-12-19
// Статус: В процессе

import { API_BASE, apiRequest, getBaseHeaders, getBaseHeadersNoAuth } from './client.js';

// Загрузка товаров (не требует авторизации - только просмотр)
export async function fetchProducts(shopOwnerId, categoryId = null, botId = null, viewerId = null) {
    let url = `${API_BASE}/api/products/?user_id=${shopOwnerId}`;
    if (viewerId !== null && viewerId !== undefined) {
        url += `&viewer_id=${viewerId}`;
    }
    if (categoryId !== null) {
        url += `&category_id=${categoryId}`;
    }
    if (botId !== null && botId !== undefined) {
        url += `&bot_id=${botId}`;
    }
    console.log("📦 Fetching products from:", url, "botId:", botId);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeadersNoAuth()
        });
        console.log("✅ Products fetched:", data.length);
        return data;
    } catch (e) {
        console.error("❌ Error fetching products:", e);
        throw e;
    }
}

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] fetchProducts() loaded from api/products_read.js');

// ========== END REFACTORING STEP 4.1 ==========

// ========== REFACTORING STEP 4.2: getSoldProductsAPI() ==========
// Получить список проданных товаров
export async function getSoldProductsAPI(shopOwnerId) {
    const url = `${API_BASE}/api/products/sold?user_id=${shopOwnerId}`;
    console.log(`Fetching sold products: shopOwnerId=${shopOwnerId}`);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeaders()
        });
        return data;
    } catch (e) {
        console.error("❌ Error fetching sold products:", e);
        throw e;
    }
}

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] getSoldProductsAPI() loaded from api/products_read.js');

// ========== END REFACTORING STEP 4.2 ==========

