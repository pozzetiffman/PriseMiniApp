// Модуль инициализации Telegram WebApp
let tg = null;

/**
 * Ожидание загрузки Telegram WebApp скрипта
 * @param {number} maxAttempts - максимальное количество попыток
 * @param {number} delay - задержка между попытками в мс
 * @returns {Promise<void>}
 */
function waitForTelegramWebApp(maxAttempts = 50, delay = 100) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        const checkTelegram = () => {
            attempts++;
            
            if (window.Telegram && window.Telegram.WebApp) {
                console.log('✅ Telegram WebApp скрипт загружен');
                resolve();
                return;
            }
            
            if (attempts >= maxAttempts) {
                const errorMsg = '❌ КРИТИЧЕСКАЯ ОШИБКА: Telegram WebApp не найден. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
                console.error(errorMsg);
                console.error('⚠️ Попытки:', attempts, 'window.Telegram:', window.Telegram);
                reject(new Error(errorMsg));
                return;
            }
            
            setTimeout(checkTelegram, delay);
        };
        
        checkTelegram();
    });
}

export async function initTelegram() {
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    // Ждем загрузки Telegram WebApp скрипта
    try {
        await waitForTelegramWebApp();
    } catch (e) {
        throw e;
    }
    
    // Проверяем наличие Telegram WebApp
    if (!window.Telegram || !window.Telegram.WebApp) {
        const errorMsg = '❌ КРИТИЧЕСКАЯ ОШИБКА: Telegram WebApp не найден. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    tg = window.Telegram.WebApp;
    
    // Расширяем WebApp на весь экран
    if (tg && typeof tg.expand === 'function') {
        tg.expand();
    }
    
    // Устанавливаем темную тему в стиле Liquid Glass (Telegram iOS)
    if (tg.setHeaderColor) {
        tg.setHeaderColor('#1c1c1e');
    }
    if (tg.setBackgroundColor) {
        tg.setBackgroundColor('#1c1c1e');
    }
    if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
    }
    
    console.log('✅ Telegram WebApp инициализирован');
    return true;
}

export function getTelegramInstance() {
    return tg;
}

export function isTelegramAvailable() {
    return !!tg && !!window.Telegram && !!window.Telegram.WebApp;
}

/**
 * Получить initData из Telegram WebApp
 * @returns {string|null} initData строка или null если Telegram недоступен
 */
export function getInitData() {
    if (!isTelegramAvailable()) {
        console.warn('⚠️ getInitData: Telegram not available');
        return null;
    }
    
    // Способ 1: через tg.initData (основной способ)
    if (tg.initData && typeof tg.initData === 'string' && tg.initData.length > 0) {
        console.log('✅ getInitData: Got from tg.initData, length:', tg.initData.length);
        return tg.initData;
    }
    
    // Способ 2: через window.Telegram.WebApp напрямую
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        const initData = window.Telegram.WebApp.initData;
        if (typeof initData === 'string' && initData.length > 0) {
            console.log('✅ getInitData: Got from window.Telegram.WebApp.initData, length:', initData.length);
            return initData;
        }
    }
    
    console.warn('⚠️ getInitData: initData not found');
    console.warn('⚠️ tg.initData:', tg.initData);
    console.warn('⚠️ tg.initDataUnsafe:', tg.initDataUnsafe);
    
    return null;
}

/**
 * Проверить, что приложение запущено в Telegram
 * Согласно аудиту: приложение работает ТОЛЬКО через Telegram
 * @returns {boolean}
 * @throws {Error} если Telegram недоступен
 */
export function requireTelegram() {
    if (!isTelegramAvailable()) {
        const errorMsg = '❌ КРИТИЧЕСКАЯ ОШИБКА: Telegram WebApp недоступен. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    if (!tg.initDataUnsafe?.user) {
        const errorMsg = '❌ КРИТИЧЕСКАЯ ОШИБКА: Данные пользователя Telegram не найдены. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    return true;
}

/**
 * Безопасный confirm через Telegram WebApp API
 * Используется вместо стандартного confirm(), который вызывает краш в Telegram WebView
 * @param {string} message - Сообщение для подтверждения
 * @returns {Promise<boolean>} - Promise, который разрешается в true если пользователь подтвердил, false если отменил
 */
export function safeConfirm(message) {
    return new Promise((resolve) => {
        if (!isTelegramAvailable()) {
            // Fallback на стандартный confirm если Telegram API недоступен (для тестирования)
            console.warn('⚠️ Telegram WebApp API недоступен, используем стандартный confirm');
            const result = window.confirm(message);
            resolve(result);
            return;
        }
        
        // Проверяем наличие метода showConfirm
        if (typeof tg.showConfirm !== 'function') {
            console.warn('⚠️ tg.showConfirm недоступен, используем стандартный confirm');
            const result = window.confirm(message);
            resolve(result);
            return;
        }
        
        try {
            // Telegram WebApp API: showConfirm(message, callback)
            // callback получает boolean: true если подтверждено, false если отменено
            tg.showConfirm(message, (confirmed) => {
                resolve(confirmed === true);
            });
        } catch (e) {
            console.error('Ошибка при вызове tg.showConfirm:', e);
            // Fallback на стандартный confirm при ошибке
            const result = window.confirm(message);
            resolve(result);
        }
    });
}

/**
 * Безопасный alert через Telegram WebApp API
 * Используется вместо стандартного alert(), который может вызывать проблемы в Telegram WebView
 * @param {string} message - Сообщение для отображения
 * @returns {Promise<void>}
 */
export function safeAlert(message) {
    return new Promise((resolve) => {
        if (!isTelegramAvailable()) {
            // Fallback на стандартный alert если Telegram API недоступен (для тестирования)
            console.warn('⚠️ Telegram WebApp API недоступен, используем стандартный alert');
            window.alert(message);
            resolve();
            return;
        }
        
        // Проверяем наличие метода showAlert
        if (typeof tg.showAlert !== 'function') {
            console.warn('⚠️ tg.showAlert недоступен, используем стандартный alert');
            window.alert(message);
            resolve();
            return;
        }
        
        try {
            // Telegram WebApp API: showAlert(message, callback)
            // callback вызывается после закрытия alert
            tg.showAlert(message, () => {
                resolve();
            });
        } catch (e) {
            console.error('Ошибка при вызове tg.showAlert:', e);
            // Fallback на стандартный alert при ошибке
            window.alert(message);
            resolve();
        }
    });
}

