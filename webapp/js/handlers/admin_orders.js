// ========== REFACTORING STEP 4.1: loadOrders ==========
// Модуль обработчиков заказов админки
// Дата начала: 2024-12-19
// Статус: В процессе

import { cancelOrderAPI, completeOrderAPI, deleteOrderAPI, deleteOrdersAPI, getShopOrdersAPI } from '../api.js';
import { showNotification } from '../utils/admin_utils.js';

/**
 * Загрузка и отображение заказов
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadOrders - Функция для рекурсивного вызова (сама себя)
 */
export async function loadOrders(dependencies = {}) {
    const { loadOrders: loadOrdersRecursive } = dependencies;
    
    // Используем переданную функцию или саму себя для рекурсивных вызовов
    const loadOrdersFn = loadOrdersRecursive || loadOrders;
    
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;
    
    ordersList.innerHTML = '<p class="loading">Загрузка заказов...</p>';
    
    try {
        const orders = await getShopOrdersAPI();
        
        if (!orders || orders.length === 0) {
            ordersList.innerHTML = '<p class="loading">Заказов пока нет</p>';
            return;
        }
        
        // Рендерим список заказов
        ordersList.innerHTML = '';
        
        // Добавляем панель управления (выбрать все, удалить выбранные)
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 12px;
            background: var(--bg-glass, rgba(28, 28, 30, 0.8));
            backdrop-filter: blur(20px);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.id = 'select-all-orders';
        selectAllCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        
        const selectAllLabel = document.createElement('label');
        selectAllLabel.htmlFor = 'select-all-orders';
        selectAllLabel.textContent = 'Выбрать все';
        selectAllLabel.style.cssText = 'font-size: 14px; color: var(--tg-theme-text-color); cursor: pointer;';
        
        selectAllDiv.appendChild(selectAllCheckbox);
        selectAllDiv.appendChild(selectAllLabel);
        
        const deleteSelectedBtn = document.createElement('button');
        deleteSelectedBtn.textContent = '🗑️ Удалить выбранные';
        deleteSelectedBtn.style.cssText = `
            padding: 6px 12px;
            background: rgba(255, 59, 48, 0.2);
            color: rgb(255, 59, 48);
            border: 1px solid rgba(255, 59, 48, 0.5);
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
            display: none;
        `;
        
        controlsDiv.appendChild(selectAllDiv);
        controlsDiv.appendChild(deleteSelectedBtn);
        ordersList.appendChild(controlsDiv);
        
        // Обработчик "Выбрать все"
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.order-item-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateDeleteButtonVisibility();
        });
        
        // Обработчик удаления выбранных
        deleteSelectedBtn.addEventListener('click', async () => {
            const selectedCheckboxes = document.querySelectorAll('.order-item-checkbox:checked');
            if (selectedCheckboxes.length === 0) {
                alert('❌ Выберите заказы для удаления');
                return;
            }
            
            const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.orderId));
            const count = selectedIds.length;
            
            if (!confirm(`Удалить ${count} ${count === 1 ? 'заказ' : count < 5 ? 'заказа' : 'заказов'}? Это действие нельзя отменить.`)) {
                return;
            }
            
            try {
                await deleteOrdersAPI(selectedIds);
                alert(`✅ Удалено ${count} ${count === 1 ? 'заказ' : count < 5 ? 'заказа' : 'заказов'}`);
                await loadOrdersFn(dependencies); // Перезагружаем список
            } catch (error) {
                console.error('Error deleting orders:', error);
                alert(`❌ Ошибка при удалении: ${error.message}`);
            }
        });
        
        // Функция обновления видимости кнопки удаления
        function updateDeleteButtonVisibility() {
            const selectedCheckboxes = document.querySelectorAll('.order-item-checkbox:checked');
            if (selectedCheckboxes.length > 0) {
                deleteSelectedBtn.style.display = 'block';
            } else {
                deleteSelectedBtn.style.display = 'none';
            }
        }
        
        orders.forEach(order => {
            // Логируем данные заказа для отладки
            console.log('📦 Order data:', {
                id: order.id,
                product_id: order.product_id,
                ordered_by_user_id: order.ordered_by_user_id,
                quantity: order.quantity,
                first_name: order.first_name,
                last_name: order.last_name,
                phone_number: order.phone_number,
                email: order.email,
                delivery_method: order.delivery_method,
                notes: order.notes,
                promo_code: order.promo_code
            });
            
            const orderItem = document.createElement('div');
            orderItem.className = 'order-item';
            orderItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 8px;
                position: relative;
            `;
            
            // Чекбокс и название в одной строке
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
            
            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';
            
            // Чекбокс для выбора
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'order-item-checkbox';
            checkbox.dataset.orderId = order.id;
            checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
            checkbox.addEventListener('change', () => {
                updateDeleteButtonVisibility();
                // Обновляем состояние "Выбрать все"
                const allCheckboxes = document.querySelectorAll('.order-item-checkbox');
                const checkedCount = document.querySelectorAll('.order-item-checkbox:checked').length;
                selectAllCheckbox.checked = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;
            });
            
            // Название товара
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--tg-theme-text-color); flex: 1;';
            if (order.product && order.product.name) {
                nameDiv.textContent = order.product.name;
            } else {
                nameDiv.textContent = `Товар #${order.product_id}`;
            }
            
            leftDiv.appendChild(checkbox);
            leftDiv.appendChild(nameDiv);
            
            headerDiv.appendChild(leftDiv);
            
            // Кнопка удаления - в нижнем правом углу
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 8px;
                padding: 4px 8px;
                background: rgba(255, 59, 48, 0.2);
                color: rgb(255, 59, 48);
                border: 1px solid rgba(255, 59, 48, 0.5);
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                min-width: 28px;
                min-height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            deleteBtn.title = 'Удалить заказ';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const productName = order.product && order.product.name ? order.product.name : `Товар #${order.product_id}`;
                if (!confirm(`Удалить заказ "${productName}"? Это действие нельзя отменить.`)) {
                    return;
                }
                
                try {
                    await deleteOrderAPI(order.id);
                    alert('✅ Заказ удален');
                    await loadOrdersFn(dependencies); // Перезагружаем список
                } catch (error) {
                    console.error('Error deleting order:', error);
                    alert(`❌ Ошибка при удалении: ${error.message}`);
                }
            });
            
            orderItem.appendChild(deleteBtn);
            
            // Информация о заказе
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
            
            // Количество
            const quantityDiv = document.createElement('div');
            quantityDiv.style.cssText = 'font-size: 14px; color: var(--tg-theme-hint-color);';
            quantityDiv.textContent = `Количество: ${order.quantity} шт.`;
            
            // Дата заказа
            const dateDiv = document.createElement('div');
            dateDiv.style.cssText = 'font-size: 13px; color: var(--tg-theme-hint-color);';
            if (order.created_at) {
                const orderDate = new Date(order.created_at);
                dateDiv.textContent = `Дата заказа: ${orderDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;
            }
            
            // Статус
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'font-size: 14px; font-weight: 600;';
            if (order.is_completed) {
                statusDiv.textContent = '✅ Выполнен';
                statusDiv.style.color = '#4CAF50';
            } else if (order.is_cancelled) {
                statusDiv.textContent = '❌ Отменен';
                statusDiv.style.color = '#F44336';
            } else {
                statusDiv.textContent = '⏳ Ожидание';
                statusDiv.style.color = '#FFA500';
            }
            
            // Добавляем основные элементы в правильном порядке
            infoDiv.appendChild(quantityDiv);
            infoDiv.appendChild(dateDiv);
            infoDiv.appendChild(statusDiv);
            
            // Ссылка на Telegram пользователя
            if (order.ordered_by_user_id) {
                const userId = order.ordered_by_user_id;
                const telegramLink = document.createElement('button');
                telegramLink.type = 'button';
                telegramLink.style.cssText = 'font-size: 14px; color: var(--tg-theme-button-color, #5ac8fa); text-decoration: none; margin-top: 8px; display: inline-block; font-weight: 500; padding: 8px 16px; background: rgba(90, 200, 250, 0.15); border-radius: 8px; border: 1px solid rgba(90, 200, 250, 0.3); cursor: pointer; width: 100%; text-align: center; box-sizing: border-box;';
                telegramLink.textContent = `👤 Написать в Telegram`;
                
                // Обработчик клика - получаем username и открываем через https://t.me/username
                telegramLink.addEventListener('click', async function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('📱 Opening Telegram chat for user:', userId);
                    
                    // Показываем индикатор загрузки
                    telegramLink.disabled = true;
                    telegramLink.style.opacity = '0.6';
                    telegramLink.textContent = '⏳ Загрузка...';
                    
                    try {
                        // Получаем username через API
                        const { getUserUsernameAPI } = await import('../api.js');
                        const userData = await getUserUsernameAPI(userId);
                        const username = userData.username;
                        
                        let telegramUrl;
                        if (username) {
                            // Если есть username, используем https://t.me/username - это работает через браузер
                            telegramUrl = `https://t.me/${username}`;
                            console.log('📱 Using username link:', telegramUrl);
                        } else {
                            // Если username нет, используем tg://user?id=...
                            telegramUrl = `tg://user?id=${userId}`;
                            console.log('📱 Using user ID link:', telegramUrl);
                        }
                        
                        // В Telegram WebView используем openLink для открытия ссылки
                        if (window.Telegram && window.Telegram.WebApp) {
                            const webApp = window.Telegram.WebApp;
                            
                            // Метод openLink открывает ссылку через браузер/Telegram
                            if (typeof webApp.openLink === 'function') {
                                console.log('📱 Using Telegram.WebApp.openLink');
                                webApp.openLink(telegramUrl);
                                
                                // Восстанавливаем кнопку через небольшую задержку
                                setTimeout(() => {
                                    telegramLink.disabled = false;
                                    telegramLink.style.opacity = '1';
                                    telegramLink.textContent = '👤 Написать в Telegram';
                                }, 1000);
                                return;
                            }
                        }
                        
                        // Если API недоступен, открываем через window.open
                        console.log('📱 Fallback: Using window.open');
                        window.open(telegramUrl, '_blank');
                        
                        setTimeout(() => {
                            telegramLink.disabled = false;
                            telegramLink.style.opacity = '1';
                            telegramLink.textContent = '👤 Написать в Telegram';
                        }, 1000);
                    } catch (error) {
                        console.error('❌ Error opening Telegram chat:', error);
                        telegramLink.disabled = false;
                        telegramLink.style.opacity = '1';
                        telegramLink.textContent = '👤 Написать в Telegram';
                        alert('Ошибка при открытии чата. ID пользователя: ' + userId);
                    }
                }, { passive: false });
                
                infoDiv.appendChild(telegramLink);
            }
            
            // Расширенная информация о заказе
            const detailsList = [];
            
            if (order.first_name || order.last_name) {
                const fullName = `${order.first_name || ''} ${order.last_name || ''} ${order.middle_name || ''}`.trim();
                if (fullName) {
                    detailsList.push(`<div style="margin-bottom: 6px;"><strong>👤 Имя:</strong> ${fullName}</div>`);
                }
            }
            
            if (order.phone_number) {
                const phone = `${order.phone_country_code || ''}${order.phone_number}`.trim();
                if (phone) {
                    detailsList.push(`<div style="margin-bottom: 6px;"><strong>📱 Телефон:</strong> ${phone}</div>`);
                }
            }
            
            if (order.email) {
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>📧 Email:</strong> ${order.email}</div>`);
            }
            
            if (order.delivery_method) {
                const deliveryText = order.delivery_method === 'delivery' ? '🚚 Доставка' : '🏪 Самовывоз';
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>📦 Способ получения:</strong> ${deliveryText}</div>`);
            }
            
            if (order.notes) {
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>📝 Примечание:</strong> ${order.notes}</div>`);
            }
            
            if (order.promo_code) {
                detailsList.push(`<div style="margin-bottom: 6px;"><strong>🎟️ Промокод:</strong> ${order.promo_code}</div>`);
            }
            
            if (detailsList.length > 0) {
                const detailsDiv = document.createElement('div');
                detailsDiv.style.cssText = 'margin-top: 12px; padding: 12px; background: rgba(90, 200, 250, 0.1); border-radius: 8px; font-size: 13px; color: var(--tg-theme-text-color); border: 1px solid rgba(90, 200, 250, 0.2);';
                detailsDiv.innerHTML = '<div style="font-weight: 600; margin-bottom: 8px; color: var(--tg-theme-button-color, #5ac8fa);">📋 Детали заказа:</div>' + detailsList.join('');
                infoDiv.appendChild(detailsDiv);
            }
            
            // Кнопки действий (только для невыполненных заказов)
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display: flex; gap: 6px; margin-top: 6px; justify-content: flex-start; flex-wrap: wrap; max-width: 100%;';
            
            if (!order.is_completed && !order.is_cancelled) {
                // Кнопка "Выполнить" - в стиле Liquid Glass
                const completeBtn = document.createElement('button');
                completeBtn.className = 'reserve-btn';
                completeBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(76, 175, 80, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                completeBtn.textContent = '✅ Выполнить';
                completeBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(76, 175, 80, 0.3)';
                };
                completeBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(76, 175, 80, 0.2)';
                };
                completeBtn.onclick = async () => {
                    if (confirm('Выполнить этот заказ?')) {
                        try {
                            await completeOrderAPI(order.id);
                            showNotification('Заказ выполнен');
                            loadOrdersFn(dependencies); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                // Кнопка "Отменить" - в стиле Liquid Glass
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'reserve-btn';
                cancelBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(244, 67, 54, 0.2) 0%, rgba(244, 67, 54, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(244, 67, 54, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                cancelBtn.textContent = '❌ Отменить';
                cancelBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(244, 67, 54, 0.3)';
                };
                cancelBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(244, 67, 54, 0.2)';
                };
                cancelBtn.onclick = async () => {
                    if (confirm('Отменить этот заказ? Заказ будет удален из списка.')) {
                        try {
                            await cancelOrderAPI(order.id);
                            showNotification('Заказ отменен');
                            loadOrdersFn(dependencies); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                actionsDiv.appendChild(completeBtn);
                actionsDiv.appendChild(cancelBtn);
            }
            
            orderItem.appendChild(headerDiv);
            orderItem.appendChild(infoDiv);
            if (actionsDiv.children.length > 0) {
                orderItem.appendChild(actionsDiv);
            }
            
            ordersList.appendChild(orderItem);
        });
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        ordersList.innerHTML = `<p class="loading">Ошибка загрузки: ${error.message}</p>`;
    }
}
// ========== END REFACTORING STEP 4.1 ==========

