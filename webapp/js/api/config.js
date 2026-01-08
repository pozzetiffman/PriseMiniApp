// ========== REFACTORING STEP 1.1: API_BASE ==========
// Модуль базовых констант и утилит API
// Дата начала: 2024-12-19
// Статус: В процессе

// НАСТРОЙКА АДРЕСА
// Базовый URL API для всех запросов
export const API_BASE = "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev".trim();

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] API_BASE loaded from api/config.js:', API_BASE);

// ========== END REFACTORING STEP 1.1 ==========

// ========== REFACTORING STEP 1.2: getBaseHeadersNoAuth() ==========
// Базовые заголовки без авторизации (для просмотра товаров/категорий)
export function getBaseHeadersNoAuth() {
    return {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
}

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] getBaseHeadersNoAuth() loaded from api/config.js');

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
    const initData = getInitData();
    if (!initData) {
        console.error('❌ CRITICAL: No initData available - app should only work through Telegram!');
        throw new Error("Telegram initData is required. Open the app through Telegram bot.");
    }
    
    headers["X-Telegram-Init-Data"] = initData;
    return headers;
}

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] getBaseHeaders() loaded from api/config.js');

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

// Логирование для проверки рефакторинга (будет удалено после проверки)
console.log('✅ [REFACTORING] fetchOptions loaded from api/config.js');

// ========== END REFACTORING STEP 1.4 ==========

