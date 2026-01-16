// ========== REFACTORING STEP 7.1, 7.2, 7.3: cartInit.js ==========
// Модуль для инициализации корзины
// Дата начала: 2024-12-XX
// Статус: ✅ ЗАВЕРШЕНО (STEP 7.1 завершен, STEP 7.2 завершен, STEP 7.3 завершен)

// Импорты зависимостей
import { getCartModal, setCartModal, updateCartUI } from '../cart.js';
import { loadCart } from './cartActive.js';
import { switchCartSubtab, switchCartTab, updateCartTabsVisibility } from './cartTabs.js';

// Переменная для хранения интервала обновления корзины
let cartInitInterval = null;

/**
 * Инициализация корзины
 * Находит элементы DOM корзины, обновляет UI и запускает периодическое обновление
 */
export function initCart() {
    // Получаем элементы корзины напрямую из DOM
    const cartButton = document.getElementById('cart-button');
    const cartCount = document.getElementById('cart-count');
    
    if (!cartButton || !cartCount) {
        setTimeout(initCart, 100);
        return;
    }
    
    // Обновляем корзину сразу
    updateCartUI().then(() => {
        // ========== REFACTORING STEP 5.1: Использование импортированной функции ==========
        loadCart(updateCartUI);
        // ========== END REFACTORING STEP 5.1 ==========
        
        // Очищаем предыдущий интервал, если был
        if (cartInitInterval) {
            clearInterval(cartInitInterval);
        }
        
        // Обновляем корзину каждые 30 секунд
        cartInitInterval = setInterval(() => {
            updateCartUI();
            // ========== REFACTORING STEP 5.1: Использование импортированной функции ==========
            loadCart(updateCartUI);
            // ========== END REFACTORING STEP 5.1 ==========
        }, 30000);
    }).catch(err => {
        console.error('❌ Error initializing cart:', err);
        console.error('❌ Error stack:', err.stack);
    });
}
// ========== END REFACTORING STEP 7.1 ==========

/**
 * Настройка кнопки корзины
 * Устанавливает обработчик клика на кнопку корзины для открытия модального окна
 */
export function setupCartButton() {
    // Получаем элементы корзины напрямую из DOM
    const cartButton = document.getElementById('cart-button');
    
    if (cartButton) {
        cartButton.onclick = async () => {
            try {
                // Получаем модальное окно через функцию из cart.js
                const cartModal = getCartModal();
                if (cartModal) {
                    // Обновляем видимость вкладок перед открытием
                    const tabsData = await updateCartTabsVisibility();
                    
                    // Выбираем первую доступную вкладку
                    let defaultTab = 'reservations';
                    if (tabsData.hasReservations) {
                        defaultTab = 'reservations';
                    } else if (tabsData.hasOrders) {
                        defaultTab = 'orders';
                    } else if (tabsData.hasPurchases) {
                        defaultTab = 'purchases';
                    }
                    
                    // Сначала открываем модальное окно, чтобы элементы DOM были доступны
                    cartModal.style.display = 'flex';
                    
                    // Затем инициализируем активную вкладку (после небольшой задержки для рендеринга)
                    setTimeout(() => {
                        try {
                            switchCartTab(defaultTab);
                        } catch (err) {
                            console.error('❌ Error in switchCartTab:', err);
                        }
                    }, 50);
                } else {
                    console.error('❌ Cart modal not found');
                }
            } catch (err) {
                console.error('❌ Error opening cart:', err);
            }
        };
        console.log('✅ Cart button click handler set up');
    } else {
        setTimeout(setupCartButton, 100);
    }
}
// ========== END REFACTORING STEP 7.2 ==========

/**
 * Настройка модального окна корзины
 * Инициализирует модальное окно корзины, настраивает обработчики закрытия и вкладок
 */
export function setupCartModal() {
    const modal = document.getElementById('cart-modal');
    if (!modal) {
        setTimeout(setupCartModal, 100);
        return;
    }
    
    // Сохраняем модальное окно через функцию из cart.js
    setCartModal(modal);
    
    const cartClose = document.querySelector('.cart-close');
    if (cartClose) {
        cartClose.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    // Настройка основных вкладок
    const tabs = document.querySelectorAll('.cart-tab');
    if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
            tab.onclick = () => {
                console.log(`🛒 Cart tab clicked: ${tab.dataset.tab}`);
                switchCartTab(tab.dataset.tab);
            };
        });
        // Обновляем видимость вкладок при инициализации
        updateCartTabsVisibility().then(tabsData => {
            // Выбираем первую доступную вкладку
            let defaultTab = 'reservations';
            if (tabsData.hasReservations) {
                defaultTab = 'reservations';
            } else if (tabsData.hasOrders) {
                defaultTab = 'orders';
            } else if (tabsData.hasPurchases) {
                defaultTab = 'purchases';
            }
            switchCartTab(defaultTab);
        });
        console.log('✅ Cart tabs initialized');
    } else {
        console.warn('⚠️ Cart tabs not found in HTML');
    }
    
    // Настройка подвкладок
    const subtabs = document.querySelectorAll('.cart-subtab');
    if (subtabs && subtabs.length > 0) {
        subtabs.forEach(subtab => {
            subtab.onclick = () => {
                console.log(`🛒 Cart subtab clicked: ${subtab.dataset.subtab}`);
                switchCartSubtab(subtab.dataset.subtab);
            };
        });
        console.log('✅ Cart subtabs initialized');
    } else {
        console.warn('⚠️ Cart subtabs not found in HTML');
    }
    
    console.log('✅ Cart modal initialized');
}
// ========== END REFACTORING STEP 7.3 ==========

