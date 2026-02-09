// Модуль для управления индикаторами активности операций
import { fetchUserReservations } from './api.js';
import { getMyDealsAPI } from './api/deals.js';
import { getMyOrdersAPI } from './api/orders.js';
import { getMyPurchasesAPI } from './api/purchases.js';

// Кэш для хранения количества активных элементов
let activeCounts = {
    orders: 0,
    reservations: 0,
    purchases: 0,
    saleOrders: 0
};

/**
 * Подсчет активных резерваций
 */
async function countActiveReservations() {
    try {
        const reservations = await fetchUserReservations();
        const now = new Date();
        
        const activeCount = (reservations || []).filter(r => {
            if (!r.is_active) return false;
            if (r.reserved_until) {
                let reservedUntilStr = r.reserved_until;
                if (!reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                    reservedUntilStr = reservedUntilStr + 'Z';
                }
                const reservedUntil = new Date(reservedUntilStr);
                return reservedUntil > now;
            }
            return true;
        }).length;
        
        return activeCount;
    } catch (error) {
        console.error('❌ Error counting active reservations:', error);
        return 0;
    }
}

/**
 * Подсчет активных заказов
 */
async function countActiveOrders() {
    try {
        const orders = await getMyOrdersAPI();
        const activeCount = (orders || []).filter(o => !o.is_completed && !o.is_cancelled).length;
        return activeCount;
    } catch (error) {
        console.error('❌ Error counting active orders:', error);
        return 0;
    }
}

/**
 * Подсчет активных продаж
 */
async function countActivePurchases() {
    try {
        const purchases = await getMyPurchasesAPI();
        const activeCount = (purchases || []).filter(p => !p.is_completed && !p.is_cancelled).length;
        return activeCount;
    } catch (error) {
        console.error('❌ Error counting active purchases:', error);
        return 0;
    }
}

/**
 * Подсчет активных покупок (сделки)
 */
async function countActiveSaleOrders() {
    try {
        const deals = await getMyDealsAPI();
        return (deals || []).length;
    } catch (error) {
        console.error('❌ Error counting active deals:', error);
        return 0;
    }
}

/**
 * Обновление всех счетчиков активности
 * ВАЖНО: Эта функция всегда пересчитывает активные элементы из API,
 * не использует флаги просмотра или кэш состояния просмотра.
 * Индикатор в основном меню зависит ТОЛЬКО от реального наличия активных элементов.
 */
export async function updateActivityCounts() {
    console.log('📊 Updating activity counts...');
    
    try {
        // Загружаем актуальные данные из API для каждого типа операций
        const [ordersCount, reservationsCount, purchasesCount, saleOrdersCount] = await Promise.all([
            countActiveOrders(),
            countActiveReservations(),
            countActivePurchases(),
            countActiveSaleOrders()
        ]);
        
        // Обновляем счетчики (это единственный источник истины для индикаторов)
        activeCounts = {
            orders: ordersCount,
            reservations: reservationsCount,
            purchases: purchasesCount,
            saleOrders: saleOrdersCount
        };
        
        console.log('✅ Activity counts updated:', activeCounts);
        
        // Обновляем индикаторы на основе новых счетчиков
        // Индикатор в основном меню показывается ВСЕГДА, если hasAnyActive() === true
        updateIndicators();
        
        return activeCounts;
    } catch (error) {
        console.error('❌ Error updating activity counts:', error);
        // При ошибке возвращаем текущие счетчики (не сбрасываем их)
        return activeCounts;
    }
}

/**
 * Получить текущие счетчики активности
 */
export function getActivityCounts() {
    return { ...activeCounts };
}

/**
 * Проверить, есть ли хотя бы один активный элемент
 */
export function hasAnyActive() {
    return activeCounts.orders > 0 || 
           activeCounts.reservations > 0 || 
           activeCounts.purchases > 0 || 
           activeCounts.saleOrders > 0;
}

/**
 * Обновление индикаторов в меню и профиле
 * ВАЖНО: Эта функция обновляет визуальные индикаторы на основе текущих счетчиков.
 * Индикаторы показываются ВСЕГДА, если есть активные элементы,
 * независимо от того, просматривал ли пользователь разделы или нет.
 */
function updateIndicators() {
    // Индикатор на иконке выпадающего меню (main-menu-button)
    // Показывается ВСЕГДА, если hasAnyActive() === true
    updateMenuIndicator();
    
    // Индикатор на пункте "Личный кабинет" внутри выпадающего меню
    // Показывается ВСЕГДА, если hasAnyActive() === true
    updateProfileMenuItemIndicator();
    
    // Индикаторы на кнопках в профиле
    // Показываются только на тех кнопках, где есть активные элементы
    updateProfileIndicators();
}

/**
 * Обновление индикатора на иконке выпадающего меню (main-menu-button)
 * ВАЖНО: Индикатор зависит ТОЛЬКО от наличия активных элементов,
 * не зависит от просмотра или других флагов
 */
function updateMenuIndicator() {
    // Ищем кнопку меню (иконку, которая открывает выпадающее меню)
    const menuButton = document.getElementById('main-menu-button');
    if (!menuButton) {
        console.warn('⚠️ main-menu-button not found for activity indicator');
        return;
    }
    
    // Удаляем существующий индикатор, если есть
    const existingIndicator = menuButton.querySelector('.activity-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Проверяем наличие активных элементов (ТОЛЬКО на основе данных, без флагов просмотра)
    const hasActive = hasAnyActive();
    
    // Если есть активные элементы, добавляем индикатор на иконку меню
    // Индикатор показывается ВСЕГДА, если есть активные элементы
    if (hasActive) {
        const indicator = document.createElement('span');
        indicator.className = 'activity-indicator activity-indicator-menu';
        indicator.setAttribute('aria-label', 'Есть активные операции');
        menuButton.appendChild(indicator);
        console.log('✅ Activity indicator added to main-menu-button (has active items)');
    } else {
        console.log('ℹ️ No activity indicator on menu button: no active items');
    }
}

/**
 * Обновление индикатора на пункте "Личный кабинет" внутри выпадающего меню
 * ВАЖНО: Индикатор зависит ТОЛЬКО от наличия активных элементов,
 * не зависит от просмотра или других флагов
 */
function updateProfileMenuItemIndicator() {
    // Ищем пункт "Личный кабинет" внутри выпадающего меню
    const profileMenuItem = document.getElementById('menu-item-profile');
    if (!profileMenuItem) {
        console.warn('⚠️ menu-item-profile not found for activity indicator');
        return;
    }
    
    // Удаляем существующий индикатор, если есть
    const existingIndicator = profileMenuItem.querySelector('.activity-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Проверяем наличие активных элементов (ТОЛЬКО на основе данных, без флагов просмотра)
    const hasActive = hasAnyActive();
    
    // Если есть активные элементы, добавляем индикатор на пункт меню
    // Индикатор показывается ВСЕГДА, если есть активные элементы
    if (hasActive) {
        const indicator = document.createElement('span');
        indicator.className = 'activity-indicator activity-indicator-menu-item';
        indicator.setAttribute('aria-label', 'Есть активные операции');
        profileMenuItem.appendChild(indicator);
        console.log('✅ Activity indicator added to menu-item-profile (has active items)');
    } else {
        console.log('ℹ️ No activity indicator on profile menu item: no active items');
    }
}

/**
 * Обновление индикаторов на кнопках в профиле
 */
function updateProfileIndicators() {
    // Индикатор на кнопке "Заказы"
    updateProfileButtonIndicator('profile-orders-btn', activeCounts.orders);
    
    // Индикатор на кнопке "Резервации"
    updateProfileButtonIndicator('profile-reservations-btn', activeCounts.reservations);
    
    // Индикатор на кнопке "Продажи"
    updateProfileButtonIndicator('profile-purchases-btn', activeCounts.purchases);
    
    // Индикатор на кнопке "Покупки"
    updateProfileButtonIndicator('profile-sale-orders-btn', activeCounts.saleOrders);
}

/**
 * Обновление индикатора на конкретной кнопке профиля
 */
function updateProfileButtonIndicator(buttonId, count) {
    const button = document.getElementById(buttonId);
    if (!button) {
        console.warn(`⚠️ Button ${buttonId} not found for activity indicator`);
        return;
    }
    
    // Удаляем существующий индикатор, если есть
    const existingIndicator = button.querySelector('.activity-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Если есть активные элементы, добавляем индикатор
    if (count > 0) {
        const indicator = document.createElement('span');
        indicator.className = 'activity-indicator activity-indicator-profile';
        indicator.setAttribute('aria-label', `${count} активных элементов`);
        button.appendChild(indicator);
        console.log(`✅ Activity indicator added to ${buttonId}: ${count} active items`);
    } else {
        console.log(`ℹ️ No activity indicator for ${buttonId}: ${count} active items`);
    }
}

/**
 * Инициализация индикаторов (вызывается при загрузке приложения)
 */
export async function initActivityIndicators() {
    console.log('📊 Initializing activity indicators...');
    await updateActivityCounts();
}

/**
 * Принудительное обновление индикатора в основном меню
 * Используется для обновления индикатора без пересчета всех счетчиков
 * (например, при открытии меню для быстрого обновления)
 */
export function refreshMenuIndicator() {
    updateMenuIndicator();
}
