// ========== REFACTORING STEP 6.1, 6.2, 6.3: cartTabs.js ==========
// Модуль для управления вкладками корзины
// Дата начала: 2024-12-XX
// Статус: 🔄 В ПРОЦЕССЕ (STEP 6.1 завершен, STEP 6.2 завершен, STEP 6.3 завершен)

// Импорты зависимостей
// ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
import { fetchReservationsHistory, fetchUserReservations } from '../api.js';
import { getMyOrdersAPI, getOrdersHistoryAPI } from '../api/orders.js';
// ========== REFACTORING STEP 9.2: getMyPurchasesAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getMyPurchasesAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.2 ==========
// ========== SALE ORDERS: getMySaleOrdersAPI(), getSaleOrdersHistoryAPI() ==========
import { getMySaleOrdersAPI, getSaleOrdersHistoryAPI } from '../api/sale_orders.js';
// ========== END SALE ORDERS ==========
// ========== REFACTORING STEP 9.4: getPurchasesHistoryAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getPurchasesHistoryAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.4 ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { fetchReservationsHistory, fetchUserReservations, getMyOrdersAPI, getMyPurchasesAPI, getOrdersHistoryAPI, getPurchasesHistoryAPI } from '../api.js';
// ========== END REFACTORING STEP 8 ==========
import { loadCart, loadOrders, loadPurchases, loadSaleOrders } from './cartActive.js';
import { loadOrdersHistory, loadPurchasesHistory, loadReservationsHistory, loadSaleOrdersHistory } from './cartHistory.js';

/**
 * Вспомогательная функция для поиска элементов корзины
 * Ищет элемент сначала в странице корзины (если она видна), затем в модальном окне
 * @param {string} elementId - ID элемента для поиска
 * @returns {HTMLElement|null} - Найденный элемент или null
 */
function findCartElement(elementId) {
    // ВАЖНО: Сначала всегда проверяем страницу корзины (даже если она скрыта)
    // так как мы используем страницу, а не модальное окно
    const cartPage = document.getElementById('cart-page');
    if (cartPage) {
        const element = cartPage.querySelector(`#${elementId}`);
        if (element) {
            return element;
        }
    }
    
    // Если не найдено на странице, ищем в модальном окне (для обратной совместимости)
    const cartModal = document.getElementById('cart-modal');
    if (cartModal) {
        const element = cartModal.querySelector(`#${elementId}`);
        if (element) {
            return element;
        }
    }
    
    // Если не найдено нигде, используем стандартный getElementById (fallback)
    return document.getElementById(elementId);
}

/**
 * Переключение основных вкладок корзины
 * Управляет отображением секций: reservations, orders, purchases, sale-orders
 * @param {string} tabName - Имя вкладки для переключения ('reservations', 'orders', 'purchases', 'sale-orders')
 */
export function switchCartTab(tabName) {
    console.log(`🛒 switchCartTab: switching to tab "${tabName}"`);
    try {
        // ВАЖНО: Сначала всегда проверяем страницу корзины (даже если она скрыта)
        // так как мы используем страницу, а не модальное окно
        const cartPage = document.getElementById('cart-page');
        const cartModal = document.getElementById('cart-modal');
        const container = cartPage || cartModal || null;
        
        if (!container) {
            console.warn('⚠️ Cart page and modal not found');
            return;
        }
        
        const tabs = container.querySelectorAll('.cart-tab');
        const reservationsSection = container.querySelector('#reservations-section');
        const ordersSection = container.querySelector('#orders-section');
        const purchasesSection = container.querySelector('#purchases-section');
        const saleOrdersSection = container.querySelector('#sale-orders-section');
        
        if (!tabs || tabs.length === 0) {
            console.warn('⚠️ Cart tabs not found');
            return;
        }
        
        if (!reservationsSection || !ordersSection || !purchasesSection || !saleOrdersSection) {
            console.warn('⚠️ Cart sections not found');
            return;
        }
    
    // Проверяем, что вкладка видима перед переключением
    const targetTab = Array.from(tabs).find(tab => tab.dataset.tab === tabName);
    if (targetTab && (targetTab.style.display === 'none' || targetTab.classList.contains('hidden'))) {
        console.warn(`⚠️ Cannot switch to hidden tab: ${tabName}`);
        // НЕ переключаемся автоматически - это может вызвать рекурсию и блокировку
        // Просто возвращаемся без переключения
        return;
    }
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Скрываем все секции
    reservationsSection.style.display = 'none';
    ordersSection.style.display = 'none';
    purchasesSection.style.display = 'none';
    saleOrdersSection.style.display = 'none';
    
    // Показываем нужную секцию и активируем первую подвкладку
    // КРИТИЧНО: switchCartSubtab делает API вызовы, поэтому вызываем его асинхронно
    // чтобы не блокировать выполнение
    if (tabName === 'reservations') {
        reservationsSection.style.display = 'block';
        // Вызываем асинхронно, чтобы не блокировать
        setTimeout(() => {
            try {
                switchCartSubtab('reservations-active');
            } catch (err) {
                console.error('❌ Error in switchCartSubtab for reservations:', err);
            }
        }, 0);
    } else if (tabName === 'orders') {
        ordersSection.style.display = 'block';
        setTimeout(() => {
            try {
                switchCartSubtab('orders-active');
            } catch (err) {
                console.error('❌ Error in switchCartSubtab for orders:', err);
            }
        }, 0);
    } else if (tabName === 'purchases') {
        purchasesSection.style.display = 'block';
        setTimeout(() => {
            try {
                switchCartSubtab('purchases-active');
            } catch (err) {
                console.error('❌ Error in switchCartSubtab for purchases:', err);
            }
        }, 0);
    } else if (tabName === 'sale-orders') {
        saleOrdersSection.style.display = 'block';
        setTimeout(() => {
            try {
                switchCartSubtab('sale-orders-active');
            } catch (err) {
                console.error('❌ Error in switchCartSubtab for sale-orders:', err);
            }
        }, 0);
    }
    } catch (error) {
        console.error('❌ Error in switchCartTab:', error);
        // Не бросаем ошибку дальше, чтобы не ломать приложение
    }
}
// ========== END REFACTORING STEP 6.1 ==========

// ========== REFACTORING STEP 6.2: switchCartSubtab() ==========
/**
 * Переключение подвкладок корзины
 * Управляет отображением активных элементов и истории для каждой секции
 * @param {string} subtabName - Имя подвкладки для переключения ('reservations-active', 'reservations-history', 'orders-active', 'orders-history', 'purchases-active', 'purchases-history', 'sale-orders-active', 'sale-orders-history')
 */
export function switchCartSubtab(subtabName) {
    console.log(`🛒 switchCartSubtab: switching to subtab "${subtabName}"`);
    try {
        // Определяем основную вкладку по имени подвкладки
        let mainTab = '';
        let activeContainer = null;
        let historyContainer = null;
        
        if (subtabName.startsWith('reservations-')) {
            mainTab = 'reservations';
            activeContainer = findCartElement('cart-items');
            historyContainer = findCartElement('reservations-history-items');
        } else if (subtabName.startsWith('orders-')) {
            mainTab = 'orders';
            activeContainer = findCartElement('orders-items');
            historyContainer = findCartElement('orders-history-items');
        } else if (subtabName.startsWith('purchases-')) {
            mainTab = 'purchases';
            activeContainer = findCartElement('purchases-items');
            historyContainer = findCartElement('purchases-history-items');
        } else if (subtabName.startsWith('sale-orders-')) {
            mainTab = 'sale-orders';
            activeContainer = findCartElement('sale-orders-items');
            historyContainer = findCartElement('sale-orders-history-items');
        }
        
        if (!activeContainer || !historyContainer) {
            console.warn('⚠️ Cart subtab containers not found');
            return;
        }
    
    // Обновляем активные подвкладки в текущей секции
    const currentSection = document.getElementById(`${mainTab}-section`);
    if (currentSection) {
        const subtabs = currentSection.querySelectorAll('.cart-subtab');
        subtabs.forEach(subtab => {
            if (subtab.dataset.subtab === subtabName) {
                subtab.classList.add('active');
            } else {
                subtab.classList.remove('active');
            }
        });
    }
    
    // Показываем нужный контейнер
    if (subtabName.endsWith('-active')) {
        activeContainer.style.display = 'block';
        historyContainer.style.display = 'none';
        
        // Загружаем данные
        if (mainTab === 'reservations') {
            console.log('🛒 Loading active reservations...');
            try {
                loadCart().catch(err => {
                    console.error('❌ Error in loadCart:', err);
                });
            } catch (err) {
                console.error('❌ Error calling loadCart:', err);
            }
        } else if (mainTab === 'orders') {
            console.log('🛒 Loading active orders...');
            loadOrders().catch(err => {
                console.warn('⚠️ Error loading orders:', err);
            });
        } else if (mainTab === 'purchases') {
            console.log('🛒 Loading active sales...');
            loadPurchases().catch(err => {
                console.warn('⚠️ Error loading purchases:', err);
            });
        } else if (mainTab === 'sale-orders') {
            console.log('📦 [SALE ORDER] Loading active sale orders...');
            loadSaleOrders().catch(err => {
                console.warn('⚠️ [SALE ORDER] Error loading sale orders:', err);
            });
        }
    } else if (subtabName.endsWith('-history')) {
        activeContainer.style.display = 'none';
        historyContainer.style.display = 'block';
        
        // Загружаем историю (не блокируем выполнение при ошибках)
        if (mainTab === 'reservations') {
            console.log('🛒 Loading reservations history...');
            loadReservationsHistory().catch(err => {
                console.warn('⚠️ Error loading reservations history:', err);
            });
        } else if (mainTab === 'orders') {
            console.log('🛒 Loading orders history...');
            loadOrdersHistory().catch(err => {
                console.warn('⚠️ Error loading orders history:', err);
            });
        } else if (mainTab === 'purchases') {
            console.log('🛒 Loading sales history...');
            loadPurchasesHistory().catch(err => {
                console.warn('⚠️ Error loading purchases history:', err);
            });
        } else if (mainTab === 'sale-orders') {
            console.log('📦 [SALE ORDER] Loading sale orders history...');
            loadSaleOrdersHistory().catch(err => {
                console.warn('⚠️ [SALE ORDER] Error loading sale orders history:', err);
            });
        }
    }
    } catch (error) {
        console.error('❌ Error in switchCartSubtab:', error);
        // Не бросаем ошибку дальше, чтобы не ломать приложение
    }
}
// ========== END REFACTORING STEP 6.2 ==========

// ========== REFACTORING STEP 6.3: updateCartTabsVisibility() ==========
/**
 * Проверка наличия данных и обновление видимости вкладок корзины
 * Проверяет наличие активных элементов и истории для каждой секции (reservations, orders, purchases)
 * и обновляет видимость соответствующих вкладок
 * @returns {Promise<{hasReservations: boolean, hasOrders: boolean, hasPurchases: boolean}>} Объект с информацией о наличии данных
 */
// Вспомогательная функция для добавления таймаута к промису
function withTimeout(promise, timeoutMs = 5000, errorMessage = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
}

export async function updateCartTabsVisibility() {
    console.log('🛒 updateCartTabsVisibility: Checking data availability...');
    
    try {
        // Проверяем резервации (активные + история) с таймаутом
        let hasReservations = false;
        try {
            const activeReservations = await withTimeout(
                fetchUserReservations(), 
                3000, 
                'Timeout fetching reservations'
            );
            const activeCount = (activeReservations || []).filter(r => r.is_active === true).length;
            
            let historyCount = 0;
            try {
                const historyReservations = await withTimeout(
                    fetchReservationsHistory(), 
                    3000, 
                    'Timeout fetching reservations history'
                );
                historyCount = (historyReservations || []).filter(r => r.is_active === false).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch reservations history for visibility check:', e.message);
            }
            
            hasReservations = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Reservations: ${activeCount} active, ${historyCount} history, hasData: ${hasReservations}`);
        } catch (e) {
            console.warn('⚠️ Failed to check reservations:', e.message);
        }
        
        // Проверяем заказы (активные + история) с таймаутом
        let hasOrders = false;
        try {
            const activeOrders = await withTimeout(
                getMyOrdersAPI(), 
                3000, 
                'Timeout fetching orders'
            );
            const activeCount = (activeOrders || []).filter(o => !o.is_completed && !o.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historyOrders = await withTimeout(
                    getOrdersHistoryAPI(), 
                    3000, 
                    'Timeout fetching orders history'
                );
                historyCount = (historyOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch orders history for visibility check:', e.message);
            }
            
            hasOrders = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Orders: ${activeCount} active, ${historyCount} history, hasData: ${hasOrders}`);
        } catch (e) {
            console.warn('⚠️ Failed to check orders:', e.message);
        }
        
        // Проверяем продажи (активные + история) с таймаутом
        let hasPurchases = false;
        try {
            const allPurchases = await withTimeout(
                getMyPurchasesAPI(), 
                3000, 
                'Timeout fetching purchases'
            );
            const activeCount = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historyPurchases = await withTimeout(
                    getPurchasesHistoryAPI(), 
                    3000, 
                    'Timeout fetching purchases history'
                );
                historyCount = (historyPurchases || []).filter(p => p.is_completed === true || p.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch purchases history for visibility check:', e.message);
            }
            
            hasPurchases = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Purchases: ${activeCount} active, ${historyCount} history, hasData: ${hasPurchases}`);
        } catch (e) {
            console.warn('⚠️ Failed to check purchases:', e.message);
        }
        
        // Обновляем видимость вкладок
        // ВАЖНО: Сначала всегда проверяем страницу корзины (даже если она скрыта)
        const cartPage = document.getElementById('cart-page');
        const cartModal = document.getElementById('cart-modal');
        const container = cartPage || cartModal;
        const tabs = container ? container.querySelectorAll('.cart-tab') : document.querySelectorAll('.cart-tab');
        const reservationsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'reservations');
        const ordersTab = Array.from(tabs).find(tab => tab.dataset.tab === 'orders');
        const purchasesTab = Array.from(tabs).find(tab => tab.dataset.tab === 'purchases');
        const saleOrdersTab = Array.from(tabs).find(tab => tab.dataset.tab === 'sale-orders');
        
        if (reservationsTab) {
            if (hasReservations) {
                reservationsTab.style.display = '';
                reservationsTab.classList.remove('hidden');
            } else {
                reservationsTab.style.display = 'none';
                reservationsTab.classList.add('hidden');
            }
        }
        
        if (ordersTab) {
            if (hasOrders) {
                ordersTab.style.display = '';
                ordersTab.classList.remove('hidden');
            } else {
                ordersTab.style.display = 'none';
                ordersTab.classList.add('hidden');
            }
        }
        
        if (purchasesTab) {
            if (hasPurchases) {
                purchasesTab.style.display = '';
                purchasesTab.classList.remove('hidden');
            } else {
                purchasesTab.style.display = 'none';
                purchasesTab.classList.add('hidden');
            }
        }
        
        // Проверяем заказы на покупку (активные + история) с таймаутом
        let hasSaleOrders = false;
        try {
            const allSaleOrders = await withTimeout(
                getMySaleOrdersAPI(), 
                3000, 
                'Timeout fetching sale orders'
            );
            const activeCount = (allSaleOrders || []).filter(o => !o.is_completed && !o.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historySaleOrders = await withTimeout(
                    getSaleOrdersHistoryAPI(), 
                    3000, 
                    'Timeout fetching sale orders history'
                );
                historyCount = (historySaleOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch sale orders history for visibility check:', e.message);
            }
            
            hasSaleOrders = activeCount > 0 || historyCount > 0;
            console.log(`📦 [SALE ORDER] Sale Orders: ${activeCount} active, ${historyCount} history, hasData: ${hasSaleOrders}`);
        } catch (e) {
            console.warn('⚠️ Failed to check sale orders:', e.message);
        }
        
        if (saleOrdersTab) {
            if (hasSaleOrders) {
                saleOrdersTab.style.display = '';
                saleOrdersTab.classList.remove('hidden');
            } else {
                saleOrdersTab.style.display = 'none';
                saleOrdersTab.classList.add('hidden');
            }
        }
        
        // КРИТИЧНО: НЕ вызываем switchCartTab здесь при обновлении видимости!
        // switchCartTab вызывает switchCartSubtab, который делает API вызовы и может блокировать загрузку.
        // Переключение вкладки должно происходить только при явном действии пользователя или при открытии корзины.
        // Если текущая активная вкладка скрыта, просто убираем класс active, но НЕ переключаемся автоматически
        const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
        if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
            // Просто убираем класс active, но НЕ вызываем switchCartTab (это сделает пользователь или при открытии корзины)
            activeTab.classList.remove('active');
            console.log(`🛒 Active tab is hidden, removed active class (will be set when cart is opened)`);
        }
        
        console.log(`🛒 Tabs visibility updated: Reservations=${hasReservations}, Orders=${hasOrders}, Purchases=${hasPurchases}, SaleOrders=${hasSaleOrders}`);
        
        return { hasReservations, hasOrders, hasPurchases, hasSaleOrders };
    } catch (error) {
        console.error('❌ Error updating cart tabs visibility:', error);
        return { hasReservations: true, hasOrders: true, hasPurchases: true }; // По умолчанию показываем все
    }
}
// ========== END REFACTORING STEP 6.3 ==========

