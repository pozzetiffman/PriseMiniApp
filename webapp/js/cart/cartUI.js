// ========== REFACTORING STEP 8.1, 8.2, 8.3, 8.4, 8.5, 8.6: cartUI.js ==========
// Модуль для работы с UI корзины
// Дата начала: 2024-12-XX
// Статус: ✅ ЗАВЕРШЕНО (STEP 8.1 завершен, STEP 8.2 завершен, STEP 8.3 завершен, STEP 8.4 завершен, STEP 8.5 завершен, STEP 8.6 завершен)

// Импорты зависимостей
// ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
import { fetchReservationsHistory, fetchUserReservations } from '../api.js';
import { getMyOrdersAPI, getOrdersHistoryAPI } from '../api/orders.js';
// ========== REFACTORING STEP 9.2: getMyPurchasesAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getMyPurchasesAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.2 ==========
// ========== REFACTORING STEP 9.4: getPurchasesHistoryAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getPurchasesHistoryAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.4 ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { fetchReservationsHistory, fetchUserReservations, getMyOrdersAPI, getMyPurchasesAPI, getOrdersHistoryAPI, getPurchasesHistoryAPI } from '../api.js';
// ========== END REFACTORING STEP 8 ==========

/**
 * Получение активных резерваций для корзины
 * Backend уже возвращает только активные резервации текущего пользователя
 * Дополнительно фильтруем для надежности (по is_active и времени истечения)
 * @returns {Promise<Array>} Массив активных резерваций
 */
export async function fetchActiveReservations() {
    try {
        const allReservations = await fetchUserReservations();
        // Дополнительно фильтруем активные резервации для надежности
        // Проверяем is_active и время истечения (reserved_until)
        const now = new Date();
        const activeReservations = (allReservations || []).filter(r => {
            if (!r.is_active) return false;
            
            // Проверяем время истечения резервации
            if (r.reserved_until) {
                let reservedUntilStr = r.reserved_until;
                // Нормализуем формат даты
                if (!reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                    reservedUntilStr = reservedUntilStr + 'Z';
                }
                const reservedUntil = new Date(reservedUntilStr);
                if (reservedUntil <= now) {
                    // Резервация истекла
                    return false;
                }
            }
            
            return true;
        });
        
        return activeReservations;
    } catch (e) {
        console.warn('⚠️ fetchActiveReservations: Failed to fetch reservations for cart UI:', e);
        return [];
    }
}

/**
 * Получение активных заказов для корзины
 * API может вернуть все заказы, поэтому дополнительно фильтруем активные
 * @returns {Promise<Array>} Массив активных заказов (пустой массив в случае ошибки)
 */
export async function fetchActiveOrders() {
    let activeOrders = [];
    try {
        const allOrders = await getMyOrdersAPI();
        // Дополнительно фильтруем на случай, если API вернет все заказы
        activeOrders = (allOrders || []).filter(o => !o.is_completed && !o.is_cancelled);
    } catch (e) {
        console.warn('⚠️ fetchActiveOrders: Failed to fetch orders for cart UI:', e);
        activeOrders = [];
    }
    return activeOrders;
}

/**
 * Получение активных продаж для корзины
 * API может вернуть все продажи, поэтому дополнительно фильтруем активные
 * @returns {Promise<Array>} Массив активных продаж (пустой массив в случае ошибки)
 */
export async function fetchActivePurchases() {
    let activePurchases = [];
    try {
        const allPurchases = await getMyPurchasesAPI();
        // Дополнительно фильтруем на случай, если API вернет все продажи
        activePurchases = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled);
    } catch (e) {
        console.warn('⚠️ fetchActivePurchases: Failed to fetch purchases for cart UI:', e);
        activePurchases = [];
    }
    return activePurchases;
}

/**
 * Проверка наличия истории для всех типов (резервации, заказы, продажи)
 * Проверяет последовательно: сначала резервации, затем заказы, затем продажи
 * @returns {Promise<boolean>} true если найдена хотя бы одна запись в истории
 */
export async function checkHistoryExists() {
    let hasHistory = false;
    
    try {
        // Проверяем историю резерваций
        const historyReservations = await fetchReservationsHistory();
        const historyReservationsCount = (historyReservations || []).filter(r => r.is_active === false).length;
        if (historyReservationsCount > 0) {
            hasHistory = true;
            return hasHistory;
        }
    } catch (e) {
        console.warn('⚠️ checkHistoryExists: Failed to fetch reservations history:', e);
    }
    
    if (!hasHistory) {
        try {
            // Проверяем историю заказов
            const historyOrders = await getOrdersHistoryAPI();
            const historyOrdersCount = (historyOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
            if (historyOrdersCount > 0) {
                hasHistory = true;
                return hasHistory;
            }
        } catch (e) {
            console.warn('⚠️ checkHistoryExists: Failed to fetch orders history:', e);
        }
    }
    
    if (!hasHistory) {
        try {
            // Проверяем историю продаж
            const historyPurchases = await getPurchasesHistoryAPI();
            const historyPurchasesCount = (historyPurchases || []).filter(p => p.is_completed === true || p.is_cancelled === true).length;
            if (historyPurchasesCount > 0) {
                hasHistory = true;
                return hasHistory;
            }
        } catch (e) {
            console.warn('⚠️ checkHistoryExists: Failed to fetch purchases history:', e);
        }
    }
    
    return hasHistory;
}

/**
 * Обновление видимости кнопки корзины
 * Показывает кнопку если есть активные элементы или история
 * @param {HTMLElement} cartButton - Элемент кнопки корзины
 * @param {HTMLElement} cartCount - Элемент счетчика корзины
 * @param {number} totalItems - Общее количество активных элементов
 * @param {boolean} hasHistory - Есть ли история
 */
export function updateCartButtonVisibility(cartButton, cartCount, totalItems, hasHistory) {
    console.log(`🛒 updateCartButtonVisibility: totalItems=${totalItems}, hasHistory=${hasHistory}`);
    
    if (!cartButton || !cartCount) {
        console.error('❌ updateCartButtonVisibility: cartButton or cartCount not found');
        return;
    }
    
    // Показываем кнопку корзины, если есть активные элементы ИЛИ история
    if (totalItems > 0 || hasHistory) {
        // Показываем кнопку корзины через CSS классы (без inline стилей, чтобы не ломать grid layout)
        cartButton.removeAttribute('hidden');
        cartButton.style.display = 'flex';
        cartButton.style.visibility = 'visible';
        cartButton.style.opacity = '1';
        cartButton.classList.remove('hidden');
        cartButton.classList.add('cart-button');
        
        cartCount.textContent = String(totalItems);
        
        // Проверяем видимость через 100ms
        setTimeout(() => {
            const rect = cartButton.getBoundingClientRect();
            const computedDisplay = window.getComputedStyle(cartButton).display;
            const computedVisibility = window.getComputedStyle(cartButton).visibility;
            const isVisible = rect.width > 0 && rect.height > 0 && 
                             computedDisplay !== 'none' &&
                             computedVisibility !== 'hidden';
            
            console.log(`✅✅✅ КНОПКА КОРЗИНЫ ${isVisible ? 'ВИДНА' : 'НЕ ВИДНА'}! Count: ${totalItems}`);
            console.log(`✅ Button rect:`, rect);
            console.log(`✅ Computed styles:`, {
                display: computedDisplay,
                visibility: computedVisibility,
                opacity: window.getComputedStyle(cartButton).opacity,
                width: window.getComputedStyle(cartButton).width,
                height: window.getComputedStyle(cartButton).height
            });
            
            if (!isVisible) {
                console.error('❌❌❌ КРИТИЧЕСКАЯ ОШИБКА: Кнопка корзины все еще не видна!');
                console.error('❌ Принудительно устанавливаем стили через setProperty');
                cartButton.style.setProperty('display', 'flex', 'important');
                cartButton.style.setProperty('visibility', 'visible', 'important');
                cartButton.style.setProperty('opacity', '1', 'important');
            } else {
                console.log('✅✅✅ КНОПКА КОРЗИНЫ УСПЕШНО ОТОБРАЖЕНА!');
            }
        }, 100);
    } else {
        console.log(`❌ updateCartButtonVisibility: Cart button hidden - no active items or history (totalItems: ${totalItems}, hasHistory: ${hasHistory})`);
        // Для неактивной корзины используем opacity и pointer-events, но оставляем в grid layout
        cartButton.style.display = 'flex';
        cartButton.style.opacity = '0.3';
        cartButton.style.pointerEvents = 'none';
    }
}

/**
 * Обновление UI корзины
 * Основная функция для обновления состояния корзины и видимости кнопки
 */
export async function updateCartUI() {
    // Получаем элементы DOM корзины
    const cartButton = document.getElementById('cart-button');
    const cartCount = document.getElementById('cart-count');
    
    try {
        if (!cartButton || !cartCount) {
            console.error('❌ updateCartUI: Cart button or count not found');
            return;
        }
        
        // Получаем активные элементы
        const activeReservations = await fetchActiveReservations();
        const activeOrders = await fetchActiveOrders();
        const activePurchases = await fetchActivePurchases();
        
        // Проверяем наличие истории
        const hasHistory = await checkHistoryExists();
        
        // Общее количество активных элементов в корзине (резервации + заказы + продажи)
        const totalItems = activeReservations.length + (activeOrders ? activeOrders.length : 0) + (activePurchases ? activePurchases.length : 0);
        
        // Удаляем дебаг-индикатор, если он был создан ранее
        const existingDebugIndicator = document.getElementById('cart-debug-indicator');
        if (existingDebugIndicator) {
            existingDebugIndicator.remove();
        }
        
        // Обновляем видимость кнопки корзины
        updateCartButtonVisibility(cartButton, cartCount, totalItems, hasHistory);
    } catch (e) {
        console.error('❌❌❌ КРИТИЧЕСКАЯ ОШИБКА в updateCartUI:', e);
        if (cartButton) {
            // В случае ошибки тоже оставляем в grid layout
            cartButton.style.display = 'flex';
            cartButton.style.opacity = '0.3';
            cartButton.style.pointerEvents = 'none';
        }
    }
}

