// ========== REFACTORING STEP 1.1: showNotification ==========
// Модуль утилит для админки
// Дата начала: 2024-12-19
// Статус: В процессе

/**
 * Показ уведомления пользователю
 * @param {string} message - Текст уведомления
 */
export function showNotification(message) {
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

