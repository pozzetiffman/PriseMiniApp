// Утилита для отправки логов на сервер (для отладки Telegram приложения)
// Импортируем API_BASE через api.js для совместимости
import { API_BASE } from '../api.js';
import { getTelegramInstance } from '../telegram.js';

// Буфер для логов (чтобы не отправлять каждый лог отдельно)
let logBuffer = [];
let bufferTimer = null;
const BUFFER_DELAY = 2000; // Отправлять каждые 2 секунды
const MAX_BUFFER_SIZE = 20; // Максимум логов в буфере (увеличено для лучшей отладки)

// Настройки отладки
const DEBUG_CONFIG = {
    // Уровни логирования для отправки (можно фильтровать)
    levels: ['log', 'info', 'warn', 'error'],
    // Включить детальную информацию (URL, user agent, и т.д.)
    includeDetails: true,
    // Включить stack trace для всех логов (не только ошибок)
    includeStack: false,
    // Максимальная длина сообщения
    maxMessageLength: 5000
};

// Проверка, включено ли удаленное логирование
function isRemoteLoggingEnabled() {
    // Проверяем параметр URL для принудительного включения
    const urlParams = new URLSearchParams(window.location.search);
    const forceRemoteLog = urlParams.get('remote_log');
    if (forceRemoteLog === '1' || forceRemoteLog === 'true') {
        return true; // Принудительно включаем
    }
    
    // Включаем только если НЕ режим диагностики (в браузере логи видны в консоли)
    const debugUser = urlParams.get('debug_user');
    return !debugUser; // Включаем только в реальном Telegram
}

/**
 * Получить дополнительную информацию для отладки
 */
function getDebugInfo() {
    const info = {
        url: window.location.href,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString()
    };
    
    try {
        const tg = getTelegramInstance();
        if (tg) {
            info.telegramVersion = tg.version;
            info.telegramPlatform = tg.platform;
            info.telegramColorScheme = tg.colorScheme;
            info.telegramThemeParams = tg.themeParams;
        }
    } catch (e) {
        // Игнорируем ошибки получения информации о Telegram
    }
    
    return info;
}

/**
 * Отправить логи на сервер
 */
async function sendLogsToServer() {
    if (logBuffer.length === 0) return;
    
    const logsToSend = [...logBuffer];
    logBuffer = []; // Очищаем буфер
    
    try {
        const tg = getTelegramInstance();
        const userInfo = tg?.initDataUnsafe?.user || { id: 'unknown' };
        
        const logData = {
            user_id: userInfo.id,
            username: userInfo.username || 'unknown',
            timestamp: new Date().toISOString(),
            logs: logsToSend
        };
        
        // Добавляем дополнительную информацию для отладки
        if (DEBUG_CONFIG.includeDetails) {
            logData.debug_info = getDebugInfo();
        }
        
        const response = await fetch(`${API_BASE}/api/debug/logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '69420'
            },
            body: JSON.stringify(logData)
        });
        
        if (!response.ok) {
            // Используем оригинальный console.error напрямую, чтобы избежать рекурсии
            // (не используем перехваченный console.error)
            console.error = console.error || (() => {});
            console.error(`❌ Failed to send logs: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        // Не логируем ошибки отправки логов, чтобы избежать бесконечного цикла
        // Используем оригинальный console.error напрямую
        try {
            console.error('❌ Failed to send logs to server:', error);
        } catch (e) {
            // Игнорируем ошибки логирования
        }
    }
}

/**
 * Добавить лог в буфер
 */
function addLogToBuffer(level, args) {
    if (!isRemoteLoggingEnabled()) return;
    
    // Фильтруем по уровням логирования
    if (!DEBUG_CONFIG.levels.includes(level)) return;
    
    // Формируем сообщение
    let message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                // Ограничиваем глубину вложенности для больших объектов
                return JSON.stringify(arg, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        // Ограничиваем размер объекта
                        const str = JSON.stringify(value);
                        if (str.length > 1000) {
                            return '[Object too large]';
                        }
                    }
                    return value;
                }, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    
    // Ограничиваем длину сообщения
    if (message.length > DEBUG_CONFIG.maxMessageLength) {
        message = message.substring(0, DEBUG_CONFIG.maxMessageLength) + '...[truncated]';
    }
    
    const logEntry = {
        level: level,
        message: message,
        timestamp: new Date().toISOString(),
        stack: DEBUG_CONFIG.includeStack || level === 'error' ? new Error().stack : undefined
    };
    
    logBuffer.push(logEntry);
    
    // Для критических ошибок отправляем немедленно
    const isCritical = level === 'error' || 
                      (level === 'warn' && (logEntry.message.includes('[FILTER ERROR]') || 
                                           logEntry.message.includes('[FILTER WARNING]') ||
                                           logEntry.message.includes('ERROR') ||
                                           logEntry.message.includes('FAILED'))) ||
                      (level === 'log' && (logEntry.message.includes('[FILTER DEBUG]') ||
                                          logEntry.message.includes('[CATEGORIES DEBUG]') ||
                                          logEntry.message.includes('[API DEBUG]')));
    
    if (isCritical) {
        // Отправляем критические логи немедленно
        if (bufferTimer) {
            clearTimeout(bufferTimer);
            bufferTimer = null;
        }
        // Добавляем небольшую задержку, чтобы собрать связанные логи
        setTimeout(() => {
            sendLogsToServer();
        }, 100);
    } else if (logBuffer.length >= MAX_BUFFER_SIZE) {
        // Если буфер заполнен, отправляем сразу
        if (bufferTimer) {
            clearTimeout(bufferTimer);
            bufferTimer = null;
        }
        sendLogsToServer();
    } else {
        // Иначе планируем отправку через задержку
        if (!bufferTimer) {
            bufferTimer = setTimeout(() => {
                bufferTimer = null;
                sendLogsToServer();
            }, BUFFER_DELAY);
        }
    }
}

/**
 * Перехватить console методы и отправлять логи на сервер
 */
export function initRemoteLogger() {
    const enabled = isRemoteLoggingEnabled();
    const urlParams = new URLSearchParams(window.location.search);
    const forceRemoteLog = urlParams.get('remote_log');
    
    // Сохраняем оригинальные методы ДО перехвата
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    
    if (!enabled && forceRemoteLog !== '1' && forceRemoteLog !== 'true') {
        // Используем оригинальный console.log, чтобы не попасть в рекурсию
        originalLog('📡 Remote logging disabled (debug mode or browser). Add ?remote_log=1 to enable.');
        return;
    }
    
    // Используем оригинальный console.log для начальных сообщений
    originalLog('📡 Remote logging enabled - logs will be sent to server');
    originalLog('📡 To view logs, check backend console or add ?remote_log=1 to URL');
    originalLog('📡 Debug config:', DEBUG_CONFIG);
    
    // Перехватываем console.log
    console.log = function(...args) {
        originalLog.apply(console, args);
        addLogToBuffer('log', args);
    };
    
    // Перехватываем console.error
    console.error = function(...args) {
        originalError.apply(console, args);
        addLogToBuffer('error', args);
    };
    
    // Перехватываем console.warn
    console.warn = function(...args) {
        originalWarn.apply(console, args);
        addLogToBuffer('warn', args);
    };
    
    // Перехватываем console.info
    console.info = function(...args) {
        originalInfo.apply(console, args);
        addLogToBuffer('info', args);
    };
    
    // Отправляем оставшиеся логи при закрытии страницы
    window.addEventListener('beforeunload', () => {
        if (logBuffer.length > 0) {
            // Используем sendBeacon для надежной отправки при закрытии
            const tg = getTelegramInstance();
            const userInfo = tg?.initDataUnsafe?.user || { id: 'unknown' };
            
            const logData = {
                user_id: userInfo.id,
                username: userInfo.username || 'unknown',
                timestamp: new Date().toISOString(),
                logs: logBuffer
            };
            
            navigator.sendBeacon(
                `${API_BASE}/api/debug/logs`,
                JSON.stringify(logData)
            );
        }
    });
}
