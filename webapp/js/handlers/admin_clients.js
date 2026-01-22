// Модуль обработчиков клиентов админки
import { fetchProducts, getContext } from '../api.js';
import { getClientDetailAPI, getClientsListAPI, updateClientContactAPI } from '../api/clients.js';
import { cancelOrderAPI, completeOrderAPI } from '../api/orders.js';
import { updatePurchaseStatusAPI } from '../api/purchases.js';
import { cancelReservationAPI } from '../api/reservations.js';
import { showProductModal } from '../products.js';
import { showNotification } from '../utils/admin_utils.js';
import { closeAdminPage } from './admin_init.js';

/**
 * Открывает страницу товара по product_id
 */
async function openProductById(productId, isDeleted = false) {
    // Проверяем, является ли isDeleted строкой 'true' и преобразуем в boolean
    const isDeletedBool = isDeleted === true || isDeleted === 'true' || String(isDeleted).toLowerCase() === 'true';
    
    if (!productId) {
        console.warn('[CLIENT PRODUCT] Cannot open product - productId is missing');
        return;
    }
    
    if (isDeletedBool) {
        console.warn('[CLIENT PRODUCT] Cannot open product - productId:', productId, 'isDeleted:', isDeletedBool);
        showNotification('Товар был удален и недоступен для просмотра', 'error');
        return;
    }
    
    try {
        // Получаем контекст для определения shop_owner_id и bot_id
        const context = await getContext();
        const shopOwnerId = context?.shop_owner_id || context?.user_id;
        const botId = context?.bot_id || null;
        
        if (!shopOwnerId) {
            console.error('[CLIENT PRODUCT] Failed to determine shop owner ID');
            return;
        }
        
        console.log('[CLIENT PRODUCT] Looking for product:', productId, 'shopOwnerId:', shopOwnerId, 'botId:', botId);
        
        // Получаем все товары и ищем нужный (передаем bot_id если есть)
        const products = await fetchProducts(shopOwnerId, null, botId);
        console.log('[CLIENT PRODUCT] Total products loaded:', products.length);
        
        let product = products.find(p => p.id === productId);
        
        // Если не нашли по id, ищем по sync_product_id (для синхронизированных товаров)
        if (!product) {
            product = products.find(p => p.sync_product_id === productId);
            if (product) {
                console.log('[CLIENT PRODUCT] Found by sync_product_id:', productId);
            }
        }
        
        if (!product) {
            // Если товар не найден, но мы уже знаем, что он удален (isDeleted был true),
            // то не показываем дополнительное уведомление - оно уже было показано выше
            if (!isDeletedBool) {
                console.warn('[CLIENT PRODUCT] Product not found in shop, productId:', productId);
                showNotification('Товар не найден в магазине', 'error');
            }
            return;
        }
        
        console.log('[CLIENT PRODUCT] Product found:', product.id, product.name);
        
        // Вычисляем финальную цену
        const hasDiscount = product.discount > 0;
        const finalPrice = hasDiscount ? Math.round(product.price * (1 - product.discount / 100)) : product.price;
        
        // Получаем изображения
        let fullImages = [];
        if (product.images_urls) {
            try {
                const imagesList = typeof product.images_urls === 'string' 
                    ? JSON.parse(product.images_urls) 
                    : product.images_urls;
                if (Array.isArray(imagesList) && imagesList.length > 0) {
                    const baseUrl = window.BASE_URL || '';
                    fullImages = imagesList.map(img => 
                        img.startsWith('http') ? img : (baseUrl + img)
                    );
                }
            } catch (e) {
                console.error('Error parsing images_urls:', e);
            }
        }
        
        // Проверяем, была ли открыта админка, и сохраняем это состояние
        const adminPage = document.getElementById('admin-page');
        const wasAdminOpen = adminPage && (adminPage.style.display === 'block' || adminPage.style.display === 'flex');
        
        // Определяем, пришли ли мы из админки
        // Используем сохраненную историю навигации ТОЛЬКО если:
        // 1. Админка открыта сейчас ИЛИ
        // 2. Мы находимся в детальном виде клиента (currentClientId установлен)
        // Это предотвращает использование старой истории навигации при открытии товара с главной страницы
        let fromAdmin = wasAdminOpen;
        let clientIdForReturn = currentClientId;
        
        // Проверяем сохраненную историю навигации только если админка открыта или мы в детальном виде клиента
        if ((wasAdminOpen || currentClientId) && typeof window !== 'undefined' && window.navigationHistory === 'admin') {
            fromAdmin = true;
            // Используем сохраненный adminClientId, если currentClientId не установлен
            if (!clientIdForReturn && typeof window !== 'undefined' && window.adminClientId) {
                clientIdForReturn = window.adminClientId;
            }
        }
        
        // Закрываем админку перед открытием товара
        if (wasAdminOpen) {
            closeAdminPage();
        }
        
        // Открываем страницу товара
        // Передаем информацию о том, что мы пришли из админки и ID клиента для возврата
        showProductModal(product, finalPrice, fullImages, fromAdmin, clientIdForReturn);
    } catch (error) {
        console.error('[CLIENT PRODUCT] Error opening product:', error, 'productId:', productId);
        showNotification('Ошибка при открытии товара: ' + error.message, 'error');
    }
}

/**
 * Форматирует время в читаемый формат
 */
function formatTime(seconds) {
    if (!seconds) return '—';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}ч ${minutes}м`;
    } else if (minutes > 0) {
        return `${minutes}м ${secs}с`;
    } else {
        return `${secs}с`;
    }
}

/**
 * Создает выпадающую секцию (accordion)
 * @param {string} id - Уникальный ID секции
 * @param {string} title - Заголовок секции
 * @param {string} content - HTML содержимое секции
 * @param {boolean} defaultOpen - Открыта ли секция по умолчанию (по умолчанию false)
 * @param {number} activeCount - Количество активных элементов для индикатора (по умолчанию 0)
 * @returns {string} HTML код выпадающей секции
 */
function createCollapsibleSection(id, title, content, defaultOpen = false, activeCount = 0) {
    const isOpen = defaultOpen ? 'true' : 'false';
    const displayStyle = defaultOpen ? 'block' : 'none';
    const arrowIcon = defaultOpen ? '▼' : '▶';
    
    // Индикатор активных элементов
    const activeIndicator = activeCount > 0 ? `
        <span class="active-indicator-badge" style="
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 20px;
            height: 20px;
            padding: 0 6px;
            background: #ff3b30;
            color: #ffffff;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 8px;
            box-shadow: 0 0 8px rgba(255, 59, 48, 0.5);
        ">${activeCount}</span>
    ` : '';
    
    return `
        <div class="collapsible-section" style="
            background: var(--bg-glass, rgba(28, 28, 30, 0.8));
            backdrop-filter: blur(20px);
            border-radius: 12px;
            margin-bottom: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            overflow: hidden;
        ">
            <div class="collapsible-header" data-section-id="${id}" style="
                padding: 16px;
                cursor: pointer;
                user-select: none;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background-color 0.2s ease;
            " onmouseover="this.style.backgroundColor='rgba(255, 255, 255, 0.05)'" onmouseout="this.style.backgroundColor='transparent'">
                <h3 style="margin: 0; font-size: 18px; color: #ffffff !important; font-weight: 600; display: flex; align-items: center;">
                    ${title}${activeIndicator}
                </h3>
                <span class="collapsible-arrow" style="
                    font-size: 14px;
                    color: #8e8e93;
                    transition: transform 0.3s ease;
                ">${arrowIcon}</span>
            </div>
            <div class="collapsible-content" id="section-${id}" style="
                display: ${displayStyle};
                padding: 20px 16px 16px 16px;
            ">
                ${content}
            </div>
        </div>
    `;
}

/**
 * Правильно парсит дату с сервера (предполагается UTC, если не указан часовой пояс)
 * Конвертирует в локальное время пользователя
 */
function parseServerDate(dateString) {
    if (!dateString) return null;
    
    // Если строка не содержит информации о часовом поясе (Z, +, -),
    // предполагаем, что это UTC время и добавляем 'Z'
    if (typeof dateString === 'string') {
        // Проверяем, есть ли уже указание часового пояса
        const hasTimezone = dateString.includes('Z') || 
                            dateString.includes('+') || 
                            (dateString.includes('-') && dateString.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-\d{2}:\d{2}/));
        
        if (!hasTimezone) {
            // Если это формат "YYYY-MM-DD HH:MM:SS" или "YYYY-MM-DDTHH:MM:SS", добавляем 'Z' для UTC
            if (dateString.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/)) {
                dateString = dateString.replace(' ', 'T') + 'Z';
            }
        }
    }
    
    const date = new Date(dateString);
    
    // Проверяем, что дата валидна
    if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return null;
    }
    
    return date;
}

/**
 * Форматирует дату в читаемый формат
 * Правильно обрабатывает время с сервера (UTC) и конвертирует в локальное время пользователя
 */
function formatDate(dateString) {
    if (!dateString) return '—';
    
    const date = parseServerDate(dateString);
    if (!date) return '—';
    
    // Используем toLocaleString для правильного отображения в локальном времени пользователя
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Используем локальный часовой пояс
    });
}

/**
 * Определить, является ли платформа десктопом
 */
function isDesktopPlatform() {
    const isTelegramWebView = window.Telegram && window.Telegram.WebApp;
    
    if (isTelegramWebView) {
        const platform = window.Telegram.WebApp.platform;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return platform === 'tdesktop' || platform === 'macos' || platform === 'web' || 
               (platform === 'unknown' && !isMobileUA) ||
               (!isMobileUA && (platform === undefined || platform === null));
    } else {
        return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}

/**
 * Открыть чат с пользователем в Telegram
 */
function openTelegramChat(userId, username = null) {
    try {
        // Проверяем, является ли платформа десктопом
        const isDesktop = isDesktopPlatform();
        
        // На десктопе для ссылок без username показываем сообщение
        if (isDesktop && !username) {
            const tg = window.Telegram && window.Telegram.WebApp;
            if (tg && typeof tg.showAlert === 'function') {
                tg.showAlert('У пользователя нет username. Для открытия чата воспользуйтесь мобильным приложением Telegram.');
            } else {
                alert('У пользователя нет username. Для открытия чата воспользуйтесь мобильным приложением Telegram.');
            }
            return;
        }
        
        // Используем Telegram.WebApp API
        if (window.Telegram && window.Telegram.WebApp) {
            const webApp = window.Telegram.WebApp;
            
            if (username) {
                // Для пользователей с username используем openTelegramLink на мобильных
                // Это открывает ссылку внутри Telegram и НЕ закрывает приложение
                const telegramUrl = `https://t.me/${username}`;
                
                if (!isDesktop && typeof webApp.openTelegramLink === 'function') {
                    // На мобильных используем openTelegramLink - не закрывает приложение
                    webApp.openTelegramLink(telegramUrl);
                    return;
                } else if (isDesktop && typeof webApp.openLink === 'function') {
                    // На десктопе используем openLink для открытия в браузере
                    webApp.openLink(telegramUrl);
                    return;
                }
            } else {
                // Для пользователей без username используем tg://user?id=...
                // На десктопе это не работает, поэтому показываем сообщение
                if (isDesktop) {
                    if (typeof webApp.showAlert === 'function') {
                        webApp.showAlert('У пользователя нет username. Для открытия чата воспользуйтесь мобильным приложением Telegram.');
                    } else {
                        alert('У пользователя нет username. Для открытия чата воспользуйтесь мобильным приложением Telegram.');
                    }
                    return;
                }
                
                // На мобильных используем tg://user?id=...
                // openLink выбрасывает ошибку, но переход все равно работает
                const telegramUrl = `tg://user?id=${userId}`;
                
                if (typeof webApp.openLink === 'function') {
                    webApp.openLink(telegramUrl);
                    return;
                }
            }
        }
        
        // Fallback: открываем через window.open
        const telegramUrl = username ? `https://t.me/${username}` : `tg://user?id=${userId}`;
        window.open(telegramUrl, '_blank');
    } catch (error) {
        // Не логируем ошибку - это ложная ошибка из-за особенностей браузера и tg:// протокола
        // Переход работает правильно, ошибка не критична
        // Fallback: определяем URL в зависимости от платформы
        const telegramUrl = username ? `https://t.me/${username}` : `tg://user?id=${userId}`;
        window.open(telegramUrl, '_blank');
    }
}

/**
 * Загрузка и отображение списка клиентов
 */
export async function loadClients() {
    const clientsList = document.getElementById('clients-list');
    if (!clientsList) return;
    
    clientsList.innerHTML = '<p class="loading">Загрузка клиентов...</p>';
    
    try {
        const clients = await getClientsListAPI();
        
        if (!clients || clients.length === 0) {
            clientsList.innerHTML = '<p class="loading">Клиентов пока нет</p>';
            return;
        }
        
        // Рендерим список клиентов
        clientsList.innerHTML = '';
        
        clients.forEach(client => {
            const clientCard = document.createElement('div');
            clientCard.className = 'client-card';
            clientCard.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            clientCard.addEventListener('click', (e) => {
                // Если клик был по ссылке Telegram, не открываем детали клиента
                if (e.target.tagName === 'A' || e.target.closest('a')) {
                    return;
                }
                showClientDetail(client.user_id);
            });
            
            // Формируем отображение username или ссылку на чат
            const telegramLinkId = `telegram-link-${client.user_id}`;
            // Определяем URL для ссылки
            // На десктопе для ссылок без username используем альтернативный подход
            const isTelegramWebView = window.Telegram && window.Telegram.WebApp;
            let isDesktop = false;
            
            if (isTelegramWebView) {
                const platform = window.Telegram.WebApp.platform;
                const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                isDesktop = platform === 'tdesktop' || platform === 'macos' || platform === 'web' || 
                           (platform === 'unknown' && !isMobileUA) ||
                           (!isMobileUA && (platform === undefined || platform === null));
            } else {
                isDesktop = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            }
            
            // Всегда используем https://t.me/ для ссылок с username
            // Для ссылок без username используем tg://user?id=... (будет открываться через WebApp API)
            const telegramUrl = client.username 
                ? `https://t.me/${client.username}` 
                : `tg://user?id=${client.user_id}`;
            
            const usernameDisplay = client.username 
                ? `<a id="${telegramLinkId}" href="#" style="
                    color: #2196F3 !important;
                    text-decoration: none;
                    font-weight: 500;
                    cursor: pointer;
                ">@${client.username}</a>`
                : `<a id="${telegramLinkId}" href="#" style="
                    color: #2196F3 !important;
                    text-decoration: none;
                    font-weight: 500;
                    cursor: pointer;
                ">💬 Написать в Telegram</a>`;
            
            // Индикатор активных сделок
            const activeDealsCount = client.active_deals_count || 0;
            const activeDealsBadge = activeDealsCount > 0 ? `
                <div style="
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: ${activeDealsCount > 0 ? 'linear-gradient(135deg, rgba(255, 152, 0, 0.9) 0%, rgba(255, 152, 0, 0.7) 100%)' : 'rgba(142, 142, 147, 0.3)'};
                    color: #ffffff;
                    font-size: 12px;
                    font-weight: 700;
                    padding: 4px 10px;
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    min-width: 24px;
                    text-align: center;
                ">
                    ${activeDealsCount > 0 ? `⚡ ${activeDealsCount}` : '0'}
                </div>
            ` : '';
            
            clientCard.style.position = 'relative';
            
            // Формируем ФИО и телефон
            let contactInfo = '';
            const fullName = [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(' ').trim();
            const phone = client.phone_number ? `${client.phone_country_code || ''}${client.phone_number}`.trim() : null;
            
            if (fullName || phone || client.email || client.city || client.address) {
                contactInfo = `
                    <div style="
                        margin-top: 8px;
                        padding: 8px;
                        background: rgba(90, 200, 250, 0.1);
                        border-radius: 8px;
                        border: 1px solid rgba(90, 200, 250, 0.2);
                        position: relative;
                    ">
                        ${fullName ? `
                            <div style="font-size: 13px; color: #5ac8fa !important; margin-bottom: ${phone || client.email || client.city ? '4px' : '0'}; font-weight: 500;">
                                👤 ${fullName}
                            </div>
                        ` : ''}
                        ${phone ? `
                            <div style="font-size: 13px; color: #5ac8fa !important; margin-bottom: ${client.email || client.city ? '4px' : '0'}; font-weight: 500;">
                                📱 ${phone}
                            </div>
                        ` : ''}
                        ${client.email ? `
                            <div style="font-size: 13px; color: #5ac8fa !important; margin-bottom: ${client.city ? '4px' : '0'}; font-weight: 500;">
                                📧 ${client.email}
                            </div>
                        ` : ''}
                        ${client.city ? `
                            <div style="font-size: 13px; color: #5ac8fa !important; font-weight: 500;">
                                📍 ${client.city}
                            </div>
                        ` : ''}
                        <button class="edit-client-contact-btn" data-client-id="${client.user_id}" style="
                            position: absolute;
                            top: 4px;
                            right: 4px;
                            padding: 4px 8px;
                            background: rgba(90, 200, 250, 0.2);
                            color: #5ac8fa;
                            border: 1px solid rgba(90, 200, 250, 0.4);
                            border-radius: 6px;
                            font-size: 11px;
                            cursor: pointer;
                            font-weight: 600;
                        ">✏️</button>
                    </div>
                `;
            } else {
                // Если нет контактов, показываем кнопку для добавления
                contactInfo = `
                    <div style="
                        margin-top: 8px;
                        padding: 8px;
                        background: rgba(90, 200, 250, 0.1);
                        border-radius: 8px;
                        border: 1px solid rgba(90, 200, 250, 0.2);
                        text-align: center;
                    ">
                        <button class="edit-client-contact-btn" data-client-id="${client.user_id}" style="
                            padding: 6px 12px;
                            background: rgba(90, 200, 250, 0.2);
                            color: #5ac8fa;
                            border: 1px solid rgba(90, 200, 250, 0.4);
                            border-radius: 6px;
                            font-size: 12px;
                            cursor: pointer;
                            font-weight: 600;
                            width: 100%;
                        ">✏️ Добавить контакты</button>
                    </div>
                `;
            }
            
            clientCard.innerHTML = `
                ${activeDealsBadge}
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            👤 Клиент #${client.user_id}
                        </div>
                        <div style="font-size: 14px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${usernameDisplay}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: ${contactInfo ? '8px' : '0'};">
                            Последний визит: ${formatDate(client.last_visit)}
                        </div>
                        ${contactInfo}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px;">
                    <div style="background: rgba(76, 175, 80, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Всего посещений</div>
                        <div style="font-size: 18px; font-weight: 600; color: #4CAF50 !important;">${client.total_visits}</div>
                    </div>
                    <div style="background: rgba(33, 150, 243, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Просмотры товаров</div>
                        <div style="font-size: 18px; font-weight: 600; color: #2196F3 !important;">${client.product_views}</div>
                    </div>
                    <div style="background: rgba(255, 152, 0, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Посещения магазина</div>
                        <div style="font-size: 18px; font-weight: 600; color: #FF9800 !important;">${client.shop_visits}</div>
                    </div>
                    <div style="background: rgba(156, 39, 176, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Время в магазине</div>
                        <div style="font-size: 18px; font-weight: 600; color: #9C27B0 !important;">${formatTime(client.total_time_seconds)}</div>
                    </div>
                    <div style="background: rgba(244, 67, 54, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">🛒 Заказы</div>
                        <div style="font-size: 18px; font-weight: 600; color: #F44336 !important;">${client.orders_count || 0}</div>
                    </div>
                    <div style="background: rgba(255, 193, 7, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">🔒 Резервации</div>
                        <div style="font-size: 18px; font-weight: 600; color: #FFC107 !important;">${client.reservations_count || 0}</div>
                    </div>
                    <div style="background: rgba(255, 87, 34, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">💰 Продажи</div>
                        <div style="font-size: 18px; font-weight: 600; color: #FF5722 !important;">${client.purchases_count || 0}</div>
                    </div>
                    <div style="background: rgba(233, 30, 99, 0.1); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">❤️ Избранное</div>
                        <div style="font-size: 18px; font-weight: 600; color: #E91E63 !important;">${client.favorites_count || 0}</div>
                    </div>
                </div>
            `;
            
            clientsList.appendChild(clientCard);
            
            // Добавляем обработчик клика для ссылки Telegram
            const telegramLink = document.getElementById(telegramLinkId);
            if (telegramLink) {
                // На всех платформах используем openTelegramChat через WebApp API
                telegramLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    openTelegramChat(client.user_id, client.username);
                    return false;
                }, { passive: false });
            }
            
            // Добавляем обработчик для кнопки редактирования контактов
            const editBtn = clientCard.querySelector('.edit-client-contact-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    showEditContactModal(client);
                    return false;
                }, { passive: false });
            }
        });
        
    } catch (error) {
        console.error('Error loading clients:', error);
        clientsList.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

// Сохраняем ID текущего открытого клиента для возврата после просмотра товара
let currentClientId = null;

/**
 * Показать детальную информацию о клиенте
 */
export async function showClientDetail(clientId) {
    // Сохраняем ID текущего клиента
    currentClientId = clientId;
    const clientsList = document.getElementById('clients-list');
    if (!clientsList) return;
    
    clientsList.innerHTML = '<p class="loading">Загрузка информации о клиенте...</p>';
    
    try {
        const clientDetail = await getClientDetailAPI(clientId);
        
        let html = `
            <div style="margin-bottom: 16px;">
                <button id="clients-back-btn" style="
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #ffffff !important;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    margin-bottom: 12px;
                ">← Назад к списку</button>
            </div>
        `;
        
        // Обработчик кнопки "Назад"
        const backBtnHandler = () => {
            loadClients();
        };
        
        // Формируем отображение username или ссылку на чат для детальной информации
        const detailTelegramLinkId = `telegram-link-detail-${clientDetail.user_id}`;
        
        const usernameDisplay = clientDetail.username 
            ? `<a id="${detailTelegramLinkId}" href="#" style="
                color: #2196F3 !important;
                text-decoration: none;
                font-weight: 500;
                font-size: 16px;
                cursor: pointer;
            ">@${clientDetail.username}</a>`
            : `<a id="${detailTelegramLinkId}" href="#" style="
                color: #2196F3 !important;
                text-decoration: none;
                font-weight: 500;
                font-size: 16px;
                cursor: pointer;
            ">💬 Написать в Telegram</a>`;
        
        // Контактная информация клиента (выпадающая секция)
        const fullName = [clientDetail.last_name, clientDetail.first_name, clientDetail.middle_name].filter(Boolean).join(' ').trim();
        const phone = clientDetail.phone_number ? `${clientDetail.phone_country_code || ''}${clientDetail.phone_number}`.trim() : null;
        
        let contactContent = `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
                <button class="edit-client-contact-detail-btn" data-client-id="${clientDetail.user_id}" style="
                    padding: 4px 8px;
                    background: rgba(90, 200, 250, 0.2);
                    color: #5ac8fa;
                    border: 1px solid rgba(90, 200, 250, 0.4);
                    border-radius: 6px;
                    font-size: 10px;
                    cursor: pointer;
                    font-weight: 600;
                ">✏️ Редактировать</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        if (fullName) {
            contactContent += `
                <div class="copyable-field" data-copy-text="${fullName.replace(/"/g, '&quot;')}" style="
                    padding: 8px;
                    background: rgba(90, 200, 250, 0.1);
                    border-radius: 6px;
                    border: 1px solid rgba(90, 200, 250, 0.2);
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <div style="font-size: 10px; color: #8e8e93 !important; margin-bottom: 2px;">👤 ФИО</div>
                    <div style="font-size: 13px; font-weight: 600; color: #5ac8fa !important;">${fullName}</div>
                </div>
            `;
        }
        
        if (phone) {
            contactContent += `
                <div class="copyable-field" data-copy-text="${phone.replace(/"/g, '&quot;')}" style="
                    padding: 8px;
                    background: rgba(90, 200, 250, 0.1);
                    border-radius: 6px;
                    border: 1px solid rgba(90, 200, 250, 0.2);
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <div style="font-size: 10px; color: #8e8e93 !important; margin-bottom: 2px;">📱 Телефон</div>
                    <div style="font-size: 13px; font-weight: 600; color: #5ac8fa !important;">${phone}</div>
                </div>
            `;
        }
        
        if (clientDetail.email) {
            contactContent += `
                <div class="copyable-field" data-copy-text="${clientDetail.email.replace(/"/g, '&quot;')}" style="
                    padding: 8px;
                    background: rgba(90, 200, 250, 0.1);
                    border-radius: 6px;
                    border: 1px solid rgba(90, 200, 250, 0.2);
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <div style="font-size: 10px; color: #8e8e93 !important; margin-bottom: 2px;">📧 Email</div>
                    <div style="font-size: 13px; font-weight: 600; color: #5ac8fa !important;">${clientDetail.email}</div>
                </div>
            `;
        }
        
        if (clientDetail.city) {
            contactContent += `
                <div class="copyable-field" data-copy-text="${clientDetail.city.replace(/"/g, '&quot;')}" style="
                    padding: 8px;
                    background: rgba(90, 200, 250, 0.1);
                    border-radius: 6px;
                    border: 1px solid rgba(90, 200, 250, 0.2);
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <div style="font-size: 10px; color: #8e8e93 !important; margin-bottom: 2px;">📍 Город</div>
                    <div style="font-size: 13px; font-weight: 600; color: #5ac8fa !important;">${clientDetail.city}</div>
                </div>
            `;
        }
        
        if (clientDetail.address) {
            contactContent += `
                <div class="copyable-field" data-copy-text="${clientDetail.address.replace(/"/g, '&quot;')}" style="
                    padding: 8px;
                    background: rgba(90, 200, 250, 0.1);
                    border-radius: 6px;
                    border: 1px solid rgba(90, 200, 250, 0.2);
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <div style="font-size: 10px; color: #8e8e93 !important; margin-bottom: 2px;">🏠 Адрес</div>
                    <div style="font-size: 13px; font-weight: 600; color: #5ac8fa !important; word-wrap: break-word;">${clientDetail.address}</div>
                </div>
            `;
        }
        
        if (!fullName && !phone && !clientDetail.email && !clientDetail.city && !clientDetail.address) {
            contactContent += `
                <div style="
                    padding: 8px;
                    text-align: center;
                    color: #8e8e93 !important;
                    font-size: 12px;
                ">Контактная информация не указана</div>
            `;
        }
        
        contactContent += `</div>`;
        html += createCollapsibleSection('contact', `📋 Контактная информация`, contactContent);
        
        // Статистика клиента (объединенная секция: статистика + активность)
        const statsContent = `
            <div style="text-align: right; margin-bottom: 12px;">
                ${usernameDisplay}
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                <div style="background: rgba(76, 175, 80, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Всего посещений</div>
                    <div style="font-size: 20px; font-weight: 600; color: #4CAF50 !important;">${clientDetail.stats.total_visits}</div>
                </div>
                <div style="background: rgba(33, 150, 243, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Просмотры товаров</div>
                    <div style="font-size: 20px; font-weight: 600; color: #2196F3 !important;">${clientDetail.stats.product_views}</div>
                </div>
                <div style="background: rgba(255, 152, 0, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Посещения магазина</div>
                    <div style="font-size: 20px; font-weight: 600; color: #FF9800 !important;">${clientDetail.stats.shop_visits}</div>
                </div>
                <div style="background: rgba(156, 39, 176, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Время в магазине</div>
                    <div style="font-size: 20px; font-weight: 600; color: #9C27B0 !important;">${formatTime(clientDetail.stats.total_time_seconds)}</div>
                </div>
                <div style="background: rgba(244, 67, 54, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">🛒 Заказы</div>
                    <div style="font-size: 20px; font-weight: 600; color: #F44336 !important;">${clientDetail.orders_count || 0}</div>
                </div>
                <div style="background: rgba(255, 193, 7, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">🔒 Резервации</div>
                    <div style="font-size: 20px; font-weight: 600; color: #FFC107 !important;">${clientDetail.reservations_count || 0}</div>
                </div>
                <div style="background: rgba(255, 87, 34, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">💰 Продажи</div>
                    <div style="font-size: 20px; font-weight: 600; color: #FF5722 !important;">${clientDetail.purchases_count || 0}</div>
                </div>
                <div style="background: rgba(233, 30, 99, 0.1); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">❤️ Избранное</div>
                    <div style="font-size: 20px; font-weight: 600; color: #E91E63 !important;">${clientDetail.favorites_count || 0}</div>
                </div>
            </div>
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Первый визит</div>
                <div style="font-size: 14px; color: #ffffff !important;">${formatDate(clientDetail.stats.first_visit)}</div>
            </div>
            <div style="margin-top: 8px;">
                <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Последний визит</div>
                <div style="font-size: 14px; color: #ffffff !important;">${formatDate(clientDetail.stats.last_visit)}</div>
            </div>
        `;
        html += createCollapsibleSection('stats', `📊 Статистика`, statsContent, true);
        
        // Самые популярные товары (выпадающая секция)
        if (clientDetail.most_viewed_products && clientDetail.most_viewed_products.length > 0) {
            let mostViewedContent = `<div style="display: flex; flex-direction: column; gap: 12px;">`;
            
            clientDetail.most_viewed_products.forEach((product, index) => {
                const imageUrl = product.image_url || '';
                const priceText = product.price ? `${product.price.toFixed(2)} ₽` : 'Цена по запросу';
                
                const canOpenProduct = product.product_id && !product.is_deleted;
                mostViewedContent += `
                    <div class="client-product-card" data-product-id="${product.product_id || ''}" data-is-deleted="${product.is_deleted || false}" style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.1)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.05)'" : ''}">
                        <div style="
                            font-size: 18px;
                            font-weight: 600;
                            color: #FFC107 !important;
                            min-width: 24px;
                            text-align: center;
                        ">${index + 1}</div>
                        ${imageUrl ? `
                            <img src="${imageUrl}" alt="${product.product_name}" style="
                                width: 50px;
                                height: 50px;
                                object-fit: cover;
                                border-radius: 8px;
                            " onerror="this.style.display='none'">
                        ` : ''}
                        <div style="flex: 1; min-width: 0;">
                            <div style="
                                font-size: 14px;
                                font-weight: 600;
                                color: #ffffff !important;
                                margin-bottom: 4px;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                white-space: nowrap;
                            ">${product.product_name}</div>
                            <div style="
                                font-size: 12px;
                                color: #8e8e93 !important;
                            ">Просмотров: ${product.view_count}</div>
                            <div style="
                                font-size: 12px;
                                color: #4CAF50 !important;
                                font-weight: 500;
                            ">${priceText}</div>
                        </div>
                    </div>
                `;
            });
            
            mostViewedContent += `</div>`;
            html += createCollapsibleSection('most-viewed', `⭐ Самые популярные товары (${clientDetail.most_viewed_products.length})`, mostViewedContent);
        }
        
        // Резервации - Активные и История (выпадающая секция)
        let reservationsContent = '';
        
        // Активные резервации
        reservationsContent += `<div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #4CAF50 !important;">Активные (${clientDetail.active_reservations?.length || 0})</h4>`;
        
        if (!clientDetail.active_reservations || clientDetail.active_reservations.length === 0) {
            reservationsContent += '<p style="color: #8e8e93 !important; font-size: 14px;">Активных резерваций нет</p>';
        } else {
            clientDetail.active_reservations.forEach(res => {
                const reservedUntil = res.reserved_until ? parseServerDate(res.reserved_until) : null;
                const now = new Date();
                const timeLeft = reservedUntil ? Math.max(0, Math.floor((reservedUntil - now) / 1000 / 60)) : 0;
                const hoursLeft = Math.floor(timeLeft / 60);
                const minutesLeft = timeLeft % 60;
                const timeLeftText = hoursLeft > 0 ? `${hoursLeft} ч ${minutesLeft} мин` : `${minutesLeft} мин`;
                const canOpenProduct = res.product_id && !res.is_deleted;
                
                reservationsContent += `
                    <div class="client-product-card" data-product-id="${res.product_id || ''}" data-is-deleted="${res.is_deleted || false}" style="
                        background: rgba(76, 175, 80, 0.1);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(76, 175, 80, 0.3);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(76, 175, 80, 0.15)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(76, 175, 80, 0.1)'" : ''}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                            <div style="flex: 1;">
                                <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                                    ${res.product_name}${res.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''}
                                </div>
                                <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                                    ${formatDate(res.created_at)}
                                </div>
                                <div style="font-size: 12px; color: ${timeLeft < 30 ? '#ff3b30' : '#4CAF50'} !important;">
                                    Осталось: ${timeLeftText}
                                </div>
                            </div>
                            <button class="cancel-reservation-btn-client" data-reservation-id="${res.id}" style="
                                padding: 6px 12px;
                                background: rgba(255, 59, 48, 0.2);
                                color: rgb(255, 59, 48);
                                border: 1px solid rgba(255, 59, 48, 0.5);
                                border-radius: 6px;
                                font-size: 12px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">Отменить</button>
                        </div>
                    </div>
                `;
            });
        }
        
        reservationsContent += '</div>';
        
        // История резерваций
        reservationsContent += `<div>
            <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #8e8e93 !important;">📜 История (${clientDetail.history_reservations?.length || 0})</h4>`;
        
        if (!clientDetail.history_reservations || clientDetail.history_reservations.length === 0) {
            reservationsContent += '<p style="color: #8e8e93 !important; font-size: 14px;">Истории резерваций нет</p>';
        } else {
            const hasMore = clientDetail.history_reservations.length > 3;
            const maxHeight = hasMore ? 300 : 'auto';
            
            reservationsContent += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.history_reservations.forEach(res => {
                const canOpenProduct = res.product_id && !res.is_deleted;
                reservationsContent += `
                    <div class="client-product-card" data-product-id="${res.product_id || ''}" data-is-deleted="${res.is_deleted || false}" style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.1)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.05)'" : ''}">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${res.product_name}${res.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${formatDate(res.created_at)}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important;">
                            Статус: Завершена
                        </div>
                    </div>
                `;
            });
            
            reservationsContent += '</div>';
            
            if (hasMore) {
                reservationsContent += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.history_reservations.length} резерваций в истории
                </p>`;
            }
        }
        
        reservationsContent += '</div>';
        const activeReservationsCount = clientDetail.active_reservations?.length || 0;
        html += createCollapsibleSection('reservations', `🔒 Резервации (${clientDetail.reservations_count})`, reservationsContent, false, activeReservationsCount);
        
        // Заказы - Активные и История (выпадающая секция)
        let ordersContent = '';
        
        // Активные заказы
        ordersContent += `<div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #FF9800 !important;">Активные (${clientDetail.active_orders?.length || 0})</h4>`;
        
        if (!clientDetail.active_orders || clientDetail.active_orders.length === 0) {
            ordersContent += '<p style="color: #8e8e93 !important; font-size: 14px;">Активных заказов нет</p>';
        } else {
            clientDetail.active_orders.forEach(order => {
                const canOpenProduct = order.product_id && !order.is_deleted;
                ordersContent += `
                    <div class="client-product-card" data-product-id="${order.product_id || ''}" data-is-deleted="${order.is_deleted || false}" style="
                        background: rgba(255, 152, 0, 0.1);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 152, 0, 0.3);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 152, 0, 0.15)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 152, 0, 0.1)'" : ''}">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${order.product_name}${order.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''} (${order.quantity} шт.)
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${formatDate(order.created_at)}
                        </div>
                        <div style="font-size: 12px; color: #FF9800 !important; margin-bottom: 8px;">
                            Статус: В обработке
                        </div>
                        ${order.first_name || order.last_name ? `
                            <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 8px;">
                                ${order.first_name || ''} ${order.last_name || ''}
                            </div>
                        ` : ''}
                        <div style="display: flex; gap: 6px; margin-top: 8px;">
                            <button class="complete-order-btn-client" data-order-id="${order.id}" style="
                                padding: 6px 12px;
                                background: rgba(76, 175, 80, 0.2);
                                color: #4CAF50;
                                border: 1px solid rgba(76, 175, 80, 0.5);
                                border-radius: 6px;
                                font-size: 12px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">✅ Выполнить</button>
                            <button class="cancel-order-btn-client" data-order-id="${order.id}" style="
                                padding: 6px 12px;
                                background: rgba(255, 59, 48, 0.2);
                                color: rgb(255, 59, 48);
                                border: 1px solid rgba(255, 59, 48, 0.5);
                                border-radius: 6px;
                                font-size: 12px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">❌ Отменить</button>
                        </div>
                    </div>
                `;
            });
        }
        
        ordersContent += '</div>';
        
        // История заказов
        ordersContent += `<div>
            <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #8e8e93 !important;">📜 История (${clientDetail.history_orders?.length || 0})</h4>`;
        
        if (!clientDetail.history_orders || clientDetail.history_orders.length === 0) {
            ordersContent += '<p style="color: #8e8e93 !important; font-size: 14px;">Истории заказов нет</p>';
        } else {
            const hasMore = clientDetail.history_orders.length > 3;
            const maxHeight = hasMore ? 360 : 'auto';
            
            ordersContent += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.history_orders.forEach(order => {
                const status = order.is_completed ? 'Выполнен' : 'Отменен';
                const statusColor = order.is_completed ? '#4CAF50' : '#ff3b30';
                const canOpenProduct = order.product_id && !order.is_deleted;
                ordersContent += `
                    <div class="client-product-card" data-product-id="${order.product_id || ''}" data-is-deleted="${order.is_deleted || false}" style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.1)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.05)'" : ''}">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${order.product_name}${order.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''} (${order.quantity} шт.)
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${formatDate(order.created_at)}
                        </div>
                        <div style="font-size: 12px; color: ${statusColor} !important; margin-bottom: 4px;">
                            Статус: ${status}
                        </div>
                        ${order.first_name || order.last_name ? `
                            <div style="font-size: 12px; color: #8e8e93 !important;">
                                ${order.first_name || ''} ${order.last_name || ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
            ordersContent += '</div>';
            
            if (hasMore) {
                ordersContent += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.history_orders.length} заказов в истории
                </p>`;
            }
        }
        
        ordersContent += '</div>';
        const activeOrdersCount = clientDetail.active_orders?.length || 0;
        html += createCollapsibleSection('orders', `🛒 Заказы (${clientDetail.orders_count})`, ordersContent, false, activeOrdersCount);
        
        // Продажи (purchases) - Активные и История (выпадающая секция)
        let purchasesContent = '';
        
        // Активные продажи
        purchasesContent += `<div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #FF9800 !important;">Активные (${clientDetail.active_purchases?.length || 0})</h4>`;
        
        if (!clientDetail.active_purchases || clientDetail.active_purchases.length === 0) {
            purchasesContent += '<p style="color: #8e8e93 !important; font-size: 14px;">Активных продаж нет</p>';
        } else {
            clientDetail.active_purchases.forEach(purchase => {
                const canOpenProduct = purchase.product_id && !purchase.is_deleted;
                purchasesContent += `
                    <div class="client-product-card" data-product-id="${purchase.product_id || ''}" data-is-deleted="${purchase.is_deleted || false}" style="
                        background: rgba(255, 152, 0, 0.1);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 152, 0, 0.3);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 152, 0, 0.15)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 152, 0, 0.1)'" : ''}">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${purchase.product_name}${purchase.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${formatDate(purchase.created_at)}
                        </div>
                        <div style="font-size: 12px; color: #FF9800 !important; margin-bottom: 8px;">
                            Статус: В обработке
                        </div>
                        ${purchase.first_name || purchase.last_name ? `
                            <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                                ${purchase.first_name || ''} ${purchase.last_name || ''}
                            </div>
                        ` : ''}
                        ${purchase.city ? `
                            <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 8px;">
                                Город: ${purchase.city}
                            </div>
                        ` : ''}
                        <div style="display: flex; gap: 6px; margin-top: 8px;">
                            <button class="complete-purchase-btn-client" data-purchase-id="${purchase.id}" style="
                                padding: 6px 12px;
                                background: rgba(76, 175, 80, 0.2);
                                color: #4CAF50;
                                border: 1px solid rgba(76, 175, 80, 0.5);
                                border-radius: 6px;
                                font-size: 12px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">✅ Выполнить</button>
                            <button class="cancel-purchase-btn-client" data-purchase-id="${purchase.id}" style="
                                padding: 6px 12px;
                                background: rgba(255, 59, 48, 0.2);
                                color: rgb(255, 59, 48);
                                border: 1px solid rgba(255, 59, 48, 0.5);
                                border-radius: 6px;
                                font-size: 12px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">❌ Отменить</button>
                        </div>
                    </div>
                `;
            });
        }
        
        purchasesContent += '</div>';
        
        // История продаж
        purchasesContent += `<div>
            <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #8e8e93 !important;">📜 История (${clientDetail.history_purchases?.length || 0})</h4>`;
        
        if (!clientDetail.history_purchases || clientDetail.history_purchases.length === 0) {
            purchasesContent += '<p style="color: #8e8e93 !important; font-size: 14px;">Истории продаж нет</p>';
        } else {
            const hasMore = clientDetail.history_purchases.length > 3;
            const maxHeight = hasMore ? 420 : 'auto';
            
            purchasesContent += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.history_purchases.forEach(purchase => {
                const status = purchase.is_completed ? 'Выполнена' : 'Отменена';
                const statusColor = purchase.is_completed ? '#4CAF50' : '#ff3b30';
                const canOpenProduct = purchase.product_id && !purchase.is_deleted;
                purchasesContent += `
                    <div class="client-product-card" data-product-id="${purchase.product_id || ''}" data-is-deleted="${purchase.is_deleted || false}" style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.1)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.05)'" : ''}">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${purchase.product_name}${purchase.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${formatDate(purchase.created_at)}
                        </div>
                        <div style="font-size: 12px; color: ${statusColor} !important; margin-bottom: 4px;">
                            Статус: ${status}
                        </div>
                        ${purchase.first_name || purchase.last_name ? `
                            <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                                ${purchase.first_name || ''} ${purchase.last_name || ''}
                            </div>
                        ` : ''}
                        ${purchase.city ? `
                            <div style="font-size: 12px; color: #8e8e93 !important;">
                                Город: ${purchase.city}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
            purchasesContent += '</div>';
            
            if (hasMore) {
                purchasesContent += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.history_purchases.length} продаж в истории
                </p>`;
            }
        }
        
        purchasesContent += '</div>';
        const activePurchasesCount = clientDetail.active_purchases?.length || 0;
        html += createCollapsibleSection('purchases', `💰 Продажи (${clientDetail.purchases_count})`, purchasesContent, false, activePurchasesCount);
        
        // Избранное (выпадающая секция)
        let favoritesContent = '';
        
        if (clientDetail.favorites.length === 0) {
            favoritesContent = '<p style="color: #8e8e93 !important; font-size: 14px;">Избранного нет</p>';
        } else {
            const hasMore = clientDetail.favorites.length > 3;
            const maxHeight = hasMore ? 270 : 'auto';
            
            favoritesContent += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.favorites.forEach(fav => {
                const canOpenProduct = fav.product_id && !fav.is_deleted;
                favoritesContent += `
                    <div class="client-product-card" data-product-id="${fav.product_id || ''}" data-is-deleted="${fav.is_deleted || false}" style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        cursor: ${canOpenProduct ? 'pointer' : 'default'};
                        transition: all 0.2s ease;
                    " onmouseover="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.1)'" : ''}" onmouseout="${canOpenProduct ? "this.style.background='rgba(255, 255, 255, 0.05)'" : ''}">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${fav.product_name}${fav.is_deleted ? ' <span style="color: #ff3b30; font-size: 11px;">(удален)</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important;">
                            Добавлено: ${formatDate(fav.created_at)}
                        </div>
                    </div>
                `;
            });
            
            favoritesContent += '</div>';
            
            if (hasMore) {
                favoritesContent += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.favorites.length} товаров в избранном (прокрутите список для просмотра всех)
                </p>`;
            }
        }
        
        html += createCollapsibleSection('favorites', `❤️ Избранное (${clientDetail.favorites_count})`, favoritesContent);
        
        clientsList.innerHTML = html;
        
        // Добавляем обработчик для кликов на карточки товаров (делегирование событий)
        clientsList.addEventListener('click', async (e) => {
            // Ищем ближайшую карточку товара
            const productCard = e.target.closest('.client-product-card');
            if (!productCard) return;
            
            // Предотвращаем открытие товара при клике на кнопки внутри карточки
            if (e.target.closest('button')) {
                return;
            }
            
            const productIdStr = productCard.dataset.productId;
            const productId = productIdStr ? parseInt(productIdStr) : null;
            // Проверяем isDeleted из dataset - может быть 'true', 'false', true, false или undefined
            const isDeletedAttr = productCard.dataset.isDeleted;
            const isDeleted = isDeletedAttr === 'true' || isDeletedAttr === true || String(isDeletedAttr).toLowerCase() === 'true';
            
            console.log('[CLIENT PRODUCT CLICK] productId:', productId, 'isDeleted:', isDeleted, 'isDeletedAttr:', isDeletedAttr);
            
            if (productId) {
                // Вызываем openProductById для всех товаров (включая удаленные) для показа уведомления
                await openProductById(productId, isDeleted);
            } else if (isDeleted) {
                // Если товар удален, но productId отсутствует, все равно показываем уведомление
                showNotification('Товар был удален и недоступен для просмотра', 'error');
            }
        });
        
        // Добавляем обработчики для выпадающих секций
        const collapsibleHeaders = clientsList.querySelectorAll('.collapsible-header');
        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sectionId = header.dataset.sectionId;
                const content = document.getElementById(`section-${sectionId}`);
                const arrow = header.querySelector('.collapsible-arrow');
                
                if (content && arrow) {
                    const isOpen = content.style.display !== 'none';
                    content.style.display = isOpen ? 'none' : 'block';
                    arrow.textContent = isOpen ? '▶' : '▼';
                }
            });
        });
        
        // Добавляем обработчик кнопки "Назад"
        const backBtn = document.getElementById('clients-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', backBtnHandler);
        }
        
        // Обработчики для активных резерваций
        const cancelReservationButtons = clientsList.querySelectorAll('.cancel-reservation-btn-client');
        cancelReservationButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const reservationId = parseInt(button.dataset.reservationId);
                if (!reservationId) return;
                
                const reservationItem = button.closest('div[style*="background: rgba(76, 175, 80, 0.1)"]');
                const productName = reservationItem ? reservationItem.querySelector('div[style*="font-size: 14px"]')?.textContent || 'товара' : 'товара';
                
                if (!confirm(`Отменить резервацию "${productName}"?`)) {
                    return;
                }
                
                try {
                    await cancelReservationAPI(reservationId);
                    showNotification('Резервация отменена', 'success');
                    // Перезагружаем детали клиента
                    await showClientDetail(clientId);
                } catch (error) {
                    console.error('Error canceling reservation:', error);
                    showNotification('Ошибка при отмене резервации: ' + error.message, 'error');
                }
            });
        });
        
        // Обработчики для активных заказов
        const completeOrderButtons = clientsList.querySelectorAll('.complete-order-btn-client');
        completeOrderButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const orderId = parseInt(button.dataset.orderId);
                if (!orderId) return;
                
                if (!confirm('Выполнить этот заказ?')) {
                    return;
                }
                
                try {
                    await completeOrderAPI(orderId);
                    showNotification('Заказ выполнен', 'success');
                    // Перезагружаем детали клиента
                    await showClientDetail(clientId);
                } catch (error) {
                    console.error('Error completing order:', error);
                    showNotification('Ошибка: ' + error.message, 'error');
                }
            });
        });
        
        const cancelOrderButtons = clientsList.querySelectorAll('.cancel-order-btn-client');
        cancelOrderButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const orderId = parseInt(button.dataset.orderId);
                if (!orderId) return;
                
                if (!confirm('Отменить этот заказ? Заказ будет удален из списка.')) {
                    return;
                }
                
                try {
                    await cancelOrderAPI(orderId);
                    showNotification('Заказ отменен', 'success');
                    // Перезагружаем детали клиента
                    await showClientDetail(clientId);
                } catch (error) {
                    console.error('Error canceling order:', error);
                    showNotification('Ошибка: ' + error.message, 'error');
                }
            });
        });
        
        // Обработчики для активных покупок
        const completePurchaseButtons = clientsList.querySelectorAll('.complete-purchase-btn-client');
        completePurchaseButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const purchaseId = parseInt(button.dataset.purchaseId);
                if (!purchaseId) return;
                
                // Получаем shop_owner_id из контекста
                let shopOwnerId = null;
                if (typeof window.getAppContext === 'function') {
                    const context = window.getAppContext();
                    if (context && context.shop_owner_id) {
                        shopOwnerId = context.shop_owner_id;
                    }
                }
                
                if (!shopOwnerId) {
                    showNotification('Ошибка: не удалось определить владельца магазина', 'error');
                    return;
                }
                
                if (!confirm('Выполнить эту заявку на покупку?')) {
                    return;
                }
                
                try {
                    await updatePurchaseStatusAPI(purchaseId, shopOwnerId, {
                        is_completed: true,
                        status: 'completed'
                    });
                    showNotification('Заявка на покупку выполнена', 'success');
                    // Перезагружаем детали клиента
                    await showClientDetail(clientId);
                } catch (error) {
                    console.error('Error completing purchase:', error);
                    showNotification('Ошибка: ' + error.message, 'error');
                }
            });
        });
        
        const cancelPurchaseButtons = clientsList.querySelectorAll('.cancel-purchase-btn-client');
        cancelPurchaseButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const purchaseId = parseInt(button.dataset.purchaseId);
                if (!purchaseId) return;
                
                // Получаем shop_owner_id из контекста
                let shopOwnerId = null;
                if (typeof window.getAppContext === 'function') {
                    const context = window.getAppContext();
                    if (context && context.shop_owner_id) {
                        shopOwnerId = context.shop_owner_id;
                    }
                }
                
                if (!shopOwnerId) {
                    showNotification('Ошибка: не удалось определить владельца магазина', 'error');
                    return;
                }
                
                if (!confirm('Отменить эту заявку на покупку?')) {
                    return;
                }
                
                try {
                    await updatePurchaseStatusAPI(purchaseId, shopOwnerId, {
                        is_cancelled: true,
                        status: 'cancelled'
                    });
                    showNotification('Заявка на покупку отменена', 'success');
                    // Перезагружаем детали клиента
                    await showClientDetail(clientId);
                } catch (error) {
                    console.error('Error canceling purchase:', error);
                    showNotification('Ошибка: ' + error.message, 'error');
                }
            });
        });
        
        // Добавляем обработчик клика для ссылки Telegram в детальном виде
        const detailTelegramLink = document.getElementById(detailTelegramLinkId);
        if (detailTelegramLink) {
            // На всех платформах используем openTelegramChat через WebApp API
            detailTelegramLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openTelegramChat(clientDetail.user_id, clientDetail.username);
                return false;
            }, { passive: false });
        }
        
        // Обработчик для кнопки редактирования контактов в детальном виде
        const editDetailBtn = clientsList.querySelector('.edit-client-contact-detail-btn');
        if (editDetailBtn) {
            editDetailBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showEditContactModal({
                    user_id: clientDetail.user_id,
                    first_name: clientDetail.first_name,
                    last_name: clientDetail.last_name,
                    middle_name: clientDetail.middle_name,
                    phone_country_code: clientDetail.phone_country_code,
                    phone_number: clientDetail.phone_number,
                    email: clientDetail.email,
                    city: clientDetail.city,
                    address: clientDetail.address
                });
            });
        }
        
        // Обработчики для копирования полей по клику
        const copyableFields = clientsList.querySelectorAll('.copyable-field');
        copyableFields.forEach(field => {
            // Добавляем hover-эффект
            field.addEventListener('mouseenter', () => {
                field.style.background = 'rgba(90, 200, 250, 0.15)';
                field.style.border = '1px solid rgba(90, 200, 250, 0.3)';
                field.style.transform = 'scale(1.01)';
            });
            
            field.addEventListener('mouseleave', () => {
                field.style.background = 'rgba(90, 200, 250, 0.1)';
                field.style.border = '1px solid rgba(90, 200, 250, 0.2)';
                field.style.transform = 'scale(1)';
            });
            
            field.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const textToCopy = field.dataset.copyText;
                if (!textToCopy) return;
                
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    showNotification('Скопировано', 'success');
                    
                    // Визуальная обратная связь
                    const originalBg = field.style.background;
                    const originalBorder = field.style.border;
                    field.style.background = 'rgba(76, 175, 80, 0.2)';
                    field.style.border = '1px solid rgba(76, 175, 80, 0.4)';
                    
                    setTimeout(() => {
                        field.style.background = originalBg;
                        field.style.border = originalBorder;
                    }, 1000);
                } catch (error) {
                    console.error('Error copying text:', error);
                    // Fallback для старых браузеров
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        showNotification('Скопировано', 'success');
                        
                        // Визуальная обратная связь
                        const originalBg = field.style.background;
                        const originalBorder = field.style.border;
                        field.style.background = 'rgba(76, 175, 80, 0.2)';
                        field.style.border = '1px solid rgba(76, 175, 80, 0.4)';
                        
                        setTimeout(() => {
                            field.style.background = originalBg;
                            field.style.border = originalBorder;
                        }, 1000);
                    } catch (err) {
                        showNotification('Ошибка при копировании', 'error');
                    }
                    document.body.removeChild(textArea);
                }
            });
        });
        
        // Предотвращаем всплытие скролла на родительский элемент
        // Это позволяет скроллить только внутри контейнеров списков
        const scrollContainers = clientsList.querySelectorAll('.client-items-scroll');
        scrollContainers.forEach(container => {
            container.addEventListener('wheel', (e) => {
                const { scrollTop, scrollHeight, clientHeight } = container;
                const isAtTop = scrollTop === 0;
                const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
                
                // Если прокручиваем вверх и уже вверху, или вниз и уже внизу
                // предотвращаем всплытие события
                if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
                    e.stopPropagation();
                }
            }, { passive: true });
            
            // Также предотвращаем всплытие touch событий
            let touchStartY = 0;
            container.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            
            container.addEventListener('touchmove', (e) => {
                const touchY = e.touches[0].clientY;
                const deltaY = touchStartY - touchY;
                const { scrollTop, scrollHeight, clientHeight } = container;
                const isAtTop = scrollTop === 0;
                const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
                
                // Если пытаемся прокрутить за пределы контейнера, предотвращаем всплытие
                if ((deltaY < 0 && isAtTop) || (deltaY > 0 && isAtBottom)) {
                    e.stopPropagation();
                }
            }, { passive: true });
        });
        
    } catch (error) {
        console.error('Error loading client detail:', error);
        clientsList.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

/**
 * Показать модальное окно для редактирования контактных данных клиента
 */
function showEditContactModal(client) {
    // Создаем модальное окно
    let modal = document.getElementById('edit-client-contact-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-client-contact-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }
    
    // Формируем содержимое модального окна
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; max-height: 90vh; overflow-y: auto;">
            <span class="modal-close edit-contact-close" style="
                position: absolute;
                top: 10px;
                right: 20px;
                font-size: 28px;
                font-weight: bold;
                color: #aaa;
                cursor: pointer;
                z-index: 1000;
            ">&times;</span>
            <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #ffffff !important;">✏️ Редактировать контакты клиента</h2>
            <form id="edit-contact-form" style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <label for="edit-contact-last-name" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Фамилия:</label>
                    <input type="text" id="edit-contact-last-name" value="${client.last_name || ''}" placeholder="Введите фамилию" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; box-sizing: border-box;">
                </div>
                <div>
                    <label for="edit-contact-first-name" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Имя:</label>
                    <input type="text" id="edit-contact-first-name" value="${client.first_name || ''}" placeholder="Введите имя" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; box-sizing: border-box;">
                </div>
                <div>
                    <label for="edit-contact-middle-name" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Отчество:</label>
                    <input type="text" id="edit-contact-middle-name" value="${client.middle_name || ''}" placeholder="Введите отчество" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; box-sizing: border-box;">
                </div>
                <div>
                    <label for="edit-contact-phone" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Номер телефона:</label>
                    <div style="display: flex; gap: 8px;">
                        <select id="edit-contact-phone-country-code" style="flex: 0 0 100px; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px;">
                            <option value="+7" ${client.phone_country_code === '+7' ? 'selected' : ''}>+7</option>
                            <option value="+1" ${client.phone_country_code === '+1' ? 'selected' : ''}>+1</option>
                            <option value="+44" ${client.phone_country_code === '+44' ? 'selected' : ''}>+44</option>
                            <option value="+49" ${client.phone_country_code === '+49' ? 'selected' : ''}>+49</option>
                            <option value="+33" ${client.phone_country_code === '+33' ? 'selected' : ''}>+33</option>
                            <option value="+86" ${client.phone_country_code === '+86' ? 'selected' : ''}>+86</option>
                            <option value="+81" ${client.phone_country_code === '+81' ? 'selected' : ''}>+81</option>
                            <option value="+82" ${client.phone_country_code === '+82' ? 'selected' : ''}>+82</option>
                            <option value="+91" ${client.phone_country_code === '+91' ? 'selected' : ''}>+91</option>
                            <option value="+61" ${client.phone_country_code === '+61' ? 'selected' : ''}>+61</option>
                        </select>
                        <input type="tel" id="edit-contact-phone-number" value="${client.phone_number || ''}" placeholder="Введите номер телефона" pattern="[0-9]{10,15}" style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; box-sizing: border-box;">
                    </div>
                    <div id="edit-contact-phone-error" style="color: #ff3b30; font-size: 12px; margin-top: 4px; display: none;"></div>
                </div>
                <div>
                    <label for="edit-contact-email" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Email:</label>
                    <input type="email" id="edit-contact-email" value="${client.email || ''}" placeholder="example@mail.com" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; box-sizing: border-box;">
                    <div id="edit-contact-email-error" style="color: #ff3b30; font-size: 12px; margin-top: 4px; display: none;"></div>
                </div>
                <div>
                    <label for="edit-contact-city" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Город:</label>
                    <input type="text" id="edit-contact-city" value="${client.city || ''}" placeholder="Введите город" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; box-sizing: border-box;">
                </div>
                <div>
                    <label for="edit-contact-address" style="display: block; margin-bottom: 6px; font-weight: 500; color: #ffffff !important;">Адрес:</label>
                    <textarea id="edit-contact-address" rows="3" placeholder="Введите адрес" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-glass); color: var(--text-primary); font-size: 16px; resize: vertical; box-sizing: border-box;">${client.address || ''}</textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <button type="button" class="edit-contact-cancel-btn" style="flex: 1; padding: 12px; background: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 600;">Отменить</button>
                    <button type="submit" style="flex: 1; padding: 12px; background: linear-gradient(135deg, rgba(90, 200, 250, 0.9) 0%, rgba(90, 200, 250, 0.7) 100%); color: #ffffff; border: 1px solid rgba(90, 200, 250, 0.5); border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 600;">Сохранить</button>
                </div>
            </form>
        </div>
    `;
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Обработчики закрытия
    const closeBtn = modal.querySelector('.edit-contact-close');
    const cancelBtn = modal.querySelector('.edit-contact-cancel-btn');
    
    const closeModal = () => {
        modal.style.display = 'none';
    };
    
    closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    // Закрытие при клике вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Валидация и отправка формы
    const form = modal.querySelector('#edit-contact-form');
    const phoneInput = modal.querySelector('#edit-contact-phone-number');
    const emailInput = modal.querySelector('#edit-contact-email');
    const phoneError = modal.querySelector('#edit-contact-phone-error');
    const emailError = modal.querySelector('#edit-contact-email-error');
    
    // Валидация телефона
    phoneInput.addEventListener('input', () => {
        const phone = phoneInput.value.replace(/\D/g, '');
        if (phone && phone.length < 10) {
            phoneError.textContent = 'Номер телефона должен содержать минимум 10 цифр';
            phoneError.style.display = 'block';
        } else {
            phoneError.style.display = 'none';
        }
    });
    
    // Валидация email
    emailInput.addEventListener('blur', () => {
        const email = emailInput.value.trim();
        if (email) {
            const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailPattern.test(email)) {
                emailError.textContent = 'Некорректный формат email';
                emailError.style.display = 'block';
            } else {
                emailError.style.display = 'none';
            }
        } else {
            emailError.style.display = 'none';
        }
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Проверяем валидность
        const phone = phoneInput.value.replace(/\D/g, '');
        const email = emailInput.value.trim();
        
        let isValid = true;
        
        if (phone && phone.length < 10) {
            phoneError.textContent = 'Номер телефона должен содержать минимум 10 цифр';
            phoneError.style.display = 'block';
            isValid = false;
        }
        
        if (email) {
            const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailPattern.test(email)) {
                emailError.textContent = 'Некорректный формат email';
                emailError.style.display = 'block';
                isValid = false;
            }
        }
        
        if (!isValid) {
            return;
        }
        
        // Собираем данные
        const contactData = {
            first_name: document.getElementById('edit-contact-first-name').value.trim() || null,
            last_name: document.getElementById('edit-contact-last-name').value.trim() || null,
            middle_name: document.getElementById('edit-contact-middle-name').value.trim() || null,
            phone_country_code: document.getElementById('edit-contact-phone-country-code').value || null,
            phone_number: phone || null,
            email: email || null,
            city: document.getElementById('edit-contact-city').value.trim() || null,
            address: document.getElementById('edit-contact-address').value.trim() || null
        };
        
        // Преобразуем пустые строки в null для city и address
        if (contactData.city === '') {
            contactData.city = null;
        }
        if (contactData.address === '') {
            contactData.address = null;
        }
        
        // Удаляем пустые поля, но НЕ удаляем city и address (даже если null, чтобы очистить старые значения)
        Object.keys(contactData).forEach(key => {
            if (key !== 'city' && key !== 'address' && (contactData[key] === null || contactData[key] === '')) {
                delete contactData[key];
            }
        });
        
        console.log('Sending contact data:', contactData); // Для отладки
        
        try {
            await updateClientContactAPI(client.user_id, contactData);
            showNotification('Контактные данные обновлены', 'success');
            closeModal();
            
            // Проверяем, находимся ли мы в детальном виде клиента
            const clientsList = document.getElementById('clients-list');
            const backBtn = clientsList?.querySelector('#clients-back-btn');
            
            if (backBtn) {
                // Мы в детальном виде - перезагружаем детали клиента
                await showClientDetail(client.user_id);
            } else {
                // Мы в списке клиентов - перезагружаем список
                await loadClients();
            }
        } catch (error) {
            console.error('Error updating client contact:', error);
            showNotification('Ошибка при обновлении: ' + error.message, 'error');
        }
    });
}
