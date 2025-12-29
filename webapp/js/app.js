// Главный файл приложения - инициализация и координация модулей
import { getCurrentShopSettings, initAdmin, loadShopSettings, openAdmin } from './admin.js';
import { API_BASE, cancelOrderAPI, cancelReservationAPI, createOrderAPI, createPurchaseAPI, createReservationAPI, deleteProductAPI, fetchCategories, fetchProducts, getContext, getShopSettings, markProductSoldAPI, toggleHotOffer, trackShopVisit, updateProductAPI, updateProductForSaleAPI, updateProductMadeToOrderAPI, updateProductNameDescriptionAPI, updateProductQuantityAPI, updateProductQuantityShowEnabledAPI } from './api.js';
import { initCart, loadCart, loadOrders, setupCartButton, setupCartModal, updateCartUI } from './cart.js';
import { getInitData, getTelegramInstance, initTelegram, requireTelegram } from './telegram.js';

// Глобальные переменные
let appContext = null; // Контекст магазина (viewer_id, shop_owner_id, role, permissions)
let currentCategoryId = null;

// Состояние фильтров
let selectedCategoryIds = new Set(); // Множественный выбор категорий
let allCategories = []; // Все категории для фильтра (плоский список)
let categoriesHierarchy = []; // Структура категорий с подкатегориями (для отображения)
let allProducts = []; // Все товары для фильтрации на клиенте
let selectedMainCategoryId = null; // ID выбранной основной категории
let productFilters = {
    price: 'all', // 'all', 'low', 'medium', 'high'
    inStock: false,
    hotOffer: false,
    withDiscount: false,
    madeToOrder: false,
    newItems: false, // Новинки
    sortBy: 'none' // 'none', 'price-asc', 'price-desc'
};

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

// Детекция устройства (мобильное/десктоп)
// В Telegram WebView на мобильных устройствах нужно использовать blob URL для обхода блокировки
// На десктопе можно использовать прямые URL
function isMobileDevice() {
    // Проверяем через Telegram WebApp platform
    const tg = getTelegramInstance();
    if (tg && tg.platform) {
        return tg.platform === 'ios' || tg.platform === 'android';
    }
    // Fallback: проверяем через user agent
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768);
}

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
        setupAdminButton();
    } else {
        // Для клиентов загружаем настройки владельца магазина
        await loadShopSettings(appContext.shop_owner_id);
    }
    
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
        productsGrid.innerHTML = '<p class="loading">Ошибка загрузки: ' + e.message + '</p>';
    }
}

// Рендеринг категорий - два выпадающих списка
function renderCategories(categories) {
    console.log('🔄 renderCategories called with:', categories);
    
    // Сохраняем структуру категорий
    categoriesHierarchy = Array.isArray(categories) ? categories : [];
    
    // Преобразуем иерархию в плоский список для фильтрации
    const flatCategories = [];
    if (Array.isArray(categories)) {
        categories.forEach(mainCat => {
            flatCategories.push(mainCat);
            if (mainCat.subcategories && Array.isArray(mainCat.subcategories)) {
                mainCat.subcategories.forEach(subCat => {
                    flatCategories.push(subCat);
                });
            }
        });
    }
    allCategories = flatCategories;
    
    // Обновляем фильтр категорий
    updateCategoryFilter();
    
    // Очищаем контейнер категорий
    if (!categoriesNav) {
        console.error('❌ categoriesNav element not found!');
        return;
    }
    
    // Принудительно показываем контейнер категорий
    categoriesNav.style.display = 'block';
    categoriesNav.style.overflow = 'visible';
    categoriesNav.innerHTML = '';
    
    console.log('🔄 [RENDER] Creating dropdowns container...');
    console.log('🔄 [RENDER] categoriesNav display after fix:', window.getComputedStyle(categoriesNav).display);
    
    // Контейнер для выпадающих списков (горизонтальное расположение с фильтром справа)
    const dropdownsContainer = document.createElement('div');
    dropdownsContainer.className = 'category-dropdowns-container';
    dropdownsContainer.style.cssText = 'display: flex !important; flex-direction: row; gap: 8px; width: 100%; align-items: flex-start; justify-content: space-between;';
    console.log('🔄 [RENDER] Dropdowns container created (horizontal layout with space-between)');
    
    // Контейнер для левой части (категории)
    const leftContainer = document.createElement('div');
    leftContainer.className = 'category-dropdowns-left';
    leftContainer.style.cssText = 'display: flex !important; flex-direction: row; gap: 8px; align-items: flex-start; flex: 1;';
    
    // Первый выпадающий список - основные категории
    const mainCategoriesDropdown = document.createElement('div');
    mainCategoriesDropdown.className = 'category-dropdown';
    console.log('🔄 Creating main categories dropdown, selectedMainCategoryId:', selectedMainCategoryId);
    
    const mainCategoriesButton = document.createElement('button');
    mainCategoriesButton.className = 'category-dropdown-button';
    mainCategoriesButton.type = 'button'; // Предотвращаем submit формы, если есть
    const selectedMainCategory = categoriesHierarchy.find(cat => cat.id === selectedMainCategoryId);
    const buttonText = selectedMainCategory ? selectedMainCategory.name : 'Категории';
    mainCategoriesButton.innerHTML = `
        <span>${buttonText}</span>
        <span style="margin-left: auto;">▼</span>
    `;
    console.log('🔄 Main categories button created with text:', buttonText);
    
    const mainCategoriesList = document.createElement('div');
    mainCategoriesList.className = 'category-dropdown-list';
    mainCategoriesList.style.display = 'none';
    // Убеждаемся, что список не скрыт через CSS
    mainCategoriesList.setAttribute('data-visible', 'false');
    
    // Опция "Все"
    const allOption = document.createElement('div');
    allOption.className = 'category-dropdown-item' + (selectedMainCategoryId === null ? ' active' : '');
    allOption.innerText = 'Все категории';
    allOption.onclick = () => {
        selectedMainCategoryId = null;
        selectedCategoryIds.clear();
        currentCategoryId = null;
        mainCategoriesList.style.display = 'none';
        renderCategories(categoriesHierarchy);
        applyFilters();
    };
    mainCategoriesList.appendChild(allOption);
    
    // Основные категории
    if (Array.isArray(categories)) {
        categories.forEach(mainCat => {
            const option = document.createElement('div');
            option.className = 'category-dropdown-item' + (selectedMainCategoryId === mainCat.id ? ' active' : '');
            option.innerText = mainCat.name;
            option.onclick = () => {
                selectedMainCategoryId = mainCat.id;
                // Если у категории есть подкатегории, выбираем все подкатегории
                if (mainCat.subcategories && mainCat.subcategories.length > 0) {
                    selectedCategoryIds.clear();
                    mainCat.subcategories.forEach(subCat => {
                        selectedCategoryIds.add(subCat.id);
                    });
                } else {
                    // Если нет подкатегорий, выбираем саму категорию
                    selectedCategoryIds.clear();
                    selectedCategoryIds.add(mainCat.id);
                }
                currentCategoryId = null;
                mainCategoriesList.style.display = 'none';
                renderCategories(categoriesHierarchy);
                applyFilters();
            };
            mainCategoriesList.appendChild(option);
        });
    }
    
    mainCategoriesButton.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isVisible = mainCategoriesList.style.display === 'block' || mainCategoriesList.style.display === '';
        const newDisplay = isVisible ? 'none' : 'block';
        
        // Закрываем все другие выпадающие списки
        if (newDisplay === 'block') {
            const allOtherLists = document.querySelectorAll('.category-dropdown-list');
            allOtherLists.forEach(list => {
                if (list !== mainCategoriesList) {
                    list.style.display = 'none';
                }
            });
            const allFilterDropdowns = document.querySelectorAll('.category-filter-dropdown');
            allFilterDropdowns.forEach(dropdown => {
                dropdown.style.display = 'none';
            });
            const allFilterButtons = document.querySelectorAll('.category-filter-button');
            allFilterButtons.forEach(btn => {
                btn.classList.remove('active');
            });
        }
        
        mainCategoriesList.style.display = newDisplay;
        console.log('🔄 Main categories dropdown toggled, display:', newDisplay, 'was visible:', isVisible);
    };
    
    mainCategoriesDropdown.appendChild(mainCategoriesButton);
    mainCategoriesDropdown.appendChild(mainCategoriesList);
    leftContainer.appendChild(mainCategoriesDropdown);
    
    // Второй выпадающий список - подкатегории (показывается только если выбрана основная категория с подкатегориями)
    if (selectedMainCategory && selectedMainCategory.subcategories && selectedMainCategory.subcategories.length > 0) {
        const subCategoriesDropdown = document.createElement('div');
        subCategoriesDropdown.className = 'category-dropdown';
        
        const subCategoriesButton = document.createElement('button');
        subCategoriesButton.className = 'category-dropdown-button';
        const selectedSubCount = Array.from(selectedCategoryIds).filter(id => 
            selectedMainCategory.subcategories.some(sub => sub.id === id)
        ).length;
        subCategoriesButton.innerHTML = `
            <span>Подкатегории</span>
            <span style="margin-left: auto;">▼</span>
        `;
        
        const subCategoriesList = document.createElement('div');
        subCategoriesList.className = 'category-dropdown-list';
        subCategoriesList.style.display = 'none';
        
        // Опция "Все подкатегории"
        const allSubOption = document.createElement('div');
        allSubOption.className = 'category-dropdown-item';
        allSubOption.innerText = 'Все подкатегории';
        allSubOption.onclick = () => {
            selectedCategoryIds.clear();
            selectedMainCategory.subcategories.forEach(subCat => {
                selectedCategoryIds.add(subCat.id);
            });
            subCategoriesList.style.display = 'none';
            renderCategories(categoriesHierarchy);
            applyFilters();
        };
        subCategoriesList.appendChild(allSubOption);
        
        // Подкатегории
        selectedMainCategory.subcategories.forEach(subCat => {
            const option = document.createElement('div');
            const isSelected = selectedCategoryIds.has(subCat.id);
            option.className = 'category-dropdown-item' + (isSelected ? ' active' : '');
            option.innerHTML = `
                <span>${subCat.name}</span>
                <input type="checkbox" ${isSelected ? 'checked' : ''} style="margin-left: auto;">
            `;
            option.onclick = () => {
                if (isSelected) {
                    selectedCategoryIds.delete(subCat.id);
                } else {
                    selectedCategoryIds.add(subCat.id);
                }
                renderCategories(categoriesHierarchy);
                applyFilters();
            };
            subCategoriesList.appendChild(option);
        });
        
        subCategoriesButton.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const isVisible = subCategoriesList.style.display === 'block' || subCategoriesList.style.display === '';
            const newDisplay = isVisible ? 'none' : 'block';
            
            // Закрываем все другие выпадающие списки
            if (newDisplay === 'block') {
                const allOtherLists = document.querySelectorAll('.category-dropdown-list');
                allOtherLists.forEach(list => {
                    if (list !== subCategoriesList) {
                        list.style.display = 'none';
                    }
                });
                const allFilterDropdowns = document.querySelectorAll('.category-filter-dropdown');
                allFilterDropdowns.forEach(dropdown => {
                    dropdown.style.display = 'none';
                });
                const allFilterButtons = document.querySelectorAll('.category-filter-button');
                allFilterButtons.forEach(btn => {
                    btn.classList.remove('active');
                });
            }
            
            subCategoriesList.style.display = newDisplay;
            console.log('🔄 Subcategories dropdown toggled, display:', newDisplay, 'was visible:', isVisible);
        };
        
        subCategoriesDropdown.appendChild(subCategoriesButton);
        subCategoriesDropdown.appendChild(subCategoriesList);
        leftContainer.appendChild(subCategoriesDropdown);
    }
    
    // Добавляем левый контейнер в основной контейнер
    dropdownsContainer.appendChild(leftContainer);
    
    // Добавляем кнопку фильтра со стрелками - ВСЕГДА показывается (независимо от подкатегорий)
    const filterButton = document.createElement('button');
    filterButton.className = 'category-filter-button';
    filterButton.type = 'button';
    filterButton.innerHTML = `↑↓`;
    filterButton.title = 'Фильтр';
    
    // Создаем выпадающий список фильтра
    const filterDropdown = document.createElement('div');
    filterDropdown.className = 'category-filter-dropdown';
    filterDropdown.style.display = 'none';
    filterDropdown.innerHTML = `
        <div class="filter-dropdown-content">
            <div class="filter-section">
                <div class="filter-section-title">Цена</div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="all" checked>
                        <span class="filter-radio-text">Все цены</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="low">
                        <span class="filter-radio-text">До 1000 ₽</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="medium">
                        <span class="filter-radio-text">1000 - 5000 ₽</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="high">
                        <span class="filter-radio-text">От 5000 ₽</span>
                    </label>
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-section-title">Статусы</div>
                <div class="filter-option" data-filter-option="in-stock">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="in-stock">
                        <span class="filter-checkbox-text">В наличии</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="hot-offer">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="hot-offer">
                        <span class="filter-checkbox-text">🔥 Горящие предложения</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="with-discount">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="with-discount">
                        <span class="filter-checkbox-text">Со скидкой</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="made-to-order">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="made-to-order">
                        <span class="filter-checkbox-text">Под заказ</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="new-items">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="new-items">
                        <span class="filter-checkbox-text">✨ Новинки</span>
                    </label>
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-section-title">Сортировка</div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="sort-filter" class="filter-radio" value="none" checked>
                        <span class="filter-radio-text">Без сортировки</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="sort-filter" class="filter-radio" value="price-asc">
                        <span class="filter-radio-text">По возрастанию цены</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="sort-filter" class="filter-radio" value="price-desc">
                        <span class="filter-radio-text">По убыванию цены</span>
                    </label>
                </div>
            </div>
            <div class="filter-actions">
                <button class="filter-reset-btn category-filter-reset">Сбросить</button>
            </div>
        </div>
    `;
    
    // Обработчик открытия/закрытия фильтра с автоматическим закрытием других выпадающих списков
    filterButton.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = filterDropdown.style.display === 'block';
        
        // Закрываем все другие выпадающие списки
        const allDropdownLists = document.querySelectorAll('.category-dropdown-list');
        allDropdownLists.forEach(list => {
            list.style.display = 'none';
        });
        const allDropdownButtons = document.querySelectorAll('.category-dropdown-button');
        allDropdownButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Обновляем опции фильтра при открытии
        if (!isOpen && allProducts.length > 0) {
            updateProductFilterOptions();
        }
        
        if (!isOpen) {
            // Открываем фильтр и рассчитываем позицию для fixed позиционирования
            filterDropdown.style.display = 'block';
            
            // Получаем позицию кнопки фильтра относительно viewport
            const buttonRect = filterButton.getBoundingClientRect();
            const dropdownHeight = 400; // max-height фильтра
            const viewportHeight = window.innerHeight;
            
            // Рассчитываем позицию: справа от кнопки, снизу от кнопки
            let top = buttonRect.bottom + 4; // margin-top: 4px
            let right = window.innerWidth - buttonRect.right;
            
            // Если фильтр не помещается снизу, показываем сверху
            if (top + dropdownHeight > viewportHeight && buttonRect.top > dropdownHeight) {
                top = buttonRect.top - dropdownHeight - 4;
            }
            
            // Устанавливаем позицию
            filterDropdown.style.top = `${top}px`;
            filterDropdown.style.right = `${right}px`;
            filterDropdown.style.left = 'auto';
            filterDropdown.style.bottom = 'auto';
        } else {
            filterDropdown.style.display = 'none';
        }
        
        filterButton.classList.toggle('active', !isOpen);
    };
    
    // Обработчики для фильтра
    const filterContainer = document.createElement('div');
    filterContainer.className = 'category-filter-container';
    filterContainer.style.position = 'relative';
    filterContainer.style.flexShrink = '0'; // Зафиксированная ширина, не сжимается
    filterContainer.appendChild(filterButton);
    filterContainer.appendChild(filterDropdown);
    
    // Функция для обновления позиции фильтра при скролле или изменении размера
    const updateFilterPosition = () => {
        if (filterDropdown.style.display === 'block') {
            const buttonRect = filterButton.getBoundingClientRect();
            const dropdownHeight = 400;
            const viewportHeight = window.innerHeight;
            
            let top = buttonRect.bottom + 4;
            let right = window.innerWidth - buttonRect.right;
            
            if (top + dropdownHeight > viewportHeight && buttonRect.top > dropdownHeight) {
                top = buttonRect.top - dropdownHeight - 4;
            }
            
            filterDropdown.style.top = `${top}px`;
            filterDropdown.style.right = `${right}px`;
        }
    };
    
    // Добавляем обработчики для обновления позиции
    window.addEventListener('scroll', updateFilterPosition, true);
    window.addEventListener('resize', updateFilterPosition);
    
    // Инициализируем обработчики фильтра после добавления в DOM
    setTimeout(() => {
        initCategoryFilterHandlers(filterDropdown);
        // Обновляем опции фильтра при открытии, если товары уже загружены
        if (allProducts.length > 0) {
            updateProductFilterOptions();
        }
    }, 0);
    
    // Добавляем фильтр в правую часть контейнера
    dropdownsContainer.appendChild(filterContainer);
    
    categoriesNav.appendChild(dropdownsContainer);
    console.log('✅ [RENDER] Categories rendered, dropdowns container added to DOM');
    console.log('✅ [RENDER] categoriesNav.innerHTML length:', categoriesNav.innerHTML.length);
    console.log('✅ [RENDER] categoriesNav children count:', categoriesNav.children.length);
    
    // Проверяем, что элементы действительно в DOM
    setTimeout(() => {
        const checkDropdowns = document.querySelectorAll('.category-dropdown');
        const checkButtons = document.querySelectorAll('.category-dropdown-button');
        const checkLists = document.querySelectorAll('.category-dropdown-list');
        console.log('✅ [RENDER CHECK] Found', checkDropdowns.length, 'dropdown elements in DOM');
        console.log('✅ [RENDER CHECK] Found', checkButtons.length, 'dropdown buttons in DOM');
        console.log('✅ [RENDER CHECK] Found', checkLists.length, 'dropdown lists in DOM');
        
        if (checkButtons.length > 0) {
            console.log('✅ [RENDER CHECK] First button text:', checkButtons[0].innerText);
            console.log('✅ [RENDER CHECK] First button onclick:', typeof checkButtons[0].onclick);
        }
    }, 100);
    
    // Закрываем выпадающие списки при клике вне их (только один раз)
    if (!window.categoryDropdownClickHandler) {
        window.categoryDropdownClickHandler = (e) => {
            const allDropdowns = document.querySelectorAll('.category-dropdown');
            allDropdowns.forEach(dropdown => {
                if (!dropdown.contains(e.target)) {
                    const list = dropdown.querySelector('.category-dropdown-list');
                    if (list) list.style.display = 'none';
                }
            });
            
            // Также закрываем фильтр при клике вне его
            const allFilterContainers = document.querySelectorAll('.category-filter-container');
            allFilterContainers.forEach(container => {
                if (!container.contains(e.target)) {
                    const filterDropdown = container.querySelector('.category-filter-dropdown');
                    const filterButton = container.querySelector('.category-filter-button');
                    if (filterDropdown) filterDropdown.style.display = 'none';
                    if (filterButton) filterButton.classList.remove('active');
                }
            });
        };
        document.addEventListener('click', window.categoryDropdownClickHandler);
        console.log('✅ [RENDER] Category dropdown click handler registered');
    }
}

// Рендеринг товаров
function renderProducts(products) {
    productsGrid.innerHTML = '';
    
    // Отладочный вывод - проверяем, что приходит с сервера
    console.log('[RENDER DEBUG] Products received:', products);
    if (products && products.length > 0) {
        console.log('[RENDER DEBUG] First product is_made_to_order:', products[0].is_made_to_order, 'type:', typeof products[0].is_made_to_order);
    }
    
    if (!products || products.length === 0) {
        if (appContext.role === 'client') {
            productsGrid.innerHTML = '<p class="loading">В этой витрине пока нет товаров.</p>';
        } else {
            productsGrid.innerHTML = '<p class="loading">Товаров пока нет. Используйте /manage в боте для добавления.</p>';
        }
        return;
    }

    products.forEach(prod => {
        // Получаем изображения - backend теперь возвращает полные HTTPS URL
        let imagesList = [];
        if (prod.images_urls && Array.isArray(prod.images_urls) && prod.images_urls.length > 0) {
            imagesList = prod.images_urls;
        } else if (prod.image_url) {
            imagesList = [prod.image_url];
        }
        
        // Backend возвращает полные HTTPS URL, но на всякий случай проверяем
        const fullImages = imagesList.map(imgUrl => {
            if (!imgUrl) return '';
            // Если уже полный URL - используем как есть
            if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
                return imgUrl;
            }
            // Если относительный путь - добавляем API_BASE
            if (imgUrl.startsWith('/')) {
                return API_BASE + imgUrl;
            }
            return API_BASE + '/' + imgUrl;
        }).filter(url => url !== '');
        
        const fullImg = fullImages.length > 0 ? fullImages[0] : '';
        
        // ДИАГНОСТИКА: Проверяем fullImg
        if (prod.id) {
            console.log(`[IMG DEBUG] Product ${prod.id} "${prod.name}":`);
            console.log(`[IMG DEBUG]   - imagesList length: ${imagesList.length}`);
            console.log(`[IMG DEBUG]   - fullImages length: ${fullImages.length}`);
            console.log(`[IMG DEBUG]   - fullImg: "${fullImg}"`);
            console.log(`[IMG DEBUG]   - fullImg type: ${typeof fullImg}`);
            console.log(`[IMG DEBUG]   - fullImg empty?: ${!fullImg}`);
        }
        
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Бейдж резервации будет добавлен в нижнюю часть фото
        let reservedBadge = null;
        if (prod.reservation) {
            card.style.opacity = '0.7';
            reservedBadge = document.createElement('div');
            reservedBadge.style.cssText = `
                position: absolute;
                bottom: 8px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 193, 7, 0.95);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                color: #1a1a1a;
                padding: 5px 10px;
                border-radius: 8px;
                font-size: 10px;
                font-weight: 700;
                z-index: 12;
                box-shadow: 0 2px 8px rgba(255, 193, 7, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.2);
                white-space: nowrap;
                max-width: calc(100% - 16px);
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            reservedBadge.textContent = '🔒 Резерв';
        }
        
        // Изображение
        const imageDiv = document.createElement('div');
        imageDiv.className = 'product-image';
        imageDiv.style.position = 'relative';
        imageDiv.style.overflow = 'hidden';
        imageDiv.style.aspectRatio = '3/4';
        
        // ДИАГНОСТИКА: Проверяем видимость imageDiv
        if (prod.id) {
            console.log(`[IMG DEBUG] Product ${prod.id}: imageDiv created, className="${imageDiv.className}"`);
        }
        
        // Создаем badge скидки ПЕРЕД добавлением изображения, чтобы он не удалился
        let discountBadge = null;
        if (prod.discount > 0) {
            discountBadge = document.createElement('div');
            discountBadge.className = 'discount-badge';
            discountBadge.textContent = `-${prod.discount}%`;
        }
        
        // Создаем badge горящего предложения
        let hotOfferBadge = null;
        if (prod.is_hot_offer) {
            hotOfferBadge = document.createElement('div');
            hotOfferBadge.className = 'hot-offer-badge';
            hotOfferBadge.innerHTML = '🔥';
            hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
        }
        
        // Создаем badge количества товара или "Под заказ"
        let quantityBadge = null;
        const shopSettings = getCurrentShopSettings();
        const globalQuantityEnabled = shopSettings ? (shopSettings.quantity_enabled !== false) : true;
        
        // Определяем, нужно ли показывать количество для этого товара
        // Сначала проверяем индивидуальную настройку товара, если она null - используем глобальную
        let quantityEnabled = globalQuantityEnabled;
        if (prod.quantity_show_enabled !== null && prod.quantity_show_enabled !== undefined) {
            quantityEnabled = prod.quantity_show_enabled === true || prod.quantity_show_enabled === 1 || prod.quantity_show_enabled === '1' || String(prod.quantity_show_enabled).toLowerCase() === 'true';
        }
        
        // Отладочный вывод
        if (prod.id) {
            console.log(`[BADGE DEBUG] Product ${prod.id} "${prod.name}":`, {
                is_made_to_order: prod.is_made_to_order,
                type: typeof prod.is_made_to_order,
                quantity: prod.quantity,
                quantity_show_enabled: prod.quantity_show_enabled,
                globalQuantityEnabled: globalQuantityEnabled,
                quantityEnabled: quantityEnabled,
                full_product: prod
            });
        }
        
        // Проверяем функцию "покупка" - приоритет выше, чем "под заказ" или количество
        const isForSale = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        // Если товар под заказ, показываем "Под заказ"
        // Преобразуем в boolean для надежности (может быть true, false, 1, 0, "true", "false", "1", "0")
        const isMadeToOrder = prod.is_made_to_order === true || 
                              prod.is_made_to_order === 1 || 
                              prod.is_made_to_order === '1' ||
                              prod.is_made_to_order === 'true' ||
                              String(prod.is_made_to_order).toLowerCase() === 'true';
        console.log(`[BADGE DEBUG] Product ${prod.id} isForSale check: raw=${prod.is_for_sale} (${typeof prod.is_for_sale}), converted=${isForSale}`);
        console.log(`[BADGE DEBUG] Product ${prod.id} isMadeToOrder check: raw=${prod.is_made_to_order} (${typeof prod.is_made_to_order}), converted=${isMadeToOrder}`);
        
        // Приоритет: 1) Покупка, 2) Под заказ, 3) Количество
        if (isForSale) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            // Формируем текст с количеством от и единицей измерения
            let badgeText = 'Покупка';
            const quantityFrom = prod.quantity_from !== null && prod.quantity_from !== undefined ? prod.quantity_from : null;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantityFrom !== null && quantityFrom !== undefined) {
                badgeText = `От ${quantityFrom} ${quantityUnit}`;
            } else {
                badgeText = 'Покупка';
            }
            quantityBadge.textContent = badgeText;
            quantityBadge.style.background = 'rgba(255, 149, 0, 0.95)'; // Оранжевый для покупки
            quantityBadge.style.color = '#ffffff';
        } else if (isMadeToOrder) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            quantityBadge.textContent = 'Под заказ';
            quantityBadge.style.background = 'rgba(90, 200, 250, 0.95)'; // Синий для под заказ
            quantityBadge.style.color = '#ffffff';
        } else if (prod.quantity !== undefined && prod.quantity !== null) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            const quantity = prod.quantity;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantity > 0) {
                // Проверяем активные резервации
                const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
                const availableCount = quantity - activeReservationsCount;
                
                // Если quantity_enabled включен, показываем количество с учетом резерваций
                if (quantityEnabled) {
                    if (activeReservationsCount > 0) {
                        // Если есть резервации, показываем "Доступно: X из Y единица"
                        quantityBadge.textContent = `Доступно: ${availableCount} из ${quantity} ${quantityUnit}`;
                    } else {
                        // Если резерваций нет, показываем просто "В наличии: Y единица"
                        quantityBadge.textContent = `В наличии: ${quantity} ${quantityUnit}`;
                    }
                } else {
                    // Если quantity_enabled выключен, показываем просто "В наличии"
                    quantityBadge.textContent = 'В наличии';
                }
                quantityBadge.style.background = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
                quantityBadge.style.color = '#ffffff';
            } else {
                quantityBadge.textContent = 'Нет в наличии';
                quantityBadge.style.background = 'rgba(255, 59, 48, 0.95)'; // Красный для отсутствия
                quantityBadge.style.color = '#ffffff';
            }
        } else if (!quantityEnabled) {
            // Если quantity_enabled выключен и quantity не указан, показываем просто "В наличии"
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            quantityBadge.textContent = 'В наличии';
            quantityBadge.style.background = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
            quantityBadge.style.color = '#ffffff';
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Добавляем imageDiv в card ПЕРЕД созданием img
        // Это гарантирует, что элемент будет в DOM когда мы установим src
        card.appendChild(imageDiv);
        
        // ДИАГНОСТИКА: Проверяем, что imageDiv в DOM
        if (prod.id) {
            console.log(`[IMG DEBUG] Product ${prod.id}: imageDiv added to card, in DOM: ${card.contains(imageDiv)}`);
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Добавляем card в productsGrid ПЕРЕД установкой img.src
        // Это гарантирует, что весь элемент будет в DOM когда мы установим src
        // Telegram WebView может не начать загрузку изображения, если элемент не в DOM
        productsGrid.appendChild(card);
        
        // ДИАГНОСТИКА: Проверяем, что card в DOM
        if (prod.id) {
            console.log(`[IMG DEBUG] Product ${prod.id}: card added to productsGrid, in DOM: ${productsGrid.contains(card)}`);
        }
        
        if (fullImg) {
            // Показываем placeholder во время загрузки
            imageDiv.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
            const loadingPlaceholder = document.createElement('div');
            loadingPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 24px;';
            loadingPlaceholder.textContent = '⏳';
            imageDiv.appendChild(loadingPlaceholder);
            
            // Добавляем badge скидки ПЕРЕД загрузкой (чтобы он был поверх)
            if (discountBadge) {
                discountBadge.style.zIndex = '10';
                discountBadge.style.position = 'absolute';
                imageDiv.appendChild(discountBadge);
            }
            
            // Добавляем badge горящего предложения (всегда справа)
            if (hotOfferBadge) {
                hotOfferBadge.style.zIndex = '11';
                hotOfferBadge.style.position = 'absolute';
                hotOfferBadge.style.top = '8px';
                hotOfferBadge.style.right = '8px';
                hotOfferBadge.style.left = 'auto';
                imageDiv.appendChild(hotOfferBadge);
            }
            
            // Добавляем badge резервации в нижней части фото
            if (reservedBadge) {
                imageDiv.appendChild(reservedBadge);
            }
            
            // Функция для показа ошибки
            const showError = () => {
                if (prod.id) {
                    console.error(`[IMG DEBUG] Product ${prod.id}: IMAGE LOAD ERROR`);
                }
                imageDiv.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
                const errorPlaceholder = document.createElement('div');
                errorPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 24px;';
                errorPlaceholder.textContent = '📷';
                imageDiv.innerHTML = '';
                imageDiv.appendChild(errorPlaceholder);
                if (discountBadge) {
                    imageDiv.appendChild(discountBadge);
                }
                if (hotOfferBadge) {
                    imageDiv.appendChild(hotOfferBadge);
                }
                if (reservedBadge) {
                    imageDiv.appendChild(reservedBadge);
                }
            };
            
            // Определяем, мобильное устройство или десктоп
            const isMobile = isMobileDevice();
            
            if (isMobile) {
                // На мобильных устройствах используем fetch + blob URL для обхода блокировки Telegram WebView
                // Telegram WebView может блокировать прямые запросы к ngrok доменам через <img src>
                // Но fetch запросы работают, поэтому мы загружаем через fetch и создаем blob URL
                fetch(fullImg, {
                    headers: {
                        'ngrok-skip-browser-warning': '69420'
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    // Создаем blob URL для обхода блокировки ngrok доменов
                    const blobUrl = URL.createObjectURL(blob);
                    
                    if (prod.id) {
                        console.log(`[IMG DEBUG] Product ${prod.id}: Image loaded via fetch, blob URL created (mobile)`);
                    }
                    
                    // Создаем img элемент и устанавливаем blob URL
                    const img = document.createElement('img');
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;';
                    img.alt = prod.name;
                    
                    img.onload = function() {
                        // Изображение загружено успешно
                        if (prod.id) {
                            console.log(`[IMG DEBUG] Product ${prod.id}: IMAGE LOADED SUCCESSFULLY via blob URL (mobile)`);
                        }
                        // Удаляем placeholder
                        if (loadingPlaceholder.parentNode) {
                            loadingPlaceholder.remove();
                        }
                    };
                    
                    img.onerror = function() {
                        // Ошибка загрузки изображения
                        if (prod.id) {
                            console.error(`[IMG DEBUG] Product ${prod.id}: IMAGE LOAD ERROR - blob URL failed (mobile)`);
                        }
                        URL.revokeObjectURL(blobUrl); // Освобождаем память
                        showError();
                    };
                    
                    // Заменяем placeholder на изображение
                    imageDiv.innerHTML = '';
                    imageDiv.appendChild(img);
                    if (discountBadge) {
                        imageDiv.appendChild(discountBadge);
                    }
                    if (hotOfferBadge) {
                        imageDiv.appendChild(hotOfferBadge);
                    }
                    if (reservedBadge) {
                        imageDiv.appendChild(reservedBadge);
                    }
                    
                    // Устанавливаем blob URL
                    img.src = blobUrl;
                })
                .catch(error => {
                    if (prod.id) {
                        console.error(`[IMG DEBUG] Product ${prod.id}: Fetch error (mobile):`, error);
                        console.error(`[IMG DEBUG] Product ${prod.id}: Failed URL: "${fullImg}"`);
                    }
                    showError();
                });
            } else {
                // На десктопе используем прямые URL (более надежно и быстрее)
                const img = document.createElement('img');
                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;';
                img.alt = prod.name;
                
                img.onload = function() {
                    // Изображение загружено успешно
                    if (prod.id) {
                        console.log(`[IMG DEBUG] Product ${prod.id}: IMAGE LOADED SUCCESSFULLY via direct URL (desktop)`);
                    }
                    // Удаляем placeholder
                    if (loadingPlaceholder.parentNode) {
                        loadingPlaceholder.remove();
                    }
                };
                
                img.onerror = function() {
                    // Ошибка загрузки изображения - пробуем через fetch как fallback
                    if (prod.id) {
                        console.warn(`[IMG DEBUG] Product ${prod.id}: Direct URL failed, trying fetch fallback (desktop)`);
                    }
                    // Fallback: пробуем через fetch
                    fetch(fullImg, {
                        headers: {
                            'ngrok-skip-browser-warning': '69420'
                        }
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const blobUrl = URL.createObjectURL(blob);
                        img.src = blobUrl;
                        if (prod.id) {
                            console.log(`[IMG DEBUG] Product ${prod.id}: Image loaded via fetch fallback (desktop)`);
                        }
                    })
                    .catch(error => {
                        if (prod.id) {
                            console.error(`[IMG DEBUG] Product ${prod.id}: Fetch fallback also failed:`, error);
                        }
                        showError();
                    });
                };
                
                // Заменяем placeholder на изображение
                imageDiv.innerHTML = '';
                imageDiv.appendChild(img);
                if (discountBadge) {
                    imageDiv.appendChild(discountBadge);
                }
                if (hotOfferBadge) {
                    imageDiv.appendChild(hotOfferBadge);
                }
                if (reservedBadge) {
                    imageDiv.appendChild(reservedBadge);
                }
                
                // Устанавливаем прямой URL
                img.src = fullImg;
            }
        } else {
            // ДИАГНОСТИКА: fullImg пустой
            if (prod.id) {
                console.warn(`[IMG DEBUG] Product ${prod.id}: fullImg is EMPTY - showing placeholder`);
            }
            imageDiv.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 24px;';
            placeholder.textContent = '📷';
            imageDiv.appendChild(placeholder);
            
            // Добавляем badge скидки даже если нет изображения
            if (discountBadge) {
                imageDiv.appendChild(discountBadge);
            }
            
            // Добавляем badge горящего предложения даже если нет изображения (всегда справа)
            if (hotOfferBadge) {
                hotOfferBadge.style.zIndex = '11';
                hotOfferBadge.style.position = 'absolute';
                hotOfferBadge.style.top = '8px';
                hotOfferBadge.style.right = '8px';
                hotOfferBadge.style.left = 'auto';
                imageDiv.appendChild(hotOfferBadge);
            }
            
            // Добавляем badge резервации в нижней части фото даже если нет изображения
            if (reservedBadge) {
                imageDiv.appendChild(reservedBadge);
            }
        }
        
        // Название
        const nameDiv = document.createElement('div');
        nameDiv.className = 'product-name';
        nameDiv.textContent = prod.name;
        
        // Цена - определяем что показывать
        const priceContainer = document.createElement('div');
        priceContainer.className = 'product-price-container';
        const priceSpan = document.createElement('span');
        priceSpan.className = 'product-price';
        
        const isForSaleCard = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        if (isForSaleCard) {
            // Если включена функция покупка, показываем цену покупки
            const priceType = prod.price_type || 'range';
            if (priceType === 'fixed' && prod.price_fixed !== null && prod.price_fixed !== undefined) {
                priceSpan.textContent = `${prod.price_fixed} ₽`;
            } else if (priceType === 'range') {
                const priceFrom = prod.price_from !== null && prod.price_from !== undefined ? prod.price_from : '';
                const priceTo = prod.price_to !== null && prod.price_to !== undefined ? prod.price_to : '';
                if (priceFrom && priceTo) {
                    priceSpan.textContent = `${priceFrom} - ${priceTo} ₽`;
                } else if (priceFrom) {
                    priceSpan.textContent = `от ${priceFrom} ₽`;
                } else if (priceTo) {
                    priceSpan.textContent = `до ${priceTo} ₽`;
                } else {
                    priceSpan.textContent = 'Цена по запросу';
                }
            } else {
                priceSpan.textContent = 'Цена по запросу';
            }
        } else {
            // Обычная цена со скидкой
            const finalPrice = prod.discount > 0 ? Math.round(prod.price * (1 - prod.discount / 100)) : prod.price;
            priceSpan.textContent = `${finalPrice} ₽`;
            
            // Старая цена при скидке
            if (prod.discount > 0) {
                const oldPriceSpan = document.createElement('span');
                oldPriceSpan.className = 'old-price';
                oldPriceSpan.textContent = `${prod.price} ₽`;
                priceContainer.appendChild(oldPriceSpan);
            }
        }
        
        priceContainer.appendChild(priceSpan);
        card.appendChild(nameDiv);
        card.appendChild(priceContainer);
        
        // Количество товара под ценой
        if (quantityBadge) {
            // Убираем абсолютное позиционирование, так как теперь это обычный блок
            quantityBadge.style.position = 'static';
            quantityBadge.style.zIndex = 'auto';
            quantityBadge.style.bottom = 'auto';
            quantityBadge.style.right = 'auto';
            quantityBadge.style.left = 'auto';
            card.appendChild(quantityBadge);
        }
        
        card.onclick = () => showProductModal(prod, null, fullImages);
        
        // card уже добавлен в DOM выше (перед установкой img.src)
    });
}

// Показ модального окна товара
function showProductModal(prod, finalPrice, fullImages) {
    console.log(`[MODAL] showProductModal called: productId=${prod.id}, productName="${prod.name}", fullImages.length=${fullImages ? fullImages.length : 0}`);
    
    // Сбрасываем ID загрузки при открытии нового товара
    currentImageLoadId = 0;
    
    currentProduct = prod;
    currentImages = fullImages || [];
    currentImageIndex = 0;
    
    console.log(`[MODAL] State updated: currentImages.length=${currentImages.length}, currentImageLoadId=${currentImageLoadId}`);
    
    // Отслеживаем просмотр конкретного товара (только для клиентов, не для владельца)
    if (appContext && appContext.role === 'client' && appContext.shop_owner_id) {
        trackShopVisit(appContext.shop_owner_id, prod.id).catch(err => {
            console.warn('Failed to track product view:', err);
        });
    }
    
    // Управление горящим предложением (только для владельца) - сразу после фото
    const modalHotOfferControl = document.getElementById('modal-hot-offer-control');
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        modalHotOfferControl.style.display = 'block';
        modalHotOfferControl.innerHTML = '';
        
        const hotOfferContainer = document.createElement('div');
        hotOfferContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-glass); backdrop-filter: blur(10px); border-radius: 12px; margin: 12px 0;';
        
        const hotOfferLabel = document.createElement('div');
        hotOfferLabel.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        hotOfferLabel.innerHTML = '<span style="font-size: 20px;">🔥</span><span style="font-weight: 600;">Горящее предложение</span>';
        
        const hotOfferToggle = document.createElement('label');
        hotOfferToggle.className = 'toggle-switch';
        hotOfferToggle.style.cssText = 'margin: 0;';
        
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = prod.is_hot_offer || false;
        toggleInput.onchange = async (e) => {
            const isHotOffer = e.target.checked;
            try {
                await toggleHotOffer(prod.id, appContext.shop_owner_id, isHotOffer);
                prod.is_hot_offer = isHotOffer;
                // Обновляем визуальное отображение на карточках
                setTimeout(() => {
                    loadData();
                }, 300);
            } catch (error) {
                console.error('Error toggling hot offer:', error);
                alert('Ошибка при изменении статуса: ' + error.message);
                toggleInput.checked = !isHotOffer; // Возвращаем предыдущее значение
            }
        };
        
        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'toggle-slider';
        
        hotOfferToggle.appendChild(toggleInput);
        hotOfferToggle.appendChild(toggleSlider);
        
        hotOfferContainer.appendChild(hotOfferLabel);
        hotOfferContainer.appendChild(hotOfferToggle);
        modalHotOfferControl.appendChild(hotOfferContainer);
    } else {
        modalHotOfferControl.style.display = 'none';
    }
    
    // Кнопки управления товаром (только для владельца)
    const modalEditControl = document.getElementById('modal-edit-control');
    if (!modalEditControl) {
        // Создаем контейнер для кнопок управления, если его еще нет
        const editControlDiv = document.createElement('div');
        editControlDiv.id = 'modal-edit-control';
        editControlDiv.style.cssText = 'margin: 12px 0; display: flex; flex-direction: column; gap: 6px;';
        const modalContent = document.querySelector('#product-modal .modal-content');
        const modalName = document.getElementById('modal-name');
        modalContent.insertBefore(editControlDiv, modalName);
    }
    
    const editControl = document.getElementById('modal-edit-control');
    editControl.innerHTML = '';
    
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        // Кнопка редактирования
        const editBtn = document.createElement('button');
        editBtn.className = 'reserve-btn btn-edit';
        editBtn.textContent = '✏️ Редактировать';
        editBtn.onclick = () => showEditProductModal(prod);
        editControl.appendChild(editBtn);
        
        // Кнопка "Продан"
        const soldBtn = document.createElement('button');
        soldBtn.className = 'reserve-btn btn-sold';
        soldBtn.textContent = '✅ Продан';
        soldBtn.onclick = () => markAsSold(prod.id, prod);
        editControl.appendChild(soldBtn);
        
        // Кнопка "Удалить"
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'reserve-btn btn-delete';
        deleteBtn.textContent = '🗑️ Удалить';
        deleteBtn.onclick = () => deleteProduct(prod.id);
        editControl.appendChild(deleteBtn);
        
        editControl.style.display = 'flex';
    } else {
        editControl.style.display = 'none';
    }
    
    document.getElementById('modal-name').textContent = prod.name;
    
    const modalDescription = document.getElementById('modal-description');
    if (prod.description) {
        modalDescription.textContent = prod.description;
        modalDescription.style.display = 'block';
    } else {
        modalDescription.style.display = 'none';
    }
    
    const modalPriceContainer = document.getElementById('modal-price-container');
    modalPriceContainer.innerHTML = '';
    const priceSpan = document.createElement('span');
    priceSpan.className = 'product-price';
    
        // Определяем цену для отображения в модальном окне
        const isForSaleModal = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        if (isForSaleModal) {
        // Если включена функция покупка, показываем цену покупки
        const priceType = prod.price_type || 'range';
        if (priceType === 'fixed' && prod.price_fixed !== null && prod.price_fixed !== undefined) {
            priceSpan.textContent = `${prod.price_fixed} ₽`;
        } else if (priceType === 'range') {
            const priceFrom = prod.price_from !== null && prod.price_from !== undefined ? prod.price_from : '';
            const priceTo = prod.price_to !== null && prod.price_to !== undefined ? prod.price_to : '';
            if (priceFrom && priceTo) {
                priceSpan.textContent = `${priceFrom} - ${priceTo} ₽`;
            } else if (priceFrom) {
                priceSpan.textContent = `от ${priceFrom} ₽`;
            } else if (priceTo) {
                priceSpan.textContent = `до ${priceTo} ₽`;
            } else {
                priceSpan.textContent = 'Цена по запросу';
            }
        } else {
            priceSpan.textContent = 'Цена по запросу';
        }
    } else {
        // Обычная цена со скидкой
        const finalPrice = prod.discount > 0 ? Math.round(prod.price * (1 - prod.discount / 100)) : prod.price;
        priceSpan.textContent = `${finalPrice} ₽`;
        
        // Старая цена при скидке
        if (prod.discount > 0) {
            const oldPriceSpan = document.createElement('span');
            oldPriceSpan.className = 'old-price';
            oldPriceSpan.textContent = `${prod.price} ₽`;
            modalPriceContainer.appendChild(oldPriceSpan);
        }
    }
    
    modalPriceContainer.appendChild(priceSpan);
    
    // Количество товара в модальном окне
    const modalQuantityDiv = document.getElementById('modal-quantity');
    if (modalQuantityDiv) {
        const shopSettingsForModal = getCurrentShopSettings();
        const globalQuantityEnabled = shopSettingsForModal ? (shopSettingsForModal.quantity_enabled !== false) : true;
        
        // Определяем, какую настройку использовать: индивидуальную или общую
        // Если quantity_show_enabled === null или undefined, используем общую настройку
        // Иначе используем индивидуальную настройку
        let quantityEnabledForModal;
        if (prod.quantity_show_enabled === null || prod.quantity_show_enabled === undefined) {
            quantityEnabledForModal = globalQuantityEnabled;
        } else {
            quantityEnabledForModal = prod.quantity_show_enabled === true || prod.quantity_show_enabled === 1 || prod.quantity_show_enabled === 'true' || prod.quantity_show_enabled === '1';
        }
        
        // Проверяем функцию "покупка" - приоритет выше, чем "под заказ" или количество
        const isForSale = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        // Если товар под заказ, показываем "Под заказ"
        // Преобразуем в boolean для надежности (может быть true, false, 1, 0, "true", "false", "1", "0")
        const isMadeToOrder = prod.is_made_to_order === true || 
                              prod.is_made_to_order === 1 || 
                              prod.is_made_to_order === '1' ||
                              prod.is_made_to_order === 'true' ||
                              String(prod.is_made_to_order).toLowerCase() === 'true';
        console.log(`[MODAL DEBUG] Product ${prod.id} isForSale check: raw=${prod.is_for_sale} (${typeof prod.is_for_sale}), converted=${isForSale}`);
        console.log(`[MODAL DEBUG] Product ${prod.id} isMadeToOrder check: raw=${prod.is_made_to_order} (${typeof prod.is_made_to_order}), converted=${isMadeToOrder}`);
        
        // Приоритет: 1) Покупка, 2) Под заказ, 3) Количество
        if (isForSale) {
            modalQuantityDiv.style.display = 'block';
            // Формируем текст с количеством от и единицей измерения
            const quantityFrom = prod.quantity_from !== null && prod.quantity_from !== undefined ? prod.quantity_from : null;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantityFrom !== null && quantityFrom !== undefined) {
                modalQuantityDiv.textContent = `🛒 От ${quantityFrom} ${quantityUnit}`;
            } else {
                modalQuantityDiv.textContent = '🛒 Покупка';
            }
        } else if (isMadeToOrder) {
            modalQuantityDiv.style.display = 'block';
            modalQuantityDiv.textContent = '📦 Под заказ';
        } else if (prod.quantity !== undefined && prod.quantity !== null) {
            modalQuantityDiv.style.display = 'block';
            // Получаем единицу измерения
            const quantityUnit = prod.quantity_unit || 'шт';
            // Проверяем активные резервации
            const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
            const availableCount = prod.quantity - activeReservationsCount;
            
            // Если quantity_enabled включен, показываем количество с учетом резерваций
            if (quantityEnabledForModal) {
                if (activeReservationsCount > 0) {
                    // Если есть резервации, показываем "Доступно: X из Y единица"
                    modalQuantityDiv.textContent = `📦 Доступно: ${availableCount} из ${prod.quantity} ${quantityUnit}`;
                } else {
                    // Если резерваций нет, показываем просто "В наличии: Y единица"
                    modalQuantityDiv.textContent = `📦 В наличии: ${prod.quantity} ${quantityUnit}`;
                }
            } else {
                // Если quantity_enabled выключен, показываем просто "В наличии"
                modalQuantityDiv.textContent = '📦 В наличии';
            }
        } else if (!quantityEnabledForModal) {
            // Если quantity_enabled выключен и quantity не указан, показываем просто "В наличии"
            modalQuantityDiv.style.display = 'block';
            modalQuantityDiv.textContent = '📦 В наличии';
        } else {
            modalQuantityDiv.style.display = 'none';
        }
    }
    
    // Резервация (только если quantity_enabled включен)
    const modalReservationButton = document.getElementById('modal-reservation-button');
    const modalReservationStatus = document.getElementById('modal-reservation-status');
    modalReservationButton.innerHTML = '';
    modalReservationStatus.style.display = 'none';
    
    // Проверяем, включено ли количество товаров (и соответственно резервация)
    const shopSettingsForReservation = getCurrentShopSettings();
    const globalQuantityEnabledForReservation = shopSettingsForReservation ? (shopSettingsForReservation.quantity_enabled !== false) : true;
    
    // Определяем, какую настройку использовать для резервации: индивидуальную или общую
    let quantityEnabledForReservation;
    if (prod.quantity_show_enabled === null || prod.quantity_show_enabled === undefined) {
        quantityEnabledForReservation = globalQuantityEnabledForReservation;
    } else {
        quantityEnabledForReservation = prod.quantity_show_enabled === true || prod.quantity_show_enabled === 1 || prod.quantity_show_enabled === 'true' || prod.quantity_show_enabled === '1';
    }
    
    // Используем контекст для определения прав (backend уже проверил все)
    const hasActiveReservation = prod.reservation && prod.reservation.reserved_until;
    const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
    const productQuantity = prod.quantity !== undefined && prod.quantity !== null ? prod.quantity : 0;
    
    // Проверяем, можно ли еще резервировать товар (для товаров с quantity > 1)
    const canStillReserve = productQuantity > 0 && activeReservationsCount < productQuantity;
    
    // Показываем информацию о резервации (всегда, если есть резервация)
    if (hasActiveReservation) {
        // Backend уже вернул только активные резервации, просто показываем время
        // Backend возвращает время в UTC через isoformat()
        // Парсим время правильно (если нет Z в конце, добавляем его для UTC)
        let reservedUntilStr = prod.reservation.reserved_until;
        if (reservedUntilStr && !reservedUntilStr.endsWith('Z') && !reservedUntilStr.includes('+') && !reservedUntilStr.includes('-', 10)) {
            // Если время без указания часового пояса, считаем его UTC
            reservedUntilStr = reservedUntilStr + 'Z';
        }
        const reservedUntil = new Date(reservedUntilStr);
        const now = new Date();
        const diffMs = reservedUntil.getTime() - now.getTime();
        
        let timeText = '';
        
        // Проверяем, что время еще не истекло
        if (diffMs <= 0) {
            timeText = 'Резервация истекла';
        } else {
            // Вычисляем точное оставшееся время
            const totalSeconds = Math.floor(diffMs / 1000);
            const totalMinutes = Math.floor(totalSeconds / 60);
            const hoursLeft = Math.floor(totalMinutes / 60);
            const minutesLeft = totalMinutes % 60;
            
            // Показываем точное время до истечения резервации
            if (hoursLeft >= 1) {
                // Если есть минуты, показываем их тоже
                if (minutesLeft > 0) {
                    timeText = `${hoursLeft} ч. ${minutesLeft} мин.`;
                } else {
                    timeText = `${hoursLeft} ч.`;
                }
            } else if (totalMinutes > 0) {
                // Если меньше часа, показываем минуты
                timeText = `${totalMinutes} мин.`;
            } else {
                timeText = 'менее минуты';
            }
        }
        
        modalReservationStatus.style.display = 'block';
        
        // Показываем информацию о резервации с учетом количества (только если quantity_enabled включен)
        if (quantityEnabledForReservation && productQuantity > 1 && activeReservationsCount > 0) {
            const availableCount = productQuantity - activeReservationsCount;
            const quantityUnit = prod.quantity_unit || 'шт';
            modalReservationStatus.textContent = `⏰ Зарезервировано: ${activeReservationsCount} из ${productQuantity} ${quantityUnit} (доступно: ${availableCount} ${quantityUnit}) до ${timeText}`;
        } else {
            modalReservationStatus.textContent = `⏰ Товар зарезервирован на ${timeText}`;
        }
        
        // Проверяем права на отмену через контекст
        const isProductOwner = appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id;
        const isReserver = appContext.viewer_id === prod.reservation.reserved_by_user_id;
        const canCancel = isProductOwner || isReserver;
        
        if (canCancel) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'reserve-btn cancel-reservation-btn';
            cancelBtn.textContent = '❌ Снять резерв';
            cancelBtn.onclick = () => cancelReservation(prod.reservation.id, prod.id);
            modalReservationButton.appendChild(cancelBtn);
        }
    }
    
    // Показываем кнопку резервации только если:
    // 1. Это не наш магазин (клиент)
    // 2. Нет активной резервации ИЛИ можно еще резервировать (для товаров с quantity > 1)
    // 3. Резервация включена в настройках магазина
    // 4. Количество товаров включено (quantity_enabled)
    const shopSettings = getCurrentShopSettings();
    const quantityEnabled = shopSettings ? (shopSettings.quantity_enabled !== false) : true;
    const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true; // По умолчанию включено
    
    // Проверяем, не является ли товар под заказ
    // Преобразуем в boolean для надежности (может быть true, false, 1, 0, "true", "false", "1", "0")
    const isMadeToOrder = prod.is_made_to_order === true || 
                          prod.is_made_to_order === 1 || 
                          prod.is_made_to_order === '1' ||
                          prod.is_made_to_order === 'true' ||
                          String(prod.is_made_to_order).toLowerCase() === 'true';
    
    console.log('🔒 Reservation check:', {
        hasActiveReservation,
        activeReservationsCount,
        productQuantity,
        canStillReserve,
        role: appContext.role,
        can_reserve: appContext.permissions.can_reserve,
        reservationsEnabled,
        quantityEnabled,
        is_made_to_order: prod.is_made_to_order,
        isMadeToOrder: isMadeToOrder
    });
    
    // Проверяем, является ли товар для покупки (is_for_sale)
    const isForSale = prod.is_for_sale === true || 
                     prod.is_for_sale === 1 || 
                     prod.is_for_sale === '1' ||
                     prod.is_for_sale === 'true' ||
                     String(prod.is_for_sale).toLowerCase() === 'true';
    
    // Для товаров с is_for_sale показываем кнопку "Продать" вместо резервации/заказа
    if (isForSale && appContext.role === 'client') {
        const sellBtn = document.createElement('button');
        sellBtn.className = 'reserve-btn';
        sellBtn.style.background = 'rgba(255, 149, 0, 0.95)';
        sellBtn.textContent = '🛒 Продать';
        sellBtn.onclick = () => showPurchaseModal(prod);
        modalReservationButton.appendChild(sellBtn);
    } else {
        // Показываем кнопку резервации, если:
        // - Нет активной резервации ИЛИ
        // - Есть активная резервация, но можно еще резервировать (quantity > active_count) - только если quantity_enabled включен
        // - И резервация включена
        // - И товар НЕ под заказ (товары под заказ нельзя резервировать)
        // ВАЖНО: Если quantity_enabled = false, резервация работает, но без показа количества
        const shouldShowReserveButton = appContext.role === 'client' && 
                                         appContext.permissions.can_reserve && 
                                         reservationsEnabled &&
                                         !isMadeToOrder && // Товары под заказ нельзя резервировать
                                         (quantityEnabled ? (!hasActiveReservation || canStillReserve) : !hasActiveReservation); // Если quantity_enabled выключен, просто проверяем отсутствие резервации
        
        if (shouldShowReserveButton) {
            const reserveBtn = document.createElement('button');
            reserveBtn.className = 'reserve-btn';
            reserveBtn.textContent = '🔒 Зарезервировать';
            reserveBtn.onclick = () => showReservationModal(prod.id);
            modalReservationButton.appendChild(reserveBtn);
        } else if (!reservationsEnabled) {
            console.log('🔒 Reservations disabled - button not shown');
        }
        
        // Показываем кнопку "Заказать" для товаров под заказ (только для клиентов)
        if (isMadeToOrder && appContext.role === 'client') {
            const orderBtn = document.createElement('button');
            orderBtn.className = 'reserve-btn';
            orderBtn.style.background = 'rgba(90, 200, 250, 0.95)';
            orderBtn.textContent = '🛒 Заказать';
            orderBtn.onclick = () => showOrderModal(prod.id);
            modalReservationButton.appendChild(orderBtn);
        }
    }
    
    showModalImage(0);
    modal.style.display = 'block';
}

// Показ модального окна резервации
function showReservationModal(productId) {
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    // Находим товар в текущем списке (используем allProducts или currentProduct)
    let product = currentProduct; // Сначала пробуем текущий товар из модального окна
    if (!product || product.id !== productId) {
        // Если не совпадает, ищем в allProducts
        product = allProducts.find(p => p.id === productId);
    }
    if (!product) {
        console.error('❌ Product not found:', productId, 'allProducts length:', allProducts.length);
        alert('❌ Ошибка: товар не найден');
        return;
    }
    
    const productQuantity = product.quantity || 0;
    console.log('🔒 showReservationModal:', { productId, productQuantity, productName: product.name });
    
    // Проверяем, включен ли показ количества в настройках
    const shopSettings = getCurrentShopSettings();
    const quantityEnabled = shopSettings ? (shopSettings.quantity_enabled !== false) : true;
    console.log('🔒 quantityEnabled from settings:', quantityEnabled);
    
    const quantityContainer = document.getElementById('reservation-quantity-container');
    const quantityInput = document.getElementById('reservation-quantity');
    const quantityInfo = document.getElementById('reservation-quantity-info');
    
    if (!quantityContainer || !quantityInput || !quantityInfo) {
        console.error('❌ Reservation modal elements not found!', { quantityContainer, quantityInput, quantityInfo });
        alert('❌ Ошибка: элементы модального окна не найдены');
        return;
    }
    
    // Показываем выбор количества только если quantity_enabled включен И quantity > 1
    if (quantityEnabled && productQuantity > 1) {
        console.log('🔒 Showing quantity selector for product with quantity:', productQuantity);
        quantityContainer.style.display = 'block';
        quantityInput.max = productQuantity;
        quantityInput.value = 1;
        
        // Показываем информацию о доступном количестве
        const activeReservationsCount = product.reservation ? 1 : 0;
        const availableCount = productQuantity - activeReservationsCount;
        const quantityUnit = product.quantity_unit || 'шт';
        quantityInfo.textContent = `Доступно для резервации: ${availableCount} из ${productQuantity} ${quantityUnit}`;
        
        // Обновляем max при изменении
        quantityInput.oninput = () => {
            const value = parseInt(quantityInput.value) || 1;
            if (value > availableCount) {
                quantityInput.value = availableCount;
            }
            if (value < 1) {
                quantityInput.value = 1;
            }
        };
    } else {
        // Если quantity_enabled выключен ИЛИ quantity = 1 или null/undefined, скрываем выбор количества
        console.log('🔒 Hiding quantity selector (quantity_enabled=false or quantity <= 1 or null)');
        quantityContainer.style.display = 'none';
    }
    
    if (!reservationModal) {
        console.error('❌ Reservation modal not found!');
        alert('❌ Ошибка: модальное окно резервации не найдено');
        return;
    }
    
    console.log('🔒 Opening reservation modal');
    reservationModal.style.display = 'block';
    
    // Убеждаемся, что обработчики событий устанавливаются заново каждый раз
    const options = document.querySelectorAll('.reservation-option');
    console.log('🔒 Found reservation options:', options.length);
    
    if (options.length === 0) {
        console.error('❌ No reservation options found!');
        alert('❌ Ошибка: кнопки выбора времени не найдены');
        return;
    }
    
    options.forEach((option, index) => {
        // Удаляем старые обработчики
        const newOption = option.cloneNode(true);
        option.parentNode.replaceChild(newOption, option);
        
        newOption.onclick = async () => {
            const hours = parseInt(newOption.dataset.hours);
            let quantity = 1;
            
            console.log('🔒 Reservation option clicked:', { hours, productQuantity, quantityEnabled, containerDisplay: quantityContainer ? quantityContainer.style.display : 'not found' });
            
            // Если показывается выбор количества (quantity_enabled включен И quantity > 1), берем значение из input
            if (quantityEnabled && productQuantity > 1 && quantityContainer && quantityContainer.style.display !== 'none') {
                quantity = parseInt(quantityInput.value) || 1;
                const activeReservationsCount = product.reservation ? 1 : 0;
                const availableCount = Math.max(0, productQuantity - activeReservationsCount);
                const quantityUnit = product.quantity_unit || 'шт';
                console.log('🔒 Quantity check:', { quantity, availableCount, productQuantity, activeReservationsCount });
                if (quantity > availableCount) {
                    alert(`❌ Недостаточно товара. Доступно для резервации: ${availableCount} ${quantityUnit}`);
                    return;
                }
                if (quantity < 1) {
                    alert('❌ Количество должно быть не менее 1');
                    return;
                }
            } else {
                console.log('🔒 Using default quantity=1 (quantity selector not shown or quantity <= 1)');
            }
            
            console.log('🔒 Creating reservation with:', { productId, hours, quantity });
            reservationModal.style.display = 'none';
            await createReservation(productId, hours, quantity);
        };
    });
    
    console.log('🔒 Reservation modal setup complete');
}

// Текущий товар для заказа
let currentOrderProduct = null;

// Показ модального окна заказа
function showOrderModal(productId) {
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    if (!orderModal) {
        alert('❌ Ошибка: модальное окно заказа не найдено');
        return;
    }
    
    // Находим товар
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        alert('❌ Товар не найден');
        return;
    }
    
    currentOrderProduct = product;
    
    // Сбрасываем форму
    resetOrderForm();
    
    // Показываем информацию о товаре
    updateOrderProductSummary(product);
    
    // Показываем первый шаг
    showOrderStep(1);
    
    // Устанавливаем обработчики
    setupOrderFormHandlers(productId);
    
    orderModal.style.display = 'block';
}

// Сброс формы заказа
function resetOrderForm() {
    document.getElementById('order-promo-code').value = '';
    document.getElementById('order-quantity').value = 1;
    document.getElementById('order-first-name').value = '';
    document.getElementById('order-last-name').value = '';
    document.getElementById('order-middle-name').value = '';
    document.getElementById('order-phone-country-code').value = '+7';
    document.getElementById('order-phone-number').value = '';
    document.getElementById('order-email').value = '';
    document.getElementById('order-notes').value = '';
    document.querySelector('input[name="delivery-method"][value="delivery"]').checked = true;
}

// Обновление информации о товаре в форме
function updateOrderProductSummary(product) {
    const summaryDiv = document.getElementById('order-product-summary');
    const totalDiv = document.getElementById('order-total');
    
    if (!summaryDiv || !totalDiv) return;
    
    const finalPrice = product.discount > 0 
        ? Math.round(product.price * (1 - product.discount / 100)) 
        : product.price;
    
    summaryDiv.innerHTML = `
        <h3>${product.name}</h3>
        <div class="product-price">${finalPrice} ₽</div>
    `;
    
    // Обновляем итого при изменении количества
    const quantityInput = document.getElementById('order-quantity');
    const updateTotal = () => {
        const quantity = parseInt(quantityInput.value) || 1;
        const total = finalPrice * quantity;
        totalDiv.textContent = `Итого: ${total} ₽`;
    };
    
    quantityInput.oninput = updateTotal;
    updateTotal();
}

// Показ шага формы заказа
function showOrderStep(step) {
    // Скрываем все шаги
    for (let i = 1; i <= 3; i++) {
        const stepDiv = document.getElementById(`order-step-${i}`);
        if (stepDiv) {
            stepDiv.classList.remove('active');
        }
    }
    
    // Показываем нужный шаг
    const stepDiv = document.getElementById(`order-step-${step}`);
    if (stepDiv) {
        stepDiv.classList.add('active');
    }
}

// Настройка обработчиков формы заказа
function setupOrderFormHandlers(productId) {
    // Шаг 1: Продолжить
    const step1Next = document.getElementById('order-step-1-next');
    if (step1Next) {
        step1Next.onclick = () => {
            const quantity = parseInt(document.getElementById('order-quantity').value) || 1;
            if (quantity < 1) {
                alert('❌ Количество должно быть не менее 1');
                return;
            }
            showOrderStep(2);
        };
    }
    
    // Шаг 2: Назад
    const step2Back = document.getElementById('order-step-2-back');
    if (step2Back) {
        step2Back.onclick = () => showOrderStep(1);
    }
    
    // Шаг 2: Продолжить
    const step2Next = document.getElementById('order-step-2-next');
    if (step2Next) {
        step2Next.onclick = () => {
            const firstName = document.getElementById('order-first-name').value.trim();
            const lastName = document.getElementById('order-last-name').value.trim();
            const phoneNumber = document.getElementById('order-phone-number').value.trim();
            
            if (!firstName) {
                alert('❌ Пожалуйста, введите имя');
                return;
            }
            if (!lastName) {
                alert('❌ Пожалуйста, введите фамилию');
                return;
            }
            if (!phoneNumber) {
                alert('❌ Пожалуйста, введите номер телефона');
                return;
            }
            
            showOrderStep(3);
        };
    }
    
    // Шаг 3: Назад
    const step3Back = document.getElementById('order-step-3-back');
    if (step3Back) {
        step3Back.onclick = () => showOrderStep(2);
    }
    
    // Шаг 3: Оформить заказ
    const step3Submit = document.getElementById('order-step-3-submit');
    if (step3Submit) {
        step3Submit.onclick = async () => {
            await submitOrder(productId);
        };
    }
}

// Отправка заказа
async function submitOrder(productId) {
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Собираем данные формы
        const orderData = {
            product_id: productId,
            quantity: parseInt(document.getElementById('order-quantity').value) || 1,
            promo_code: document.getElementById('order-promo-code').value.trim() || null,
            first_name: document.getElementById('order-first-name').value.trim(),
            last_name: document.getElementById('order-last-name').value.trim(),
            middle_name: document.getElementById('order-middle-name').value.trim() || null,
            phone_country_code: document.getElementById('order-phone-country-code').value,
            phone_number: document.getElementById('order-phone-number').value.trim(),
            email: document.getElementById('order-email').value.trim() || null,
            notes: document.getElementById('order-notes').value.trim() || null,
            delivery_method: document.querySelector('input[name="delivery-method"]:checked').value
        };
        
        // Проверяем обязательные поля
        if (!orderData.first_name || !orderData.last_name || !orderData.phone_number) {
            alert('❌ Пожалуйста, заполните все обязательные поля');
            return;
        }
        
        // Отправляем заказ
        const order = await createOrderAPI(orderData);
        
        alert(`✅ Заказ оформлен! Статус: ожидание`);
        
        orderModal.style.display = 'none';
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Обновляем данные и корзину
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Order error:', e);
        alert(`❌ Ошибка при оформлении заказа: ${e.message}`);
    }
}

// Создание заказа (старая функция для обратной совместимости)
async function createOrder(productId, quantity) {
    // Эта функция больше не используется, но оставляем для совместимости
    await submitOrder(productId);
}

// Создание резервации
async function createReservation(productId, hours, quantity = 1) {
    try {
        console.log('🔒 createReservation called:', { productId, hours, quantity });
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // reserved_by_user_id определяется на backend из initData
        console.log('🔒 Calling createReservationAPI with quantity:', quantity);
        const reservation = await createReservationAPI(productId, hours, quantity);
        console.log('✅ Reservation created:', reservation);
        
        const quantityText = quantity > 1 ? ` (${quantity} шт.)` : '';
        alert(`✅ Товар зарезервирован на ${hours} ${hours === 1 ? 'час' : hours === 2 ? 'часа' : 'часов'}${quantityText}`);
        
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Обновляем данные и корзину
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Reservation error:', e);
        alert(`❌ Ошибка при резервации: ${e.message}`);
    }
}

// Отмена резервации
async function cancelReservation(reservationId, productId) {
    if (!confirm('Вы уверены, что хотите снять резервацию с этого товара?')) {
        return;
    }
    
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // user_id определяется на backend из initData
        await cancelReservationAPI(reservationId);
        alert('✅ Резервация снята');
        
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Cancel reservation error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Отмена заказа
async function cancelOrder(orderId) {
    if (!confirm('Вы уверены, что хотите отменить этот заказ?')) {
        return;
    }
    
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // user_id определяется на backend из initData
        await cancelOrderAPI(orderId);
        alert('✅ Заказ отменен');
        
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Cancel order error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Показ модального окна редактирования товара
function showEditProductModal(prod) {
    const editProductModal = document.getElementById('edit-product-modal');
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    const editPriceInput = document.getElementById('edit-price');
    const editDiscountInput = document.getElementById('edit-discount');
    const editQuantityInput = document.getElementById('edit-quantity');
    const editQuantityUnitGeneralInput = document.getElementById('edit-quantity-unit-general');
    const editQuantityShowEnabledInput = document.getElementById('edit-quantity-show-enabled');
    const editMadeToOrderInput = document.getElementById('edit-made-to-order');
    const editForSaleInput = document.getElementById('edit-for-sale');
    const editPriceFromInput = document.getElementById('edit-price-from');
    const editPriceToInput = document.getElementById('edit-price-to');
    const editPriceFixedInput = document.getElementById('edit-price-fixed');
    const editPriceTypeRangeRadio = document.getElementById('edit-price-type-range');
    const editPriceTypeFixedRadio = document.getElementById('edit-price-type-fixed');
    const priceRangeFields = document.getElementById('price-range-fields');
    const priceFixedField = document.getElementById('price-fixed-field');
    const editQuantityFromInput = document.getElementById('edit-quantity-from');
    const editQuantityUnitInput = document.getElementById('edit-quantity-unit');
    const forSaleFields = document.getElementById('for-sale-fields');
    
    // Заполняем поля текущими значениями
    editNameInput.value = prod.name || '';
    editDescriptionInput.value = prod.description || '';
    editPriceInput.value = prod.price || '';
    editDiscountInput.value = prod.discount || 0;
    editQuantityInput.value = prod.quantity !== undefined && prod.quantity !== null ? prod.quantity : 0;
    
    // Устанавливаем единицу измерения для обычных товаров
    if (editQuantityUnitGeneralInput) {
        const quantityUnit = prod.quantity_unit || 'шт';
        const selectElement = editQuantityUnitGeneralInput;
        const options = Array.from(selectElement.options);
        const matchingOption = options.find(opt => opt.value === quantityUnit);
        if (matchingOption) {
            editQuantityUnitGeneralInput.value = matchingOption.value;
        } else {
            editQuantityUnitGeneralInput.value = 'шт';
        }
    }
    
    // Устанавливаем тумблер "Показ количества"
    const shopSettingsForEdit = getCurrentShopSettings();
    const globalQuantityEnabled = shopSettingsForEdit ? (shopSettingsForEdit.quantity_enabled !== false) : true;
    
    // Если индивидуальная настройка не установлена (null), используем общую настройку
    let quantityShowEnabledValue;
    if (prod.quantity_show_enabled === null || prod.quantity_show_enabled === undefined) {
        quantityShowEnabledValue = globalQuantityEnabled;
        editQuantityShowEnabledInput.dataset.isUsingGlobal = 'true';
    } else {
        quantityShowEnabledValue = prod.quantity_show_enabled === true || prod.quantity_show_enabled === 1 || prod.quantity_show_enabled === 'true' || prod.quantity_show_enabled === '1';
        editQuantityShowEnabledInput.dataset.isUsingGlobal = 'false';
    }
    editQuantityShowEnabledInput.checked = quantityShowEnabledValue;
    
    // Проверяем is_made_to_order - может быть true, false, 1, 0, "true", "false", или undefined
    // Преобразуем в boolean для надежности
    const isMadeToOrder = prod.is_made_to_order === true || 
                          prod.is_made_to_order === 1 || 
                          prod.is_made_to_order === '1' ||
                          prod.is_made_to_order === 'true' ||
                          String(prod.is_made_to_order).toLowerCase() === 'true';
    editMadeToOrderInput.checked = isMadeToOrder;
    
    // Делаем тумблер "Показ количества" неактивным, если включен "Под заказ"
    // При включенном "Под заказ" количество не отображается, поэтому тумблер неактивен
    editQuantityShowEnabledInput.disabled = isMadeToOrder;
    
    // Обработчик изменения тумблера "Под заказ" - отключаем/включаем тумблер "Показ количества"
    editMadeToOrderInput.onchange = () => {
        const madeToOrderEnabled = editMadeToOrderInput.checked;
        // Отключаем тумблер "Показ количества" при включении "Под заказ"
        editQuantityShowEnabledInput.disabled = madeToOrderEnabled;
    };
    
    // Проверяем is_for_sale
    const isForSale = prod.is_for_sale === true || 
                      prod.is_for_sale === 1 || 
                      prod.is_for_sale === '1' ||
                      prod.is_for_sale === 'true' ||
                      String(prod.is_for_sale).toLowerCase() === 'true';
    editForSaleInput.checked = isForSale;
    
    // Заполняем поля для функции покупка
    const priceType = prod.price_type || 'range';
    editPriceFromInput.value = prod.price_from || '';
    editPriceToInput.value = prod.price_to || '';
    editPriceFixedInput.value = prod.price_fixed || '';
    editQuantityFromInput.value = prod.quantity_from !== undefined && prod.quantity_from !== null ? prod.quantity_from : '';
    // Устанавливаем единицу измерения, находим соответствующую опцию в select по value
    const quantityUnit = prod.quantity_unit || 'шт';
    const selectElement = editQuantityUnitInput;
    const options = Array.from(selectElement.options);
    // Ищем опцию с нужным value
    const matchingOption = options.find(opt => opt.value === quantityUnit);
    if (matchingOption) {
        editQuantityUnitInput.value = matchingOption.value;
    } else {
        editQuantityUnitInput.value = 'шт';
    }
    
    // Устанавливаем тип цены
    if (editPriceTypeRangeRadio && editPriceTypeFixedRadio) {
        editPriceTypeRangeRadio.checked = priceType === 'range';
        editPriceTypeFixedRadio.checked = priceType === 'fixed';
    }
    
    // Показываем/скрываем дополнительные поля в зависимости от состояния тумблера "покупка"
    if (forSaleFields) {
        forSaleFields.style.display = isForSale ? 'block' : 'none';
    }
    
    // Показываем/скрываем поля в зависимости от типа цены
    if (priceRangeFields && priceFixedField) {
        priceRangeFields.style.display = priceType === 'range' ? 'block' : 'none';
        priceFixedField.style.display = priceType === 'fixed' ? 'block' : 'none';
    }
    
    // Делаем поля цены, скидки и количества неактивными, если включена функция покупка
    editPriceInput.disabled = isForSale;
    editDiscountInput.disabled = isForSale;
    editQuantityInput.disabled = isForSale;
    if (editQuantityUnitGeneralInput) {
        editQuantityUnitGeneralInput.disabled = isForSale;
    }
    
    // Функция для обновления визуального состояния типа цены
    const updatePriceTypeVisual = () => {
        if (!editPriceTypeRangeRadio || !editPriceTypeFixedRadio) return;
        
        const rangeLabel = editPriceTypeRangeRadio.closest('label');
        const fixedLabel = editPriceTypeFixedRadio.closest('label');
        
        if (rangeLabel && fixedLabel) {
            if (editPriceTypeRangeRadio.checked) {
                // Выделяем активный тип "от-до"
                rangeLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    padding: 12px;
                    border-radius: 8px;
                    background: rgba(90, 200, 250, 0.2);
                    border: 2px solid rgba(90, 200, 250, 0.5);
                    transition: all 0.3s ease;
                `;
                fixedLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    padding: 12px;
                    border-radius: 8px;
                    background: transparent;
                    border: 2px solid transparent;
                    transition: all 0.3s ease;
                `;
            } else if (editPriceTypeFixedRadio.checked) {
                // Выделяем активный тип "фиксированная"
                fixedLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    padding: 12px;
                    border-radius: 8px;
                    background: rgba(90, 200, 250, 0.2);
                    border: 2px solid rgba(90, 200, 250, 0.5);
                    transition: all 0.3s ease;
                `;
                rangeLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    padding: 12px;
                    border-radius: 8px;
                    background: transparent;
                    border: 2px solid transparent;
                    transition: all 0.3s ease;
                `;
            }
        }
    };
    
    // Обработчик изменения тумблера "покупка"
    editForSaleInput.onchange = () => {
        const forSaleEnabled = editForSaleInput.checked;
        if (forSaleFields) {
            forSaleFields.style.display = forSaleEnabled ? 'block' : 'none';
        }
        editPriceInput.disabled = forSaleEnabled;
        editDiscountInput.disabled = forSaleEnabled;
        editQuantityInput.disabled = forSaleEnabled;
        if (editQuantityUnitGeneralInput) {
            editQuantityUnitGeneralInput.disabled = forSaleEnabled;
        }
        
        // Обновляем визуальное состояние типа цены при включении тумблера
        if (forSaleEnabled) {
            setTimeout(() => {
                updatePriceTypeVisual();
            }, 50);
        }
    };
    
    // Обработчики изменения типа цены
    if (editPriceTypeRangeRadio && editPriceTypeFixedRadio && priceRangeFields && priceFixedField) {
        // Инициализируем визуальное состояние при загрузке (если тумблер покупки включен)
        if (isForSale) {
            setTimeout(() => {
                updatePriceTypeVisual();
            }, 50);
        }
        
        editPriceTypeRangeRadio.onchange = () => {
            if (editPriceTypeRangeRadio.checked) {
                priceRangeFields.style.display = 'block';
                priceFixedField.style.display = 'none';
                updatePriceTypeVisual();
            }
        };
        
        editPriceTypeFixedRadio.onchange = () => {
            if (editPriceTypeFixedRadio.checked) {
                priceRangeFields.style.display = 'none';
                priceFixedField.style.display = 'block';
                updatePriceTypeVisual();
            }
        };
    }
    
    console.log('🔧 Edit product modal - full product object:', JSON.stringify(prod, null, 2));
    console.log('🔧 Edit product modal - is_made_to_order raw:', prod.is_made_to_order, 'type:', typeof prod.is_made_to_order, 'checked:', isMadeToOrder);
    console.log('🔧 Edit product modal - is_for_sale raw:', prod.is_for_sale, 'type:', typeof prod.is_for_sale, 'checked:', isForSale);
    
    // Показываем модальное окно
    editProductModal.style.display = 'block';
    
    // Обработчик сохранения
    const saveBtn = document.getElementById('edit-product-save');
    const cancelBtn = document.getElementById('edit-product-cancel');
    
    // Удаляем старые обработчики, если есть
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Добавляем новые обработчики
    newSaveBtn.onclick = async () => {
        await saveProductEdit(prod.id);
    };
    
    newCancelBtn.onclick = () => {
        editProductModal.style.display = 'none';
    };
}

// Сохранение изменений товара
async function saveProductEdit(productId) {
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    const editPriceInput = document.getElementById('edit-price');
    const editDiscountInput = document.getElementById('edit-discount');
    const editQuantityInput = document.getElementById('edit-quantity');
    const editQuantityShowEnabledInput = document.getElementById('edit-quantity-show-enabled');
    const editMadeToOrderInput = document.getElementById('edit-made-to-order');
    const editForSaleInput = document.getElementById('edit-for-sale');
    const editPriceFromInput = document.getElementById('edit-price-from');
    const editPriceToInput = document.getElementById('edit-price-to');
    const editPriceFixedInput = document.getElementById('edit-price-fixed');
    const editPriceTypeRangeRadio = document.getElementById('edit-price-type-range');
    const editQuantityFromInput = document.getElementById('edit-quantity-from');
    const editQuantityUnitInput = document.getElementById('edit-quantity-unit');
    const editQuantityUnitGeneralInput = document.getElementById('edit-quantity-unit-general');
    
    const newName = editNameInput.value.trim();
    const newDescription = editDescriptionInput.value.trim();
    const newPrice = parseFloat(editPriceInput.value);
    const newDiscount = parseFloat(editDiscountInput.value);
    const newQuantity = parseInt(editQuantityInput.value, 10);
    // Получаем единицу измерения для обычных товаров
    const newQuantityUnitGeneral = editQuantityUnitGeneralInput ? editQuantityUnitGeneralInput.value || null : null;
    // Получаем значение тумблера "Показ количества"
    const shopSettingsForSave = getCurrentShopSettings();
    const globalQuantityEnabledForSave = shopSettingsForSave ? (shopSettingsForSave.quantity_enabled !== false) : true;
    const newMadeToOrder = editMadeToOrderInput.checked;
    
    // Если включен "Под заказ", настройка "Показ количества" не применяется (количество не отображается)
    // Поэтому сохраняем null (использовать глобальную настройку)
    let quantityShowEnabledToSave;
    if (newMadeToOrder) {
        // При "Под заказ" количество не отображается, поэтому сохраняем null
        quantityShowEnabledToSave = null;
    } else {
        // Если "Под заказ" выключен, сохраняем настройку "Показ количества"
        const newQuantityShowEnabled = editQuantityShowEnabledInput.checked;
        
        // Определяем, какое значение сохранить: если совпадает с глобальной настройкой, сохраняем null
        if (editQuantityShowEnabledInput.dataset.isUsingGlobal === 'true') {
            // Использовалась глобальная настройка
            if (newQuantityShowEnabled === globalQuantityEnabledForSave) {
                quantityShowEnabledToSave = null; // Оставляем глобальную настройку
            } else {
                quantityShowEnabledToSave = newQuantityShowEnabled; // Устанавливаем индивидуальную
            }
        } else {
            // Использовалась индивидуальная настройка
            if (newQuantityShowEnabled === globalQuantityEnabledForSave) {
                quantityShowEnabledToSave = null; // Возвращаемся к глобальной
            } else {
                quantityShowEnabledToSave = newQuantityShowEnabled; // Сохраняем индивидуальную
            }
        }
    }
    const newForSale = editForSaleInput.checked;
    const newPriceType = editPriceTypeRangeRadio && editPriceTypeRangeRadio.checked ? 'range' : 'fixed';
    const newPriceFrom = editPriceFromInput.value ? parseFloat(editPriceFromInput.value) : null;
    const newPriceTo = editPriceToInput.value ? parseFloat(editPriceToInput.value) : null;
    const newPriceFixed = editPriceFixedInput.value ? parseFloat(editPriceFixedInput.value) : null;
    const newQuantityFrom = editQuantityFromInput.value ? parseInt(editQuantityFromInput.value, 10) : null;
    // Получаем единицу измерения (value уже содержит только код без описания)
    const newQuantityUnit = editQuantityUnitInput.value || null;
    
    // Валидация
    if (!newName || newName.length === 0) {
        alert('❌ Введите название товара');
        return;
    }
    
    if (isNaN(newPrice) || newPrice <= 0) {
        alert('❌ Введите корректную цену (больше 0)');
        return;
    }
    
    if (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100) {
        alert('❌ Введите корректную скидку (от 0 до 100%)');
        return;
    }
    
    if (isNaN(newQuantity) || newQuantity < 0) {
        alert('❌ Введите корректное количество (0 или больше)');
        return;
    }
    
    // Валидация полей функции покупка
    if (newForSale) {
        if (newPriceType === 'range') {
            if (newPriceFrom !== null && (isNaN(newPriceFrom) || newPriceFrom < 0)) {
                alert('❌ Введите корректную цену от (0 или больше)');
                return;
            }
            if (newPriceTo !== null && (isNaN(newPriceTo) || newPriceTo < 0)) {
                alert('❌ Введите корректную цену до (0 или больше)');
                return;
            }
            if (newPriceFrom !== null && newPriceTo !== null && newPriceFrom > newPriceTo) {
                alert('❌ Цена от не может быть больше цены до');
                return;
            }
        } else if (newPriceType === 'fixed') {
            if (newPriceFixed === null || isNaN(newPriceFixed) || newPriceFixed < 0) {
                alert('❌ Введите корректную фиксированную цену (0 или больше)');
                return;
            }
        }
        if (newQuantityFrom !== null && (isNaN(newQuantityFrom) || newQuantityFrom < 0)) {
            alert('❌ Введите корректное количество от (0 или больше)');
            return;
        }
    }
    
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Обновляем название и описание (без уведомлений)
        await updateProductNameDescriptionAPI(productId, appContext.shop_owner_id, newName, newDescription || null);
        
        // Обновляем цену и скидку (с уведомлениями) - только если функция покупка не включена
        if (!newForSale) {
            await updateProductAPI(productId, appContext.shop_owner_id, newPrice, newDiscount);
        }
        
        // Обновляем количество и единицу измерения (без уведомлений)
        await updateProductQuantityAPI(productId, appContext.shop_owner_id, newQuantity, newQuantityUnitGeneral);
        
        // Обновляем индивидуальную настройку показа количества (без уведомлений)
        console.log(`💾 Saving quantity-show-enabled: productId=${productId}, quantityShowEnabled=${quantityShowEnabledToSave}`);
        await updateProductQuantityShowEnabledAPI(productId, appContext.shop_owner_id, quantityShowEnabledToSave);
        console.log(`✅ Quantity-show-enabled saved:`, quantityShowEnabledToSave);
        
        // Обновляем статус 'под заказ' (без уведомлений)
        console.log(`💾 Saving made-to-order: productId=${productId}, isMadeToOrder=${newMadeToOrder}`);
        const madeToOrderResult = await updateProductMadeToOrderAPI(productId, appContext.shop_owner_id, newMadeToOrder);
        console.log(`✅ Made-to-order saved:`, madeToOrderResult);
        
        // Обновляем функцию 'покупка' (без уведомлений)
        console.log(`💾 Saving for-sale: productId=${productId}`, { is_for_sale: newForSale, price_type: newPriceType, price_from: newPriceFrom, price_to: newPriceTo, price_fixed: newPriceFixed, quantity_from: newQuantityFrom, quantity_unit: newQuantityUnit });
        const forSaleResult = await updateProductForSaleAPI(productId, appContext.shop_owner_id, {
            is_for_sale: newForSale,
            price_type: newPriceType,
            price_from: newPriceFrom,
            price_to: newPriceTo,
            price_fixed: newPriceFixed,
            quantity_from: newQuantityFrom,
            quantity_unit: newQuantityUnit
        });
        console.log(`✅ For-sale saved:`, forSaleResult);
        
        // Закрываем модальное окно редактирования
        const editProductModal = document.getElementById('edit-product-modal');
        editProductModal.style.display = 'none';
        
        // Закрываем модальное окно товара
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Показываем уведомление
        alert('✅ Товар обновлен!');
        
        // Обновляем данные и сбрасываем currentProduct
        currentProduct = null;
        setTimeout(async () => {
            await loadData();
            console.log('✅ Data reloaded after product edit');
        }, 500);
    } catch (e) {
        console.error('Save product edit error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Показ изображения в модальном окне
function showModalImage(index) {
    const modalImage = document.getElementById('modal-image');
    
    // ВАЖНО: Всегда очищаем предыдущее состояние перед показом нового содержимого
    // Это критично для исправления бага, когда после товара без фото не показываются фото других товаров
    
    // Увеличиваем ID загрузки, чтобы отменить старые запросы
    currentImageLoadId++;
    const loadId = currentImageLoadId;
    
    console.log(`[MODAL IMG] showModalImage called: index=${index}, loadId=${loadId}, currentImages.length=${currentImages.length}, currentProduct=${currentProduct ? currentProduct.id : 'null'}`);
    
    // Очищаем предыдущий blob URL если был
    const oldBlobUrl = modalImage.dataset.blobUrl;
    if (oldBlobUrl) {
        URL.revokeObjectURL(oldBlobUrl);
        delete modalImage.dataset.blobUrl;
    }
    
    // Удаляем старую навигацию по фото, если она есть
    const oldNav = modalImage.querySelector('.image-navigation');
    if (oldNav) {
        oldNav.remove();
    }
    
    // Очищаем содержимое полностью
    modalImage.innerHTML = '';
    
    // Если товар без фото, показываем placeholder и выходим
    if (currentImages.length === 0) {
        console.log(`[MODAL IMG] No images, showing placeholder (loadId=${loadId})`);
        modalImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
        modalImage.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
        return;
    }
    
    if (index < 0 || index >= currentImages.length) {
        console.warn(`[MODAL IMG] Invalid index: ${index}, currentImages.length=${currentImages.length}`);
        return;
    }
    
    currentImageIndex = index;
    const fullImg = currentImages[index];
    console.log(`[MODAL IMG] Loading image: index=${index}, url="${fullImg}", loadId=${loadId}`);
    
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    imageContainer.dataset.loadId = loadId; // Сохраняем ID загрузки для проверки актуальности
    imageContainer.style.cssText = 'position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;';
    imageContainer.innerHTML = '<div style="color: var(--tg-theme-hint-color); font-size: 48px;">⏳</div>';
    modalImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
    modalImage.appendChild(imageContainer);
    
    // Функция для проверки, что контейнер все еще актуален
    const isContainerValid = () => {
        const container = modalImage.querySelector(`.image-container[data-load-id="${loadId}"]`);
        return container && container === imageContainer;
    };
    
    // Определяем, мобильное устройство или десктоп
    const isMobile = isMobileDevice();
    
    if (isMobile) {
        // На мобильных устройствах используем fetch + blob URL для обхода блокировки Telegram WebView
        fetch(fullImg, {
            headers: {
                'ngrok-skip-browser-warning': '69420'
            }
        })
        .then(response => {
            // Проверяем актуальность перед обработкой ответа
            if (loadId !== currentImageLoadId || !isContainerValid()) {
                console.log(`[MODAL IMG] Load cancelled: loadId=${loadId}, currentLoadId=${currentImageLoadId}`);
                return null;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            // Проверяем актуальность перед созданием изображения
            if (!blob || loadId !== currentImageLoadId || !isContainerValid()) {
                if (blob) {
                    console.log(`[MODAL IMG] Load cancelled after blob: loadId=${loadId}, currentLoadId=${currentImageLoadId}`);
                }
                return;
            }
            
            // Создаем blob URL для обхода блокировки ngrok доменов
            const blobUrl = URL.createObjectURL(blob);
            modalImage.dataset.blobUrl = blobUrl; // Сохраняем для последующей очистки
            
            const img = document.createElement('img');
            img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 12px; display: block;';
            img.alt = currentProduct ? currentProduct.name : 'Product';
            
            img.onload = () => {
                // Проверяем актуальность перед обновлением DOM
                if (loadId !== currentImageLoadId || !isContainerValid()) {
                    console.log(`[MODAL IMG] Image load cancelled on onload: loadId=${loadId}, currentLoadId=${currentImageLoadId}`);
                    URL.revokeObjectURL(blobUrl);
                    return;
                }
                
                imageContainer.innerHTML = '';
                imageContainer.appendChild(img);
                modalImage.style.backgroundColor = 'transparent';
                
                console.log(`[MODAL IMG] Image loaded successfully (mobile): loadId=${loadId}`);
                
                // Добавляем навигацию по фото, если их больше одного
                if (currentImages.length > 1) {
                    updateImageNavigation();
                }
            };
            
            img.onerror = () => {
                if (loadId !== currentImageLoadId || !isContainerValid()) {
                    return;
                }
                URL.revokeObjectURL(blobUrl);
                delete modalImage.dataset.blobUrl;
                imageContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
                console.error(`[MODAL IMG] Image load error (mobile): loadId=${loadId}`);
            };
            
            img.src = blobUrl;
        })
        .catch(error => {
            // Проверяем актуальность перед обработкой ошибки
            if (loadId !== currentImageLoadId || !isContainerValid()) {
                return;
            }
            console.error('[MODAL IMG] Fetch error (mobile):', error);
            console.error('[MODAL IMG] Failed URL:', fullImg);
            imageContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
        });
    } else {
        // На десктопе используем прямые URL (более надежно и быстрее)
        const img = document.createElement('img');
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 12px; display: block;';
        img.alt = currentProduct ? currentProduct.name : 'Product';
        
        img.onload = () => {
            // Проверяем актуальность перед обновлением DOM
            if (loadId !== currentImageLoadId || !isContainerValid()) {
                console.log(`[MODAL IMG] Image load cancelled on onload (desktop): loadId=${loadId}, currentLoadId=${currentImageLoadId}`);
                return;
            }
            
            imageContainer.innerHTML = '';
            imageContainer.appendChild(img);
            modalImage.style.backgroundColor = 'transparent';
            
            console.log(`[MODAL IMG] Image loaded successfully (desktop): loadId=${loadId}`);
            
            // Добавляем навигацию по фото, если их больше одного
            if (currentImages.length > 1) {
                updateImageNavigation();
            }
        };
        
        img.onerror = () => {
            // Проверяем актуальность перед fallback
            if (loadId !== currentImageLoadId || !isContainerValid()) {
                return;
            }
            
            // Ошибка загрузки изображения - пробуем через fetch как fallback
            console.warn('[MODAL IMG] Direct URL failed, trying fetch fallback (desktop)');
            // Fallback: пробуем через fetch
            fetch(fullImg, {
                headers: {
                    'ngrok-skip-browser-warning': '69420'
                }
            })
            .then(response => {
                if (loadId !== currentImageLoadId || !isContainerValid()) {
                    return null;
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                if (!blob || loadId !== currentImageLoadId || !isContainerValid()) {
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                modalImage.dataset.blobUrl = blobUrl; // Сохраняем для последующей очистки
                img.src = blobUrl;
                console.log('[MODAL IMG] Image loaded via fetch fallback (desktop)');
            })
            .catch(error => {
                if (loadId !== currentImageLoadId || !isContainerValid()) {
                    return;
                }
                console.error('[MODAL IMG] Fetch fallback also failed:', error);
                imageContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
            });
        };
        
        // Устанавливаем прямой URL
        img.src = fullImg;
    }
}

// Обновление навигации по фото
function updateImageNavigation() {
    const modalImage = document.getElementById('modal-image');
    
    // Удаляем старые кнопки навигации, если они есть
    const oldNav = modalImage.querySelector('.image-navigation');
    if (oldNav) {
        oldNav.remove();
    }
    
    // Создаем контейнер для навигации
    const navContainer = document.createElement('div');
    navContainer.className = 'image-navigation';
    navContainer.style.cssText = `
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        align-items: center;
        z-index: 100;
        padding: 6px;
    `;
    
    // Кнопка "Назад" в стиле Liquid Glass
    if (currentImageIndex > 0) {
        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '‹';
        prevBtn.style.cssText = `
            background: linear-gradient(135deg, rgba(90, 200, 250, 0.2) 0%, rgba(90, 200, 250, 0.1) 100%);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: rgba(255, 255, 255, 0.95);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                        0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                        0 2px 8px rgba(90, 200, 250, 0.2);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        `;
        prevBtn.onmouseenter = () => {
            prevBtn.style.background = 'linear-gradient(135deg, rgba(90, 200, 250, 0.35) 0%, rgba(90, 200, 250, 0.2) 100%)';
            prevBtn.style.transform = 'scale(1.15)';
            prevBtn.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2) inset, 0 4px 12px rgba(90, 200, 250, 0.4)';
            prevBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        };
        prevBtn.onmouseleave = () => {
            prevBtn.style.background = 'linear-gradient(135deg, rgba(90, 200, 250, 0.2) 0%, rgba(90, 200, 250, 0.1) 100%)';
            prevBtn.style.transform = 'scale(1)';
            prevBtn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(90, 200, 250, 0.2)';
            prevBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        };
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            showModalImage(currentImageIndex - 1);
        };
        navContainer.appendChild(prevBtn);
    }
    
    // Индикатор фото в стиле Liquid Glass
    const indicator = document.createElement('div');
    indicator.textContent = `${currentImageIndex + 1}/${currentImages.length}`;
    indicator.style.cssText = `
        background: linear-gradient(135deg, rgba(58, 58, 60, 0.6) 0%, rgba(44, 44, 46, 0.5) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.95);
        padding: 6px 14px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.3px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    `;
    navContainer.appendChild(indicator);
    
    // Кнопка "Вперед" в стиле Liquid Glass
    if (currentImageIndex < currentImages.length - 1) {
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '›';
        nextBtn.style.cssText = `
            background: linear-gradient(135deg, rgba(90, 200, 250, 0.2) 0%, rgba(90, 200, 250, 0.1) 100%);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: rgba(255, 255, 255, 0.95);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                        0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                        0 2px 8px rgba(90, 200, 250, 0.2);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        `;
        nextBtn.onmouseenter = () => {
            nextBtn.style.background = 'linear-gradient(135deg, rgba(90, 200, 250, 0.35) 0%, rgba(90, 200, 250, 0.2) 100%)';
            nextBtn.style.transform = 'scale(1.15)';
            nextBtn.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2) inset, 0 4px 12px rgba(90, 200, 250, 0.4)';
            nextBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        };
        nextBtn.onmouseleave = () => {
            nextBtn.style.background = 'linear-gradient(135deg, rgba(90, 200, 250, 0.2) 0%, rgba(90, 200, 250, 0.1) 100%)';
            nextBtn.style.transform = 'scale(1)';
            nextBtn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(90, 200, 250, 0.2)';
            nextBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        };
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            showModalImage(currentImageIndex + 1);
        };
        navContainer.appendChild(nextBtn);
    }
    
    modalImage.appendChild(navContainer);
    
    // Добавляем обработчики свайпов для мобильных устройств
    let touchStartX = 0;
    let touchEndX = 0;
    
    modalImage.ontouchstart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
    };
    
    modalImage.ontouchend = (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    };
    
    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0 && currentImageIndex < currentImages.length - 1) {
                // Свайп влево - следующее фото
                showModalImage(currentImageIndex + 1);
            } else if (diff < 0 && currentImageIndex > 0) {
                // Свайп вправо - предыдущее фото
                showModalImage(currentImageIndex - 1);
            }
        }
    }
}

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

// Настройка кнопки админки
function setupAdminButton() {
    const adminButton = document.getElementById('admin-button');
    if (adminButton) {
        adminButton.style.display = 'block';
        adminButton.onclick = () => {
            openAdmin();
        };
        console.log('✅ Admin button set up');
    } else {
        console.error('❌ Admin button not found');
    }
}

// Глобальная функция для отмены резервации из корзины
window.cancelReservationFromCart = async function(reservationId, productId) {
    await cancelReservation(reservationId, productId);
    loadCart();
    await updateCartUI();
};

// Глобальная функция для отмены заказа из корзины
window.cancelOrderFromCart = async function(orderId) {
    await cancelOrder(orderId);
    // Перезагружаем заказы в корзине
    await loadOrders();
    await updateCartUI();
};

// Пометить товар как проданный
async function markAsSold(productId, product = null) {
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Если product не передан, ищем его в allProducts
        if (!product) {
            product = allProducts.find(p => p.id === productId);
        }
        
        // Проверяем количество товара
        const productQuantity = product?.quantity || 0;
        const hasQuantity = productQuantity > 1;
        
        if (hasQuantity) {
            // Если товаров больше 1, показываем модальное окно для выбора количества
            showSellModal(productId, product);
        } else {
            // Если товаров 1 или нет, продаем 1 товар по умолчанию
            if (!confirm('Пометить товар как проданный? Товар будет скрыт с витрины и добавлен в историю продаж.')) {
                return;
            }
            await markProductSoldAPI(productId, appContext.shop_owner_id, 1);
            alert('✅ Товар помечен как проданный');
            
            // Закрываем модальное окно
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            
            // Обновляем данные
            setTimeout(async () => {
                await loadData();
            }, 500);
        }
    } catch (e) {
        console.error('Mark as sold error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Показать модальное окно для продажи товара
function showSellModal(productId, product) {
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    if (!sellModal) {
        alert('❌ Ошибка: модальное окно продажи не найдено');
        return;
    }
    
    const productQuantity = product?.quantity !== undefined && product?.quantity !== null ? product.quantity : 0;
    
    // Устанавливаем максимальное значение и значение по умолчанию
    const quantityInput = document.getElementById('sell-quantity');
    const sellAllCheckbox = document.getElementById('sell-all-checkbox');
    
    if (quantityInput) {
        quantityInput.value = 1;
        quantityInput.max = Math.max(1, productQuantity);
        quantityInput.min = 1;
    }
    
    // Сбрасываем чекбокс "Продать все"
    if (sellAllCheckbox) {
        sellAllCheckbox.checked = false;
    }
    
    // Обработчик чекбокса "Продать все"
    if (sellAllCheckbox && quantityInput) {
        sellAllCheckbox.onchange = (e) => {
            if (e.target.checked) {
                quantityInput.value = productQuantity;
                quantityInput.disabled = true;
            } else {
                quantityInput.disabled = false;
                quantityInput.value = 1;
            }
        };
    }
    
    // Показываем информацию о доступном количестве
    const quantityInfo = document.getElementById('sell-quantity-info');
    if (quantityInfo) {
        quantityInfo.textContent = `Доступно: ${productQuantity} шт.`;
    }
    
    // Устанавливаем обработчик кнопки продажи
    const submitBtn = document.getElementById('sell-submit');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            let quantity;
            if (sellAllCheckbox && sellAllCheckbox.checked) {
                quantity = productQuantity;
            } else {
                quantity = parseInt(quantityInput.value) || 1;
            }
            
            if (quantity < 1) {
                alert('❌ Количество должно быть не менее 1');
                return;
            }
            if (quantity > productQuantity) {
                alert(`❌ Нельзя продать больше, чем есть в наличии (${productQuantity} шт.)`);
                return;
            }
            
            sellModal.style.display = 'none';
            await markProductSoldAPI(productId, appContext.shop_owner_id, quantity);
            alert(`✅ Продано ${quantity} шт. товара`);
            
            // Закрываем модальное окно товара
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            
            // Обновляем данные
            setTimeout(async () => {
                await loadData();
            }, 500);
        };
    }
    
    sellModal.style.display = 'block';
}

// Удалить товар
async function deleteProduct(productId) {
    if (!confirm('Вы уверены, что хотите удалить этот товар? Это действие нельзя отменить.')) {
        return;
    }
    
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        await deleteProductAPI(productId, appContext.shop_owner_id);
        alert('✅ Товар удален');
        
        // Закрываем модальное окно
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Обновляем данные
        setTimeout(async () => {
            await loadData();
        }, 500);
    } catch (e) {
        console.error('Delete product error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// ========== ФИЛЬТРЫ ==========

// Инициализация фильтров
function initFilters() {
    // Старые фильтры удалены, функционал перенесен в кнопку со стрелками
    // Обработчики инициализируются в initCategoryFilterHandlers()
    // Эта функция оставлена для обратной совместимости
}

// Инициализация обработчиков фильтра категорий
function initCategoryFilterHandlers(filterDropdown) {
    if (!filterDropdown) return;
    
    // Обработчик для фильтра цены (радио-кнопки)
    const priceRadios = filterDropdown.querySelectorAll('input[name="price-filter"]');
    priceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            productFilters.price = e.target.value;
            applyFilters();
        });
    });
    
    // Обработчик для сортировки (радио-кнопки)
    const sortRadios = filterDropdown.querySelectorAll('input[name="sort-filter"]');
    sortRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            productFilters.sortBy = e.target.value;
            applyFilters();
        });
    });
    
    // Обработчики для чекбоксов фильтров
    const filterCheckboxes = filterDropdown.querySelectorAll('.filter-checkbox[data-filter]');
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const filterType = e.target.dataset.filter;
            const isChecked = e.target.checked;
            
            switch(filterType) {
                case 'in-stock':
                    productFilters.inStock = isChecked;
                    break;
                case 'hot-offer':
                    productFilters.hotOffer = isChecked;
                    break;
                case 'with-discount':
                    productFilters.withDiscount = isChecked;
                    break;
                case 'made-to-order':
                    productFilters.madeToOrder = isChecked;
                    break;
                case 'new-items':
                    productFilters.newItems = isChecked;
                    break;
            }
            
            applyFilters();
        });
    });
    
    // Обработчик для кнопки сброса
    const resetButton = filterDropdown.querySelector('.category-filter-reset');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            // Сбрасываем все фильтры
            productFilters.price = 'all';
            productFilters.inStock = false;
            productFilters.hotOffer = false;
            productFilters.withDiscount = false;
            productFilters.madeToOrder = false;
            productFilters.newItems = false;
            productFilters.sortBy = 'none';
            
            // Сбрасываем UI
            priceRadios.forEach(radio => {
                if (radio.value === 'all') {
                    radio.checked = true;
                } else {
                    radio.checked = false;
                }
            });
            
            sortRadios.forEach(radio => {
                if (radio.value === 'none') {
                    radio.checked = true;
                } else {
                    radio.checked = false;
                }
            });
            
            filterCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            
            applyFilters();
        });
    }
}

// Обновление фильтра категорий
function updateCategoryFilter() {
    const categoryFilterOptions = document.getElementById('category-filter-options');
    if (!categoryFilterOptions) return;
    
    categoryFilterOptions.innerHTML = '';
    
    allCategories.forEach(cat => {
        const option = document.createElement('div');
        option.className = 'filter-option';
        
        const label = document.createElement('label');
        label.className = 'filter-checkbox-label';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'filter-checkbox';
        checkbox.dataset.categoryId = cat.id;
        checkbox.checked = selectedCategoryIds.has(cat.id);
        
        checkbox.addEventListener('change', (e) => {
            const allCheckbox = document.querySelector('[data-category-id="all"]');
            if (e.target.checked) {
                selectedCategoryIds.add(cat.id);
                // Снимаем "Все категории"
                if (allCheckbox) {
                    allCheckbox.checked = false;
                }
            } else {
                selectedCategoryIds.delete(cat.id);
                // Если ничего не выбрано, выбираем "Все категории"
                if (selectedCategoryIds.size === 0 && allCheckbox) {
                    allCheckbox.checked = true;
                }
            }
            updateCategoryFilterCount();
            applyFilters();
        });
        
        const text = document.createElement('span');
        text.className = 'filter-checkbox-text';
        text.textContent = cat.name;
        
        label.appendChild(checkbox);
        label.appendChild(text);
        option.appendChild(label);
        categoryFilterOptions.appendChild(option);
    });
    
    updateCategoryFilterCount();
}

// Обновление счетчика выбранных категорий
function updateCategoryFilterCount() {
    const countElement = document.getElementById('category-filter-count');
    if (!countElement) return;
    
    const count = selectedCategoryIds.size;
    if (count > 0) {
        countElement.textContent = count;
        countElement.style.display = 'inline-block';
    } else {
        countElement.style.display = 'none';
    }
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


// Показ модального окна покупки
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

// Отправка формы покупки
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
        
        alert('✅ Заявка на покупку успешно отправлена!');
        document.getElementById('purchase-modal').style.display = 'none';
        
        // Обновляем корзину
        if (window.loadCart) {
            await window.loadCart();
        }
        if (window.updateCartUI) {
            await window.updateCartUI();
        }
    } catch (error) {
        console.error('Error creating purchase:', error);
        alert(`❌ Ошибка: ${error.message}`);
    } finally {
        const submitBtn = document.getElementById('purchase-submit');
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ Отправить заявку';
    }
}

