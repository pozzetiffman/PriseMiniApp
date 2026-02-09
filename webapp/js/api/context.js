// Модуль контекста и настроек магазина. Использует apiClient.

import { requireTelegram } from '../telegram.js';
import { API_BASE } from './config.js';
import { apiFetch, apiRequest } from './apiClient.js';

export async function getContext(shopOwnerId = null) {
    const telegramUser = requireTelegram();
    if (telegramUser && telegramUser.isFallback) {
        throw new Error('Приложение должно открываться через Telegram-бота');
    }
    let url = `${API_BASE}/api/context`;
    if (shopOwnerId !== null) url += `?shop_owner_id=${shopOwnerId}`;
    try {
        return await apiRequest(url, { retries: 1 });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Таймаут загрузки контекста. Попробуйте позже.');
        if (e.name === 'TypeError') throw new Error('Ошибка сети. Проверьте подключение.');
        throw e;
    }
}


// ========== END REFACTORING STEP 2.1 ==========

export async function getShopSettings(shopOwnerId = null) {
    let url = `${API_BASE}/api/shop-settings`;
    if (shopOwnerId !== null) url += `?shop_owner_id=${shopOwnerId}`;
    return apiRequest(url);
}


// ========== END REFACTORING STEP 2.2 ==========

export async function updateShopSettings(settingsUpdate) {
    const url = `${API_BASE}/api/shop-settings`;
    const response = await apiFetch(url, { method: 'PUT', body: JSON.stringify(settingsUpdate) });
    const text = await response.text();
    if (!response.ok) {
        let msg = 'Не удалось обновить настройки';
        try { msg = JSON.parse(text).detail || msg; } catch (_) { msg = text; }
        throw new Error(msg);
    }
    return JSON.parse(text || '{}');
}


// ========== END REFACTORING STEP 2.3 ==========

