// Модуль для работы с клиентами
import { API_BASE, getBaseHeaders } from './config.js';

/**
 * Получить список всех клиентов магазина
 */
export async function getClientsListAPI() {
    const url = `${API_BASE}/api/clients/list`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Ошибка при загрузке списка клиентов';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = errorText || `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('getClientsListAPI error:', error);
        throw error;
    }
}

/**
 * Получить детальную информацию о клиенте
 * @param {number} clientId - ID клиента
 */
export async function getClientDetailAPI(clientId) {
    const url = `${API_BASE}/api/clients/${clientId}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Ошибка при загрузке информации о клиенте';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = errorText || `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('getClientDetailAPI error:', error);
        throw error;
    }
}

/**
 * Получить контактную информацию текущего пользователя
 */
export async function getMyContactInfoAPI() {
    const url = `${API_BASE}/api/clients/me/contact`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Ошибка при загрузке контактной информации';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = errorText || `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('getMyContactInfoAPI error:', error);
        throw error;
    }
}

/**
 * Обновить контактные данные текущего пользователя
 * @param {Object} contactData - Данные для обновления
 */
export async function updateMyContactInfoAPI(contactData) {
    const url = `${API_BASE}/api/clients/me/contact`;
    
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                ...getBaseHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contactData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Ошибка при обновлении контактных данных';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = errorText || `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('updateMyContactInfoAPI error:', error);
        throw error;
    }
}

/**
 * Обновить контактные данные клиента
 * @param {number} clientId - ID клиента
 * @param {Object} contactData - Данные для обновления
 */
export async function updateClientContactAPI(clientId, contactData) {
    const url = `${API_BASE}/api/clients/${clientId}/contact`;
    
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                ...getBaseHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contactData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Ошибка при обновлении контактных данных';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                errorMessage = errorText || `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('updateClientContactAPI error:', error);
        throw error;
    }
}
