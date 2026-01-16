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
        
        // === ИСПРАВЛЕНИЕ: Безопасная загрузка категорий с обработкой ошибок ===
        let categories = [];
        try {
            // Загружаем категории с иерархией (flat=false для отображения)
            categories = await fetchCategories(appContext.shop_owner_id, botId, false);
            console.log('✅ Step 1 complete: Categories loaded:', categories.length);
        } catch (e) {
            console.error('❌ [DATA] Ошибка при загрузке категорий:', e);
            console.error('❌ [DATA] Error details:', {
                message: e.message,
                stack: e.stack,
                name: e.name
            });
            
            // Если это таймаут или критическая ошибка - пробрасываем дальше
            if (e.message && (e.message.includes('Таймаут') || e.message.includes('timeout'))) {
                throw e; // Пробрасываем таймаут как критическую ошибку
            }
            
            // Для других ошибок продолжаем с пустым массивом категорий
            console.warn('⚠️ [DATA] Продолжаем загрузку без категорий');
            categories = [];
        }
        // === ИСПРАВЛЕНИЕ: Безопасная JSON сериализация с обработкой ошибок ===
        try {
            console.log('📂 Categories structure:', JSON.stringify(categories, null, 2));
        } catch (e) {
            console.error('❌ [DATA] Ошибка JSON.stringify категорий:', e);
            console.log('📂 Categories structure (без JSON.stringify):', categories);
        }
        if (categories && categories.length > 0) {
            console.log('📂 First category:', categories[0]);
            if (categories[0].subcategories) {
                console.log('📂 First category subcategories:', categories[0].subcategories);
            }
        }
        
        // === ИСПРАВЛЕНИЕ: Валидация структуры категорий перед рендерингом ===
        function validateCategoriesStructure(categories) {
            if (!Array.isArray(categories)) {
                console.warn('⚠️ [DATA] categories не является массивом, преобразуем:', categories);
                return [];
            }
            
            // Проверяем каждую категорию и её подкатегории
            const validCategories = [];
            categories.forEach((cat, index) => {
                try {
                    if (!cat || typeof cat.id !== 'number') {
                        console.warn(`⚠️ [DATA] Пропущена невалидная категория [${index}]:`, cat);
                        return;
                    }
                    
                    // === ИСПРАВЛЕНИЕ: Безопасная обработка названия категории с "/" ===
                    // Убеждаемся, что название категории - это строка
                    const safeName = (cat && cat.name) ? String(cat.name) : 'Без названия';
                    
                    // Нормализуем подкатегории (защита от undefined/null)
                    const validSubcategories = [];
                    if (Array.isArray(cat.subcategories)) {
                        cat.subcategories.forEach((subCat, subIndex) => {
                            try {
                                if (subCat && typeof subCat.id === 'number') {
                                    // === ИСПРАВЛЕНИЕ: Безопасная обработка названия подкатегории ===
                                    const safeSubName = (subCat && subCat.name) ? String(subCat.name) : 'Без названия';
                                    validSubcategories.push({
                                        ...subCat,
                                        name: safeSubName
                                    });
                                }
                            } catch (subError) {
                                console.warn(`⚠️ [DATA] Ошибка при обработке подкатегории [${index}][${subIndex}]:`, subError);
                            }
                        });
                    }
                    
                    const validCategory = {
                        ...cat,
                        name: safeName, // === ИСПРАВЛЕНИЕ: Безопасное название категории ===
                        subcategories: validSubcategories
                    };
                    
                    validCategories.push(validCategory);
                } catch (catError) {
                    console.warn(`⚠️ [DATA] Ошибка при обработке категории [${index}]:`, catError);
                    // Пропускаем эту категорию и продолжаем обработку
                }
            });
            
            return validCategories;
        }

        const validatedCategories = validateCategoriesStructure(categories);
        console.log(`✅ [DATA] Валидировано категорий: ${validatedCategories.length} из ${categories.length}`);
        
        // === ИСПРАВЛЕНИЕ: Безопасный вызов renderCategories с обработкой ошибок ===
        try {
            renderCategories(validatedCategories);
        } catch (e) {
            console.error('❌ [DATA] Ошибка при рендеринге категорий:', e);
            console.error('❌ [DATA] Error details:', {
                message: e.message,
                stack: e.stack,
                name: e.name
            });
            // Продолжаем работу - рендеринг категорий не критичен для загрузки товаров
        }
        
        // Загружаем товары для магазина (shop_owner_id)
        // ВАЖНО: Загружаем ВСЕ товары без фильтрации по категории для работы фильтров
        console.log('📦 Step 2: Fetching products...');
        const productsUrl = `${API_BASE}/api/products/?user_id=${appContext.shop_owner_id}${botId !== null && botId !== undefined ? `&bot_id=${botId}` : ''}`;
        console.log('📦 Products URL:', productsUrl);
        console.log('📦 Using botId:', botId, 'for products');
        // Передаем viewer_id для фильтрации скрытых товаров (если это клиент, а не владелец)
        const viewerId = appContext.viewer_id || null;
        // === ИСПРАВЛЕНИЕ: Безопасная загрузка товаров с обработкой ошибок ===
        let products = [];
        try {
            products = await fetchProducts(appContext.shop_owner_id, null, botId, viewerId); // Загружаем все товары
            console.log('✅ Step 2 complete: Products loaded:', products.length);
        } catch (e) {
            console.error('❌ [DATA] Ошибка при загрузке товаров:', e);
            console.error('❌ [DATA] Error details:', {
                message: e.message,
                stack: e.stack,
                name: e.name
            });
            // Продолжаем с пустым массивом - товары не критичны для отображения интерфейса
            products = [];
        }
        
        // Сохраняем все товары для фильтрации
        if (allProductsSetter) {
            allProductsSetter(products);
        }
        
        // === ИСПРАВЛЕНИЕ: Безопасное обновление фильтров ===
        try {
            // Обновляем опции фильтра на основе доступных товаров
            updateProductFilterOptions();
            // Применяем фильтры (если они активны)
            await applyFilters();
        } catch (e) {
            console.error('❌ [DATA] Ошибка при применении фильтров:', e);
            // Продолжаем работу
        }
        
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
        } else if (e.name === 'TypeError' && e.message && e.message.includes('fetch')) {
            errorMessage = 'Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.';
        } else if (e.message && (e.message.includes('401') || e.message.includes('авторизац'))) {
            errorMessage = 'Ошибка авторизации. Убедитесь, что приложение открыто через Telegram-бота.';
        } else if (e.message && (e.message.includes('404') || e.message.includes('не найден'))) {
            errorMessage = 'Магазин не найден.';
        } else if (e.message && (e.message.includes('Таймаут') || e.message.includes('timeout'))) {
            errorMessage = 'Превышено время ожидания ответа от сервера. Попробуйте перезагрузить страницу.';
        }
        
        if (productsGridElement) {
            productsGridElement.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <p class="loading" style="color: #ff6b6b; font-size: 18px; margin-bottom: 10px;">
                        ❌ ${errorMessage}
                    </p>
                    <p style="color: var(--text-secondary); font-size: 14px; margin-top: 12px;">
                        Попробуйте перезагрузить страницу или проверить подключение к интернету.
                    </p>
                </div>
            `;
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

