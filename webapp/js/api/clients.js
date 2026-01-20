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
