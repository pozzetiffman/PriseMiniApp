// ========== REFACTORING STEP 4.1: cartHistory.js ==========
// Модуль для работы с историей корзины
// Дата начала: 2024-12-XX
// Статус: В процессе

// Импорты зависимостей
// ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
import { API_BASE, fetchReservationsHistory, getBaseHeadersNoAuth } from '../api.js';
import { getOrdersHistoryAPI } from '../api/orders.js';
// ========== REFACTORING STEP 9.4: getPurchasesHistoryAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getPurchasesHistoryAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.4 ==========
// ========== SALE ORDERS: getSaleOrdersHistoryAPI() ==========
import { getSaleOrdersHistoryAPI } from '../api/sale_orders.js';
// ========== END SALE ORDERS ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { API_BASE, fetchReservationsHistory, getBaseHeadersNoAuth, getOrdersHistoryAPI, getPurchasesHistoryAPI } from '../api.js';
// ========== END REFACTORING STEP 8 ==========
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import { createImageContainer, getProductImageUrl } from '../utils/imageUtils.js';
import { formatDateToMoscow } from '../utils/dateUtils.js';

/**
 * Вспомогательная функция для поиска элементов корзины
 * Ищет элемент сначала в странице корзины (если она видна), затем в модальном окне
 * @param {string} elementId - ID элемента для поиска
 * @returns {HTMLElement|null} - Найденный элемент или null
 */
function findCartElement(elementId) {
    // ВАЖНО: Сначала всегда проверяем страницу корзины (даже если она скрыта)
    // так как мы используем страницу, а не модальное окно
    const cartPage = document.getElementById('cart-page');
    if (cartPage) {
        const element = cartPage.querySelector(`#${elementId}`);
        if (element) {
            return element;
        }
    }
    
    // Если не найдено на странице, ищем в модальном окне (для обратной совместимости)
    const cartModal = document.getElementById('cart-modal');
    if (cartModal) {
        const element = cartModal.querySelector(`#${elementId}`);
        if (element) {
            return element;
        }
    }
    
    // Если не найдено нигде, используем стандартный getElementById (fallback)
    return document.getElementById(elementId);
}

/**
 * Загрузка истории резерваций
 * Отображает список неактивных резерваций в истории корзины
 */
export async function loadReservationsHistory() {
    console.log('🛒 loadReservationsHistory: Starting...');
    const historyItems = findCartElement('reservations-history-items');
    if (!historyItems) {
        console.error('❌ loadReservationsHistory: reservations-history-items element not found');
        return;
    }
    
    // Создаем контейнер для кнопки очистки (если его еще нет)
    let clearButtonContainer = historyItems.querySelector('.history-clear-button-container');
    if (!clearButtonContainer) {
        clearButtonContainer = document.createElement('div');
        clearButtonContainer.className = 'history-clear-button-container';
        clearButtonContainer.style.cssText = 'padding: 12px; display: flex; justify-content: flex-end; border-bottom: 1px solid var(--border-glass);';
        clearButtonContainer.innerHTML = '<button class="cancel-order-btn" onclick="window.clearReservationsHistory()" title="Очистить историю">Очистить историю</button>';
        historyItems.insertBefore(clearButtonContainer, historyItems.firstChild);
    }
    
    // Показываем загрузку после кнопки
    const loadingElement = document.createElement('p');
    loadingElement.className = 'loading';
    loadingElement.textContent = 'Загрузка истории резерваций...';
    // Удаляем старые элементы (кроме кнопки очистки)
    const itemsToRemove = Array.from(historyItems.children).filter(child => !child.classList.contains('history-clear-button-container'));
    itemsToRemove.forEach(child => child.remove());
    historyItems.appendChild(loadingElement);
    
    try {
        const reservations = await fetchReservationsHistory();
        console.log('🛒 loadReservationsHistory: Got reservations:', reservations.length);
        
        // Удаляем элемент загрузки
        loadingElement.remove();
        
        // Дополнительная фильтрация: показываем только неактивные резервации в истории
        // (активные резервации должны быть в разделе "Активные", а не в истории)
        const inactiveReservations = (reservations || []).filter(r => r.is_active === false);
        console.log('🛒 loadReservationsHistory: Filtered to inactive reservations:', inactiveReservations.length);
        
        if (!inactiveReservations || inactiveReservations.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'loading';
            emptyMessage.textContent = 'У вас нет истории резерваций';
            historyItems.appendChild(emptyMessage);
            return;
        }
        
        for (const reservation of inactiveReservations) {
            try {
                if (!reservation.product_id) {
                    continue;
                }
                
                const productUrl = `${API_BASE}/api/products/${reservation.product_id}`;
                const productResponse = await fetch(productUrl, {
                    headers: getBaseHeadersNoAuth()
                });
                
                if (!productResponse.ok) {
                    continue;
                }
                
                const product = await productResponse.json();
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                const priceDisplay = getProductPriceDisplay(product);
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name);
                
                // Статус резервации
                let statusText = '';
                let statusColor = '';
                const now = new Date();
                const reservedUntil = new Date(reservation.reserved_until);
                
                if (!reservation.is_active) {
                    statusText = '❌ Отменена';
                    statusColor = '#F44336';
                } else if (reservedUntil < now) {
                    statusText = '⏰ Истекла';
                    statusColor = '#FFA500';
                } else {
                    statusText = '✅ Активна';
                    statusColor = '#4CAF50';
                }
                
                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(reservation.created_at);
                
                historyItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${priceDisplay}</p>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                `;
                
                historyItem.insertBefore(imageContainer, historyItem.firstChild);
                historyItems.appendChild(historyItem);
            } catch (e) {
                console.error('❌ Error loading reservation history item:', e);
            }
        }
        
        // Проверяем, есть ли элементы кроме кнопки очистки
        const itemsWithoutButton = Array.from(historyItems.children).filter(child => !child.classList.contains('history-clear-button-container'));
        if (itemsWithoutButton.length === 0) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'loading';
            errorMessage.textContent = 'Не удалось загрузить историю резерваций';
            historyItems.appendChild(errorMessage);
        }
    } catch (error) {
        console.error('❌ Error loading reservations history:', error);
        // Удаляем элемент загрузки если он есть
        const loadingElement = historyItems.querySelector('.loading');
        if (loadingElement) loadingElement.remove();
        
        const errorMessage = document.createElement('p');
        errorMessage.className = 'loading';
        errorMessage.textContent = `Ошибка загрузки: ${error.message}`;
        historyItems.appendChild(errorMessage);
    }
}
// ========== END REFACTORING STEP 4.1 ==========

/**
 * Загрузка истории заказов
 * Отображает список завершенных или отмененных заказов в истории корзины
 */
export async function loadOrdersHistory() {
    console.log('🛒 loadOrdersHistory: Starting...');
    const historyItems = findCartElement('orders-history-items');
    if (!historyItems) {
        console.error('❌ loadOrdersHistory: orders-history-items element not found');
        return;
    }
    
    // Создаем контейнер для кнопки очистки (если его еще нет)
    let clearButtonContainer = historyItems.querySelector('.history-clear-button-container');
    if (!clearButtonContainer) {
        clearButtonContainer = document.createElement('div');
        clearButtonContainer.className = 'history-clear-button-container';
        clearButtonContainer.style.cssText = 'padding: 12px; display: flex; justify-content: flex-end; border-bottom: 1px solid var(--border-glass);';
        clearButtonContainer.innerHTML = '<button class="cancel-order-btn" onclick="window.clearOrdersHistory()" title="Очистить историю">Очистить историю</button>';
        historyItems.insertBefore(clearButtonContainer, historyItems.firstChild);
    }
    
    // Показываем загрузку после кнопки
    const loadingElement = document.createElement('p');
    loadingElement.className = 'loading';
    loadingElement.textContent = 'Загрузка истории заказов...';
    // Удаляем старые элементы (кроме кнопки очистки)
    const itemsToRemove = Array.from(historyItems.children).filter(child => !child.classList.contains('history-clear-button-container'));
    itemsToRemove.forEach(child => child.remove());
    historyItems.appendChild(loadingElement);
    
    try {
        const orders = await getOrdersHistoryAPI();
        console.log('🛒 loadOrdersHistory: Got orders:', orders ? orders.length : 0);
        
        // Удаляем элемент загрузки
        loadingElement.remove();
        
        // Дополнительная фильтрация: показываем только завершенные или отмененные заказы в истории
        // (активные заказы должны быть в разделе "Активные", а не в истории)
        const inactiveOrders = (orders || []).filter(o => o.is_completed === true || o.is_cancelled === true);
        console.log('🛒 loadOrdersHistory: Filtered to inactive orders:', inactiveOrders.length);
        
        if (!inactiveOrders || inactiveOrders.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'loading';
            emptyMessage.textContent = 'У вас нет истории заказов';
            historyItems.appendChild(emptyMessage);
            return;
        }
        
        for (const order of inactiveOrders) {
            try {
                if (!order.product_id) {
                    continue;
                }
                
                const productUrl = `${API_BASE}/api/products/${order.product_id}`;
                const productResponse = await fetch(productUrl, {
                    headers: getBaseHeadersNoAuth()
                });
                
                if (!productResponse.ok) {
                    continue;
                }
                
                const product = await productResponse.json();
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                const priceDisplay = getProductPriceDisplay(product);
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name);
                
                // Статус заказа
                let statusText = '';
                let statusColor = '';
                if (order.is_completed) {
                    statusText = '✅ Выполнен';
                    statusColor = '#4CAF50';
                } else if (order.is_cancelled) {
                    statusText = '❌ Отменен';
                    statusColor = '#F44336';
                } else {
                    statusText = '⏳ В обработке';
                    statusColor = '#FFA500';
                }
                
                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(order.created_at);
                
                historyItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${priceDisplay} × ${order.quantity} шт.</p>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                `;
                
                historyItem.insertBefore(imageContainer, historyItem.firstChild);
                historyItems.appendChild(historyItem);
            } catch (e) {
                console.error('❌ Error loading order history item:', e);
            }
        }
        
        // Проверяем, есть ли элементы кроме кнопки очистки
        const itemsWithoutButton = Array.from(historyItems.children).filter(child => !child.classList.contains('history-clear-button-container'));
        if (itemsWithoutButton.length === 0) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'loading';
            errorMessage.textContent = 'Не удалось загрузить историю заказов';
            historyItems.appendChild(errorMessage);
        }
    } catch (error) {
        console.error('❌ Error loading orders history:', error);
        // Удаляем элемент загрузки если он есть
        const loadingElement = historyItems.querySelector('.loading');
        if (loadingElement) loadingElement.remove();
        
        const errorMessage = document.createElement('p');
        errorMessage.className = 'loading';
        errorMessage.textContent = `Ошибка загрузки: ${error.message}`;
        historyItems.appendChild(errorMessage);
    }
}
// ========== END REFACTORING STEP 4.2 ==========

// ========== REFACTORING STEP 4.3: loadPurchasesHistory ==========
/**
 * Загрузка истории продаж
 * Отображает список завершенных или отмененных продаж в истории корзины
 */
export async function loadPurchasesHistory() {
    console.log('🛒 loadPurchasesHistory: Starting...');
    const historyItems = findCartElement('purchases-history-items');
    if (!historyItems) {
        console.error('❌ loadPurchasesHistory: purchases-history-items element not found');
        return;
    }
    
    // Создаем контейнер для кнопки очистки (если его еще нет)
    let clearButtonContainer = historyItems.querySelector('.history-clear-button-container');
    if (!clearButtonContainer) {
        clearButtonContainer = document.createElement('div');
        clearButtonContainer.className = 'history-clear-button-container';
        clearButtonContainer.style.cssText = 'padding: 12px; display: flex; justify-content: flex-end; border-bottom: 1px solid var(--border-glass);';
        clearButtonContainer.innerHTML = '<button class="cancel-order-btn" onclick="window.clearPurchasesHistory()" title="Очистить историю">Очистить историю</button>';
        historyItems.insertBefore(clearButtonContainer, historyItems.firstChild);
    }
    
    // Показываем загрузку после кнопки
    const loadingElement = document.createElement('p');
    loadingElement.className = 'loading';
    loadingElement.textContent = 'Загрузка истории продаж...';
    // Удаляем старые элементы (кроме кнопки очистки)
    const itemsToRemove = Array.from(historyItems.children).filter(child => !child.classList.contains('history-clear-button-container'));
    itemsToRemove.forEach(child => child.remove());
    historyItems.appendChild(loadingElement);
    
    try {
        const purchases = await getPurchasesHistoryAPI();
        console.log('🛒 loadPurchasesHistory: Got purchases:', purchases ? purchases.length : 0);
        
        // Удаляем элемент загрузки
        loadingElement.remove();
        
        // Дополнительная фильтрация: показываем только завершенные или отмененные продажи в истории
        // (активные продажи должны быть в разделе "Активные", а не в истории)
        const inactivePurchases = (purchases || []).filter(p => p.is_completed === true || p.is_cancelled === true);
        console.log('🛒 loadPurchasesHistory: Filtered to inactive purchases:', inactivePurchases.length);
        
        if (!inactivePurchases || inactivePurchases.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'loading';
            emptyMessage.textContent = 'У вас нет истории продаж';
            historyItems.appendChild(emptyMessage);
            return;
        }
        
        for (const purchase of inactivePurchases) {
            try {
                const product = purchase.product;
                if (!product) {
                    continue;
                }
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name);
                
                // Статус продажи
                let statusText = '';
                let statusColor = '';
                if (purchase.is_completed) {
                    statusText = '✅ Выполнена';
                    statusColor = '#4CAF50';
                } else if (purchase.is_cancelled) {
                    statusText = '❌ Отменена';
                    statusColor = '#F44336';
                } else {
                    statusText = '⏳ Ожидание';
                    statusColor = '#FFA500';
                }
                
                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(purchase.created_at);
                
                historyItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                `;
                
                historyItem.insertBefore(imageContainer, historyItem.firstChild);
                historyItems.appendChild(historyItem);
            } catch (e) {
                console.error('❌ Error loading purchase history item:', e);
            }
        }
        
        // Проверяем, есть ли элементы кроме кнопки очистки
        const itemsWithoutButton = Array.from(historyItems.children).filter(child => !child.classList.contains('history-clear-button-container'));
        if (itemsWithoutButton.length === 0) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'loading';
            errorMessage.textContent = 'Не удалось загрузить историю продаж';
            historyItems.appendChild(errorMessage);
        }
    } catch (error) {
        console.error('❌ Error loading purchases history:', error);
        // Удаляем элемент загрузки если он есть
        const loadingElement = historyItems.querySelector('.loading');
        if (loadingElement) loadingElement.remove();
        
        const errorMessage = document.createElement('p');
        errorMessage.className = 'loading';
        errorMessage.textContent = `Ошибка загрузки: ${error.message}`;
        historyItems.appendChild(errorMessage);
    }
}
// ========== END REFACTORING STEP 4.3 ==========

// ========== SALE ORDERS: loadSaleOrdersHistory() ==========
/**
 * Загрузка истории заказов на покупку (завершенные и отмененные)
 */
export async function loadSaleOrdersHistory() {
    console.log('📦 [SALE ORDER] loadSaleOrdersHistory: Starting...');
    const historyItems = findCartElement('sale-orders-history-items');
    if (!historyItems) {
        console.error('❌ [SALE ORDER] loadSaleOrdersHistory: sale-orders-history-items element not found');
        return;
    }
    
    historyItems.innerHTML = '<p class="loading">Загрузка истории заказов на покупку...</p>';
    
    try {
        console.log('📦 [SALE ORDER] loadSaleOrdersHistory: Fetching sale orders history from API...');
        const allSaleOrders = await getSaleOrdersHistoryAPI();
        console.log('📦 [SALE ORDER] loadSaleOrdersHistory: Got sale orders:', allSaleOrders ? allSaleOrders.length : 0);
        
        if (!allSaleOrders || allSaleOrders.length === 0) {
            historyItems.innerHTML = '<p class="loading">У вас нет истории заказов на покупку</p>';
            return;
        }
        
        // Рендерим список истории заказов на покупку
        historyItems.innerHTML = '';
        for (const saleOrder of allSaleOrders) {
            try {
                // Используем product из snapshot
                let product = saleOrder.product;
                
                // Fallback: если product не пришел из snapshot, загружаем по product_id
                if (!product && saleOrder.product_id) {
                    const productUrl = `${API_BASE}/api/products/${saleOrder.product_id}`;
                    const productResponse = await fetch(productUrl, {
                        headers: getBaseHeadersNoAuth()
                    });
                    
                    if (!productResponse.ok) {
                        console.warn(`📦 [SALE ORDER] loadSaleOrdersHistory: Failed to fetch product ${saleOrder.product_id}:`, productResponse.status);
                        continue;
                    }
                    
                    product = await productResponse.json();
                }
                
                if (!product || !product.name) {
                    console.warn('📦 [SALE ORDER] loadSaleOrdersHistory: Sale order missing valid product:', saleOrder.id);
                    continue;
                }
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                const priceDisplay = getProductPriceDisplay(product);
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name);
                
                // Статус заказа
                let statusText = '';
                let statusColor = '';
                if (saleOrder.is_completed) {
                    statusText = '✅ Выполнен';
                    statusColor = '#4CAF50';
                } else if (saleOrder.is_cancelled) {
                    statusText = '❌ Отменен';
                    statusColor = '#F44336';
                } else {
                    statusText = '⏳ В обработке';
                    statusColor = '#FFA500';
                }
                
                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(saleOrder.created_at);
                
                historyItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${priceDisplay} × ${saleOrder.quantity} шт.</p>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                `;
                
                // Вставляем контейнер изображения в начало
                historyItem.insertBefore(imageContainer, historyItem.firstChild);
                historyItems.appendChild(historyItem);
                console.log('📦 [SALE ORDER] loadSaleOrdersHistory: Added history item for product:', product.name);
            } catch (e) {
                console.error(`❌ [SALE ORDER] loadSaleOrdersHistory: Error processing sale order ${saleOrder.id}:`, e);
            }
        }
        
        console.log('📦 [SALE ORDER] loadSaleOrdersHistory: Completed, total items:', historyItems.children.length);
    } catch (error) {
        console.error('❌ [SALE ORDER] loadSaleOrdersHistory: Error loading sale orders history:', error);
        // Удаляем элемент загрузки если он есть
        const loadingElement = historyItems.querySelector('.loading');
        if (loadingElement) loadingElement.remove();
        
        const errorMessage = document.createElement('p');
        errorMessage.className = 'loading';
        errorMessage.textContent = `Ошибка загрузки: ${error.message}`;
        historyItems.appendChild(errorMessage);
    }
}
// ========== END SALE ORDERS ==========
