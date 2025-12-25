// Модуль админки магазина
import { getShopSettings, updateShopSettings, getSoldProductsAPI, getShopOrdersAPI, completeOrderAPI, cancelOrderAPI, deleteOrderAPI, deleteOrdersAPI, getVisitStatsAPI, getVisitsListAPI, getProductViewStatsAPI, deleteSoldProductAPI, deleteSoldProductsAPI, bulkUpdateAllProductsMadeToOrderAPI, fetchProducts } from './api.js';

let adminModal = null;
let reservationsToggle = null;
let quantityEnabledToggle = null;
let allProductsMadeToOrderToggle = null;
let shopSettings = null;

// Инициализация админки
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

// Создание модального окна админки
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
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Открытие админки
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

// Показ уведомления
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

// Получение текущих настроек (для использования в других модулях)
export function getCurrentShopSettings() {
    return shopSettings;
}

// Загрузка настроек магазина (для использования при инициализации)
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

// Переключение вкладок админки
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
}

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
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
            
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
            } else {
                statusDiv.textContent = '⏳ В обработке';
                statusDiv.style.color = '#FFA500';
            }
            
            infoDiv.appendChild(quantityDiv);
            infoDiv.appendChild(dateDiv);
            infoDiv.appendChild(statusDiv);
            
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

// Загрузка проданных товаров
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

