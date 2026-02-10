// Модуль для работы с избранным
import { API_BASE, getBaseHeaders } from './api.js';
import { goToMainContent, hideAllPages } from './operationsBase.js';
import { renderProducts, showProductModal } from './products.js';
import {
    getBasePrice,
    getFinalCardPrice,
    getOldPriceForDisplay,
    hasDiscount
} from './utils/priceUtils.js';

// Кэш избранных товаров (заполняется только из syncFavoritesCache / getFavorites)
let favoritesCache = new Set();

// Счетчик избранных товаров
let favoritesCount = 0;

/**
 * Возвращает копию набора id избранных товаров (по данным последнего sync/list).
 */
export function getFavoritesIdsSet() {
    return new Set(favoritesCache);
}

/**
 * Проверить по кэшу, в избранном ли товар (без запроса к API).
 */
export function isFavoriteCached(productId) {
    return favoritesCache.has(productId);
}

/**
 * Проверить, добавлен ли товар в избранное
 */
export async function checkFavorite(productId) {
    try {
        const url = `${API_BASE}/api/favorites/check/${productId}`;
        const response = await fetch(url, {
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Favorite check error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        const isFavorite = data.is_favorite || false;
        
        // Обновляем кэш
        const wasInCache = favoritesCache.has(productId);
        if (isFavorite) {
            favoritesCache.add(productId);
        } else {
            favoritesCache.delete(productId);
        }
        
        if (wasInCache !== isFavorite) {
            console.log(`[FAVORITES] Updated cache for product ${productId}: ${wasInCache} -> ${isFavorite}`);
        }
        
        return isFavorite;
    } catch (error) {
        console.error('❌ Error checking favorite:', error);
        return false;
    }
}

/**
 * Переключить статус избранного для товара
 */
export async function toggleFavorite(productId) {
    try {
        console.log(`[FAVORITES] toggleFavorite called for product ${productId}`);
        const url = `${API_BASE}/api/favorites/toggle/${productId}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Toggle favorite error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        const isFavorite = data.is_favorite || false;
        
        // Обновляем кэш
        const wasInCache = favoritesCache.has(productId);
        if (isFavorite) {
            favoritesCache.add(productId);
        } else {
            favoritesCache.delete(productId);
        }
        
        console.log(`[FAVORITES] toggleFavorite result: product ${productId}, cache updated: ${wasInCache} -> ${isFavorite}`);
        
        // Обновляем счетчик
        await updateFavoritesCount();
        
        return data;
    } catch (error) {
        console.error('❌ Error toggling favorite:', error);
        throw error;
    }
}

/**
 * Синхронизировать кэш избранных товаров с сервером
 */
export async function syncFavoritesCache() {
    try {
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext || !appContext.shop_owner_id) {
            console.warn('⚠️ Cannot sync favorites cache: appContext not available');
            return;
        }
        
        const url = `${API_BASE}/api/favorites/list?shop_owner_id=${appContext.shop_owner_id}`;
        const response = await fetch(url, {
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Sync favorites error: ${response.status} - ${errorText}`);
        }
        
        const products = await response.json();
        
        // Обновляем кэш
        favoritesCache.clear();
        products.forEach(product => {
            if (product.id) {
                favoritesCache.add(product.id);
            }
        });
        
        // Обновляем счетчик
        favoritesCount = products.length;
        updateFavoritesCountUI();
    } catch (error) {
        console.error('❌ Error syncing favorites cache:', error);
    }
}

/**
 * Получить список избранных товаров
 */
export async function getFavorites(shopOwnerId) {
    try {
        const url = `${API_BASE}/api/favorites/list?shop_owner_id=${shopOwnerId}`;
        const response = await fetch(url, {
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Get favorites error: ${response.status} - ${errorText}`);
        }
        
        const products = await response.json();
        
        // Обновляем кэш
        favoritesCache.clear();
        products.forEach(product => {
            if (product.id) {
                favoritesCache.add(product.id);
            }
        });
        
        return products;
    } catch (error) {
        console.error('❌ Error getting favorites:', error);
        return [];
    }
}

/**
 * Обновить счетчик избранных товаров
 */
export async function updateFavoritesCount() {
    try {
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext || !appContext.shop_owner_id) {
            return;
        }
        
        const url = `${API_BASE}/api/favorites/count?shop_owner_id=${appContext.shop_owner_id}`;
        const response = await fetch(url, {
            headers: getBaseHeaders()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Get favorites count error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        favoritesCount = data.count || 0;
        updateFavoritesCountUI();
    } catch (error) {
        console.error('❌ Error updating favorites count:', error);
    }
}

/**
 * Обновить UI счетчика избранных товаров
 */
function updateFavoritesCountUI() {
    const favoritesButton = document.getElementById('favorites-button');
    if (favoritesButton) {
        // Обновляем класс кнопки в зависимости от наличия избранных товаров
        if (favoritesCount > 0) {
            favoritesButton.classList.add('favorites-has-items');
        } else {
            favoritesButton.classList.remove('favorites-has-items');
        }
    }
    
    // Обновляем счетчик в шапке избранного
    const favoritesTopMenuCount = document.getElementById('favorites-top-menu-count');
    if (favoritesTopMenuCount) {
        // Форматируем количество товаров
        let countText = '0 товаров';
        if (favoritesCount === 1) {
            countText = '1 товар';
        } else if (favoritesCount > 1 && favoritesCount < 5) {
            countText = `${favoritesCount} товара`;
        } else if (favoritesCount >= 5) {
            countText = `${favoritesCount} товаров`;
        }
        favoritesTopMenuCount.textContent = countText;
    }
}

/**
 * Инициализация модуля избранного
 */
export function initFavorites() {
    console.log('✅ [FAVORITES] Initializing favorites module');
    window.loadFavoritesPage = loadFavoritesPage;
    setupFavoritesButton();
    setTimeout(() => {
        syncFavoritesCache().catch(() => {});
    }, 500);
}

/**
 * Настройка кнопки избранного
 */
function setupFavoritesButton() {
    const favoritesButton = document.getElementById('favorites-button');
    if (favoritesButton) {
        favoritesButton.onclick = () => {
            openFavoritesPage();
        };
    }
}

/**
 * Открыть страницу избранного
 */
export async function openFavoritesPage() {
    try {
        const favoritesPage = document.getElementById('favorites-page');
        if (!favoritesPage) {
            console.error('❌ Favorites page not found');
            return;
        }
        
        // Единый способ: скрыть все страницы, затем показать избранное
        hideAllPages();
        favoritesPage.classList.add('is-active');
        favoritesPage.style.display = 'block';
        
        // Кнопки «Назад»/«Закрыть» — вешаем один раз (data-bound), чтобы не дублировать обработчики
        const favoritesPageBack = document.getElementById('favorites-page-back');
        if (favoritesPageBack && !favoritesPageBack.dataset.bound) {
            favoritesPageBack.dataset.bound = '1';
            favoritesPageBack.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeFavoritesPage();
            });
        }
        const favoritesPageClose = document.getElementById('favorites-page-close');
        if (favoritesPageClose && !favoritesPageClose.dataset.bound) {
            favoritesPageClose.dataset.bound = '1';
            favoritesPageClose.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeFavoritesPage();
            });
        }

        // Обновляем счетчик в шапке при открытии страницы
        updateFavoritesCountUI();
        
        // Загружаем избранные товары
        await loadFavoritesPage();
    } catch (error) {
        console.error('❌ Error opening favorites page:', error);
    }
}

/**
 * Закрыть страницу избранного. Сначала снимаем is-active и скрываем, затем goToMainContent().
 */
export async function closeFavoritesPage() {
    const favoritesPage = document.getElementById('favorites-page');
    if (favoritesPage) {
        favoritesPage.classList.remove('is-active');
        favoritesPage.style.display = 'none';
    }
    goToMainContent();

    // Синхронизируем кэш избранного и обновляем состояние сердечек на главной странице
    try {
        // Сначала синхронизируем кэш
        await syncFavoritesCache();
        
        // Перезагружаем данные для восстановления карточек и анимаций
        try {
            const dataModule = await import('./data.js');
            if (dataModule && dataModule.loadData) {
                await dataModule.loadData();
            }
        } catch (e) {
            console.warn('[FAVORITES] Failed to reload data after close:', e);
            // Fallback: обновляем только состояние избранного
            await refreshFavoritesOnMainPage();
        }
        
        // Дополнительная проверка: убеждаемся, что все блокировки сняты
        const productsGrid = document.getElementById('products-grid');
        if (productsGrid) {
            const allButtons = productsGrid.querySelectorAll('.favorite-button-card[data-processing="true"]');
            if (allButtons.length > 0) {
                allButtons.forEach(btn => {
                    delete btn.dataset.processing;
                    delete btn.dataset.processingStartTime;
                });
            }
        }
    } catch (error) {
        console.error('[FAVORITES] Error in closeFavoritesPage:', error);
        // Ошибки логируются только в бэкенде
    }
}

// Флаг для отслеживания обновления состояния (защита от race conditions)
let isRefreshingFavorites = false;

/**
 * Обновить состояние избранного на главной странице
 */
async function refreshFavoritesOnMainPage() {
    // Защита от одновременных вызовов
    if (isRefreshingFavorites) {
        console.log('[FAVORITES] refreshFavoritesOnMainPage: Already refreshing, skipping...');
        return;
    }
    
    isRefreshingFavorites = true;
    
    try {
        console.log('[FAVORITES] refreshFavoritesOnMainPage: Starting refresh...');
        const productsGrid = document.getElementById('products-grid');
        if (!productsGrid) {
            console.warn('[FAVORITES] refreshFavoritesOnMainPage: products-grid not found');
            return;
        }
        
        // Сначала синхронизируем кэш с сервером для всех товаров на странице
        const productCards = productsGrid.querySelectorAll('.product-card');
        const productIds = new Set(); // Используем Set для избежания дубликатов
        
        productCards.forEach(card => {
            const favoriteButton = card.querySelector('.favorite-button-card:not(.favorite-button-list)');
            if (favoriteButton) {
                const productId = parseInt(favoriteButton.dataset.productId);
                if (productId && !isNaN(productId)) {
                    productIds.add(productId);
                }
            }
        });
        
        console.log(`[FAVORITES] refreshFavoritesOnMainPage: Found ${productIds.size} products, current cache size: ${favoritesCache.size}`);
        
        // КРИТИЧНО: syncFavoritesCache уже был вызван в closeFavoritesPage
        // Поэтому кэш уже синхронизирован, нам нужно только обновить визуальное состояние
        // НО на всякий случай проверяем статус для товаров, которых нет в кэше
        // (на случай, если они были удалены на другой вкладке/устройстве)
        if (productIds.size > 0) {
            const productsToCheck = Array.from(productIds).filter(id => {
                // Проверяем только те товары, которые визуально в избранном, но не в кэше
                // или наоборот - это может указывать на рассинхронизацию
                const card = Array.from(productCards).find(c => {
                    const btn = c.querySelector(`.favorite-button-card[data-product-id="${id}"]:not(.favorite-button-list)`);
                    return btn !== null;
                });
                if (!card) return false;
                
                const favoriteButton = card.querySelector('.favorite-button-card:not(.favorite-button-list)');
                if (!favoriteButton) return false;
                
                const isVisuallyFavorite = favoriteButton.classList.contains('favorite-active');
                const isInCache = favoritesCache.has(id);
                
                // Проверяем только если есть рассинхронизация
                return isVisuallyFavorite !== isInCache;
            });
            
            // Проверяем только товары с рассинхронизацией (параллельно для скорости)
            if (productsToCheck.length > 0) {
                console.log(`[FAVORITES] refreshFavoritesOnMainPage: Found ${productsToCheck.length} products with state mismatch, re-checking...`);
                const checkPromises = productsToCheck.map(async (productId) => {
                    try {
                        const isFavorite = await checkFavorite(productId);
                        return { productId, isFavorite };
                    } catch (error) {
                        console.warn(`⚠️ Error checking favorite for product ${productId}:`, error);
                        return { productId, isFavorite: false };
                    }
                });
                
                await Promise.all(checkPromises);
                console.log(`[FAVORITES] refreshFavoritesOnMainPage: Re-synchronized ${productsToCheck.length} products, cache size: ${favoritesCache.size}`);
            } else {
                console.log(`[FAVORITES] refreshFavoritesOnMainPage: No state mismatches found, cache already in sync`);
            }
        }
        
        // КРИТИЧНО: Восстанавливаем обработчики кликов на карточках
        // Используем делегирование событий на уровне products-grid для надежности
        // Это гарантирует, что обработчики не потеряются при обновлении DOM
        if (productsGrid && !productsGrid.dataset.clickHandlerAttached) {
            productsGrid.addEventListener('click', async function productsGridClickHandler(e) {
                // Находим карточку товара, на которую кликнули
                const card = e.target.closest('.product-card');
                if (!card) return;
                
                // Проверяем, не кликнули ли на кнопку избранного или другие интерактивные элементы
                if (e.target.closest('.favorite-button-card') || 
                    e.target.closest('button') || 
                    e.target.closest('a')) {
                    return; // Не открываем модальное окно, если кликнули на кнопку
                }
                
                // Получаем productId из карточки
                const favoriteButton = card.querySelector('.favorite-button-card:not(.favorite-button-list)');
                if (!favoriteButton) return;
                
                const productId = parseInt(favoriteButton.dataset.productId);
                if (!productId || isNaN(productId)) return;
                
                // Получаем данные товара из глобального кэша или запрашиваем
                try {
                    // Пробуем получить из глобального кэша
                    const allProducts = window.getAllProducts ? window.getAllProducts() : null;
                    let product = null;
                    
                    if (allProducts && Array.isArray(allProducts)) {
                        product = allProducts.find(p => p.id === productId);
                    }
                    
                    // Если не нашли в кэше, запрашиваем с сервера
                    if (!product) {
                        const appContext = window.getAppContext ? window.getAppContext() : null;
                        if (appContext && appContext.shop_owner_id) {
                            // Используем API_BASE из импорта
                            const response = await fetch(`${API_BASE}/api/products/?user_id=${appContext.shop_owner_id}&viewer_id=${appContext.viewer_id || appContext.shop_owner_id}&bot_id=${appContext.bot_id || ''}`, {
                                headers: getBaseHeaders()
                            });
                            if (response.ok) {
                                const products = await response.json();
                                product = products.find(p => p.id === productId);
                            }
                        }
                    }
                    
                    if (product && window.showProductModal) {
                        // Получаем изображения товара
                        const imagesList = product.images_list || [];
                        const fullImages = imagesList.map(imgUrl => {
                            if (!imgUrl) return '';
                            if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
                                return imgUrl;
                            }
                            // Используем API_BASE из импорта
                            if (imgUrl.startsWith('/')) {
                                return API_BASE + imgUrl;
                            }
                            return API_BASE + '/' + imgUrl;
                        }).filter(url => url !== '');
                        
                        window.showProductModal(product, null, fullImages);
                    }
                } catch (error) {
                    // Ошибка при открытии товара - игнорируем
                }
            });
            
            // Помечаем, что обработчик установлен
            productsGrid.dataset.clickHandlerAttached = 'true';
        }
        
        // Обновляем визуальное состояние каждой кнопки избранного
        let updatedCount = 0;
        let processingFlagsRemoved = 0;
        
        for (const card of productCards) {
            const favoriteButton = card.querySelector('.favorite-button-card:not(.favorite-button-list)');
            if (favoriteButton) {
                const productId = parseInt(favoriteButton.dataset.productId);
                if (productId && !isNaN(productId)) {
                    const isFavorite = favoritesCache.has(productId);
                    const previousState = favoriteButton.classList.contains('favorite-active');
                    
                    // КРИТИЧНО: Снимаем блокировку ПЕРЕД обновлением состояния
                    // Это гарантирует, что обработчики кликов будут работать после обновления
                    if (favoriteButton.dataset.processing === 'true') {
                        delete favoriteButton.dataset.processing;
                        delete favoriteButton.dataset.processingStartTime;
                        processingFlagsRemoved++;
                    }
                    
                    // Обновляем состояние
                    updateFavoriteButtonState(favoriteButton, isFavorite);
                    
                    // Проверяем, что состояние обновилось правильно
                    const newState = favoriteButton.classList.contains('favorite-active');
                    if (previousState !== isFavorite) {
                        updatedCount++;
                    }
                }
            }
            
            // Также обновляем кнопку в режиме списка, если есть
            const favoriteButtonList = card.querySelector('.favorite-button-list');
            if (favoriteButtonList) {
                const productId = parseInt(favoriteButtonList.dataset.productId);
                if (productId && !isNaN(productId)) {
                    const isFavorite = favoritesCache.has(productId);
                    const previousState = favoriteButtonList.classList.contains('favorite-active');
                    
                    // КРИТИЧНО: Снимаем блокировку ПЕРЕД обновлением состояния
                    // Это гарантирует, что обработчики кликов будут работать после обновления
                    if (favoriteButtonList.dataset.processing === 'true') {
                        delete favoriteButtonList.dataset.processing;
                        delete favoriteButtonList.dataset.processingStartTime;
                        processingFlagsRemoved++;
                    }
                    
                    // Обновляем состояние
                    updateFavoriteButtonState(favoriteButtonList, isFavorite);
                    
                    // Проверяем, что состояние обновилось правильно
                    const newState = favoriteButtonList.classList.contains('favorite-active');
                    if (previousState !== isFavorite) {
                        // Логируем только если состояние изменилось
                    }
                    
                    // Дополнительная проверка после обновления - на всякий случай
                    if (favoriteButtonList.dataset.processing === 'true') {
                        delete favoriteButtonList.dataset.processing;
                        delete favoriteButtonList.dataset.processingStartTime;
                        processingFlagsRemoved++;
                    }
                }
            }
        }
        
        // Логирование только в бэкенде (убрано console.log)
    } catch (error) {
        console.error('❌ Error refreshing favorites on main page:', error);
    } finally {
        isRefreshingFavorites = false;
    }
}

/**
 * Обновить состояние кнопки избранного
 */
function updateFavoriteButtonState(button, favorite) {
    if (!button) return;
    
    // КРИТИЧНО: Убеждаемся, что обработчики не блокируются после обновления состояния
    // Снимаем флаг processing, если он был установлен (кроме случаев, когда это обновление из обработчика клика)
    // НЕ снимаем флаг, если он был установлен только что в обработчике клика
    // Это предотвращает конфликты между optimistic UI и обновлением состояния
    
    // Обновляем визуальное состояние синхронно
    if (favorite) {
        button.classList.add('favorite-active');
    } else {
        button.classList.remove('favorite-active');
    }
    
    // КРИТИЧНО: Принудительная синхронизация DOM
    // Это гарантирует, что обработчики кликов будут читать актуальное состояние
    void button.offsetHeight; // Принудительная перерисовка
}


/**
 * Загрузить и отобразить избранные товары на странице (экспорт для обновления UI после редактирования товара)
 */
export async function loadFavoritesPage() {
    try {
        const favoritesGrid = document.getElementById('favorites-items');
        if (!favoritesGrid) {
            console.error('❌ Favorites grid not found');
            return;
        }
        
        // Показываем загрузку
        favoritesGrid.innerHTML = '<p class="loading">Загрузка избранного...</p>';
        
        // Получаем контекст
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext || !appContext.shop_owner_id) {
            favoritesGrid.innerHTML = '<p class="loading">Ошибка: контекст недоступен</p>';
            return;
        }
        
        // Получаем избранные товары
        const products = await getFavorites(appContext.shop_owner_id);
        
        // Обновляем счетчик
        favoritesCount = products ? products.length : 0;
        updateFavoritesCountUI();
        
        if (!products || products.length === 0) {
            favoritesGrid.innerHTML = '<p class="loading" style="text-align: center; padding: 40px;">У вас пока нет избранных товаров</p>';
            return;
        }
        
        // Очищаем контейнер
        favoritesGrid.innerHTML = '';
        
        // Добавляем класс для режима сетки, чтобы CSS правильно скрывал элементы режима списка
        favoritesGrid.classList.add('products-grid-view');
        
        // Рендерим товары используя renderProducts
        // Временно используем productsGrid для рендеринга, потом переместим карточки
        const productsGrid = document.getElementById('products-grid');
        
        if (productsGrid) {
            // КРИТИЧНО: Сохраняем реальные DOM элементы, а не HTML строку
            // Это гарантирует, что обработчики событий не потеряются
            const originalCards = Array.from(productsGrid.querySelectorAll('.product-card'));
            const originalClass = productsGrid.className;
            
            // Временно устанавливаем productsGrid как контейнер для рендеринга
            productsGrid.className = 'products-grid-view';
            
            // Рендерим товары в productsGrid
            await renderProducts(products);
            
            // Перемещаем карточки в favoritesGrid и удаляем дубликаты
            const productCards = productsGrid.querySelectorAll('.product-card');
            
            // Создаем Set избранных ID для быстрой проверки и мапу продуктов
            const favoriteIds = new Set(products.map(p => p.id));
            const productsMap = new Map(products.map(p => [p.id, p]));
            
            productCards.forEach(card => {
                // Клонируем карточку
                const clonedCard = card.cloneNode(true);
                
                // Получаем productId из карточки
                const productId = parseInt(clonedCard.dataset.productId || clonedCard.querySelector('[data-product-id]')?.dataset.productId);
                const prod = productsMap.get(productId);
                
                if (!prod) return;
                
                // Удаляем элементы режима списка (дубликаты)
                // Удаляем все элементы, которые используются только в режиме списка
                const listElements = clonedCard.querySelectorAll(
                    '.product-top-badges-list, ' +
                    '.product-name-list, ' +
                    '.product-description-list, ' +
                    '.product-list-prices, ' +
                    '.product-list-prices-right-container, ' +
                    '.product-list-right-side, ' +
                    '.product-quantity-badge-list, ' +
                    '.cart-button-list, ' +
                    '.favorite-button-list, ' +
                    '.product-list-price-status, ' +
                    '.product-list-old-price, ' +
                    '.product-list-card-price, ' +
                    '.product-list-cash-price, ' +
                    '.product-list-price-single'
                );
                listElements.forEach(el => el.remove());
                
                // Синхронизируем состояние сердца для избранных товаров
                const favoriteButton = clonedCard.querySelector('.favorite-button-card:not(.favorite-button-list)');
                if (favoriteButton) {
                    if (favoriteIds.has(productId)) {
                        // Это избранный товар, должно быть активное состояние
                        favoriteButton.classList.add('favorite-active');
                    }
                    
                    // Обновляем обработчик клика для удаления из избранного на странице избранного
                    favoriteButton.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        // Удаляем товар из избранного
                        try {
                            const newState = !favoriteButton.classList.contains('favorite-active');
                            favoriteButton.classList.toggle('favorite-active', newState);
                            
                            const result = await toggleFavorite(productId);
                            
                            // Если товар удален из избранного, удаляем карточку со страницы
                            if (!result.is_favorite) {
                                clonedCard.remove();
                                // Счетчик уже обновлен внутри toggleFavorite
                                // Обновляем состояние на главной странице
                                await refreshFavoritesOnMainPage();
                                // Проверяем, остались ли еще товары
                                if (favoritesGrid.children.length === 0) {
                                    favoritesGrid.innerHTML = '<p class="loading" style="text-align: center; padding: 40px;">У вас пока нет избранных товаров</p>';
                                }
                            } else {
                                // Синхронизируем состояние
                                favoriteButton.classList.toggle('favorite-active', result.is_favorite);
                            }
                        } catch (error) {
                            // Ошибка при изменении избранного - игнорируем
                            // Откатываем изменение
                            favoriteButton.classList.toggle('favorite-active');
                        }
                    });
                }
                
                // Восстанавливаем обработчик клика на кнопку корзины - показываем bottom sheet
                const cartButton = clonedCard.querySelector('.cart-button-card:not(.cart-button-list)');
                if (cartButton) {
                    cartButton.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Предотвращаем открытие модального окна товара
                        e.preventDefault(); // Предотвращаем стандартное поведение
                        
                        try {
                            // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ==========
                            let actualProduct = prod;
                            const allProducts = window.getAllProducts ? window.getAllProducts() : null;
                            if (Array.isArray(allProducts)) {
                                const freshProduct = allProducts.find(p => p && p.id === prod.id);
                                if (freshProduct) actualProduct = freshProduct;
                            }
                            // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
                            
                            // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
                            const appContext = window.getAppContext ? window.getAppContext() : null;
                            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                            const { getProductActionType, canAddToCart } = await import('./utils/productActionType.js');
                            const actionType = getProductActionType(actualProduct, appContext, shopSettings);
                            
                            // ВАЛИДАЦИЯ: Используем can_add_to_cart от бэка или вычисляем
                            const canAdd = canAddToCart(actualProduct, appContext, shopSettings);
                            if (canAdd) {
                                const { isProductInCart, getProductQuantityInCart } = await import('./cart/cartStore.js');
                                const isInCart = isProductInCart(actualProduct.id);
                                const currentQuantity = getProductQuantityInCart(actualProduct.id);
                                
                                if (!isInCart || currentQuantity === 0) {
                                    const { addProductToCart } = await import('./cart/cartNew.js');
                                    await addProductToCart(actualProduct, 1);
                                }
                            } else {
                                console.log(`[FAVORITES] Skipping add-to-cart for product ${prod.id}: can_add_to_cart=false, actionType=${actionType}, reason=${actualProduct.reason_not_sale || 'unknown'}`);
                            }
                            
                            // Открываем bottom sheet с АКТУАЛЬНЫМ продуктом
                            const { showCartBottomSheet } = await import('./cart/cartBottomSheet.js');
                            await showCartBottomSheet(actualProduct);
                            
                            // Обновляем состояние кнопок корзины
                            if (window.updateCartButtonsState) {
                                window.updateCartButtonsState();
                            }
                        } catch (error) {
                            console.error('❌ Error showing bottom sheet:', error);
                            alert('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
                        }
                    });
                }
                
                // Добавляем обработчик клика на карточку для открытия товара
                clonedCard.addEventListener('click', (e) => {
                    // Проверяем, не кликнули ли на кнопку избранного или корзины
                    if (e.target.closest('.favorite-button-card') || 
                        e.target.closest('.cart-button-card')) {
                        return;
                    }
                    
                    // Открываем модальное окно товара
                    if (window.showProductModal) {
                        window.showProductModal(prod, null, null);
                    } else {
                        // Fallback: пробуем импортировать функцию
                        import('./products.js').then(module => {
                            if (module.showProductModal) {
                                module.showProductModal(prod, null, null);
                            }
                        }).catch(err => {
                            // Ошибка при открытии товара - игнорируем
                        });
                    }
                });
                
                favoritesGrid.appendChild(clonedCard);
            });
            
            // Обновляем состояние всех кнопок действий на странице избранного
            // Badge показывается только для типа 'sale'
            setTimeout(() => {
                Promise.all([
                    import('./cart/cartStore.js'),
                    import('./utils/productActionType.js')
                ]).then(([cartStore, actionTypeModule]) => {
                    const allActionButtons = favoritesGrid.querySelectorAll('.cart-button-card[data-product-id]');
                    const appContext = window.getAppContext ? window.getAppContext() : null;
                    const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                    
                    allActionButtons.forEach(button => {
                        const productId = parseInt(button.dataset.productId);
                        if (productId && !isNaN(productId)) {
                            // Находим товар в мапе
                            const prod = productsMap.get(productId);
                            if (prod) {
                                const actionType = actionTypeModule.getProductActionType(prod, appContext, shopSettings);
                                
                                // Badge показывается только для типа 'sale'
                                if (actionType === 'sale') {
                                    const quantity = cartStore.getProductQuantityInCart(productId);
                                    const badge = button.querySelector('.cart-icon-badge');
                                    
                                    if (quantity > 0) {
                                        button.classList.add('cart-active');
                                        if (badge) {
                                            badge.textContent = quantity > 99 ? '99+' : quantity.toString();
                                            badge.style.display = 'flex';
                                        }
                                    } else {
                                        button.classList.remove('cart-active');
                                        if (badge) {
                                            badge.style.display = 'none';
                                        }
                                    }
                                }
                            }
                        }
                    });
                }).catch(() => {
                    // Игнорируем ошибки импорта
                });
            }, 100);
            
            // КРИТИЧНО: Восстанавливаем productsGrid правильно
            // Очищаем временные карточки
            productsGrid.innerHTML = '';
            
            // Восстанавливаем оригинальные карточки (если они были)
            originalCards.forEach(card => {
                productsGrid.appendChild(card);
            });
            
            productsGrid.className = originalClass;
        } else {
            // Если productsGrid недоступен, создаем карточки вручную (fallback)
            products.forEach(product => {
                const card = createProductCard(product);
                favoritesGrid.appendChild(card);
            });
        }
        
        // Счетчик уже установлен из products.length и updateFavoritesCountUI() выше
    } catch (error) {
        console.error('❌ Error loading favorites page:', error);
        const favoritesGrid = document.getElementById('favorites-items');
        if (favoritesGrid) {
            favoritesGrid.innerHTML = '<p class="loading" style="text-align: center; padding: 40px; color: #ff6b6b;">Ошибка загрузки избранного</p>';
        }
    }
}

/**
 * Создать карточку товара (fallback функция)
 */
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;
    
    // Получаем URL изображения
    let imageUrl = '';
    if (product.images_urls) {
        try {
            const images = JSON.parse(product.images_urls);
            imageUrl = images[0] || product.image_url || '';
        } catch (e) {
            imageUrl = product.image_url || '';
        }
    } else {
        imageUrl = product.image_url || '';
    }
    
    const baseUrl = window.BASE_URL || '';
    const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : (baseUrl + imageUrl);
    
    // Используем новую логику цен
    const basePrice = getBasePrice(product);
    const hasActiveDiscount = hasDiscount(product);
    const finalPrice = getFinalCardPrice(product);
    const oldPrice = getOldPriceForDisplay(product);
    
    card.innerHTML = `
        <div class="product-image" style="background-image: url('${fullImageUrl}'); background-size: cover;">
            ${hasActiveDiscount ? `<div class="discount-badge">-${product.discount}%</div>` : ''}
        </div>
        <div class="product-name">${product.name}</div>
        <div class="product-price-container">
            <span class="product-price">${finalPrice !== null ? `${finalPrice.toLocaleString('ru-RU')} ₽` : 'Цена по запросу'}</span>
            ${hasActiveDiscount && oldPrice !== null ? `<span class="old-price">${oldPrice.toLocaleString('ru-RU')} ₽</span>` : ''}
        </div>
    `;
    
    // Добавляем обработчик клика для открытия страницы товара
    card.addEventListener('click', () => {
        if (showProductModal) {
            showProductModal(product.id);
        }
    });
    
    return card;
}
