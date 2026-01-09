// Модуль обработчиков резерваций админки
import { cancelReservationAPI } from '../api/reservations.js';
import { showNotification } from '../utils/admin_utils.js';

/**
 * Загрузка и отображение резерваций для админа
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadReservations - Функция для рекурсивного вызова (сама себя)
 */
export async function loadReservations(dependencies = {}) {
    const { loadReservations: loadReservationsRecursive } = dependencies;
    
    // Используем переданную функцию или саму себя для рекурсивных вызовов
    const loadReservationsFn = loadReservationsRecursive || loadReservations;
    
    const reservationsList = document.getElementById('reservations-list');
    if (!reservationsList) {
        return;
    }
    
    reservationsList.innerHTML = '<p class="loading">Загрузка резерваций...</p>';
    
    try {
        // Получаем контекст приложения для определения владельца магазина
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext || !appContext.shop_owner_id) {
            reservationsList.innerHTML = '<p class="loading">Ошибка: не удалось определить владельца магазина</p>';
            return;
        }
        
        // Используем endpoint /user/me который возвращает резервации для владельца магазина
        const { API_BASE, getBaseHeaders } = await import('../api/config.js');
        
        const response = await fetch(`${API_BASE}/api/reservations/user/me`, {
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch reservations: ${response.status} - ${errorText}`);
        }
        
        const reservations = await response.json();
        
        if (!reservations || !Array.isArray(reservations) || reservations.length === 0) {
            reservationsList.innerHTML = '<p class="loading">Активных резерваций нет</p>';
            return;
        }
        
        // Фильтруем только активные резервации для товаров владельца магазина
        const shopOwnerId = Number(appContext.shop_owner_id);
        
        if (isNaN(shopOwnerId)) {
            reservationsList.innerHTML = '<p class="loading">Ошибка: неверный ID владельца магазина</p>';
            return;
        }
        
        // Фильтрация резерваций для админа
        // Показываем резервации где user_id == shop_owner_id (товары владельца магазина)
        const activeReservations = reservations.filter(res => {
            // Проверка активности - гибкая проверка (может быть true или "true")
            const isActive = res.is_active === true || res.is_active === "true" || res.is_active === 1;
            if (!isActive) {
                return false;
            }
            
            // Проверка времени резервации
            if (!res.reserved_until) {
                return false;
            }
            
            // Парсим дату: бекенд возвращает UTC время без timezone, добавляем Z
            let reservedUntilStr = res.reserved_until;
            // Если нет timezone информации, добавляем Z (UTC)
            if (!reservedUntilStr.includes('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                reservedUntilStr = reservedUntilStr + 'Z';
            }
            const reservedUntil = new Date(reservedUntilStr);
            const now = new Date();
            
            if (isNaN(reservedUntil.getTime())) {
                return false;
            }
            
            if (reservedUntil <= now) {
                return false;
            }
            
            // Проверка владельца магазина - используем преобразование в числа для надежного сравнения
            const resUserId = Number(res.user_id);
            const shopOwnerIdNum = Number(shopOwnerId);
            
            // Проверяем на NaN
            if (isNaN(resUserId) || isNaN(shopOwnerIdNum)) {
                return false;
            }
            
            // Резервация принадлежит магазину админа
            return resUserId === shopOwnerIdNum;
        });
        
        if (!activeReservations || activeReservations.length === 0) {
            reservationsList.innerHTML = '<p class="loading">Активных резерваций нет</p>';
            return;
        }
        
        // Рендерим список резерваций
        reservationsList.innerHTML = '';
        
        // Загружаем информацию о товарах для резерваций
        const productIds = [...new Set(activeReservations.map(r => r.product_id))];
        const productsMap = new Map();
        
        // Загружаем информацию о товарах
        for (const productId of productIds) {
            try {
                const { API_BASE, getBaseHeaders } = await import('../api/config.js');
                const productResponse = await fetch(`${API_BASE}/api/products/${productId}`, {
                    headers: getBaseHeaders()
                });
                if (productResponse.ok) {
                    const product = await productResponse.json();
                    productsMap.set(productId, product);
                }
            } catch (error) {
                console.error(`Error loading product ${productId}:`, error);
            }
        }
        
        activeReservations.forEach(reservation => {
            const reservationItem = document.createElement('div');
            reservationItem.className = 'order-item';
            reservationItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8)) !important;
                backdrop-filter: blur(20px) !important;
                border-radius: 12px !important;
                padding: 12px 14px !important;
                margin-bottom: 8px !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                box-shadow: 0 2px 8px var(--shadow-light) !important;
                transition: all 0.2s ease !important;
            `;
            
            const product = productsMap.get(reservation.product_id);
            const productName = product?.name || `Товар #${reservation.product_id}`;
            // В резервации нет поля quantity, всегда 1
            const quantity = 1;
            // Парсим дату: бекенд возвращает UTC время без timezone, добавляем Z
            let reservedUntilStr = reservation.reserved_until;
            if (!reservedUntilStr.includes('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
                reservedUntilStr = reservedUntilStr + 'Z';
            }
            const reservedUntil = new Date(reservedUntilStr);
            const now = new Date();
            const timeLeft = Math.max(0, Math.floor((reservedUntil - now) / 1000 / 60)); // минуты
            
            const hoursLeft = Math.floor(timeLeft / 60);
            const minutesLeft = timeLeft % 60;
            
            let timeLeftText = '';
            if (hoursLeft > 0) {
                timeLeftText = `${hoursLeft} ч ${minutesLeft} мин`;
            } else {
                timeLeftText = `${minutesLeft} мин`;
            }
            
            reservationItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div style="flex: 1; min-width: 0;">
                        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${productName}
                        </h3>
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            Количество: <strong style="color: var(--tg-theme-link-color);">${quantity} шт.</strong>
                        </div>
                        <div style="font-size: 13px; color: var(--text-hint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            Осталось: <strong style="color: ${timeLeft < 30 ? '#ff3b30' : 'var(--tg-theme-link-color)'};">${timeLeftText}</strong>
                        </div>
                        ${reservation.reserved_by_user_id ? `
                            <div style="font-size: 12px; color: var(--text-hint); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ID пользователя: ${reservation.reserved_by_user_id}
                            </div>
                        ` : ''}
                    </div>
                    <button class="cancel-reservation-btn-small" style="flex-shrink: 0;" data-reservation-id="${reservation.id}">
                        Отменить
                    </button>
                </div>
            `;
            
            reservationsList.appendChild(reservationItem);
        });
        
        // Настраиваем обработчики кнопок отмены
        const cancelButtons = reservationsList.querySelectorAll('.cancel-reservation-btn-small');
        cancelButtons.forEach(button => {
            button.onclick = async () => {
                const reservationId = parseInt(button.dataset.reservationId);
                if (!reservationId) return;
                
                const reservationItem = button.closest('.order-item');
                const productName = reservationItem ? reservationItem.querySelector('h3')?.textContent || 'товара' : 'товара';
                
                if (!confirm(`Отменить резервацию "${productName}"?`)) {
                    return;
                }
                
                try {
                    await cancelReservationAPI(reservationId);
                    showNotification('Резервация отменена', 'success');
                    await loadReservationsFn({ loadReservations: loadReservationsFn }); // Перезагружаем список
                } catch (error) {
                    console.error('Error canceling reservation:', error);
                    showNotification('Ошибка при отмене резервации: ' + error.message, 'error');
                }
            };
        });
        
    } catch (error) {
        let errorMessage = 'Ошибка загрузки резерваций';
        
        if (error.message && (error.message.includes('401') || error.message.includes('initData'))) {
            errorMessage = 'Ошибка авторизации. Убедитесь, что приложение открыто через Telegram-бота.';
        } else if (error.message && error.message.includes('404')) {
            errorMessage = 'Резервации не найдены.';
        } else {
            errorMessage = `Ошибка: ${error.message || 'Неизвестная ошибка'}`;
        }
        
        if (reservationsList) {
            reservationsList.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
        }
    }
}

