// Модуль админки магазина
import { API_BASE, getAllPurchasesAPI, getProductViewStatsAPI, getShopSettings, getVisitStatsAPI, getVisitsListAPI, updatePurchaseStatusAPI } from './api.js';
// ========== REFACTORING STEP 1.1: showNotification ==========
// ========== REFACTORING STEP 1.2: getCurrentShopSettings ==========
// ========== REFACTORING STEP 1.3: loadShopSettings ==========
import { getCurrentShopSettings as getCurrentShopSettingsUtil, loadShopSettings as loadShopSettingsUtil, showNotification } from './utils/admin_utils.js';
// ========== END REFACTORING STEP 1.1 ==========
// ========== END REFACTORING STEP 1.2 ==========
// ========== END REFACTORING STEP 1.3 ==========
// ========== REFACTORING STEP 2.1: initAdmin ==========
// ========== REFACTORING STEP 2.2: createAdminModal ==========
// ========== REFACTORING STEP 2.3: openAdmin ==========
// ========== REFACTORING STEP 2.4: switchAdminTab ==========
import { createAdminModal as createAdminModalHandler, initAdmin as initAdminHandler, openAdmin as openAdminHandler, switchAdminTab as switchAdminTabHandler } from './handlers/admin_init.js';
// ========== END REFACTORING STEP 2.1 ==========
// ========== END REFACTORING STEP 2.2 ==========
// ========== END REFACTORING STEP 2.3 ==========
// ========== END REFACTORING STEP 2.4 ==========
// ========== REFACTORING STEP 3.1: handleQuantityEnabledToggle ==========
// ========== REFACTORING STEP 3.2: handleReservationsToggle ==========
// ========== REFACTORING STEP 3.3: checkAllProductsMadeToOrder ==========
// ========== REFACTORING STEP 3.4: handleAllProductsMadeToOrderToggle ==========
import { checkAllProductsMadeToOrder as checkAllProductsMadeToOrderHandler, handleAllProductsMadeToOrderToggle as handleAllProductsMadeToOrderToggleHandler, handleQuantityEnabledToggle as handleQuantityEnabledToggleHandler, handleReservationsToggle as handleReservationsToggleHandler } from './handlers/admin_settings.js';
// ========== END REFACTORING STEP 3.1 ==========
// ========== END REFACTORING STEP 3.2 ==========
// ========== END REFACTORING STEP 3.3 ==========
// ========== END REFACTORING STEP 3.4 ==========
// ========== REFACTORING STEP 4.1: loadOrders ==========
import { loadOrders as loadOrdersHandler } from './handlers/admin_orders.js';
// ========== END REFACTORING STEP 4.1 ==========
// ========== REFACTORING STEP 6.1: loadSoldProducts ==========
import { loadSoldProducts as loadSoldProductsHandler } from './handlers/admin_sold.js';
// ========== END REFACTORING STEP 6.1 ==========

let adminModal = null;
let reservationsToggle = null;
let quantityEnabledToggle = null;
let allProductsMadeToOrderToggle = null;
let shopSettings = null;

// ========== REFACTORING STEP 4.1: loadOrders ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_orders.js' и обернута для передачи зависимостей
async function loadOrders() {
    console.log('🔄 [REFACTORING STEP 4.1] loadOrders called via wrapper');
    return await loadOrdersHandler({
        loadOrders: loadOrders // Передаем саму себя для рекурсивных вызовов
    });
}
// ========== END REFACTORING STEP 4.1 ==========

// ========== REFACTORING STEP 6.1: loadSoldProducts ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_sold.js' и обернута для передачи зависимостей
async function loadSoldProducts() {
    console.log('🔄 [REFACTORING STEP 6.1] loadSoldProducts called via wrapper');
    return await loadSoldProductsHandler({
        loadSoldProducts: loadSoldProducts // Передаем саму себя для рекурсивных вызовов
    });
}
// ========== END REFACTORING STEP 6.1 ==========

// ========== REFACTORING STEP 2.4: switchAdminTab ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_init.js' и обернута для передачи зависимостей
function switchAdminTab(tabName) {
    return switchAdminTabHandler(tabName, {
        loadOrders,
        loadSoldProducts,
        loadStats,
        loadPurchases
    });
}
// ========== END REFACTORING STEP 2.4 ==========

// ========== REFACTORING STEP 3.1: handleQuantityEnabledToggle ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_settings.js' и обернута для передачи зависимостей
async function handleQuantityEnabledToggle(enabled) {
    console.log('🔄 [REFACTORING STEP 3.1] handleQuantityEnabledToggle called via wrapper');
    return handleQuantityEnabledToggleHandler(enabled, {
        getShopSettings: () => shopSettings,
        setShopSettings: (val) => { shopSettings = val; },
        getReservationsToggle: () => reservationsToggle,
        getQuantityEnabledToggle: () => quantityEnabledToggle
    });
}
// ========== END REFACTORING STEP 3.1 ==========

// ========== REFACTORING STEP 3.2: handleReservationsToggle ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_settings.js' и обернута для передачи зависимостей
async function handleReservationsToggle(enabled) {
    console.log('🔄 [REFACTORING STEP 3.2] handleReservationsToggle called via wrapper');
    return handleReservationsToggleHandler(enabled, {
        getShopSettings: () => shopSettings,
        setShopSettings: (val) => { shopSettings = val; },
        getReservationsToggle: () => reservationsToggle
    });
}
// ========== END REFACTORING STEP 3.2 ==========

// ========== REFACTORING STEP 3.3: checkAllProductsMadeToOrder ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_settings.js' и используется напрямую (не требует зависимостей)
const checkAllProductsMadeToOrder = async (...args) => {
    console.log('🔄 [REFACTORING STEP 3.3] checkAllProductsMadeToOrder called via wrapper');
    return checkAllProductsMadeToOrderHandler(...args);
};
// ========== END REFACTORING STEP 3.3 ==========

// ========== REFACTORING STEP 3.4: handleAllProductsMadeToOrderToggle ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_settings.js' и обернута для передачи зависимостей
async function handleAllProductsMadeToOrderToggle(enabled) {
    console.log('🔄 [REFACTORING STEP 3.4] handleAllProductsMadeToOrderToggle called via wrapper');
    return handleAllProductsMadeToOrderToggleHandler(enabled, {
        getAllProductsMadeToOrderToggle: () => allProductsMadeToOrderToggle
    });
}
// ========== END REFACTORING STEP 3.4 ==========

// ========== REFACTORING STEP 2.1: initAdmin ==========
// ========== REFACTORING STEP 2.2: createAdminModal ==========
// НОВЫЙ КОД (используется сейчас)
// Функции импортированы из './handlers/admin_init.js' и обернуты для передачи зависимостей
export function initAdmin() {
    initAdminHandler({
        createAdminModal: createAdminModalHandler,
        handleQuantityEnabledToggle,
        handleReservationsToggle,
        handleAllProductsMadeToOrderToggle,
        switchAdminTab,
        setAdminModal: (val) => { adminModal = val; },
        setReservationsToggle: (val) => { reservationsToggle = val; },
        setQuantityEnabledToggle: (val) => { quantityEnabledToggle = val; },
        setAllProductsMadeToOrderToggle: (val) => { allProductsMadeToOrderToggle = val; }
    });
}

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
export function initAdmin() {
    console.log('🔧 Initializing admin panel...');
    
    // Создаем модальное окно админки, если его еще нет
    if (!document.getElementById('admin-modal')) {
        createAdminModal();
    }
    
    adminModal = document.getElementById('admin-modal');
    reservationsToggle = document.getElementById('reservations-toggle');
    quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
    allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
    
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
*/
// ========== END REFACTORING STEP 2.1 ==========

// ========== REFACTORING STEP 2.2: createAdminModal ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_init.js' (см. импорты в начале файла)

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
function createAdminModal() {
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
*/
// ========== END REFACTORING STEP 2.2 ==========

// ========== REFACTORING STEP 2.3: openAdmin ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './handlers/admin_init.js' и обернута для передачи зависимостей
export async function openAdmin() {
    return await openAdminHandler({
        initAdmin,
        getShopSettings,
        checkAllProductsMadeToOrder,
        switchAdminTab,
        getAdminModal: () => adminModal,
        setAdminModal: (val) => { adminModal = val; },
        getReservationsToggle: () => reservationsToggle,
        setReservationsToggle: (val) => { reservationsToggle = val; },
        getQuantityEnabledToggle: () => quantityEnabledToggle,
        setQuantityEnabledToggle: (val) => { quantityEnabledToggle = val; },
        getAllProductsMadeToOrderToggle: () => allProductsMadeToOrderToggle,
        setAllProductsMadeToOrderToggle: (val) => { allProductsMadeToOrderToggle = val; },
        setShopSettings: (val) => { shopSettings = val; }
    });
}

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
export async function openAdmin() {
    console.log('🔧 Opening admin panel...');
    
    if (!adminModal) {
        initAdmin();
    } else {
        // Переинициализируем ссылки на тумблеры на случай, если модальное окно уже существует
        reservationsToggle = document.getElementById('reservations-toggle');
        quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
        allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
    }
    
    try {
        // Загружаем текущие настройки
        shopSettings = await getShopSettings();
        console.log('✅ Shop settings loaded:', shopSettings);
        
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
        adminModal.style.display = 'block';
        
        // Убеждаемся, что активна вкладка "Настройки"
        switchAdminTab('settings');
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        alert('Не удалось загрузить настройки магазина: ' + error.message);
    }
}
*/
// ========== END REFACTORING STEP 2.3 ==========

// ========== REFACTORING STEP 3.1: handleQuantityEnabledToggle ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обработка изменения переключателя количества товаров
async function handleQuantityEnabledToggle(enabled) {
    console.log(`🔧 Toggling quantity enabled: ${enabled}`);
    
    try {
        // Обновляем только quantity_enabled (резервация может работать независимо)
        const updateData = {
            quantity_enabled: enabled
        };
        
        shopSettings = await updateShopSettings(updateData);
        console.log('✅ Shop settings updated:', shopSettings);
        
        // Обновляем состояние тумблера резервации (не блокируем его, если quantity_enabled выключен)
        // Резервация может работать и без показа количества
        if (reservationsToggle) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
            // Не блокируем тумблер резервации, даже если quantity_enabled выключен
            // reservationsToggle.disabled = !enabled;
        }
        
        // Показываем уведомление об успешном обновлении
        const statusText = enabled ? 'включен' : 'отключен';
        showNotification(`Показ количества товаров ${statusText}`);
        
        // Обновляем заголовок с названием магазина (если оно изменилось)
        if (typeof window.updateShopNameInHeader === 'function') {
            await window.updateShopNameInHeader();
        }
        
        // Перезагружаем данные для обновления UI
        if (typeof window.loadData === 'function') {
            setTimeout(() => {
                window.loadData();
            }, 300);
        }
    } catch (error) {
        console.error('❌ Error updating shop settings:', error);
        
        // Возвращаем переключатель в исходное состояние
        if (quantityEnabledToggle) {
            quantityEnabledToggle.checked = !enabled;
        }
        
        alert('Не удалось обновить настройки: ' + error.message);
    }
}
*/
// ========== END REFACTORING STEP 3.1 ==========

// ========== REFACTORING STEP 3.2: handleReservationsToggle ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обработка изменения переключателя резервации
async function handleReservationsToggle(enabled) {
    console.log(`🔧 Toggling reservations: ${enabled}`);
    
    // Резервация может работать независимо от quantity_enabled
    // Если quantity_enabled = false, резервация работает, но без выбора количества
    
    try {
        shopSettings = await updateShopSettings({
            reservations_enabled: enabled
        });
        console.log('✅ Shop settings updated:', shopSettings);
        
        // Показываем уведомление об успешном обновлении
        const statusText = enabled ? 'включена' : 'отключена';
        showNotification(`Резервация товаров ${statusText}`);
        
        // Обновляем заголовок с названием магазина (если оно изменилось)
        if (typeof window.updateShopNameInHeader === 'function') {
            await window.updateShopNameInHeader();
        }
        
        // Обновляем UI товаров (скрываем/показываем кнопки резервации)
        updateProductsUI(enabled);
    } catch (error) {
        console.error('❌ Error updating shop settings:', error);
        
        // Возвращаем переключатель в исходное состояние
        if (reservationsToggle) {
            reservationsToggle.checked = !enabled;
        }
        
        alert('Не удалось обновить настройки: ' + error.message);
    }
}
*/
// ========== END REFACTORING STEP 3.2 ==========

// ========== REFACTORING STEP 3.3: checkAllProductsMadeToOrder ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Проверка состояния товаров (все ли они под заказ)
async function checkAllProductsMadeToOrder() {
    try {
        // Получаем контекст для определения shop_owner_id и bot_id
        let shopOwnerId = null;
        let botId = null;
        
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
                botId = context.bot_id || null;
            }
        }
        
        if (!shopOwnerId) {
            console.warn('⚠️ Cannot check products state: shop_owner_id not found');
            return false;
        }
        
        // Загружаем товары
        const products = await fetchProducts(shopOwnerId, null, botId);
        
        if (!products || products.length === 0) {
            return false;
        }
        
        // Проверяем, все ли активные товары под заказ
        const activeProducts = products.filter(p => !p.is_sold);
        if (activeProducts.length === 0) {
            return false;
        }
        
        const allMadeToOrder = activeProducts.every(p => p.is_made_to_order === true);
        console.log(`📊 Products state check: ${activeProducts.length} active products, all made-to-order: ${allMadeToOrder}`);
        
        return allMadeToOrder;
    } catch (error) {
        console.error('❌ Error checking products state:', error);
        return false;
    }
}
*/
// ========== END REFACTORING STEP 3.3 ==========

// ========== REFACTORING STEP 3.4: handleAllProductsMadeToOrderToggle ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обработка изменения переключателя "Все товары под заказ"
async function handleAllProductsMadeToOrderToggle(enabled) {
    console.log(`🔧 Toggling all products made-to-order: ${enabled}`);
    
    try {
        const result = await bulkUpdateAllProductsMadeToOrderAPI(enabled);
        console.log('✅ All products made-to-order updated:', result);
        
        // Показываем уведомление об успешном обновлении
        const statusText = enabled ? 'установлены как "под заказ"' : 'сняты со статуса "под заказ"';
        showNotification(`✅ ${result.updated_count} товаров ${statusText}`);
        
        // Тумблер остается в том состоянии, в которое его переключили
        // Не выключаем его автоматически
        
        // Перезагружаем данные для обновления UI
        if (typeof window.loadData === 'function') {
            setTimeout(() => {
                window.loadData();
            }, 300);
        }
    } catch (error) {
        console.error('❌ Error updating all products made-to-order:', error);
        
        // Возвращаем переключатель в исходное состояние при ошибке
        if (allProductsMadeToOrderToggle) {
            allProductsMadeToOrderToggle.checked = !enabled;
        }
        
        alert('Не удалось обновить товары: ' + error.message);
    }
}
*/
// ========== END REFACTORING STEP 3.4 ==========

// ========== REFACTORING STEP 3.5: updateProductsUI ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Обновление UI товаров в зависимости от настройки резервации
function updateProductsUI(reservationsEnabled) {
    // Обновляем кнопки резервации в модальном окне товара
    const reserveButtons = document.querySelectorAll('.reserve-btn:not(.cancel-reservation-btn)');
    reserveButtons.forEach(btn => {
        if (reservationsEnabled) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    });
    
    // Перезагружаем данные для обновления UI
    if (typeof window.loadData === 'function') {
        setTimeout(() => {
            window.loadData();
        }, 300);
    }
}
*/
// ========== END REFACTORING STEP 3.5 ==========

// ========== REFACTORING STEP 1.1: showNotification ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './utils/admin_utils.js' (см. импорты в начале файла)

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
function showNotification(message) {
    // Создаем временное уведомление
    const notification = document.createElement('div');
    notification.className = 'admin-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}
*/
// ========== END REFACTORING STEP 1.1 ==========

// ========== REFACTORING STEP 1.2: getCurrentShopSettings ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './utils/admin_utils.js' и обернута для доступа к shopSettings
export function getCurrentShopSettings() {
    return getCurrentShopSettingsUtil(() => shopSettings);
}

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
export function getCurrentShopSettings() {
    return shopSettings;
}
*/
// ========== END REFACTORING STEP 1.2 ==========

// ========== REFACTORING STEP 1.3: loadShopSettings ==========
// НОВЫЙ КОД (используется сейчас)
// Функция импортирована из './utils/admin_utils.js' и обернута для доступа к shopSettings
export async function loadShopSettings(shopOwnerId = null) {
    return await loadShopSettingsUtil(
        getShopSettings,
        (settings) => { shopSettings = settings; },
        shopOwnerId
    );
}

// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
export async function loadShopSettings(shopOwnerId = null) {
    try {
        shopSettings = await getShopSettings(shopOwnerId);
        console.log('✅ Shop settings loaded:', shopSettings);
        return shopSettings;
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        // Возвращаем дефолтные настройки при ошибке
        return { reservations_enabled: true, quantity_enabled: true };
    }
}
*/
// ========== END REFACTORING STEP 1.3 ==========

// ========== REFACTORING STEP 2.4: switchAdminTab ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
function switchAdminTab(tabName) {
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
*/
// ========== END REFACTORING STEP 2.4 ==========

// ========== REFACTORING STEP 4.1: loadOrders ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
// Загрузка заказов
async function loadOrders() {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;
    
    ordersList.innerHTML = '<p class="loading">Загрузка заказов...</p>';
    
    try {
        const orders = await getShopOrdersAPI();
        
        if (!orders || orders.length === 0) {
            ordersList.innerHTML = '<p class="loading">Заказов пока нет</p>';
            return;
        }
        
        // Рендерим список заказов
        ordersList.innerHTML = '';
        
        // Добавляем панель управления (выбрать все, удалить выбранные)
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 12px;
            background: var(--bg-glass, rgba(28, 28, 30, 0.8));
            backdrop-filter: blur(20px);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.id = 'select-all-orders';
        selectAllCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        
        const selectAllLabel = document.createElement('label');
        selectAllLabel.htmlFor = 'select-all-orders';
        selectAllLabel.textContent = 'Выбрать все';
        selectAllLabel.style.cssText = 'font-size: 14px; color: var(--tg-theme-text-color); cursor: pointer;';
        
        selectAllDiv.appendChild(selectAllCheckbox);
        selectAllDiv.appendChild(selectAllLabel);
        
        const deleteSelectedBtn = document.createElement('button');
        deleteSelectedBtn.textContent = '🗑️ Удалить выбранные';
        deleteSelectedBtn.style.cssText = `
            padding: 6px 12px;
            background: rgba(255, 59, 48, 0.2);
            color: rgb(255, 59, 48);
            border: 1px solid rgba(255, 59, 48, 0.5);
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
            display: none;
        `;
        
        controlsDiv.appendChild(selectAllDiv);
        controlsDiv.appendChild(deleteSelectedBtn);
        ordersList.appendChild(controlsDiv);
        
        // Обработчик "Выбрать все"
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.order-item-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateDeleteButtonVisibility();
        });
        
        // Обработчик удаления выбранных
        deleteSelectedBtn.addEventListener('click', async () => {
            const selectedCheckboxes = document.querySelectorAll('.order-item-checkbox:checked');
            if (selectedCheckboxes.length === 0) {
                alert('❌ Выберите заказы для удаления');
                return;
            }
            
            const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.orderId));
            const count = selectedIds.length;
            
            if (!confirm(`Удалить ${count} ${count === 1 ? 'заказ' : count < 5 ? 'заказа' : 'заказов'}? Это действие нельзя отменить.`)) {
                return;
            }
            
            try {
                await deleteOrdersAPI(selectedIds);
                alert(`✅ Удалено ${count} ${count === 1 ? 'заказ' : count < 5 ? 'заказа' : 'заказов'}`);
                await loadOrders(); // Перезагружаем список
            } catch (error) {
                console.error('Error deleting orders:', error);
                alert(`❌ Ошибка при удалении: ${error.message}`);
            }
        });
        
        // Функция обновления видимости кнопки удаления
        function updateDeleteButtonVisibility() {
            const selectedCheckboxes = document.querySelectorAll('.order-item-checkbox:checked');
            if (selectedCheckboxes.length > 0) {
                deleteSelectedBtn.style.display = 'block';
            } else {
                deleteSelectedBtn.style.display = 'none';
            }
        }
        
        orders.forEach(order => {
            // Логируем данные заказа для отладки
            console.log('📦 Order data:', {
                id: order.id,
                product_id: order.product_id,
                ordered_by_user_id: order.ordered_by_user_id,
                quantity: order.quantity,
                first_name: order.first_name,
                last_name: order.last_name,
                phone_number: order.phone_number,
                email: order.email,
                delivery_method: order.delivery_method,
                notes: order.notes,
                promo_code: order.promo_code
            });
            
            const orderItem = document.createElement('div');
            orderItem.className = 'order-item';
            orderItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 8px;
                position: relative;
            `;
            
            // Чекбокс и название в одной строке
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
            
            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';
            
            // Чекбокс для выбора
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'order-item-checkbox';
            checkbox.dataset.orderId = order.id;
            checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
            checkbox.addEventListener('change', () => {
                updateDeleteButtonVisibility();
                // Обновляем состояние "Выбрать все"
                const allCheckboxes = document.querySelectorAll('.order-item-checkbox');
                const checkedCount = document.querySelectorAll('.order-item-checkbox:checked').length;
                selectAllCheckbox.checked = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;
            });
            
            // Название товара
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--tg-theme-text-color); flex: 1;';
            if (order.product && order.product.name) {
                nameDiv.textContent = order.product.name;
            } else {
                nameDiv.textContent = `Товар #${order.product_id}`;
            }
            
            leftDiv.appendChild(checkbox);
            leftDiv.appendChild(nameDiv);
            
            headerDiv.appendChild(leftDiv);
            
            // Кнопка удаления - в нижнем правом углу
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 8px;
                padding: 4px 8px;
                background: rgba(255, 59, 48, 0.2);
                color: rgb(255, 59, 48);
                border: 1px solid rgba(255, 59, 48, 0.5);
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                min-width: 28px;
                min-height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            deleteBtn.title = 'Удалить заказ';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const productName = order.product && order.product.name ? order.product.name : `Товар #${order.product_id}`;
                if (!confirm(`Удалить заказ "${productName}"? Это действие нельзя отменить.`)) {
                    return;
                }
                
                try {
                    await deleteOrderAPI(order.id);
                    alert('✅ Заказ удален');
                    await loadOrders(); // Перезагружаем список
                } catch (error) {
                    console.error('Error deleting order:', error);
                    alert(`❌ Ошибка при удалении: ${error.message}`);
                }
            });
            
            orderItem.appendChild(deleteBtn);
            
            // Информация о заказе
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
            
            // Количество
            const quantityDiv = document.createElement('div');
            quantityDiv.style.cssText = 'font-size: 14px; color: var(--tg-theme-hint-color);';
            quantityDiv.textContent = `Количество: ${order.quantity} шт.`;
            
            // Дата заказа
            const dateDiv = document.createElement('div');
            dateDiv.style.cssText = 'font-size: 13px; color: var(--tg-theme-hint-color);';
            if (order.created_at) {
                const orderDate = new Date(order.created_at);
                dateDiv.textContent = `Дата заказа: ${orderDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;
            }
            
            // Статус
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'font-size: 14px; font-weight: 600;';
            if (order.is_completed) {
                statusDiv.textContent = '✅ Выполнен';
                statusDiv.style.color = '#4CAF50';
            } else if (order.is_cancelled) {
                statusDiv.textContent = '❌ Отменен';
                statusDiv.style.color = '#F44336';
            } else {
                statusDiv.textContent = '⏳ Ожидание';
                statusDiv.style.color = '#FFA500';
            }
            
            // Добавляем основные элементы в правильном порядке
            infoDiv.appendChild(quantityDiv);
            infoDiv.appendChild(dateDiv);
            infoDiv.appendChild(statusDiv);
            
            // Ссылка на Telegram пользователя
            if (order.ordered_by_user_id) {
                const userId = order.ordered_by_user_id;
                const telegramLink = document.createElement('button');
                telegramLink.type = 'button';
                telegramLink.style.cssText = 'font-size: 14px; color: var(--tg-theme-button-color, #5ac8fa); text-decoration: none; margin-top: 8px; display: inline-block; font-weight: 500; padding: 8px 16px; background: rgba(90, 200, 250, 0.15); border-radius: 8px; border: 1px solid rgba(90, 200, 250, 0.3); cursor: pointer; width: 100%; text-align: center; box-sizing: border-box;';
                telegramLink.textContent = `👤 Написать в Telegram`;
                
                // Обработчик клика - получаем username и открываем через https://t.me/username
                telegramLink.addEventListener('click', async function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('📱 Opening Telegram chat for user:', userId);
                    
                    // Показываем индикатор загрузки
                    telegramLink.disabled = true;
                    telegramLink.style.opacity = '0.6';
                    telegramLink.textContent = '⏳ Загрузка...';
                    
                    try {
                        // Получаем username через API
                        const { getUserUsernameAPI } = await import('./api.js');
                        const userData = await getUserUsernameAPI(userId);
                        const username = userData.username;
                        
                        let telegramUrl;
                        if (username) {
                            // Если есть username, используем https://t.me/username - это работает через браузер
                            telegramUrl = `https://t.me/${username}`;
                            console.log('📱 Using username link:', telegramUrl);
                        } else {
                            // Если username нет, используем tg://user?id=...
                            telegramUrl = `tg://user?id=${userId}`;
                            console.log('📱 Using user ID link:', telegramUrl);
                        }
                        
                        // В Telegram WebView используем openLink для открытия ссылки
                        if (window.Telegram && window.Telegram.WebApp) {
                            const webApp = window.Telegram.WebApp;
                            
                            // Метод openLink открывает ссылку через браузер/Telegram
                            if (typeof webApp.openLink === 'function') {
                                console.log('📱 Using Telegram.WebApp.openLink');
                                webApp.openLink(telegramUrl);
                                
                                // Восстанавливаем кнопку через небольшую задержку
                                setTimeout(() => {
                                    telegramLink.disabled = false;
                                    telegramLink.style.opacity = '1';
                                    telegramLink.textContent = '👤 Написать в Telegram';
                                }, 1000);
                                return;
                            }
                        }
                        
                        // Если API недоступен, открываем через window.open
                        console.log('📱 Fallback: Using window.open');
                        window.open(telegramUrl, '_blank');
                        
                        setTimeout(() => {
                            telegramLink.disabled = false;
                            telegramLink.style.opacity = '1';
                            telegramLink.textContent = '👤 Написать в Telegram';
                        }, 1000);
                    } catch (error) {
                        console.error('❌ Error opening Telegram chat:', error);
                        telegramLink.disabled = false;
                        telegramLink.style.opacity = '1';
                        telegramLink.textContent = '👤 Написать в Telegram';
                        alert('Ошибка при открытии чата. ID пользователя: ' + userId);
                    }
                }, { passive: false });
                
                infoDiv.appendChild(telegramLink);
            }
            
            // Расширенная информация о заказе
            const detailsList = [];
            
            if (order.first_name || order.last_name) {
                const fullName = `${order.first_name || ''} ${order.last_name || ''} ${order.middle_name || ''}`.trim();
                if (fullName) {
                    detailsList.push(`<div style="margin-bottom: 6px;"><strong>👤 Имя:</strong> ${fullName}</div>`);
                }
            }
            
            if (order.phone_number) {
                const phone = `${order.phone_country_code || ''}${order.phone_number}`.trim();
                if (phone) {
                    detailsList.push(`<div style="margin-bottom: 6px;"><strong>📱 Телефон:</strong> ${phone}</div>`);
                }
            }
            
            if (order.email) {
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>📧 Email:</strong> ${order.email}</div>`);
            }
            
            if (order.delivery_method) {
                const deliveryText = order.delivery_method === 'delivery' ? '🚚 Доставка' : '🏪 Самовывоз';
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>📦 Способ получения:</strong> ${deliveryText}</div>`);
            }
            
            if (order.notes) {
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>📝 Примечание:</strong> ${order.notes}</div>`);
            }
            
            if (order.promo_code) {
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>🎟️ Промокод:</strong> ${order.promo_code}</div>`);
            }
            
            if (detailsList.length > 0) {
                const detailsDiv = document.createElement('div');
                detailsDiv.style.cssText = 'margin-top: 12px; padding: 12px; background: rgba(90, 200, 250, 0.1); border-radius: 8px; font-size: 13px; color: var(--tg-theme-text-color); border: 1px solid rgba(90, 200, 250, 0.2);';
                detailsDiv.innerHTML = '<div style="font-weight: 600; margin-bottom: 8px; color: var(--tg-theme-button-color, #5ac8fa);">📋 Детали заказа:</div>' + detailsList.join('');
                infoDiv.appendChild(detailsDiv);
            }
            
            // Кнопки действий (только для невыполненных заказов)
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display: flex; gap: 6px; margin-top: 6px; justify-content: flex-start; flex-wrap: wrap; max-width: 100%;';
            
            if (!order.is_completed && !order.is_cancelled) {
                // Кнопка "Выполнить" - в стиле Liquid Glass
                const completeBtn = document.createElement('button');
                completeBtn.className = 'reserve-btn';
                completeBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(76, 175, 80, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                completeBtn.textContent = '✅ Выполнить';
                completeBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(76, 175, 80, 0.3)';
                };
                completeBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(76, 175, 80, 0.2)';
                };
                completeBtn.onclick = async () => {
                    if (confirm('Выполнить этот заказ?')) {
                        try {
                            await completeOrderAPI(order.id);
                            showNotification('Заказ выполнен');
                            loadOrders(); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                // Кнопка "Отменить" - в стиле Liquid Glass
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'reserve-btn';
                cancelBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(244, 67, 54, 0.2) 0%, rgba(244, 67, 54, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(244, 67, 54, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                cancelBtn.textContent = '❌ Отменить';
                cancelBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(244, 67, 54, 0.3)';
                };
                cancelBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(244, 67, 54, 0.2)';
                };
                cancelBtn.onclick = async () => {
                    if (confirm('Отменить этот заказ? Заказ будет удален из списка.')) {
                        try {
                            await cancelOrderAPI(order.id);
                            showNotification('Заказ отменен');
                            loadOrders(); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                actionsDiv.appendChild(completeBtn);
                actionsDiv.appendChild(cancelBtn);
            }
            
            orderItem.appendChild(headerDiv);
            orderItem.appendChild(infoDiv);
            if (actionsDiv.children.length > 0) {
                orderItem.appendChild(actionsDiv);
            }
            
            ordersList.appendChild(orderItem);
        });
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        ordersList.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}
*/
// ========== END REFACTORING STEP 4.1 ==========

// Загрузка проданных товаров
// ========== REFACTORING STEP 6.1: loadSoldProducts ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
/*
async function loadSoldProducts() {
    const soldProductsList = document.getElementById('sold-products-list');
    if (!soldProductsList) return;
    
    soldProductsList.innerHTML = '<p class="loading">Загрузка истории продаж...</p>';
    
    try {
        // Получаем shop_owner_id из глобального appContext
        let shopOwnerId = null;
        
        // Пытаемся получить из глобальной переменной appContext (экспортируется из app.js)
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
            }
        }
        
        // Если не получилось, пытаемся получить из URL
        if (!shopOwnerId) {
            const urlParams = new URLSearchParams(window.location.search);
            const shopOwnerIdParam = urlParams.get('user_id');
            if (shopOwnerIdParam) {
                shopOwnerId = parseInt(shopOwnerIdParam, 10);
            }
        }
        
        if (!shopOwnerId) {
            soldProductsList.innerHTML = '<p class="loading">Ошибка: не удалось определить владельца магазина</p>';
            return;
        }
        
        const soldProducts = await getSoldProductsAPI(shopOwnerId);
        
        if (!soldProducts || soldProducts.length === 0) {
            soldProductsList.innerHTML = '<p class="loading">История продаж пуста</p>';
            return;
        }
        
        // Рендерим список проданных товаров
        soldProductsList.innerHTML = '';
        
        // Добавляем панель управления (выбрать все, удалить выбранные)
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 12px;
            background: var(--bg-glass, rgba(28, 28, 30, 0.8));
            backdrop-filter: blur(20px);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.id = 'select-all-sold';
        selectAllCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        
        const selectAllLabel = document.createElement('label');
        selectAllLabel.htmlFor = 'select-all-sold';
        selectAllLabel.textContent = 'Выбрать все';
        selectAllLabel.style.cssText = 'font-size: 14px; color: var(--tg-theme-text-color); cursor: pointer;';
        
        selectAllDiv.appendChild(selectAllCheckbox);
        selectAllDiv.appendChild(selectAllLabel);
        
        const deleteSelectedBtn = document.createElement('button');
        deleteSelectedBtn.textContent = '🗑️ Удалить выбранные';
        deleteSelectedBtn.style.cssText = `
            padding: 6px 12px;
            background: rgba(255, 59, 48, 0.2);
            color: rgb(255, 59, 48);
            border: 1px solid rgba(255, 59, 48, 0.5);
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
            display: none;
        `;
        
        controlsDiv.appendChild(selectAllDiv);
        controlsDiv.appendChild(deleteSelectedBtn);
        soldProductsList.appendChild(controlsDiv);
        
        // Обработчик "Выбрать все"
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.sold-item-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateDeleteButtonVisibility();
        });
        
        // Обработчик удаления выбранных
        deleteSelectedBtn.addEventListener('click', async () => {
            const selectedCheckboxes = document.querySelectorAll('.sold-item-checkbox:checked');
            if (selectedCheckboxes.length === 0) {
                alert('❌ Выберите записи для удаления');
                return;
            }
            
            const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.soldId));
            const count = selectedIds.length;
            
            if (!confirm(`Удалить ${count} ${count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'}? Это действие нельзя отменить.`)) {
                return;
            }
            
            try {
                await deleteSoldProductsAPI(selectedIds, shopOwnerId);
                alert(`✅ Удалено ${count} ${count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'}`);
                await loadSoldProducts(); // Перезагружаем список
            } catch (error) {
                console.error('Error deleting sold products:', error);
                alert(`❌ Ошибка при удалении: ${error.message}`);
            }
        });
        
        // Функция обновления видимости кнопки удаления
        function updateDeleteButtonVisibility() {
            const selectedCheckboxes = document.querySelectorAll('.sold-item-checkbox:checked');
            if (selectedCheckboxes.length > 0) {
                deleteSelectedBtn.style.display = 'block';
            } else {
                deleteSelectedBtn.style.display = 'none';
            }
        }
        
        soldProducts.forEach(sold => {
            const soldItem = document.createElement('div');
            soldItem.className = 'sold-product-item';
            soldItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 6px;
                position: relative;
            `;
            
            // Чекбокс и название в одной строке
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
            
            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';
            
            // Чекбокс для выбора
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'sold-item-checkbox';
            checkbox.dataset.soldId = sold.id;
            checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
            checkbox.addEventListener('change', () => {
                updateDeleteButtonVisibility();
                // Обновляем состояние "Выбрать все"
                const allCheckboxes = document.querySelectorAll('.sold-item-checkbox');
                const checkedCount = document.querySelectorAll('.sold-item-checkbox:checked').length;
                selectAllCheckbox.checked = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;
            });
            
            // Название
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--tg-theme-text-color); flex: 1;';
            nameDiv.textContent = sold.name;
            
            leftDiv.appendChild(checkbox);
            leftDiv.appendChild(nameDiv);
            
            headerDiv.appendChild(leftDiv);
            
            // Кнопка удаления - в нижнем правом углу
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 8px;
                padding: 4px 8px;
                background: rgba(255, 59, 48, 0.2);
                color: rgb(255, 59, 48);
                border: 1px solid rgba(255, 59, 48, 0.5);
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                min-width: 28px;
                min-height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            deleteBtn.title = 'Удалить запись';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Удалить запись о продаже "${sold.name}"? Это действие нельзя отменить.`)) {
                    return;
                }
                
                try {
                    await deleteSoldProductAPI(sold.id, shopOwnerId);
                    alert('✅ Запись удалена');
                    await loadSoldProducts(); // Перезагружаем список
                } catch (error) {
                    console.error('Error deleting sold product:', error);
                    alert(`❌ Ошибка при удалении: ${error.message}`);
                }
            });
            
            soldItem.appendChild(deleteBtn);
            
            // Информация о продаже
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
            
            // Количество и цены
            const quantity = sold.quantity || 1;
            const unitPrice = sold.discount > 0 ? Math.round(sold.price * (1 - sold.discount / 100)) : sold.price;
            const totalPrice = unitPrice * quantity;
            
            // Количество
            const quantityDiv = document.createElement('div');
            quantityDiv.style.cssText = 'font-size: 14px; color: var(--tg-theme-text-color);';
            quantityDiv.textContent = `Количество: ${quantity} шт.`;
            
            // Цена за 1 шт
            const unitPriceDiv = document.createElement('div');
            unitPriceDiv.style.cssText = 'font-size: 14px; color: var(--tg-theme-hint-color);';
            if (sold.discount > 0) {
                unitPriceDiv.innerHTML = `Цена за 1 шт: <span style="text-decoration: line-through; margin-right: 6px;">${sold.price} ₽</span> <span style="color: var(--tg-theme-link-color); font-weight: 600;">${unitPrice} ₽</span>`;
            } else {
                unitPriceDiv.innerHTML = `Цена за 1 шт: <span style="color: var(--tg-theme-link-color); font-weight: 600;">${unitPrice} ₽</span>`;
            }
            
            // Общая цена
            const totalPriceDiv = document.createElement('div');
            totalPriceDiv.style.cssText = 'font-size: 18px; font-weight: 700; color: var(--tg-theme-link-color); margin-top: 4px;';
            if (sold.discount > 0) {
                const oldTotalPrice = sold.price * quantity;
                totalPriceDiv.innerHTML = `Общая цена: <span style="text-decoration: line-through; margin-right: 6px; font-size: 14px; color: var(--tg-theme-hint-color);">${oldTotalPrice} ₽</span> <span>${totalPrice} ₽</span>`;
            } else {
                totalPriceDiv.textContent = `Общая цена: ${totalPrice} ₽`;
            }
            
            // Дата продажи
            const dateDiv = document.createElement('div');
            dateDiv.style.cssText = 'font-size: 13px; color: var(--tg-theme-hint-color); margin-top: 4px;';
            if (sold.sold_at) {
                const soldDate = new Date(sold.sold_at);
                dateDiv.textContent = soldDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }) + ' ' + soldDate.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            
            infoDiv.appendChild(quantityDiv);
            infoDiv.appendChild(unitPriceDiv);
            infoDiv.appendChild(totalPriceDiv);
            infoDiv.appendChild(dateDiv);
            
            soldItem.appendChild(headerDiv);
            soldItem.appendChild(infoDiv);
            
            soldProductsList.appendChild(soldItem);
        });
    } catch (error) {
        console.error('❌ Error loading sold products:', error);
        let errorMessage = 'Ошибка загрузки проданных товаров';
        if (error.message) {
            // Если ошибка содержит детали, показываем их
            if (error.message.includes('detail')) {
                try {
                    const errorObj = JSON.parse(error.message);
                    errorMessage = errorObj.detail || errorMessage;
                } catch (e) {
                    errorMessage = error.message;
                }
            } else {
                errorMessage = error.message;
            }
        }
        soldProductsList.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}
*/
// ========== END REFACTORING STEP 6.1 ==========

// Загрузка статистики
async function loadStats() {
    const statsContent = document.getElementById('stats-content');
    if (!statsContent) return;
    
    statsContent.innerHTML = '<p class="loading">Загрузка статистики...</p>';
    
    try {
        // Загружаем общую статистику, список посещений и топ товаров параллельно
        const [stats, visits, topProducts] = await Promise.all([
            getVisitStatsAPI(),
            getVisitsListAPI(20, 0),
            getProductViewStatsAPI(10)
        ]);
        
        // Формируем HTML для статистики
        let html = `
            <div class="stats-section">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">📊 Общая статистика</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_visits}</div>
                        <div class="stat-label">Всего посещений</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.unique_visitors}</div>
                        <div class="stat-label">Уникальных посетителей</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.shop_visits}</div>
                        <div class="stat-label">Просмотров магазина</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.product_views}</div>
                        <div class="stat-label">Просмотров товаров</div>
                    </div>
                </div>
            </div>
        `;
        
        // Топ товаров
        if (topProducts && topProducts.length > 0) {
            html += `
                <div class="stats-section" style="margin-top: 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">🔥 Топ товаров по просмотрам</h3>
                    <div class="top-products-list">
            `;
            
            topProducts.forEach((product, index) => {
                html += `
                    <div class="top-product-item" style="
                        background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                        backdrop-filter: blur(20px);
                        border-radius: 12px;
                        padding: 12px 16px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <div style="
                                width: 32px;
                                height: 32px;
                                border-radius: 8px;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: 700;
                                font-size: 14px;
                                color: white;
                            ">${index + 1}</div>
                            <div style="flex: 1;">
                                <div style="font-size: 15px; font-weight: 600; color: var(--tg-theme-text-color); margin-bottom: 4px;">
                                    ${product.product_name}
                                </div>
                            </div>
                        </div>
                        <div style="
                            background: rgba(76, 175, 80, 0.2);
                            color: #4CAF50;
                            padding: 6px 12px;
                            border-radius: 8px;
                            font-weight: 600;
                            font-size: 14px;
                        ">
                            ${product.view_count} ${product.view_count === 1 ? 'просмотр' : product.view_count < 5 ? 'просмотра' : 'просмотров'}
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Последние посещения
        if (visits && visits.length > 0) {
            html += `
                <div class="stats-section" style="margin-top: 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">👥 Последние посещения</h3>
                    <div class="recent-visits-list">
            `;
            
            visits.slice(0, 10).forEach(visit => {
                const visitDate = new Date(visit.visited_at);
                const dateStr = visitDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                html += `
                    <div class="visit-item" style="
                        background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                        backdrop-filter: blur(20px);
                        border-radius: 12px;
                        padding: 12px 16px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div style="flex: 1;">
                            <div style="font-size: 14px; color: var(--tg-theme-text-color); margin-bottom: 4px;">
                                ${visit.product_name ? `📦 ${visit.product_name}` : '🏪 Просмотр магазина'}
                            </div>
                            <div style="font-size: 12px; color: var(--tg-theme-hint-color);">
                                ${dateStr}
                            </div>
                        </div>
                        <div style="
                            font-size: 12px;
                            color: var(--tg-theme-hint-color);
                            font-family: monospace;
                        ">
                            ID: ${visit.visitor_id}
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Если нет данных
        if (stats.total_visits === 0) {
            html = '<p class="loading">Статистика пока пуста. Посетители появятся здесь после просмотра вашего магазина.</p>';
        }
        
        statsContent.innerHTML = html;
    } catch (error) {
        console.error('❌ Error loading stats:', error);
        let errorMessage = 'Ошибка загрузки статистики';
        if (error.message) {
            errorMessage = error.message;
        }
        statsContent.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}

// Загрузка покупок
async function loadPurchases() {
    const purchasesList = document.getElementById('purchases-list');
    if (!purchasesList) return;
    
    purchasesList.innerHTML = '<p class="loading">Загрузка заявок на покупку...</p>';
    
    try {
        // Получаем shop_owner_id из глобального appContext
        let shopOwnerId = null;
        
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
            }
        }
        
        if (!shopOwnerId) {
            purchasesList.innerHTML = '<p class="loading">Ошибка: не удалось определить владельца магазина</p>';
            return;
        }
        
        const purchases = await getAllPurchasesAPI(shopOwnerId);
        
        console.log('[ADMIN PURCHASES] Loaded purchases:', purchases);
        
        if (!purchases || purchases.length === 0) {
            purchasesList.innerHTML = '<p class="loading">Заявок на покупку пока нет</p>';
            return;
        }
        
        // Рендерим список покупок
        purchasesList.innerHTML = '';
        
        purchases.forEach((purchase, purchaseIndex) => {
            console.log(`[ADMIN PURCHASES] Processing purchase ${purchaseIndex}:`, {
                id: purchase.id,
                images_urls: purchase.images_urls,
                video_url: purchase.video_url
            });
            const product = purchase.product;
            if (!product) {
                console.warn('⚠️ Purchase missing product:', purchase.id);
                return;
            }
            
            const purchaseItem = document.createElement('div');
            purchaseItem.className = 'order-item';
            purchaseItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            // Заголовок с названием товара
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
            
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--tg-theme-text-color); flex: 1;';
            nameDiv.textContent = product.name || `Товар #${purchase.product_id}`;
            
            headerDiv.appendChild(nameDiv);
            
            // Информация о покупке
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
            
            // Статус
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'font-size: 14px; font-weight: 600;';
            if (purchase.is_completed) {
                statusDiv.textContent = '✅ Выполнена';
                statusDiv.style.color = '#4CAF50';
            } else if (purchase.is_cancelled) {
                statusDiv.textContent = '❌ Отменена';
                statusDiv.style.color = '#F44336';
            } else {
                statusDiv.textContent = '⏳ Ожидание';
                statusDiv.style.color = '#FFA500';
            }
            
            // Дата создания
            const dateDiv = document.createElement('div');
            dateDiv.style.cssText = 'font-size: 13px; color: var(--tg-theme-hint-color);';
            if (purchase.created_at) {
                const purchaseDate = new Date(purchase.created_at);
                dateDiv.textContent = `Дата заявки: ${purchaseDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;
            }
            
            infoDiv.appendChild(statusDiv);
            infoDiv.appendChild(dateDiv);
            
            // Детали заявки
            const detailsList = [];
            
            const createDetailItem = (label, value) => {
                const div = document.createElement('div');
                div.style.cssText = 'margin-bottom: 6px;';
                const strong = document.createElement('strong');
                strong.textContent = label + ' ';
                div.appendChild(strong);
                div.appendChild(document.createTextNode(value));
                return div;
            };
            
            if (purchase.last_name || purchase.first_name || purchase.middle_name) {
                const fullName = `${purchase.last_name || ''} ${purchase.first_name || ''} ${purchase.middle_name || ''}`.trim();
                if (fullName) {
                    detailsList.push(createDetailItem('👤 Имя:', fullName));
                }
            }
            
            if (purchase.phone_number) {
                detailsList.push(createDetailItem('📱 Телефон:', purchase.phone_number));
            }
            
            if (purchase.city) {
                detailsList.push(createDetailItem('📍 Город:', purchase.city));
            }
            
            if (purchase.address) {
                detailsList.push(createDetailItem('🏠 Адрес:', purchase.address));
            }
            
            if (purchase.payment_method) {
                const paymentText = purchase.payment_method === 'cash' ? '💵 Наличные' : '🏦 Банковский перевод';
                detailsList.push(createDetailItem('💰 Форма оплаты:', paymentText));
            }
            
            if (purchase.organization) {
                detailsList.push(createDetailItem('🏢 Организация:', purchase.organization));
            }
            
            if (purchase.notes) {
                detailsList.push(createDetailItem('📝 Примечание:', purchase.notes));
            }
            
            // Превью фото
            if (purchase.images_urls && purchase.images_urls.length > 0) {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has ${purchase.images_urls.length} images:`, purchase.images_urls);
                
                const imagesContainer = document.createElement('div');
                imagesContainer.style.cssText = 'margin-bottom: 6px;';
                
                const imagesLabel = document.createElement('strong');
                imagesLabel.textContent = '📷 Фото:';
                imagesLabel.style.cssText = 'display: block; margin-bottom: 4px;';
                imagesContainer.appendChild(imagesLabel);
                
                const imagesWrapper = document.createElement('div');
                imagesWrapper.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;';
                
                purchase.images_urls.forEach((imgUrl, index) => {
                    // Backend возвращает относительные URL (/api/images/...)
                    // Нужно добавить API_BASE для получения полного URL
                    let fullUrl = imgUrl;
                    if (imgUrl && imgUrl.startsWith('/')) {
                        // Относительный URL - добавляем API_BASE
                        fullUrl = `${API_BASE}${imgUrl}`;
                    } else if (imgUrl && !imgUrl.startsWith('http')) {
                        // URL без протокола - добавляем API_BASE
                        fullUrl = `${API_BASE}/${imgUrl}`;
                    }
                    
                    console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Loading image from: ${fullUrl} (original: ${imgUrl})`);
                    
                    const imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'width: 60px; height: 60px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; position: relative;';
                    
                    const placeholder = document.createElement('div');
                    placeholder.textContent = '⏳';
                    placeholder.style.cssText = 'font-size: 20px; color: var(--text-hint);';
                    imgContainer.appendChild(placeholder);
                    
                    // Загружаем изображение через fetch для обхода блокировки Telegram WebView (как в карточке товара)
                    fetch(fullUrl, {
                        headers: {
                            'ngrok-skip-browser-warning': '69420'
                        }
                    })
                    .then(response => {
                        console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Response status: ${response.status}, headers:`, response.headers);
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Blob created, size: ${blob.size} bytes, type: ${blob.type}`);
                        const blobUrl = URL.createObjectURL(blob);
                        const img = document.createElement('img');
                        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                        img.alt = `Фото товара ${index + 1}`;
                        
                        img.onload = () => {
                            console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Image loaded successfully, dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                            // Удаляем placeholder только после успешной загрузки
                            if (placeholder.parentNode) {
                                placeholder.remove();
                            }
                        };
                        
                        img.onerror = (e) => {
                            console.error(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Image load error:`, e);
                            URL.revokeObjectURL(blobUrl);
                            placeholder.textContent = '📷';
                            placeholder.style.display = 'flex';
                            if (img.parentNode) {
                                img.remove();
                            }
                        };
                        
                        // Сначала добавляем img в контейнер, потом устанавливаем src (как в рабочем коде карточки товара)
                        imgContainer.appendChild(img);
                        // Устанавливаем src ПОСЛЕ добавления в DOM
                        img.src = blobUrl;
                    })
                    .catch(error => {
                        console.error(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Fetch error:`, error, 'URL:', fullUrl);
                        placeholder.textContent = '📷';
                        placeholder.style.display = 'flex';
                    });
                    
                    imagesWrapper.appendChild(imgContainer);
                });
                
                imagesContainer.appendChild(imagesWrapper);
                detailsList.push(imagesContainer);
            } else {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has no images_urls or empty array`);
            }
            
            // Превью видео
            if (purchase.video_url) {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has video:`, purchase.video_url);
                
                const videoContainer = document.createElement('div');
                videoContainer.style.cssText = 'margin-bottom: 6px;';
                
                const videoLabel = document.createElement('strong');
                videoLabel.textContent = '🎥 Видео:';
                videoLabel.style.cssText = 'display: block; margin-bottom: 4px;';
                videoContainer.appendChild(videoLabel);
                
                // Backend возвращает относительные URL (/api/images/...)
                // Нужно добавить API_BASE для получения полного URL
                let videoUrl = purchase.video_url;
                if (videoUrl && videoUrl.startsWith('/')) {
                    // Относительный URL - добавляем API_BASE
                    videoUrl = `${API_BASE}${videoUrl}`;
                } else if (videoUrl && !videoUrl.startsWith('http')) {
                    // URL без протокола - добавляем API_BASE
                    videoUrl = `${API_BASE}/${videoUrl}`;
                }
                
                console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Loading video from: ${videoUrl} (original: ${purchase.video_url})`);
                
                const videoWrapper = document.createElement('div');
                videoWrapper.style.cssText = 'margin-top: 4px;';
                
                const placeholder = document.createElement('div');
                placeholder.textContent = '⏳ Загрузка видео...';
                placeholder.style.cssText = 'padding: 20px; text-align: center; color: var(--text-hint); background: var(--bg-secondary); border-radius: 8px;';
                videoWrapper.appendChild(placeholder);
                
                // Загружаем видео через fetch для обхода блокировки Telegram WebView
                fetch(videoUrl, {
                    headers: {
                        'ngrok-skip-browser-warning': '69420'
                    }
                })
                .then(response => {
                    console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Response status: ${response.status}, headers:`, response.headers);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Blob created, size: ${blob.size} bytes, type: ${blob.type}`);
                    const blobUrl = URL.createObjectURL(blob);
                    const video = document.createElement('video');
                    video.controls = true;
                    video.style.cssText = 'max-width: 200px; max-height: 150px; border-radius: 8px; width: 100%;';
                    
                    video.onloadeddata = () => {
                        console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Video loaded successfully, duration: ${video.duration}s`);
                        // Удаляем placeholder только после успешной загрузки
                        if (placeholder.parentNode) {
                            placeholder.remove();
                        }
                    };
                    
                    video.onerror = (e) => {
                        console.error(`[ADMIN PURCHASE ${purchase.id} VIDEO] Video load error:`, e);
                        URL.revokeObjectURL(blobUrl);
                        placeholder.textContent = '❌ Ошибка загрузки видео';
                        placeholder.style.display = 'block';
                        if (video.parentNode) {
                            video.remove();
                        }
                    };
                    
                    // Сначала добавляем video в контейнер, потом устанавливаем src (как в рабочем коде)
                    videoWrapper.appendChild(video);
                    // Устанавливаем src ПОСЛЕ добавления в DOM
                    video.src = blobUrl;
                })
                .catch(error => {
                    console.error(`[ADMIN PURCHASE ${purchase.id} VIDEO] Fetch error:`, error, 'URL:', videoUrl);
                    placeholder.textContent = '❌ Ошибка загрузки видео';
                    placeholder.style.display = 'block';
                });
                
                videoContainer.appendChild(videoWrapper);
                detailsList.push(videoContainer);
            } else {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has no video_url`);
            }
            
            if (detailsList.length > 0) {
                const detailsDiv = document.createElement('div');
                detailsDiv.style.cssText = 'margin-top: 12px; padding: 12px; background: rgba(90, 200, 250, 0.1); border-radius: 8px; font-size: 13px; color: var(--tg-theme-text-color); border: 1px solid rgba(90, 200, 250, 0.2);';
                
                const detailsTitle = document.createElement('div');
                detailsTitle.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--tg-theme-button-color, #5ac8fa);';
                detailsTitle.textContent = '📋 Детали заявки:';
                detailsDiv.appendChild(detailsTitle);
                
                // Добавляем все элементы из detailsList
                detailsList.forEach(item => {
                    if (item instanceof HTMLElement) {
                        detailsDiv.appendChild(item);
                    }
                });
                
                infoDiv.appendChild(detailsDiv);
            }
            
            // Кнопки действий (только для невыполненных покупок)
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display: flex; gap: 6px; margin-top: 6px; justify-content: flex-start; flex-wrap: wrap; max-width: 100%;';
            
            if (!purchase.is_completed && !purchase.is_cancelled) {
                // Кнопка "Выполнить"
                const completeBtn = document.createElement('button');
                completeBtn.className = 'reserve-btn';
                completeBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(76, 175, 80, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                completeBtn.textContent = '✅ Выполнить';
                completeBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(76, 175, 80, 0.3)';
                };
                completeBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(76, 175, 80, 0.2)';
                };
                completeBtn.onclick = async () => {
                    if (confirm('Выполнить эту заявку на покупку?')) {
                        try {
                            await updatePurchaseStatusAPI(purchase.id, shopOwnerId, {
                                is_completed: true,
                                status: 'completed'
                            });
                            showNotification('Заявка на покупку выполнена');
                            loadPurchases(); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                // Кнопка "Отменить"
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'reserve-btn';
                cancelBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(244, 67, 54, 0.2) 0%, rgba(244, 67, 54, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(244, 67, 54, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                cancelBtn.textContent = '❌ Отменить';
                cancelBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(244, 67, 54, 0.3)';
                };
                cancelBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(244, 67, 54, 0.2)';
                };
                cancelBtn.onclick = async () => {
                    if (confirm('Отменить эту заявку на покупку?')) {
                        try {
                            await updatePurchaseStatusAPI(purchase.id, shopOwnerId, {
                                is_cancelled: true,
                                status: 'cancelled'
                            });
                            showNotification('Заявка на покупку отменена');
                            loadPurchases(); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                actionsDiv.appendChild(completeBtn);
                actionsDiv.appendChild(cancelBtn);
            }
            
            purchaseItem.appendChild(headerDiv);
            purchaseItem.appendChild(infoDiv);
            if (actionsDiv.children.length > 0) {
                purchaseItem.appendChild(actionsDiv);
            }
            
            purchasesList.appendChild(purchaseItem);
        });
    } catch (error) {
        console.error('❌ Error loading purchases:', error);
        let errorMessage = 'Ошибка загрузки заявок на покупку';
        if (error.message) {
            errorMessage = error.message;
        }
        purchasesList.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}

