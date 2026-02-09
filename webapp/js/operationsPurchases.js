// Модуль для страницы продаж
import { updateActivityCounts } from './activityIndicators.js';
import { getMyPurchasesAPI, getPurchasesHistoryAPI } from './api/purchases.js';
import { createOperationCard, initOperationPage, openOperationPage } from './operationsBase.js';
import { openOperationDetailPage } from './operationsDetail.js';

const PAGE_ID = 'purchases-page';
const TYPE = 'purchases';

/**
 * Инициализация страницы продаж
 */
export function initPurchasesPage() {
    initOperationPage(PAGE_ID, TYPE);
}

/**
 * Открытие страницы продаж
 */
export function openPurchasesPage() {
    openOperationPage(PAGE_ID);
    loadPurchasesData();
}

/**
 * Загрузка данных продаж.
 * Бэкенд: /api/purchases/my — только активные, /api/purchases/history — только завершённые/отменённые.
 * Объединяем оба списка для вкладки «Завершённые».
 */
async function loadPurchasesData() {
    console.log('💰 Loading purchases data...');
    
    try {
        const [activeFromApi, historyFromApi] = await Promise.all([
            getMyPurchasesAPI(),
            getPurchasesHistoryAPI()
        ]);
        const allPurchases = [...(activeFromApi || []), ...(historyFromApi || [])];
        
        const activePurchases = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled);
        const completedPurchases = (allPurchases || []).filter(p => p.is_completed || p.is_cancelled);
        
        // Рендерим активные
        renderPurchases('active', activePurchases);
        
        // Рендерим завершённые
        renderPurchases('completed', completedPurchases);
        
        // Обновляем индикаторы активности
        await updateActivityCounts();
        
        console.log(`✅ Purchases loaded: ${activePurchases.length} active, ${completedPurchases.length} completed`);
    } catch (error) {
        console.error('❌ Error loading purchases:', error);
        showError('active', 'Ошибка загрузки продаж');
        showError('completed', 'Ошибка загрузки продаж');
    }
}

/**
 * Рендеринг списка продаж
 * @param {string} status - Статус ('active' или 'completed')
 * @param {Array} purchases - Массив продаж
 */
function renderPurchases(status, purchases) {
    const containerId = `purchases-${status}-items`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!purchases || purchases.length === 0) {
        container.innerHTML = '<p class="loading">Нет продаж</p>';
        return;
    }
    
    container.innerHTML = '';
    
    purchases.forEach(purchase => {
        const card = createOperationCard(purchase, TYPE, status);
        card.classList.add('operation-item-card-clickable');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Продажа: ${(purchase.product && purchase.product.name) || 'Товар'}`);
        card.addEventListener('click', () => openOperationDetailPage(TYPE, purchase));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openOperationDetailPage(TYPE, purchase);
            }
        });
        container.appendChild(card);
    });
}

/**
 * Показать ошибку
 */
function showError(status, message) {
    const containerId = `purchases-${status}-items`;
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="loading">${message}</p>`;
    }
}
