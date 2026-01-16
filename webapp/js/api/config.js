// ========== REFACTORING STEP 1.1: API_BASE ==========
// Модуль базовых констант и утилит API
// Дата начала: 2024-12-19
// Статус: В процессе

// Флаг отладки (для dev-режима)
// В production всегда false, в dev можно включить через URL параметр ?debug=1
export const DEBUG = (() => {
    if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('debug') === '1' || urlParams.get('debug') === 'true';
    }
    return false;
})();

// НАСТРОЙКА АДРЕСА
// Базовый URL API для всех запросов
export const API_BASE = "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev".trim();

// ========== END REFACTORING STEP 1.1 ==========

// ========== REFACTORING STEP 1.2: getBaseHeadersNoAuth() ==========
// Базовые заголовки без авторизации (для просмотра товаров/категорий)
export function getBaseHeadersNoAuth() {
    return {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
}

// ========== END REFACTORING STEP 1.2 ==========

// ========== REFACTORING STEP 1.3: getBaseHeaders() ==========
// Импорт необходимых зависимостей для функции авторизации
import { getInitData } from '../telegram.js';

// Базовые опции для запросов с авторизацией
export function getBaseHeaders() {
    const headers = {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
    
    // Добавляем initData в заголовок для валидации на backend
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram, initData всегда должен быть доступен
    // === ИСПРАВЛЕНИЕ: Graceful degradation вместо throw ===
    const initData = getInitData();
    if (!initData) {
        console.warn('⚠️ [getBaseHeaders] No initData available - request will fail on backend');
        // НЕ выбрасываем ошибку - backend вернет 401, что обработается в getContext()
        // Возвращаем заголовки без initData для graceful degradation
        return headers;
    }
    
    headers["X-Telegram-Init-Data"] = initData;
    return headers;
}

// ========== END REFACTORING STEP 1.3 ==========

// ========== REFACTORING STEP 1.4: fetchOptions ==========
// Опции для обхода предупреждения ngrok (для обратной совместимости)
// НЕ используем getBaseHeaders() здесь, так как он требует initData при импорте
export const fetchOptions = {
    headers: {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    }
};

// ========== END REFACTORING STEP 1.4 ==========

