// Модуль для страницы покупок (сделки — оформление корзины)
import { updateActivityCounts } from './activityIndicators.js';
import { getMyDealsAPI, getDealsHistoryAPI } from './api/deals.js';
import { createDealCard, initOperationPage, openOperationPage } from './operationsBase.js';
import { openDealDetailPage } from './operationsDetail.js';

const PAGE_ID = 'sale-orders-page';
const TYPE = 'sale-orders';

/**
 * Инициализация страницы покупок
 */
export function initSaleOrdersPage() {
    initOperationPage(PAGE_ID, TYPE);
}

/**
 * Открытие страницы покупок
 */
export function openSaleOrdersPage() {
    openOperationPage(PAGE_ID);
    loadDealsData();
}

/**
 * Загрузка данных сделок (активные + история)
 */
async function loadDealsData() {
    console.log('🛍️ Loading deals data...');
    
    try {
        const [activeDeals, historyDeals] = await Promise.all([
            getMyDealsAPI(),
            getDealsHistoryAPI()
        ]);
        
        renderDeals('active', activeDeals || []);
        renderDeals('completed', historyDeals || []);
        
        await updateActivityCounts();
        
        console.log(`✅ Deals loaded: ${(activeDeals || []).length} active, ${(historyDeals || []).length} completed`);
    } catch (error) {
        console.error('❌ Error loading deals:', error);
        showError('active', 'Ошибка загрузки покупок');
        showError('completed', 'Ошибка загрузки покупок');
    }
}

/**
 * Рендеринг списка сделок
 * @param {string} status - 'active' или 'completed'
 * @param {Array} deals - Массив сделок
 */
function renderDeals(status, deals) {
    const containerId = `sale-orders-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!deals || deals.length === 0) {
        container.innerHTML = '<p class="loading">Нет покупок</p>';
        return;
    }
    
    container.innerHTML = '';
    
    deals.forEach(deal => {
        const card = createDealCard(deal, status);
        card.classList.add('operation-item-card-clickable');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Сделка ${deal.deal_number || deal.id}`);
        card.addEventListener('click', () => openDealDetailPage(deal));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDealDetailPage(deal);
            }
        });
        container.appendChild(card);
    });
}

/**
 * Показать ошибку
 */
function showError(status, message) {
    const containerId = `sale-orders-${status}-items`;
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="loading">${message}</p>`;
    }
}
