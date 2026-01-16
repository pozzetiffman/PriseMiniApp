// API для работы с магазином и статистикой
import { API_BASE, getBaseHeaders, apiRequest } from './client.js';
import { requireTelegram } from '../telegram.js';

// Получение контекста магазина
export async function getContext(shopOwnerId = null) {
    console.log('📡 getContext called, shopOwnerId:', shopOwnerId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/shop.js:6',message:'getContext entry',data:{shopOwnerId,apiBase:API_BASE},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
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
    
    console.log("📡 Fetching context from:", url);
    console.log("📡 Headers keys:", Object.keys(headers));
    
    try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/shop.js:25',message:'apiRequest called',data:{url,hasHeaders:!!headers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const data = await apiRequest(url, {
            headers: headers
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/shop.js:29',message:'apiRequest success',data:{hasData:!!data,shopOwnerId:data?.shop_owner_id,role:data?.role},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.log("✅ Context data received:", data);
        return data;
    } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/shop.js:31',message:'apiRequest error',data:{error:e.message,stack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error("❌ getContext fetch error:", e);
        throw e;
    }
}

// Получение настроек магазина
export async function getShopSettings(shopOwnerId = null) {
    let url = `${API_BASE}/api/shop-settings`;
    if (shopOwnerId !== null) {
        url += `?shop_owner_id=${shopOwnerId}`;
    }
    console.log(`Fetching shop settings from: ${url}`);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeaders()
        });
        console.log("✅ Shop settings fetched:", data);
        return data;
    } catch (e) {
        console.error("❌ Error fetching shop settings:", e);
        throw e;
    }
}

// Обновление настроек магазина
export async function updateShopSettings(settingsUpdate) {
    const url = `${API_BASE}/api/shop-settings`;
    console.log(`Updating shop settings:`, settingsUpdate);
    
    try {
        const data = await apiRequest(url, {
            method: 'PUT',
            headers: getBaseHeaders(),
            body: JSON.stringify(settingsUpdate)
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating shop settings:", e);
        throw e;
    }
}

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

// Получить статистику посещений
export async function getVisitStatsAPI() {
    const url = `${API_BASE}/api/shop-visits/stats`;
    console.log(`Fetching visit stats from: ${url}`);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeaders()
        });
        console.log(`✅ Visit stats fetched:`, data);
        return data;
    } catch (e) {
        console.error("❌ Error fetching visit stats:", e);
        throw e;
    }
}

// Получить список посещений
export async function getVisitsListAPI(limit = 50, offset = 0) {
    const url = `${API_BASE}/api/shop-visits/list?limit=${limit}&offset=${offset}`;
    console.log(`Fetching visits list from: ${url}`);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeaders()
        });
        console.log(`✅ Visits list fetched: ${data.length}`);
        return data;
    } catch (e) {
        console.error("❌ Error fetching visits list:", e);
        throw e;
    }
}

// Получить статистику просмотров товаров
export async function getProductViewStatsAPI(limit = 20) {
    const url = `${API_BASE}/api/shop-visits/product-stats?limit=${limit}`;
    console.log(`Fetching product view stats from: ${url}`);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeaders()
        });
        console.log(`✅ Product view stats fetched: ${data.length}`);
        return data;
    } catch (e) {
        console.error("❌ Error fetching product view stats:", e);
        throw e;
    }
}

