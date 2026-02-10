// Базовый модуль для страниц операций (заказы, резервации, продажи, покупки)
// Предоставляет общую логику для всех типов операций

// Импорты утилит
import { API_BASE } from './api/config.js';
import { calculateReservationTimeLeft, formatDateToMoscow } from './utils/dateUtils.js';
import { createImageContainer, getProductImageUrl } from './utils/imageUtils.js';
import { getProductPriceDisplay } from './utils/priceUtils.js';

/**
 * Единый список всех контейнеров-страниц приложения.
 * Любая функция открытия страницы ОБЯЗАНА скрыть все остальные из этого списка.
 */
export const ALL_PAGE_IDS = [
    'main-content',
    'product-page',
    'favorites-page',
    'cart-page',
    'cart-page-new',
    'profile-page',
    'profile-details-page',
    'orders-page',
    'reservations-page',
    'purchases-page',
    'sale-orders-page',
    'sale-order-page',
    'operation-detail-page',
    'admin-page',
    'edit-product-page',
    'order-page',
    'deal-checkout-page',
    'purchase-page',
    'settings-page'
];

/**
 * Скрывает ВСЕ страницы из общего списка.
 * Вызывать перед display = 'block' в любой функции открытия страницы.
 */
export function hideAllPages() {
    ALL_PAGE_IDS.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove('is-active');
            element.style.display = 'none';
        }
    });
}

/**
 * Показать только одну страницу (остальные скрыты).
 * @param {string} pageId - ID контейнера страницы
 */
export function showOnlyPage(pageId) {
    hideAllPages();
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('is-active');
        page.style.display = 'block';
    }
}

/**
 * Возврат на главный экран (main-content). Источник истины — .is-active.
 * Использовать при закрытии profile/favorites/cart/admin.
 */
export function goToMainContent() {
    hideAllPages();
    const main = document.getElementById('main-content');
    if (main) {
        main.classList.add('is-active');
        main.style.display = 'block';
        main.scrollTop = 0;
        if (main.scrollTo) main.scrollTo(0, 0);
    }
    // Диагностика (временно): при аномалии — не только main-content в is-active
    const activeIds = [...document.querySelectorAll('.is-active')].map(el => el.id).filter(Boolean);
    if (activeIds.length !== 1 || activeIds[0] !== 'main-content') {
        console.log('[NAV] goToMainContent: is-active after', activeIds);
    }
}

/** Селекторы оверлеев/бэкдропов, которые могут перехватывать клики после закрытия сделки. */
const OVERLAY_SELECTORS = [
    '#cart-bottom-sheet',
    '#product-page-bottom-sheet',
    /* ИСКЛЮЧЕНО: '#main-menu-dropdown' и '.main-menu-dropdown-backdrop' — меню само управляет своим состоянием через menu.js */
    /* Не очищаем меню, чтобы не ломать его работу после открытия profile-page */
    '.cart-bottom-sheet-backdrop',
];

/** Классы body, которые могли быть добавлены при открытии sheet/modal. */
const BODY_CLEAN_CLASSES = ['bottom-sheet-open', 'modal-open', 'sheet-open', 'no-scroll', 'lock-scroll'];

/**
 * Жёсткая очистка оверлеев и классов body при закрытии экрана сделки.
 * Скрывает overlay-элементы и отключает pointer-events, чтобы клики доходили до профиля.
 * Не удаляет узлы из DOM — только скрывает и снимает классы.
 * 
 * ВАЖНО: Не трогает #main-menu-dropdown и .main-menu-dropdown-backdrop — меню само управляет своим состоянием.
 */
export function clearOverlaysAndBodyClasses() {
    const body = document.body;
    if (body) {
        BODY_CLEAN_CLASSES.forEach(c => body.classList.remove(c));
    }
    OVERLAY_SELECTORS.forEach(sel => {
        try {
            const elements = document.querySelectorAll(sel);
            elements.forEach(el => {
                if (el && el.style) {
                    el.style.display = 'none';
                    el.style.pointerEvents = 'none';
                }
            });
        } catch (_) { /* игнор невалидного селектора */ }
    });
}

/**
 * Инициализация страницы операции
 * @param {string} pageId - ID страницы (orders-page, reservations-page, etc.)
 * @param {string} type - Тип операции ('orders', 'reservations', 'purchases', 'sale-orders')
 */
export function initOperationPage(pageId, type) {
    console.log(`📦 Initializing ${type} page...`);
    
    const page = document.getElementById(pageId);
    if (!page) {
        console.error(`❌ Page ${pageId} not found`);
        return;
    }
    
    // Настройка кнопки закрытия
    const closeBtn = page.querySelector('.operation-top-menu-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            closeOperationPage(pageId);
        };
    }
    
    // Настройка вкладок (Активные / Завершённые)
    const tabs = page.querySelectorAll('.operation-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const status = tab.dataset.status;
            switchOperationTab(pageId, status);
        });
    });
    
    console.log(`✅ ${type} page initialized`);
}

/**
 * Открытие страницы операции
 * @param {string} pageId - ID страницы
 */
export function openOperationPage(pageId) {
    console.log(`📦 Opening ${pageId}...`);
    
    const page = document.getElementById(pageId);
    if (!page) {
        console.error(`❌ Page ${pageId} not found`);
        return;
    }
    
    // Единый способ: скрыть все страницы, затем показать нужную
    hideAllPages();
    page.classList.add('is-active');
    page.style.display = 'block';
    
    // Сбрасываем скролл
    page.scrollTop = 0;
    if (page.scrollTo) {
        page.scrollTo(0, 0);
    }
    
    // Переключаем на вкладку "Активные" по умолчанию
    switchOperationTab(pageId, 'active');
    
    // Настраиваем обработчик скролла для верхнего меню
    setupScrollHandler(page);
    
    console.log(`✅ ${pageId} opened`);
}

/**
 * Настройка обработчика скролла для верхнего меню
 */
function setupScrollHandler(page) {
    const topMenu = page.querySelector('.operation-top-menu');
    if (!topMenu) return;
    
    const scrollHandler = () => {
        const scrollTop = page.scrollTop || 0;
        if (scrollTop > 20) {
            topMenu.classList.add('scrolled');
        } else {
            topMenu.classList.remove('scrolled');
        }
    };
    
    page.addEventListener('scroll', scrollHandler, { passive: true });
    page.addEventListener('touchmove', scrollHandler, { passive: true });
    setTimeout(() => {
        scrollHandler();
    }, 0);
}

/**
 * Публичная обёртка для настройки скролла верхнего меню на любой странице (edit-product, order, purchase, settings).
 */
export function setupPageScrollHandler(pageElement) {
    if (pageElement) setupScrollHandler(pageElement);
}

/**
 * Закрытие страницы операции
 * @param {string} pageId - ID страницы
 */
export function closeOperationPage(pageId) {
    console.log(`📦 Closing ${pageId}...`);
    
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove('is-active');
        page.style.display = 'none';
    }
    
    // Возвращаемся в профиль (state-класс + display для консистентности с навигацией)
    const profilePage = document.getElementById('profile-page');
    if (profilePage) {
        profilePage.classList.add('is-active');
        profilePage.style.display = 'block';
    }
    
    // Обновляем индикаторы активности при возврате (чтобы отразить возможные изменения)
    // Используем динамический импорт, чтобы избежать циклических зависимостей
    import('./activityIndicators.js').then(({ updateActivityCounts }) => {
        updateActivityCounts().catch(err => {
            console.error('❌ Error updating activity counts on page close:', err);
        });
    });
    
    console.log(`✅ ${pageId} closed`);
}

/**
 * Переключение вкладки (Активные / Завершённые).
 * Исправлено: используем getElementById по стабильному префиксу (orders, reservations, purchases, sale-orders),
 * чтобы гарантированно находить блоки *-active-content и *-completed-content.
 */
function switchOperationTab(pageId, status) {
    const page = document.getElementById(pageId);
    if (!page) return;

    const prefix = pageId.replace(/-page$/, '');
    const activeContent = document.getElementById(`${prefix}-active-content`);
    const completedContent = document.getElementById(`${prefix}-completed-content`);

    // Обновляем активную вкладку
    const tabs = page.querySelectorAll('.operation-tab');
    tabs.forEach(tab => {
        if (tab.dataset.status === status) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    if (status === 'active') {
        if (activeContent) {
            activeContent.style.display = 'block';
            activeContent.classList.add('active');
        }
        if (completedContent) {
            completedContent.style.display = 'none';
            completedContent.classList.remove('active');
        }
    } else {
        if (activeContent) {
            activeContent.style.display = 'none';
            activeContent.classList.remove('active');
        }
        if (completedContent) {
            completedContent.style.display = 'block';
            completedContent.classList.add('active');
        }
    }

    // После переключения вкладки — сброс скролла страницы, иначе completed-content может оказаться ниже viewport и казаться пустым
    if (page) {
        page.scrollTop = 0;
        if (page.scrollTo) page.scrollTo(0, 0);
    }
}

/**
 * Рендеринг карточки операции
 * @param {Object} item - Элемент операции
 * @param {string} type - Тип операции
 * @param {string} status - Статус ('active' или 'completed')
 * @returns {HTMLElement} - DOM элемент карточки
 */
export function createOperationCard(item, type, status) {
    const card = document.createElement('div');
    card.className = 'operation-item-card';
    card.dataset.type = type;
    card.dataset.status = status;
    
    // Базовые данные
    const product = item.product || {};
    const productUnavailable = !product.id || product.is_unavailable;
    const imageUrl = getProductImageUrl(product, API_BASE);
    const priceDisplay = getProductPriceDisplay(product);
    
    // Определяем статус и бейдж
    let statusBadge = '';
    let statusText = '';
    let statusColor = '';
    
    if (type === 'reservations') {
        if (status === 'active') {
            statusBadge = '<span class="operation-badge operation-badge-active">🔒 Активна</span>';
            statusText = item.reserved_until ? `⏰ До ${calculateReservationTimeLeft(item.reserved_until)}` : '';
        } else {
            statusBadge = '<span class="operation-badge operation-badge-completed">✅ Завершена</span>';
        }
    } else if (type === 'orders') {
        if (status === 'active') {
            statusBadge = '<span class="operation-badge operation-badge-active">⏳ В обработке</span>';
        } else {
            if (item.is_completed) {
                statusBadge = '<span class="operation-badge operation-badge-completed">✅ Выполнен</span>';
            } else if (item.is_cancelled) {
                statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменен</span>';
            }
        }
    } else if (type === 'purchases') {
        if (status === 'active') {
            statusBadge = '<span class="operation-badge operation-badge-active">⏳ Ожидание</span>';
        } else {
            if (item.is_completed) {
                statusBadge = '<span class="operation-badge operation-badge-completed">✅ Выполнена</span>';
            } else if (item.is_cancelled) {
                statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменена</span>';
            }
        }
    } else if (type === 'sale-orders') {
        if (status === 'active') {
            statusBadge = '<span class="operation-badge operation-badge-active">⏳ В обработке</span>';
        } else {
            if (item.is_completed) {
                statusBadge = '<span class="operation-badge operation-badge-completed">✅ Выполнен</span>';
            } else if (item.is_cancelled) {
                statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменен</span>';
            }
        }
    }
    
    // Форматирование даты
    const dateText = item.created_at ? formatDateToMoscow(item.created_at) : '';

    // Бейдж «Товар недоступен» в списке операций (snapshot может ссылаться на удалённый товар)
    const unavailableBadge = productUnavailable
        ? '<span class="operation-badge operation-badge-cancelled">⚠️ Товар недоступен</span>'
        : '';
    
    // Создаем изображение
    const imageContainer = createImageContainer(imageUrl, product.name || 'Товар', `[${type.toUpperCase()}]`);
    
    // Добавляем стили для изображения в карточке операции
    if (imageContainer) {
        imageContainer.style.width = '80px';
        imageContainer.style.height = '80px';
        imageContainer.style.flexShrink = '0';
        imageContainer.style.borderRadius = '12px';
        imageContainer.style.overflow = 'hidden';
    }
    
    // Формируем HTML (бейдж недоступности показываем сразу в карточке списка)
    card.innerHTML = `
        <div class="operation-item-info">
            <h3 class="operation-item-name">${product.name || 'Товар'}</h3>
            ${priceDisplay ? `<p class="operation-item-price">${priceDisplay}${item.quantity ? ` × ${item.quantity} шт.` : ''}</p>` : ''}
            ${statusText ? `<p class="operation-item-time">${statusText}</p>` : ''}
            ${dateText ? `<p class="operation-item-date">📅 ${dateText}</p>` : ''}
            ${unavailableBadge}
            ${statusBadge}
        </div>
    `;
    
    // Вставляем изображение в начало
    card.insertBefore(imageContainer, card.firstChild);
    
    return card;
}

/**
 * Форматирование суммы для отображения (сделки)
 */
function formatDealAmount(amount) {
    if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '—';
    const n = Number(amount);
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

/**
 * Карточка сделки для списка «Покупки» (deals).
 * @param {Object} deal - Объект сделки (id, deal_number, created_at, status, total_items_count, total_amount, first_image_url)
 * @param {string} status - 'active' или 'completed'
 * @returns {HTMLElement}
 */
export function createDealCard(deal, status) {
    const card = document.createElement('div');
    card.className = 'operation-item-card operation-item-card-deal';
    card.dataset.type = 'sale-orders';
    card.dataset.status = status;

    const dateText = deal.created_at ? formatDateToMoscow(deal.created_at) : '';
    const numText = deal.deal_number ? `Сделка №${deal.deal_number}` : `Сделка #${deal.id}`;
    const itemsText = deal.total_items_count != null ? `Товаров: ${deal.total_items_count}` : '';
    const sumText = deal.total_amount != null ? formatDealAmount(deal.total_amount) : '—';

    let statusBadge = '';
    if (status === 'active') {
        statusBadge = '<span class="operation-badge operation-badge-active">⏳ В обработке</span>';
    } else {
        if (deal.status === 'completed') {
            statusBadge = '<span class="operation-badge operation-badge-completed">✅ Завершена</span>';
        } else if (deal.status === 'cancelled') {
            statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменена</span>';
        } else {
            statusBadge = '<span class="operation-badge operation-badge-completed">✅ Завершена</span>';
        }
    }

    const imageUrl = deal.first_image_url || null;
    const imageContainer = createImageContainer(imageUrl, numText, '[СДЕЛКА]');
    if (imageContainer) {
        imageContainer.style.width = '80px';
        imageContainer.style.height = '80px';
        imageContainer.style.flexShrink = '0';
        imageContainer.style.borderRadius = '12px';
        imageContainer.style.overflow = 'hidden';
    }

    card.innerHTML = `
        <div class="operation-item-info">
            <h3 class="operation-item-name">${escapeHtmlDeal(numText)}</h3>
            ${itemsText ? `<p class="operation-item-price">${itemsText}</p>` : ''}
            <p class="operation-item-price">Сумма: ${escapeHtmlDeal(sumText)}</p>
            ${dateText ? `<p class="operation-item-date">📅 ${dateText}</p>` : ''}
            ${statusBadge}
        </div>
    `;

    if (imageContainer) {
        card.insertBefore(imageContainer, card.firstChild);
    }

    return card;
}

function escapeHtmlDeal(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}
