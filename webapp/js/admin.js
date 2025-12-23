// Модуль админки магазина
import { getShopSettings, updateShopSettings } from './api.js';

let adminModal = null;
let reservationsToggle = null;
let quantityEnabledToggle = null;
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
            <div class="admin-modal-body">
                <div class="admin-setting">
                    <div class="admin-setting-label">
                        <label for="quantity-enabled-toggle">Количество товаров</label>
                        <p class="admin-setting-description">Показывать количество товаров и разрешить учет резервации</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="quantity-enabled-toggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="admin-setting">
                    <div class="admin-setting-label">
                        <label for="reservations-toggle">Резервация товаров</label>
                        <p class="admin-setting-description">Разрешить клиентам резервировать товары на определенное время</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="reservations-toggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="admin-info">
                    <p>💡 Когда количество товаров включено, отображается количество на складе и можно включить резервацию. При отключении количества резервация становится недоступной.</p>
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
            // Делаем тумблер резервации неактивным, если количество товаров выключено
            reservationsToggle.disabled = !(shopSettings.quantity_enabled !== false);
        }
        
        // Показываем модальное окно
        adminModal.style.display = 'block';
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        alert('Не удалось загрузить настройки магазина: ' + error.message);
    }
}

// Обработка изменения переключателя количества товаров
async function handleQuantityEnabledToggle(enabled) {
    console.log(`🔧 Toggling quantity enabled: ${enabled}`);
    
    try {
        // Если quantity_enabled отключается, автоматически отключаем резервацию
        const updateData = {
            quantity_enabled: enabled
        };
        if (!enabled) {
            updateData.reservations_enabled = false;
        }
        
        shopSettings = await updateShopSettings(updateData);
        console.log('✅ Shop settings updated:', shopSettings);
        
        // Обновляем состояние тумблера резервации
        if (reservationsToggle) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
            reservationsToggle.disabled = !enabled;
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
    
    // Проверяем, что quantity_enabled включен
    if (!shopSettings || shopSettings.quantity_enabled === false) {
        console.warn('⚠️ Cannot enable reservations when quantity is disabled');
        if (reservationsToggle) {
            reservationsToggle.checked = false;
        }
        return;
    }
    
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

