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
        
        // === ИСПРАВЛЕНИЕ: Валидация данных товаров ===
        if (!Array.isArray(data)) {
            console.warn('⚠️ [PRODUCTS API] Response is not an array:', typeof data);
            return [];
        }
        
        // === ИСПРАВЛЕНИЕ: Валидация товаров с невалидными category_id ===
        const validProducts = data.filter(prod => {
            if (!prod || typeof prod.id !== 'number') {
                console.warn('⚠️ [PRODUCTS API] Пропущен невалидный товар:', prod);
                return false;
            }
            
            // Если category_id указан, он должен быть числом или null
            if (prod.category_id !== null && prod.category_id !== undefined && typeof prod.category_id !== 'number') {
                console.warn(`⚠️ [PRODUCTS API] Товар ${prod.id} имеет невалидный category_id:`, prod.category_id, '- устанавливаем null');
                prod.category_id = null;
            }
            
            return true;
        });
        
        console.log("✅ Products fetched:", validProducts.length, `(из ${data.length})`);
        
        // Логируем информацию о описаниях товаров для отладки
        if (validProducts.length > 0) {
            console.log(`[PRODUCTS API DEBUG] Checking descriptions for ${validProducts.length} products:`);
            validProducts.forEach((prod, index) => {
                console.log(`[PRODUCTS API DEBUG] Product ${prod.id} (${prod.name}):`, {
                    hasDescription: !!prod.description,
                    description: prod.description,
                    descriptionType: typeof prod.description,
                    descriptionLength: prod.description ? prod.description.length : 0
                });
            });
        }
        
        return validProducts;
    } catch (e) {
        console.error("❌ Error fetching products:", e);
        console.error("❌ Error details:", {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        throw e;
    }
}


// ========== END REFACTORING STEP 4.1 ==========

// Получить товар по ID (для обновления UI после редактирования)
export async function getProductByIdAPI(productId) {
    const url = `${API_BASE}/api/products/${productId}`;
    const data = await apiRequest(url, {
        headers: getBaseHeaders()
    });
    return data;
}

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


// ========== END REFACTORING STEP 4.2 ==========

