// ========== REFACTORING STEP 5.1: loadStats ==========
// Модуль обработчиков статистики админки
// Дата начала: 2024-12-19
// Статус: В процессе

import { getProductViewStatsAPI, getVisitStatsAPI, getVisitsListAPI } from '../api.js';

/**
 * Загрузка и отображение статистики
 */
export async function loadStats() {
    const statsContent = document.getElementById('stats-content');
    if (!statsContent) return;
    
    statsContent.innerHTML = '<p class="loading">Загрузка статистики...</p>';
    
    try {
        // Загружаем общую статистику, список посещений и топ товаров параллельно
        const [stats, visits, topProducts] = await Promise.all([
            getVisitStatsAPI(),
            getVisitsListAPI(20, 0),
            getProductViewStatsAPI(10)
        ]);
        
        // Формируем HTML для статистики
        let html = `
            <div class="stats-section">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">📊 Общая статистика</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_visits}</div>
                        <div class="stat-label">Всего посещений</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.unique_visitors}</div>
                        <div class="stat-label">Уникальных посетителей</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.shop_visits}</div>
                        <div class="stat-label">Просмотров магазина</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.product_views}</div>
                        <div class="stat-label">Просмотров товаров</div>
                    </div>
                </div>
            </div>
        `;
        
        // Топ товаров
        if (topProducts && topProducts.length > 0) {
            html += `
                <div class="stats-section" style="margin-top: 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">🔥 Топ товаров по просмотрам</h3>
                    <div class="top-products-list">
            `;
            
            topProducts.forEach((product, index) => {
                html += `
                    <div class="top-product-item" style="
                        background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                        backdrop-filter: blur(20px);
                        border-radius: 12px;
                        padding: 12px 16px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <div style="
                                width: 32px;
                                height: 32px;
                                border-radius: 8px;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: 700;
                                font-size: 14px;
                                color: white;
                            ">${index + 1}</div>
                            <div style="flex: 1;">
                                <div style="font-size: 15px; font-weight: 600; color: var(--tg-theme-text-color); margin-bottom: 4px;">
                                    ${product.product_name}
                                </div>
                            </div>
                        </div>
                        <div style="
                            background: rgba(76, 175, 80, 0.2);
                            color: #4CAF50;
                            padding: 6px 12px;
                            border-radius: 8px;
                            font-weight: 600;
                            font-size: 14px;
                        ">
                            ${product.view_count} ${product.view_count === 1 ? 'просмотр' : product.view_count < 5 ? 'просмотра' : 'просмотров'}
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Последние посещения
        if (visits && visits.length > 0) {
            html += `
                <div class="stats-section" style="margin-top: 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">👥 Последние посещения</h3>
                    <div class="recent-visits-list">
            `;
            
            visits.slice(0, 10).forEach(visit => {
                const visitDate = new Date(visit.visited_at);
                const dateStr = visitDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                html += `
                    <div class="visit-item" style="
                        background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                        backdrop-filter: blur(20px);
                        border-radius: 12px;
                        padding: 12px 16px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <div style="flex: 1;">
                            <div style="font-size: 14px; color: var(--tg-theme-text-color); margin-bottom: 4px;">
                                ${visit.product_name ? `📦 ${visit.product_name}` : '🏪 Просмотр магазина'}
                            </div>
                            <div style="font-size: 12px; color: var(--tg-theme-hint-color);">
                                ${dateStr}
                            </div>
                        </div>
                        <div style="
                            font-size: 12px;
                            color: var(--tg-theme-hint-color);
                            font-family: monospace;
                        ">
                            ID: ${visit.visitor_id}
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Если нет данных
        if (stats.total_visits === 0) {
            html = '<p class="loading">Статистика пока пуста. Посетители появятся здесь после просмотра вашего магазина.</p>';
        }
        
        statsContent.innerHTML = html;
    } catch (error) {
        console.error('❌ Error loading stats:', error);
        let errorMessage = 'Ошибка загрузки статистики';
        if (error.message) {
            errorMessage = error.message;
        }
        statsContent.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}

