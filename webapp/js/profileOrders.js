// Модуль для управления разделом "Мои заказы и операции" в профиле
import { API_BASE, fetchUserReservations, getBaseHeadersNoAuth } from './api.js';
import { getMyOrdersAPI, getOrdersHistoryAPI } from './api/orders.js';
import { getMyPurchasesAPI, getPurchasesHistoryAPI } from './api/purchases.js';
import { getMySaleOrdersAPI, getSaleOrdersHistoryAPI } from './api/sale_orders.js';
import { calculateReservationTimeLeft, formatDateToMoscow } from './utils/dateUtils.js';
import { createImageContainer, getProductImageUrl } from './utils/imageUtils.js';
import { getProductPriceDisplay } from './utils/priceUtils.js';

/**
 * Инициализация раздела заказов в профиле
 */
export function initProfileOrders() {
    console.log('📦 Initializing profile orders section...');
    
    // Настройка вкладок статусов (Активные, Завершённые, Отменённые)
    const statusTabs = document.querySelectorAll('.profile-orders-tab');
    statusTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetStatus = tab.dataset.ordersTab;
            switchOrdersStatusTab(targetStatus);
        });
    });
    
    // Настройка подвкладок типов (Резервации, Заказы, Продажи, Покупки)
    const typeTabs = document.querySelectorAll('.profile-orders-subtab');
    typeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetSubtab = tab.dataset.ordersSubtab;
            switchOrdersTypeTab(targetSubtab);
        });
    });
    
    console.log('✅ Profile orders section initialized');
}

/**
 * Переключение вкладки статуса (Активные/Завершённые/Отменённые)
 */
function switchOrdersStatusTab(status) {
    const tabs = document.querySelectorAll('.profile-orders-tab');
    const sections = document.querySelectorAll('.profile-orders-section');
    
    tabs.forEach(tab => {
        if (tab.dataset.ordersTab === status) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    sections.forEach(section => {
        if (section.id === `profile-orders-${status}`) {
            section.style.display = 'block';
            section.classList.add('active');
        } else {
            section.style.display = 'none';
            section.classList.remove('active');
        }
    });
    
    // Загружаем данные для выбранного статуса
    loadOrdersForStatus(status);
}

/**
 * Переключение подвкладки типа (Резервации/Заказы/Продажи/Покупки)
 */
function switchOrdersTypeTab(subtab) {
    const [type, status] = subtab.split('-');
    const currentSection = document.querySelector('.profile-orders-section.active');
    if (!currentSection) return;
    
    const currentStatus = currentSection.id.replace('profile-orders-', '');
    
    // Обновляем активную подвкладку
    const allSubtabs = currentSection.querySelectorAll('.profile-orders-subtab');
    allSubtabs.forEach(tab => {
        if (tab.dataset.ordersSubtab === subtab) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Показываем/скрываем соответствующие контейнеры
    const itemsContainers = currentSection.querySelectorAll('.profile-orders-items');
    itemsContainers.forEach(container => {
        const containerId = container.id;
        const expectedId = `profile-${type}-${currentStatus}-items`;
        if (containerId === expectedId) {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    });
}

/**
 * Загрузка заказов для указанного статуса
 */
async function loadOrdersForStatus(status) {
    console.log(`📦 Loading orders for status: ${status}`);
    
    try {
        // Загружаем данные для всех типов
        await Promise.all([
            loadReservationsForStatus(status),
            loadOrdersForStatusType(status),
            loadPurchasesForStatus(status),
            loadSaleOrdersForStatus(status)
        ]);
    } catch (error) {
        console.error('❌ Error loading orders for status:', error);
    }
}

/**
 * Загрузка резерваций для статуса
 */
async function loadReservationsForStatus(status) {
    const containerId = `profile-reservations-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<p class="loading">Загрузка резерваций...</p>';
    
    try {
        const reservations = await fetchUserReservations();
        const now = new Date();
        
        let filteredReservations = [];
        if (status === 'active') {
            filteredReservations = reservations.filter(r => {
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
            });
        } else if (status === 'completed') {
            filteredReservations = reservations.filter(r => {
                if (r.reserved_until) {
                    let reservedUntilStr = r.reserved_until;
                    if (!reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                        reservedUntilStr = reservedUntilStr + 'Z';
                    }
                    const reservedUntil = new Date(reservedUntilStr);
                    return reservedUntil <= now && r.is_active;
                }
                return false;
            });
        } else if (status === 'cancelled') {
            filteredReservations = reservations.filter(r => !r.is_active);
        }
        
        renderReservations(container, filteredReservations, status);
    } catch (error) {
        console.error('❌ Error loading reservations:', error);
        container.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

/**
 * Загрузка заказов для статуса
 */
async function loadOrdersForStatusType(status) {
    const containerId = `profile-orders-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<p class="loading">Загрузка заказов...</p>';
    
    try {
        const allOrders = await getMyOrdersAPI();
        
        let filteredOrders = [];
        if (status === 'active') {
            filteredOrders = (allOrders || []).filter(o => !o.is_completed && !o.is_cancelled);
        } else if (status === 'completed') {
            filteredOrders = (allOrders || []).filter(o => o.is_completed && !o.is_cancelled);
        } else if (status === 'cancelled') {
            filteredOrders = (allOrders || []).filter(o => o.is_cancelled);
        }
        
        renderOrders(container, filteredOrders, status);
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        container.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

/**
 * Загрузка продаж для статуса
 */
async function loadPurchasesForStatus(status) {
    const containerId = `profile-purchases-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<p class="loading">Загрузка продаж...</p>';
    
    try {
        const purchases = await getMyPurchasesAPI();
        
        let filteredPurchases = [];
        if (status === 'active') {
            filteredPurchases = (purchases || []).filter(p => !p.is_completed && !p.is_cancelled);
        } else if (status === 'completed') {
            filteredPurchases = (purchases || []).filter(p => p.is_completed && !p.is_cancelled);
        } else if (status === 'cancelled') {
            filteredPurchases = (purchases || []).filter(p => p.is_cancelled);
        }
        
        renderPurchases(container, filteredPurchases, status);
    } catch (error) {
        console.error('❌ Error loading purchases:', error);
        container.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

/**
 * Загрузка покупок для статуса
 */
async function loadSaleOrdersForStatus(status) {
    const containerId = `profile-sale-orders-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<p class="loading">Загрузка покупок...</p>';
    
    try {
        const saleOrders = await getMySaleOrdersAPI();
        
        let filteredSaleOrders = [];
        if (status === 'active') {
            filteredSaleOrders = (saleOrders || []).filter(o => !o.is_completed && !o.is_cancelled);
        } else if (status === 'completed') {
            filteredSaleOrders = (saleOrders || []).filter(o => o.is_completed && !o.is_cancelled);
        } else if (status === 'cancelled') {
            filteredSaleOrders = (saleOrders || []).filter(o => o.is_cancelled);
        }
        
        renderSaleOrders(container, filteredSaleOrders, status);
    } catch (error) {
        console.error('❌ Error loading sale orders:', error);
        container.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

/**
 * Рендеринг резерваций
 */
function renderReservations(container, reservations, status) {
    if (!reservations || reservations.length === 0) {
        container.innerHTML = '<p class="loading">Нет резерваций</p>';
        return;
    }
    
    container.innerHTML = '';
    
    reservations.forEach(reservation => {
        const product = reservation.product;
        if (!product || !product.name) return;
        
        const imageUrl = getProductImageUrl(product, API_BASE);
        const priceDisplay = getProductPriceDisplay(product);
        const timeText = calculateReservationTimeLeft(reservation.reserved_until);
        const dateText = formatDateToMoscow(reservation.created_at);
        
        const item = document.createElement('div');
        item.className = 'profile-order-item';
        item.dataset.type = 'reserve';
        
        const imageContainer = createImageContainer(imageUrl, product.name, '[PROFILE RESERVATION]');
        
        let statusBadge = '';
        if (status === 'active') {
            statusBadge = '<span class="order-badge order-badge-active">🔒 Активна</span>';
        } else if (status === 'completed') {
            statusBadge = '<span class="order-badge order-badge-completed">✅ Истекла</span>';
        } else {
            statusBadge = '<span class="order-badge order-badge-cancelled">❌ Отменена</span>';
        }
        
        item.innerHTML = `
            <div class="profile-order-info">
                <h3>${product.name}</h3>
                <p class="profile-order-price">${priceDisplay}</p>
                ${status === 'active' ? `<p class="profile-order-time">⏰ До ${timeText}</p>` : ''}
                ${dateText ? `<p class="profile-order-date">📅 ${dateText}</p>` : ''}
                ${statusBadge}
            </div>
        `;
        
        item.insertBefore(imageContainer, item.firstChild);
        container.appendChild(item);
    });
}

/**
 * Рендеринг заказов
 */
function renderOrders(container, orders, status) {
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="loading">Нет заказов</p>';
        return;
    }
    
    container.innerHTML = '';
    
    orders.forEach(order => {
        const product = order.product;
        if (!product || !product.name) return;
        
        const imageUrl = getProductImageUrl(product, API_BASE);
        const priceDisplay = getProductPriceDisplay(product);
        const dateText = formatDateToMoscow(order.created_at);
        
        const item = document.createElement('div');
        item.className = 'profile-order-item';
        item.dataset.type = 'order';
        
        const imageContainer = createImageContainer(imageUrl, product.name, '[PROFILE ORDER]');
        
        let statusBadge = '';
        if (status === 'active') {
            statusBadge = '<span class="order-badge order-badge-active">⏳ В обработке</span>';
        } else if (status === 'completed') {
            statusBadge = '<span class="order-badge order-badge-completed">✅ Выполнен</span>';
        } else {
            statusBadge = '<span class="order-badge order-badge-cancelled">❌ Отменен</span>';
        }
        
        item.innerHTML = `
            <div class="profile-order-info">
                <h3>${product.name}</h3>
                <p class="profile-order-price">${priceDisplay} × ${order.quantity} шт.</p>
                ${dateText ? `<p class="profile-order-date">📅 ${dateText}</p>` : ''}
                ${statusBadge}
            </div>
        `;
        
        item.insertBefore(imageContainer, item.firstChild);
        container.appendChild(item);
    });
}

/**
 * Рендеринг продаж
 */
function renderPurchases(container, purchases, status) {
    if (!purchases || purchases.length === 0) {
        container.innerHTML = '<p class="loading">Нет продаж</p>';
        return;
    }
    
    container.innerHTML = '';
    
    purchases.forEach(purchase => {
        const product = purchase.product;
        if (!product || !product.name) return;
        
        const imageUrl = getProductImageUrl(product, API_BASE);
        const dateText = formatDateToMoscow(purchase.created_at);
        
        const item = document.createElement('div');
        item.className = 'profile-order-item';
        item.dataset.type = 'sale';
        
        const imageContainer = createImageContainer(imageUrl, product.name, '[PROFILE PURCHASE]');
        
        let statusBadge = '';
        if (status === 'active') {
            statusBadge = '<span class="order-badge order-badge-active">⏳ Ожидание</span>';
        } else if (status === 'completed') {
            statusBadge = '<span class="order-badge order-badge-completed">✅ Выполнена</span>';
        } else {
            statusBadge = '<span class="order-badge order-badge-cancelled">❌ Отменена</span>';
        }
        
        item.innerHTML = `
            <div class="profile-order-info">
                <h3>${product.name}</h3>
                ${dateText ? `<p class="profile-order-date">📅 ${dateText}</p>` : ''}
                ${statusBadge}
            </div>
        `;
        
        item.insertBefore(imageContainer, item.firstChild);
        container.appendChild(item);
    });
}

/**
 * Рендеринг покупок
 */
function renderSaleOrders(container, saleOrders, status) {
    if (!saleOrders || saleOrders.length === 0) {
        container.innerHTML = '<p class="loading">Нет покупок</p>';
        return;
    }
    
    container.innerHTML = '';
    
    saleOrders.forEach(saleOrder => {
        const product = saleOrder.product;
        if (!product || !product.name) return;
        
        const imageUrl = getProductImageUrl(product, API_BASE);
        const priceDisplay = getProductPriceDisplay(product);
        const dateText = formatDateToMoscow(saleOrder.created_at);
        
        const item = document.createElement('div');
        item.className = 'profile-order-item';
        item.dataset.type = 'sale-order';
        
        const imageContainer = createImageContainer(imageUrl, product.name, '[PROFILE SALE ORDER]');
        
        let statusBadge = '';
        if (status === 'active') {
            statusBadge = '<span class="order-badge order-badge-active">⏳ В обработке</span>';
        } else if (status === 'completed') {
            statusBadge = '<span class="order-badge order-badge-completed">✅ Выполнен</span>';
        } else {
            statusBadge = '<span class="order-badge order-badge-cancelled">❌ Отменен</span>';
        }
        
        item.innerHTML = `
            <div class="profile-order-info">
                <h3>${product.name}</h3>
                <p class="profile-order-price">${priceDisplay} × ${saleOrder.quantity} шт.</p>
                ${dateText ? `<p class="profile-order-date">📅 ${dateText}</p>` : ''}
                ${statusBadge}
            </div>
        `;
        
        item.insertBefore(imageContainer, item.firstChild);
        container.appendChild(item);
    });
}

/**
 * Загрузить заказы при открытии профиля
 */
export async function loadProfileOrders() {
    console.log('📦 Loading profile orders...');
    await loadOrdersForStatus('active');
}
