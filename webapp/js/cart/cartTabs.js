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
// ========== REFACTORING STEP 9.4: getPurchasesHistoryAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { getPurchasesHistoryAPI } from '../api/purchases.js';
// ========== END REFACTORING STEP 9.4 ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { fetchReservationsHistory, fetchUserReservations, getMyOrdersAPI, getMyPurchasesAPI, getOrdersHistoryAPI, getPurchasesHistoryAPI } from '../api.js';
// ========== END REFACTORING STEP 8 ==========
import { loadCart, loadOrders, loadPurchases } from './cartActive.js';
import { loadOrdersHistory, loadPurchasesHistory, loadReservationsHistory } from './cartHistory.js';

/**
 * Переключение основных вкладок корзины
 * Управляет отображением секций: reservations, orders, purchases
 * @param {string} tabName - Имя вкладки для переключения ('reservations', 'orders', 'purchases')
 */
export function switchCartTab(tabName) {
    console.log(`🛒 switchCartTab: switching to tab "${tabName}"`);
    const tabs = document.querySelectorAll('.cart-tab');
    const reservationsSection = document.getElementById('reservations-section');
    const ordersSection = document.getElementById('orders-section');
    const purchasesSection = document.getElementById('purchases-section');
    
    if (!tabs || tabs.length === 0) {
        console.warn('⚠️ Cart tabs not found');
        return;
    }
    
    if (!reservationsSection || !ordersSection || !purchasesSection) {
        console.warn('⚠️ Cart sections not found');
        return;
    }
    
    // Проверяем, что вкладка видима перед переключением
    const targetTab = Array.from(tabs).find(tab => tab.dataset.tab === tabName);
    if (targetTab && (targetTab.style.display === 'none' || targetTab.classList.contains('hidden'))) {
        console.warn(`⚠️ Cannot switch to hidden tab: ${tabName}`);
        // Переключаемся на первую видимую вкладку
        const firstVisibleTab = Array.from(tabs).find(tab => 
            tab.style.display !== 'none' && !tab.classList.contains('hidden')
        );
        if (firstVisibleTab) {
            console.log(`🛒 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
            switchCartTab(firstVisibleTab.dataset.tab);
        }
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
    
    // Показываем нужную секцию и активируем первую подвкладку
    if (tabName === 'reservations') {
        reservationsSection.style.display = 'block';
        switchCartSubtab('reservations-active');
    } else if (tabName === 'orders') {
        ordersSection.style.display = 'block';
        switchCartSubtab('orders-active');
    } else if (tabName === 'purchases') {
        purchasesSection.style.display = 'block';
        switchCartSubtab('purchases-active');
    }
}
// ========== END REFACTORING STEP 6.1 ==========

// ========== REFACTORING STEP 6.2: switchCartSubtab() ==========
/**
 * Переключение подвкладок корзины
 * Управляет отображением активных элементов и истории для каждой секции
 * @param {string} subtabName - Имя подвкладки для переключения ('reservations-active', 'reservations-history', 'orders-active', 'orders-history', 'purchases-active', 'purchases-history')
 */
export function switchCartSubtab(subtabName) {
    console.log(`🛒 switchCartSubtab: switching to subtab "${subtabName}"`);
    
    // Определяем основную вкладку по имени подвкладки
    let mainTab = '';
    let activeContainer = null;
    let historyContainer = null;
    
    if (subtabName.startsWith('reservations-')) {
        mainTab = 'reservations';
        activeContainer = document.getElementById('cart-items');
        historyContainer = document.getElementById('reservations-history-items');
    } else if (subtabName.startsWith('orders-')) {
        mainTab = 'orders';
        activeContainer = document.getElementById('orders-items');
        historyContainer = document.getElementById('orders-history-items');
    } else if (subtabName.startsWith('purchases-')) {
        mainTab = 'purchases';
        activeContainer = document.getElementById('purchases-items');
        historyContainer = document.getElementById('purchases-history-items');
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
            loadOrders();
        } else if (mainTab === 'purchases') {
            console.log('🛒 Loading active sales...');
            loadPurchases();
        }
    } else if (subtabName.endsWith('-history')) {
        activeContainer.style.display = 'none';
        historyContainer.style.display = 'block';
        
        // Загружаем историю
        if (mainTab === 'reservations') {
            console.log('🛒 Loading reservations history...');
            loadReservationsHistory();
        } else if (mainTab === 'orders') {
            console.log('🛒 Loading orders history...');
            loadOrdersHistory();
        } else if (mainTab === 'purchases') {
            console.log('🛒 Loading sales history...');
            loadPurchasesHistory();
        }
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
export async function updateCartTabsVisibility() {
    console.log('🛒 updateCartTabsVisibility: Checking data availability...');
    
    try {
        // Проверяем резервации (активные + история)
        let hasReservations = false;
        try {
            const activeReservations = await fetchUserReservations();
            const activeCount = (activeReservations || []).filter(r => r.is_active === true).length;
            
            let historyCount = 0;
            try {
                const historyReservations = await fetchReservationsHistory();
                historyCount = (historyReservations || []).filter(r => r.is_active === false).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch reservations history for visibility check:', e);
            }
            
            hasReservations = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Reservations: ${activeCount} active, ${historyCount} history, hasData: ${hasReservations}`);
        } catch (e) {
            console.warn('⚠️ Failed to check reservations:', e);
        }
        
        // Проверяем заказы (активные + история)
        let hasOrders = false;
        try {
            const activeOrders = await getMyOrdersAPI();
            const activeCount = (activeOrders || []).filter(o => !o.is_completed && !o.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historyOrders = await getOrdersHistoryAPI();
                historyCount = (historyOrders || []).filter(o => o.is_completed === true || o.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch orders history for visibility check:', e);
            }
            
            hasOrders = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Orders: ${activeCount} active, ${historyCount} history, hasData: ${hasOrders}`);
        } catch (e) {
            console.warn('⚠️ Failed to check orders:', e);
        }
        
        // Проверяем продажи (активные + история)
        let hasPurchases = false;
        try {
            const allPurchases = await getMyPurchasesAPI();
            const activeCount = (allPurchases || []).filter(p => !p.is_completed && !p.is_cancelled).length;
            
            let historyCount = 0;
            try {
                const historyPurchases = await getPurchasesHistoryAPI();
                historyCount = (historyPurchases || []).filter(p => p.is_completed === true || p.is_cancelled === true).length;
            } catch (e) {
                console.warn('⚠️ Failed to fetch purchases history for visibility check:', e);
            }
            
            hasPurchases = activeCount > 0 || historyCount > 0;
            console.log(`🛒 Purchases: ${activeCount} active, ${historyCount} history, hasData: ${hasPurchases}`);
        } catch (e) {
            console.warn('⚠️ Failed to check purchases:', e);
        }
        
        // Обновляем видимость вкладок
        const tabs = document.querySelectorAll('.cart-tab');
        const reservationsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'reservations');
        const ordersTab = Array.from(tabs).find(tab => tab.dataset.tab === 'orders');
        const purchasesTab = Array.from(tabs).find(tab => tab.dataset.tab === 'purchases');
        
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
        
        // Если текущая активная вкладка скрыта, переключаемся на первую доступную
        const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
        if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
            const firstVisibleTab = Array.from(tabs).find(tab => 
                tab.style.display !== 'none' && !tab.classList.contains('hidden')
            );
            if (firstVisibleTab) {
                console.log(`🛒 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
                switchCartTab(firstVisibleTab.dataset.tab);
            }
        }
        
        console.log(`🛒 Tabs visibility updated: Reservations=${hasReservations}, Orders=${hasOrders}, Purchases=${hasPurchases}`);
        
        return { hasReservations, hasOrders, hasPurchases };
    } catch (error) {
        console.error('❌ Error updating cart tabs visibility:', error);
        return { hasReservations: true, hasOrders: true, hasPurchases: true }; // По умолчанию показываем все
    }
}
// ========== END REFACTORING STEP 6.3 ==========

