// ========== REFACTORING STEP 1.1: showNotification ==========
// Модуль утилит для админки
// Дата начала: 2024-12-19
// Статус: В процессе

/**
 * Показ уведомления пользователю
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления ('success' или 'error')
 * @param {Object} [options] - Опции позиционирования
 * @param {string} [options.anchor] - 'product-page' — позиция ниже меню страницы товара
 * @param {string|number} [options.top] - Явное значение top (переопределяет дефолт и anchor)
 */
export function showNotification(message, type = 'success', options = {}) {
    // Создаем временное уведомление
    const notification = document.createElement('div');
    notification.className = 'admin-notification';
    notification.textContent = message;

    // Определяем цвет фона в зависимости от типа
    const backgroundColor = type === 'error' ? '#f44336' : '#4CAF50';

    let topValue = '100px';
    if (options.top !== undefined && options.top !== null) {
        topValue = typeof options.top === 'number' ? `${options.top}px` : String(options.top);
    } else if (options.anchor === 'product-page') {
        const menu = document.querySelector('.product-new-top-menu');

        // СТАВИМ УВЕДОМЛЕНИЕ ТОЧНО ПОД НИЖНЕЙ ГРАНИЦЕЙ МЕНЮ
        // Это надежнее, чем offsetHeight + safe-area, потому что учитывает реальную позицию меню на экране.
        if (menu) {
            const rect = menu.getBoundingClientRect();
            topValue = `${Math.round(rect.bottom)}px`; // без зазора
        } else {
            topValue = '64px'; // fallback
        }
    }

    notification.style.cssText = `
        position: fixed;
        top: ${topValue};
        right: 20px;
        background: ${backgroundColor};
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

// ========== REFACTORING STEP 1.2: getCurrentShopSettings ==========
/**
 * Получение текущих настроек магазина
 * @param {Function} shopSettingsGetter - Функция-геттер для получения shopSettings
 * @returns {Object|null} Текущие настройки магазина или null
 */
export function getCurrentShopSettings(shopSettingsGetter) {
    return shopSettingsGetter ? shopSettingsGetter() : null;
}
// ========== END REFACTORING STEP 1.2 ==========

// ========== REFACTORING STEP 1.3: loadShopSettings ==========
/**
 * Загрузка настроек магазина
 * @param {Function} getShopSettingsAPI - Функция API для получения настроек магазина
 * @param {Function} shopSettingsSetter - Функция-сеттер для обновления shopSettings
 * @param {number|null} shopOwnerId - ID владельца магазина (опционально)
 * @returns {Promise<Object>} Загруженные настройки магазина или дефолтные настройки при ошибке
 */
export async function loadShopSettings(getShopSettingsAPI, shopSettingsSetter, shopOwnerId = null) {
    try {
        const settings = await getShopSettingsAPI(shopOwnerId);
        console.log('✅ Shop settings loaded:', settings);
        if (shopSettingsSetter) {
            shopSettingsSetter(settings);
        }
        return settings;
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        // Возвращаем дефолтные настройки при ошибке
        const defaultSettings = { reservations_enabled: true, quantity_enabled: true };
        if (shopSettingsSetter) {
            shopSettingsSetter(defaultSettings);
        }
        return defaultSettings;
    }
}
// ========== END REFACTORING STEP 1.3 ==========

