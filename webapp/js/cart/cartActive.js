// ========== REFACTORING STEP 5.1, 5.2, 5.3: cartActive.js ==========
// Модуль для работы с активными элементами корзины
// Дата начала: 2024-12-XX
// Статус: 🔄 В ПРОЦЕССЕ (STEP 5.1 завершен, STEP 5.2 завершен, STEP 5.3 завершен)

// Импорты зависимостей
// ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
import { API_BASE, fetchUserReservations, getBaseHeadersNoAuth } from '../api.js';
import { getMyOrdersAPI } from '../api/orders.js';
// ========== REFACTORING STEP 9.2: getMyPurchasesAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getMyPurchasesAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.2 ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { API_BASE, fetchUserReservations, getBaseHeadersNoAuth, getMyOrdersAPI, getMyPurchasesAPI } from '../api.js';
// ========== END REFACTORING STEP 8 ==========
import { calculateReservationTimeLeft, formatDateToMoscow } from '../utils/dateUtils.js';
import { createImageContainer, getProductImageUrl } from '../utils/imageUtils.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';

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
 * Загрузка активных резерваций в корзину
 * Отображает список активных резерваций текущего пользователя
 * @param {Function} [updateCartUI] - Опциональная функция для обновления UI корзины (вызывается при отсутствии резерваций)
 */
export async function loadCart(updateCartUI = null) {
    console.log('🛒 loadCart: Starting...');
    const cartItems = findCartElement('cart-items');
    if (!cartItems) {
        console.error('❌ loadCart: cart-items element not found - cart page may not be ready yet');
        // Не блокируем выполнение, просто возвращаемся
        return;
    }
    console.log('🛒 loadCart: cart-items element found');
    
    cartItems.innerHTML = '';
    
    try {
        console.log('🛒 loadCart: Fetching reservations...');
        // Backend уже вернул только активные резервации текущего пользователя
        const reservations = await fetchUserReservations();
        console.log('🛒 loadCart: Got reservations:', reservations.length);
        console.log('🛒 loadCart: Reservations data:', reservations);
        
        // Фильтруем активные резервации (проверяем is_active и время истечения)
        const now = new Date();
        const activeReservations = reservations.filter(r => {
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
        
        if (activeReservations.length === 0) {
            console.log('🛒 loadCart: No active reservations');
            cartItems.innerHTML = '<p class="loading">У вас нет активных резерваций</p>';
            // Вызываем updateCartUI если она передана
            if (updateCartUI && typeof updateCartUI === 'function') {
                updateCartUI();
            }
            return;
        }
        
        console.log('🛒 loadCart: Processing', activeReservations.length, 'reservations');
        for (const reservation of activeReservations) {
            console.log('🛒 loadCart: Processing reservation:', reservation.id, 'product_id:', reservation.product_id, 'snapshot_id:', reservation.snapshot_id);
            
            // КРИТИЧНО: Используем product из snapshot (изоляция данных товара)
            // Backend теперь возвращает product из snapshot в reservation.product
            // Это гарантирует, что товар останется доступным даже если админ удалит или изменит его
            let product = reservation.product;
            
            // Fallback: если product не пришел из snapshot, загружаем по product_id (для обратной совместимости)
            if (!product) {
                // Проверяем наличие обязательных полей
                if (!reservation.user_id || !reservation.product_id) {
                    console.error('❌ loadCart: Reservation missing required fields:', {
                        id: reservation.id,
                        user_id: reservation.user_id,
                        product_id: reservation.product_id
                    });
                    continue;
                }
                
                try {
                    // Получаем товар напрямую по его ID (из любого магазина)
                    const productUrl = `${API_BASE}/api/products/${reservation.product_id}`;
                    console.log('🛒 loadCart: Fetching product by ID (fallback):', productUrl);
                    
                    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
                    const TIMEOUT_MS = 5000; // 5 секунд для каждого товара
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => {
                        controller.abort();
                    }, TIMEOUT_MS);
                    
                    try {
                        const productResponse = await fetch(productUrl, {
                            headers: getBaseHeadersNoAuth(),
                            signal: controller.signal
                        });
                        
                        clearTimeout(timeoutId);
                        
                        if (!productResponse.ok) {
                            const errorText = await productResponse.text();
                            console.error(`❌ loadCart: Failed to fetch product ${reservation.product_id}:`, productResponse.status, errorText);
                            continue;
                        }
                        
                        product = await productResponse.json();
                    } catch (fetchError) {
                        clearTimeout(timeoutId);
                        
                        // Обработка ошибки таймаута
                        if (fetchError.name === 'AbortError') {
                            console.error(`❌ loadCart: Timeout fetching product ${reservation.product_id}`);
                            continue; // Пропускаем этот товар
                        }
                        
                        console.error('❌ Error loading cart item:', fetchError);
                        console.error('❌ Reservation:', reservation);
                        console.error('❌ Error stack:', fetchError.stack);
                        continue;
                    }
                } catch (e) {
                    console.error('❌ Error loading cart item:', e);
                    console.error('❌ Reservation:', reservation);
                    console.error('❌ Error stack:', e.stack);
                    continue;
                }
            }
            
            if (!product || !product.name) {
                console.error('❌ loadCart: Product data is invalid:', product);
                continue;
            }
            
            console.log('🛒 loadCart: Using product from snapshot:', product.name, 'id:', product.id);
                
                // Использование импортированной функции для расчета времени до истечения резервации
                const timeText = calculateReservationTimeLeft(reservation.reserved_until);
                
                // Вычисляем diffMs отдельно для кнопки отмены (нужно для проверки, показывать ли кнопку)
                let diffMs = 0;
                if (reservation.reserved_until) {
                    let reservedUntilStr = reservation.reserved_until;
                    if (!reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                        reservedUntilStr = reservedUntilStr + 'Z';
                    }
                    const reservedUntil = new Date(reservedUntilStr);
                    const now = new Date();
                    diffMs = reservedUntil.getTime() - now.getTime();
                }
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                const priceDisplay = getProductPriceDisplay(product);
                
                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name, '[CART IMG]');
                
                // Показываем кнопку отмены только для активных резерваций
                const cancelButton = diffMs > 0
                    ? `<div class="cart-item-actions">
                        <button class="cancel-order-btn" onclick="window.cancelReservationFromCart(${reservation.id}, ${reservation.product_id})" title="Отменить резервацию">Отмена</button>
                       </div>`
                    : '';

                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(reservation.created_at);

                cartItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${priceDisplay}</p>
                        <p class="cart-item-time">⏰ До ${timeText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                    ${cancelButton}
                `;
                
            // Вставляем контейнер изображения в начало
            cartItem.insertBefore(imageContainer, cartItem.firstChild);
            cartItems.appendChild(cartItem);
            console.log('🛒 loadCart: Added cart item for product:', product.name);
        }
        
        console.log('🛒 loadCart: Completed, total items:', cartItems.children.length);
        if (cartItems.children.length === 0 && activeReservations.length > 0) {
            console.error('❌ loadCart: Failed to load any products from', activeReservations.length, 'reservations');
            cartItems.innerHTML = '<p class="loading">Не удалось загрузить товары из резерваций. Попробуйте обновить страницу.</p>';
        } else if (cartItems.children.length === 0) {
            cartItems.innerHTML = '<p class="loading">У вас нет активных резерваций</p>';
        }
    } catch (e) {
        console.error('❌❌❌ Error loading cart:', e);
        console.error('❌ Error details:', {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        cartItems.innerHTML = '<p class="loading">Ошибка загрузки корзины: ' + e.message + '</p>';
    }
}
// ========== END REFACTORING STEP 5.1 ==========

// ========== REFACTORING STEP 5.2: loadOrders() ==========
/**
 * Загрузка активных заказов в корзину
 * Отображает список активных заказов текущего пользователя
 */
export async function loadOrders() {
    console.log('🛒 loadOrders: Starting...');
    const ordersItems = findCartElement('orders-items');
    if (!ordersItems) {
        console.error('❌ loadOrders: orders-items element not found');
        return;
    }
    
    ordersItems.innerHTML = '<p class="loading">Загрузка заказов...</p>';
    
    try {
        console.log('🛒 loadOrders: Fetching orders from API...');
        const allOrders = await getMyOrdersAPI();
        console.log('🛒 loadOrders: Got orders:', allOrders ? allOrders.length : 0, allOrders);
        
        // Фильтруем только активные заказы (не завершенные и не отмененные)
        const orders = (allOrders || []).filter(o => !o.is_completed && !o.is_cancelled);
        console.log(`🛒 loadOrders: Filtered to ${orders.length} active orders from ${allOrders ? allOrders.length : 0} total`);
        
        if (!orders || orders.length === 0) {
            ordersItems.innerHTML = '<p class="loading">У вас нет активных заказов</p>';
            return;
        }
        
        // Рендерим список активных заказов
        ordersItems.innerHTML = '';
        for (const order of orders) {
            try {
                // КРИТИЧНО: Используем product из snapshot (изоляция данных товара)
                // Backend возвращает product из snapshot в order.product
                // Это гарантирует, что товар останется доступным даже если админ удалит или изменит его
                let product = order.product;
                
                // Fallback: если product не пришел из snapshot, загружаем по product_id (для обратной совместимости)
                if (!product && order.product_id) {
                    const productUrl = `${API_BASE}/api/products/${order.product_id}`;
                    const productResponse = await fetch(productUrl, {
                        headers: getBaseHeadersNoAuth()
                    });
                    
                    if (!productResponse.ok) {
                        console.warn(`🛒 loadOrders: Failed to fetch product ${order.product_id}:`, productResponse.status);
                        continue;
                    }
                    
                    product = await productResponse.json();
                }
                
                if (!product || !product.name) {
                    console.warn('🛒 loadOrders: Order missing valid product:', order.id);
                    continue;
                }
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                const priceDisplay = getProductPriceDisplay(product);
                
                const orderItem = document.createElement('div');
                orderItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name, '[ORDERS IMG]');
                
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
                
                // Показываем кнопку отмены только для активных заказов (не завершенных и не отмененных)
                const cancelButton = (!order.is_completed && !order.is_cancelled) 
                    ? `<div class="cart-item-actions">
                        <button class="cancel-order-btn" onclick="window.cancelOrderFromCart(${order.id})" title="Отменить заказ">Отмена</button>
                       </div>`
                    : '';
                
                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(order.created_at);
                
                orderItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${priceDisplay} × ${order.quantity} шт.</p>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                    ${cancelButton}
                `;
                
                orderItem.insertBefore(imageContainer, orderItem.firstChild);
                ordersItems.appendChild(orderItem);
            } catch (e) {
                console.error('❌ Error loading order item:', e);
            }
        }
        
        if (ordersItems.children.length === 0) {
            ordersItems.innerHTML = '<p class="loading">Не удалось загрузить заказы</p>';
        }
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        ordersItems.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}
// ========== END REFACTORING STEP 5.2 ==========

// ========== REFACTORING STEP 5.3: loadPurchases() ==========
/**
 * Загрузка активных продаж в корзину
 * Отображает список активных продаж текущего пользователя
 */
export async function loadPurchases() {
    console.log('🛒 loadPurchases: Starting...');
    const purchasesItems = findCartElement('purchases-items');
    if (!purchasesItems) {
        console.error('❌ loadPurchases: purchases-items element not found');
        return;
    }
    
    purchasesItems.innerHTML = '<p class="loading">Загрузка заявок на продажу...</p>';
    
    try {
        console.log('🛒 loadPurchases: Fetching purchases from API...');
        const purchases = await getMyPurchasesAPI();
        console.log('🛒 loadPurchases: Got purchases:', purchases ? purchases.length : 0, purchases);
        
        if (!purchases || purchases.length === 0) {
            purchasesItems.innerHTML = '<p class="loading">У вас нет заявок на продажу</p>';
            return;
        }
        
        // Фильтруем только активные продажи (не завершенные и не отмененные)
        const activePurchases = purchases.filter(p => !p.is_completed && !p.is_cancelled);
        console.log(`🛒 loadPurchases: Filtered to ${activePurchases.length} active sales from ${purchases.length} total`);
        
        if (activePurchases.length === 0) {
            purchasesItems.innerHTML = '<p class="loading">У вас нет активных заявок на продажу</p>';
            return;
        }
        
        // Рендерим список продаж
        purchasesItems.innerHTML = '';
        for (const purchase of activePurchases) {
            try {
                // Используем информацию о товаре из purchase.product (если есть)
                const product = purchase.product;
                if (!product) {
                    console.warn('🛒 loadPurchases: Purchase missing product:', purchase.id);
                    continue;
                }
                
                // Использование импортированных функций из утилит
                const imageUrl = getProductImageUrl(product, API_BASE);
                
                const purchaseItem = document.createElement('div');
                purchaseItem.className = 'cart-item';
                
                const imageContainer = createImageContainer(imageUrl, product.name, '[PURCHASES IMG]');
                
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
                
                // Показываем кнопку отмены только для активных продаж (не завершенных и не отмененных)
                const cancelButton = (!purchase.is_completed && !purchase.is_cancelled) 
                    ? `<div class="cart-item-actions">
                        <button class="cancel-order-btn" onclick="window.cancelPurchaseFromCart(${purchase.id})" title="Отменить продажу">Отмена</button>
                       </div>`
                    : '';
                
                // Форматирование даты через импортированную функцию
                const dateText = formatDateToMoscow(purchase.created_at);
                
                purchaseItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
                        ${dateText ? `<p style="font-size: 12px; color: var(--tg-theme-hint-color); margin-top: 4px;">📅 ${dateText}</p>` : ''}
                    </div>
                    ${cancelButton}
                `;
                
                purchaseItem.insertBefore(imageContainer, purchaseItem.firstChild);
                purchasesItems.appendChild(purchaseItem);
            } catch (e) {
                console.error('❌ Error loading purchase item:', e);
            }
        }
        
        if (purchasesItems.children.length === 0) {
            purchasesItems.innerHTML = '<p class="loading">Не удалось загрузить заявки на продажу</p>';
        }
    } catch (error) {
        console.error('❌ Error loading purchases:', error);
        purchasesItems.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}
// ========== END REFACTORING STEP 5.3 ==========

