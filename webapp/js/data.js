// Модуль для загрузки данных (категории и товары)
// Вынесено из app.js для рефакторинга

import { getCurrentShopSettings, loadShopSettings } from './admin.js';
import { API_BASE, fetchCategories, fetchProducts, getShopSettings, trackShopVisit } from './api.js';
import { updateCartUI } from './cart.js';
import { renderCategories } from './categories.js';
import { applyFilters, updateProductFilterOptions } from './filters.js';

// Зависимости, которые будут переданы из app.js
let appContextGetter = null;
let productsGridElement = null;
let allProductsGetter = null;
let allProductsSetter = null;
let userNameElement = null;

// Инициализация зависимостей
export function initDataDependencies(dependencies) {
    appContextGetter = dependencies.appContextGetter;
    productsGridElement = dependencies.productsGridElement;
    allProductsGetter = dependencies.allProductsGetter;
    allProductsSetter = dependencies.allProductsSetter;
    userNameElement = dependencies.userNameElement;
}

// Загрузка данных (категории и товары)
export async function loadData() {
    console.log('🚀 loadData() called');
    
    const appContext = appContextGetter ? appContextGetter() : null;
    console.log('🚀 appContext:', appContext);
    
    if (!appContext) {
        console.error('❌ loadData: appContext is null!');
        if (productsGridElement) {
            productsGridElement.innerHTML = '<p class="loading">Ошибка: контекст не загружен</p>';
        }
        return;
    }

    console.log('📦 Starting data load for shop_owner_id:', appContext.shop_owner_id);
    if (productsGridElement) {
        productsGridElement.innerHTML = '<p class="loading">Загрузка товаров...</p>';
    }
    
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
        // Передаем viewer_id для фильтрации скрытых товаров (если это клиент, а не владелец)
        const viewerId = appContext.viewer_id || null;
        const products = await fetchProducts(appContext.shop_owner_id, null, botId, viewerId); // Загружаем все товары
        console.log('✅ Step 2 complete: Products loaded:', products.length);
        // Сохраняем все товары для фильтрации
        if (allProductsSetter) {
            allProductsSetter(products);
        }
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
        
        if (productsGridElement) {
            productsGridElement.innerHTML = `<p class="loading">${errorMessage}</p>`;
        }
    }
}

// Обновление заголовка с названием магазина
export async function updateShopNameInHeader() {
    const appContext = appContextGetter ? appContextGetter() : null;
    
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
            if (userNameElement) {
                userNameElement.innerText = shopName; // Убираем эмодзи, показываем только название
            }
            
            // Обновляем глобальную переменную для других частей приложения
            await loadShopSettings(currentShopOwnerId);
            console.log(`✅ Shop name header updated to: "${shopName}"`);
        } catch (error) {
            console.error(`❌ Error loading shop settings for header (shop_owner_id: ${currentShopOwnerId}):`, error);
            // В случае ошибки используем кэшированные настройки или дефолт
            const shopSettings = getCurrentShopSettings();
            const shopName = shopSettings && shopSettings.shop_name ? shopSettings.shop_name : 'Магазин';
            if (userNameElement) {
                userNameElement.innerText = shopName;
            }
        }
    }
}

