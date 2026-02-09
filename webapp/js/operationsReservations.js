// Модуль для страницы резерваций
import { updateActivityCounts } from './activityIndicators.js';
import { fetchReservationsHistory, fetchUserReservations } from './api.js';
import { createOperationCard, initOperationPage, openOperationPage } from './operationsBase.js';

const PAGE_ID = 'reservations-page';
const TYPE = 'reservations';

/**
 * Инициализация страницы резерваций
 */
export function initReservationsPage() {
    initOperationPage(PAGE_ID, TYPE);
}

/**
 * Открытие страницы резерваций
 */
export function openReservationsPage() {
    openOperationPage(PAGE_ID);
    loadReservationsData();
}

/**
 * Загрузка данных резерваций.
 * Бэкенд: /api/reservations/cart — активные для корзины, /api/reservations/history — завершённые/истёкшие.
 * Объединяем оба списка, чтобы «Завершённые» показывали историю.
 */
async function loadReservationsData() {
    console.log('🔒 Loading reservations data...');
    
    try {
        const [cartReservations, historyReservations] = await Promise.all([
            fetchUserReservations(),
            fetchReservationsHistory()
        ]);
        const allReservations = [...(cartReservations || []), ...(historyReservations || [])];
        const now = new Date();
        
        // Фильтруем активные резервации
        const activeReservations = (allReservations || []).filter(r => {
            if (!r.is_active) return false;
            if (r.reserved_until) {
                let reservedUntilStr = r.reserved_until;
                if (!reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                    reservedUntilStr = reservedUntilStr + 'Z';
                }
                const reservedUntil = new Date(reservedUntilStr);
                return reservedUntil > now;
            }
            return true;
        });
        
        // Фильтруем завершённые резервации (истёкшие или отменённые)
        const completedReservations = (allReservations || []).filter(r => {
            if (!r.is_active) return true; // Отменённые
            if (r.reserved_until) {
                let reservedUntilStr = r.reserved_until;
                if (!reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                    reservedUntilStr = reservedUntilStr + 'Z';
                }
                const reservedUntil = new Date(reservedUntilStr);
                return reservedUntil <= now;
            }
            return false;
        });
        
        // Рендерим активные
        renderReservations('active', activeReservations);
        
        // Рендерим завершённые
        renderReservations('completed', completedReservations);
        
        // Обновляем индикаторы активности
        await updateActivityCounts();
        
        console.log(`✅ Reservations loaded: ${activeReservations.length} active, ${completedReservations.length} completed`);
    } catch (error) {
        console.error('❌ Error loading reservations:', error);
        showError('active', 'Ошибка загрузки резерваций');
        showError('completed', 'Ошибка загрузки резерваций');
    }
}

/**
 * Рендеринг списка резерваций
 * @param {string} status - Статус ('active' или 'completed')
 * @param {Array} reservations - Массив резерваций
 */
function renderReservations(status, reservations) {
    const containerId = `reservations-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!reservations || reservations.length === 0) {
        container.innerHTML = '<p class="loading">Нет резерваций</p>';
        return;
    }
    
    container.innerHTML = '';
    
    reservations.forEach(reservation => {
        const card = createOperationCard(reservation, TYPE, status);
        container.appendChild(card);
    });
}

/**
 * Показать ошибку
 */
function showError(status, message) {
    const containerId = `reservations-${status}-items`;
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="loading">${message}</p>`;
    }
}
