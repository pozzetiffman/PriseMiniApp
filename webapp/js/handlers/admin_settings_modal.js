// Модуль модального окна настроек магазина
import { getShopSettings } from '../api.js';
import { 
    handleQuantityEnabledToggle as handleQuantityEnabledToggleHandler,
    handleReservationsToggle as handleReservationsToggleHandler,
    handleAllProductsMadeToOrderToggle as handleAllProductsMadeToOrderToggleHandler
} from './admin_settings.js';
import { getCurrentShopSettings, loadShopSettings } from '../utils/admin_utils.js';

let shopSettings = null;
let quantityEnabledToggle = null;
let reservationsToggle = null;
let allProductsMadeToOrderToggle = null;

/**
 * Инициализация модального окна настроек
 */
export function initSettingsModal() {
    console.log('⚙️ Initializing settings modal...');
    
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) {
        console.error('❌ Settings modal not found');
        return;
    }
    
    // Настройка закрытия модального окна
    const settingsClose = document.querySelector('.settings-close');
    if (settingsClose) {
        settingsClose.onclick = () => {
            settingsModal.style.display = 'none';
        };
    }
    
    // Закрытие при клике вне модального окна
    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    };
    
    // Инициализация переключателей
    quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
    reservationsToggle = document.getElementById('reservations-toggle');
    allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
    
    if (quantityEnabledToggle) {
        quantityEnabledToggle.onchange = () => {
            handleQuantityEnabledToggle(quantityEnabledToggle.checked);
        };
    }
    
    if (reservationsToggle) {
        reservationsToggle.onchange = () => {
            handleReservationsToggle(reservationsToggle.checked);
        };
    }
    
    if (allProductsMadeToOrderToggle) {
        allProductsMadeToOrderToggle.onchange = () => {
            handleAllProductsMadeToOrderToggle(allProductsMadeToOrderToggle.checked);
        };
    }
    
    console.log('✅ Settings modal initialized');
}

/**
 * Открытие модального окна настроек
 */
export async function openSettings() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) {
        console.error('❌ Settings modal not found');
        return;
    }
    
    try {
        // Загружаем настройки магазина
        await loadShopSettings();
        shopSettings = getCurrentShopSettings();
        
        // Обновляем состояние переключателей
        if (quantityEnabledToggle && shopSettings) {
            quantityEnabledToggle.checked = shopSettings.quantity_enabled !== false;
        }
        
        if (reservationsToggle && shopSettings) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
        }
        
        if (allProductsMadeToOrderToggle && shopSettings) {
            allProductsMadeToOrderToggle.checked = shopSettings.all_products_made_to_order === true;
        }
        
        // Показываем модальное окно
        settingsModal.style.display = 'flex';
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        alert('Не удалось загрузить настройки магазина: ' + error.message);
    }
}

/**
 * Обработка изменения переключателя количества товаров
 */
async function handleQuantityEnabledToggle(enabled) {
    return handleQuantityEnabledToggleHandler(enabled, {
        getShopSettings: () => shopSettings,
        setShopSettings: (val) => { shopSettings = val; },
        getReservationsToggle: () => reservationsToggle,
        getQuantityEnabledToggle: () => quantityEnabledToggle
    });
}

/**
 * Обработка изменения переключателя резервации
 */
async function handleReservationsToggle(enabled) {
    return handleReservationsToggleHandler(enabled, {
        getShopSettings: () => shopSettings,
        setShopSettings: (val) => { shopSettings = val; },
        getReservationsToggle: () => reservationsToggle
    });
}

/**
 * Обработка изменения переключателя "Все товары под заказ"
 */
async function handleAllProductsMadeToOrderToggle(enabled) {
    return handleAllProductsMadeToOrderToggleHandler(enabled, {
        getShopSettings: () => shopSettings,
        setShopSettings: (val) => { shopSettings = val; }
    });
}

