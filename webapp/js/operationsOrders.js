// Модуль для страницы заказов
import { updateActivityCounts } from './activityIndicators.js';
import { getMyOrdersAPI, getOrdersHistoryAPI } from './api/orders.js';
import { createOperationCard, initOperationPage, openOperationPage } from './operationsBase.js';
import { openOperationDetailPage } from './operationsDetail.js';

const PAGE_ID = 'orders-page';
const TYPE = 'orders';

/**
 * Инициализация страницы заказов
 */
export function initOrdersPage() {
    initOperationPage(PAGE_ID, TYPE);
}

/**
 * Открытие страницы заказов
 */
export function openOrdersPage() {
    openOperationPage(PAGE_ID);
    loadOrdersData();
}

/**
 * Загрузка данных заказов.
 * Бэкенд: /api/orders/my — только активные, /api/orders/history — только завершённые/отменённые.
 * Объединяем оба списка, чтобы во вкладке «Завершённые» была история сделок.
 */
async function loadOrdersData() {
    console.log('📦 Loading orders data...');
    
    try {
        const [activeFromApi, historyFromApi] = await Promise.all([
            getMyOrdersAPI(),
            getOrdersHistoryAPI()
        ]);
        const allOrders = [...(activeFromApi || []), ...(historyFromApi || [])];
        
        const activeOrders = (allOrders || []).filter(o => !o.is_completed && !o.is_cancelled);
        const completedOrders = (allOrders || []).filter(o => o.is_completed || o.is_cancelled);
        
        // Рендерим активные
        renderOrders('active', activeOrders);
        
        // Рендерим завершённые
        renderOrders('completed', completedOrders);
        
        // Обновляем индикаторы активности
        await updateActivityCounts();
        
        console.log(`✅ Orders loaded: ${activeOrders.length} active, ${completedOrders.length} completed`);
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        showError('active', 'Ошибка загрузки заказов');
        showError('completed', 'Ошибка загрузки заказов');
    }
}

/**
 * Рендеринг списка заказов
 * @param {string} status - Статус ('active' или 'completed')
 * @param {Array} orders - Массив заказов
 */
function renderOrders(status, orders) {
    const containerId = `orders-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="loading">Нет заказов</p>';
        return;
    }
    
    container.innerHTML = '';
    
    orders.forEach(order => {
        const card = createOperationCard(order, TYPE, status);
        card.classList.add('operation-item-card-clickable');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Заказ: ${(order.product && order.product.name) || 'Товар'}`);
        card.addEventListener('click', () => openOperationDetailPage(TYPE, order));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openOperationDetailPage(TYPE, order);
            }
        });
        container.appendChild(card);
    });
}

/**
 * Показать ошибку
 */
function showError(status, message) {
    const containerId = `orders-${status}-items`;
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="loading">${message}</p>`;
    }
}
