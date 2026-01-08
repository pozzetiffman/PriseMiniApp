// ========== REFACTORING STEP 3.1: handleQuantityEnabledToggle ==========
// Модуль обработчиков настроек магазина
// Дата начала: 2024-12-19
// Статус: В процессе

import { bulkUpdateAllProductsMadeToOrderAPI, fetchProducts, updateShopSettings } from '../api.js';
import { showNotification } from '../utils/admin_utils.js';

/**
 * Обработка изменения переключателя количества товаров
 * @param {boolean} enabled - Включен ли показ количества товаров
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.getShopSettings - Геттер для получения shopSettings
 * @param {Function} dependencies.setShopSettings - Сеттер для обновления shopSettings
 * @param {Function} dependencies.getReservationsToggle - Геттер для получения reservationsToggle
 * @param {Function} dependencies.getQuantityEnabledToggle - Геттер для получения quantityEnabledToggle
 */
export async function handleQuantityEnabledToggle(enabled, dependencies = {}) {
    const {
        getShopSettings,
        setShopSettings,
        getReservationsToggle,
        getQuantityEnabledToggle
    } = dependencies;
    
    console.log(`🔧 Toggling quantity enabled: ${enabled}`);
    
    try {
        // Обновляем только quantity_enabled (резервация может работать независимо)
        const updateData = {
            quantity_enabled: enabled
        };
        
        const shopSettings = await updateShopSettings(updateData);
        console.log('✅ Shop settings updated:', shopSettings);
        
        // Обновляем shopSettings через сеттер
        if (setShopSettings) {
            setShopSettings(shopSettings);
        }
        
        // Обновляем состояние тумблера резервации (не блокируем его, если quantity_enabled выключен)
        // Резервация может работать и без показа количества
        const reservationsToggle = getReservationsToggle ? getReservationsToggle() : null;
        if (reservationsToggle) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
            // Не блокируем тумблер резервации, даже если quantity_enabled выключен
            // reservationsToggle.disabled = !enabled;
        }
        
        // Показываем уведомление об успешном обновлении
        const statusText = enabled ? 'включен' : 'отключен';
        showNotification(`Показ количества товаров ${statusText}`);
        
        // Обновляем заголовок с названием магазина (если оно изменилось)
        if (typeof window.updateShopNameInHeader === 'function') {
            await window.updateShopNameInHeader();
        }
        
        // Перезагружаем данные для обновления UI
        if (typeof window.loadData === 'function') {
            setTimeout(() => {
                window.loadData();
            }, 300);
        }
    } catch (error) {
        console.error('❌ Error updating shop settings:', error);
        
        // Возвращаем переключатель в исходное состояние
        const quantityEnabledToggle = getQuantityEnabledToggle ? getQuantityEnabledToggle() : null;
        if (quantityEnabledToggle) {
            quantityEnabledToggle.checked = !enabled;
        }
        
        alert('Не удалось обновить настройки: ' + error.message);
    }
}
// ========== END REFACTORING STEP 3.1 ==========

// ========== REFACTORING STEP 3.2: handleReservationsToggle ==========
/**
 * Обработка изменения переключателя резервации
 * @param {boolean} enabled - Включена ли резервация товаров
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.getShopSettings - Геттер для получения shopSettings
 * @param {Function} dependencies.setShopSettings - Сеттер для обновления shopSettings
 * @param {Function} dependencies.getReservationsToggle - Геттер для получения reservationsToggle
 */
export async function handleReservationsToggle(enabled, dependencies = {}) {
    const {
        getShopSettings,
        setShopSettings,
        getReservationsToggle
    } = dependencies;
    
    console.log(`🔧 Toggling reservations: ${enabled}`);
    
    // Резервация может работать независимо от quantity_enabled
    // Если quantity_enabled = false, резервация работает, но без выбора количества
    
    try {
        const shopSettings = await updateShopSettings({
            reservations_enabled: enabled
        });
        console.log('✅ Shop settings updated:', shopSettings);
        
        // Обновляем shopSettings через сеттер
        if (setShopSettings) {
            setShopSettings(shopSettings);
        }
        
        // Показываем уведомление об успешном обновлении
        const statusText = enabled ? 'включена' : 'отключена';
        showNotification(`Резервация товаров ${statusText}`);
        
        // Обновляем заголовок с названием магазина (если оно изменилось)
        if (typeof window.updateShopNameInHeader === 'function') {
            await window.updateShopNameInHeader();
        }
        
        // Обновляем UI товаров (скрываем/показываем кнопки резервации)
        updateProductsUI(enabled);
    } catch (error) {
        console.error('❌ Error updating shop settings:', error);
        
        // Возвращаем переключатель в исходное состояние
        const reservationsToggle = getReservationsToggle ? getReservationsToggle() : null;
        if (reservationsToggle) {
            reservationsToggle.checked = !enabled;
        }
        
        alert('Не удалось обновить настройки: ' + error.message);
    }
}
// ========== END REFACTORING STEP 3.2 ==========

// ========== REFACTORING STEP 3.3: checkAllProductsMadeToOrder ==========
/**
 * Проверка состояния товаров (все ли под заказ)
 * @returns {Promise<boolean>} true если все активные товары под заказ, иначе false
 */
export async function checkAllProductsMadeToOrder() {
    try {
        // Получаем контекст для определения shop_owner_id и bot_id
        let shopOwnerId = null;
        let botId = null;
        
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
                botId = context.bot_id || null;
            }
        }
        
        if (!shopOwnerId) {
            console.warn('⚠️ Cannot check products state: shop_owner_id not found');
            return false;
        }
        
        // Загружаем товары
        const products = await fetchProducts(shopOwnerId, null, botId);
        
        if (!products || products.length === 0) {
            return false;
        }
        
        // Проверяем, все ли активные товары под заказ
        const activeProducts = products.filter(p => !p.is_sold);
        if (activeProducts.length === 0) {
            return false;
        }
        
        const allMadeToOrder = activeProducts.every(p => p.is_made_to_order === true);
        console.log(`📊 Products state check: ${activeProducts.length} active products, all made-to-order: ${allMadeToOrder}`);
        
        return allMadeToOrder;
    } catch (error) {
        console.error('❌ Error checking products state:', error);
        return false;
    }
}
// ========== END REFACTORING STEP 3.3 ==========

// ========== REFACTORING STEP 3.4: handleAllProductsMadeToOrderToggle ==========
/**
 * Обработка изменения переключателя "Все товары под заказ"
 * @param {boolean} enabled - Установить ли все товары как "под заказ"
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.getAllProductsMadeToOrderToggle - Геттер для получения allProductsMadeToOrderToggle
 */
export async function handleAllProductsMadeToOrderToggle(enabled, dependencies = {}) {
    const {
        getAllProductsMadeToOrderToggle
    } = dependencies;
    
    console.log(`🔧 Toggling all products made-to-order: ${enabled}`);
    
    try {
        const result = await bulkUpdateAllProductsMadeToOrderAPI(enabled);
        console.log('✅ All products made-to-order updated:', result);
        
        // Показываем уведомление об успешном обновлении
        const statusText = enabled ? 'установлены как "под заказ"' : 'сняты со статуса "под заказ"';
        showNotification(`✅ ${result.updated_count} товаров ${statusText}`);
        
        // Тумблер остается в том состоянии, в которое его переключили
        // Не выключаем его автоматически
        
        // Перезагружаем данные для обновления UI
        if (typeof window.loadData === 'function') {
            setTimeout(() => {
                window.loadData();
            }, 300);
        }
    } catch (error) {
        console.error('❌ Error updating all products made-to-order:', error);
        
        // Возвращаем переключатель в исходное состояние при ошибке
        const allProductsMadeToOrderToggle = getAllProductsMadeToOrderToggle ? getAllProductsMadeToOrderToggle() : null;
        if (allProductsMadeToOrderToggle) {
            allProductsMadeToOrderToggle.checked = !enabled;
        }
        
        alert('Не удалось обновить товары: ' + error.message);
    }
}
// ========== END REFACTORING STEP 3.4 ==========

// ========== REFACTORING STEP 3.5: updateProductsUI ==========
/**
 * Обновление UI товаров в зависимости от настройки резервации
 * @param {boolean} reservationsEnabled - Включена ли резервация товаров
 */
export function updateProductsUI(reservationsEnabled) {
    // Обновляем кнопки резервации в модальном окне товара
    const reserveButtons = document.querySelectorAll('.reserve-btn:not(.cancel-reservation-btn)');
    reserveButtons.forEach(btn => {
        if (reservationsEnabled) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    });
    
    // Перезагружаем данные для обновления UI
    if (typeof window.loadData === 'function') {
        setTimeout(() => {
            window.loadData();
        }, 300);
    }
}
// ========== END REFACTORING STEP 3.5 ==========

