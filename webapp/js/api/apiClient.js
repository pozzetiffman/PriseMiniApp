/**
 * Единый HTTP-клиент для всех API-запросов.
 * Гарантирует: X-Telegram-Init-Data, X-Request-Id, таймауты, retry, корреляция логов.
 */

import { getInitData } from '../telegram.js';

// --- Конфигурация ---
const DEFAULT_TIMEOUT_MS = 15000;
// Тяжёлые endpoint'ы: purchases, orders, deals, reservations
const HEAVY_ENDPOINTS = /\/api\/(purchases|orders|deals|reservations|sale-orders)\//;
const HEAVY_TIMEOUT_MS = 30000;

// Генерация UUID для корреляции запросов
function generateRequestId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Получить базовые заголовки с initData.
 * ВАЖНО: всегда добавляет X-Telegram-Init-Data, если доступен.
 * Для FormData не устанавливаем Content-Type (браузер добавит boundary).
 */
function getApiHeaders(customHeaders = {}, skipContentType = false) {
    const initData = getInitData();
    const headers = {
        'ngrok-skip-browser-warning': '69420',
        ...customHeaders
    };
    if (skipContentType) {
        delete headers['Content-Type'];
    } else {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    if (initData) {
        headers['X-Telegram-Init-Data'] = initData;
    } else {
        console.warn('⚠️ [apiClient] No initData - request may fail with 401');
    }
    return headers;
}

/**
 * Единый fetch с таймаутом, retry, X-Request-Id, initData.
 * @param {string} url - URL
 * @param {Object} options - fetch options (method, headers, body, signal...)
 * @param {Object} opts - { timeout, retries, skipInitData }
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}, opts = {}) {
    const requestId = generateRequestId();
    const timeoutMs = opts.timeout ?? (HEAVY_ENDPOINTS.test(url) ? HEAVY_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    const maxRetries = opts.retries ?? 1; // 1 retry = всего 2 попытки
    const skipInitData = opts.skipInitData ?? false;

    const isFormData = options.body instanceof FormData;
    const baseHeaders = skipInitData
        ? { 'ngrok-skip-browser-warning': '69420', ...(isFormData ? {} : { 'Content-Type': 'application/json' }) }
        : getApiHeaders(options.headers || {}, isFormData);
    const mergedHeaders = { ...baseHeaders, ...(options.headers || {}) };
    mergedHeaders['X-Request-Id'] = requestId;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const finalOptions = {
            ...options,
            headers: mergedHeaders,
            signal: options.signal || controller.signal
        };

        try {
            const response = await fetch(url, finalOptions);
            clearTimeout(timeoutId);
            return response;
        } catch (e) {
            clearTimeout(timeoutId);
            lastError = e;
            const isRetryable = e.name === 'AbortError' ||
                (e.name === 'TypeError' && (e.message?.includes('fetch') || e.message?.includes('Load failed')));
            if (!isRetryable || attempt >= maxRetries) break;
        }
    }
    throw lastError;
}

/**
 * Выполнить запрос и вернуть JSON. Бросает при !response.ok.
 * @param {string} url
 * @param {Object} options - { method, body, headers, timeout, retries }
 * @returns {Promise<any>}
 */
export async function apiRequest(url, options = {}) {
    const opts = { timeout: options.timeout, retries: options.retries };
    delete options.timeout;
    delete options.retries;

    const response = await apiFetch(url, options, opts);
    const text = await response.text();

    if (!response.ok) {
        const err = new Error(`API ${response.status}: ${text}`);
        err.status = response.status;
        err.responseText = text;
        throw err;
    }

    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`JSON parse error: ${e.message}`);
    }
}
