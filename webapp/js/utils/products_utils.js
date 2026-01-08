// Утилиты для работы с товарами
// Вынесено из products.js для рефакторинга

// Импорты зависимостей
import { getTelegramInstance } from '../telegram.js';

// ========== REFACTORING STEP 1.1: isMobileDevice ==========
// НОВЫЙ КОД (используется сейчас)
// Детекция устройства (мобильное/десктоп)
// В Telegram WebView на мобильных устройствах нужно использовать blob URL для обхода блокировки
// На десктопе можно использовать прямые URL
export function isMobileDevice() {
    // Проверяем через Telegram WebApp platform
    const tg = getTelegramInstance();
    if (tg && tg.platform) {
        return tg.platform === 'ios' || tg.platform === 'android';
    }
    // Fallback: проверяем через user agent
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768);
}
// ========== END REFACTORING STEP 1.1 ==========

