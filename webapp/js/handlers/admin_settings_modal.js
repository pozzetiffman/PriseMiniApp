// Модуль модального окна настроек магазина
import { getShopSettings } from '../api.js';
import { 
    handleQuantityEnabledToggle as handleQuantityEnabledToggleHandler,
    handleReservationsToggle as handleReservationsToggleHandler,
    handleAllProductsMadeToOrderToggle as handleAllProductsMadeToOrderToggleHandler
} from './admin_settings.js';
import { getCurrentShopSettings, loadShopSettings } from '../utils/admin_utils.js';
import { hideAllPages } from '../operationsBase.js';
import { setupPageScrollHandler } from '../operationsBase.js';

let shopSettings = null;
let quantityEnabledToggle = null;
let reservationsToggle = null;
let allProductsMadeToOrderToggle = null;

/**
 * Инициализация модального окна настроек (переключатели находятся на settings-page)
 */
export function initSettingsModal() {
    console.log('⚙️ Initializing settings...');
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
    console.log('✅ Settings initialized');
}

/**
 * Закрытие страницы настроек, возврат на profile-page
 */
export function closeSettingsPage() {
    const settingsPage = document.getElementById('settings-page');
    const profilePage = document.getElementById('profile-page');
    if (settingsPage) settingsPage.style.display = 'none';
    if (profilePage) profilePage.style.display = 'block';
}

/**
 * Открытие страницы настроек (вместо модального окна). «←» возвращает в profile-page.
 */
export async function openSettingsPage() {
    const settingsPage = document.getElementById('settings-page');
    if (!settingsPage) {
        console.error('❌ Settings page not found');
        return;
    }
    try {
        await loadShopSettings();
        shopSettings = getCurrentShopSettings();
        if (!quantityEnabledToggle) quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
        if (!reservationsToggle) reservationsToggle = document.getElementById('reservations-toggle');
        if (!allProductsMadeToOrderToggle) allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
        if (quantityEnabledToggle && shopSettings) {
            quantityEnabledToggle.checked = shopSettings.quantity_enabled !== false;
        }
        if (reservationsToggle && shopSettings) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
        }
        if (allProductsMadeToOrderToggle && shopSettings) {
            allProductsMadeToOrderToggle.checked = shopSettings.all_products_made_to_order === true;
        }
        hideAllPages();
        settingsPage.style.display = 'block';
        settingsPage.scrollTop = 0;
        const backBtn = document.getElementById('settings-page-back');
        if (backBtn) backBtn.onclick = closeSettingsPage;
        setupPageScrollHandler(settingsPage);
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        alert('Не удалось загрузить настройки магазина: ' + error.message);
    }
}

/**
 * Открытие модального окна настроек (устарело: используется openSettingsPage)
 */
export async function openSettings() {
    await openSettingsPage();
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

