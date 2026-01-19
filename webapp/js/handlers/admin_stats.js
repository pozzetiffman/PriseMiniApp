// ========== REFACTORING STEP 5.1: loadStats ==========
// Модуль обработчиков статистики админки
// Дата начала: 2024-12-19
// Статус: В процессе

import {
    getProductViewStatsAPI,
    getVisitStatsAPI,
    getVisitsListAPI
} from '../api.js';
import { API_BASE, getBaseHeaders } from '../api/config.js';

// Глобальная переменная для хранения текущего периода фильтрации
let currentDateFilter = {
    period: 'all', // 'today', 'week', 'month', 'all', 'custom'
    dateFrom: null,
    dateTo: null
};

/**
 * Вычисляет даты для периода
 */
function getDateRangeForPeriod(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
        case 'today':
            return {
                dateFrom: today.toISOString().split('T')[0],
                dateTo: today.toISOString().split('T')[0]
            };
        case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return {
                dateFrom: weekAgo.toISOString().split('T')[0],
                dateTo: today.toISOString().split('T')[0]
            };
        case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return {
                dateFrom: monthAgo.toISOString().split('T')[0],
                dateTo: today.toISOString().split('T')[0]
            };
        case 'all':
        default:
            return {
                dateFrom: null,
                dateTo: null
            };
    }
}

/**
 * Загрузка и отображение статистики
 */
export async function loadStats(dateFrom = null, dateTo = null) {
    const statsContent = document.getElementById('stats-content');
    if (!statsContent) return;
    
    // Если даты не указаны, используем текущий период фильтрации
    if (dateFrom === null && dateTo === null) {
        if (currentDateFilter.period === 'custom') {
            // Для ручного выбора используем сохраненные даты (если они есть)
            dateFrom = currentDateFilter.dateFrom || null;
            dateTo = currentDateFilter.dateTo || null;
        } else {
            // Для предустановленных периодов вычисляем даты
            const dateRange = getDateRangeForPeriod(currentDateFilter.period);
            dateFrom = dateRange.dateFrom;
            dateTo = dateRange.dateTo;
        }
    }
    
    statsContent.innerHTML = '<p class="loading">Загрузка статистики...</p>';
    
    try {
        // Получаем контекст приложения для определения владельца магазина
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext || !appContext.shop_owner_id) {
            statsContent.innerHTML = '<p class="loading">Ошибка: не удалось определить владельца магазина</p>';
            return;
        }
        
        const shopOwnerId = Number(appContext.shop_owner_id);
        if (isNaN(shopOwnerId)) {
            statsContent.innerHTML = '<p class="loading">Ошибка: неверный ID владельца магазина</p>';
            return;
        }
        
        // Загружаем общую статистику, список посещений и топ товаров параллельно
        const [stats, visits, topProducts] = await Promise.all([
            getVisitStatsAPI(dateFrom, dateTo),
            getVisitsListAPI(20, 0, dateFrom, dateTo),
            getProductViewStatsAPI(10, dateFrom, dateTo)
        ]);
        
        // Загружаем дополнительные данные для статистики
        let ordersCount = 0;
        let reservationsCount = 0;
        let soldProductsCount = 0;
        let totalProductsCount = 0;
        let favoritesCount = 0;
        
        try {
            // Используем новый endpoint для получения ВСЕХ данных статистики с фильтром по дате
            // Все логи идут на бэкенд (терминал), а не в консоль браузера
            let shopStatsUrl = `${API_BASE}/api/shop-visits/shop-stats`;
            const params = [];
            if (dateFrom) params.push(`date_from=${encodeURIComponent(dateFrom)}`);
            if (dateTo) params.push(`date_to=${encodeURIComponent(dateTo)}`);
            if (params.length > 0) shopStatsUrl += `?${params.join('&')}`;
            
            const shopStatsResponse = await fetch(shopStatsUrl, {
                headers: getBaseHeaders()
            });
            
            if (shopStatsResponse.ok) {
                const shopStats = await shopStatsResponse.json();
                ordersCount = shopStats.total_orders || 0;
                reservationsCount = shopStats.total_reservations || 0;
                soldProductsCount = shopStats.total_sold_products || 0;
                totalProductsCount = shopStats.total_products || 0;
                favoritesCount = shopStats.total_favorites || 0;
            } else {
                // Fallback на старые endpoints если новый не работает
                const errorText = await shopStatsResponse.text();
                throw new Error(`Shop stats error: ${shopStatsResponse.status} - ${errorText}`);
            }
        } catch (error) {
            // Логирование ошибок убрано - все логи на бэкенде (терминале)
            // Устанавливаем значения по умолчанию
            ordersCount = 0;
            reservationsCount = 0;
            soldProductsCount = 0;
            totalProductsCount = 0;
            favoritesCount = 0;
        }
        
        // Формируем HTML для статистики
        let html = `
            <div class="stats-section">
                <div class="stats-filter-container" style="margin-bottom: 16px;">
                    <div class="stats-period-filter">
                        <label for="stats-period-select" style="font-size: 13px; color: var(--tg-theme-hint-color); margin-right: 8px;">Период:</label>
                        <select id="stats-period-select" class="stats-period-select">
                            <option value="today" ${currentDateFilter.period === 'today' ? 'selected' : ''}>Сегодня</option>
                            <option value="week" ${currentDateFilter.period === 'week' ? 'selected' : ''}>Неделя</option>
                            <option value="month" ${currentDateFilter.period === 'month' ? 'selected' : ''}>Месяц</option>
                            <option value="all" ${currentDateFilter.period === 'all' ? 'selected' : ''}>Все время</option>
                            <option value="custom" ${currentDateFilter.period === 'custom' ? 'selected' : ''}>Вручную</option>
                        </select>
                    </div>
                    <div class="stats-custom-dates" id="stats-custom-dates" style="display: ${currentDateFilter.period === 'custom' ? 'flex' : 'none'}; gap: 8px; align-items: center; margin-top: 12px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <label for="stats-date-from" style="font-size: 13px; color: var(--tg-theme-hint-color);">От:</label>
                            <input type="date" id="stats-date-from" class="stats-date-input" value="${currentDateFilter.dateFrom || ''}">
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <label for="stats-date-to" style="font-size: 13px; color: var(--tg-theme-hint-color);">До:</label>
                            <input type="date" id="stats-date-to" class="stats-date-input" value="${currentDateFilter.dateTo || ''}">
                        </div>
                    </div>
                </div>
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: var(--tg-theme-text-color);">📊 Общая статистика</h3>
                <div class="stats-grid">
                    <div class="stat-card" draggable="false" data-stat-type="total_visits">
                        <div class="stat-value">${stats.total_visits}</div>
                        <div class="stat-label">Всего посещений</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="unique_visitors">
                        <div class="stat-value">${stats.unique_visitors}</div>
                        <div class="stat-label">Уникальных посетителей</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="shop_visits">
                        <div class="stat-value">${stats.shop_visits}</div>
                        <div class="stat-label">Просмотров магазина</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="product_views">
                        <div class="stat-value">${stats.product_views}</div>
                        <div class="stat-label">Просмотров товаров</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="total_products">
                        <div class="stat-value">${totalProductsCount}</div>
                        <div class="stat-label">Всего товаров</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="sold_products">
                        <div class="stat-value">${soldProductsCount}</div>
                        <div class="stat-label">Проданных товаров</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="orders">
                        <div class="stat-value">${ordersCount}</div>
                        <div class="stat-label">Заказов</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="reservations">
                        <div class="stat-value">${reservationsCount}</div>
                        <div class="stat-label">Резерваций</div>
                    </div>
                    <div class="stat-card" draggable="false" data-stat-type="favorites">
                        <div class="stat-value">${favoritesCount}</div>
                        <div class="stat-label">Избранное</div>
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
                    <div class="top-product-item" draggable="false" style="
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
                    <div class="visit-item" draggable="false" style="
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
        if (stats.total_visits === 0 && !dateFrom && !dateTo) {
            html = '<p class="loading">Статистика пока пуста. Посетители появятся здесь после просмотра вашего магазина.</p>';
        }
        
        statsContent.innerHTML = html;
        
        // Инициализируем обработчики для выпадающего списка периода
        const periodSelect = statsContent.querySelector('#stats-period-select');
        const customDatesContainer = statsContent.querySelector('#stats-custom-dates');
        const dateFromInput = statsContent.querySelector('#stats-date-from');
        const dateToInput = statsContent.querySelector('#stats-date-to');
        
        if (periodSelect) {
            periodSelect.addEventListener('change', () => {
                const period = periodSelect.value;
                currentDateFilter.period = period;
                
                // Показываем/скрываем поля для ручного ввода даты
                if (period === 'custom') {
                    customDatesContainer.style.display = 'flex';
                    // НЕ обновляем статистику при выборе "Вручную" - ждем пока пользователь выберет даты
                } else {
                    customDatesContainer.style.display = 'none';
                    // Очищаем поля для ручного ввода
                    if (dateFromInput) dateFromInput.value = '';
                    if (dateToInput) dateToInput.value = '';
                    currentDateFilter.dateFrom = null;
                    currentDateFilter.dateTo = null;
                    
                    // Вычисляем даты для периода
                    const dateRange = getDateRangeForPeriod(period);
                    currentDateFilter.dateFrom = dateRange.dateFrom;
                    currentDateFilter.dateTo = dateRange.dateTo;
                    
                    // Перезагружаем статистику с новым периодом
                    loadStats(dateRange.dateFrom, dateRange.dateTo);
                }
            });
        }
        
        // Функция для обновления статистики при изменении дат
        // Обновляет статистику ТОЛЬКО когда обе даты заполнены
        const updateStatsFromDates = () => {
            if (currentDateFilter.period === 'custom') {
                // Получаем актуальные значения из полей (пустая строка преобразуется в null)
                const dateFrom = dateFromInput ? (dateFromInput.value.trim() || null) : null;
                const dateTo = dateToInput ? (dateToInput.value.trim() || null) : null;
                
                // Обновляем сохраненные значения
                currentDateFilter.dateFrom = dateFrom;
                currentDateFilter.dateTo = dateTo;
                
                // Обновляем статистику ТОЛЬКО если обе даты заполнены
                // Не обновляем если пользователь еще выбирает даты
                if (dateFrom && dateTo) {
                    loadStats(dateFrom, dateTo);
                }
                // Если хотя бы одна дата пустая - НЕ обновляем, ждем пока пользователь выберет обе даты
            }
        };
        
        // Функция для обработки сброса даты (когда пользователь нажимает "Сбросить" в календаре)
        const handleDateReset = (inputElement, isFromDate) => {
            if (currentDateFilter.period === 'custom') {
                // Принудительно очищаем поле, если оно не очистилось автоматически
                if (inputElement.value) {
                    inputElement.value = '';
                }
                
                if (isFromDate) {
                    currentDateFilter.dateFrom = null;
                } else {
                    currentDateFilter.dateTo = null;
                }
                
                // Если обе даты пустые, переключаемся на "Все время"
                if (!currentDateFilter.dateFrom && !currentDateFilter.dateTo) {
                    currentDateFilter.period = 'all';
                    if (periodSelect) {
                        periodSelect.value = 'all';
                    }
                    if (customDatesContainer) {
                        customDatesContainer.style.display = 'none';
                    }
                    loadStats(null, null);
                } else {
                    // Если одна дата сброшена, просто очищаем её и не обновляем статистику
                    // Пользователь может выбрать другую дату
                }
            }
        };
        
        // Обработчики для полей ввода даты
        // Обновление происходит ТОЛЬКО после выбора обеих дат (при blur обоих полей)
        if (dateFromInput) {
            let lastValue = dateFromInput.value;
            let checkInterval = null;
            
            // Функция для проверки сброса (без обновления статистики)
            const checkForReset = () => {
                const currentValue = dateFromInput.value || '';
                // Если значение изменилось
                if (currentValue !== lastValue) {
                    // Если поле было заполнено, но теперь пустое - значит нажали "Сбросить"
                    if (lastValue && !currentValue) {
                        // Принудительно очищаем поле
                        dateFromInput.value = '';
                        handleDateReset(dateFromInput, true);
                    }
                    lastValue = currentValue;
                }
            };
            
            // Отслеживаем изменения значения через периодическую проверку (только для сброса)
            const startChecking = () => {
                if (checkInterval) clearInterval(checkInterval);
                lastValue = dateFromInput.value || '';
                checkInterval = setInterval(checkForReset, 50);
            };
            
            const stopChecking = () => {
                if (checkInterval) {
                    clearInterval(checkInterval);
                    checkInterval = null;
                }
            };
            
            // focus - начинаем проверку когда открывается календарь (только для отслеживания сброса)
            dateFromInput.addEventListener('focus', startChecking);
            
            // blur - останавливаем проверку и проверяем, можно ли обновить статистику
            dateFromInput.addEventListener('blur', () => {
                stopChecking();
                // Задержка, чтобы значение успело обновиться после закрытия календаря
                setTimeout(() => {
                    const currentValue = dateFromInput.value || '';
                    // Проверяем сброс
                    if (!currentValue && lastValue) {
                        handleDateReset(dateFromInput, true);
                    }
                    lastValue = currentValue;
                    
                    // Обновляем статистику ТОЛЬКО если обе даты заполнены
                    // Это происходит после закрытия календаря, когда пользователь закончил выбор
                    updateStatsFromDates();
                }, 200);
            });
        }
        
        if (dateToInput) {
            let lastValue = dateToInput.value;
            let checkInterval = null;
            
            // Функция для проверки сброса (без обновления статистики)
            const checkForReset = () => {
                const currentValue = dateToInput.value || '';
                // Если значение изменилось
                if (currentValue !== lastValue) {
                    // Если поле было заполнено, но теперь пустое - значит нажали "Сбросить"
                    if (lastValue && !currentValue) {
                        // Принудительно очищаем поле
                        dateToInput.value = '';
                        handleDateReset(dateToInput, false);
                    }
                    lastValue = currentValue;
                }
            };
            
            // Отслеживаем изменения значения через периодическую проверку (только для сброса)
            const startChecking = () => {
                if (checkInterval) clearInterval(checkInterval);
                lastValue = dateToInput.value || '';
                checkInterval = setInterval(checkForReset, 50);
            };
            
            const stopChecking = () => {
                if (checkInterval) {
                    clearInterval(checkInterval);
                    checkInterval = null;
                }
            };
            
            // focus - начинаем проверку когда открывается календарь (только для отслеживания сброса)
            dateToInput.addEventListener('focus', startChecking);
            
            // blur - останавливаем проверку и проверяем, можно ли обновить статистику
            dateToInput.addEventListener('blur', () => {
                stopChecking();
                // Задержка, чтобы значение успело обновиться после закрытия календаря
                setTimeout(() => {
                    const currentValue = dateToInput.value || '';
                    // Проверяем сброс
                    if (!currentValue && lastValue) {
                        handleDateReset(dateToInput, false);
                    }
                    lastValue = currentValue;
                    
                    // Обновляем статистику ТОЛЬКО если обе даты заполнены
                    // Это происходит после закрытия календаря, когда пользователь закончил выбор
                    updateStatsFromDates();
                }, 200);
            });
        }
        
        // Инициализируем обработчики клика только для карточек статистики (для будущей функциональности)
        const statCards = statsContent.querySelectorAll('.stat-card');
        statCards.forEach(card => {
            // Агрессивно блокируем все события перетаскивания
            card.setAttribute('draggable', 'false');
            
            // Блокируем drag события
            const blockDrag = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            };
            card.addEventListener('dragstart', blockDrag, true);
            card.addEventListener('drag', blockDrag, true);
            card.addEventListener('dragend', blockDrag, true);
            
            // Блокируем touch события для предотвращения перетаскивания на мобильных
            let touchStartY = 0;
            card.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            
            card.addEventListener('touchmove', (e) => {
                const touchY = e.touches[0].clientY;
                const deltaY = Math.abs(touchY - touchStartY);
                // Разрешаем только вертикальную прокрутку, блокируем горизонтальную
                if (deltaY < 10) {
                    // Если движение очень маленькое, не блокируем (это может быть клик)
                    return;
                }
            }, { passive: true });
            
            // Обработчик клика для будущей функциональности (краткое инфо)
            card.addEventListener('click', () => {
                // TODO: Здесь будет добавлена функциональность показа краткой информации по статистике
                // const statType = card.dataset.statType;
                // showStatDetails(statType);
            });
            
            // Обработчик для всех карточек статистики - показ информации при нажатии и удержании
            const statType = card.dataset.statType;
            
            // Описания для каждой статистики
            const statDescriptions = {
                'total_visits': {
                    title: '👥 Всего посещений',
                    text: 'Общее количество всех посещений вашего магазина и просмотров товаров за выбранный период.'
                },
                'unique_visitors': {
                    title: '👤 Уникальных посетителей',
                    text: 'Количество уникальных пользователей, которые посетили ваш магазин или просмотрели товары за выбранный период.'
                },
                'shop_visits': {
                    title: '🏪 Просмотров магазина',
                    text: 'Количество просмотров главной страницы магазина (список товаров) за выбранный период.'
                },
                'product_views': {
                    title: '📦 Просмотров товаров',
                    text: 'Количество просмотров отдельных товаров (открытие карточки товара) за выбранный период.'
                },
                'total_products': {
                    title: '📋 Всего товаров',
                    text: 'Общее количество товаров в вашем магазине, включая проданные и скрытые.'
                },
                'sold_products': {
                    title: '✅ Проданных товаров',
                    text: 'Количество товаров, которые были проданы через систему продаж за выбранный период.'
                },
                'orders': {
                    title: '🛒 Заказов',
                    text: 'Общее количество заказов за выбранный период, включая отмененные и выполненные.'
                },
                'reservations': {
                    title: '🔒 Резерваций',
                    text: 'Общее количество резерваций товаров за выбранный период, включая завершенные и активные.'
                },
                'favorites': {
                    title: '📌 Избранное',
                    text: 'Общее количество товаров, добавленных в избранное за выбранный период. Учитываются все товары, включая проданные и скрытые.'
                }
            };
            
            if (statDescriptions[statType]) {
                let pressTimer = null;
                let infoTooltip = null;
                
                const description = statDescriptions[statType];
                
                // Функция показа информации
                const showStatInfo = () => {
                    // Удаляем предыдущий tooltip если есть
                    if (infoTooltip) {
                        infoTooltip.remove();
                    }
                    
                    // Создаем tooltip с информацией
                    infoTooltip = document.createElement('div');
                    infoTooltip.className = 'stat-info-tooltip';
                    infoTooltip.innerHTML = `
                        <div class="stat-info-content">
                            <div class="stat-info-title">${description.title}</div>
                            <div class="stat-info-text">
                                ${description.text}
                            </div>
                        </div>
                    `;
                    
                    // Позиционируем tooltip относительно карточки
                    const rect = card.getBoundingClientRect();
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                    
                    // Добавляем tooltip в DOM сначала для измерения размеров
                    document.body.appendChild(infoTooltip);
                    
                    // Измеряем размеры tooltip
                    const tooltipRect = infoTooltip.getBoundingClientRect();
                    const tooltipWidth = tooltipRect.width;
                    const tooltipHeight = tooltipRect.height;
                    
                    // Вычисляем позицию с учетом границ экрана
                    let top = rect.bottom + scrollTop + 10;
                    let left = rect.left + scrollLeft;
                    
                    // Проверяем, не выходит ли tooltip за правую границу
                    if (left + tooltipWidth > window.innerWidth + scrollLeft) {
                        left = window.innerWidth + scrollLeft - tooltipWidth - 10;
                    }
                    
                    // Проверяем, не выходит ли tooltip за левую границу
                    if (left < scrollLeft + 10) {
                        left = scrollLeft + 10;
                    }
                    
                    // Проверяем, не выходит ли tooltip за нижнюю границу
                    if (top + tooltipHeight > window.innerHeight + scrollTop - 10) {
                        // Показываем сверху карточки
                        top = rect.top + scrollTop - tooltipHeight - 10;
                    }
                    
                    // Проверяем, не выходит ли tooltip за верхнюю границу
                    if (top < scrollTop + 10) {
                        top = scrollTop + 10;
                    }
                    
                    infoTooltip.style.position = 'fixed';
                    infoTooltip.style.top = `${top}px`;
                    infoTooltip.style.left = `${left}px`;
                    infoTooltip.style.zIndex = '10000';
                    
                    // Анимация появления
                    requestAnimationFrame(() => {
                        infoTooltip.style.opacity = '0';
                        infoTooltip.style.transform = 'translateY(-10px)';
                        requestAnimationFrame(() => {
                            infoTooltip.style.transition = 'all 0.3s ease';
                            infoTooltip.style.opacity = '1';
                            infoTooltip.style.transform = 'translateY(0)';
                        });
                    });
                };
                
                // Функция скрытия информации
                const hideStatInfo = () => {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                    
                    if (infoTooltip) {
                        infoTooltip.style.transition = 'all 0.2s ease';
                        infoTooltip.style.opacity = '0';
                        infoTooltip.style.transform = 'translateY(-10px)';
                        setTimeout(() => {
                            if (infoTooltip && infoTooltip.parentNode) {
                                infoTooltip.remove();
                            }
                            infoTooltip = null;
                        }, 200);
                    }
                };
                
                // Обработчики для мобильных (touch)
                let touchStartX = 0;
                let touchStartY = 0;
                let touchMoved = false;
                
                card.addEventListener('touchstart', (e) => {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    touchMoved = false;
                    
                    pressTimer = setTimeout(() => {
                        // Показываем tooltip только если палец не двигался
                        if (!touchMoved) {
                            showStatInfo();
                        }
                    }, 300); // Показываем через 300ms удержания
                }, { passive: true });
                
                card.addEventListener('touchmove', (e) => {
                    // Проверяем, двигается ли палец
                    const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
                    const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
                    
                    // Если движение больше 10px - это прокрутка, не удержание
                    if (deltaX > 10 || deltaY > 10) {
                        touchMoved = true;
                        hideStatInfo();
                    }
                }, { passive: true });
                
                card.addEventListener('touchend', () => {
                    hideStatInfo();
                }, { passive: true });
                
                card.addEventListener('touchcancel', () => {
                    hideStatInfo();
                }, { passive: true });
                
                // Обработчики для десктопа (mouse)
                card.addEventListener('mousedown', (e) => {
                    pressTimer = setTimeout(() => {
                        showStatInfo();
                    }, 300); // Показываем через 300ms удержания
                });
                
                card.addEventListener('mouseup', () => {
                    hideStatInfo();
                });
                
                card.addEventListener('mouseleave', () => {
                    hideStatInfo();
                });
                
                // Скрываем tooltip при прокрутке
                const hideOnScroll = () => {
                    hideStatInfo();
                };
                
                window.addEventListener('scroll', hideOnScroll, { passive: true });
                
                // Сохраняем ссылку на обработчик для возможной очистки
                card._hideOnScroll = hideOnScroll;
            }
        });
        
        // Блокируем перетаскивание и взаимодействие для элементов топ товаров и посещений
        const blockDragEvents = (item) => {
            item.setAttribute('draggable', 'false');
            const blockDrag = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            item.addEventListener('dragstart', blockDrag, true);
            item.addEventListener('drag', blockDrag, true);
            item.addEventListener('dragend', blockDrag, true);
            
            // Блокируем touch события
            item.addEventListener('touchstart', (e) => {
                // Блокируем только если это не вертикальная прокрутка
                if (e.touches.length === 1) {
                    // Разрешаем прокрутку родителя
                    return;
                }
            }, { passive: true });
            
            // Блокируем все клики и взаимодействия
            item.style.pointerEvents = 'none';
        };
        
        const topProductItems = statsContent.querySelectorAll('.top-product-item');
        topProductItems.forEach(blockDragEvents);
        
        const visitItems = statsContent.querySelectorAll('.visit-item');
        visitItems.forEach(blockDragEvents);
    } catch (error) {
        // Логирование ошибок убрано - все логи на бэкенде (терминале)
        let errorMessage = 'Ошибка загрузки статистики';
        if (error.message) {
            errorMessage = error.message;
        }
        statsContent.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}

