// Модуль обработчиков клиентов админки
import { getClientDetailAPI, getClientsListAPI } from '../api/clients.js';

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
 * Форматирует дату в читаемый формат
 */
function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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
            
            clientCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            👤 Клиент #${client.user_id}
                        </div>
                        <div style="font-size: 14px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${usernameDisplay}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important;">
                            Последний визит: ${formatDate(client.last_visit)}
                        </div>
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
        });
        
    } catch (error) {
        console.error('Error loading clients:', error);
        clientsList.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}

/**
 * Показать детальную информацию о клиенте
 */
async function showClientDetail(clientId) {
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
        
        // Статистика клиента
        html += `
            <div style="
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 18px; color: #ffffff !important;">📊 Статистика клиента</h3>
                    <div style="text-align: right;">
                        ${usernameDisplay}
                    </div>
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
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Первый визит</div>
                    <div style="font-size: 14px; color: #ffffff !important;">${formatDate(clientDetail.stats.first_visit)}</div>
                </div>
                <div style="margin-top: 8px;">
                    <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">Последний визит</div>
                    <div style="font-size: 14px; color: #ffffff !important;">${formatDate(clientDetail.stats.last_visit)}</div>
                </div>
            </div>
        `;
        
        // Резервации
        html += `
            <div style="
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #ffffff !important;">
                    🔒 Резервации (${clientDetail.reservations_count})
                </h3>
        `;
        
        if (clientDetail.reservations.length === 0) {
            html += '<p style="color: #8e8e93 !important; font-size: 14px;">Резерваций нет</p>';
        } else {
            // Показываем все элементы, но ограничиваем высоту контейнера (примерно 3 элемента)
            const hasMore = clientDetail.reservations.length > 3;
            const maxHeight = hasMore ? 300 : 'auto'; // Примерно 3 элемента по 100px
            
            html += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.reservations.forEach(res => {
                const status = res.is_active ? 'Активна' : 'Завершена';
                const statusColor = res.is_active ? '#4CAF50' : '#8e8e93';
                html += `
                    <div style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${res.product_name}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important; margin-bottom: 4px;">
                            ${formatDate(res.created_at)}
                        </div>
                        <div style="font-size: 12px; color: ${statusColor} !important;">
                            Статус: ${status}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            
            if (hasMore) {
                html += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.reservations.length} резерваций (прокрутите список для просмотра всех)
                </p>`;
            }
        }
        
        html += '</div>';
        
        // Заказы
        html += `
            <div style="
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #ffffff !important;">
                    🛒 Заказы (${clientDetail.orders_count})
                </h3>
        `;
        
        if (clientDetail.orders.length === 0) {
            html += '<p style="color: #8e8e93 !important; font-size: 14px;">Заказов нет</p>';
        } else {
            // Показываем все элементы, но ограничиваем высоту контейнера (примерно 3 элемента)
            const hasMore = clientDetail.orders.length > 3;
            const maxHeight = hasMore ? 360 : 'auto'; // Примерно 3 элемента по 120px
            
            html += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.orders.forEach(order => {
                const status = order.is_completed ? 'Выполнен' : order.is_cancelled ? 'Отменен' : 'В обработке';
                const statusColor = order.is_completed ? '#4CAF50' : order.is_cancelled ? '#ff3b30' : '#FF9800';
                html += `
                    <div style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${order.product_name} (${order.quantity} шт.)
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
            
            html += '</div>';
            
            if (hasMore) {
                html += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.orders.length} заказов (прокрутите список для просмотра всех)
                </p>`;
            }
        }
        
        html += '</div>';
        
        // Продажи (purchases)
        html += `
            <div style="
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #ffffff !important;">
                    💰 Продажи (${clientDetail.purchases_count})
                </h3>
        `;
        
        if (clientDetail.purchases.length === 0) {
            html += '<p style="color: #8e8e93 !important; font-size: 14px;">Продаж нет</p>';
        } else {
            // Показываем все элементы, но ограничиваем высоту контейнера (примерно 3 элемента)
            const hasMore = clientDetail.purchases.length > 3;
            const maxHeight = hasMore ? 420 : 'auto'; // Примерно 3 элемента по 140px
            
            html += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.purchases.forEach(purchase => {
                const status = purchase.is_completed ? 'Выполнена' : purchase.is_cancelled ? 'Отменена' : 'В обработке';
                const statusColor = purchase.is_completed ? '#4CAF50' : purchase.is_cancelled ? '#ff3b30' : '#FF9800';
                html += `
                    <div style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${purchase.product_name}
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
            
            html += '</div>';
            
            if (hasMore) {
                html += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.purchases.length} продаж (прокрутите список для просмотра всех)
                </p>`;
            }
        }
        
        html += '</div>';
        
        // Избранное
        html += `
            <div style="
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #ffffff !important;">
                    ❤️ Избранное (${clientDetail.favorites_count})
                </h3>
        `;
        
        if (clientDetail.favorites.length === 0) {
            html += '<p style="color: #8e8e93 !important; font-size: 14px;">Избранного нет</p>';
        } else {
            // Показываем все элементы, но ограничиваем высоту контейнера (примерно 3 элемента)
            const hasMore = clientDetail.favorites.length > 3;
            const maxHeight = hasMore ? 270 : 'auto'; // Примерно 3 элемента по 90px
            
            html += `<div class="client-items-scroll" style="
                max-height: ${maxHeight}px;
                overflow-y: ${hasMore ? 'auto' : 'visible'};
                overflow-x: hidden;
                padding-right: 4px;
            ">`;
            
            clientDetail.favorites.forEach(fav => {
                html += `
                    <div style="
                        background: rgba(255, 255, 255, 0.05);
                        padding: 12px;
                        border-radius: 8px;
                        margin-bottom: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff !important; margin-bottom: 4px;">
                            ${fav.product_name}
                        </div>
                        <div style="font-size: 12px; color: #8e8e93 !important;">
                            Добавлено: ${formatDate(fav.created_at)}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            
            if (hasMore) {
                html += `<p style="color: #8e8e93 !important; font-size: 12px; margin-top: 8px; text-align: center;">
                    Всего ${clientDetail.favorites.length} товаров в избранном (прокрутите список для просмотра всех)
                </p>`;
            }
        }
        
        html += '</div>';
        
        clientsList.innerHTML = html;
        
        // Добавляем обработчик кнопки "Назад"
        const backBtn = document.getElementById('clients-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', backBtnHandler);
        }
        
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
