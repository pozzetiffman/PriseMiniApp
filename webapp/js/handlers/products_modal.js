// Модуль для модального окна товара
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 3.1: showProductModal ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { getCurrentShopSettings } from '../admin.js';
import { toggleHotOffer, trackShopVisit, updateProductHiddenAPI } from '../api.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import { isMobileDevice } from '../utils/products_utils.js';
// ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
// НОВЫЙ КОД (используется сейчас)
// ========== END REFACTORING STEP 2.1-2.2 ==========

// Зависимости, которые будут переданы из products.js через initProductModalDependencies
let modalElement = null; // DOM элемент модального окна
let modalState = null; // Объект состояния модального окна { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
let appContextGetter = null; // Функция для получения актуального appContext
let loadDataCallback = null; // Функция для перезагрузки данных
let showEditProductModalCallback = null; // Функция для показа модального окна редактирования
let markAsSoldCallback = null; // Функция для пометки товара как проданного
let deleteProductCallback = null; // Функция для удаления товара
let cancelReservationCallback = null; // Функция для отмены резервации
let showPurchaseModalCallback = null; // Функция для показа модального окна продажи
let showReservationModalCallback = null; // Функция для показа модального окна резервации
let showOrderModalCallback = null; // Функция для показа модального окна заказа
// ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// let showModalImageCallback = null; // Функция для показа изображения в модальном окне
// Теперь используем функцию напрямую из products_modal_image.js
// ========== END REFACTORING STEP 2.1-2.2 ==========

// Переменные для блокировки горизонтального скролла
let touchStartX = 0;
let touchStartY = 0;
let horizontalScrollBlocked = false;

// Обработчик touchstart для определения направления жеста
function handleTouchStart(e) {
    if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
}

// Обработчик touchmove для блокировки горизонтальных жестов
function handleTouchMove(e) {
    if (e.touches.length !== 1) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = Math.abs(currentX - touchStartX);
    const dy = Math.abs(currentY - touchStartY);
    
    // Блокируем только если горизонтальное движение значительно больше вертикального
    // Порог 15px для предотвращения случайных блокировок при диагональных жестах
    // Это позволяет плавно прокручивать вертикально, не блокируя случайные небольшие горизонтальные движения
    if (dx > dy + 15 && horizontalScrollBlocked) {
        e.preventDefault();
        e.stopPropagation();
    }
}

// Активация блокировки горизонтального скролла
function enableHorizontalScrollBlock() {
    if (horizontalScrollBlocked) return;
    
    horizontalScrollBlocked = true;
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    console.log('[PRODUCT PAGE] ✅ Horizontal scroll block enabled');
}

// Деактивация блокировки горизонтального скролла
function disableHorizontalScrollBlock() {
    if (!horizontalScrollBlocked) return;
    
    horizontalScrollBlocked = false;
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('touchmove', handleTouchMove);
    console.log('[PRODUCT PAGE] ✅ Horizontal scroll block disabled');
}

// Инициализация зависимостей для showProductModal
export function initProductModalDependencies(dependencies) {
    console.log('[PRODUCT MODAL] Initializing dependencies');
    modalElement = dependencies.modal; // Оставляем для обратной совместимости, но не используем
    modalState = dependencies.modalState; // Объект состояния { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
    appContextGetter = dependencies.appContext; // Функция-геттер для получения актуального appContext
    loadDataCallback = dependencies.loadData;
    showEditProductModalCallback = dependencies.showEditProductModal;
    markAsSoldCallback = dependencies.markAsSold;
    deleteProductCallback = dependencies.deleteProduct;
    cancelReservationCallback = dependencies.cancelReservation;
    showPurchaseModalCallback = dependencies.showPurchaseModal;
    showReservationModalCallback = dependencies.showReservationModal;
    showOrderModalCallback = dependencies.showOrderModal;
    
    if (!modalState) {
        console.error('[PRODUCT MODAL] ❌ modalState is null!');
    } else {
        console.log('[PRODUCT MODAL] ✅ Dependencies initialized successfully');
    }
    // ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
    // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
    // showModalImageCallback = dependencies.showModalImage; // Функция для показа изображения
    // Теперь используем функцию напрямую из products_modal_image.js
    // ========== END REFACTORING STEP 2.1-2.2 ==========
}

// Функция для отображения изображения на странице товара (объявляем ПЕРЕД showProductModal для hoisting)
function showProductPageImage(index) {
    if (!modalState) {
        console.error('❌ [PRODUCT PAGE IMG] Modal state not initialized!');
        return;
    }
    
    const productPageImage = document.getElementById('product-page-image');
    if (!productPageImage) {
        console.error('❌ [PRODUCT PAGE IMG] Product page image element not found!');
        return;
    }
    
    // Проверяем, является ли товар скрытым для админа
    const appContext = appContextGetter ? appContextGetter() : null;
    const isHiddenForAdmin = modalState.currentProduct && modalState.currentProduct.is_hidden && appContext && appContext.role === 'owner' && modalState.currentProduct.user_id === appContext.shop_owner_id;
    
    // Функция для создания badge скрытого товара
    function createHiddenBadge() {
        if (!isHiddenForAdmin) return null;
        const hiddenBadge = document.createElement('div');
        hiddenBadge.className = 'hidden-badge';
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
            top: 12px;
            left: 12px;
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
        return hiddenBadge;
    }
    
    // Увеличиваем ID загрузки, чтобы отменить старые запросы
    modalState.currentImageLoadId++;
    const loadId = modalState.currentImageLoadId;
    
    // Очищаем предыдущий blob URL если был
    const oldBlobUrl = productPageImage.dataset.blobUrl;
    if (oldBlobUrl) {
        URL.revokeObjectURL(oldBlobUrl);
        delete productPageImage.dataset.blobUrl;
    }
    
    // Сохраняем кнопку избранного перед очисткой (ищем в productPageImage и во всех его дочерних элементах)
    let favoriteButton = productPageImage.querySelector('.favorite-button-product-page');
    // Если не нашли в productPageImage, ищем в document (кнопка может быть в другом месте)
    if (!favoriteButton) {
        favoriteButton = document.querySelector('.favorite-button-product-page');
    }
    
    console.log('[PRODUCT PAGE IMG] Favorite button found before clear:', !!favoriteButton);
    
    // Очищаем содержимое полностью
    productPageImage.innerHTML = '';
    
    // Восстанавливаем кнопку избранного после очистки (если она была)
    if (favoriteButton) {
        productPageImage.appendChild(favoriteButton);
        console.log('[PRODUCT PAGE IMG] Favorite button restored after clear');
    } else {
        console.warn('[PRODUCT PAGE IMG] Favorite button not found, cannot restore');
    }
    
        // Если товар без фото, показываем placeholder и выходим
        if (modalState.currentImages.length === 0) {
            productPageImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
            const placeholderDiv = document.createElement('div');
            placeholderDiv.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px; position: relative; width: 100%;';
            placeholderDiv.innerHTML = '📷';
            productPageImage.appendChild(placeholderDiv);
            
            // Добавляем badge скрытого товара (слева вверху, только для админа)
            const hiddenBadge = createHiddenBadge();
            if (hiddenBadge) {
                placeholderDiv.appendChild(hiddenBadge);
            }
            
            // Добавляем значок горящего предложения, если товар горящий
            if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
                const hotOfferBadge = document.createElement('div');
                hotOfferBadge.className = 'hot-offer-badge';
                hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
                hotOfferBadge.style.position = 'absolute';
                hotOfferBadge.style.top = '12px';
                hotOfferBadge.style.right = '12px';
                hotOfferBadge.style.left = 'auto';
                hotOfferBadge.innerHTML = `
                    <span class="fire-wrap" aria-hidden="true">
                        <span class="fire-back">🔥</span>
                        <span class="fire-front">🔥</span>
                        <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                        <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
                    </span>
                `;
                placeholderDiv.appendChild(hotOfferBadge);
            }
            
            // Добавляем кнопку избранного на placeholder (правый нижний угол) - только для клиентов
            // favoriteButton уже сохранена выше, используем её
            if (favoriteButton && placeholderDiv) {
                placeholderDiv.appendChild(favoriteButton);
            }
            
            return;
        }
    
    if (index < 0 || index >= modalState.currentImages.length) {
        console.warn(`[PRODUCT PAGE IMG] Invalid index: ${index}, currentImages.length=${modalState.currentImages.length}, productId=${modalState.currentProduct?.id || 'unknown'}`);
        return;
    }
    
    modalState.currentImageIndex = index;
    const fullImg = modalState.currentImages[index];
    
    console.log(`[PRODUCT PAGE IMG] Loading image: index=${index}, productId=${modalState.currentProduct?.id || 'unknown'}, totalImages=${modalState.currentImages.length}`);
    
    const imageContainer = document.createElement('div');
    imageContainer.className = 'product-page-image-container';
    imageContainer.dataset.loadId = loadId;
    imageContainer.style.cssText = 'position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;';
    imageContainer.innerHTML = '<div style="color: var(--tg-theme-hint-color); font-size: 48px;">⏳</div>';
    productPageImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
    productPageImage.appendChild(imageContainer);
    
    // Добавляем кнопку избранного в контейнер изображения сразу после создания (если она есть)
    if (favoriteButton) {
        // Удаляем кнопку из productPageImage, если она там есть
        if (favoriteButton.parentNode === productPageImage) {
            productPageImage.removeChild(favoriteButton);
        }
        // Добавляем кнопку в imageContainer
        imageContainer.appendChild(favoriteButton);
        console.log('[PRODUCT PAGE IMG] Favorite button added to imageContainer');
    }
    
    // Определяем, мобильное устройство или десктоп
    const isMobile = isMobileDevice();
    
    if (isMobile) {
        // На мобильных устройствах используем fetch + blob URL
        fetch(fullImg, {
            headers: {
                'ngrok-skip-browser-warning': '69420'
            }
        })
        .then(response => {
            if (loadId !== modalState.currentImageLoadId) {
                return null;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            if (!blob || loadId !== modalState.currentImageLoadId) {
                return;
            }
            
            const blobUrl = URL.createObjectURL(blob);
            productPageImage.dataset.blobUrl = blobUrl;
            
            const img = document.createElement('img');
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 16px; display: block;';
            img.alt = modalState.currentProduct ? modalState.currentProduct.name : 'Product';
            
            img.onload = () => {
                if (loadId !== modalState.currentImageLoadId) {
                    URL.revokeObjectURL(blobUrl);
                    return;
                }
                
                // Сохраняем кнопку избранного перед очисткой контейнера
                const savedFavoriteButton = imageContainer.querySelector('.favorite-button-product-page');
                
                imageContainer.innerHTML = '';
                imageContainer.appendChild(img);
                productPageImage.style.backgroundColor = 'transparent';
                
                // Добавляем badge скрытого товара (слева вверху, только для админа)
                const hiddenBadge = createHiddenBadge();
                if (hiddenBadge) {
                    imageContainer.appendChild(hiddenBadge);
                }
                
                // Добавляем значок горящего предложения, если товар горящий
                if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
                    const hotOfferBadge = document.createElement('div');
                    hotOfferBadge.className = 'hot-offer-badge';
                    hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
                    hotOfferBadge.style.position = 'absolute';
                    hotOfferBadge.style.top = '12px';
                    hotOfferBadge.style.right = '12px';
                    hotOfferBadge.style.left = 'auto';
                    hotOfferBadge.innerHTML = `
                        <span class="fire-wrap" aria-hidden="true">
                            <span class="fire-back">🔥</span>
                            <span class="fire-front">🔥</span>
                            <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                            <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
                        </span>
                    `;
                    imageContainer.appendChild(hotOfferBadge);
                }
                
                // Восстанавливаем кнопку избранного после очистки контейнера
                if (savedFavoriteButton) {
                    imageContainer.appendChild(savedFavoriteButton);
                } else if (favoriteButton) {
                    // Если кнопка не была в контейнере, добавляем её
                    imageContainer.appendChild(favoriteButton);
                }
                
                // Добавляем навигацию по фото, если их больше одного
                if (modalState.currentImages.length > 1) {
                    updateProductPageImageNavigation();
                }
            };
            
            img.onerror = () => {
                if (loadId !== modalState.currentImageLoadId) {
                    return;
                }
                console.error(`[PRODUCT PAGE IMG] Image load error (mobile): loadId=${loadId}, productId=${modalState.currentProduct?.id || 'unknown'}, url="${fullImg.substring(0, 100)}..."`);
                URL.revokeObjectURL(blobUrl);
                delete productPageImage.dataset.blobUrl;
                
                // Сохраняем кнопку избранного перед очисткой контейнера
                const savedFavoriteButton = imageContainer.querySelector('.favorite-button-product-page');
                
                const errorPlaceholder = document.createElement('div');
                errorPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px; position: relative; width: 100%;';
                errorPlaceholder.textContent = '📷';
                imageContainer.innerHTML = '';
                imageContainer.appendChild(errorPlaceholder);
                
                // Добавляем badge скрытого товара (слева вверху, только для админа)
                const hiddenBadge = createHiddenBadge();
                if (hiddenBadge) {
                    errorPlaceholder.appendChild(hiddenBadge);
                }
                
                // Добавляем значок горящего предложения, если товар горящий
                if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
                    const hotOfferBadge = document.createElement('div');
                    hotOfferBadge.className = 'hot-offer-badge';
                    hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
                    hotOfferBadge.style.position = 'absolute';
                    hotOfferBadge.style.top = '12px';
                    hotOfferBadge.style.right = '12px';
                    hotOfferBadge.style.left = 'auto';
                    hotOfferBadge.innerHTML = `
                        <span class="fire-wrap" aria-hidden="true">
                            <span class="fire-back">🔥</span>
                            <span class="fire-front">🔥</span>
                            <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                            <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
                        </span>
                    `;
                    errorPlaceholder.appendChild(hotOfferBadge);
                }
                
                // Восстанавливаем кнопку избранного после очистки контейнера
                if (savedFavoriteButton) {
                    errorPlaceholder.appendChild(savedFavoriteButton);
                } else if (favoriteButton) {
                    errorPlaceholder.appendChild(favoriteButton);
                }
            };
            
            img.src = blobUrl;
        })
        .catch(error => {
            if (loadId !== modalState.currentImageLoadId) {
                return;
            }
            console.error(`[PRODUCT PAGE IMG] Fetch error (mobile): loadId=${loadId}, productId=${modalState.currentProduct?.id || 'unknown'}, error=${error.message}, url="${fullImg.substring(0, 100)}..."`);
            
            // Сохраняем кнопку избранного перед очисткой контейнера
            const savedFavoriteButton = imageContainer.querySelector('.favorite-button-product-page');
            
            const errorPlaceholder = document.createElement('div');
            errorPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px; position: relative; width: 100%;';
            errorPlaceholder.textContent = '📷';
            imageContainer.innerHTML = '';
            imageContainer.appendChild(errorPlaceholder);
            
            // Добавляем badge скрытого товара (слева вверху, только для админа)
            const hiddenBadge = createHiddenBadge();
            if (hiddenBadge) {
                errorPlaceholder.appendChild(hiddenBadge);
            }
            
            // Добавляем значок горящего предложения, если товар горящий
            if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
                const hotOfferBadge = document.createElement('div');
                hotOfferBadge.className = 'product-page-hot-offer-badge';
                hotOfferBadge.innerHTML = '🔥';
                hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
                errorPlaceholder.appendChild(hotOfferBadge);
            }
            
            // Восстанавливаем кнопку избранного после очистки контейнера
            if (savedFavoriteButton) {
                errorPlaceholder.appendChild(savedFavoriteButton);
            } else if (favoriteButton) {
                errorPlaceholder.appendChild(favoriteButton);
            }
        });
    } else {
        // На десктопе используем прямые URL
        const img = document.createElement('img');
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 16px; display: block;';
        img.alt = modalState.currentProduct ? modalState.currentProduct.name : 'Product';
        
        img.onload = () => {
            if (loadId !== modalState.currentImageLoadId) {
                return;
            }
            
            // Сохраняем кнопку избранного перед очисткой контейнера
            const savedFavoriteButton = imageContainer.querySelector('.favorite-button-product-page');
            
            imageContainer.innerHTML = '';
            imageContainer.appendChild(img);
            productPageImage.style.backgroundColor = 'transparent';
            
            // Добавляем badge скрытого товара (слева вверху, только для админа)
            const hiddenBadge = createHiddenBadge();
            if (hiddenBadge) {
                imageContainer.appendChild(hiddenBadge);
            }
            
            // Добавляем значок горящего предложения, если товар горящий
            if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
                const hotOfferBadge = document.createElement('div');
                hotOfferBadge.className = 'product-page-hot-offer-badge';
                hotOfferBadge.innerHTML = '🔥';
                hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
                imageContainer.appendChild(hotOfferBadge);
            }
            
            // Восстанавливаем кнопку избранного после очистки контейнера
            if (savedFavoriteButton) {
                imageContainer.appendChild(savedFavoriteButton);
            } else if (favoriteButton) {
                // Если кнопка не была в контейнере, добавляем её
                imageContainer.appendChild(favoriteButton);
            }
            
            // Добавляем навигацию по фото, если их больше одного
            if (modalState.currentImages.length > 1) {
                updateProductPageImageNavigation();
            }
        };
        
        img.onerror = () => {
            if (loadId !== modalState.currentImageLoadId) {
                return;
            }
            // Fallback: пробуем через fetch
            fetch(fullImg, {
                headers: {
                    'ngrok-skip-browser-warning': '69420'
                }
            })
            .then(response => {
                if (loadId !== modalState.currentImageLoadId) {
                    return null;
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                if (!blob || loadId !== modalState.currentImageLoadId) {
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                productPageImage.dataset.blobUrl = blobUrl;
                img.src = blobUrl;
            })
            .catch(error => {
                if (loadId !== modalState.currentImageLoadId) {
                    return;
                }
                console.error(`[PRODUCT PAGE IMG] Fetch fallback also failed: loadId=${loadId}, productId=${modalState.currentProduct?.id || 'unknown'}, error=${error.message}`);
                
                // Сохраняем кнопку избранного перед очисткой контейнера
                const savedFavoriteButton = imageContainer.querySelector('.favorite-button-product-page');
                
                const errorPlaceholder = document.createElement('div');
                errorPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px; position: relative; width: 100%;';
                errorPlaceholder.textContent = '📷';
                imageContainer.innerHTML = '';
                imageContainer.appendChild(errorPlaceholder);
                
                // Добавляем badge скрытого товара (слева вверху, только для админа)
                const hiddenBadge = createHiddenBadge();
                if (hiddenBadge) {
                    errorPlaceholder.appendChild(hiddenBadge);
                }
                
                // Добавляем значок горящего предложения, если товар горящий
                if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
                    const hotOfferBadge = document.createElement('div');
                    hotOfferBadge.className = 'hot-offer-badge';
                    hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
                    hotOfferBadge.style.position = 'absolute';
                    hotOfferBadge.style.top = '12px';
                    hotOfferBadge.style.right = '12px';
                    hotOfferBadge.style.left = 'auto';
                    hotOfferBadge.innerHTML = `
                        <span class="fire-wrap" aria-hidden="true">
                            <span class="fire-back">🔥</span>
                            <span class="fire-front">🔥</span>
                            <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                            <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
                        </span>
                    `;
                    errorPlaceholder.appendChild(hotOfferBadge);
                }
                
                // Восстанавливаем кнопку избранного после очистки контейнера
                if (savedFavoriteButton) {
                    errorPlaceholder.appendChild(savedFavoriteButton);
                } else if (favoriteButton) {
                    errorPlaceholder.appendChild(favoriteButton);
                }
            });
        };
        
        img.src = fullImg;
    }
}

// Функция для обновления навигации по фото на странице товара (объявляем ПЕРЕД showProductModal для hoisting)
function updateProductPageImageNavigation() {
    if (!modalState) {
        return;
    }
    
    const productPageImage = document.getElementById('product-page-image');
    if (!productPageImage) {
        return;
    }
    
    const imageContainer = productPageImage.querySelector('.product-page-image-container');
    if (!imageContainer) {
        return;
    }
    
    // Удаляем старые кнопки навигации
    const oldNav = productPageImage.querySelector('.product-page-image-navigation');
    if (oldNav) {
        oldNav.remove();
    }
    
    // Создаем контейнер для навигации
    const navContainer = document.createElement('div');
    navContainer.className = 'product-page-image-navigation';
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
    
    // Кнопка "Назад"
    if (modalState.currentImageIndex > 0) {
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
        `;
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            showProductPageImage(modalState.currentImageIndex - 1);
        };
        navContainer.appendChild(prevBtn);
    }
    
    // Индикатор фото
    const indicator = document.createElement('div');
    indicator.textContent = `${modalState.currentImageIndex + 1}/${modalState.currentImages.length}`;
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
    `;
    navContainer.appendChild(indicator);
    
    // Кнопка "Вперед"
    if (modalState.currentImageIndex < modalState.currentImages.length - 1) {
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
        `;
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            showProductPageImage(modalState.currentImageIndex + 1);
        };
        navContainer.appendChild(nextBtn);
    }
    
    imageContainer.appendChild(navContainer);
    
    // Добавляем обработчики свайпов для мобильных устройств
    let touchStartX = 0;
    let touchEndX = 0;
    
    productPageImage.ontouchstart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
    };
    
    productPageImage.ontouchend = (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0 && modalState.currentImageIndex < modalState.currentImages.length - 1) {
                showProductPageImage(modalState.currentImageIndex + 1);
            } else if (diff < 0 && modalState.currentImageIndex > 0) {
                showProductPageImage(modalState.currentImageIndex - 1);
            }
        }
    };
}

// Функция для обновления значка горящего предложения на странице товара
function updateHotOfferBadgeOnProductPage(isHotOffer) {
    const productPageImage = document.getElementById('product-page-image');
    if (!productPageImage) {
        return;
    }
    
    // Находим существующий значок огонька
    const existingBadge = productPageImage.querySelector('.hot-offer-badge');
    
    if (isHotOffer && !existingBadge) {
        // Добавляем значок огонька
        const imageContainer = productPageImage.querySelector('.product-page-image-container');
        const placeholderDiv = productPageImage.querySelector('div[style*="display: flex"]');
        
        // Определяем, куда добавить значок (в контейнер изображения или в placeholder)
        const targetContainer = imageContainer || placeholderDiv || productPageImage;
        
        const hotOfferBadge = document.createElement('div');
        hotOfferBadge.className = 'hot-offer-badge';
        hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
        hotOfferBadge.style.position = 'absolute';
        hotOfferBadge.style.top = '12px';
        hotOfferBadge.style.right = '12px';
        hotOfferBadge.style.left = 'auto';
        hotOfferBadge.style.zIndex = '12';
        hotOfferBadge.innerHTML = `
            <span class="fire-wrap" aria-hidden="true">
                <span class="fire-back">🔥</span>
                <span class="fire-front">🔥</span>
                <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
            </span>
        `;
        targetContainer.appendChild(hotOfferBadge);
    } else if (!isHotOffer && existingBadge) {
        // Удаляем значок огонька
        existingBadge.remove();
    }
}

// Функция для обновления badge скрытого товара на странице товара
function updateHiddenBadgeOnProductPage(isHidden, prod) {
    const productPageImage = document.getElementById('product-page-image');
    if (!productPageImage) {
        return;
    }
    
    // Проверяем, является ли товар скрытым для админа
    const appContext = appContextGetter ? appContextGetter() : null;
    const isHiddenForAdmin = isHidden && appContext && appContext.role === 'owner' && prod && prod.user_id === appContext.shop_owner_id;
    
    // Находим существующий badge скрытого товара
    const existingBadge = productPageImage.querySelector('.hidden-badge');
    
    if (isHiddenForAdmin && !existingBadge) {
        // Добавляем badge скрытого товара
        const imageContainer = productPageImage.querySelector('.product-page-image-container');
        const placeholderDiv = productPageImage.querySelector('div[style*="display: flex"]');
        
        // Определяем, куда добавить badge (в контейнер изображения или в placeholder)
        const targetContainer = imageContainer || placeholderDiv || productPageImage;
        
        const hiddenBadge = document.createElement('div');
        hiddenBadge.className = 'hidden-badge';
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
            top: 12px;
            left: 12px;
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
        targetContainer.appendChild(hiddenBadge);
    } else if (!isHiddenForAdmin && existingBadge) {
        // Удаляем badge скрытого товара
        existingBadge.remove();
    }
}

// Показ страницы товара (вместо модального окна)
export function showProductModal(prod, finalPrice, fullImages) {
    if (!modalState) {
        console.error('❌ [PRODUCT PAGE] Modal state not initialized!');
        return;
    }
    
    // Получаем элементы страницы товара
    const productPage = document.getElementById('product-page');
    const mainContent = document.getElementById('main-content');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPage = document.getElementById('cart-page');
    
    if (!productPage) {
        console.error('❌ [PRODUCT PAGE] Product page element not found!');
        return;
    }
    
    console.log(`[PRODUCT PAGE] Opening product page: productId=${prod.id}, productName="${prod.name}"`);
    
    // Определяем, с какой страницы мы пришли
    // Проверяем, какая страница сейчас видна
    if (favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex')) {
        navigationHistory = 'favorites';
        console.log('[PRODUCT PAGE] Coming from favorites page');
    } else if (cartPage && (cartPage.style.display === 'block' || cartPage.style.display === 'flex')) {
        navigationHistory = 'cart';
        console.log('[PRODUCT PAGE] Coming from cart page');
    } else {
        navigationHistory = 'main';
        console.log('[PRODUCT PAGE] Coming from main page');
    }
    
    // Сбрасываем ID загрузки при открытии нового товара
    modalState.currentImageLoadId = 0;
    
    modalState.currentProduct = prod;
    modalState.currentImages = fullImages || [];
    modalState.currentImageIndex = 0;
    
    console.log(`[PRODUCT PAGE] State updated: currentImages.length=${modalState.currentImages.length}, currentImageLoadId=${modalState.currentImageLoadId}, productId=${prod.id}`);
    
    // Активируем блокировку горизонтального скролла
    enableHorizontalScrollBlock();
    
    // Скрываем все страницы и показываем страницу товара
    if (mainContent) mainContent.style.display = 'none';
    if (favoritesPage) favoritesPage.style.display = 'none';
    if (cartPage) cartPage.style.display = 'none';
    productPage.style.display = 'block';
    
    // Получаем актуальный appContext
    const appContext = appContextGetter ? appContextGetter() : null;
    
    // Отслеживаем просмотр конкретного товара (только для клиентов, не для владельца)
    if (appContext && appContext.role === 'client' && appContext.shop_owner_id) {
        trackShopVisit(appContext.shop_owner_id, prod.id).catch(err => {
            console.warn('Failed to track product view:', err);
        });
    }
    
    // Управление горящим предложением (только для владельца) - сразу после фото
    const productPageHotOfferControl = document.getElementById('product-page-hot-offer-control');
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        productPageHotOfferControl.style.display = 'block';
        productPageHotOfferControl.innerHTML = '';
        
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
                
                // Обновляем значок огонька на странице товара
                updateHotOfferBadgeOnProductPage(isHotOffer);
                
                // Обновляем визуальное отображение на карточках
                if (loadDataCallback) {
                    setTimeout(() => {
                        loadDataCallback();
                    }, 300);
                }
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
        productPageHotOfferControl.appendChild(hotOfferContainer);
        
        // Добавляем тумблер для скрытия товара
        const hiddenContainer = document.createElement('div');
        hiddenContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-glass); backdrop-filter: blur(10px); border-radius: 12px; margin: 12px 0;';
        
        const hiddenLabel = document.createElement('div');
        hiddenLabel.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const eyeIcon = prod.is_hidden ? '👁️‍🗨️' : '👁️';
        hiddenLabel.innerHTML = `<span style="font-size: 20px;">${eyeIcon}</span><span style="font-weight: 600;">${prod.is_hidden ? 'Скрыт от клиентов' : 'Виден клиентам'}</span>`;
        
        const hiddenToggle = document.createElement('label');
        hiddenToggle.className = 'toggle-switch';
        hiddenToggle.style.cssText = 'margin: 0;';
        
        const hiddenToggleInput = document.createElement('input');
        hiddenToggleInput.type = 'checkbox';
        hiddenToggleInput.checked = prod.is_hidden || false;
        hiddenToggleInput.onchange = async (e) => {
            const isHidden = e.target.checked;
            try {
                await updateProductHiddenAPI(prod.id, appContext.shop_owner_id, isHidden);
                prod.is_hidden = isHidden;
                // Обновляем иконку
                hiddenLabel.innerHTML = `<span style="font-size: 20px;">${isHidden ? '👁️‍🗨️' : '👁️'}</span><span style="font-weight: 600;">${isHidden ? 'Скрыт от клиентов' : 'Виден клиентам'}</span>`;
                
                // Обновляем badge скрытого товара на странице товара
                updateHiddenBadgeOnProductPage(isHidden, prod);
                
                // Обновляем визуальное отображение на карточках
                if (loadDataCallback) {
                    setTimeout(() => {
                        loadDataCallback();
                    }, 300);
                }
            } catch (error) {
                console.error('Error toggling hidden status:', error);
                alert('Ошибка при изменении статуса скрытия: ' + error.message);
                hiddenToggleInput.checked = !isHidden; // Возвращаем предыдущее значение
            }
        };
        
        const hiddenToggleSlider = document.createElement('span');
        hiddenToggleSlider.className = 'toggle-slider';
        
        hiddenToggle.appendChild(hiddenToggleInput);
        hiddenToggle.appendChild(hiddenToggleSlider);
        
        hiddenContainer.appendChild(hiddenLabel);
        hiddenContainer.appendChild(hiddenToggle);
        productPageHotOfferControl.appendChild(hiddenContainer);
    } else {
        productPageHotOfferControl.style.display = 'none';
    }
    
    // Кнопки управления товаром (только для владельца)
    const productPageEditControl = document.getElementById('product-page-edit-control');
    if (productPageEditControl) {
        productPageEditControl.innerHTML = '';
    
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        // Кнопка редактирования
        const editBtn = document.createElement('button');
        editBtn.className = 'reserve-btn btn-edit';
        editBtn.textContent = '✏️ Редактировать';
        editBtn.onclick = () => {
            if (showEditProductModalCallback) {
                showEditProductModalCallback(prod);
            }
        };
            productPageEditControl.appendChild(editBtn);
        
        // Проверяем, является ли товар для покупки (is_for_sale)
        const isForSale = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        // Кнопка "Продан" - показываем только для обычных товаров (не для покупки)
        if (!isForSale) {
            const soldBtn = document.createElement('button');
            soldBtn.className = 'reserve-btn btn-sold';
            soldBtn.textContent = '✅ Продан';
            soldBtn.onclick = () => {
                if (markAsSoldCallback) {
                    markAsSoldCallback(prod.id, prod);
                }
            };
                productPageEditControl.appendChild(soldBtn);
        }
        
        // Кнопка "Удалить"
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'reserve-btn btn-delete';
        deleteBtn.textContent = '🗑️ Удалить';
        deleteBtn.onclick = () => {
            if (deleteProductCallback) {
                deleteProductCallback(prod.id);
            }
        };
            productPageEditControl.appendChild(deleteBtn);
        
            productPageEditControl.style.display = 'flex';
    } else {
            productPageEditControl.style.display = 'none';
        }
    }
    
    // Добавляем отступ после блока кнопок, чтобы текст не прилипал
    const productPageName = document.getElementById('product-page-name');
    if (productPageName) {
        productPageName.textContent = prod.name;
    }
    
    const productPageDescription = document.getElementById('product-page-description');
    if (prod.description) {
        productPageDescription.textContent = prod.description;
        productPageDescription.style.display = 'block';
    } else {
        productPageDescription.style.display = 'none';
    }
    
    const productPagePriceContainer = document.getElementById('product-page-price-container');
    productPagePriceContainer.innerHTML = '';
    const priceSpan = document.createElement('span');
    priceSpan.className = 'product-price';
    
    // Используем функцию из priceUtils.js для форматирования цены
    const priceDisplay = getProductPriceDisplay(prod);
    priceSpan.textContent = priceDisplay;
    
    // Старая цена при скидке (только для обычных товаров)
    const isForSaleModal = prod.is_for_sale === true || 
                     prod.is_for_sale === 1 || 
                     prod.is_for_sale === '1' ||
                     prod.is_for_sale === 'true' ||
                     String(prod.is_for_sale).toLowerCase() === 'true';
    
    if (!isForSaleModal && prod.discount > 0 && prod.price != null && prod.price > 0) {
        const oldPriceSpan = document.createElement('span');
        oldPriceSpan.className = 'old-price';
        oldPriceSpan.textContent = `${prod.price} ₽`;
        productPagePriceContainer.appendChild(oldPriceSpan);
    }
    
    productPagePriceContainer.appendChild(priceSpan);
    
    // Количество товара на странице
    const productPageQuantityDiv = document.getElementById('product-page-quantity');
    if (productPageQuantityDiv) {
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
            productPageQuantityDiv.style.display = 'block';
            // Формируем текст с количеством от и единицей измерения
            const quantityFrom = prod.quantity_from !== null && prod.quantity_from !== undefined ? prod.quantity_from : null;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantityFrom !== null && quantityFrom !== undefined) {
                productPageQuantityDiv.textContent = `🛒 От ${quantityFrom} ${quantityUnit}`;
            } else {
                productPageQuantityDiv.textContent = '🛒 Покупка';
            }
        } else if (isMadeToOrder) {
            productPageQuantityDiv.style.display = 'block';
            productPageQuantityDiv.textContent = '📦 Под заказ';
        } else if (prod.quantity !== undefined && prod.quantity !== null) {
            productPageQuantityDiv.style.display = 'block';
            // Получаем единицу измерения
            const quantityUnit = prod.quantity_unit || 'шт';
            // Проверяем активные резервации
            const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
            const availableCount = prod.quantity - activeReservationsCount;
            
            // Если quantity_enabled включен, показываем количество с учетом резерваций
            if (quantityEnabledForModal) {
                if (activeReservationsCount > 0) {
                    // Если есть резервации, показываем "Доступно: X из Y единица"
                    productPageQuantityDiv.textContent = `📦 Доступно: ${availableCount} из ${prod.quantity} ${quantityUnit}`;
                } else {
                    // Если резерваций нет, показываем просто "В наличии: Y единица"
                    productPageQuantityDiv.textContent = `📦 В наличии: ${prod.quantity} ${quantityUnit}`;
                }
            } else {
                // Если quantity_enabled выключен, показываем просто "В наличии"
                productPageQuantityDiv.textContent = '📦 В наличии';
            }
        } else if (!quantityEnabledForModal) {
            // Если quantity_enabled выключен и quantity не указан, показываем просто "В наличии"
            productPageQuantityDiv.style.display = 'block';
            productPageQuantityDiv.textContent = '📦 В наличии';
        } else {
            productPageQuantityDiv.style.display = 'none';
        }
    }
    
    // Резервация (только если quantity_enabled включен)
    const productPageReservationButton = document.getElementById('product-page-reservation-button');
    const productPageReservationStatus = document.getElementById('product-page-reservation-status');
    productPageReservationButton.innerHTML = '';
    productPageReservationStatus.style.display = 'none';
    
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
        
        productPageReservationStatus.style.display = 'block';
        
        // Показываем информацию о резервации с учетом количества (только если quantity_enabled включен)
        if (quantityEnabledForReservation && productQuantity > 1 && activeReservationsCount > 0) {
            const availableCount = productQuantity - activeReservationsCount;
            const quantityUnit = prod.quantity_unit || 'шт';
            productPageReservationStatus.textContent = `⏰ Зарезервировано: ${activeReservationsCount} из ${productQuantity} ${quantityUnit} (доступно: ${availableCount} ${quantityUnit}) до ${timeText}`;
        } else {
            productPageReservationStatus.textContent = `⏰ Товар зарезервирован на ${timeText}`;
        }
        
        // Проверяем права на отмену через контекст
        const isProductOwner = appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id;
        const isReserver = appContext.viewer_id === prod.reservation.reserved_by_user_id;
        const canCancel = isProductOwner || isReserver;
        
        if (canCancel) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'reserve-btn cancel-reservation-btn';
            cancelBtn.textContent = '❌ Снять резерв';
            cancelBtn.onclick = () => {
                if (cancelReservationCallback) {
                    cancelReservationCallback(prod.reservation.id, prod.id);
                }
            };
            productPageReservationButton.appendChild(cancelBtn);
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
    
    // Проверяем, является ли товар для продажи (is_for_sale)
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
        sellBtn.onclick = () => {
            if (showPurchaseModalCallback) {
                showPurchaseModalCallback(prod);
            }
        };
        productPageReservationButton.appendChild(sellBtn);
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
            reserveBtn.onclick = () => {
                if (showReservationModalCallback) {
                    showReservationModalCallback(prod.id);
                }
            };
            productPageReservationButton.appendChild(reserveBtn);
        } else if (!reservationsEnabled) {
            console.log('🔒 Reservations disabled - button not shown');
        }
        
        // Показываем кнопку "Заказать" для товаров под заказ (только для клиентов)
        if (isMadeToOrder && appContext.role === 'client') {
            const orderBtn = document.createElement('button');
            orderBtn.className = 'reserve-btn';
            orderBtn.style.background = 'rgba(90, 200, 250, 0.95)';
            orderBtn.textContent = '🛒 Заказать';
            orderBtn.onclick = () => {
                if (showOrderModalCallback) {
                    showOrderModalCallback(prod.id);
                }
            };
            productPageReservationButton.appendChild(orderBtn);
        }
    }
    
    // Добавляем кнопку избранного на страницу товара (только для клиентов)
    const productPageImage = document.getElementById('product-page-image');
    console.log('[PRODUCT PAGE] Adding favorite button:', {
        productPageImage: !!productPageImage,
        appContext: !!appContext,
        role: appContext?.role,
        isClient: appContext?.role === 'client'
    });
    
    if (productPageImage && appContext && appContext.role === 'client') {
        // Удаляем старую кнопку избранного, если она есть
        const oldFavoriteButton = productPageImage.querySelector('.favorite-button-product-page');
        if (oldFavoriteButton) {
            oldFavoriteButton.remove();
        }
        
        // Создаем кнопку избранного
        const favoriteButton = document.createElement('button');
        favoriteButton.className = 'favorite-button-card favorite-button-product-page';
        favoriteButton.setAttribute('aria-label', 'Добавить в избранное');
        favoriteButton.dataset.productId = prod.id;
        console.log('[PRODUCT PAGE] Favorite button created for product:', prod.id);
        
        // SVG иконка сердца - симметричная форма
        favoriteButton.innerHTML = `
            <svg viewBox="0 0 24 24" class="favorite-heart" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
        `;
        
        // Функция обновления состояния кнопки избранного
        function updateFavoriteButtonState(button, favorite) {
            if (favorite) {
                button.classList.add('favorite-active');
            } else {
                button.classList.remove('favorite-active');
            }
        }
        
        // Проверяем статус избранного асинхронно
        (async () => {
            try {
                // Правильный путь: из handlers/ в js/ - это ../favorites.js
                const favoritesModule = await import('../favorites.js');
                if (favoritesModule.checkFavorite && prod.id) {
                    const isFavorite = await favoritesModule.checkFavorite(prod.id);
                    updateFavoriteButtonState(favoriteButton, isFavorite);
                }
            } catch (e) {
                console.warn('[PRODUCT PAGE] Error loading favorites module:', e);
                // Игнорируем ошибку, модуль необязательный
                updateFavoriteButtonState(favoriteButton, false);
            }
        })();
        
        // Обработчик клика на кнопку избранного (optimistic UI)
        favoriteButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Защита от повторных кликов во время обработки
            if (favoriteButton.dataset.processing === 'true') {
                const processingStartTime = parseInt(favoriteButton.dataset.processingStartTime || '0');
                const now = Date.now();
                if (processingStartTime && (now - processingStartTime) > 5000) {
                    delete favoriteButton.dataset.processing;
                    delete favoriteButton.dataset.processingStartTime;
                } else {
                    return;
                }
            }
            
            // Используем актуальное состояние из DOM
            const currentFavoriteState = favoriteButton.classList.contains('favorite-active');
            
            // Optimistic UI - меняем состояние МГНОВЕННО
            const newFavoriteState = !currentFavoriteState;
            favoriteButton.dataset.processing = 'true';
            favoriteButton.dataset.processingStartTime = Date.now().toString();
            
            // Функция для обновления всех кнопок избранного для этого товара (optimistic)
            function updateAllFavoriteButtonsForProductOptimistic(productId, isFavorite) {
                // Обновляем кнопку на странице товара
                updateFavoriteButtonState(favoriteButton, isFavorite);
                
                // Находим и обновляем все кнопки избранного на карточках товаров
                const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                allFavoriteButtons.forEach(btn => {
                    // Пропускаем кнопку на странице товара, чтобы не обновлять её дважды
                    if (btn !== favoriteButton) {
                        updateFavoriteButtonState(btn, isFavorite);
                    }
                });
            }
            
            // Обновляем ВСЕ кнопки избранного для этого товара (optimistic)
            updateAllFavoriteButtonsForProductOptimistic(prod.id, newFavoriteState);
            
            // Функция для обновления всех кнопок избранного для этого товара
            function updateAllFavoriteButtonsForProduct(productId, isFavorite) {
                // Обновляем кнопку на странице товара
                updateFavoriteButtonState(favoriteButton, isFavorite);
                
                // Находим и обновляем все кнопки избранного на карточках товаров
                const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                allFavoriteButtons.forEach(btn => {
                    // Пропускаем кнопку на странице товара, чтобы не обновлять её дважды
                    if (btn !== favoriteButton) {
                        updateFavoriteButtonState(btn, isFavorite);
                    }
                });
                
                console.log(`[FAVORITES] Updated ${allFavoriteButtons.length} favorite buttons for product ${productId}, state: ${isFavorite}`);
            }
            
            // Запрос в API - асинхронно (в фоне)
            try {
                // Правильный путь: из handlers/ в js/ - это ../favorites.js
                const favoritesModule = await import('../favorites.js');
                if (favoritesModule.toggleFavorite) {
                    const result = await favoritesModule.toggleFavorite(prod.id);
                    
                    // Синхронизируем с ответом сервера - обновляем ВСЕ кнопки для этого товара
                    updateAllFavoriteButtonsForProduct(prod.id, result.is_favorite);
                    
                    // Обновляем счетчик
                    if (favoritesModule.updateFavoritesCount) {
                        await favoritesModule.updateFavoritesCount();
                    }
                }
            } catch (error) {
                console.error('❌ Error toggling favorite on product page:', error);
                // Откатываем optimistic изменение при ошибке - обновляем ВСЕ кнопки
                updateAllFavoriteButtonsForProduct(prod.id, currentFavoriteState);
                alert(error.message || 'Ошибка при изменении избранного');
            } finally {
                // Снимаем блокировку
                delete favoriteButton.dataset.processing;
                delete favoriteButton.dataset.processingStartTime;
            }
        });
        
        // Добавляем кнопку в контейнер изображения (будет добавлена в showProductPageImage)
        // Временно добавляем в productPageImage, потом она будет перемещена в контейнер изображения
        productPageImage.appendChild(favoriteButton);
    }
    
    // Показываем изображение на странице товара
    showProductPageImage(0);
}
// ========== END REFACTORING STEP 3.1 ==========

// История навигации - отслеживаем, откуда пришли на страницу товара
let navigationHistory = null; // 'main' или 'favorites'

// Функция для закрытия страницы товара
export function closeProductPage() {
    console.log('[PRODUCT PAGE] Closing product page, returning to:', navigationHistory);
    const productPage = document.getElementById('product-page');
    const mainContent = document.getElementById('main-content');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPage = document.getElementById('cart-page');
    const productPageImage = document.getElementById('product-page-image');
    
    if (productPage) {
        // Очищаем blob URL если был
        if (productPageImage) {
            const oldBlobUrl = productPageImage.dataset.blobUrl;
            if (oldBlobUrl) {
                URL.revokeObjectURL(oldBlobUrl);
                delete productPageImage.dataset.blobUrl;
            }
            // Очищаем навигацию
            const oldNav = productPageImage.querySelector('.product-page-image-navigation');
            if (oldNav) {
                oldNav.remove();
            }
            // Полностью очищаем содержимое
            productPageImage.innerHTML = '';
        }
        
        // Деактивируем блокировку горизонтального скролла
        disableHorizontalScrollBlock();
        
        // Скрываем страницу товара
        productPage.style.display = 'none';
        
        // Возвращаемся на предыдущую страницу в зависимости от истории навигации
        // Скрываем все страницы сначала
        if (mainContent) mainContent.style.display = 'none';
        if (favoritesPage) favoritesPage.style.display = 'none';
        if (cartPage) cartPage.style.display = 'none';
        
        // Показываем нужную страницу
        if (navigationHistory === 'favorites' && favoritesPage) {
            favoritesPage.style.display = 'block';
        } else if (navigationHistory === 'cart' && cartPage) {
            cartPage.style.display = 'block';
        } else if (mainContent) {
            // По умолчанию возвращаемся на главную
            mainContent.style.display = 'block';
        }
        
        // Сбрасываем историю навигации
        navigationHistory = null;
        
        // Сбрасываем состояние
        if (modalState) {
            modalState.currentImageLoadId = 0;
            modalState.currentImages = [];
            modalState.currentImageIndex = 0;
        }
    }
}

