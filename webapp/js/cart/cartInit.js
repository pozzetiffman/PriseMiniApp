// ========== REFACTORING STEP 7.1, 7.2, 7.3: cartInit.js ==========
// Модуль для инициализации корзины
// Дата начала: 2024-12-XX
// Статус: ✅ ЗАВЕРШЕНО (STEP 7.1 завершен, STEP 7.2 завершен, STEP 7.3 завершен)

// Импорты зависимостей
import { switchCartSubtab, switchCartTab, updateCartTabsVisibility } from './cartTabs.js';

// Переменная для хранения интервала обновления корзины
let cartInitInterval = null;

// Счетчик попыток инициализации для предотвращения бесконечных циклов
let setupCartModalAttempts = 0;
const MAX_SETUP_ATTEMPTS = 50; // Максимум 5 секунд (50 * 100ms)

// Счетчик попыток для initCart
let initCartAttempts = 0;
const MAX_INIT_CART_ATTEMPTS = 50; // Максимум 5 секунд (50 * 100ms)

/**
 * Инициализация корзины
 * Находит элементы DOM корзины, обновляет UI и запускает периодическое обновление
 */
export function initCart() {
    // Защита от бесконечного цикла
    if (initCartAttempts >= MAX_INIT_CART_ATTEMPTS) {
        console.error('[CART INIT] ❌ Maximum initCart attempts reached, stopping retries');
        return;
    }
    
    // Получаем элементы корзины напрямую из DOM
    const cartButton = document.getElementById('cart-button');
    const cartCount = document.getElementById('cart-count');
    
    if (!cartButton || !cartCount) {
        initCartAttempts++;
        console.log('[CART INIT] Cart elements not found, retrying... (attempt', initCartAttempts, 'of', MAX_INIT_CART_ATTEMPTS + ')');
        setTimeout(initCart, 100);
        return;
    }
    
    // Сбрасываем счетчик при успешной инициализации
    initCartAttempts = 0;
    
    // КРИТИЧНО: НЕ вызываем updateCartUI() сразу при инициализации!
    // updateCartUI() делает до 6 API вызовов и блокирует загрузку приложения.
    // Обновление корзины будет вызвано из app.js после полной загрузки данных.
    console.log('[CART INIT] Cart elements found, UI update deferred until app is fully loaded');
    
    // НЕ запускаем интервал обновления здесь - это будет сделано после загрузки данных
    // Интервал будет запущен из app.js после loadData()
}
// ========== END REFACTORING STEP 7.1 ==========

/**
 * Настройка кнопки корзины
 * Устанавливает обработчик клика на кнопку корзины для открытия страницы корзины
 */
// Счетчик попыток для setupCartButton
let setupCartButtonAttempts = 0;
const MAX_SETUP_BUTTON_ATTEMPTS = 50;

export function setupCartButton() {
    // Защита от бесконечного цикла
    if (setupCartButtonAttempts >= MAX_SETUP_BUTTON_ATTEMPTS) {
        console.error('[CART INIT] ❌ Maximum setup button attempts reached, stopping retries');
        return;
    }
    
    // Получаем элементы корзины напрямую из DOM
    const cartButton = document.getElementById('cart-button');
    
    if (cartButton) {
        setupCartButtonAttempts = 0; // Сбрасываем счетчик при успехе
        cartButton.onclick = async () => {
            try {
                // Получаем страницу корзины и главный контент
                const cartPage = document.getElementById('cart-page');
                const mainContent = document.getElementById('main-content');
                
                if (cartPage && mainContent) {
                    // Скрываем главный контент и показываем страницу корзины
                    mainContent.style.display = 'none';
                    cartPage.style.display = 'block';
                    
                    // Обновляем видимость вкладок и выбираем активную вкладку (после показа страницы)
                    // Делаем это асинхронно, чтобы не блокировать UI
                    setTimeout(async () => {
                        try {
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
                            
                            switchCartTab(defaultTab);
                        } catch (err) {
                            console.error('❌ Error updating cart tabs or switching tab:', err);
                            // В случае ошибки просто показываем первую вкладку
                            try {
                                switchCartTab('reservations');
                            } catch (switchErr) {
                                console.error('❌ Error in switchCartTab:', switchErr);
                            }
                        }
                    }, 50);
                } else {
                    console.error('❌ Cart page or main content not found');
                }
            } catch (err) {
                console.error('❌ Error opening cart:', err);
            }
        };
        console.log('✅ Cart button click handler set up');
    } else {
        setupCartButtonAttempts++;
        console.log('[CART INIT] Cart button not found, retrying... (attempt', setupCartButtonAttempts, 'of', MAX_SETUP_BUTTON_ATTEMPTS + ')');
        setTimeout(setupCartButton, 100);
    }
}
// ========== END REFACTORING STEP 7.2 ==========

/**
 * Настройка модального окна корзины (для обратной совместимости)
 * Инициализирует обработчики закрытия и вкладок для страницы корзины
 */
export function setupCartModal() {
    console.log('[CART INIT] setupCartModal called, attempt:', setupCartModalAttempts + 1);
    
    // Защита от бесконечного цикла
    if (setupCartModalAttempts >= MAX_SETUP_ATTEMPTS) {
        console.error('[CART INIT] ❌ Maximum setup attempts reached, stopping retries');
        return;
    }
    
    // Находим страницу корзины
    const cartPage = document.getElementById('cart-page');
    if (!cartPage) {
        setupCartModalAttempts++;
        console.log('[CART INIT] Cart page not found, retrying... (attempt', setupCartModalAttempts, 'of', MAX_SETUP_ATTEMPTS + ')');
        setTimeout(setupCartModal, 100);
        return;
    }
    
    // Сбрасываем счетчик при успешной инициализации
    setupCartModalAttempts = 0;
    
    console.log('[CART INIT] Cart page found, initializing...');
    
    // Настраиваем кнопку "Назад" для закрытия страницы корзины
    const cartPageBack = document.getElementById('cart-page-back');
    if (cartPageBack) {
        cartPageBack.onclick = () => {
            closeCartPage();
        };
        console.log('✅ Cart page back button initialized');
    }
    
    // Настройка основных вкладок (работают как на странице, так и в модальном окне для обратной совместимости)
    // Ищем вкладки в странице корзины или модальном окне
    const cartModal = document.getElementById('cart-modal');
    const container = cartPage || cartModal;
    const tabs = container ? container.querySelectorAll('.cart-tab') : document.querySelectorAll('.cart-tab');
    
    if (tabs && tabs.length > 0) {
        console.log(`[CART INIT] Found ${tabs.length} cart tabs`);
        tabs.forEach(tab => {
            tab.onclick = () => {
                console.log(`🛒 Cart tab clicked: ${tab.dataset.tab}`);
                switchCartTab(tab.dataset.tab);
            };
        });
        
        // КРИТИЧНО: НЕ вызываем updateCartTabsVisibility при инициализации!
        // Эта функция делает 6 API вызовов и может блокировать загрузку приложения.
        // Видимость вкладок будет обновлена при открытии корзины (в setupCartButton).
        console.log('✅ Cart tabs initialized (visibility will be updated when cart is opened)');
    } else {
        console.warn('⚠️ Cart tabs not found in HTML');
    }
    
    // Настройка подвкладок
    const subtabs = container ? container.querySelectorAll('.cart-subtab') : document.querySelectorAll('.cart-subtab');
    if (subtabs && subtabs.length > 0) {
        console.log(`[CART INIT] Found ${subtabs.length} cart subtabs`);
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
    
    console.log('✅ Cart page initialized');
}

/**
 * Закрытие страницы корзины
 * Скрывает страницу корзины и показывает главный контент
 */
export function closeCartPage() {
    console.log('[CART PAGE] Closing cart page');
    const cartPage = document.getElementById('cart-page');
    const mainContent = document.getElementById('main-content');
    
    if (cartPage && mainContent) {
        // Скрываем страницу корзины и показываем главный контент
        cartPage.style.display = 'none';
        mainContent.style.display = 'block';
    }
}
// ========== END REFACTORING STEP 7.3 ==========

