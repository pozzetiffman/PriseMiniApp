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
    const adminClose = document.querySelector('.admin-close');
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
    
    // Настройка вкладок
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        tab.onclick = () => switchAdminTab(tab.dataset.tab);
    });
    
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
    
    modal.innerHTML = `
        <div class="admin-modal-content">
            <div class="admin-modal-header">
                <h2>⚙️ Настройки магазина</h2>
                <span class="admin-close">&times;</span>
            </div>
            <div class="admin-tabs">
                <button class="admin-tab active" data-tab="settings">
                    <span style="font-size: 18px;">⚙️</span>
                    <span>Настройки</span>
                </button>
                <button class="admin-tab" data-tab="orders">
                    <span style="font-size: 18px;">🛒</span>
                    <span>Заказы</span>
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
                <div id="admin-tab-settings" class="admin-tab-content active">
                    <div class="admin-setting">
                        <div class="admin-setting-label">
                            <label for="quantity-enabled-toggle">Показ количества товаров</label>
                            <p class="admin-setting-description">Показывать количество товаров в карточках и модальном окне. При отключении будет отображаться "В наличии" без указания числа.</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="quantity-enabled-toggle" checked>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="admin-setting">
                        <div class="admin-setting-label">
                            <label for="reservations-toggle">Резервация товаров</label>
                            <p class="admin-setting-description">Разрешить клиентам резервировать товары на определенное время. Работает независимо от показа количества.</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="reservations-toggle" checked>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="admin-setting">
                        <div class="admin-setting-label">
                            <label for="all-products-made-to-order-toggle">Все товары под заказ</label>
                            <p class="admin-setting-description">При включении все активные товары устанавливаются как "под заказ". При выключении статус "под заказ" снимается со всех активных товаров. Вы можете индивидуально изменять статус товаров в карточке товара - это не влияет на тумблер.</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="all-products-made-to-order-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="admin-info">
                        <p>💡 <strong>Как это работает:</strong><br>
                        • <strong>Показ количества включен:</strong> отображается точное количество товара (например, "В наличии: 5"). При резервации товара с количеством больше 1 можно выбрать, сколько единиц зарезервировать.<br>
                        • <strong>Показ количества выключен:</strong> отображается просто "В наличии" без числа. Резервация работает, но всегда резервируется 1 единица товара (выбор количества недоступен).</p>
                    </div>
                </div>
                <div id="admin-tab-orders" class="admin-tab-content">
                    <div id="orders-list" class="orders-list">
                        <p class="loading">Загрузка заказов...</p>
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
}
// ========== END REFACTORING STEP 2.2 ==========

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
            adminModal.style.display = 'flex';
            
            // Убеждаемся, что активна вкладка "Настройки"
            switchAdminTab('settings');
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
 * @param {string} tabName - Название вкладки ('settings', 'orders', 'sold', 'stats', 'purchases')
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadOrders - Функция загрузки заказов
 * @param {Function} dependencies.loadSoldProducts - Функция загрузки проданных товаров
 * @param {Function} dependencies.loadStats - Функция загрузки статистики
 * @param {Function} dependencies.loadPurchases - Функция загрузки покупок
 */
export function switchAdminTab(tabName, dependencies) {
    const {
        loadOrders,
        loadSoldProducts,
        loadStats,
        loadPurchases
    } = dependencies;
    
    const tabs = document.querySelectorAll('.admin-tab');
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
    
    // Если переключились на вкладку "Заказы", загружаем данные
    if (tabName === 'orders') {
        loadOrders();
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

