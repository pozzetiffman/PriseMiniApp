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
 * @returns {Promise<Array>} Массив активных резерваций
 */
export async function fetchActiveReservations() {
    console.log('🛒 fetchActiveReservations: Fetching active reservations...');
    // Backend уже вернул только активные резервации для корзины (где текущий пользователь - резервирующий)
    // Backend уже проверил is_active и reserved_until, просто используем все
    const activeReservations = await fetchUserReservations();
    console.log(`🛒 fetchActiveReservations: Got ${activeReservations.length} active cart reservations from server`);
    return activeReservations;
}

/**
 * Получение активных заказов для корзины
 * @returns {Promise<Array>} Массив активных заказов (пустой массив в случае ошибки)
 */
export async function fetchActiveOrders() {
    console.log('🛒 fetchActiveOrders: Fetching active orders...');
    let activeOrders = [];
    try {
        activeOrders = await getMyOrdersAPI();
        console.log(`🛒 fetchActiveOrders: Got ${activeOrders ? activeOrders.length : 0} orders from server`);
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
    console.log('🛒 fetchActivePurchases: Fetching active purchases...');
    let activePurchases = [];
    try {
        const allPurchases = await getMyPurchasesAPI();
        // Дополнительно фильтруем на случай, если API вернет все продажи
        activePurchases = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled);
        console.log(`🛒 fetchActivePurchases: Got ${activePurchases.length} active purchases from server (filtered from ${allPurchases ? allPurchases.length : 0} total)`);
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
    console.log('🛒 checkHistoryExists: Checking for history...');
    let hasHistory = false;
    
    try {
        // Проверяем историю резерваций
        const historyReservations = await fetchReservationsHistory();
        const historyReservationsCount = (historyReservations || []).filter(r => r.is_active === false).length;
        if (historyReservationsCount > 0) {
            hasHistory = true;
            console.log(`🛒 checkHistoryExists: Found ${historyReservationsCount} history reservations`);
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
                console.log(`🛒 checkHistoryExists: Found ${historyOrdersCount} history orders`);
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
                console.log(`🛒 checkHistoryExists: Found ${historyPurchasesCount} history purchases`);
                return hasHistory;
            }
        } catch (e) {
            console.warn('⚠️ checkHistoryExists: Failed to fetch purchases history:', e);
        }
    }
    
    console.log(`🛒 checkHistoryExists: Has history: ${hasHistory}`);
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
    console.log('🛒🛒🛒 ========== updateCartUI START ==========');
    
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
        console.log(`🛒 Total active cart items: ${totalItems} (${activeReservations.length} reservations + ${activeOrders ? activeOrders.length : 0} orders + ${activePurchases ? activePurchases.length : 0} purchases)`);
        console.log(`🛒 Has history: ${hasHistory}`);
        
        // Удаляем дебаг-индикатор, если он был создан ранее
        const existingDebugIndicator = document.getElementById('cart-debug-indicator');
        if (existingDebugIndicator) {
            existingDebugIndicator.remove();
        }
        
        // Логирование деталей для отладки
        if (totalItems > 0 || hasHistory) {
            console.log(`🛒🛒🛒 ПОКАЗЫВАЕМ КОРЗИНУ! Найдено ${activeReservations.length} активных резерваций, ${activeOrders ? activeOrders.length : 0} заказов и ${activePurchases ? activePurchases.length : 0} продаж`);
            console.log(`🛒🛒🛒 Резервации:`, activeReservations.map(r => ({
                id: r.id,
                product_id: r.product_id,
                reserved_by: r.reserved_by_user_id,
                is_active: r.is_active,
                reserved_until: r.reserved_until
            })));
            console.log(`🛒🛒🛒 Заказы:`, activeOrders ? activeOrders.map(o => ({
                id: o.id,
                product_id: o.product_id,
                is_completed: o.is_completed,
                is_cancelled: o.is_cancelled
            })) : []);
        } else {
            console.log(`❌ Cart button hidden - no active items or history (found ${activeReservations.length} active reservations, ${activeOrders ? activeOrders.length : 0} active orders, ${activePurchases ? activePurchases.length : 0} active sales, hasHistory: ${hasHistory})`);
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
    
    console.log('🛒🛒🛒 ========== updateCartUI END ==========');
}

