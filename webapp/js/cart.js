// Модуль корзины
import { API_BASE, fetchUserReservations, getBaseHeadersNoAuth, getMyOrdersAPI, cancelOrderAPI } from './api.js';

// Элементы DOM корзины
let cartButton = null;
let cartCount = null;
let cartModal = null;

export function initCartElements() {
    cartButton = document.getElementById('cart-button');
    cartCount = document.getElementById('cart-count');
    if (cartButton && cartCount) {
        console.log('✅ Cart elements found');
    } else {
        console.log('❌ Cart elements not found yet');
    }
}

export function setCartModal(modal) {
    cartModal = modal;
}

export function getCartModal() {
    return cartModal;
}

// Обновление UI корзины
export async function updateCartUI() {
    console.log('🛒🛒🛒 ========== updateCartUI START ==========');
    
    try {
        initCartElements();
        
        if (!cartButton || !cartCount) {
            console.error('❌ Cart button or count not found');
            return;
        }
        
        // Backend уже вернул только активные резервации для корзины (где текущий пользователь - резервирующий)
        // Backend уже проверил is_active и reserved_until, просто используем все
        const activeReservations = await fetchUserReservations();
        console.log(`🛒 Got ${activeReservations.length} active cart reservations from server`);
        
        // Также проверяем заказы
        let activeOrders = [];
        try {
            activeOrders = await getMyOrdersAPI();
            console.log(`🛒 Got ${activeOrders ? activeOrders.length : 0} orders from server`);
        } catch (e) {
            console.warn('⚠️ Failed to fetch orders for cart UI:', e);
            activeOrders = [];
        }
        
        // Общее количество элементов в корзине (резервации + заказы)
        const totalItems = activeReservations.length + (activeOrders ? activeOrders.length : 0);
        console.log(`🛒 Total cart items: ${totalItems} (${activeReservations.length} reservations + ${activeOrders ? activeOrders.length : 0} orders)`);
        
        // Удаляем дебаг-индикатор, если он был создан ранее
        const existingDebugIndicator = document.getElementById('cart-debug-indicator');
        if (existingDebugIndicator) {
            existingDebugIndicator.remove();
        }
        
        // Показываем кнопку корзины, если есть резервации ИЛИ заказы
        if (totalItems > 0) {
            console.log(`🛒🛒🛒 ПОКАЗЫВАЕМ КОРЗИНУ! Найдено ${activeReservations.length} активных резерваций и ${activeOrders ? activeOrders.length : 0} заказов`);
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
            
            // ПРИНУДИТЕЛЬНО показываем кнопку корзины
            cartButton.removeAttribute('hidden');
            cartButton.removeAttribute('style');
            cartButton.classList.remove('hidden');
            cartButton.classList.add('cart-button');
            
            // Устанавливаем стили через cssText с !important
            cartButton.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: absolute !important;
                right: 15px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                z-index: 9999 !important;
            `;
            
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
                    cartButton.style.setProperty('display', 'block', 'important');
                    cartButton.style.setProperty('visibility', 'visible', 'important');
                    cartButton.style.setProperty('opacity', '1', 'important');
                } else {
                    console.log('✅✅✅ КНОПКА КОРЗИНЫ УСПЕШНО ОТОБРАЖЕНА!');
                }
            }, 100);
        } else {
            console.log(`❌ Cart button hidden - no active reservations or orders (found ${activeReservations.length} reservations, ${activeOrders ? activeOrders.length : 0} orders)`);
            cartButton.style.display = 'none';
        }
    } catch (e) {
        console.error('❌❌❌ КРИТИЧЕСКАЯ ОШИБКА в updateCartUI:', e);
        if (cartButton) {
            cartButton.style.display = 'none';
        }
    }
    
    console.log('🛒🛒🛒 ========== updateCartUI END ==========');
}

// Загрузка содержимого корзины
export async function loadCart() {
    const cartItems = document.getElementById('cart-items');
    if (!cartItems) {
        console.error('❌ loadCart: cart-items element not found');
        return;
    }
    
    cartItems.innerHTML = '';
    
    try {
        console.log('🛒 loadCart: Fetching reservations...');
        // Backend уже вернул только активные резервации текущего пользователя
        const reservations = await fetchUserReservations();
        console.log('🛒 loadCart: Got reservations:', reservations.length);
        console.log('🛒 loadCart: Reservations data:', reservations);
        
        // Backend уже проверил is_active и reserved_until, просто используем все
        const activeReservations = reservations.filter(r => r.is_active === true);
        console.log('🛒 loadCart: Active reservations:', activeReservations.length);
        
        if (activeReservations.length === 0) {
            console.log('🛒 loadCart: No active reservations');
            cartItems.innerHTML = '<p class="loading">У вас нет активных резерваций</p>';
            updateCartUI();
            return;
        }
        
        console.log('🛒 loadCart: Processing', activeReservations.length, 'reservations');
        for (const reservation of activeReservations) {
            console.log('🛒 loadCart: Processing reservation:', reservation.id, 'product_id:', reservation.product_id, 'user_id:', reservation.user_id);
            
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
                console.log('🛒 loadCart: Fetching product by ID:', productUrl);
                const productResponse = await fetch(productUrl, {
                    headers: getBaseHeadersNoAuth()
                });
                
                if (!productResponse.ok) {
                    const errorText = await productResponse.text();
                    console.error(`❌ loadCart: Failed to fetch product ${reservation.product_id}:`, productResponse.status, errorText);
                    continue;
                }
                
                const product = await productResponse.json();
                console.log('🛒 loadCart: Found product:', product.name, 'id:', product.id);
                
                // Backend возвращает время в UTC через isoformat()
                // Парсим время правильно (если нет Z в конце, добавляем его для UTC)
                let reservedUntilStr = reservation.reserved_until;
                if (reservedUntilStr && !reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                    // Если время без указания часового пояса, считаем его UTC
                    reservedUntilStr = reservedUntilStr + 'Z';
                }
                const reservedUntil = new Date(reservedUntilStr);
                const now = new Date();
                const diffMs = reservedUntil.getTime() - now.getTime();
                
                // Объявляем переменную timeText
                let timeText;
                
                // Проверяем, что время еще не истекло
                if (diffMs <= 0) {
                    timeText = 'Резервация истекла';
                } else {
                    // Вычисляем точное оставшееся время
                    const totalSeconds = Math.floor(diffMs / 1000);
                    const totalMinutes = Math.floor(totalSeconds / 60);
                    const hoursLeft = Math.floor(totalMinutes / 60);
                    const minutesLeft = totalMinutes % 60;
                    
                    // Показываем точное время до истечения резервации
                    if (hoursLeft >= 1) {
                        // Если есть минуты, показываем их тоже
                        if (minutesLeft > 0) {
                            timeText = `${hoursLeft} ${hoursLeft === 1 ? 'час' : hoursLeft < 5 ? 'часа' : 'часов'} ${minutesLeft} ${minutesLeft === 1 ? 'минута' : minutesLeft < 5 ? 'минуты' : 'минут'}`;
                        } else {
                            timeText = `${hoursLeft} ${hoursLeft === 1 ? 'час' : hoursLeft < 5 ? 'часа' : 'часов'}`;
                        }
                    } else if (totalMinutes > 0) {
                        // Если меньше часа, показываем минуты
                        timeText = `${totalMinutes} ${totalMinutes === 1 ? 'минута' : totalMinutes < 5 ? 'минуты' : 'минут'}`;
                    } else {
                        timeText = 'менее минуты';
                    }
                }
                
                // Определяем URL изображения
                let imageUrl = null;
                if (product.images_urls && product.images_urls.length > 0) {
                    const firstImage = product.images_urls[0];
                    imageUrl = firstImage.startsWith('http') 
                        ? firstImage 
                        : `${API_BASE}${firstImage.startsWith('/') ? '' : '/'}${firstImage}`;
                } else if (product.image_url) {
                    imageUrl = product.image_url.startsWith('http') 
                        ? product.image_url 
                        : `${API_BASE}${product.image_url.startsWith('/') ? '' : '/'}${product.image_url}`;
                }
                
                const finalPrice = product.discount > 0 
                    ? Math.round(product.price * (1 - product.discount / 100)) 
                    : product.price;
                
                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';
                
                // Создаем контейнер для изображения
                const imageContainer = document.createElement('div');
                imageContainer.className = 'cart-item-image-container';
                
                if (imageUrl) {
                    // Показываем placeholder во время загрузки
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '⏳';
                    imageContainer.appendChild(placeholder);
                    
                    // Загружаем изображение через fetch для обхода блокировки Telegram WebView
                    fetch(imageUrl, {
                        headers: {
                            'ngrok-skip-browser-warning': '69420'
                        }
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        const img = document.createElement('img');
                        img.src = blobUrl;
                        img.alt = product.name;
                        img.className = 'cart-item-image';
                        img.onerror = () => {
                            URL.revokeObjectURL(blobUrl);
                            placeholder.textContent = '📦';
                            placeholder.style.display = 'flex';
                            if (img.parentNode) {
                                img.remove();
                            }
                        };
                        img.onload = () => {
                            if (placeholder.parentNode) {
                                placeholder.remove();
                            }
                        };
                        imageContainer.appendChild(img);
                    })
                    .catch(error => {
                        console.error('[CART IMG] Fetch error:', error);
                        placeholder.textContent = '📦';
                    });
                } else {
                    // Нет изображения - показываем placeholder
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '📦';
                    imageContainer.appendChild(placeholder);
                }
                
                cartItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${finalPrice} ₽</p>
                        <p class="cart-item-time">⏰ До ${timeText}</p>
                    </div>
                    <button class="cancel-reservation-btn-small" onclick="window.cancelReservationFromCart(${reservation.id}, ${reservation.product_id})" title="Снять резервацию">❌</button>
                `;
                
                // Вставляем контейнер изображения в начало
                cartItem.insertBefore(imageContainer, cartItem.firstChild);
                cartItems.appendChild(cartItem);
                console.log('🛒 loadCart: Added cart item for product:', product.name);
            } catch (e) {
                console.error('❌ Error loading cart item:', e);
                console.error('❌ Reservation:', reservation);
                console.error('❌ Error stack:', e.stack);
            }
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

// Инициализация корзины
let cartInitInterval = null;

export function initCart() {
    console.log('🛒 ========== initCart START ==========');
    initCartElements();
    
    if (!cartButton || !cartCount) {
        console.log('❌ Cart elements not found, retrying...');
        setTimeout(initCart, 100);
        return;
    }
    
    console.log('✅ Initializing cart');
    console.log('✅ Cart button element:', cartButton);
    console.log('✅ Cart count element:', cartCount);
    
    // Обновляем корзину сразу
    updateCartUI().then(() => {
        console.log('✅ Cart initialized successfully');
        loadCart();
        
        // Очищаем предыдущий интервал, если был
        if (cartInitInterval) {
            clearInterval(cartInitInterval);
        }
        
        // Обновляем корзину каждые 30 секунд
        cartInitInterval = setInterval(() => {
            console.log('🛒 Периодическое обновление корзины...');
            updateCartUI();
            loadCart();
        }, 30000);
    }).catch(err => {
        console.error('❌ Error initializing cart:', err);
        console.error('❌ Error stack:', err.stack);
    });
    
    console.log('🛒 ========== initCart END ==========');
}

// Настройка кнопки корзины
export function setupCartButton() {
    initCartElements();
    if (cartButton) {
        cartButton.onclick = () => {
            if (cartModal) {
                // Инициализируем активную вкладку при открытии корзины
                switchCartTab('reservations');
                cartModal.style.display = 'block';
            }
        };
        console.log('✅ Cart button click handler set up');
    } else {
        setTimeout(setupCartButton, 100);
    }
}

// Настройка модального окна корзины
export function setupCartModal() {
    const modal = document.getElementById('cart-modal');
    if (!modal) {
        setTimeout(setupCartModal, 100);
        return;
    }
    
    setCartModal(modal);
    
    const cartClose = document.querySelector('.cart-close');
    if (cartClose) {
        cartClose.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    // Настройка вкладок
    const tabs = document.querySelectorAll('.cart-tab');
    if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
            tab.onclick = () => {
                console.log(`🛒 Cart tab clicked: ${tab.dataset.tab}`);
                switchCartTab(tab.dataset.tab);
            };
        });
        // Инициализируем активную вкладку по умолчанию
        switchCartTab('reservations');
        console.log('✅ Cart tabs initialized');
    } else {
        console.warn('⚠️ Cart tabs not found in HTML');
    }
    
    console.log('✅ Cart modal initialized');
}

// Переключение вкладок корзины
function switchCartTab(tabName) {
    console.log(`🛒 switchCartTab: switching to tab "${tabName}"`);
    const tabs = document.querySelectorAll('.cart-tab');
    const cartItems = document.getElementById('cart-items');
    const ordersItems = document.getElementById('orders-items');
    
    if (!tabs || tabs.length === 0) {
        console.warn('⚠️ Cart tabs not found');
        return;
    }
    
    if (!cartItems || !ordersItems) {
        console.warn('⚠️ Cart items containers not found');
        return;
    }
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    if (tabName === 'reservations') {
        cartItems.style.display = 'block';
        ordersItems.style.display = 'none';
        console.log('🛒 Loading reservations...');
        loadCart();
    } else if (tabName === 'orders') {
        cartItems.style.display = 'none';
        ordersItems.style.display = 'block';
        console.log('🛒 Loading orders...');
        loadOrders();
    }
}

// Загрузка заказов
export async function loadOrders() {
    console.log('🛒 loadOrders: Starting...');
    const ordersItems = document.getElementById('orders-items');
    if (!ordersItems) {
        console.error('❌ loadOrders: orders-items element not found');
        return;
    }
    
    ordersItems.innerHTML = '<p class="loading">Загрузка заказов...</p>';
    
    try {
        console.log('🛒 loadOrders: Fetching orders from API...');
        const orders = await getMyOrdersAPI();
        console.log('🛒 loadOrders: Got orders:', orders ? orders.length : 0, orders);
        
        if (!orders || orders.length === 0) {
            ordersItems.innerHTML = '<p class="loading">У вас нет заказов</p>';
            return;
        }
        
        // Рендерим список заказов
        ordersItems.innerHTML = '';
        for (const order of orders) {
            try {
                // Получаем товар напрямую по его ID (из любого магазина)
                if (!order.product_id) {
                    console.warn('🛒 loadOrders: Order missing product_id:', order.id);
                    continue;
                }
                
                const productUrl = `${API_BASE}/api/products/${order.product_id}`;
                const productResponse = await fetch(productUrl, {
                    headers: getBaseHeadersNoAuth()
                });
                
                if (!productResponse.ok) {
                    console.warn(`🛒 loadOrders: Failed to fetch product ${order.product_id}:`, productResponse.status);
                    continue;
                }
                
                const product = await productResponse.json();
                
                // Определяем URL изображения
                let imageUrl = null;
                if (product.images_urls && product.images_urls.length > 0) {
                    const firstImage = product.images_urls[0];
                    imageUrl = firstImage.startsWith('http') 
                        ? firstImage 
                        : `${API_BASE}${firstImage.startsWith('/') ? '' : '/'}${firstImage}`;
                } else if (product.image_url) {
                    imageUrl = product.image_url.startsWith('http') 
                        ? product.image_url 
                        : `${API_BASE}${product.image_url.startsWith('/') ? '' : '/'}${product.image_url}`;
                }
                
                const finalPrice = product.discount > 0 
                    ? Math.round(product.price * (1 - product.discount / 100)) 
                    : product.price;
                
                const orderItem = document.createElement('div');
                orderItem.className = 'cart-item';
                
                // Создаем контейнер для изображения
                const imageContainer = document.createElement('div');
                imageContainer.className = 'cart-item-image-container';
                
                if (imageUrl) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '⏳';
                    imageContainer.appendChild(placeholder);
                    
                    fetch(imageUrl, {
                        headers: {
                            'ngrok-skip-browser-warning': '69420'
                        }
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        const img = document.createElement('img');
                        img.src = blobUrl;
                        img.alt = product.name;
                        img.className = 'cart-item-image';
                        img.onerror = () => {
                            URL.revokeObjectURL(blobUrl);
                            placeholder.textContent = '📦';
                            placeholder.style.display = 'flex';
                            if (img.parentNode) {
                                img.remove();
                            }
                        };
                        img.onload = () => {
                            if (placeholder.parentNode) {
                                placeholder.remove();
                            }
                        };
                        imageContainer.appendChild(img);
                    })
                    .catch(error => {
                        console.error('[ORDERS IMG] Fetch error:', error);
                        placeholder.textContent = '📦';
                    });
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '📦';
                    imageContainer.appendChild(placeholder);
                }
                
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
                
                orderItem.innerHTML = `
                    <div class="cart-item-info">
                        <h3>${product.name}</h3>
                        <p class="cart-item-price">${finalPrice} ₽ × ${order.quantity} шт.</p>
                        <p class="cart-item-time" style="color: ${statusColor};">${statusText}</p>
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

