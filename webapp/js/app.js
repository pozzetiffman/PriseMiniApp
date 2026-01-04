// Главный файл приложения - инициализация и координация модулей
import { getCurrentShopSettings, initAdmin, loadShopSettings } from './admin.js';
import { API_BASE, cancelPurchaseAPI, createPurchaseAPI, fetchCategories, fetchProducts, getContext, getShopSettings, trackShopVisit } from './api.js';
import { initCart, loadCart, loadOrders, loadPurchases, setupCartButton, setupCartModal, updateCartUI } from './cart.js';
import { initProfile, setupProfileButton } from './profile.js';
import { getInitData, getTelegramInstance, initTelegram, requireTelegram } from './telegram.js';
// Импорт функций категорий из отдельного модуля (рефакторинг)
import {
    categoriesHierarchy,
    // Импортируем переменные состояния категорий
    currentCategoryId,
    initCategoriesDependencies,
    renderCategories,
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
import { initOrdersDependencies, resetOrderForm, showOrderModal, showOrderStep } from './orders.js';

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
    sortBy: 'none' // 'none', 'price-asc', 'price-desc'
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
    
    // 4.1 Инициализируем зависимости для модуля категорий
    // Функции applyFilters и updateProductFilterOptions определены ниже, но доступны через hoisting
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

// Обновление заголовка с названием магазина
window.updateShopNameInHeader = async function updateShopNameInHeader() {
    if (appContext && appContext.role === 'client') {
        // ВАЖНО: Всегда загружаем настройки заново для текущего магазина,
        // чтобы избежать проблем с кэшированием настроек разных магазинов
        const currentShopOwnerId = appContext.shop_owner_id;
        console.log(`🏷️ Updating shop name header for shop_owner_id: ${currentShopOwnerId}`);
        
        try {
            // Загружаем настройки заново для текущего магазина
            const shopSettings = await getShopSettings(currentShopOwnerId);
            console.log(`🏷️ Shop settings loaded for shop_owner_id ${currentShopOwnerId}:`, shopSettings);
            
            const shopName = shopSettings && shopSettings.shop_name ? shopSettings.shop_name : 'Магазин';
            userNameElement.innerText = shopName; // Убираем эмодзи, показываем только название
            
            // Обновляем глобальную переменную для других частей приложения
            await loadShopSettings(currentShopOwnerId);
            console.log(`✅ Shop name header updated to: "${shopName}"`);
        } catch (error) {
            console.error(`❌ Error loading shop settings for header (shop_owner_id: ${currentShopOwnerId}):`, error);
            // В случае ошибки используем кэшированные настройки или дефолт
            const shopSettings = getCurrentShopSettings();
            const shopName = shopSettings && shopSettings.shop_name ? shopSettings.shop_name : 'Магазин';
            userNameElement.innerText = shopName;
        }
    }
}
    
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

// Загрузка данных (категории и товары)
window.loadData = async function loadData() {
    console.log('🚀 loadData() called');
    console.log('🚀 appContext:', appContext);
    
    if (!appContext) {
        console.error('❌ loadData: appContext is null!');
        productsGrid.innerHTML = '<p class="loading">Ошибка: контекст не загружен</p>';
        return;
    }

    console.log('📦 Starting data load for shop_owner_id:', appContext.shop_owner_id);
    productsGrid.innerHTML = '<p class="loading">Загрузка товаров...</p>';
    
    try {
        console.log('📦 Loading data for shop_owner_id:', appContext.shop_owner_id);
        console.log('📦 API_BASE:', API_BASE);
        
        // Загружаем категории для магазина (shop_owner_id)
        // Используем bot_id из контекста для независимых магазинов
        // bot_id может быть числом (например, 2) или null/undefined
        let botId = null;
        if (appContext.bot_id !== undefined && appContext.bot_id !== null) {
            botId = appContext.bot_id;
        }
        console.log('📂 Step 1: Fetching categories...');
        console.log('📂 appContext.bot_id:', appContext.bot_id, 'type:', typeof appContext.bot_id);
        console.log('📂 Final botId:', botId, 'type:', typeof botId);
        const categoriesUrl = `${API_BASE}/api/categories/?user_id=${appContext.shop_owner_id}${botId !== null && botId !== undefined ? `&bot_id=${botId}` : ''}`;
        console.log('📂 Categories URL:', categoriesUrl);
        // Загружаем категории с иерархией (flat=false для отображения)
        const categories = await fetchCategories(appContext.shop_owner_id, botId, false);
        console.log('✅ Step 1 complete: Categories loaded:', categories.length);
        console.log('📂 Categories structure:', JSON.stringify(categories, null, 2));
        if (categories && categories.length > 0) {
            console.log('📂 First category:', categories[0]);
            if (categories[0].subcategories) {
                console.log('📂 First category subcategories:', categories[0].subcategories);
            }
        }
        renderCategories(categories);
        
        // Загружаем товары для магазина (shop_owner_id)
        // ВАЖНО: Загружаем ВСЕ товары без фильтрации по категории для работы фильтров
        console.log('📦 Step 2: Fetching products...');
        const productsUrl = `${API_BASE}/api/products/?user_id=${appContext.shop_owner_id}${botId !== null && botId !== undefined ? `&bot_id=${botId}` : ''}`;
        console.log('📦 Products URL:', productsUrl);
        console.log('📦 Using botId:', botId, 'for products');
        const products = await fetchProducts(appContext.shop_owner_id, null, botId); // Загружаем все товары
        console.log('✅ Step 2 complete: Products loaded:', products.length);
        // Сохраняем все товары для фильтрации
        allProducts = products;
        // Обновляем опции фильтра на основе доступных товаров
        updateProductFilterOptions();
        // Применяем фильтры (если они активны)
        applyFilters();
        
        // Отслеживаем общее посещение магазина (только для клиентов, не для владельца)
        if (appContext && appContext.role === 'client' && appContext.shop_owner_id) {
            trackShopVisit(appContext.shop_owner_id).catch(err => {
                console.warn('Failed to track shop visit:', err);
            });
        }
        
        // Обновляем корзину
        console.log('🛒 Step 3: Updating cart...');
        await updateCartUI();
        console.log('✅ Step 3 complete: Cart updated');
        
        console.log('✅✅✅ loadData() completed successfully!');
    } catch (e) {
        console.error("❌❌❌ Load Error:", e);
        console.error("❌ Error details:", {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        
        // Формируем понятное сообщение об ошибке
        let errorMessage = 'Ошибка загрузки магазина';
        if (e.message) {
            errorMessage = e.message;
        } else if (e.name === 'TypeError' && e.message.includes('fetch')) {
            errorMessage = 'Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.';
        } else if (e.message.includes('401') || e.message.includes('авторизац')) {
            errorMessage = 'Ошибка авторизации. Убедитесь, что приложение открыто через Telegram-бота.';
        } else if (e.message.includes('404') || e.message.includes('не найден')) {
            errorMessage = 'Магазин не найден.';
        }
        
        productsGrid.innerHTML = `<p class="loading">${errorMessage}</p>`;
    }
}

// Показ модального окна товара

// Отмена продажи
async function cancelPurchase(purchaseId) {
    const { safeConfirm, safeAlert } = await import('./telegram.js');
    
    const confirmed = await safeConfirm('Вы уверены, что хотите отменить эту продажу?');
    if (!confirmed) {
        return;
    }
    
    try {
        if (!appContext) {
            await safeAlert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // user_id определяется на backend из initData
        await cancelPurchaseAPI(purchaseId);
        await safeAlert('✅ Продажа отменена');
        
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Cancel purchase error:', e);
        await safeAlert(`❌ Ошибка: ${e.message}`);
    }
}

// Функция showEditProductModal вынесена в product-edit.js

// Сохранение изменений товара
// Показ изображения в модальном окне

// Настройка модальных окон
function setupModals() {
    // Функция для очистки состояния модального окна товара
    const cleanupProductModal = () => {
        console.log('[MODAL] cleanupProductModal called');
        const modalImage = document.getElementById('modal-image');
        if (modalImage) {
            // Очищаем blob URL если был
            const oldBlobUrl = modalImage.dataset.blobUrl;
            if (oldBlobUrl) {
                URL.revokeObjectURL(oldBlobUrl);
                delete modalImage.dataset.blobUrl;
            }
            // Очищаем навигацию
            const oldNav = modalImage.querySelector('.image-navigation');
            if (oldNav) {
                oldNav.remove();
            }
            // Полностью очищаем содержимое
            modalImage.innerHTML = '';
        }
        // Сбрасываем состояние
        currentImages = [];
        currentImageIndex = 0;
        currentProduct = null;
        currentImageLoadId = 0; // Сбрасываем ID загрузки
        console.log('[MODAL] State cleared');
    };
    
    // Закрытие модального окна товара
    modalClose.onclick = () => {
        cleanupProductModal();
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            cleanupProductModal();
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };
    
    // Закрытие модального окна резервации
    if (reservationClose) {
        reservationClose.onclick = () => {
            reservationModal.style.display = 'none';
        };
    }
    
    reservationModal.onclick = (e) => {
        if (e.target === reservationModal) {
            reservationModal.style.display = 'none';
        }
    };
    
    // Закрытие модального окна заказа
    if (orderClose) {
        orderClose.onclick = () => {
            orderModal.style.display = 'none';
            resetOrderForm();
            showOrderStep(1);
            orderModal.style.display = 'none';
        };
    }
    
    if (orderModal) {
        orderModal.onclick = (e) => {
            if (e.target === orderModal) {
                orderModal.style.display = 'none';
                resetOrderForm();
                showOrderStep(1);
            }
        };
    }
    
    // Закрытие модального окна продажи
    if (sellClose) {
        sellClose.onclick = () => {
            sellModal.style.display = 'none';
        };
    }
    
    if (sellModal) {
        sellModal.onclick = (e) => {
            if (e.target === sellModal) {
                sellModal.style.display = 'none';
            }
        };
    }
    
    // Закрытие модального окна редактирования товара
    const editProductModal = document.getElementById('edit-product-modal');
    const editProductClose = document.querySelector('.edit-product-close');
    if (editProductClose) {
        editProductClose.onclick = () => {
            editProductModal.style.display = 'none';
        };
    }
    
    if (editProductModal) {
        editProductModal.onclick = (e) => {
            if (e.target === editProductModal) {
                editProductModal.style.display = 'none';
            }
        };
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal.style.display === 'block') {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            if (reservationModal.style.display === 'block') {
                reservationModal.style.display = 'none';
            }
            const cartModal = document.getElementById('cart-modal');
            if (cartModal && cartModal.style.display === 'block') {
                cartModal.style.display = 'none';
            }
            const adminModal = document.getElementById('admin-modal');
            if (adminModal && adminModal.style.display === 'block') {
                adminModal.style.display = 'none';
            }
            if (editProductModal && editProductModal.style.display === 'block') {
                editProductModal.style.display = 'none';
            }
            if (sellModal && sellModal.style.display === 'block') {
                sellModal.style.display = 'none';
            }
            if (orderModal && orderModal.style.display === 'block') {
                orderModal.style.display = 'none';
            }
        }
    });
}

// Функция setupAdminButton удалена - теперь используется setupProfileButton из profile.js


window.cancelPurchaseFromCart = async function(purchaseId) {
    await cancelPurchase(purchaseId);
    // Перезагружаем продажи в корзине
    await loadPurchases();
    await updateCartUI();
};


// Очистка истории продаж
window.clearPurchasesHistory = async function() {
    const { safeConfirm, safeAlert } = await import('./telegram.js');
    
    const confirmed = await safeConfirm('Вы уверены, что хотите очистить всю историю продаж? Это действие нельзя отменить.');
    if (!confirmed) {
        return;
    }
    
    try {
        const { clearPurchasesHistoryAPI } = await import('./api.js');
        const result = await clearPurchasesHistoryAPI();
        await safeAlert(`✅ История продаж очищена (удалено ${result.deleted_count || 0} записей)`);
        
        // Перезагружаем историю
        const { loadPurchasesHistory } = await import('./cart.js');
        await loadPurchasesHistory();
    } catch (e) {
        console.error('Clear purchases history error:', e);
        await safeAlert(`❌ Ошибка: ${e.message}`);
    }
};

// Удалить товар

// ========== ФИЛЬТРЫ ==========

// Инициализация фильтров
function initFilters() {
    // Старые фильтры удалены, функционал перенесен в кнопку со стрелками
    // Обработчики инициализируются в initCategoryFilterHandlers() из categories.js
}

// Обновление опций фильтра на основе доступных товаров
function updateProductFilterOptions() {
    if (allProducts.length === 0) {
        // Если товаров нет, скрываем все опции фильтра
        document.querySelectorAll('[data-filter-option]').forEach(option => {
            option.style.display = 'none';
        });
        return;
    }
    
    // Проверяем наличие товаров для каждого типа фильтра
    const hasInStock = allProducts.some(prod => {
        const isMadeToOrder = prod.is_made_to_order === true || 
                              prod.is_made_to_order === 1 || 
                              prod.is_made_to_order === '1' ||
                              prod.is_made_to_order === 'true' ||
                              String(prod.is_made_to_order).toLowerCase() === 'true';
        if (isMadeToOrder) return false;
        return prod.quantity !== undefined && prod.quantity !== null && prod.quantity > 0;
    });
    
    const hasHotOffer = allProducts.some(prod => prod.is_hot_offer === true);
    
    const hasDiscount = allProducts.some(prod => prod.discount > 0);
    
    const hasMadeToOrder = allProducts.some(prod => {
        return prod.is_made_to_order === true || 
               prod.is_made_to_order === 1 || 
               prod.is_made_to_order === '1' ||
               prod.is_made_to_order === 'true' ||
               String(prod.is_made_to_order).toLowerCase() === 'true';
    });
    
    // Проверяем наличие новинок (товары, созданные за последние 30 дней или с большим ID)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hasNewItems = allProducts.some(prod => {
        // Если есть created_at, используем его
        if (prod.created_at) {
            const createdDate = new Date(prod.created_at);
            return createdDate >= thirtyDaysAgo;
        }
        // Иначе используем ID как индикатор новизны (больший ID = новее)
        // Берем последние 20% товаров по ID как новинки
        if (allProducts.length > 0) {
            const sortedById = [...allProducts].sort((a, b) => (b.id || 0) - (a.id || 0));
            const top20Percent = Math.max(1, Math.floor(sortedById.length * 0.2));
            const newestIds = sortedById.slice(0, top20Percent).map(p => p.id);
            return newestIds.includes(prod.id);
        }
        return false;
    });
    
    // Показываем/скрываем опции фильтра через data-filter-option
    const updateFilterOption = (filterType, hasItems) => {
        const filterOption = document.querySelector(`[data-filter-option="${filterType}"]`);
        if (filterOption) {
            filterOption.style.display = hasItems ? 'block' : 'none';
        }
    };
    
    updateFilterOption('in-stock', hasInStock);
    updateFilterOption('hot-offer', hasHotOffer);
    updateFilterOption('with-discount', hasDiscount);
    updateFilterOption('made-to-order', hasMadeToOrder);
    updateFilterOption('new-items', hasNewItems);
    
    // Сбрасываем фильтры, которые больше не доступны
    if (!hasInStock && productFilters.inStock) {
        productFilters.inStock = false;
        const checkbox = document.querySelector('[data-filter="in-stock"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasHotOffer && productFilters.hotOffer) {
        productFilters.hotOffer = false;
        const checkbox = document.querySelector('[data-filter="hot-offer"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasDiscount && productFilters.withDiscount) {
        productFilters.withDiscount = false;
        const checkbox = document.querySelector('[data-filter="with-discount"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasMadeToOrder && productFilters.madeToOrder) {
        productFilters.madeToOrder = false;
        const checkbox = document.querySelector('[data-filter="made-to-order"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasNewItems && productFilters.newItems) {
        productFilters.newItems = false;
        const checkbox = document.querySelector('[data-filter="new-items"]');
        if (checkbox) checkbox.checked = false;
    }
}

// Применение фильтров к товарам
function applyFilters() {
    if (allProducts.length === 0) {
        // Если товары еще не загружены, просто рендерим пустой список
        productsGrid.innerHTML = '<p class="loading">Загрузка товаров...</p>';
        return;
    }
    
    let filteredProducts = [...allProducts];
    
    // Фильтр по категориям
    // Если выбраны подкатегории через выпадающие списки, применяем их
    if (selectedCategoryIds.size > 0) {
        filteredProducts = filteredProducts.filter(prod => {
            return selectedCategoryIds.has(prod.category_id);
        });
    } else if (selectedMainCategoryId !== null) {
        // Если выбрана основная категория, но не выбраны подкатегории
        // Показываем товары из всех её подкатегорий (если они есть)
        const selectedMainCategory = categoriesHierarchy.find(cat => cat.id === selectedMainCategoryId);
        if (selectedMainCategory && selectedMainCategory.subcategories && selectedMainCategory.subcategories.length > 0) {
            // Основная категория с подкатегориями - показываем товары из всех подкатегорий
            const subcategoryIds = new Set(selectedMainCategory.subcategories.map(sub => sub.id));
            filteredProducts = filteredProducts.filter(prod => {
                return subcategoryIds.has(prod.category_id);
            });
        } else if (selectedMainCategory && (!selectedMainCategory.subcategories || selectedMainCategory.subcategories.length === 0)) {
            // Основная категория без подкатегорий - показываем товары из самой категории
            filteredProducts = filteredProducts.filter(prod => {
                return prod.category_id === selectedMainCategoryId;
            });
        }
    } else if (currentCategoryId !== null) {
        // Старый способ выбора категории (для обратной совместимости)
        filteredProducts = filteredProducts.filter(prod => {
            return prod.category_id === currentCategoryId;
        });
    }
    
    // Фильтр по цене
    if (productFilters.price !== 'all') {
        filteredProducts = filteredProducts.filter(prod => {
            const finalPrice = prod.discount > 0 ? Math.round(prod.price * (1 - prod.discount / 100)) : prod.price;
            switch (productFilters.price) {
                case 'low':
                    return finalPrice < 1000;
                case 'medium':
                    return finalPrice >= 1000 && finalPrice <= 5000;
                case 'high':
                    return finalPrice > 5000;
                default:
                    return true;
            }
        });
    }
    
    // Фильтр "В наличии"
    if (productFilters.inStock) {
        filteredProducts = filteredProducts.filter(prod => {
            const isMadeToOrder = prod.is_made_to_order === true || 
                                  prod.is_made_to_order === 1 || 
                                  prod.is_made_to_order === '1' ||
                                  prod.is_made_to_order === 'true' ||
                                  String(prod.is_made_to_order).toLowerCase() === 'true';
            if (isMadeToOrder) return false;
            return prod.quantity !== undefined && prod.quantity !== null && prod.quantity > 0;
        });
    }
    
    // Фильтр "Горящие предложения"
    if (productFilters.hotOffer) {
        filteredProducts = filteredProducts.filter(prod => prod.is_hot_offer === true);
    }
    
    // Фильтр "Со скидкой"
    if (productFilters.withDiscount) {
        filteredProducts = filteredProducts.filter(prod => prod.discount > 0);
    }
    
    // Фильтр "Под заказ"
    if (productFilters.madeToOrder) {
        filteredProducts = filteredProducts.filter(prod => {
            return prod.is_made_to_order === true || 
                   prod.is_made_to_order === 1 || 
                   prod.is_made_to_order === '1' ||
                   prod.is_made_to_order === 'true' ||
                   String(prod.is_made_to_order).toLowerCase() === 'true';
        });
    }
    
    // Фильтр "Новинки"
    if (productFilters.newItems) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredProducts = filteredProducts.filter(prod => {
            // Если есть created_at, используем его
            if (prod.created_at) {
                const createdDate = new Date(prod.created_at);
                return createdDate >= thirtyDaysAgo;
            }
            // Иначе используем ID как индикатор новизны
            // Берем последние 20% товаров по ID как новинки
            if (allProducts.length > 0) {
                const sortedById = [...allProducts].sort((a, b) => (b.id || 0) - (a.id || 0));
                const top20Percent = Math.max(1, Math.floor(sortedById.length * 0.2));
                const newestIds = sortedById.slice(0, top20Percent).map(p => p.id);
                return newestIds.includes(prod.id);
            }
            return false;
        });
    }
    
    // Сортировка
    if (productFilters.sortBy !== 'none') {
        filteredProducts.sort((a, b) => {
            const priceA = a.discount > 0 ? Math.round(a.price * (1 - a.discount / 100)) : a.price;
            const priceB = b.discount > 0 ? Math.round(b.price * (1 - b.discount / 100)) : b.price;
            
            if (productFilters.sortBy === 'price-asc') {
                return priceA - priceB;
            } else if (productFilters.sortBy === 'price-desc') {
                return priceB - priceA;
            }
            return 0;
        });
    }
    
    // Рендерим отфильтрованные товары
    renderProducts(filteredProducts);
}


// Показ модального окна продажи
function showPurchaseModal(prod) {
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    const purchaseModal = document.getElementById('purchase-modal');
    if (!purchaseModal) {
        alert('❌ Модальное окно покупки не найдено');
        return;
    }
    
    // Очищаем форму
    document.getElementById('purchase-last-name').value = '';
    document.getElementById('purchase-first-name').value = '';
    document.getElementById('purchase-middle-name').value = '';
    document.getElementById('purchase-phone').value = '';
    document.getElementById('purchase-city').value = '';
    document.getElementById('purchase-address').value = '';
    document.getElementById('purchase-notes').value = '';
    document.getElementById('purchase-organization').value = '';
    document.getElementById('purchase-images').value = '';
    document.getElementById('purchase-video').value = '';
    document.getElementById('purchase-images-preview').innerHTML = '';
    document.getElementById('purchase-video-preview').innerHTML = '';
    
    // Сбрасываем radio кнопки оплаты
    const paymentRadios = document.querySelectorAll('input[name="purchase-payment"]');
    paymentRadios.forEach(radio => radio.checked = false);
    
    // Обработчик предпросмотра изображений
    const imagesInput = document.getElementById('purchase-images');
    const imagesPreview = document.getElementById('purchase-images-preview');
    imagesInput.onchange = (e) => {
        imagesPreview.innerHTML = '';
        const files = Array.from(e.target.files).slice(0, 5); // Ограничиваем до 5
        files.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                img.style.width = '80px';
                img.style.height = '80px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.margin = '4px';
                imagesPreview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    };
    
    // Обработчик предпросмотра видео
    const videoInput = document.getElementById('purchase-video');
    const videoPreview = document.getElementById('purchase-video-preview');
    videoInput.onchange = (e) => {
        videoPreview.innerHTML = '';
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const video = document.createElement('video');
                video.src = event.target.result;
                video.style.width = '100%';
                video.style.maxWidth = '300px';
                video.style.borderRadius = '8px';
                video.controls = true;
                videoPreview.appendChild(video);
            };
            reader.readAsDataURL(file);
        }
    };
    
    // Обработчик закрытия
    const closeBtn = document.querySelector('.purchase-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            purchaseModal.style.display = 'none';
        };
    }
    
    purchaseModal.onclick = (e) => {
        if (e.target === purchaseModal) {
            purchaseModal.style.display = 'none';
        }
    };
    
    // Обработчик отправки формы
    const submitBtn = document.getElementById('purchase-submit');
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.onclick = async () => {
        await submitPurchaseForm(prod.id);
    };
    
    purchaseModal.style.display = 'block';
}

// Отправка формы продажи
async function submitPurchaseForm(productId) {
    const lastName = document.getElementById('purchase-last-name').value.trim();
    const firstName = document.getElementById('purchase-first-name').value.trim();
    const middleName = document.getElementById('purchase-middle-name').value.trim();
    const phone = document.getElementById('purchase-phone').value.trim();
    const city = document.getElementById('purchase-city').value.trim();
    const address = document.getElementById('purchase-address').value.trim();
    const notes = document.getElementById('purchase-notes').value.trim();
    const organization = document.getElementById('purchase-organization').value.trim();
    const paymentMethod = document.querySelector('input[name="purchase-payment"]:checked')?.value;
    
    // Валидация
    if (!lastName || !firstName || !phone || !city || !address || !paymentMethod) {
        alert('❌ Заполните все обязательные поля (отмечены *)');
        return;
    }
    
    // Создаем FormData
    const formData = new FormData();
    formData.append('product_id', productId);
    formData.append('last_name', lastName);
    formData.append('first_name', firstName);
    if (middleName) formData.append('middle_name', middleName);
    formData.append('phone_number', phone);
    formData.append('city', city);
    formData.append('address', address);
    if (notes) formData.append('notes', notes);
    formData.append('payment_method', paymentMethod);
    if (organization) formData.append('organization', organization);
    
    // Добавляем изображения (до 5 шт)
    const imagesInput = document.getElementById('purchase-images');
    const images = Array.from(imagesInput.files).slice(0, 5);
    images.forEach(image => {
        formData.append('images', image);
    });
    
    // Добавляем видео (1 шт)
    const videoInput = document.getElementById('purchase-video');
    if (videoInput.files[0]) {
        formData.append('video', videoInput.files[0]);
    }
    
    try {
        const submitBtn = document.getElementById('purchase-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Отправка...';
        
        await createPurchaseAPI(productId, formData);
        
        const { safeAlert } = await import('./telegram.js');
        await safeAlert('✅ Заявка на продажу успешно отправлена!');
        
        // Закрываем модальные окна (продажи и товара), как для заказов
        const purchaseModal = document.getElementById('purchase-modal');
        if (purchaseModal) {
            purchaseModal.style.display = 'none';
        }
        // Закрываем также модальное окно товара, чтобы вернуться на общий экран с товарами
        if (modal) {
            modal.style.display = 'none';
        }
        document.body.style.overflow = 'auto';
        
        // Обновляем данные и корзину по тому же принципу, как для резерваций и заказов
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
            
            // Если корзина открыта и пользователь находится на вкладке продаж, обновляем продажи
            const cartModal = document.getElementById('cart-modal');
            if (cartModal && cartModal.style.display === 'block') {
                const purchasesSection = document.getElementById('purchases-section');
                if (purchasesSection && purchasesSection.style.display !== 'none') {
                    const { loadPurchases } = await import('./cart.js');
                    await loadPurchases();
                }
            }
        }, 500);
    } catch (error) {
        console.error('Error creating purchase:', error);
        const { safeAlert } = await import('./telegram.js');
        await safeAlert(`❌ Ошибка: ${error.message}`);
    } finally {
        const submitBtn = document.getElementById('purchase-submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '✅ Отправить заявку';
        }
    }
}

