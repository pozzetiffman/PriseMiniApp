// Модуль работы с user ID
// ВАЖНО: Этот модуль больше не определяет user_id из URL или делает предположения.
// Вся логика определения контекста перенесена на backend через /api/context

import { getTelegramInstance, isTelegramAvailable, requireTelegram } from './telegram.js';

/**
 * Получить ID текущего пользователя из Telegram (только для UI, не для бизнес-логики)
 * @returns {number|null} user_id или null если Telegram недоступен
 */
export function getCurrentUserId() {
    if (!isTelegramAvailable()) {
        return null;
    }
    
    const tg = getTelegramInstance();
    
    // Получаем из initDataUnsafe
    if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        return tg.initDataUnsafe.user.id;
    }
    
    return null;
}

/**
 * Проверить, что приложение запущено в Telegram
 * Выбрасывает ошибку если Telegram недоступен
 */
export function ensureTelegram() {
    if (!requireTelegram()) {
        throw new Error("Приложение должно открываться через Telegram-бота");
    }
}
