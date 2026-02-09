// Модуль API вызовов

// ========== REFACTORING STEP 1.1: API_BASE ==========
// НОВЫЙ КОД (используется сейчас)
// ВАЖНО: config.js должен быть импортирован ПЕРВЫМ, так как он нужен другим модулям
// Реэкспорт для обратной совместимости
export { API_BASE } from './api/config.js';

// Импорты для рефакторинга модуля products_read.js
// ВАЖНО: Функции products_read.js реэкспортируются ниже для обратной совместимости
// Не импортируем здесь, чтобы избежать проблем с порядком загрузки модулей
// Импорты для рефакторинга модуля products_update.js
// ВАЖНО: Функции products_update.js реэкспортируются ниже для обратной совместимости
// Не импортируем здесь, чтобы избежать проблем с порядком загрузки модулей
// Импорты для рефакторинга модуля products_delete.js
// ВАЖНО: Функции products_delete.js реэкспортируются ниже для обратной совместимости
// Не импортируем здесь, чтобы избежать проблем с порядком загрузки модулей
// Импорты для рефакторинга модуля reservations.js
// ВАЖНО: Функции reservations.js реэкспортируются ниже для обратной совместимости
// Не импортируем здесь, чтобы избежать проблем с порядком загрузки модулей
// Импорты для рефакторинга модуля orders.js
// ВАЖНО: Функции orders.js реэкспортируются ниже для обратной совместимости
// Не импортируем здесь, чтобы избежать проблем с порядком загрузки модулей

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// НАСТРОЙКА АДРЕСА
export const API_BASE = "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev".trim();
*/
// ========== END REFACTORING STEP 1.1 ==========

// ========== REFACTORING STEP 1.2: getBaseHeadersNoAuth() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { getBaseHeadersNoAuth } from './api/config.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Базовые заголовки без авторизации (для просмотра товаров/категорий)
export function getBaseHeadersNoAuth() {
    return {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
}
*/
// ========== END REFACTORING STEP 1.2 ==========

// ========== REFACTORING STEP 1.3: getBaseHeaders() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
// ВАЖНО: Не импортируем здесь, чтобы избежать проблем с порядком загрузки модулей
export { getBaseHeaders } from './api/config.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 1.3 ==========

// ========== REFACTORING STEP 1.4: fetchOptions ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { fetchOptions } from './api/config.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Опции для обхода предупреждения ngrok (для обратной совместимости)
// НЕ используем getBaseHeaders() здесь, так как он требует initData при импорте
export const fetchOptions = {
    headers: {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    }
};
*/
// ========== END REFACTORING STEP 1.4 ==========

// ========== REFACTORING STEP 2.1: getContext() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { getContext, getShopSettings, updateShopSettings } from './api/context.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Получение контекста магазина
export async function getContext(shopOwnerId = null) {
    console.log('📡 getContext called, shopOwnerId:', shopOwnerId);
    
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
*/
// ========== END REFACTORING STEP 2.1 ==========

// ========== REFACTORING STEP 3.1: fetchCategories() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { fetchCategories } from './api/categories.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 3.1 ==========

// ========== REFACTORING STEP 4.1: fetchProducts() и getSoldProductsAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Импорт уже добавлен в начале файла
// Реэкспорт для обратной совместимости
export { fetchProducts, getProductByIdAPI, getSoldProductsAPI } from './api/products_read.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeadersNoAuth()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Products error:", response.status, errorText);
            throw new Error(`Ошибка загрузки товаров: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log("✅ Products fetched:", data.length);
        return data;
    } catch (e) {
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
            console.error("❌ Network error fetching products:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.");
        }
        // Пробрасываем другие ошибки как есть
        throw e;
    }
}
*/
// ========== END REFACTORING STEP 4.1 ==========

// ========== REFACTORING STEP 7.1: fetchUserReservations() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { fetchUserReservations } from './api/reservations.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 7.1 ==========

// ========== REFACTORING STEP 7.2: fetchReservationsHistory() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { fetchReservationsHistory } from './api/reservations.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Загрузка истории резерваций (все резервации пользователя)
export async function fetchReservationsHistory() {
    const url = `${API_BASE}/api/reservations/history`;
    console.log(`Fetching reservations history from: ${url}`);
    const response = await fetch(url, {
        headers: getBaseHeaders()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Reservations history error:", response.status, errorText);
        throw new Error(`Reservations history error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`📜 fetchReservationsHistory: Got ${data.length} reservations`);
    return data;
}
*/
// ========== END REFACTORING STEP 7.2 ==========

// ========== REFACTORING STEP 7.3: createReservationAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { createReservationAPI } from './api/reservations.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Создание резервации (reserved_by_user_id определяется на backend из initData)
export async function createReservationAPI(productId, hours, quantity = 1) {
    const url = `${API_BASE}/api/reservations/?product_id=${productId}&hours=${hours}&quantity=${quantity}`;
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
*/
// ========== END REFACTORING STEP 7.3 ==========

// ========== REFACTORING STEP 7.4: cancelReservationAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { cancelReservationAPI } from './api/reservations.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 7.4 ==========

// ========== REFACTORING STEP 2.2: getShopSettings() ==========
// НОВЫЙ КОД (используется сейчас) - импорт и реэкспорт уже добавлены выше в STEP 2.1

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 2.2 ==========

// ========== REFACTORING STEP 2.3: updateShopSettings() ==========
// НОВЫЙ КОД (используется сейчас) - импорт и реэкспорт уже добавлены выше в STEP 2.1

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 2.3 ==========

// ========== REFACTORING STEP 5.1: toggleHotOffer() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { toggleHotOffer } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 5.1 ==========

// ========== REFACTORING STEP 10.1: trackShopVisit() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/visits.js)
// НОВЫЙ КОД: используйте import { trackShopVisit } from './api/visits.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { trackShopVisit } from './api/visits.js';
// ========== END REFACTORING STEP 10.1 ==========

// ========== REFACTORING STEP 5.2: updateProductAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { updateProductAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 5.2 ==========

// ========== REFACTORING STEP 5.3: updateProductNameDescriptionAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { updateProductNameDescriptionAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 5.3 ==========

// ========== REFACTORING STEP 5.4: updateProductQuantityAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { updateProductQuantityAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обновление количества товара (без уведомлений)
export async function updateProductQuantityAPI(productId, shopOwnerId, quantity, quantityUnit = null) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity: productId=${productId}, quantity=${quantity}, quantityUnit=${quantityUnit}`);
    
    const body = { quantity: quantity };
    if (quantityUnit !== null) {
        body.quantity_unit = quantityUnit;
    }
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(body)
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
*/
// ========== END REFACTORING STEP 5.4 ==========

// ========== REFACTORING STEP 5.5: updateProductMadeToOrderAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { updateProductMadeToOrderAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 5.5 ==========

// ========== REFACTORING STEP 5.6: updateProductQuantityShowEnabledAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { getCharacteristicNamesAPI, updateProductCharacteristicsAPI, updateProductDeliveryAPI, updateProductHiddenAPI, updateProductQuantityShowEnabledAPI, updateProductReservationEnabledAPI, updateProductSaleEnabledAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обновление индивидуальной настройки показа количества товара (без уведомлений)
export async function updateProductQuantityShowEnabledAPI(productId, shopOwnerId, quantityShowEnabled) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity-show-enabled?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity-show-enabled: productId=${productId}, quantityShowEnabled=${quantityShowEnabled}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            quantity_show_enabled: quantityShowEnabled
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product quantity-show-enabled response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Quantity-show-enabled updated successfully: quantity_show_enabled=${result.quantity_show_enabled}`);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить настройку показа количества';
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
*/
// ========== END REFACTORING STEP 5.6 ==========

// ========== REFACTORING STEP 5.7: updateProductForSaleAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { updateProductForSaleAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обновление функции 'покупка' товара (без уведомлений)
export async function updateProductForSaleAPI(productId, shopOwnerId, forSaleData) {
    const url = `${API_BASE}/api/products/${productId}/update-for-sale?user_id=${shopOwnerId}`;
    console.log(`Updating product for-sale: productId=${productId}`, forSaleData);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_for_sale: forSaleData.is_for_sale,
            price_type: forSaleData.price_type,
            price_from: forSaleData.price_from,
            price_to: forSaleData.price_to,
            price_fixed: forSaleData.price_fixed,
            quantity_from: forSaleData.quantity_from,
            quantity_unit: forSaleData.quantity_unit
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product for-sale response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ For-sale updated successfully:`, result);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить функцию "покупка"';
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
*/
// ========== END REFACTORING STEP 5.7 ==========

// ========== REFACTORING STEP 5.8: bulkUpdateAllProductsMadeToOrderAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { bulkUpdateAllProductsMadeToOrderAPI } from './api/products_update.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Массовое обновление статуса 'под заказ' для всех товаров
export async function bulkUpdateAllProductsMadeToOrderAPI(isMadeToOrder) {
    const url = `${API_BASE}/api/products/bulk-update-made-to-order`;
    console.log(`Bulk updating all products made-to-order: isMadeToOrder=${isMadeToOrder}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_made_to_order: isMadeToOrder
        })
    });
    
    const responseText = await response.text();
    console.log(`Bulk update made-to-order response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Bulk update made-to-order successful: updated_count=${result.updated_count}, is_made_to_order=${result.is_made_to_order}`);
        return result;
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус "под заказ" для всех товаров';
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
*/
// ========== END REFACTORING STEP 5.8 ==========

// ========== REFACTORING STEP 6.1: deleteProductAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { deleteProductAPI } from './api/products_delete.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 6.1 ==========

// ========== REFACTORING STEP 6.2: markProductSoldAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { markProductSoldAPI } from './api/products_delete.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Пометить товар как проданный
export async function markProductSoldAPI(productId, shopOwnerId, quantity = 1) {
    const url = `${API_BASE}/api/products/${productId}/mark-sold?user_id=${shopOwnerId}&quantity=${quantity}`;
    console.log(`Marking product as sold: productId=${productId}, quantity=${quantity}`);
    
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
*/
// ========== END REFACTORING STEP 6.2 ==========

// ========== REFACTORING STEP 4.2: getSoldProductsAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт уже добавлен в блоке 4.1 выше

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
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
*/
// ========== END REFACTORING STEP 4.2 ==========

// ========== REFACTORING STEP 6.3: deleteSoldProductAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { deleteSoldProductAPI } from './api/products_delete.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Удалить запись о проданном товаре
export async function deleteSoldProductAPI(soldId, shopOwnerId) {
    const url = `${API_BASE}/api/products/sold/${soldId}?user_id=${shopOwnerId}`;
    console.log(`Deleting sold product: soldId=${soldId}, shopOwnerId=${shopOwnerId}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Delete sold product response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить запись о проданном товаре';
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
*/
// ========== END REFACTORING STEP 6.3 ==========

// ========== REFACTORING STEP 6.4: deleteSoldProductsAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { deleteSoldProductsAPI } from './api/products_delete.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Удалить несколько записей о проданных товарах
export async function deleteSoldProductsAPI(soldIds, shopOwnerId) {
    const url = `${API_BASE}/api/products/sold/batch-delete?user_id=${shopOwnerId}`;
    console.log(`Deleting sold products: soldIds=${soldIds}, shopOwnerId=${shopOwnerId}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            ...getBaseHeaders(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(soldIds)
    });
    
    const responseText = await response.text();
    console.log(`Delete sold products response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить записи о проданных товарах';
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
*/
// ========== END REFACTORING STEP 6.4 ==========

// ========== REFACTORING STEP 8: Модуль orders.js ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт всех функций orders для обратной совместимости
// ВАЖНО: Все функции реэкспортируются из одного модуля для избежания проблем с порядком загрузки
export {
    cancelOrderAPI, clearOrdersHistoryAPI, completeOrderAPI, createOrderAPI, deleteOrderAPI,
    deleteOrdersAPI, getMyOrdersAPI,
    getOrdersHistoryAPI, getShopOrdersAPI,
    getUserUsernameAPI
} from './api/orders.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// ========== REFACTORING STEP 8.1: createOrderAPI() ==========
// Создание заказа (ordered_by_user_id определяется на backend из initData)
export async function createOrderAPI(orderData) {
    // Поддерживаем старый формат для обратной совместимости
    let url, body;
    if (typeof orderData === 'object' && orderData.product_id) {
        // Новый формат: объект с данными формы
        url = `${API_BASE}/api/orders/`;
        body = JSON.stringify(orderData);
    } else {
        // Старый формат: productId, quantity
        const productId = arguments[0];
        const quantity = arguments[1] || 1;
        url = `${API_BASE}/api/orders/?product_id=${productId}&quantity=${quantity}`;
        body = null;
    }
    
    console.log(`Order URL: ${url}`);
    console.log(`Order data:`, orderData);
    
    const fetchOptions = {
        method: 'POST',
        headers: getBaseHeaders()
    };
    
    if (body) {
        fetchOptions.body = body;
    }
    
    const response = await fetch(url, fetchOptions);
    
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
*/
// ========== END REFACTORING STEP 8 ==========

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Очистить историю заказов
export async function clearOrdersHistoryAPI() {
    const url = `${API_BASE}/api/orders/history/clear`;
    console.log(`Clear orders history URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Clear orders history response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось очистить историю заказов';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}
*/
// ========== END REFACTORING STEP 8.10 ==========

// ========== REFACTORING STEP 10.2: getVisitStatsAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/visits.js)
// НОВЫЙ КОД: используйте import { getVisitStatsAPI } from './api/visits.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { getVisitStatsAPI } from './api/visits.js';
// ========== END REFACTORING STEP 10.2 ==========

// ========== REFACTORING STEP 10.3: getVisitsListAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/visits.js)
// НОВЫЙ КОД: используйте import { getVisitsListAPI } from './api/visits.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { getVisitsListAPI } from './api/visits.js';
// ========== END REFACTORING STEP 10.3 ==========

// ========== REFACTORING STEP 10.4: getProductViewStatsAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/visits.js)
// НОВЫЙ КОД: используйте import { getProductViewStatsAPI } from './api/visits.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { getProductViewStatsAPI } from './api/visits.js';
// ========== END REFACTORING STEP 10.4 ==========

// ========== REFACTORING STEP 9.1: createPurchaseAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { createPurchaseAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Создание заявки на покупку
export async function createPurchaseAPI(productId, formData) {
    const url = `${API_BASE}/api/purchases/`;
    console.log(`Creating purchase for product ${productId}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Telegram-Init-Data': getInitData(),
            'ngrok-skip-browser-warning': '69420'
        },
        body: formData
    });
    
    const responseText = await response.text();
    console.log(`Create purchase response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось создать заявку на покупку';
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { createPurchaseAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.1 ==========

// ========== REFACTORING STEP 7.5: clearReservationsHistoryAPI() ==========
// НОВЫЙ КОД (используется сейчас)
// Реэкспорт для обратной совместимости
export { clearReservationsHistoryAPI } from './api/reservations.js';

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Очистить историю резерваций
export async function clearReservationsHistoryAPI() {
    const url = `${API_BASE}/api/reservations/history/clear`;
    console.log(`Clear reservations history URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Clear reservations history response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось очистить историю резерваций';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}
*/
// ========== END REFACTORING STEP 7.5 ==========

// ========== REFACTORING STEP 9.7: clearPurchasesHistoryAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { clearPurchasesHistoryAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Очистить историю продаж
export async function clearPurchasesHistoryAPI() {
    const url = `${API_BASE}/api/purchases/history/clear`;
    console.log(`Clear purchases history URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Clear purchases history response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось очистить историю продаж';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { clearPurchasesHistoryAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.7 ==========

// ========== REFACTORING STEP 9.2: getMyPurchasesAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { getMyPurchasesAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Получение моих покупок
export async function getMyPurchasesAPI() {
    const url = `${API_BASE}/api/purchases/my`;
    console.log(`Getting my purchases`);
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Telegram-Init-Data': getInitData(),
            'ngrok-skip-browser-warning': '69420'
        }
    });
    
    const responseText = await response.text();
    console.log(`Get my purchases response: status=${response.status}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось загрузить покупки';
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { getMyPurchasesAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.2 ==========

// ========== REFACTORING STEP 9.3: cancelPurchaseAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { cancelPurchaseAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Отмена покупки (user_id определяется на backend из initData)
export async function cancelPurchaseAPI(purchaseId) {
    const url = `${API_BASE}/api/purchases/${purchaseId}`;
    console.log(`Cancel purchase URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Cancel purchase response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось отменить покупку';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { cancelPurchaseAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.3 ==========

// ========== REFACTORING STEP 9.4: getPurchasesHistoryAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { getPurchasesHistoryAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Загрузка истории покупок (все покупки пользователя)
export async function getPurchasesHistoryAPI() {
    const url = `${API_BASE}/api/purchases/history`;
    console.log(`Getting purchases history`);
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Telegram-Init-Data': getInitData(),
            'ngrok-skip-browser-warning': '69420'
        }
    });
    
    const responseText = await response.text();
    console.log(`Get purchases history response: status=${response.status}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось загрузить историю продаж';
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { getPurchasesHistoryAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.4 ==========

// ========== REFACTORING STEP 9.5: getAllPurchasesAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { getAllPurchasesAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Получение всех покупок для админа
export async function getAllPurchasesAPI(shopOwnerId) {
    const url = `${API_BASE}/api/purchases/all?user_id=${shopOwnerId}`;
    console.log(`Getting all purchases for shop owner ${shopOwnerId}`);
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Telegram-Init-Data': getInitData(),
            'ngrok-skip-browser-warning': '69420'
        }
    });
    
    const responseText = await response.text();
    console.log(`Get all purchases response: status=${response.status}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось загрузить покупки';
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { getAllPurchasesAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.5 ==========

// ========== SALE ORDERS: Реэкспорт всех функций sale_orders для обратной совместимости ==========
// ВАЖНО: Все функции реэкспортируются из одного модуля для избежания проблем с порядком загрузки
export {
    cancelSaleOrderAPI,
    createSaleOrderAPI,
    getMySaleOrdersAPI,
    getSaleOrdersHistoryAPI
} from './api/sale_orders.js';
// ========== END SALE ORDERS ==========

// ========== REFACTORING STEP 9.6: updatePurchaseStatusAPI() ==========
// СТАРЫЙ КОД (закомментирован, перенесен в api/purchases.js)
// НОВЫЙ КОД: используйте import { updatePurchaseStatusAPI } from './api/purchases.js';
// ========== START OLD CODE (COMMENTED) ==========
/*
// Обновление статуса покупки (для владельца магазина)
export async function updatePurchaseStatusAPI(purchaseId, shopOwnerId, statusData) {
    const url = `${API_BASE}/api/purchases/${purchaseId}?user_id=${shopOwnerId}`;
    console.log(`Updating purchase status: purchaseId=${purchaseId}, shopOwnerId=${shopOwnerId}`, statusData);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(statusData)
    });
    
    const responseText = await response.text();
    console.log(`Update purchase status response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус покупки';
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
*/
// ========== END OLD CODE (COMMENTED) ==========
// НОВЫЙ КОД (реэкспорт для обратной совместимости)
export { updatePurchaseStatusAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.6 ==========
