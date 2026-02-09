// Модуль для работы с покупками.
// Использует apiClient: initData, X-Request-Id, таймаут 30s, retry для purchases.

import { API_BASE } from './config.js';
import { apiFetch, apiRequest } from './apiClient.js';

export async function createPurchaseAPI(productId, formData) {
    const url = `${API_BASE}/api/purchases/`;
    const response = await apiFetch(url, { method: 'POST', body: formData }, { retries: 1 });
    const text = await response.text();
    if (!response.ok) {
        let msg = 'Не удалось создать заявку на покупку';
        try { msg = JSON.parse(text).detail || msg; } catch (_) { msg = text; }
        throw new Error(msg);
    }
    return JSON.parse(text || 'null');
}

export async function getMyPurchasesAPI() {
    const url = `${API_BASE}/api/purchases/my`;
    try {
        return await apiRequest(url, { retries: 1 });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Таймаут загрузки покупок. Попробуйте позже.');
        if (e.name === 'TypeError') throw new Error('Ошибка сети. Проверьте подключение.');
        throw e;
    }
}

export async function cancelPurchaseAPI(purchaseId) {
    const url = `${API_BASE}/api/purchases/${purchaseId}`;
    const response = await apiFetch(url, { method: 'DELETE' }, { retries: 1 });
    const text = await response.text();
    if (!response.ok) {
        let msg = 'Не удалось отменить покупку';
        try { msg = JSON.parse(text).detail || msg; } catch (_) { msg = text; }
        throw new Error(msg);
    }
    return JSON.parse(text || 'true');
}

export async function getPurchasesHistoryAPI() {
    const url = `${API_BASE}/api/purchases/history`;
    try {
        return await apiRequest(url, { retries: 1 });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Таймаут загрузки истории покупок. Попробуйте позже.');
        if (e.name === 'TypeError') throw new Error('Ошибка сети. Проверьте подключение.');
        throw e;
    }
}

export async function getAllPurchasesAPI(shopOwnerId) {
    const url = `${API_BASE}/api/purchases/all?user_id=${shopOwnerId}`;
    const response = await apiFetch(url, {}, { retries: 1 });
    const text = await response.text();
    if (!response.ok) {
        let msg = 'Не удалось загрузить покупки';
        try { msg = JSON.parse(text).detail || msg; } catch (_) { msg = text; }
        throw new Error(msg);
    }
    return JSON.parse(text || '[]');
}

export async function updatePurchaseStatusAPI(purchaseId, shopOwnerId, statusData) {
    const url = `${API_BASE}/api/purchases/${purchaseId}?user_id=${shopOwnerId}`;
    const response = await apiFetch(url, { method: 'PATCH', body: JSON.stringify(statusData) }, { retries: 1 });
    const text = await response.text();
    if (!response.ok) {
        let msg = 'Не удалось обновить статус покупки';
        try { msg = JSON.parse(text).detail || msg; } catch (_) { msg = text; }
        throw new Error(msg);
    }
    return JSON.parse(text || '{}');
}

export async function clearPurchasesHistoryAPI() {
    const url = `${API_BASE}/api/purchases/history/clear`;
    const response = await apiFetch(url, { method: 'DELETE' }, { retries: 1 });
    const text = await response.text();
    if (!response.ok) {
        let msg = 'Не удалось очистить историю продаж';
        try { msg = JSON.parse(text).detail || msg; } catch (_) { msg = text; }
        throw new Error(msg);
    }
    return JSON.parse(text || 'true');
}
