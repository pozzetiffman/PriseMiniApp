// Модуль корзины
// ========== REFACTORING STEP 1.1: priceUtils.js ==========
// ========== REFACTORING STEP 2.1, 2.2: imageUtils.js ==========
// ========== REFACTORING STEP 3.1, 3.2: dateUtils.js ==========
// ========== REFACTORING STEP 4.1, 4.2, 4.3: cartHistory.js ==========
// НОВЫЙ КОД (используется сейчас)
import { loadOrdersHistory, loadPurchasesHistory, loadReservationsHistory } from './cart/cartHistory.js';
export { loadOrdersHistory, loadPurchasesHistory, loadReservationsHistory };
// ========== END REFACTORING STEP 4.1, 4.2, 4.3 ==========
// ========== REFACTORING STEP 5.1, 5.2, 5.3: cartActive.js ==========
// НОВЫЙ КОД (используется сейчас)
    import { loadCart as loadCartFromModule, loadOrders as loadOrdersFromModule, loadPurchases as loadPurchasesFromModule } from './cart/cartActive.js';
// Используем функции внутри модуля
const loadCart = loadCartFromModule;
const loadOrders = loadOrdersFromModule;
const loadPurchases = loadPurchasesFromModule;
export { loadCart, loadOrders, loadPurchases };
// ========== END REFACTORING STEP 5.1, 5.2, 5.3 ==========
// ========== REFACTORING STEP 6.1, 6.2, 6.3: cartTabs.js ==========
// НОВЫЙ КОД (используется сейчас)
    import { switchCartSubtab as switchCartSubtabFromModule, switchCartTab as switchCartTabFromModule, updateCartTabsVisibility as updateCartTabsVisibilityFromModule } from './cart/cartTabs.js';
// Используем функции внутри модуля
const switchCartTab = switchCartTabFromModule;
const switchCartSubtab = switchCartSubtabFromModule;
const updateCartTabsVisibility = updateCartTabsVisibilityFromModule;
export { switchCartSubtab, switchCartTab, updateCartTabsVisibility };
// ========== END REFACTORING STEP 6.1, 6.2, 6.3 ==========
// ========== REFACTORING STEP 7.1, 7.2, 7.3: cartInit.js ==========
// НОВЫЙ КОД (используется сейчас)
    import { closeCartPage as closeCartPageFromModule, initCart as initCartFromModule, setupCartButton as setupCartButtonFromModule, setupCartModal as setupCartModalFromModule } from './cart/cartInit.js';
// Используем функции внутри модуля
const initCart = initCartFromModule;
const setupCartButton = setupCartButtonFromModule;
const setupCartModal = setupCartModalFromModule;
const closeCartPage = closeCartPageFromModule;
export { closeCartPage, initCart, setupCartButton, setupCartModal };
// ========== END REFACTORING STEP 7.1, 7.2, 7.3 ==========
// ========== REFACTORING STEP 8.1, 8.2, 8.3, 8.4, 8.5, 8.6: cartUI.js ==========
// НОВЫЙ КОД (используется сейчас)
    import { checkHistoryExists as checkHistoryExistsFromModule, fetchActiveOrders as fetchActiveOrdersFromModule, fetchActivePurchases as fetchActivePurchasesFromModule, fetchActiveReservations as fetchActiveReservationsFromModule, updateCartButtonVisibility as updateCartButtonVisibilityFromModule, updateCartUI as updateCartUIFromModule } from './cart/cartUI.js';
// Используем функции внутри модуля
const fetchActiveReservations = fetchActiveReservationsFromModule;
const fetchActiveOrders = fetchActiveOrdersFromModule;
const fetchActivePurchases = fetchActivePurchasesFromModule;
const checkHistoryExists = checkHistoryExistsFromModule;
const updateCartButtonVisibility = updateCartButtonVisibilityFromModule;
const updateCartUI = updateCartUIFromModule;
export { updateCartUI };
// ========== END REFACTORING STEP 8.1, 8.2, 8.3, 8.4, 8.5, 8.6 ==========

// Элементы DOM корзины
let cartButton = null;
let cartCount = null;
let cartModal = null;

export function initCartElements() {
    cartButton = document.getElementById('cart-button');
    cartCount = document.getElementById('cart-count');
    if (cartButton && cartCount) {
        console.log('✅ Cart elements found');
    } else {
        console.log('❌ Cart elements not found yet');
    }
}

export function setCartModal(modal) {
    cartModal = modal;
}

export function getCartModal() {
    return cartModal;
}
