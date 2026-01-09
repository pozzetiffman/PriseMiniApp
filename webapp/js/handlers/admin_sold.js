// ========== REFACTORING STEP 6.1: loadSoldProducts ==========
// Модуль обработчиков проданных товаров админки
// Дата начала: 2024-12-19
// Статус: В процессе

import { deleteSoldProductAPI, deleteSoldProductsAPI, getSoldProductsAPI } from '../api.js';

/**
 * Загрузка и отображение проданных товаров
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadSoldProducts - Функция для рекурсивного вызова (сама себя)
 */
export async function loadSoldProducts(dependencies = {}) {
    const { loadSoldProducts: loadSoldProductsRecursive } = dependencies;
    
    // Используем переданную функцию или саму себя для рекурсивных вызовов
    const loadSoldProductsFn = loadSoldProductsRecursive || loadSoldProducts;
    
    const soldProductsList = document.getElementById('sold-products-list');
    if (!soldProductsList) return;
    
    soldProductsList.innerHTML = '<p class="loading">Загрузка истории продаж...</p>';
    
    try {
        // Получаем shop_owner_id из глобального appContext
        let shopOwnerId = null;
        
        // Пытаемся получить из глобальной переменной appContext (экспортируется из app.js)
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
            }
        }
        
        // Если не получилось, пытаемся получить из URL
        if (!shopOwnerId) {
            const urlParams = new URLSearchParams(window.location.search);
            const shopOwnerIdParam = urlParams.get('user_id');
            if (shopOwnerIdParam) {
                shopOwnerId = parseInt(shopOwnerIdParam, 10);
            }
        }
        
        if (!shopOwnerId) {
            soldProductsList.innerHTML = '<p class="loading">Ошибка: не удалось определить владельца магазина</p>';
            return;
        }
        
        const soldProducts = await getSoldProductsAPI(shopOwnerId);
        
        if (!soldProducts || soldProducts.length === 0) {
            soldProductsList.innerHTML = '<p class="loading">История продаж пуста</p>';
            return;
        }
        
        // Рендерим список проданных товаров
        soldProductsList.innerHTML = '';
        
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
        selectAllCheckbox.id = 'select-all-sold';
        selectAllCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        
        const selectAllLabel = document.createElement('label');
        selectAllLabel.htmlFor = 'select-all-sold';
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
        soldProductsList.appendChild(controlsDiv);
        
        // Обработчик "Выбрать все"
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.sold-item-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateDeleteButtonVisibility();
        });
        
        // Обработчик удаления выбранных
        deleteSelectedBtn.addEventListener('click', async () => {
            const selectedCheckboxes = document.querySelectorAll('.sold-item-checkbox:checked');
            if (selectedCheckboxes.length === 0) {
                alert('❌ Выберите записи для удаления');
                return;
            }
            
            const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.soldId));
            const count = selectedIds.length;
            
            if (!confirm(`Удалить ${count} ${count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'}? Это действие нельзя отменить.`)) {
                return;
            }
            
            try {
                await deleteSoldProductsAPI(selectedIds, shopOwnerId);
                alert(`✅ Удалено ${count} ${count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'}`);
                await loadSoldProductsFn(); // Перезагружаем список
            } catch (error) {
                console.error('Error deleting sold products:', error);
                alert(`❌ Ошибка при удалении: ${error.message}`);
            }
        });
        
        // Функция обновления видимости кнопки удаления
        function updateDeleteButtonVisibility() {
            const selectedCheckboxes = document.querySelectorAll('.sold-item-checkbox:checked');
            if (selectedCheckboxes.length > 0) {
                deleteSelectedBtn.style.display = 'block';
            } else {
                deleteSelectedBtn.style.display = 'none';
            }
        }
        
        soldProducts.forEach(sold => {
            const soldItem = document.createElement('div');
            soldItem.className = 'sold-product-item';
            soldItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 6px;
                position: relative;
            `;
            
            // Чекбокс и название в одной строке
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
            
            const leftDiv = document.createElement('div');
            leftDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;';
            
            // Чекбокс для выбора
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'sold-item-checkbox';
            checkbox.dataset.soldId = sold.id;
            checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
            checkbox.addEventListener('change', () => {
                updateDeleteButtonVisibility();
                // Обновляем состояние "Выбрать все"
                const allCheckboxes = document.querySelectorAll('.sold-item-checkbox');
                const checkedCount = document.querySelectorAll('.sold-item-checkbox:checked').length;
                selectAllCheckbox.checked = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;
            });
            
            // Название
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--tg-theme-text-color); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            nameDiv.textContent = sold.name;
            
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
            deleteBtn.title = 'Удалить запись';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Удалить запись о продаже "${sold.name}"? Это действие нельзя отменить.`)) {
                    return;
                }
                
                try {
                    await deleteSoldProductAPI(sold.id, shopOwnerId);
                    alert('✅ Запись удалена');
                    await loadSoldProductsFn(); // Перезагружаем список
                } catch (error) {
                    console.error('Error deleting sold product:', error);
                    alert(`❌ Ошибка при удалении: ${error.message}`);
                }
            });
            
            soldItem.appendChild(deleteBtn);
            
            // Информация о продаже
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 6px; min-width: 0;';
            
            // Количество и цены
            const quantity = sold.quantity || 1;
            const unitPrice = sold.discount > 0 ? Math.round(sold.price * (1 - sold.discount / 100)) : sold.price;
            const totalPrice = unitPrice * quantity;
            
            // Количество
            const quantityDiv = document.createElement('div');
            quantityDiv.style.cssText = 'font-size: 14px; color: var(--tg-theme-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            quantityDiv.textContent = `Количество: ${quantity} шт.`;
            
            // Цена за 1 шт
            const unitPriceDiv = document.createElement('div');
            unitPriceDiv.style.cssText = 'font-size: 14px; color: var(--tg-theme-hint-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            if (sold.discount > 0) {
                unitPriceDiv.innerHTML = `Цена за 1 шт: <span style="text-decoration: line-through; margin-right: 6px;">${sold.price} ₽</span> <span style="color: var(--tg-theme-link-color); font-weight: 600;">${unitPrice} ₽</span>`;
            } else {
                unitPriceDiv.innerHTML = `Цена за 1 шт: <span style="color: var(--tg-theme-link-color); font-weight: 600;">${unitPrice} ₽</span>`;
            }
            
            // Общая цена
            const totalPriceDiv = document.createElement('div');
            totalPriceDiv.style.cssText = 'font-size: 18px; font-weight: 700; color: var(--tg-theme-link-color); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            if (sold.discount > 0) {
                const oldTotalPrice = sold.price * quantity;
                totalPriceDiv.innerHTML = `Общая цена: <span style="text-decoration: line-through; margin-right: 6px; font-size: 14px; color: var(--tg-theme-hint-color);">${oldTotalPrice} ₽</span> <span>${totalPrice} ₽</span>`;
            } else {
                totalPriceDiv.textContent = `Общая цена: ${totalPrice} ₽`;
            }
            
            // Дата продажи
            const dateDiv = document.createElement('div');
            dateDiv.style.cssText = 'font-size: 13px; color: var(--tg-theme-hint-color); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            if (sold.sold_at) {
                const soldDate = new Date(sold.sold_at);
                dateDiv.textContent = soldDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }) + ' ' + soldDate.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            
            infoDiv.appendChild(quantityDiv);
            infoDiv.appendChild(unitPriceDiv);
            infoDiv.appendChild(totalPriceDiv);
            infoDiv.appendChild(dateDiv);
            
            soldItem.appendChild(headerDiv);
            soldItem.appendChild(infoDiv);
            
            soldProductsList.appendChild(soldItem);
        });
    } catch (error) {
        console.error('❌ Error loading sold products:', error);
        let errorMessage = 'Ошибка загрузки проданных товаров';
        if (error.message) {
            // Если ошибка содержит детали, показываем их
            if (error.message.includes('detail')) {
                try {
                    const errorObj = JSON.parse(error.message);
                    errorMessage = errorObj.detail || errorMessage;
                } catch (e) {
                    errorMessage = error.message;
                }
            } else {
                errorMessage = error.message;
            }
        }
        soldProductsList.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}
// ========== END REFACTORING STEP 6.1 ==========


