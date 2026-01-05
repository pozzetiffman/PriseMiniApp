// Модуль корзины
import { API_BASE, fetchReservationsHistory, fetchUserReservations, getBaseHeadersNoAuth, getMyOrdersAPI, getMyPurchasesAPI, getOrdersHistoryAPI, getPurchasesHistoryAPI } from './api.js';
// ========== REFACTORING STEP 1.1: priceUtils.js ==========
import { getProductPriceDisplay } from './utils/priceUtils.js';

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
        
        // Также проверяем продажи (API теперь возвращает только активные, но фильтруем для надежности)
        let activePurchases = [];
        try {
            const allPurchases = await getMyPurchasesAPI();
            // Дополнительно фильтруем на случай, если API вернет все продажи
            activePurchases = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled);
            console.log(`🛒 Got ${activePurchases.length} active purchases from server (filtered from ${allPurchases ? allPurchases.length : 0} total)`);
        } catch (e) {
            console.warn('⚠️ Failed to fetch purchases for cart UI:', e);
            activePurchases = [];
        }
        
        // Проверяем историю для всех типов
        let hasHistory = false;
        try {
            // Проверяем историю резерваций
            const historyReservations = await fetchReservationsHistory();
            const historyReservationsCount = (historyReservations || []).filter(r => r.is_active === false).length;
            if (historyReservationsCount > 0) {
                hasHistory = true;
                console.log(`🛒 Found ${historyReservationsCount} history reservations`);
            }
        } catch (e) {
            console.warn('⚠️ Failed to fetch reservations history for cart UI:', e);
        }
        
        if (!hasHistory) {
            try {
                // Проверяем историю заказов
                const historyOrders = await getOrdersHistoryAPI();
                const historyOrdersCount = (historyOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
                if (historyOrdersCount > 0) {
                    hasHistory = true;
                    console.log(`🛒 Found ${historyOrdersCount} history orders`);
                }
            } catch (e) {
                console.warn('⚠️ Failed to fetch orders history for cart UI:', e);
            }
        }
        
        if (!hasHistory) {
            try {
                // Проверяем историю продаж
                const historyPurchases = await getPurchasesHistoryAPI();
                const historyPurchasesCount = (historyPurchases || []).filter(p => p.is_completed === true || p.is_cancelled === true).length;
                if (historyPurchasesCount > 0) {
                    hasHistory = true;
                    console.log(`🛒 Found ${historyPurchasesCount} history purchases`);
                }
            } catch (e) {
                console.warn('⚠️ Failed to fetch purchases history for cart UI:', e);
            }
        }
        
        // Общее количество активных элементов в корзине (резервации + заказы + продажи)
        const totalItems = activeReservations.length + (activeOrders ? activeOrders.length : 0) + (activePurchases ? activePurchases.length : 0);
        console.log(`🛒 Total active cart items: ${totalItems} (${activeReservations.length} reservations + ${activeOrders ? activeOrders.length : 0} orders + ${activePurchases ? activePurchases.length : 0} purchases)`);
        console.log(`🛒 Has history: ${hasHistory}`);
        
        // Удаляем дебаг-индикатор, если он был создан ранее
        const existingDebugIndicator = document.getElementById('cart-debug-indicator');
        if (existingDebugIndicator) {
            existingDebugIndicator.remove();
        }
        
        // Показываем кнопку корзины, если есть активные элементы ИЛИ история
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
            console.log(`❌ Cart button hidden - no active items or history (found ${activeReservations.length} active reservations, ${activeOrders ? activeOrders.length : 0} active orders, ${activePurchases ? activePurchases.length : 0} active sales, hasHistory: ${hasHistory})`);
            // Для неактивной корзины используем opacity и pointer-events, но оставляем в grid layout
            cartButton.style.display = 'flex';
            cartButton.style.opacity = '0.3';
            cartButton.style.pointerEvents = 'none';
        }
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
                
                // ========== REFACTORING STEP 1.1: Использование импортированной функции ==========
                const priceDisplay = getProductPriceDisplay(product);
                
                // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
                /*
                // Функция для формирования отображения цены с учетом is_for_sale
                const getProductPriceDisplay = (prod) => {
                    const isForSale = prod.is_for_sale === true || 
                                     prod.is_for_sale === 1 || 
                                     prod.is_for_sale === '1' ||
                                     prod.is_for_sale === 'true' ||
                                     String(prod.is_for_sale).toLowerCase() === 'true';
                    
                    if (isForSale) {
                        const priceType = prod.price_type || 'range';
                        if (priceType === 'fixed' && prod.price_fixed !== null && prod.price_fixed !== undefined) {
                            return `${prod.price_fixed}р`;
                        } else if (priceType === 'range') {
                            // Для диапазона цен показываем "от X до Y р"
                            // Обрабатываем значения: могут быть числами, строками, null, undefined
                            let priceFrom = null;
                            let priceTo = null;
                            
                            // Обрабатываем price_from: конвертируем в число, если возможно
                            if (prod.price_from != null && prod.price_from !== '') {
                                const fromNum = Number(prod.price_from);
                                if (!isNaN(fromNum) && isFinite(fromNum)) {
                                    priceFrom = fromNum;
                                }
                            }
                            
                            // Обрабатываем price_to: конвертируем в число, если возможно
                            if (prod.price_to != null && prod.price_to !== '') {
                                const toNum = Number(prod.price_to);
                                if (!isNaN(toNum) && isFinite(toNum)) {
                                    priceTo = toNum;
                                }
                            }
                            
                            // Если есть оба значения (включая 0), показываем диапазон "от X до Y р"
                            if (priceFrom != null && priceTo != null) {
                                return `от ${priceFrom} до ${priceTo} р`;
                            } else if (priceFrom != null) {
                                return `от ${priceFrom} р`;
                            } else if (priceTo != null) {
                                return `до ${priceTo} р`;
                            }
                        }
                        // Если нет цены, возвращаем "Цена по запросу"
                        return 'Цена по запросу';
                    } else {
                        // Обычная цена со скидкой
                        const finalPrice = prod.discount > 0 
                            ? Math.round(prod.price * (1 - prod.discount / 100)) 
                            : prod.price;
                        return `${finalPrice} ₽`;
                    }
                };
                
                const priceDisplay = getProductPriceDisplay(product);
                */
                // ========== END REFACTORING STEP 1.1 ==========
                
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
                
                // Показываем кнопку отмены только для активных резерваций
                const cancelButton = diffMs > 0
                    ? `<div class="cart-item-actions">
                        <button class="cancel-order-btn" onclick="window.cancelReservationFromCart(${reservation.id}, ${reservation.product_id})" title="Отменить резервацию">Отмена</button>
                       </div>`
                    : '';

                // Дата создания резервации
                let dateText = '';
                if (reservation.created_at) {
                    let dateStr = reservation.created_at;
                    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                        dateStr = dateStr + 'Z';
                    }
                    const createdDate = new Date(dateStr);
                    dateText = createdDate.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow'
                    });
                }

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
        cartButton.onclick = async () => {
            if (cartModal) {
                // Обновляем видимость вкладок перед открытием
                const tabsData = await updateCartTabsVisibility();
                
                // Выбираем первую доступную вкладку
                let defaultTab = 'reservations';
                if (tabsData.hasReservations) {
                    defaultTab = 'reservations';
                } else if (tabsData.hasOrders) {
                    defaultTab = 'orders';
                } else if (tabsData.hasPurchases) {
                    defaultTab = 'purchases';
                }
                
                // Инициализируем активную вкладку при открытии корзины
                switchCartTab(defaultTab);
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
    
    // Настройка основных вкладок
    const tabs = document.querySelectorAll('.cart-tab');
    if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
            tab.onclick = () => {
                console.log(`🛒 Cart tab clicked: ${tab.dataset.tab}`);
                switchCartTab(tab.dataset.tab);
            };
        });
        // Обновляем видимость вкладок при инициализации
        updateCartTabsVisibility().then(tabsData => {
            // Выбираем первую доступную вкладку
            let defaultTab = 'reservations';
            if (tabsData.hasReservations) {
                defaultTab = 'reservations';
            } else if (tabsData.hasOrders) {
                defaultTab = 'orders';
            } else if (tabsData.hasPurchases) {
                defaultTab = 'purchases';
            }
            switchCartTab(defaultTab);
        });
        console.log('✅ Cart tabs initialized');
    } else {
        console.warn('⚠️ Cart tabs not found in HTML');
    }
    
    // Настройка подвкладок
    const subtabs = document.querySelectorAll('.cart-subtab');
    if (subtabs && subtabs.length > 0) {
        subtabs.forEach(subtab => {
            subtab.onclick = () => {
                console.log(`🛒 Cart subtab clicked: ${subtab.dataset.subtab}`);
                switchCartSubtab(subtab.dataset.subtab);
            };
        });
        console.log('✅ Cart subtabs initialized');
    } else {
        console.warn('⚠️ Cart subtabs not found in HTML');
    }
    
    console.log('✅ Cart modal initialized');
}

// Проверка наличия данных и обновление видимости вкладок
export async function updateCartTabsVisibility() {
    console.log('🛒 updateCartTabsVisibility: Checking data availability...');
    
    try {
        // Проверяем резервации (активные + история)
        let hasReservations = false;
        try {
            const activeReservations = await fetchUserReservations();
            const activeCount = (activeReservations || []).filter(r => r.is_active === true).length;
            
            let historyCount = 0;
            try {
                const historyReservations = await fetchReservationsHistory();
                historyCount = (historyReservations || []).filter(r => r.is_active === false).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch reservations history for visibility check:', e);
            }
            
            hasReservations = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Reservations: ${activeCount} active, ${historyCount} history, hasData: ${hasReservations}`);
        } catch (e) {
            console.warn('⚠️ Failed to check reservations:', e);
        }
        
        // Проверяем заказы (активные + история)
        let hasOrders = false;
        try {
            const activeOrders = await getMyOrdersAPI();
            const activeCount = (activeOrders || []).filter(o => !o.is_completed && !o.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historyOrders = await getOrdersHistoryAPI();
                historyCount = (historyOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch orders history for visibility check:', e);
            }
            
            hasOrders = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Orders: ${activeCount} active, ${historyCount} history, hasData: ${hasOrders}`);
        } catch (e) {
            console.warn('⚠️ Failed to check orders:', e);
        }
        
        // Проверяем продажи (активные + история)
        let hasPurchases = false;
        try {
            const allPurchases = await getMyPurchasesAPI();
            const activeCount = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historyPurchases = await getPurchasesHistoryAPI();
                historyCount = (historyPurchases || []).filter(p => p.is_completed === true || p.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch purchases history for visibility check:', e);
            }
            
            hasPurchases = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Purchases: ${activeCount} active, ${historyCount} history, hasData: ${hasPurchases}`);
        } catch (e) {
            console.warn('⚠️ Failed to check purchases:', e);
        }
        
        // Обновляем видимость вкладок
        const tabs = document.querySelectorAll('.cart-tab');
        const reservationsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'reservations');
        const ordersTab = Array.from(tabs).find(tab => tab.dataset.tab === 'orders');
        const purchasesTab = Array.from(tabs).find(tab => tab.dataset.tab === 'purchases');
        
        if (reservationsTab) {
            if (hasReservations) {
                reservationsTab.style.display = '';
                reservationsTab.classList.remove('hidden');
            } else {
                reservationsTab.style.display = 'none';
                reservationsTab.classList.add('hidden');
            }
        }
        
        if (ordersTab) {
            if (hasOrders) {
                ordersTab.style.display = '';
                ordersTab.classList.remove('hidden');
            } else {
                ordersTab.style.display = 'none';
                ordersTab.classList.add('hidden');
            }
        }
        
        if (purchasesTab) {
            if (hasPurchases) {
                purchasesTab.style.display = '';
                purchasesTab.classList.remove('hidden');
            } else {
                purchasesTab.style.display = 'none';
                purchasesTab.classList.add('hidden');
            }
        }
        
        // Если текущая активная вкладка скрыта, переключаемся на первую доступную
        const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
        if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
            const firstVisibleTab = Array.from(tabs).find(tab => 
                tab.style.display !== 'none' && !tab.classList.contains('hidden')
            );
            if (firstVisibleTab) {
                console.log(`🛒 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
                switchCartTab(firstVisibleTab.dataset.tab);
            }
        }
        
        console.log(`🛒 Tabs visibility updated: Reservations=${hasReservations}, Orders=${hasOrders}, Purchases=${hasPurchases}`);
        
        return { hasReservations, hasOrders, hasPurchases };
    } catch (error) {
        console.error('❌ Error updating cart tabs visibility:', error);
        return { hasReservations: true, hasOrders: true, hasPurchases: true }; // По умолчанию показываем все
    }
}

// Переключение вкладок корзины
function switchCartTab(tabName) {
    console.log(`🛒 switchCartTab: switching to tab "${tabName}"`);
    const tabs = document.querySelectorAll('.cart-tab');
    const reservationsSection = document.getElementById('reservations-section');
    const ordersSection = document.getElementById('orders-section');
    const purchasesSection = document.getElementById('purchases-section');
    
    if (!tabs || tabs.length === 0) {
        console.warn('⚠️ Cart tabs not found');
        return;
    }
    
    if (!reservationsSection || !ordersSection || !purchasesSection) {
        console.warn('⚠️ Cart sections not found');
        return;
    }
    
    // Проверяем, что вкладка видима перед переключением
    const targetTab = Array.from(tabs).find(tab => tab.dataset.tab === tabName);
    if (targetTab && (targetTab.style.display === 'none' || targetTab.classList.contains('hidden'))) {
        console.warn(`⚠️ Cannot switch to hidden tab: ${tabName}`);
        // Переключаемся на первую видимую вкладку
        const firstVisibleTab = Array.from(tabs).find(tab => 
            tab.style.display !== 'none' && !tab.classList.contains('hidden')
        );
        if (firstVisibleTab) {
            console.log(`🛒 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
            switchCartTab(firstVisibleTab.dataset.tab);
        }
        return;
    }
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Скрываем все секции
    reservationsSection.style.display = 'none';
    ordersSection.style.display = 'none';
    purchasesSection.style.display = 'none';
    
    // Показываем нужную секцию и активируем первую подвкладку
    if (tabName === 'reservations') {
        reservationsSection.style.display = 'block';
        switchCartSubtab('reservations-active');
    } else if (tabName === 'orders') {
        ordersSection.style.display = 'block';
        switchCartSubtab('orders-active');
    } else if (tabName === 'purchases') {
        purchasesSection.style.display = 'block';
        switchCartSubtab('purchases-active');
    }
}

// Переключение подвкладок корзины
function switchCartSubtab(subtabName) {
    console.log(`🛒 switchCartSubtab: switching to subtab "${subtabName}"`);
    
    // Определяем основную вкладку по имени подвкладки
    let mainTab = '';
    let activeContainer = null;
    let historyContainer = null;
    
    if (subtabName.startsWith('reservations-')) {
        mainTab = 'reservations';
        activeContainer = document.getElementById('cart-items');
        historyContainer = document.getElementById('reservations-history-items');
    } else if (subtabName.startsWith('orders-')) {
        mainTab = 'orders';
        activeContainer = document.getElementById('orders-items');
        historyContainer = document.getElementById('orders-history-items');
    } else if (subtabName.startsWith('purchases-')) {
        mainTab = 'purchases';
        activeContainer = document.getElementById('purchases-items');
        historyContainer = document.getElementById('purchases-history-items');
    }
    
    if (!activeContainer || !historyContainer) {
        console.warn('⚠️ Cart subtab containers not found');
        return;
    }
    
    // Обновляем активные подвкладки в текущей секции
    const currentSection = document.getElementById(`${mainTab}-section`);
    if (currentSection) {
        const subtabs = currentSection.querySelectorAll('.cart-subtab');
        subtabs.forEach(subtab => {
            if (subtab.dataset.subtab === subtabName) {
                subtab.classList.add('active');
            } else {
                subtab.classList.remove('active');
            }
        });
    }
    
    // Показываем нужный контейнер
    if (subtabName.endsWith('-active')) {
        activeContainer.style.display = 'block';
        historyContainer.style.display = 'none';
        
        // Загружаем данные
        if (mainTab === 'reservations') {
            console.log('🛒 Loading active reservations...');
            loadCart();
        } else if (mainTab === 'orders') {
            console.log('🛒 Loading active orders...');
            loadOrders();
        } else if (mainTab === 'purchases') {
            console.log('🛒 Loading active sales...');
            loadPurchases();
        }
    } else if (subtabName.endsWith('-history')) {
        activeContainer.style.display = 'none';
        historyContainer.style.display = 'block';
        
        // Загружаем историю
        if (mainTab === 'reservations') {
            console.log('🛒 Loading reservations history...');
            loadReservationsHistory();
        } else if (mainTab === 'orders') {
            console.log('🛒 Loading orders history...');
            loadOrdersHistory();
        } else if (mainTab === 'purchases') {
            console.log('🛒 Loading sales history...');
            loadPurchasesHistory();
        }
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
                
                // ========== REFACTORING STEP 1.1: Использование импортированной функции ==========
                const priceDisplay = getProductPriceDisplay(product);
                
                // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
                /*
                // Функция для формирования отображения цены с учетом is_for_sale
                const getProductPriceDisplay = (prod) => {
                    const isForSale = prod.is_for_sale === true || 
                                     prod.is_for_sale === 1 || 
                                     prod.is_for_sale === '1' ||
                                     prod.is_for_sale === 'true' ||
                                     String(prod.is_for_sale).toLowerCase() === 'true';
                    
                    if (isForSale) {
                        const priceType = prod.price_type || 'range';
                        if (priceType === 'fixed' && prod.price_fixed !== null && prod.price_fixed !== undefined) {
                            return `${prod.price_fixed}р`;
                        } else if (priceType === 'range') {
                            // Для диапазона цен показываем "от X до Y р"
                            // Обрабатываем значения: могут быть числами, строками, null, undefined
                            let priceFrom = null;
                            let priceTo = null;
                            
                            // Обрабатываем price_from: конвертируем в число, если возможно
                            if (prod.price_from != null && prod.price_from !== '') {
                                const fromNum = Number(prod.price_from);
                                if (!isNaN(fromNum) && isFinite(fromNum)) {
                                    priceFrom = fromNum;
                                }
                            }
                            
                            // Обрабатываем price_to: конвертируем в число, если возможно
                            if (prod.price_to != null && prod.price_to !== '') {
                                const toNum = Number(prod.price_to);
                                if (!isNaN(toNum) && isFinite(toNum)) {
                                    priceTo = toNum;
                                }
                            }
                            
                            // Если есть оба значения (включая 0), показываем диапазон "от X до Y р"
                            if (priceFrom != null && priceTo != null) {
                                return `от ${priceFrom} до ${priceTo} р`;
                            } else if (priceFrom != null) {
                                return `от ${priceFrom} р`;
                            } else if (priceTo != null) {
                                return `до ${priceTo} р`;
                            }
                        }
                        // Если нет цены, возвращаем "Цена по запросу"
                        return 'Цена по запросу';
                    } else {
                        // Обычная цена со скидкой
                        const finalPrice = prod.discount > 0 
                            ? Math.round(prod.price * (1 - prod.discount / 100)) 
                            : prod.price;
                        return `${finalPrice} ₽`;
                    }
                };
                
                const priceDisplay = getProductPriceDisplay(product);
                */
                // ========== END REFACTORING STEP 1.1 ==========
                
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
                
                // Дата создания заказа
                let dateText = '';
                if (order.created_at) {
                    let dateStr = order.created_at;
                    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                        dateStr = dateStr + 'Z';
                    }
                    const orderDate = new Date(dateStr);
                    dateText = orderDate.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow'
                    });
                }
                
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

// Загрузка продаж
export async function loadPurchases() {
    console.log('🛒 loadPurchases: Starting...');
    const purchasesItems = document.getElementById('purchases-items');
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
                
                const purchaseItem = document.createElement('div');
                purchaseItem.className = 'cart-item';
                
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
                        console.error('[PURCHASES IMG] Fetch error:', error);
                        placeholder.textContent = '📦';
                    });
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '📦';
                    imageContainer.appendChild(placeholder);
                }
                
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
                
                // Дата создания продажи
                let dateText = '';
                if (purchase.created_at) {
                    let dateStr = purchase.created_at;
                    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                        dateStr = dateStr + 'Z';
                    }
                    const purchaseDate = new Date(dateStr);
                    dateText = purchaseDate.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow'
                    });
                }
                
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

// Загрузка истории резерваций
export async function loadReservationsHistory() {
    console.log('🛒 loadReservationsHistory: Starting...');
    const historyItems = document.getElementById('reservations-history-items');
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
                
                // ========== REFACTORING STEP 1.1: Использование импортированной функции ==========
                const priceDisplay = getProductPriceDisplay(product);
                
                // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
                /*
                // Функция для формирования отображения цены с учетом is_for_sale
                const getProductPriceDisplay = (prod) => {
                    const isForSale = prod.is_for_sale === true || 
                                     prod.is_for_sale === 1 || 
                                     prod.is_for_sale === '1' ||
                                     prod.is_for_sale === 'true' ||
                                     String(prod.is_for_sale).toLowerCase() === 'true';
                    
                    if (isForSale) {
                        const priceType = prod.price_type || 'range';
                        if (priceType === 'fixed' && prod.price_fixed !== null && prod.price_fixed !== undefined) {
                            return `${prod.price_fixed}р`;
                        } else if (priceType === 'range') {
                            // Для диапазона цен показываем "от X до Y р"
                            // Обрабатываем значения: могут быть числами, строками, null, undefined
                            let priceFrom = null;
                            let priceTo = null;
                            
                            // Обрабатываем price_from: конвертируем в число, если возможно
                            if (prod.price_from != null && prod.price_from !== '') {
                                const fromNum = Number(prod.price_from);
                                if (!isNaN(fromNum) && isFinite(fromNum)) {
                                    priceFrom = fromNum;
                                }
                            }
                            
                            // Обрабатываем price_to: конвертируем в число, если возможно
                            if (prod.price_to != null && prod.price_to !== '') {
                                const toNum = Number(prod.price_to);
                                if (!isNaN(toNum) && isFinite(toNum)) {
                                    priceTo = toNum;
                                }
                            }
                            
                            // Если есть оба значения (включая 0), показываем диапазон "от X до Y р"
                            if (priceFrom != null && priceTo != null) {
                                return `от ${priceFrom} до ${priceTo} р`;
                            } else if (priceFrom != null) {
                                return `от ${priceFrom} р`;
                            } else if (priceTo != null) {
                                return `до ${priceTo} р`;
                            }
                        }
                        // Если нет цены, возвращаем "Цена по запросу"
                        return 'Цена по запросу';
                    } else {
                        // Обычная цена со скидкой
                        const finalPrice = prod.discount > 0 
                            ? Math.round(prod.price * (1 - prod.discount / 100)) 
                            : prod.price;
                        return `${finalPrice} ₽`;
                    }
                };
                
                const priceDisplay = getProductPriceDisplay(product);
                */
                // ========== END REFACTORING STEP 1.1 ==========
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
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
                    .then(response => response.blob())
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
                            if (img.parentNode) img.remove();
                        };
                        img.onload = () => {
                            if (placeholder.parentNode) placeholder.remove();
                        };
                        imageContainer.appendChild(img);
                    })
                    .catch(() => {
                        placeholder.textContent = '📦';
                    });
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '📦';
                    imageContainer.appendChild(placeholder);
                }
                
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
                
                // Дата создания
                let dateText = '';
                if (reservation.created_at) {
                    // Время приходит в UTC, нужно явно указать это и конвертировать в московское время
                    let dateStr = reservation.created_at;
                    // Если строка не заканчивается на Z или +/-, добавляем Z для указания UTC
                    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                        dateStr = dateStr + 'Z';
                    }
                    const createdDate = new Date(dateStr);
                    // Используем timeZone для автоматической конвертации UTC в московское время
                    dateText = createdDate.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow'
                    });
                }
                
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

// Загрузка истории заказов
export async function loadOrdersHistory() {
    console.log('🛒 loadOrdersHistory: Starting...');
    const historyItems = document.getElementById('orders-history-items');
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
                
                // ========== REFACTORING STEP 1.1: Использование импортированной функции ==========
                const priceDisplay = getProductPriceDisplay(product);
                
                // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
                /*
                // Функция для формирования отображения цены с учетом is_for_sale
                const getProductPriceDisplay = (prod) => {
                    const isForSale = prod.is_for_sale === true || 
                                     prod.is_for_sale === 1 || 
                                     prod.is_for_sale === '1' ||
                                     prod.is_for_sale === 'true' ||
                                     String(prod.is_for_sale).toLowerCase() === 'true';
                    
                    if (isForSale) {
                        const priceType = prod.price_type || 'range';
                        if (priceType === 'fixed' && prod.price_fixed !== null && prod.price_fixed !== undefined) {
                            return `${prod.price_fixed}р`;
                        } else if (priceType === 'range') {
                            // Для диапазона цен показываем "от X до Y р"
                            // Обрабатываем значения: могут быть числами, строками, null, undefined
                            let priceFrom = null;
                            let priceTo = null;
                            
                            // Обрабатываем price_from: конвертируем в число, если возможно
                            if (prod.price_from != null && prod.price_from !== '') {
                                const fromNum = Number(prod.price_from);
                                if (!isNaN(fromNum) && isFinite(fromNum)) {
                                    priceFrom = fromNum;
                                }
                            }
                            
                            // Обрабатываем price_to: конвертируем в число, если возможно
                            if (prod.price_to != null && prod.price_to !== '') {
                                const toNum = Number(prod.price_to);
                                if (!isNaN(toNum) && isFinite(toNum)) {
                                    priceTo = toNum;
                                }
                            }
                            
                            // Если есть оба значения (включая 0), показываем диапазон "от X до Y р"
                            if (priceFrom != null && priceTo != null) {
                                return `от ${priceFrom} до ${priceTo} р`;
                            } else if (priceFrom != null) {
                                return `от ${priceFrom} р`;
                            } else if (priceTo != null) {
                                return `до ${priceTo} р`;
                            }
                        }
                        // Если нет цены, возвращаем "Цена по запросу"
                        return 'Цена по запросу';
                    } else {
                        // Обычная цена со скидкой
                        const finalPrice = prod.discount > 0 
                            ? Math.round(prod.price * (1 - prod.discount / 100)) 
                            : prod.price;
                        return `${finalPrice} ₽`;
                    }
                };
                
                const priceDisplay = getProductPriceDisplay(product);
                */
                // ========== END REFACTORING STEP 1.1 ==========
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
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
                    .then(response => response.blob())
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
                            if (img.parentNode) img.remove();
                        };
                        img.onload = () => {
                            if (placeholder.parentNode) placeholder.remove();
                        };
                        imageContainer.appendChild(img);
                    })
                    .catch(() => {
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
                
                // Дата создания
                let dateText = '';
                if (order.created_at) {
                    // Время приходит в UTC, нужно явно указать это и конвертировать в московское время
                    let dateStr = order.created_at;
                    // Если строка не заканчивается на Z или +/-, добавляем Z для указания UTC
                    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                        dateStr = dateStr + 'Z';
                    }
                    const orderDate = new Date(dateStr);
                    // Используем timeZone для автоматической конвертации UTC в московское время
                    dateText = orderDate.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow'
                    });
                }
                
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

// Загрузка истории продаж
export async function loadPurchasesHistory() {
    console.log('🛒 loadPurchasesHistory: Starting...');
    const historyItems = document.getElementById('purchases-history-items');
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
                
                const historyItem = document.createElement('div');
                historyItem.className = 'cart-item';
                
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
                    .then(response => response.blob())
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
                            if (img.parentNode) img.remove();
                        };
                        img.onload = () => {
                            if (placeholder.parentNode) placeholder.remove();
                        };
                        imageContainer.appendChild(img);
                    })
                    .catch(() => {
                        placeholder.textContent = '📦';
                    });
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'cart-item-image-placeholder';
                    placeholder.textContent = '📦';
                    imageContainer.appendChild(placeholder);
                }
                
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
                
                // Дата создания
                let dateText = '';
                if (purchase.created_at) {
                    // Время приходит в UTC, нужно явно указать это и конвертировать в московское время
                    let dateStr = purchase.created_at;
                    // Если строка не заканчивается на Z или +/-, добавляем Z для указания UTC
                    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                        dateStr = dateStr + 'Z';
                    }
                    const purchaseDate = new Date(dateStr);
                    // Используем timeZone для автоматической конвертации UTC в московское время
                    dateText = purchaseDate.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow'
                    });
                }
                
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

