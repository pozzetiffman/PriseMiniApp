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
export async function fetchCategories(shopOwnerId, botId = null) {
    let url = `${API_BASE}/api/categories/?user_id=${shopOwnerId}`;
    if (botId !== null && botId !== undefined) {
        url += `&bot_id=${botId}`;
    }
    console.log("📂 Fetching categories from:", url, "botId:", botId);
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
export async function fetchProducts(shopOwnerId, categoryId = null, botId = null) {
    let url = `${API_BASE}/api/products/?user_id=${shopOwnerId}`;
    if (categoryId !== null) {
        url += `&category_id=${categoryId}`;
    }
    if (botId !== null && botId !== undefined) {
        url += `&bot_id=${botId}`;
    }
    console.log("📦 Fetching products from:", url, "botId:", botId);
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

// Переключение статуса "горящее предложение" для товара
export async function toggleHotOffer(productId, shopOwnerId, isHotOffer) {
    const url = `${API_BASE}/api/products/${productId}/hot-offer?user_id=${shopOwnerId}`;
    console.log(`Toggling hot offer: productId=${productId}, isHotOffer=${isHotOffer}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_hot_offer: isHotOffer
        })
    });
    
    const responseText = await response.text();
    console.log(`Hot offer toggle response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось изменить статус горящего предложения';
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

// Обновление цены и скидки товара
export async function updateProductAPI(productId, shopOwnerId, price, discount) {
    const url = `${API_BASE}/api/products/${productId}/update-price-discount?user_id=${shopOwnerId}`;
    console.log(`Updating product: productId=${productId}, price=${price}, discount=${discount}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            price: price,
            discount: discount
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить товар';
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

// Обновление названия и описания товара (без уведомлений)
export async function updateProductNameDescriptionAPI(productId, shopOwnerId, name, description) {
    const url = `${API_BASE}/api/products/${productId}/update-name-description?user_id=${shopOwnerId}`;
    console.log(`Updating product name/description: productId=${productId}, name=${name}, description=${description}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            name: name,
            description: description || null
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product name/description response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить название и описание товара';
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

// Обновление количества товара (без уведомлений)
export async function updateProductQuantityAPI(productId, shopOwnerId, quantity) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity: productId=${productId}, quantity=${quantity}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            quantity: quantity
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product quantity response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить количество товара';
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

// Обновление статуса 'под заказ' товара (без уведомлений)
export async function updateProductMadeToOrderAPI(productId, shopOwnerId, isMadeToOrder) {
    const url = `${API_BASE}/api/products/${productId}/update-made-to-order?user_id=${shopOwnerId}`;
    console.log(`Updating product made-to-order: productId=${productId}, isMadeToOrder=${isMadeToOrder}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_made_to_order: isMadeToOrder
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product made-to-order response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Made-to-order updated successfully: is_made_to_order=${result.is_made_to_order}`);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус "под заказ"';
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

// Удаление товара
export async function deleteProductAPI(productId, shopOwnerId) {
    const url = `${API_BASE}/api/products/${productId}?user_id=${shopOwnerId}`;
    console.log(`Deleting product: productId=${productId}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Delete product response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить товар';
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

// Пометить товар как проданный
export async function markProductSoldAPI(productId, shopOwnerId) {
    const url = `${API_BASE}/api/products/${productId}/mark-sold?user_id=${shopOwnerId}`;
    console.log(`Marking product as sold: productId=${productId}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Mark sold response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось пометить товар как проданный';
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

// Получить список проданных товаров
export async function getSoldProductsAPI(shopOwnerId) {
    const url = `${API_BASE}/api/products/sold?user_id=${shopOwnerId}`;
    console.log(`Fetching sold products: shopOwnerId=${shopOwnerId}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Get sold products response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось загрузить проданные товары';
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

// Создание заказа (ordered_by_user_id определяется на backend из initData)
export async function createOrderAPI(productId, quantity) {
    const url = `${API_BASE}/api/orders/?product_id=${productId}&quantity=${quantity}`;
    console.log(`Order URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Ошибка при создании заказа';
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

// Получить заказы магазина (для владельца)
export async function getShopOrdersAPI() {
    const url = `${API_BASE}/api/orders/shop`;
    console.log(`Fetching shop orders from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shop orders error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Shop orders fetched: ${data.length}`);
    return data;
}

// Получить мои заказы (для клиента)
export async function getMyOrdersAPI() {
    const url = `${API_BASE}/api/orders/my`;
    console.log(`Fetching my orders from: ${url}`);
    
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`My orders error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ My orders fetched: ${data.length}`);
    return data;
}

// Выполнить заказ (только владелец магазина)
export async function completeOrderAPI(orderId) {
    const url = `${API_BASE}/api/orders/${orderId}/complete`;
    console.log(`Complete order URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Complete order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось выполнить заказ';
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

// Отменить заказ (владелец магазина или заказчик)
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

export async function cancelOrderAPI(orderId) {
    const url = `${API_BASE}/api/orders/${orderId}`;
    console.log(`Cancel order URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Cancel order response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось отменить заказ';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return true;
}
