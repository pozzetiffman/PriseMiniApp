// ========== REFACTORING STEP 7.1: fetchUserReservations() ==========
// Модуль для работы с резервациями
// Дата начала: 2024-12-XX
// Статус: В процессе

import { API_BASE, getBaseHeaders } from './config.js';

// Загрузка резерваций для корзины (только те, где текущий пользователь - резервирующий)
export async function fetchUserReservations() {
    const url = `${API_BASE}/api/reservations/cart`;
    console.log(`Fetching cart reservations from: ${url}`);
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeaders(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Reservations error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log(`📦 fetchUserReservations: Got ${data.length} cart reservations`);
        return data;
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ fetchUserReservations timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки резерваций. Сервер не отвечает.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            console.error("❌ Network error fetching reservations:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу.");
        }
        
        throw e;
    }
}


// ========== END REFACTORING STEP 7.1 ==========

// ========== REFACTORING STEP 7.2: fetchReservationsHistory() ==========
// Загрузка истории резерваций (все резервации пользователя)
export async function fetchReservationsHistory() {
    const url = `${API_BASE}/api/reservations/history`;
    console.log(`Fetching reservations history from: ${url}`);
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 10000; // 10 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: getBaseHeaders(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Reservations history error:", response.status, errorText);
            throw new Error(`Reservations history error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`📜 fetchReservationsHistory: Got ${data.length} reservations`);
        return data;
    } catch (e) {
        clearTimeout(timeoutId);
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ fetchReservationsHistory timeout after", TIMEOUT_MS, "ms");
            throw new Error("Таймаут загрузки истории резерваций. Сервер не отвечает.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            console.error("❌ Network error fetching reservations history:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу.");
        }
        
        throw e;
    }
}


// ========== END REFACTORING STEP 7.2 ==========

// ========== REFACTORING STEP 7.3: createReservationAPI() ==========
// Создание резервации (reserved_by_user_id определяется на backend из initData)
export async function createReservationAPI(productId, hours, quantity = 1) {
    const url = `${API_BASE}/api/reservations/?product_id=${productId}&hours=${hours}&quantity=${quantity}`;
    console.log(`Reservation URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Reservation response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Ошибка при резервации';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 7.3 ==========

// ========== REFACTORING STEP 7.4: cancelReservationAPI() ==========
// Отмена резервации (user_id определяется на backend из initData)
export async function cancelReservationAPI(reservationId) {
    const url = `${API_BASE}/api/reservations/${reservationId}`;
    console.log(`Cancel reservation URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Cancel reservation response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось снять резервацию';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return true;
}


// ========== END REFACTORING STEP 7.4 ==========

// ========== REFACTORING STEP 7.5: clearReservationsHistoryAPI() ==========
// Очистить историю резерваций
export async function clearReservationsHistoryAPI() {
    const url = `${API_BASE}/api/reservations/history/clear`;
    console.log(`Clear reservations history URL: ${url}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Clear reservations history response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось очистить историю резерваций';
        try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 7.5 ==========

