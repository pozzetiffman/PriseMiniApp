// Модуль для рендеринга товаров
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 4.1: renderProducts ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { getCurrentShopSettings } from '../admin.js';
import { API_BASE } from '../api.js';
// ========== REFACTORING STEP 3.1: showProductModal ==========
// НОВЫЙ КОД (используется сейчас)
import { showProductModal } from './products_modal.js'; // Импортируем из нового модуля
// ========== END REFACTORING STEP 3.1 ==========
// favorites.js - необязательный модуль, используется через динамический импорт
import { createImageSlider } from '../utils/imageSlider.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import { isMobileDevice } from '../utils/products_utils.js';

// Зависимости, которые будут переданы из products.js через initRenderProductsDependencies
let productsGridElement = null;
let appContextGetter = null;

// Безопасные функции для работы с favorites (необязательный модуль)
async function safeCheckFavorite(productId) {
    try {
        const favoritesModule = await import('../favorites.js');
        if (favoritesModule.checkFavorite) {
            return await favoritesModule.checkFavorite(productId);
        }
    } catch (e) {
        // Игнорируем ошибку, модуль необязательный
    }
    return false;
}

async function safeToggleFavorite(productId) {
    try {
        const favoritesModule = await import('../favorites.js');
        if (favoritesModule.toggleFavorite) {
            return await favoritesModule.toggleFavorite(productId);
        }
    } catch (e) {
        // Игнорируем ошибку, модуль необязательный
    }
    return { is_favorite: false };
} // Функция для получения актуального appContext

// Инициализация зависимостей для renderProducts
export function initRenderProductsDependencies(dependencies) {
    productsGridElement = dependencies.productsGrid;
    appContextGetter = dependencies.appContext; // Функция-геттер для получения актуального appContext
}

// Рендеринг товаров
export async function renderProducts(products) {
    if (!productsGridElement) {
        console.error('❌ productsGrid element not initialized!');
        return;
    }
    
    productsGridElement.innerHTML = '';
    // Forced reflow для Telegram WebView (гарантирует обновление UI после очистки DOM)
    void productsGridElement.offsetHeight;
    
    // СИНХРОНИЗАЦИЯ: Загружаем все избранные товары сразу для синхронизации сердечек
    // Важно: синхронизируем кэш ДО рендеринга товаров, чтобы сердечки отображались правильно
    // favorites.js - необязательный модуль
    try {
        const favoritesModule = await import('../favorites.js');
        if (favoritesModule.syncFavoritesCache) {
            await favoritesModule.syncFavoritesCache();
        }
    } catch (e) {
        // Игнорируем ошибку, модуль необязательный
    }
    
    // Отладочный вывод - проверяем, что приходит с сервера
    console.log('[RENDER DEBUG] Products received:', products);
    if (products && products.length > 0) {
        console.log('[RENDER DEBUG] First product is_made_to_order:', products[0].is_made_to_order, 'type:', typeof products[0].is_made_to_order);
    }
    
    if (!products || products.length === 0) {
        // Не устанавливаем loading - просто рендерим пустой контент
        // Loading управляется только в data.js
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
        
        // Получаем контекст приложения для проверки роли
        const currentAppContextForCard = appContextGetter ? appContextGetter() : null;
        const isHiddenForAdmin = prod.is_hidden && currentAppContextForCard && currentAppContextForCard.role === 'owner' && prod.user_id === currentAppContextForCard.shop_owner_id;
        
        // Применяем тусклость для скрытых товаров (только для админа)
        if (isHiddenForAdmin) {
            card.style.opacity = '0.5';
        }
        
        // Бейдж резервации будет добавлен в нижнюю часть фото
        let reservedBadge = null;
        if (prod.reservation) {
            // Если товар не скрыт для админа, применяем тусклость для резервации
            if (!isHiddenForAdmin) {
                card.style.opacity = '0.7';
            }
            // Если товар и скрыт, и зарезервирован, используем более тусклую opacity
            else {
                card.style.opacity = '0.4';
            }
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
        
        // Контейнер для слайдера изображений
        const imageDiv = document.createElement('div');
        imageDiv.className = 'product-image';
        // КРИТИЧНО: position: relative для позиционирования сердечка внутри imageDiv
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
        
        // Создаем badge горящего предложения с анимацией
        let hotOfferBadge = null;
        if (prod.is_hot_offer) {
            hotOfferBadge = document.createElement('div');
            hotOfferBadge.className = 'hot-offer-badge';
            hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
            // Создаем структуру с анимированным огнем и искрами
            hotOfferBadge.innerHTML = `
                <span class="fire-wrap" aria-hidden="true">
                    <span class="fire-back">🔥</span>
                    <span class="fire-front">🔥</span>
                    <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                    <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
                </span>
            `;
        }
        
        // Создаем кнопку избранного (сердечко) - SVG иконка на фото товара
        // Кнопка избранного доступна только для клиентов, не для админа
        const currentAppContextForFavorite = appContextGetter ? appContextGetter() : null;
        const isClient = currentAppContextForFavorite && currentAppContextForFavorite.role === 'client';
        
        let favoriteButton = null;
        let isFavorite = false;
        
        // Функция обновления состояния кнопки избранного
        function updateFavoriteButtonState(button, favorite) {
            // Работаем с новым SVG классом .favorite-heart
            if (favorite) {
                button.classList.add('favorite-active');
            } else {
                button.classList.remove('favorite-active');
            }
        }
        
        // Создаем кнопку избранного только для клиентов
        if (isClient) {
            favoriteButton = document.createElement('button');
            favoriteButton.className = 'favorite-button-card';
            favoriteButton.setAttribute('aria-label', 'Добавить в избранное');
            favoriteButton.dataset.productId = prod.id;
            
            // SVG иконка сердца - симметричная форма
            favoriteButton.innerHTML = `
                <svg viewBox="0 0 24 24" class="favorite-heart" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            `;
            
            // Проверяем статус избранного асинхронно (синхронизация с backend)
            // Используем единый источник истины - API
            // Проверяем что prod.id существует перед вызовом API
            if (prod.id) {
                safeCheckFavorite(prod.id).then(favorite => {
                    isFavorite = favorite;
                    updateFavoriteButtonState(favoriteButton, favorite);
                }).catch(() => {
                    updateFavoriteButtonState(favoriteButton, false);
                });
            } else {
                console.warn('⚠️ Product without ID, skipping favorite check:', prod);
                updateFavoriteButtonState(favoriteButton, false);
            }
            
            // Обработчик клика на кнопку избранного (optimistic UI)
            favoriteButton.addEventListener('click', async (e) => {
                e.stopPropagation(); // Предотвращаем открытие модального окна товара
                e.preventDefault(); // Предотвращаем стандартное поведение
                
                // Защита от повторных кликов во время обработки
                // НО если кнопка заблокирована слишком долго (> 5 секунд), разблокируем её
                if (favoriteButton.dataset.processing === 'true') {
                    const processingStartTime = parseInt(favoriteButton.dataset.processingStartTime || '0');
                    const now = Date.now();
                    if (processingStartTime && (now - processingStartTime) > 5000) {
                        console.warn(`[FAVORITES] Button for product ${prod.id} was blocked for too long (${now - processingStartTime}ms), unblocking...`);
                        delete favoriteButton.dataset.processing;
                        delete favoriteButton.dataset.processingStartTime;
                    } else {
                        console.log(`[FAVORITES] Click ignored for product ${prod.id}: already processing`);
                        return;
                    }
                }
                
                // КРИТИЧНО: Используем актуальное состояние из DOM, а не локальную переменную
                // Это гарантирует правильную работу после возврата со страницы избранного
                // Читаем состояние СИНХРОННО после проверки блокировки
                const currentFavoriteState = favoriteButton.classList.contains('favorite-active');
                
                console.log(`[FAVORITES] Click on favorite button for product ${prod.id}, current state: ${currentFavoriteState}`);
                
                // Optimistic UI - меняем состояние МГНОВЕННО
                const newFavoriteState = !currentFavoriteState;
                favoriteButton.dataset.processing = 'true'; // Блокируем повторные клики
                favoriteButton.dataset.processingStartTime = Date.now().toString(); // Запоминаем время блокировки
                isFavorite = newFavoriteState;
                
                // Функция для обновления всех кнопок избранного для этого товара (optimistic)
                function updateAllFavoriteButtonsForProductOptimistic(productId, isFavorite) {
                    // Находим и обновляем все кнопки избранного для этого товара
                    const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                    allFavoriteButtons.forEach(btn => {
                        updateFavoriteButtonState(btn, isFavorite);
                    });
                    console.log(`[FAVORITES] Optimistic update: ${allFavoriteButtons.length} buttons for product ${productId}, state: ${isFavorite}`);
                }
                
                // Обновляем ВСЕ кнопки избранного для этого товара (optimistic)
                updateAllFavoriteButtonsForProductOptimistic(prod.id, newFavoriteState);
                
                // Запрос в API - асинхронно (в фоне)
                // toggleFavorite автоматически обновляет кэш в favorites.js
                try {
                    console.log(`[FAVORITES] Toggling favorite for product ${prod.id}, current state: ${currentFavoriteState}, new state: ${newFavoriteState}`);
                    const result = await safeToggleFavorite(prod.id);
                    console.log(`[FAVORITES] Toggle result for product ${prod.id}:`, result);
                    
                    // КРИТИЧНО: Всегда синхронизируем с ответом сервера
                    // Это гарантирует правильное состояние даже если был рассинхронизация
                    isFavorite = result.is_favorite;
                    
                    // Функция для обновления всех кнопок избранного для этого товара
                    function updateAllFavoriteButtonsForProduct(productId, isFavorite) {
                        // Находим и обновляем все кнопки избранного для этого товара
                        const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                        allFavoriteButtons.forEach(btn => {
                            updateFavoriteButtonState(btn, isFavorite);
                        });
                        console.log(`[FAVORITES] Server sync: ${allFavoriteButtons.length} buttons for product ${productId}, state: ${isFavorite}`);
                    }
                    
                    // Обновляем ВСЕ кнопки избранного для этого товара
                    updateAllFavoriteButtonsForProduct(prod.id, result.is_favorite);
                    
                    // КРИТИЧНО: updateFavoritesCount уже вызывается в toggleFavorite
                    // Но на всякий случай вызываем еще раз для гарантии обновления
                    // (toggleFavorite уже обновил, но это не помешает)
                    try {
                        // Правильный путь: из handlers/ в js/ - это ../favorites.js
                        const { updateFavoritesCount } = await import('../favorites.js');
                        await updateFavoritesCount();
                    } catch (importError) {
                        // Не критично, toggleFavorite уже обновил состояние
                    }
                } catch (error) {
                    console.error('❌ Error toggling favorite:', error);
                    console.error('❌ Error details:', {
                        message: error.message,
                        stack: error.stack,
                        productId: prod.id,
                        currentFavoriteState: currentFavoriteState,
                        newFavoriteState: newFavoriteState
                    });
                    // Откатываем optimistic изменение при ошибке
                    // Используем исходное состояние (до клика)
                    isFavorite = currentFavoriteState;
                    
                    // Функция для отката всех кнопок избранного для этого товара
                    function rollbackAllFavoriteButtonsForProduct(productId, isFavorite) {
                        // Находим и откатываем все кнопки избранного для этого товара
                        const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                        allFavoriteButtons.forEach(btn => {
                            updateFavoriteButtonState(btn, isFavorite);
                        });
                        console.log(`[FAVORITES] Rollback: ${allFavoriteButtons.length} buttons for product ${productId}, state: ${isFavorite}`);
                    }
                    
                    // Откатываем ВСЕ кнопки избранного для этого товара
                    rollbackAllFavoriteButtonsForProduct(prod.id, currentFavoriteState);
                    
                    // Показываем более информативное сообщение об ошибке
                    const errorMessage = error.message || 'Ошибка при изменении избранного';
                    console.error('❌ Showing error to user:', errorMessage);
                    alert(errorMessage);
                } finally {
                    // Снимаем блокировку
                    delete favoriteButton.dataset.processing;
                }
            });
        }
        
        // Создаем кнопку корзины (левый нижний угол) - только для клиентов и только на странице избранного
        let cartButton = null;
        // Проверяем, находимся ли мы на странице избранного
        const favoritesPage = document.getElementById('favorites-page');
        const isOnFavoritesPage = favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex');
        
        if (isClient && isOnFavoritesPage) {
            cartButton = document.createElement('button');
            cartButton.className = 'cart-button-card';
            cartButton.setAttribute('aria-label', 'Добавить в корзину');
            cartButton.dataset.productId = prod.id;
            
            // SVG иконка корзины (тележка) с индикатором количества
            cartButton.innerHTML = `
                <svg viewBox="0 0 24 24" class="cart-icon" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path class="cart-icon-outline" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
                </svg>
                <span class="cart-icon-badge" style="display: none;">0</span>
            `;
            
            // Проверяем, есть ли товар в корзине, и устанавливаем активное состояние с количеством
            // Делаем это асинхронно после создания всех кнопок
            setTimeout(() => {
                import('../cart/cartStore.js').then(({ isProductInCart, getProductQuantityInCart }) => {
                    const quantity = getProductQuantityInCart(prod.id);
                    if (quantity > 0) {
                        cartButton.classList.add('cart-active');
                        const badge = cartButton.querySelector('.cart-icon-badge');
                        if (badge) {
                            badge.textContent = quantity > 99 ? '99+' : quantity.toString();
                            badge.style.display = 'flex';
                        }
                    }
                }).catch(() => {
                    // Игнорируем ошибки импорта
                });
            }, 0);
            
            // Обработчик клика на кнопку корзины - показываем bottom sheet только на странице избранного
            cartButton.addEventListener('click', async (e) => {
                e.stopPropagation(); // Предотвращаем открытие модального окна товара
                e.preventDefault(); // Предотвращаем стандартное поведение
                
                // Проверяем, что мы все еще на странице избранного
                const favoritesPage = document.getElementById('favorites-page');
                const isOnFavoritesPage = favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex');
                
                if (!isOnFavoritesPage) {
                    return; // Не показываем bottom sheet, если не на странице избранного
                }
                
                try {
                    // Проверяем, есть ли товар уже в корзине
                    const { isProductInCart, getProductQuantityInCart } = await import('../cart/cartStore.js');
                    const isInCart = isProductInCart(prod.id);
                    const currentQuantity = getProductQuantityInCart(prod.id);
                    
                    // Если товара нет в корзине, добавляем его с количеством 1
                    if (!isInCart || currentQuantity === 0) {
                        const { addProductToCart } = await import('../cart/cartNew.js');
                        await addProductToCart(prod, 1);
                    }
                    // Если товар уже есть в корзине, просто открываем bottom sheet без добавления
                    
                    // Открываем bottom sheet только на странице избранного
                    const { showCartBottomSheet } = await import('../cart/cartBottomSheet.js');
                    showCartBottomSheet(prod);
                    
                    // Обновляем состояние кнопок корзины
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                } catch (error) {
                    console.error('❌ Error adding product to cart or showing bottom sheet:', error);
                    alert('Ошибка при добавлении товара в корзину: ' + (error.message || 'Неизвестная ошибка'));
                }
            });
        }
        
        // Создаем badge скрытого товара (только для админа)
        let hiddenBadge = null;
        if (isHiddenForAdmin) {
            hiddenBadge = document.createElement('div');
            hiddenBadge.className = 'hidden-badge';
            // Используем SVG иконку зачеркнутого глаза (как в Photoshop)
            hiddenBadge.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 9C13.6569 9 15 10.3431 15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
            `;
            hiddenBadge.setAttribute('aria-label', 'Скрыт от клиентов');
            hiddenBadge.style.cssText = `
                position: absolute;
                top: 8px;
                left: 8px;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                color: #ffffff;
                padding: 8px;
                border-radius: 50%;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 15;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6), 0 0 0 2px rgba(255, 255, 255, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.2);
            `;
            hiddenBadge.querySelector('svg').style.cssText = 'width: 100%; height: 100%;';
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
            quantityBadge.className = 'product-quantity-text';
            // Формируем текст с количеством от и единицей измерения
            let badgeText = 'покупка';
            const quantityFrom = prod.quantity_from !== null && prod.quantity_from !== undefined ? prod.quantity_from : null;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantityFrom !== null && quantityFrom !== undefined) {
                badgeText = `от ${quantityFrom} ${quantityUnit}`;
            } else {
                badgeText = 'покупка';
            }
            quantityBadge.textContent = badgeText;
            quantityBadge.style.color = 'rgba(255, 149, 0, 0.95)'; // Оранжевый для покупки
        } else if (isMadeToOrder) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-text';
            quantityBadge.textContent = 'под заказ';
            quantityBadge.style.color = 'rgba(90, 200, 250, 0.95)'; // Синий для под заказ
        } else if (prod.quantity !== undefined && prod.quantity !== null) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-text';
            const quantity = prod.quantity;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantity > 0) {
                // Проверяем активные резервации
                const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
                const availableCount = quantity - activeReservationsCount;
                
                // Если quantity_enabled включен, показываем количество с учетом резерваций
                if (quantityEnabled) {
                    if (activeReservationsCount > 0) {
                        // Если есть резервации, показываем "доступно: X из Y единица"
                        quantityBadge.textContent = `доступно: ${availableCount} из ${quantity} ${quantityUnit}`;
                    } else {
                        // Если резерваций нет, показываем просто "в наличии: Y единица"
                        quantityBadge.textContent = `в наличии: ${quantity} ${quantityUnit}`;
                    }
                } else {
                    // Если quantity_enabled выключен, показываем просто "в наличии"
                    quantityBadge.textContent = 'в наличии';
                }
                quantityBadge.style.color = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
            } else {
                quantityBadge.textContent = 'нет в наличии';
                quantityBadge.style.color = 'rgba(255, 59, 48, 0.95)'; // Красный для отсутствия
            }
        } else if (!quantityEnabled) {
            // Если quantity_enabled выключен и quantity не указан, показываем просто "в наличии"
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-text';
            quantityBadge.textContent = 'в наличии';
            quantityBadge.style.color = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
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
        productsGridElement.appendChild(card);
        
        // ДИАГНОСТИКА: Проверяем, что card в DOM
        if (prod.id) {
            console.log(`[IMG DEBUG] Product ${prod.id}: card added to productsGrid, in DOM: ${productsGridElement.contains(card)}`);
        }
        
        // Используем все изображения для слайдера
        const imagesToShow = fullImages.length > 0 ? fullImages : (fullImg ? [fullImg] : []);
        
        // Сохраняем ссылку на индикаторы для добавления в карточку
        let indicatorsContainer = null;
        
        if (imagesToShow.length > 0) {
            // Определяем, мобильное устройство или десктоп
            const isMobile = isMobileDevice();
            
            // Создаем слайдер - он автоматически создаст структуру внутри imageDiv
            const slider = createImageSlider(imageDiv, imagesToShow, {
                isMobile: isMobile,
                onImageLoad: (img, index) => {
                    if (prod.id && index === 0) {
                        console.log(`[IMG DEBUG] Product ${prod.id}: Image ${index} loaded`);
                    }
                },
                onImageError: (img, index) => {
                    if (prod.id) {
                        console.error(`[IMG DEBUG] Product ${prod.id}: Image ${index} load error`);
                    }
                }
            });
            
            // Сохраняем ссылку на индикаторы
            if (slider && slider.indicatorsContainer) {
                indicatorsContainer = slider.indicatorsContainer;
            }
            
            // Добавляем badge скидки (чтобы он был поверх)
            if (discountBadge) {
                discountBadge.style.zIndex = '10';
                discountBadge.style.position = 'absolute';
                imageDiv.appendChild(discountBadge);
            }
            
            // Добавляем badge скрытого товара (слева вверху, только для админа)
            if (hiddenBadge) {
                imageDiv.appendChild(hiddenBadge);
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
            
            // Добавляем кнопку избранного на фото (правый нижний угол) - только для клиентов
            if (favoriteButton) {
                imageDiv.appendChild(favoriteButton);
            }
            // Добавляем кнопку корзины на фото (левый нижний угол) - только для клиентов
            if (cartButton) {
                imageDiv.appendChild(cartButton);
            }
            
            // Добавляем badge резервации в нижней части фото
            if (reservedBadge) {
                imageDiv.appendChild(reservedBadge);
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
            
            // Добавляем badge скрытого товара даже если нет изображения (слева вверху, только для админа)
            if (hiddenBadge) {
                imageDiv.appendChild(hiddenBadge);
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
            
            // Добавляем кнопку избранного на фото (правый нижний угол) - только для клиентов
            if (favoriteButton) {
                imageDiv.appendChild(favoriteButton);
            }
            // Добавляем кнопку корзины на фото (левый нижний угол) - только для клиентов
            if (cartButton) {
                imageDiv.appendChild(cartButton);
            }
            
            // Добавляем badge резервации в нижней части фото даже если нет изображения
            if (reservedBadge) {
                imageDiv.appendChild(reservedBadge);
            }
        }
        
        // Добавляем индикаторы под фото (если есть несколько изображений)
        if (indicatorsContainer && imagesToShow.length > 1) {
            card.appendChild(indicatorsContainer);
        }
        
        // Название
        const nameDiv = document.createElement('div');
        nameDiv.className = 'product-name';
        nameDiv.textContent = prod.name;
        
        // Описание товара (ограничено до 50 символов)
        let descriptionDiv = null;
        if (prod.description) {
            descriptionDiv = document.createElement('div');
            descriptionDiv.className = 'product-description';
            let descriptionText = prod.description.trim();
            if (descriptionText.length > 50) {
                descriptionText = descriptionText.substring(0, 50) + '...';
            }
            descriptionDiv.textContent = descriptionText;
        }
        
        // Используем функцию из priceUtils.js для форматирования цены
        const priceDisplay = getProductPriceDisplay(prod);
        
        // Старая цена при скидке (только для обычных товаров)
        const isForSaleCard = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        // Добавляем элементы в правильном порядке: название, описание, старая цена, цена по карте, цена наличными
        card.appendChild(nameDiv);
        
        // Добавляем описание после названия, если оно есть
        if (descriptionDiv) {
            card.appendChild(descriptionDiv);
        }
        
        // Старая цена (зачеркнутая серая) - если есть скидка
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const oldPriceDiv = document.createElement('div');
            oldPriceDiv.className = 'old-price-container';
            const oldPriceSpan = document.createElement('span');
            oldPriceSpan.className = 'old-price';
            // Форматируем старую цену с пробелами между тысячами
            oldPriceSpan.textContent = `${Number(prod.price).toLocaleString('ru-RU')}₽`;
            oldPriceDiv.appendChild(oldPriceSpan);
            card.appendChild(oldPriceDiv);
        }
        
        // Цена по карте (со скидкой) - если есть скидка
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const cardPriceDiv = document.createElement('div');
            cardPriceDiv.className = 'product-price-container';
            const priceSpan = document.createElement('span');
            priceSpan.className = 'product-price';
            priceSpan.textContent = priceDisplay;
            
            // Добавляем иконку карточки красного цвета рядом с ценой по карте
            const cardIcon = document.createElement('span');
            cardIcon.className = 'product-card-icon';
            cardIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="5" width="20" height="14" rx="2" stroke="#E35E45" stroke-width="2"/>
                    <path d="M2 10H22" stroke="#E35E45" stroke-width="2"/>
                    <path d="M6 15H10" stroke="#E35E45" stroke-width="2" stroke-linecap="round"/>
                </svg>
            `;
            priceSpan.appendChild(cardIcon);
            cardPriceDiv.appendChild(priceSpan);
            card.appendChild(cardPriceDiv);
        } else {
            // Если нет скидки, просто добавляем обычную цену
            const priceDiv = document.createElement('div');
            priceDiv.className = 'product-price-container';
            const priceSpan = document.createElement('span');
            priceSpan.className = 'product-price';
            priceSpan.textContent = priceDisplay;
            priceDiv.appendChild(priceSpan);
            card.appendChild(priceDiv);
        }
        
        // Цена наличными (без скидки) - если есть скидка
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const cashPriceDiv = document.createElement('div');
            cashPriceDiv.className = 'product-cash-price-container';
            const cashPriceSpan = document.createElement('span');
            cashPriceSpan.className = 'product-cash-price';
            // Форматируем цену наличными с пробелами между тысячами
            cashPriceSpan.textContent = `${Number(prod.price).toLocaleString('ru-RU')}₽`;
            
            // Добавляем иконку наличных зеленого цвета рядом с ценой наличными
            const cashIcon = document.createElement('span');
            cashIcon.className = 'product-cash-icon';
            cashIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="5" width="20" height="14" rx="2" stroke="#00A82E" stroke-width="2"/>
                    <circle cx="12" cy="12" r="3" stroke="#00A82E" stroke-width="2"/>
                </svg>
            `;
            cashPriceSpan.appendChild(cashIcon);
            cashPriceDiv.appendChild(cashPriceSpan);
            card.appendChild(cashPriceDiv);
        }
        
        // Количество товара под ценой (текст без блока)
        if (quantityBadge) {
            // Убираем абсолютное позиционирование, так как теперь это обычный блок
            quantityBadge.style.position = 'static';
            quantityBadge.style.zIndex = 'auto';
            quantityBadge.style.bottom = 'auto';
            quantityBadge.style.right = 'auto';
            quantityBadge.style.left = 'auto';
            card.appendChild(quantityBadge);
        }
        
        // Для режима списка создаем специальную структуру
        const topBadgesContainer = document.createElement('div');
        topBadgesContainer.className = 'product-top-badges-list';
        
        // Бейдж скидки для режима списка (если есть скидка)
        if (prod.discount > 0) {
            const discountBadgeList = document.createElement('div');
            discountBadgeList.className = 'discount-badge-list';
            discountBadgeList.textContent = `-${prod.discount}%`;
            topBadgesContainer.appendChild(discountBadgeList);
        }
        
        // Бейдж горящего предложения для режима списка (если есть)
        if (prod.is_hot_offer) {
            const hotOfferBadgeList = document.createElement('div');
            hotOfferBadgeList.className = 'hot-offer-badge-list';
            // Используем анимированный огонь и в режиме списка
            hotOfferBadgeList.innerHTML = `
                <span class="fire-wrap fire-wrap-list" aria-hidden="true">
                    <span class="fire-back">🔥</span>
                    <span class="fire-front">🔥</span>
                    <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                    <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
                </span>
            `;
            topBadgesContainer.appendChild(hotOfferBadgeList);
        }
        
        // Бейдж резервации для режима списка (если есть резервация)
        if (prod.reservation) {
            const reservationBadgeList = document.createElement('div');
            reservationBadgeList.className = 'reservation-badge-list';
            reservationBadgeList.textContent = '🔒 Резерв';
            topBadgesContainer.appendChild(reservationBadgeList);
        }
        
        // Название для режима списка
        const nameDivList = document.createElement('div');
        nameDivList.className = 'product-name-list';
        nameDivList.textContent = prod.name;
        
        // Описание для режима списка (если есть)
        let descriptionDivList = null;
        if (prod.description) {
            descriptionDivList = document.createElement('div');
            descriptionDivList.className = 'product-description-list';
            let descriptionText = prod.description.trim();
            if (descriptionText.length > 50) {
                descriptionText = descriptionText.substring(0, 50) + '...';
            }
            descriptionDivList.textContent = descriptionText;
        }
        
        // Контейнер для цен и правой части (корзина + статус) в режиме списка
        const listPricesRightContainer = document.createElement('div');
        listPricesRightContainer.className = 'product-list-prices-right-container';
        
        // Контейнер для цен в режиме списка (каждая цена на отдельной строке) - левая часть
        const listPricesContainer = document.createElement('div');
        listPricesContainer.className = 'product-list-prices';
        
        // Старая цена (зачеркнутая серая) - если есть скидка, на отдельной строке
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const oldPriceDivList = document.createElement('div');
            oldPriceDivList.className = 'product-list-old-price';
            oldPriceDivList.textContent = `${Number(prod.price).toLocaleString('ru-RU')}₽`;
            listPricesContainer.appendChild(oldPriceDivList);
        }
        
        // Цена по карте (со скидкой) - если есть скидка, на отдельной строке
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const cardPriceDivList = document.createElement('div');
            cardPriceDivList.className = 'product-list-card-price';
            cardPriceDivList.textContent = priceDisplay;
            
            // Добавляем иконку карточки красного цвета рядом с ценой по карте
            const cardIconList = document.createElement('span');
            cardIconList.className = 'product-card-icon';
            cardIconList.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="5" width="20" height="14" rx="2" stroke="#E35E45" stroke-width="2"/>
                    <path d="M2 10H22" stroke="#E35E45" stroke-width="2"/>
                    <path d="M6 15H10" stroke="#E35E45" stroke-width="2" stroke-linecap="round"/>
                </svg>
            `;
            cardPriceDivList.appendChild(cardIconList);
            listPricesContainer.appendChild(cardPriceDivList);
        } else {
            // Если нет скидки, просто добавляем обычную цену на отдельной строке
            const priceDivList = document.createElement('div');
            priceDivList.className = 'product-list-price-single';
            priceDivList.textContent = priceDisplay;
            listPricesContainer.appendChild(priceDivList);
        }
        
        // Цена наличными (без скидки) - если есть скидка, на отдельной строке
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const cashPriceDivList = document.createElement('div');
            cashPriceDivList.className = 'product-list-cash-price';
            cashPriceDivList.textContent = `${Number(prod.price).toLocaleString('ru-RU')}₽`;
            
            // Добавляем иконку наличных зеленого цвета рядом с ценой наличными
            const cashIconList = document.createElement('span');
            cashIconList.className = 'product-cash-icon';
            cashIconList.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="5" width="20" height="14" rx="2" stroke="#00A82E" stroke-width="2"/>
                    <circle cx="12" cy="12" r="3" stroke="#00A82E" stroke-width="2"/>
                </svg>
            `;
            cashPriceDivList.appendChild(cashIconList);
            listPricesContainer.appendChild(cashPriceDivList);
        }
        
        // Правая часть: контейнер для корзины и статуса
        const rightSideContainer = document.createElement('div');
        rightSideContainer.className = 'product-list-right-side';
        
        // Статус товара в правой части (мелкий, с цветом как в режиме сетки)
        let statusBadgeList = null;
        if (quantityBadge) {
            statusBadgeList = document.createElement('div');
            statusBadgeList.className = 'product-quantity-badge-list';
            statusBadgeList.textContent = quantityBadge.textContent;
            // Используем тот же цвет, что и в режиме сетки (из quantityBadge.style.color)
            statusBadgeList.style.color = quantityBadge.style.color || 'rgba(52, 199, 89, 0.95)';
            rightSideContainer.appendChild(statusBadgeList);
        }
        
        // Добавляем левую часть (цены) и правую часть (статус) в общий контейнер
        listPricesRightContainer.appendChild(listPricesContainer);
        listPricesRightContainer.appendChild(rightSideContainer);
        
        // Создаем кнопку избранного для режима списка (правый верхний угол карточки) - только для клиентов
        let favoriteButtonList = null;
        if (isClient) {
            favoriteButtonList = document.createElement('button');
            favoriteButtonList.className = 'favorite-button-card favorite-button-list';
            favoriteButtonList.setAttribute('aria-label', 'Добавить в избранное');
            favoriteButtonList.dataset.productId = prod.id;
            
            // SVG иконка сердца - симметричная форма
            favoriteButtonList.innerHTML = `
                <svg viewBox="0 0 24 24" class="favorite-heart" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            `;
            
            // Проверяем статус избранного для режима списка
            if (prod.id) {
                safeCheckFavorite(prod.id).then(favorite => {
                    updateFavoriteButtonState(favoriteButtonList, favorite);
                }).catch(() => {
                    updateFavoriteButtonState(favoriteButtonList, false);
                });
            } else {
                console.warn('⚠️ Product without ID in list view, skipping favorite check:', prod);
                updateFavoriteButtonState(favoriteButtonList, false);
            }
            
            // Обработчик клика на кнопку избранного в режиме списка (optimistic UI)
            favoriteButtonList.addEventListener('click', async (e) => {
                e.stopPropagation(); // Предотвращаем открытие модального окна товара
                e.preventDefault(); // Предотвращаем стандартное поведение
                
                // Защита от повторных кликов во время обработки
                if (favoriteButtonList.dataset.processing === 'true') {
                    console.log(`[FAVORITES] Click ignored (list mode) for product ${prod.id}: already processing`);
                    return;
                }
                
                // КРИТИЧНО: Используем актуальное состояние из DOM
                // Это гарантирует правильную работу после возврата со страницы избранного
                const currentState = favoriteButtonList.classList.contains('favorite-active');
                
                // Optimistic UI - меняем состояние МГНОВЕННО
                const newFavoriteState = !currentState;
                favoriteButtonList.dataset.processing = 'true'; // Блокируем повторные клики
                
                // Функция для обновления всех кнопок избранного для этого товара (optimistic)
                function updateAllFavoriteButtonsForProductOptimisticList(productId, isFavorite) {
                    // Находим и обновляем все кнопки избранного для этого товара
                    const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                    allFavoriteButtons.forEach(btn => {
                        updateFavoriteButtonState(btn, isFavorite);
                    });
                    console.log(`[FAVORITES] Optimistic update (list): ${allFavoriteButtons.length} buttons for product ${productId}, state: ${isFavorite}`);
                }
                
                // Обновляем ВСЕ кнопки избранного для этого товара (optimistic)
                updateAllFavoriteButtonsForProductOptimisticList(prod.id, newFavoriteState);
                
                // Запрос в API - асинхронно (в фоне)
                // safeToggleFavorite автоматически обновляет кэш в favorites.js
                try {
                    console.log(`[FAVORITES] Toggling favorite (list mode) for product ${prod.id}, current state: ${currentState}, new state: ${newFavoriteState}`);
                    const result = await safeToggleFavorite(prod.id);
                    console.log(`[FAVORITES] Toggle result (list mode) for product ${prod.id}:`, result);
                    
                    // КРИТИЧНО: Всегда синхронизируем с ответом сервера
                    // Это гарантирует правильное состояние даже если был рассинхронизация
                    
                    // Функция для обновления всех кнопок избранного для этого товара
                    function updateAllFavoriteButtonsForProductList(productId, isFavorite) {
                        // Находим и обновляем все кнопки избранного для этого товара
                        const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                        allFavoriteButtons.forEach(btn => {
                            updateFavoriteButtonState(btn, isFavorite);
                        });
                        console.log(`[FAVORITES] Server sync (list): ${allFavoriteButtons.length} buttons for product ${productId}, state: ${isFavorite}`);
                    }
                    
                    // Обновляем ВСЕ кнопки избранного для этого товара
                    updateAllFavoriteButtonsForProductList(prod.id, result.is_favorite);
                    
                    // КРИТИЧНО: updateFavoritesCount уже вызывается в toggleFavorite
                    // Но на всякий случай вызываем еще раз для гарантии обновления
                    // (toggleFavorite уже обновил, но это не помешает)
                    try {
                        // Правильный путь: из handlers/ в js/ - это ../favorites.js
                        const { updateFavoritesCount } = await import('../favorites.js');
                        await updateFavoritesCount();
                    } catch (importError) {
                        // Не критично, toggleFavorite уже обновил состояние
                    }
                } catch (error) {
                    console.error('❌ Error toggling favorite (list mode):', error);
                    console.error('❌ Error details:', {
                        message: error.message,
                        stack: error.stack,
                        productId: prod.id,
                        currentState: currentState,
                        newFavoriteState: newFavoriteState
                    });
                    // Откатываем optimistic изменение при ошибке
                    // Используем исходное состояние (до клика)
                    
                    // Функция для отката всех кнопок избранного для этого товара
                    function rollbackAllFavoriteButtonsForProductList(productId, isFavorite) {
                        // Находим и откатываем все кнопки избранного для этого товара
                        const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                        allFavoriteButtons.forEach(btn => {
                            updateFavoriteButtonState(btn, isFavorite);
                        });
                        console.log(`[FAVORITES] Rollback (list): ${allFavoriteButtons.length} buttons for product ${productId}, state: ${isFavorite}`);
                    }
                    
                    // Откатываем ВСЕ кнопки избранного для этого товара
                    rollbackAllFavoriteButtonsForProductList(prod.id, currentState);
                    
                    const errorMessage = error.message || 'Ошибка при изменении избранного';
                    alert(errorMessage);
                } finally {
                    // Снимаем блокировку
                    delete favoriteButtonList.dataset.processing;
                }
            });
        }
        
        // Вставляем элементы для режима списка в начало карточки
        card.insertBefore(topBadgesContainer, card.firstChild);
        card.insertBefore(nameDivList, topBadgesContainer.nextSibling);
        // Добавляем описание после названия, если оно есть
        if (descriptionDivList) {
            card.insertBefore(descriptionDivList, nameDivList.nextSibling);
        }
        card.appendChild(listPricesRightContainer);
        
        // Создаем кнопку корзины для режима списка (над статусом в правой части) - только для клиентов и только на странице избранного
        let cartButtonList = null;
        // Проверяем, находимся ли мы на странице избранного
        const favoritesPageForList = document.getElementById('favorites-page');
        const isOnFavoritesPageForList = favoritesPageForList && (favoritesPageForList.style.display === 'block' || favoritesPageForList.style.display === 'flex');
        
        if (isClient && isOnFavoritesPageForList) {
            cartButtonList = document.createElement('button');
            cartButtonList.className = 'cart-button-card cart-button-list';
            cartButtonList.setAttribute('aria-label', 'Добавить в корзину');
            cartButtonList.dataset.productId = prod.id;
            
            // SVG иконка корзины (тележка) с индикатором количества
            cartButtonList.innerHTML = `
                <svg viewBox="0 0 24 24" class="cart-icon" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path class="cart-icon-outline" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
                </svg>
                <span class="cart-icon-badge" style="display: none;">0</span>
            `;
            
            // Проверяем, есть ли товар в корзине, и устанавливаем активное состояние с количеством
            // Делаем это асинхронно после создания всех кнопок
            setTimeout(() => {
                import('../cart/cartStore.js').then(({ isProductInCart, getProductQuantityInCart }) => {
                    const quantity = getProductQuantityInCart(prod.id);
                    if (quantity > 0) {
                        cartButtonList.classList.add('cart-active');
                        const badge = cartButtonList.querySelector('.cart-icon-badge');
                        if (badge) {
                            badge.textContent = quantity > 99 ? '99+' : quantity.toString();
                            badge.style.display = 'flex';
                        }
                    }
                }).catch(() => {
                    // Игнорируем ошибки импорта
                });
            }, 0);
            
            // Обработчик клика на кнопку корзины в режиме списка - показываем bottom sheet только на странице избранного
            cartButtonList.addEventListener('click', async (e) => {
                e.stopPropagation(); // Предотвращаем открытие модального окна товара
                e.preventDefault(); // Предотвращаем стандартное поведение
                
                // Проверяем, что мы все еще на странице избранного
                const favoritesPageForList = document.getElementById('favorites-page');
                const isOnFavoritesPageForList = favoritesPageForList && (favoritesPageForList.style.display === 'block' || favoritesPageForList.style.display === 'flex');
                
                if (!isOnFavoritesPageForList) {
                    return; // Не показываем bottom sheet, если не на странице избранного
                }
                
                try {
                    // Проверяем, есть ли товар уже в корзине
                    const { isProductInCart, getProductQuantityInCart } = await import('../cart/cartStore.js');
                    const isInCart = isProductInCart(prod.id);
                    const currentQuantity = getProductQuantityInCart(prod.id);
                    
                    // Если товара нет в корзине, добавляем его с количеством 1
                    if (!isInCart || currentQuantity === 0) {
                        const { addProductToCart } = await import('../cart/cartNew.js');
                        await addProductToCart(prod, 1);
                    }
                    // Если товар уже есть в корзине, просто открываем bottom sheet без добавления
                    
                    // Импортируем функцию показа bottom sheet
                    const { showCartBottomSheet } = await import('../cart/cartBottomSheet.js');
                    showCartBottomSheet(prod);
                    
                    // Обновляем состояние кнопок корзины
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                } catch (error) {
                    console.error('❌ Error showing cart bottom sheet:', error);
                    // Fallback: добавляем напрямую в корзину
                    try {
                        const { addProductToCart } = await import('../cart/cartNew.js');
                        await addProductToCart(prod, 1);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (addError) {
                        alert('Ошибка при добавлении товара в корзину: ' + (addError.message || 'Неизвестная ошибка'));
                    }
                }
            });
            
            // Добавляем кнопку корзины в правую часть (над статусом)
            rightSideContainer.insertBefore(cartButtonList, rightSideContainer.firstChild);
        }
        
        // Добавляем кнопку избранного в правый верхний угол карточки (для режима списка) - только для клиентов
        if (favoriteButtonList) {
            card.appendChild(favoriteButtonList);
        }
        
        // КРИТИЧНО: Используем addEventListener вместо onclick для надежности
        // Это гарантирует, что обработчик не потеряется при клонировании или обновлении DOM
        // Удаляем старый обработчик, если он был установлен через onclick
        card.onclick = null;
        
        // Устанавливаем обработчик через addEventListener
        card.addEventListener('click', function cardClickHandler(e) {
            // Проверяем, не кликнули ли на кнопку избранного, корзины или другие интерактивные элементы
            if (e.target.closest('.favorite-button-card') || 
                e.target.closest('.cart-button-card') ||
                e.target.closest('button') || 
                e.target.closest('a')) {
                return; // Не открываем модальное окно, если кликнули на кнопку
            }
            
            // Используем экспортированную функцию напрямую
            showProductModal(prod, null, fullImages);
        });
        
        // card уже добавлен в DOM выше (перед установкой img.src)
    });
}
// ========== END REFACTORING STEP 4.1 ==========

