// Главный файл приложения - инициализация и координация модулей
import { initAdmin, loadShopSettings } from './admin.js';
import { getContext } from './api.js';
import { initCart, loadCart, loadOrders, loadPurchases, setupCartButton, setupCartModal, updateCartUI } from './cart.js';
import { initProfile, setupProfileButton } from './profile.js';
import { getInitData, getTelegramInstance, initTelegram, requireTelegram } from './telegram.js';
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
import { initProductsDependencies, renderProducts } from './products.js';
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
const modal = document.getElementById('product-modal');
const modalClose = document.querySelector('.modal-close');
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

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOMContentLoaded - инициализация приложения');
    
    // 1. Инициализируем Telegram WebApp
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    try {
        await initTelegram();
    } catch (e) {
        productsGrid.innerHTML = `<p class="loading">${e.message}</p>`;
        return;
    }
    
    // 2. Ждем немного, чтобы initData стал доступен
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 3. Проверяем, что Telegram доступен
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    try {
        requireTelegram();
    } catch (e) {
        productsGrid.innerHTML = `<p class="loading">${e.message}</p>`;
        return;
    }
    
    // 4. Инициализируем cartModal
    setupCartModal();
    
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
        modal: modal, // Элемент модального окна товара
        loadData: loadData, // Функция для загрузки данных
        allProductsGetter: () => allProducts, // Функция-геттер для получения allProducts
        showSellModal: showSellModal, // Функция для показа модального окна продажи (используется в markAsSold)
        sellModal: sellModal // Элемент модального окна продажи
    });
    
    initProductsDependencies({
        productsGrid: productsGrid,
        appContext: () => appContext, // Передаем функцию-геттер для получения актуального appContext
        // Зависимости для showProductModal и showModalImage
        modal: modal,
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
        modal: modal, // DOM элемент модального окна товара
        loadData: loadData, // Функция для загрузки данных
        updateCartUI: updateCartUI, // Функция для обновления корзины
        loadCart: loadCart // Функция для загрузки корзины
    });
    
    // 4.5 Инициализируем зависимости для модуля заказов
    initOrdersDependencies({
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        allProductsGetter: () => allProducts, // Функция-геттер для получения allProducts
        orderModal: orderModal, // DOM элемент модального окна заказа
        modal: modal, // DOM элемент модального окна товара
        loadData: loadData, // Функция для загрузки данных
        updateCartUI: updateCartUI, // Функция для обновления корзины
        loadOrders: loadOrders // Функция для загрузки заказов
    });
    
    // 4.6 Инициализируем зависимости для модуля продаж
    initPurchasesDependencies({
        appContextGetter: () => appContext, // Функция-геттер для получения appContext
        modal: modal, // DOM элемент модального окна товара
        loadData: loadData, // Функция для загрузки данных
        updateCartUI: updateCartUI, // Функция для обновления корзины
        loadPurchases: loadPurchases // Функция для загрузки продаж
    });
    
    // 5. Получаем контекст магазина из backend
    try {
        // Проверяем параметры URL:
        // 1. user_id (прямой параметр)
        // 2. start (из Mini App ссылки: t.me/botusername/shop?start=store_user_id)
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
                console.log('📡 Found start parameter, extracted user_id:', shopOwnerId);
            }
        }
        
        console.log('📡 Loading context, shopOwnerId:', shopOwnerId);
        console.log('📡 Telegram instance:', getTelegramInstance());
        console.log('📡 initData available:', !!getInitData());
        console.log('📡 initDataUnsafe:', getTelegramInstance()?.initDataUnsafe);
        
        appContext = await getContext(shopOwnerId);
        console.log('✅ Context loaded:', appContext);
        console.log('✅ Context bot_id:', appContext.bot_id, 'type:', typeof appContext.bot_id);
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
            console.log('✅ Using fallback context:', appContext);
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
        modal: modal,
        modalClose: modalClose,
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
    
    // Обновляем заголовок с названием магазина (async функция)
    await updateShopNameInHeader();
    
    // 9. Загружаем данные
    await loadData();
    
    // 10. Обновляем корзину после загрузки данных
    setTimeout(async () => {
        console.log('🛒 Обновление корзины после загрузки данных...');
        await updateCartUI();
    }, 500);
});



