// ========== REFACTORING STEP 2.1: initAdmin ==========
// Модуль инициализации админки
// Дата начала: 2024-12-19
// Статус: В процессе

/**
 * Инициализация админки
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.createAdminModal - Функция создания модального окна админки
 * @param {Function} dependencies.handleQuantityEnabledToggle - Обработчик переключателя количества товаров
 * @param {Function} dependencies.handleReservationsToggle - Обработчик переключателя резервации
 * @param {Function} dependencies.handleAllProductsMadeToOrderToggle - Обработчик переключателя "Все товары под заказ"
 * @param {Function} dependencies.switchAdminTab - Функция переключения вкладок админки
 * @param {Function} dependencies.setAdminModal - Сеттер для adminModal
 * @param {Function} dependencies.setReservationsToggle - Сеттер для reservationsToggle
 * @param {Function} dependencies.setQuantityEnabledToggle - Сеттер для quantityEnabledToggle
 * @param {Function} dependencies.setAllProductsMadeToOrderToggle - Сеттер для allProductsMadeToOrderToggle
 */
export function initAdmin(dependencies) {
    const {
        createAdminModal,
        handleQuantityEnabledToggle,
        handleReservationsToggle,
        handleAllProductsMadeToOrderToggle,
        switchAdminTab,
        setAdminModal,
        setReservationsToggle,
        setQuantityEnabledToggle,
        setAllProductsMadeToOrderToggle
    } = dependencies;
    
    console.log('🔧 Initializing admin panel...');
    
    // Создаем модальное окно админки, если его еще нет
    if (!document.getElementById('admin-modal')) {
        createAdminModal();
    }
    
    const adminModal = document.getElementById('admin-modal');
    const reservationsToggle = document.getElementById('reservations-toggle');
    const quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
    const allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
    
    // Сохраняем ссылки на элементы в глобальные переменные через сеттеры
    if (setAdminModal) setAdminModal(adminModal);
    if (setReservationsToggle) setReservationsToggle(reservationsToggle);
    if (setQuantityEnabledToggle) setQuantityEnabledToggle(quantityEnabledToggle);
    if (setAllProductsMadeToOrderToggle) setAllProductsMadeToOrderToggle(allProductsMadeToOrderToggle);
    
    // Настройка закрытия модального окна
    if (adminModal) {
        const adminClose = adminModal.querySelector('.admin-close');
        if (adminClose) {
            adminClose.onclick = () => {
                adminModal.style.display = 'none';
            };
        }
        
        // Закрытие при клике вне модального окна
        adminModal.onclick = (e) => {
            if (e.target === adminModal) {
                adminModal.style.display = 'none';
            }
        };
    }
    
    // Обработчик переключателя количества товаров
    if (quantityEnabledToggle) {
        quantityEnabledToggle.onchange = async (e) => {
            const enabled = e.target.checked;
            await handleQuantityEnabledToggle(enabled);
        };
    }
    
    // Обработчик переключателя резервации
    if (reservationsToggle) {
        reservationsToggle.onchange = async (e) => {
            const enabled = e.target.checked;
            await handleReservationsToggle(enabled);
        };
    }
    
    // Обработчик переключателя "Все товары под заказ"
    if (allProductsMadeToOrderToggle) {
        allProductsMadeToOrderToggle.onchange = async (e) => {
            const enabled = e.target.checked;
            await handleAllProductsMadeToOrderToggle(enabled);
        };
    }
    
    // Настройка вкладок - будет настроена через зависимости в openAdmin
    
    console.log('✅ Admin panel initialized');
}
// ========== END REFACTORING STEP 2.1 ==========

// ========== REFACTORING STEP 2.2: createAdminModal ==========
/**
 * Создание модального окна админки
 */
export function createAdminModal() {
    const modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.className = 'admin-modal';
    modal.style.display = 'none';
    
    // Проверяем, скрыл ли пользователь информационное сообщение
    const tabsInfoHidden = localStorage.getItem('admin-tabs-info-hidden') === 'true';
    
    modal.innerHTML = `
        <div class="admin-modal-content">
            <div class="admin-modal-header">
                <h2>📊 Админка</h2>
                <span class="admin-close">&times;</span>
            </div>
            ${!tabsInfoHidden ? `
            <div class="admin-tabs-info" id="admin-tabs-info" style="position: relative; padding: 10px 40px 10px 16px; font-size: 12px; color: var(--tg-theme-hint-color, #999); text-align: center; background: rgba(90, 200, 250, 0.1); border-radius: 8px; margin: 12px 16px 12px 16px; border: 1px solid rgba(90, 200, 250, 0.2); line-height: 1.4;">
                <button class="admin-tabs-info-close" style="position: absolute; top: 50%; right: 8px; transform: translateY(-50%); background: transparent; border: none; color: var(--tg-theme-hint-color, #999); font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1; opacity: 0.7; transition: opacity 0.2s;" title="Скрыть">×</button>
                💡 <strong style="color: var(--tg-theme-text-color, #fff);">Адаптивные вкладки:</strong> показываются только при наличии данных. Пустые вкладки (Заказы, Резервации, Проданные, Покупки) скрываются автоматически.
            </div>
            ` : ''}
            <div class="admin-tabs">
                <button class="admin-tab active" data-tab="orders">
                    <span style="font-size: 18px;">🛒</span>
                    <span>Заказы</span>
                </button>
                <button class="admin-tab" data-tab="reservations">
                    <span style="font-size: 18px;">🔒</span>
                    <span>Резервации</span>
                </button>
                <button class="admin-tab" data-tab="sold">
                    <span style="font-size: 18px;">✅</span>
                    <span>Проданные</span>
                </button>
                <button class="admin-tab" data-tab="stats">
                    <span style="font-size: 18px;">📊</span>
                    <span>Статистика</span>
                </button>
                <button class="admin-tab" data-tab="purchases">
                    <span style="font-size: 18px;">💰</span>
                    <span>Покупки</span>
                </button>
            </div>
            <div class="admin-modal-body">
                <div id="admin-tab-orders" class="admin-tab-content active">
                    <div id="orders-list" class="orders-list">
                        <p class="loading">Загрузка заказов...</p>
                    </div>
                </div>
                <div id="admin-tab-reservations" class="admin-tab-content">
                    <div id="reservations-list" class="reservations-list">
                        <p class="loading">Загрузка резерваций...</p>
                    </div>
                </div>
                <div id="admin-tab-sold" class="admin-tab-content">
                    <div id="sold-products-list" class="sold-products-list">
                        <p class="loading">Загрузка истории продаж...</p>
                    </div>
                </div>
                <div id="admin-tab-stats" class="admin-tab-content">
                    <div id="stats-content" class="stats-content">
                        <p class="loading">Загрузка статистики...</p>
                    </div>
                </div>
                <div id="admin-tab-purchases" class="admin-tab-content">
                    <div id="purchases-list" class="purchases-list">
                        <p class="loading">Загрузка заявок на покупку...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Добавляем обработчик для кнопки закрытия информационного сообщения
    const tabsInfoClose = modal.querySelector('.admin-tabs-info-close');
    if (tabsInfoClose) {
        tabsInfoClose.addEventListener('click', () => {
            const tabsInfo = modal.querySelector('#admin-tabs-info');
            if (tabsInfo) {
                tabsInfo.style.display = 'none';
                localStorage.setItem('admin-tabs-info-hidden', 'true');
            }
        });
        
        // Добавляем hover эффект для кнопки закрытия
        tabsInfoClose.addEventListener('mouseenter', () => {
            tabsInfoClose.style.opacity = '1';
        });
        tabsInfoClose.addEventListener('mouseleave', () => {
            tabsInfoClose.style.opacity = '0.7';
        });
    }
}
// ========== END REFACTORING STEP 2.2 ==========

// ========== REFACTORING STEP 2.5: updateAdminTabsVisibility ==========
/**
 * Проверка наличия данных и обновление видимости вкладок админки
 * Проверяет наличие активных элементов и истории для каждой секции (orders, reservations, sold, purchases)
 * и обновляет видимость соответствующих вкладок
 * @returns {Promise<{hasOrders: boolean, hasReservations: boolean, hasSold: boolean, hasPurchases: boolean}>} Объект с информацией о наличии данных
 */
export async function updateAdminTabsVisibility() {
    console.log('📊 updateAdminTabsVisibility: Checking data availability...');
    
    try {
        // Проверяем, что элементы вкладок существуют в DOM
        const tabs = document.querySelectorAll('.admin-tab');
        if (!tabs || tabs.length === 0) {
            console.warn('⚠️ Admin tabs not found in DOM yet, skipping visibility update');
            return { hasOrders: true, hasReservations: true, hasSold: true, hasPurchases: true };
        }
        
        // Получаем shop_owner_id из глобального appContext
        let shopOwnerId = null;
        
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
            }
        }
        
        if (!shopOwnerId) {
            console.warn('⚠️ Cannot determine shop_owner_id, showing all tabs');
            return { hasOrders: true, hasReservations: true, hasSold: true, hasPurchases: true };
        }
        
        // Проверяем заказы (активные + история)
        let hasOrders = false;
        try {
            const { getShopOrdersAPI } = await import('../api/orders.js');
            const allOrders = await getShopOrdersAPI();
            
            const activeCount = (allOrders || []).filter(o => !o.is_completed && !o.is_cancelled).length;
            const historyCount = (allOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
            
            hasOrders = activeCount > 0 || historyCount > 0;
            console.log(`📊 Orders: ${activeCount} active, ${historyCount} history, hasData: ${hasOrders}`);
        } catch (e) {
            console.warn('⚠️ Failed to check orders:', e);
        }
        
        // Проверяем резервации (активные + история)
        let hasReservations = false;
        try {
            const { API_BASE, getBaseHeaders } = await import('../api/config.js');
            const response = await fetch(`${API_BASE}/api/reservations/user/me`, {
                headers: getBaseHeaders()
            });
            
            if (response.ok) {
                const allReservations = await response.json();
                const now = new Date();
                
                const activeCount = (allReservations || []).filter(r => {
                    const isActive = r.is_active === true || r.is_active === "true" || r.is_active === 1;
                    if (!isActive) return false;
                    
                    if (!r.reserved_until) return false;
                    
                    let reservedUntilStr = r.reserved_until;
                    if (!reservedUntilStr.includes('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                        reservedUntilStr = reservedUntilStr + 'Z';
                    }
                    const reservedUntil = new Date(reservedUntilStr);
                    
                    if (isNaN(reservedUntil.getTime())) return false;
                    
                    return reservedUntil > now;
                }).length;
                
                const historyCount = (allReservations || []).filter(r => {
                    const isActive = r.is_active === true || r.is_active === "true" || r.is_active === 1;
                    if (!isActive) return true;
                    
                    if (!r.reserved_until) return true;
                    
                    let reservedUntilStr = r.reserved_until;
                    if (!reservedUntilStr.includes('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                        reservedUntilStr = reservedUntilStr + 'Z';
                    }
                    const reservedUntil = new Date(reservedUntilStr);
                    
                    if (isNaN(reservedUntil.getTime())) return true;
                    
                    return reservedUntil <= now;
                }).length;
                
                hasReservations = activeCount > 0 || historyCount > 0;
                console.log(`📊 Reservations: ${activeCount} active, ${historyCount} history, hasData: ${hasReservations}`);
            }
        } catch (e) {
            console.warn('⚠️ Failed to check reservations:', e);
        }
        
        // Проверяем проданные товары (это уже история)
        let hasSold = false;
        try {
            const { getSoldProductsAPI } = await import('../api/products_read.js');
            const soldProducts = await getSoldProductsAPI(shopOwnerId);
            hasSold = (soldProducts || []).length > 0;
            console.log(`📊 Sold: ${(soldProducts || []).length} items, hasData: ${hasSold}`);
        } catch (e) {
            console.warn('⚠️ Failed to check sold products:', e);
        }
        
        // Проверяем покупки (активные + история)
        let hasPurchases = false;
        try {
            const { getAllPurchasesAPI } = await import('../api/purchases.js');
            const allPurchases = await getAllPurchasesAPI(shopOwnerId);
            
            const activeCount = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled).length;
            const historyCount = (allPurchases || []).filter(p => p.is_completed === true || p.is_cancelled === true).length;
            
            hasPurchases = activeCount > 0 || historyCount > 0;
            console.log(`📊 Purchases: ${activeCount} active, ${historyCount} history, hasData: ${hasPurchases}`);
        } catch (e) {
            console.warn('⚠️ Failed to check purchases:', e);
        }
        
        // Обновляем видимость вкладок (tabs уже получены выше)
        const ordersTab = Array.from(tabs).find(tab => tab.dataset.tab === 'orders');
        const reservationsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'reservations');
        const soldTab = Array.from(tabs).find(tab => tab.dataset.tab === 'sold');
        const purchasesTab = Array.from(tabs).find(tab => tab.dataset.tab === 'purchases');
        // Статистика всегда показывается
        const statsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'stats');
        
        if (ordersTab) {
            if (hasOrders) {
                ordersTab.style.display = '';
                ordersTab.classList.remove('hidden');
            } else {
                ordersTab.style.display = 'none';
                ordersTab.classList.add('hidden');
            }
        }
        
        if (reservationsTab) {
            if (hasReservations) {
                reservationsTab.style.display = '';
                reservationsTab.classList.remove('hidden');
            } else {
                reservationsTab.style.display = 'none';
                reservationsTab.classList.add('hidden');
            }
        }
        
        if (soldTab) {
            if (hasSold) {
                soldTab.style.display = '';
                soldTab.classList.remove('hidden');
            } else {
                soldTab.style.display = 'none';
                soldTab.classList.add('hidden');
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
        
        // Статистика всегда видима
        if (statsTab) {
            statsTab.style.display = '';
            statsTab.classList.remove('hidden');
        }
        
        // Если текущая активная вкладка скрыта, переключаемся на первую доступную
        const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
        if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
            const firstVisibleTab = Array.from(tabs).find(tab => 
                tab.style.display !== 'none' && !tab.classList.contains('hidden')
            );
            if (firstVisibleTab) {
                console.log(`📊 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
                // Переключаемся на первую видимую вкладку через switchAdminTab
                // Но нам нужны зависимости, поэтому просто активируем вкладку
                const tabName = firstVisibleTab.dataset.tab;
                const tabContents = document.querySelectorAll('.admin-tab-content');
                
                tabs.forEach(tab => {
                    if (tab.dataset.tab === tabName) {
                        tab.classList.add('active');
                    } else {
                        tab.classList.remove('active');
                    }
                });
                
                tabContents.forEach(content => {
                    if (content.id === `admin-tab-${tabName}`) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
            }
        }
        
        console.log(`📊 Tabs visibility updated: Orders=${hasOrders}, Reservations=${hasReservations}, Sold=${hasSold}, Purchases=${hasPurchases}`);
        
        return { hasOrders, hasReservations, hasSold, hasPurchases };
    } catch (error) {
        console.error('❌ Error updating admin tabs visibility:', error);
        return { hasOrders: true, hasReservations: true, hasSold: true, hasPurchases: true }; // По умолчанию показываем все
    }
}
// ========== END REFACTORING STEP 2.5 ==========

// ========== REFACTORING STEP 2.3: openAdmin ==========
/**
 * Открытие админки
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.initAdmin - Функция инициализации админки
 * @param {Function} dependencies.getShopSettings - Функция API для получения настроек магазина
 * @param {Function} dependencies.checkAllProductsMadeToOrder - Функция проверки состояния товаров
 * @param {Function} dependencies.switchAdminTab - Функция переключения вкладок админки
 * @param {Function} dependencies.getAdminModal - Геттер для adminModal
 * @param {Function} dependencies.setAdminModal - Сеттер для adminModal
 * @param {Function} dependencies.getReservationsToggle - Геттер для reservationsToggle
 * @param {Function} dependencies.setReservationsToggle - Сеттер для reservationsToggle
 * @param {Function} dependencies.getQuantityEnabledToggle - Геттер для quantityEnabledToggle
 * @param {Function} dependencies.setQuantityEnabledToggle - Сеттер для quantityEnabledToggle
 * @param {Function} dependencies.getAllProductsMadeToOrderToggle - Геттер для allProductsMadeToOrderToggle
 * @param {Function} dependencies.setAllProductsMadeToOrderToggle - Сеттер для allProductsMadeToOrderToggle
 * @param {Function} dependencies.setShopSettings - Сеттер для shopSettings
 */
export async function openAdmin(dependencies) {
    const {
        initAdmin,
        getShopSettings,
        checkAllProductsMadeToOrder,
        switchAdminTab,
        loadOrders,
        loadReservations,
        loadSoldProducts,
        loadStats,
        loadPurchases,
        getAdminModal,
        setAdminModal,
        getReservationsToggle,
        setReservationsToggle,
        getQuantityEnabledToggle,
        setQuantityEnabledToggle,
        getAllProductsMadeToOrderToggle,
        setAllProductsMadeToOrderToggle,
        setShopSettings
    } = dependencies;
    
    console.log('🔧 Opening admin panel...');
    
    let adminModal = getAdminModal ? getAdminModal() : null;
    
    if (!adminModal) {
        initAdmin();
        adminModal = getAdminModal ? getAdminModal() : null;
    } else {
        // Переинициализируем ссылки на тумблеры на случай, если модальное окно уже существует
        const reservationsToggle = document.getElementById('reservations-toggle');
        const quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
        const allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
        
        if (setReservationsToggle) setReservationsToggle(reservationsToggle);
        if (setQuantityEnabledToggle) setQuantityEnabledToggle(quantityEnabledToggle);
        if (setAllProductsMadeToOrderToggle) setAllProductsMadeToOrderToggle(allProductsMadeToOrderToggle);
    }
    
    try {
        // Загружаем текущие настройки
        const shopSettings = await getShopSettings();
        console.log('✅ Shop settings loaded:', shopSettings);
        
        if (setShopSettings) setShopSettings(shopSettings);
        
        // Получаем ссылки на тумблеры
        const quantityEnabledToggle = getQuantityEnabledToggle ? getQuantityEnabledToggle() : null;
        const reservationsToggle = getReservationsToggle ? getReservationsToggle() : null;
        const allProductsMadeToOrderToggle = getAllProductsMadeToOrderToggle ? getAllProductsMadeToOrderToggle() : null;
        
        // Устанавливаем значение переключателей
        if (quantityEnabledToggle) {
            quantityEnabledToggle.checked = shopSettings.quantity_enabled !== false;
        }
        if (reservationsToggle) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
            // Резервация может работать независимо от quantity_enabled
            // Если quantity_enabled = false, резервация работает, но без показа количества
            reservationsToggle.disabled = false;
        }
        
        // Проверяем состояние товаров и устанавливаем тумблер "Все товары под заказ"
        if (allProductsMadeToOrderToggle) {
            try {
                const allMadeToOrder = await checkAllProductsMadeToOrder();
                allProductsMadeToOrderToggle.checked = allMadeToOrder;
                console.log(`✅ All products made-to-order toggle set to: ${allMadeToOrder}`);
            } catch (error) {
                console.error('❌ Error checking products state:', error);
                allProductsMadeToOrderToggle.checked = false;
            }
        }
        
        // Показываем модальное окно
        if (adminModal) {
            // Настройка закрытия модального окна
            const adminClose = adminModal.querySelector('.admin-close');
            if (adminClose) {
                adminClose.onclick = () => {
                    adminModal.style.display = 'none';
                };
            }
            
            // Закрытие при клике вне модального окна
            adminModal.onclick = (e) => {
                if (e.target === adminModal) {
                    adminModal.style.display = 'none';
                }
            };
            
            // Настройка вкладок
            const tabs = adminModal.querySelectorAll('.admin-tab');
            tabs.forEach(tab => {
                tab.onclick = () => {
                    switchAdminTab(tab.dataset.tab, {
                        loadOrders,
                        loadReservations,
                        loadSoldProducts,
                        loadStats,
                        loadPurchases
                    });
                };
            });
            
            adminModal.style.display = 'flex';
            
            // Сначала переключаемся на вкладку по умолчанию, чтобы админка открылась сразу
            switchAdminTab('orders', {
                loadOrders,
                loadReservations,
                loadSoldProducts,
                loadStats,
                loadPurchases
            });
            
            // Затем обновляем видимость вкладок асинхронно (не блокируя открытие админки)
            // Оборачиваем в try-catch, чтобы ошибки не блокировали работу
            updateAdminTabsVisibility().then(() => {
                // После обновления видимости переключаемся на первую видимую вкладку
                const tabs = adminModal.querySelectorAll('.admin-tab');
                const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
                
                // Если текущая активная вкладка скрыта, переключаемся на первую видимую
                if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
                    const firstVisibleTab = Array.from(tabs).find(tab => 
                        tab.style.display !== 'none' && !tab.classList.contains('hidden')
                    );
                    if (firstVisibleTab) {
                        switchAdminTab(firstVisibleTab.dataset.tab, {
                            loadOrders,
                            loadReservations,
                            loadSoldProducts,
                            loadStats,
                            loadPurchases
                        });
                    }
                }
            }).catch(error => {
                console.error('❌ Error updating admin tabs visibility:', error);
                // Продолжаем работу даже если обновление видимости не удалось
            });
        }
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        alert('Не удалось загрузить настройки магазина: ' + error.message);
    }
}
// ========== END REFACTORING STEP 2.3 ==========

// ========== REFACTORING STEP 2.4: switchAdminTab ==========
/**
 * Переключение вкладок админки
 * @param {string} tabName - Название вкладки ('orders', 'reservations', 'sold', 'stats', 'purchases')
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadOrders - Функция загрузки заказов
 * @param {Function} dependencies.loadReservations - Функция загрузки резерваций
 * @param {Function} dependencies.loadSoldProducts - Функция загрузки проданных товаров
 * @param {Function} dependencies.loadStats - Функция загрузки статистики
 * @param {Function} dependencies.loadPurchases - Функция загрузки покупок
 */
export function switchAdminTab(tabName, dependencies) {
    const {
        loadOrders,
        loadReservations,
        loadSoldProducts,
        loadStats,
        loadPurchases
    } = dependencies;
    
    const tabs = document.querySelectorAll('.admin-tab');
    const tabContents = document.querySelectorAll('.admin-tab-content');
    
    // Проверяем, что вкладка видима перед переключением
    const targetTab = Array.from(tabs).find(tab => tab.dataset.tab === tabName);
    if (targetTab && (targetTab.style.display === 'none' || targetTab.classList.contains('hidden'))) {
        console.warn(`⚠️ Cannot switch to hidden tab: ${tabName}`);
        // Переключаемся на первую видимую вкладку
        const firstVisibleTab = Array.from(tabs).find(tab => 
            tab.style.display !== 'none' && !tab.classList.contains('hidden')
        );
        if (firstVisibleTab) {
            console.log(`📊 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
            switchAdminTab(firstVisibleTab.dataset.tab, dependencies);
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
    
    tabContents.forEach(content => {
        if (content.id === `admin-tab-${tabName}`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Если переключились на вкладку "Заказы", загружаем данные
    if (tabName === 'orders') {
        loadOrders();
    }
    
    // Если переключились на вкладку "Резервации", загружаем данные
    if (tabName === 'reservations') {
        loadReservations();
    }
    
    // Если переключились на вкладку "Проданные", загружаем данные
    if (tabName === 'sold') {
        loadSoldProducts();
    }
    
    // Если переключились на вкладку "Статистика", загружаем данные
    if (tabName === 'stats') {
        loadStats();
    }
    
    // Если переключились на вкладку "Покупки", загружаем данные
    if (tabName === 'purchases') {
        loadPurchases();
    }
}
// ========== END REFACTORING STEP 2.4 ==========

