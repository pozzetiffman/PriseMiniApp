// Модуль API вызовов
import { getInitData, requireTelegram } from './telegram.js';

// НАСТРОЙКА АДРЕСА
export const API_BASE = "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev".trim();

// Базовые заголовки без авторизации (для просмотра товаров/категорий)
export function getBaseHeadersNoAuth() {
    return {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
}

// Базовые опции для запросов с авторизацией
export function getBaseHeaders() {
    const headers = {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
    
    // Добавляем initData в заголовок для валидации на backend
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram, initData всегда должен быть доступен
    const initData = getInitData();
    if (!initData) {
        console.error('❌ CRITICAL: No initData available - app should only work through Telegram!');
        throw new Error("Telegram initData is required. Open the app through Telegram bot.");
    }
    
    headers["X-Telegram-Init-Data"] = initData;
    return headers;
}

// Опции для обхода предупреждения ngrok (для обратной совместимости)
// НЕ используем getBaseHeaders() здесь, так как он требует initData при импорте
export const fetchOptions = {
    headers: {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    }
};

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
            throw new Error(`Context error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log("✅ Context data received:", data);
        return data;
    } catch (e) {
        console.error("❌ getContext fetch error:", e);
        console.error("❌ Error stack:", e.stack);
        throw e;
    }
}

// Загрузка категорий (не требует авторизации - только просмотр)
export async function fetchCategories(shopOwnerId) {
    const url = `${API_BASE}/api/categories/?user_id=${shopOwnerId}`;
    console.log("📂 Fetching categories from:", url);
    const response = await fetch(url, {
        headers: getBaseHeadersNoAuth()
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Categories error:", response.status, errorText);
        throw new Error(`Categories error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log("✅ Categories fetched:", data.length);
    return data;
}

// Загрузка товаров (не требует авторизации - только просмотр)
export async function fetchProducts(shopOwnerId, categoryId = null) {
    let url = `${API_BASE}/api/products/?user_id=${shopOwnerId}`;
    if (categoryId !== null) {
        url += `&category_id=${categoryId}`;
    }
    console.log("📦 Fetching products from:", url);
    const response = await fetch(url, {
        headers: getBaseHeadersNoAuth()
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Products error:", response.status, errorText);
        throw new Error(`Products error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log("✅ Products fetched:", data.length);
    return data;
}

// Загрузка резерваций для корзины (только те, где текущий пользователь - резервирующий)
export async function fetchUserReservations() {
    const url = `${API_BASE}/api/reservations/cart`;
    console.log(`Fetching cart reservations from: ${url}`);
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reservations error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log(`📦 fetchUserReservations: Got ${data.length} cart reservations`);
    return data;
}

// Создание резервации (reserved_by_user_id определяется на backend из initData)
export async function createReservationAPI(productId, hours) {
    const url = `${API_BASE}/api/reservations/?product_id=${productId}&hours=${hours}`;
    console.log(`Reservation URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Reservation response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Ошибка при резервации';
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

// Отмена резервации (user_id определяется на backend из initData)
export async function cancelReservationAPI(reservationId) {
    const url = `${API_BASE}/api/reservations/${reservationId}`;
    console.log(`Cancel reservation URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Cancel reservation response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось снять резервацию';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return true;
}
