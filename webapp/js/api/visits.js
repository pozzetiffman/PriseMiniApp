// ========== REFACTORING STEP 10.1: trackShopVisit() ==========
// Модуль для работы со статистикой и посещениями магазина
// Дата начала: 2024-12-XX
// Статус: В процессе

// Импорт зависимостей
import { API_BASE, getBaseHeaders } from './config.js';

// Отслеживание посещения магазина или просмотра товара
export async function trackShopVisit(shopOwnerId, productId = null) {
    const url = `${API_BASE}/api/shop-visits/track?shop_owner_id=${shopOwnerId}${productId ? `&product_id=${productId}` : ''}`;
    console.log(`Tracking visit: shopOwnerId=${shopOwnerId}, productId=${productId}`);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        const responseText = await response.text();
        console.log(`Track visit response: status=${response.status}, body=${responseText}`);
        
        if (!response.ok) {
            // Не показываем ошибку пользователю, просто логируем
            console.warn('Failed to track visit:', responseText);
            return null;
        }
        
        return JSON.parse(responseText);
    } catch (e) {
        // Не показываем ошибку пользователю, просто логируем
        console.warn('Error tracking visit:', e);
        return null;
    }
}


// ========== END REFACTORING STEP 10.1 ==========

// ========== REFACTORING STEP 10.2: getVisitStatsAPI() ==========
// Получить статистику посещений
export async function getVisitStatsAPI() {
    const url = `${API_BASE}/api/shop-visits/stats`;
    console.log(`Fetching visit stats from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Visit stats error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Visit stats fetched:`, data);
    return data;
}


// ========== END REFACTORING STEP 10.2 ==========

// ========== REFACTORING STEP 10.3: getVisitsListAPI() ==========
// Получить список посещений
export async function getVisitsListAPI(limit = 50, offset = 0) {
    const url = `${API_BASE}/api/shop-visits/list?limit=${limit}&offset=${offset}`;
    console.log(`Fetching visits list from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Visits list error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Visits list fetched: ${data.length}`);
    return data;
}


// ========== END REFACTORING STEP 10.3 ==========

// ========== REFACTORING STEP 10.4: getProductViewStatsAPI() ==========
// Получить статистику просмотров товаров
export async function getProductViewStatsAPI(limit = 20) {
    const url = `${API_BASE}/api/shop-visits/product-stats?limit=${limit}`;
    console.log(`Fetching product view stats from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Product view stats error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Product view stats fetched: ${data.length}`);
    return data;
}


// ========== END REFACTORING STEP 10.4 ==========

