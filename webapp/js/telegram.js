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
                // === ИСПРАВЛЕНИЕ: Graceful degradation вместо reject ===
                const errorMsg = '⚠️ Telegram WebApp не найден. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
                console.warn(errorMsg);
                console.warn('⚠️ Попытки:', attempts, 'window.Telegram:', window.Telegram);
                // НЕ выбрасываем ошибку - просто разрешаем промис, проверка будет в requireTelegram()
                resolve();
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
    // === ИСПРАВЛЕНИЕ: Graceful degradation - waitForTelegramWebApp больше не бросает ошибки ===
    await waitForTelegramWebApp();
    
    // Проверяем наличие Telegram WebApp
    if (!window.Telegram || !window.Telegram.WebApp) {
        // === ИСПРАВЛЕНИЕ: Graceful degradation вместо throw ===
        console.warn('⚠️ [initTelegram] Telegram WebApp не найден, продолжаем с fallback');
        // НЕ выбрасываем ошибку, проверка будет в requireTelegram()
        tg = null;
        return false; // Возвращаем false вместо throw
    }
    
    tg = window.Telegram.WebApp;
    
    // Расширяем WebApp на весь экран (ВАЖНО: вызывается до рендера UI)
    if (tg && typeof tg.expand === 'function') {
        tg.expand();
    }
    
    // Готовим WebApp к использованию
    if (tg && typeof tg.ready === 'function') {
        tg.ready();
    }
    
    // Устанавливаем темную тему в стиле Liquid Glass (Telegram iOS)
    if (tg.setHeaderColor) {
        tg.setHeaderColor('#1c1c1e');
    }
    if (tg.setBackgroundColor) {
        tg.setBackgroundColor('#1c1c1e');
    }
    
    // КРИТИЧНО: Отключаем закрытие приложения свайпом вниз
    // Приложение должно закрываться ТОЛЬКО через сервисную кнопку
    if (tg.disableVerticalSwipes && typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
        console.log('✅ Вертикальные свайпы для закрытия отключены');
    }
    
    // Включаем подтверждение закрытия (дополнительная защита)
    if (tg.enableClosingConfirmation && typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
        console.log('✅ Подтверждение закрытия включено');
    }
    
    // Дополнительно: предотвращаем закрытие через обработчик события
    // Слушаем изменения viewport и предотвращаем закрытие
    if (tg.onEvent && typeof tg.onEvent === 'function') {
        tg.onEvent('viewportChanged', () => {
            // Если приложение пытается закрыться (viewport уменьшился), предотвращаем
            if (tg.isExpanded === false || tg.viewportHeight < window.innerHeight * 0.9) {
                console.log('[TELEGRAM] 🚫 Попытка закрытия предотвращена, расширяем приложение');
                tg.expand();
            }
        });
    }
    
    // Также слушаем событие закрытия напрямую
    if (tg.onClose && typeof tg.onClose === 'function') {
        tg.onClose(() => {
            console.log('[TELEGRAM] 🚫 Попытка закрытия перехвачена');
            // Предотвращаем закрытие, расширяя приложение обратно
            if (tg.expand) {
                tg.expand();
            }
        });
    }
    
    console.log('✅ Telegram WebApp инициализирован');
    console.log('✅ Safe area top:', getComputedStyle(document.body).getPropertyValue('--tg-safe-area-inset-top'));
    console.log('✅ Content safe area top:', getComputedStyle(document.body).getPropertyValue('--tg-content-safe-area-inset-top'));
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
        return tg.initData;
    }
    
    // Способ 2: через window.Telegram.WebApp напрямую
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        const initData = window.Telegram.WebApp.initData;
        if (typeof initData === 'string' && initData.length > 0) {
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
 * @returns {Object|null} Объект пользователя Telegram или fallback-объект, или null
 * При отсутствии initData возвращает fallback-объект вместо throw Error
 */
export function requireTelegram() {
    if (!isTelegramAvailable()) {
        const errorMsg = '⚠️ Telegram WebApp недоступен. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
        console.warn(errorMsg);
        // === ИСПРАВЛЕНИЕ: Graceful degradation вместо throw ===
        return {
            id: null,
            isFallback: true,
            fallbackReason: 'telegram_not_available'
        };
    }
    
    // === ИСПРАВЛЕНИЕ: Безопасная проверка tg перед обращением к свойствам ===
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        const errorMsg = '⚠️ Данные пользователя Telegram не найдены. Приложение должно открываться ТОЛЬКО через Telegram-бота.';
        console.warn(errorMsg);
        // === ИСПРАВЛЕНИЕ: Graceful degradation вместо throw ===
        return {
            id: null,
            isFallback: true,
            fallbackReason: 'user_data_not_found'
        };
    }
    
    // === Возвращаем объект пользователя для совместимости ===
    // Для обратной совместимости: возвращаем user объект (truthy)
    return tg.initDataUnsafe.user;
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

