// Главный файл приложения - инициализация и координация модулей
import { initAdmin, loadShopSettings, openAdmin } from './admin.js';
import { getContext } from './api.js';
import { initCart, loadCart, loadOrders, loadPurchases, setupCartButton, setupCartModal, updateCartUI } from './cart.js';
import { initSettingsModal, openSettings } from './handlers/admin_settings_modal.js';
import { initProfile, setupProfileButton } from './profile.js';
import { getTelegramInstance, initTelegram, requireTelegram } from './telegram.js';
// Импорт функций категорий из отдельного модуля (рефакторинг)
import {
    categoriesHierarchy,
    // Импортируем переменные состояния категорий
    currentCategoryId,
    initCategoriesDependencies,
    selectedCategoryIds,
    selectedMainCategoryId
} from './categories.js';
// Импорт функций рендеринга товаров из отдельного модуля (рефакторинг)
import { initProductsDependencies, renderProducts, showProductModal } from './products.js';
// Импорт функций редактирования товаров из отдельного модуля (рефакторинг)
import { deleteProduct, initProductEditDependencies, markAsSold, showEditProductModal, showSellModal } from './product-edit.js';
// Импорт функций резерваций из отдельного модуля (рефакторинг)
import { cancelReservation, initReservationsDependencies, showReservationModal } from './reservations.js';
// Импорт функций заказов из отдельного модуля (рефакторинг)
import { initOrdersDependencies, showOrderModal } from './orders.js';
// Импорт функций продаж из отдельного модуля (рефакторинг)
import { initPurchasesDependencies, showPurchaseModal } from './purchases.js';
// Импорт функций фильтров из отдельного модуля (рефакторинг)
import { applyFilters, initFilters, initFiltersDependencies, updateProductFilterOptions } from './filters.js';
// Импорт функций настройки модальных окон из отдельного модуля (рефакторинг)
import { initModalsDependencies, setupModals } from './modals.js';
// Импорт функций загрузки данных из отдельного модуля (рефакторинг)
import { initDataDependencies, loadData, updateShopNameInHeader } from './data.js';
// Импорт функций переключения вида карточек
import { initCardViewToggle } from './handlers/cardViewToggle.js';
// Импорт remoteLogger для отладки
import { initRemoteLogger } from './utils/remoteLogger.js';

// Глобальные переменные
let appContext = null; // Контекст магазина (viewer_id, shop_owner_id, role, permissions)

// Состояние фильтров
let allProducts = []; // Все товары для фильтрации на клиенте
let productFilters = {
    price: 'all', // 'all', 'low', 'medium', 'high'
    inStock: false,
    hotOffer: false,
    withDiscount: false,
    madeToOrder: false,
    newItems: false, // Новинки
    sortBy: 'none', // 'none', 'price-asc', 'price-desc'
    searchQuery: '' // Поисковый запрос
};

// Делаем productFilters доступным глобально для categories.js
window.productFilters = productFilters;

// Экспортируем функцию для получения appContext (для использования в других модулях)
window.getAppContext = function() {
    return appContext;
};

// Элементы DOM
const userNameElement = document.getElementById('user-name');
const categoriesNav = document.getElementById('categories-nav');
const productsGrid = document.getElementById('products-grid');
// Product modal больше не используется - заменен на product-page
// const modal = document.getElementById('product-modal');
// const modalClose = document.querySelector('.modal-close');
const reservationModal = document.getElementById('reservation-modal');
const reservationClose = document.querySelector('.reservation-close');
const orderModal = document.getElementById('order-modal');
const orderClose = document.querySelector('.order-close');
const sellModal = document.getElementById('sell-modal');
const sellClose = document.querySelector('.sell-close');

// Состояние модального окна товара
let currentImageIndex = 0;
let currentImages = [];
let currentProduct = null;
let currentImageLoadId = 0; // Уникальный ID для отслеживания актуальности загрузки изображения

// Безопасная ленивая загрузка модуля favorites (необязательный модуль)
async function tryInitFavorites(appContext) {
    if (!appContext || appContext.role !== 'client') return;

    try {
        const module = await import('./favorites.js');
        if (module.initFavorites) {
            module.initFavorites();
        }
        if (module.updateFavoritesCount) {
            setTimeout(() => {
                module.updateFavoritesCount().catch(() => {
                    // Игнорируем ошибки обновления счетчика
                });
            }, 500);
        }
    } catch (e) {
        // favorites — необязательный модуль
        // отсутствие файла НЕ должно ломать магазин
    }
}

// Безопасный вызов updateFavoritesCount
async function tryUpdateFavoritesCount() {
    try {
        const module = await import('./favorites.js');
        if (module.updateFavoritesCount) {
            await module.updateFavoritesCount();
        }
    } catch (e) {
        // Игнорируем ошибки, модуль необязательный
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    // === ИСПРАВЛЕНИЕ: Глобальная защита от падения приложения ===
    try {
        // 0. Инициализируем remoteLogger ПЕРВЫМ, чтобы перехватить все логи
        initRemoteLogger();
        
        console.log('📄 DOMContentLoaded - инициализация приложения');
        console.log('[APP INIT] Step 1: Initializing Telegram...');
        
        // 1. Инициализируем Telegram WebApp
        // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
        // === ИСПРАВЛЕНИЕ: Graceful degradation - initTelegram больше не бросает ошибки ===
        await initTelegram();
        console.log('[APP INIT] Step 1: Telegram initialized');
        
        // 1.1. КРИТИЧНО: Предотвращаем закрытие приложения свайпом вниз
        // Блокируем вертикальные свайпы вниз, которые могут закрыть приложение
        let preventCloseStartY = 0;
        let preventCloseStartTime = 0;
        let preventCloseStartX = 0;
        
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                preventCloseStartY = e.touches[0].clientY;
                preventCloseStartX = e.touches[0].clientX;
                preventCloseStartTime = Date.now();
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1) return;
            
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const dy = currentY - preventCloseStartY;
            const dx = Math.abs(currentX - preventCloseStartX);
            const dt = Date.now() - preventCloseStartTime;
            
            // Проверяем, что это именно вертикальный жест (не диагональный)
            const isVerticalSwipe = dy > 0 && dy > dx * 2;
            
            // Блокируем быстрые свайпы вниз от начала страницы (которые могут закрыть приложение)
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            const isAtTop = scrollTop < 100; // Близко к началу страницы
            
            // Блокируем только если:
            // 1. Мы в начале страницы
            // 2. Это вертикальный жест вниз (не диагональный)
            // 3. Жест быстрый (может быть попыткой закрыть приложение)
            if (isAtTop && isVerticalSwipe && dy > 50 && dt < 500) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[APP] 🚫 Блокирован свайп вниз для предотвращения закрытия приложения');
            }
        }, { passive: false });
        
        console.log('✅ Обработчики предотвращения закрытия приложения активированы');
        
        // 2. Ждем немного, чтобы initData стал доступен
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 3. Проверяем, что Telegram доступен
        // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
        // === ИСПРАВЛЕНИЕ: Graceful degradation вместо throw ===
        // === ИСПРАВЛЕНИЕ: Поддержка режима отладки через параметр URL ===
        const urlParams = new URLSearchParams(window.location.search);
        const debugUser = urlParams.get('debug_user');
        const isDebugMode = debugUser !== null;
        
        // Сохраняем isDebugMode в глобальной области для использования в других местах
        window.isDebugMode = isDebugMode;
        
        let telegramUser = null;
        try {
            telegramUser = requireTelegram();
        } catch (e) {
            // Если requireTelegram все еще выбросил ошибку (не должно произойти после исправления)
            console.warn('⚠️ [APP] requireTelegram завершился с ошибкой:', e.message);
            telegramUser = {
                id: null,
                isFallback: true,
                fallbackReason: 'error_in_require_telegram'
            };
        }
        
        if (telegramUser && telegramUser.isFallback) {
            if (isDebugMode) {
                // В режиме отладки продолжаем работу с fallback данными
                console.warn('⚠️ [APP] Режим отладки: продолжаем без Telegram данных');
                console.warn('⚠️ [APP] Используется debug_user из URL:', debugUser);
                // Создаем fallback контекст для отладки
                telegramUser = {
                    id: parseInt(debugUser) || 1,
                    isFallback: false, // Помечаем как не fallback, чтобы продолжить
                    isDebugMode: true
                };
            } else {
                // === ИСПРАВЛЕНИЕ: Показываем понятное сообщение вместо падения ===
                const errorMessage = 'Приложение должно быть открыто через Telegram-бота';
                if (productsGrid) {
                    productsGrid.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: #fff;">
                            <p style="font-size: 16px; margin-bottom: 12px;">⚠️</p>
                            <p style="font-size: 14px; line-height: 1.5;">${errorMessage}</p>
                            <p style="font-size: 12px; margin-top: 12px; opacity: 0.7;">Для отладки добавьте ?debug_user=1 в URL</p>
                        </div>
                    `;
                }
                console.warn('⚠️ [APP] Остановка инициализации из-за отсутствия Telegram данных:', telegramUser.fallbackReason);
                return; // НЕ продолжаем инициализацию, НЕ вызываем loadData
            }
        }
        
        // 4. Инициализируем cartModal (не блокируем инициализацию)
        // Выполняем в следующем тике event loop, чтобы не блокировать основной поток
        console.log('[APP INIT] Step 4: Setting up cart modal (async)...');
        setTimeout(() => {
            try {
                setupCartModal();
                console.log('[APP INIT] Step 4: Cart modal setup completed');
            } catch (err) {
                console.error('❌ Error in setupCartModal:', err);
                // Не блокируем инициализацию при ошибке
            }
        }, 0);
    
    // 4.0 Инициализируем зависимости для модуля фильтров
    initFiltersDependencies({
        allProductsGetter: () => allProducts,
        productFiltersGetter: () => productFilters,
        selectedCategoryIdsGetter: () => selectedCategoryIds,
        selectedMainCategoryIdGetter: () => selectedMainCategoryId,
        categoriesHierarchyGetter: () => categoriesHierarchy,
        currentCategoryIdGetter: () => currentCategoryId,
        productsGridElement: productsGrid,
        renderProductsCallback: renderProducts,
        applyFiltersCallback: applyFilters
    });
    
    // 4.1 Инициализируем зависимости для модуля категорий
    // Функции applyFilters и updateProductFilterOptions импортированы из filters.js
    initCategoriesDependencies({
        applyFilters: applyFilters,
        updateProductFilterOptions: updateProductFilterOptions,
        categoriesNav: categoriesNav
    });
    
    // 4.2 Инициализируем зависимости для модуля товаров
    // Создаем объект состояния модального окна для передачи в модуль
    const modalState = {
        currentImageLoadId: currentImageLoadId,
        currentProduct: currentProduct,
        currentImages: currentImages,
        currentImageIndex: currentImageIndex
    };
    
    // Сохраняем modalState в window для использования в других модулях (например, favorites.js)
    window.modalState = modalState;
    
    // Обновляем объект состояния при изменении переменных
    Object.defineProperty(modalState, 'currentImageLoadId', {
        get: () => currentImageLoadId,
        set: (val) => { currentImageLoadId = val; }
    });
    Object.defineProperty(modalState, 'currentProduct', {
        get: () => currentProduct,
        set: (val) => { currentProduct = val; }
    });
    Object.defineProperty(modalState, 'currentImages', {
        get: () => currentImages,
        set: (val) => { currentImages = val; }
    });
    Object.defineProperty(modalState, 'currentImageIndex', {
        get: () => currentImageIndex,
        set: (val) => { currentImageIndex = val; }
    });
    
    // 4.3 Инициализируем зависимости для модуля редактирования товаров (ПЕРЕД initProductsDependencies)
    // Это нужно, чтобы showEditProductModal могла использовать свои зависимости
    initProductEditDependencies({
        currentProductGetter: () => currentProduct, // Функция-геттер для получения currentProduct
        currentProductSetter: (val) => { currentProduct = val; }, // Функция-сеттер для установки currentProduct
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        modal: null, // Product modal больше не используется - заменен на product-page
        loadData: loadData, // Функция для загрузки данных
        allProductsGetter: () => allProducts, // Функция-геттер для получения allProducts
        showSellModal: showSellModal, // Функция для показа модального окна продажи (используется в markAsSold)
        sellModal: sellModal, // Элемент модального окна продажи
        showProductModal: showProductModal // Функция для показа/обновления страницы товара
    });
    
    initProductsDependencies({
        productsGrid: productsGrid,
        appContext: () => appContext, // Передаем функцию-геттер для получения актуального appContext
        // Зависимости для showProductModal (теперь showProductPage)
        modal: null, // Product modal больше не используется - заменен на product-page
        modalState: modalState,
        loadData: loadData,
        showEditProductModal: showEditProductModal,
        markAsSold: markAsSold,
        deleteProduct: deleteProduct,
        cancelReservation: cancelReservation,
        showPurchaseModal: showPurchaseModal,
        showReservationModal: showReservationModal,
        showOrderModal: showOrderModal
    });
    
    // 4.4 Инициализируем зависимости для модуля резерваций
    initReservationsDependencies({
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        currentProductGetter: () => currentProduct, // Функция-геттер для получения currentProduct
        allProductsGetter: () => allProducts, // Функция-геттер для получения allProducts
        reservationModal: reservationModal, // DOM элемент модального окна резервации
        modal: null, // Product modal больше не используется - заменен на product-page
        loadData: loadData, // Функция для загрузки данных
        updateCartUI: updateCartUI, // Функция для обновления корзины
        loadCart: loadCart // Функция для загрузки корзины
    });
    
    // 4.5 Инициализируем зависимости для модуля заказов
    initOrdersDependencies({
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        allProductsGetter: () => allProducts, // Функция-геттер для получения allProducts
        orderModal: orderModal, // DOM элемент модального окна заказа
        modal: null, // Product modal больше не используется - заменен на product-page
        loadData: loadData, // Функция для загрузки данных
        updateCartUI: updateCartUI, // Функция для обновления корзины
        loadOrders: loadOrders // Функция для загрузки заказов
    });
    
    // 4.6 Инициализируем зависимости для модуля продаж
    initPurchasesDependencies({
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        modal: null, // Product modal больше не используется - заменен на product-page
        loadData: loadData, // Функция для загрузки данных
        updateCartUI: updateCartUI, // Функция для обновления корзины
        loadPurchases: loadPurchases // Функция для загрузки продаж
    });
    
    // 5. Получаем контекст магазина из backend
    try {
        // Проверяем параметры URL:
        // 1. user_id (прямой параметр)
        // 2. start (из Mini App ссылки: t.me/botusername/shop?start=store_user_id)
        // 3. debug_user (для режима отладки)
        const urlParams = new URLSearchParams(window.location.search);
        let shopOwnerId = null;
        
        // Вариант 1: Прямой параметр user_id
        const shopOwnerIdParam = urlParams.get('user_id');
        if (shopOwnerIdParam) {
            shopOwnerId = parseInt(shopOwnerIdParam, 10);
        }
        
        // Вариант 2: Параметр start из Mini App ссылки
        if (!shopOwnerId) {
            const startParam = urlParams.get('start');
            if (startParam && startParam.startsWith('store_')) {
                const userIdStr = startParam.replace('store_', '');
                shopOwnerId = parseInt(userIdStr, 10);
            }
        }
        
        // Вариант 3: Режим отладки (debug_user)
        if (!shopOwnerId && window.isDebugMode) {
            const debugUserParam = urlParams.get('debug_user');
            shopOwnerId = parseInt(debugUserParam) || 1;
            console.log('[APP INIT] Debug mode: using shopOwnerId from debug_user:', shopOwnerId);
        }
        
        appContext = await getContext(shopOwnerId);
        
        if (!appContext) {
            throw new Error('Context is null after loading');
        }
    } catch (e) {
        console.error('❌ Failed to load context:', e);
        console.error('❌ Error details:', {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        
        // ВРЕМЕННО: для отладки используем fallback из URL
        // TODO: Убрать после исправления проблемы с контекстом
        const urlParams = new URLSearchParams(window.location.search);
        const shopOwnerIdParam = urlParams.get('user_id');
        
        if (shopOwnerIdParam) {
            console.warn('⚠️ FALLBACK: Using user_id from URL for debugging');
            appContext = {
                viewer_id: null,
                shop_owner_id: parseInt(shopOwnerIdParam, 10),
                role: 'client',
                permissions: {
                    can_create_products: false,
                    can_reserve: false,
                    can_cancel_reservation: false,
                    can_view_products: true,
                    can_view_categories: true
                }
            };
        } else {
            // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
            // Если контекст не загрузился - это критическая ошибка
            let errorMessage = 'Ошибка загрузки контекста';
            if (e.message.includes('401') || e.message.includes('initData')) {
                errorMessage = 'Ошибка авторизации. Убедитесь, что приложение открыто через Telegram-бота.';
            } else if (e.message.includes('404')) {
                errorMessage = 'Магазин не найден.';
            } else {
                errorMessage = `Ошибка: ${e.message}`;
            }
            
            productsGrid.innerHTML = `<p class="loading">${errorMessage}</p>`;
            return;
        }
    }
    
    // 5. Устанавливаем приветствие (будет обновлено после загрузки настроек)
    const tg = getTelegramInstance();
    if (appContext.role === 'client') {
        userNameElement.innerText = "Магазин"; // Временно, обновится после загрузки настроек
    } else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userNameElement.innerText = "Привет, " + tg.initDataUnsafe.user.first_name + "!";
    } else {
        userNameElement.innerText = "Прайс";
    }
    
    // 4.7 Инициализируем зависимости для модуля модальных окон
    initModalsDependencies({
        modal: null, // Product modal больше не используется - заменен на product-page
        modalClose: null, // Product modal больше не используется - заменен на product-page
        reservationModal: reservationModal,
        reservationClose: reservationClose,
        orderModal: orderModal,
        orderClose: orderClose,
        sellModal: sellModal,
        sellClose: sellClose,
        // Геттеры/сеттеры для переменных состояния модального окна товара
        currentImagesGetter: () => currentImages,
        currentImagesSetter: (val) => { currentImages = val; },
        currentImageIndexGetter: () => currentImageIndex,
        currentImageIndexSetter: (val) => { currentImageIndex = val; },
        currentProductGetter: () => currentProduct,
        currentProductSetter: (val) => { currentProduct = val; },
        currentImageLoadIdGetter: () => currentImageLoadId,
        currentImageLoadIdSetter: (val) => { currentImageLoadId = val; }
    });
    
    // 4.8 Инициализируем зависимости для модуля загрузки данных
    initDataDependencies({
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        productsGridElement: productsGrid, // DOM элемент для отображения товаров
        allProductsGetter: () => allProducts, // Функция-геттер для получения allProducts
        allProductsSetter: (val) => { allProducts = val; }, // Функция-сеттер для установки allProducts
        userNameElement: userNameElement // DOM элемент для отображения названия магазина
    });
    
    // Делаем loadData и updateShopNameInHeader доступными через window для обратной совместимости с admin.js
    window.loadData = loadData;
    window.updateShopNameInHeader = updateShopNameInHeader;
    
    // 6. Настраиваем обработчики модальных окон
    setupModals();
    
    // 6.5. Инициализируем фильтры
    initFilters();
    
    // 7. Инициализируем корзину
    setupCartButton();
    initCart();
    
    // 8. Загружаем настройки магазина
    if (appContext.role === 'owner') {
        // Для владельца загружаем свои настройки
        await loadShopSettings();
        initAdmin();
    } else {
        // Для клиентов загружаем настройки владельца магазина
        await loadShopSettings(appContext.shop_owner_id);
    }
    
    // 8.1 Инициализируем личный кабинет для всех пользователей
    initProfile();
    setupProfileButton();
    
    // 7.5 Инициализируем модальное окно настроек
    initSettingsModal();
    
    // 7.6 Настраиваем кнопки настроек и админки для владельцев магазинов
    const isOwner = appContext && appContext.role === 'owner';
    const settingsButton = document.getElementById('settings-button');
    const adminButton = document.getElementById('admin-button');
    
    if (settingsButton) {
        if (isOwner) {
            settingsButton.style.display = 'flex';
            settingsButton.onclick = () => {
                openSettings();
            };
        } else {
            settingsButton.style.display = 'none';
        }
    }
    
    if (adminButton) {
        if (isOwner) {
            adminButton.style.display = 'flex';
            adminButton.onclick = () => {
                openAdmin();
            };
        } else {
            adminButton.style.display = 'none';
        }
    }
    
    // 8.2 Инициализируем переключение вида карточек
    const cardViewToggleButton = document.getElementById('card-view-toggle-button');
    if (cardViewToggleButton && productsGrid) {
        cardViewToggleButton.style.display = 'flex';
        initCardViewToggle(cardViewToggleButton, productsGrid);
    }
    
    // Обновляем заголовок с названием магазина (async функция)
    await updateShopNameInHeader();
    
    // 9. Инициализируем избранное ДО загрузки данных (только для клиентов, не для админа)
    try {
        // Избранное доступно только для клиентов, не для админа
        if (appContext.role === 'client') {
            await tryInitFavorites(appContext);
        } else {
            // Скрываем кнопку избранного для админа
            const favoritesButton = document.getElementById('favorites-button');
            if (favoritesButton) {
                favoritesButton.style.display = 'none';
            }
        }
    } catch (e) {
        // Показываем ошибку в заголовке
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = `❌ Ошибка инициализации: ${e.message || 'Неизвестная ошибка'}`;
        }
    }
    
    // 10. Загружаем данные
    try {
        await loadData();
        // Если загрузка успешна, loadData сам обновит productsGrid
    } catch (e) {
        // Показываем детальную ошибку в интерфейсе
        const errorMessage = e.message || 'Неизвестная ошибка';
        const errorType = e.name || 'Error';
        
        if (productsGrid) {
            productsGrid.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <p class="loading" style="color: #ff6b6b; font-size: 18px; margin-bottom: 10px;">
                        ❌ Ошибка загрузки магазина
                    </p>
                    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">
                        ${errorMessage}
                    </p>
                    <p style="color: var(--text-hint); font-size: 12px;">
                        Тип ошибки: ${errorType}
                    </p>
                </div>
            `;
        }
        
        // Также показываем в заголовке
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            const originalText = userNameElement.textContent;
            userNameElement.textContent = '❌ Ошибка загрузки';
            setTimeout(() => {
                if (userNameElement.textContent === '❌ Ошибка загрузки') {
                    userNameElement.textContent = originalText;
                }
            }, 5000);
        }
    }
    
    // 11. Обновляем корзину после загрузки данных
    // КРИТИЧНО: Обновление корзины происходит ТОЛЬКО после полной загрузки данных
    // чтобы не блокировать инициализацию приложения
    setTimeout(async () => {
        console.log('[APP INIT] Step 11: Updating cart UI after data load...');
        try {
            await updateCartUI();
            console.log('[APP INIT] Step 11: Cart UI updated successfully');
            
            // Запускаем периодическое обновление корзины (каждые 30 секунд)
            // Это делается здесь, а не в initCart(), чтобы не блокировать инициализацию
            setInterval(() => {
                updateCartUI().catch(err => {
                    console.warn('⚠️ Error in periodic cart update:', err);
                });
            }, 30000);
        } catch (e) {
            console.error('❌ Error updating cart:', e);
        }
    }, 1000); // Запускаем через 1 секунду после загрузки данных
    
    // 12. Обновляем счетчик избранного (только для клиентов, не для админа)
    if (appContext.role === 'client') {
        setTimeout(async () => {
            await tryUpdateFavoritesCount();
        }, 600);
    }
    
    // Обновляем счетчик избранного при открытии модального окна корзины (только для клиентов)
    if (appContext.role === 'client') {
        const cartButton = document.getElementById('cart-button');
        if (cartButton) {
            cartButton.addEventListener('click', tryUpdateFavoritesCount);
        }
    }
    // === ИСПРАВЛЕНИЕ: Конец основного блока инициализации ===
    } catch (e) {
        // === ИСПРАВЛЕНИЕ: Глобальный обработчик ошибок для предотвращения "Load failed" ===
        console.error('❌ [APP] Критическая ошибка при инициализации:', e);
        console.error('❌ [APP] Error details:', {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        
        // Показываем понятное сообщение пользователю вместо падения
        const errorMessage = 'Ошибка при запуске приложения. Пожалуйста, перезагрузите страницу или откройте через Telegram-бота.';
        const productsGridEl = document.getElementById('products-grid');
        if (productsGridEl) {
            productsGridEl.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #fff;">
                    <p style="font-size: 16px; margin-bottom: 12px;">⚠️</p>
                    <p style="font-size: 14px; line-height: 1.5;">${errorMessage}</p>
                    <p style="font-size: 12px; margin-top: 12px; opacity: 0.7;">${e.message || 'Неизвестная ошибка'}</p>
                </div>
            `;
        } else {
            // Если productsGrid еще не доступен, показываем через document.body
            document.body.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #fff; background: #1c1c1e; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
                    <div>
                        <p style="font-size: 16px; margin-bottom: 12px;">⚠️</p>
                        <p style="font-size: 14px; line-height: 1.5;">${errorMessage}</p>
                        <p style="font-size: 12px; margin-top: 12px; opacity: 0.7;">${e.message || 'Неизвестная ошибка'}</p>
                    </div>
                </div>
            `;
        }
    }
});

// === ИСПРАВЛЕНИЕ: Глобальный обработчик необработанных ошибок ===
window.addEventListener('error', (event) => {
    console.error('❌ [GLOBAL] Необработанная ошибка:', event.error);
    console.error('❌ [GLOBAL] Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
    
    // Предотвращаем стандартное поведение (показ в консоли)
    event.preventDefault();
    
    // Показываем сообщение пользователю только если это критическая ошибка
    const productsGrid = document.getElementById('products-grid');
    if (productsGrid && !productsGrid.innerHTML.includes('⚠️')) {
        productsGrid.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #fff;">
                <p style="font-size: 16px; margin-bottom: 12px;">⚠️</p>
                <p style="font-size: 14px; line-height: 1.5;">Произошла ошибка. Пожалуйста, перезагрузите страницу.</p>
            </div>
        `;
    }
});

// === ИСПРАВЛЕНИЕ: Глобальный обработчик необработанных промисов ===
window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ [GLOBAL] Необработанное отклонение промиса:', event.reason);
    event.preventDefault(); // Предотвращаем вывод в консоль
});



