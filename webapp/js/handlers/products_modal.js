// Модуль для модального окна товара
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 3.1: showProductModal ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { getCurrentShopSettings, openAdmin } from '../admin.js';
import { toggleHotOffer, trackShopVisit, updateProductHiddenAPI } from '../api.js';
import { hideAllPages } from '../operationsBase.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import { renderProductPagePricesBlock } from '../utils/productCardParts.js';
import { isMobileDevice } from '../utils/products_utils.js';
import { showNotification } from '../utils/admin_utils.js';
import { showClientDetail } from './admin_clients.js';
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
let showSaleOrderModalCallback = null; // Функция для показа модального окна заказа на покупку
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

// Toast на странице товара — сверху справа, type: "ok" | "bad", авто-скрытие ~2 сек
// @deprecated Для тумблеров hot/visibility используется showNotification из admin_utils.js. Оставлено для совместимости.
function showProductToast(message, type) {
    const host = document.getElementById('product-page-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'product-toast toast--' + (type === 'ok' ? 'ok' : 'bad');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

// ========== ПОДПИСКА НА СОБЫТИЕ ОБНОВЛЕНИЯ ТОВАРА ==========
// Подписываемся на событие product:updated для обновления UI при изменении товара
let productUpdateHandler = null;

function setupProductUpdateListener() {
    if (productUpdateHandler) {
        // Уже подписаны, не дублируем
        return;
    }
    
    productUpdateHandler = (event) => {
        const { productId, clientVisibleId, ownerProduct, clientProduct } = event.detail || {};
        if (!productId) return;
        
        // ========== DEBUG: Логирование получения события ==========
        const DEBUG_PRODUCT_MODAL = true; // Установить в false для отключения
        if (DEBUG_PRODUCT_MODAL) {
            console.log(`[PRODUCT MODAL] Received product:updated event for product ${productId}:`, {
                productId,
                clientVisibleId,
                action_type: clientProduct?.action_type || ownerProduct?.action_type,
                can_add_to_cart: clientProduct?.can_add_to_cart || ownerProduct?.can_add_to_cart
            });
        }
        // ========== КОНЕЦ DEBUG ==========
        
        // Проверяем, открыта ли страница товара
        const productPage = document.getElementById('product-page');
        const isProductPageOpen = productPage && (productPage.style.display === 'block' || productPage.style.display === 'flex');
        
        if (!isProductPageOpen) {
            // Страница товара не открыта, ничего не делаем
            return;
        }
        
        // Проверяем, что это тот же товар (по ID или sync_product_id)
        try {
            // Получаем текущий продукт из кэша для сравнения
            const allProducts = typeof window.getAllProducts === 'function' ? window.getAllProducts() : [];
            if (!Array.isArray(allProducts)) return;
            
            // Ищем продукт в кэше по ID или sync_product_id
            const targetProductId = clientVisibleId || productId;
            const cachedProduct = allProducts.find(p => 
                p && (p.id === targetProductId || 
                     p.id === productId ||
                     (p.sync_product_id && (p.sync_product_id === targetProductId || p.sync_product_id === productId)) ||
                     (targetProductId && p.id === targetProductId))
            );
            
            // ========== DEBUG: Логирование поиска товара в кэше ==========
            const DEBUG_EVENT_SEARCH = true; // Установить в false для отключения
            if (DEBUG_EVENT_SEARCH) {
                console.log(`[PRODUCT MODAL DEBUG] Searching for product in cache:`, {
                    productId,
                    clientVisibleId,
                    targetProductId,
                    allProductsLength: allProducts.length,
                    cachedProductFound: !!cachedProduct,
                    cachedProductId: cachedProduct?.id,
                    cachedProductActionType: cachedProduct?.action_type
                });
            }
            // ========== КОНЕЦ DEBUG ==========
            
            if (!cachedProduct) {
                // Продукт не найден в кэше, возможно еще не загружен
                return;
            }
            
            // Обновляем bottom sheet с СВЕЖИМ продуктом из кэша
            updateProductPageBottomSheet(cachedProduct).catch(error => {
                console.warn(`[PRODUCT MODAL] Failed to update bottom sheet after product:updated event:`, {
                    message: error?.message || 'Unknown error',
                    productId: productId
                });
            });
            
            if (DEBUG_PRODUCT_MODAL) {
                console.log(`[PRODUCT MODAL] ✅ Updated bottom sheet for product ${productId} after product:updated event`);
            }
        } catch (error) {
            console.warn(`[PRODUCT MODAL] Error handling product:updated event:`, {
                message: error?.message || 'Unknown error',
                stack: error?.stack || '',
                productId: productId
            });
        }
    };
    
    window.addEventListener('product:updated', productUpdateHandler);
}

// Инициализация зависимостей для showProductModal
export function initProductModalDependencies(dependencies) {
    // Настраиваем подписку на событие обновления товара
    setupProductUpdateListener();
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
    showSaleOrderModalCallback = dependencies.showSaleOrderModal;
    
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

// ========== СЛАЙДЕР ФОТО ТОВАРА (как в Яндекс Маркете) ==========
// Инициализация слайдера с поддержкой touch/drag и snap
function initProductSlider(sliderElement, images, currentIndex = 0) {
    if (!sliderElement || !images || images.length === 0) return;
    
    const slider = sliderElement.querySelector('.product-slider');
    if (!slider) return;
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let velocity = 0;
    let lastX = 0;
    let lastTime = 0;
    let animationFrame = null;
    let isHorizontalSwipe = false; // Флаг для определения горизонтального свайпа
    let snapTimeout = null; // Таймер для debounce snap
    
    // Функция для получения ширины одного слайда (92% от контейнера + gap 4px)
    function getSlideWidth() {
        const containerWidth = slider.getBoundingClientRect().width || slider.offsetWidth || slider.clientWidth;
        // 92% от ширины контейнера (без учета padding)
        const slideWidthPercent = containerWidth * 0.92;
        // Gap 4px добавляется между слайдами
        return slideWidthPercent + 4;
    }
    
    // Функция для получения ширины слайда без gap (для вычисления позиции)
    function getSlideWidthWithoutGap() {
        const containerWidth = slider.getBoundingClientRect().width || slider.offsetWidth || slider.clientWidth;
        return containerWidth * 0.92;
    }
    
    let slideWidth = getSlideWidth();
    const totalSlides = images.length;
    
    // Функция для получения текущего индекса слайда
    function getCurrentSlideIndex() {
        const scrollPosition = slider.scrollLeft;
        // Padding убран - слайдер на весь экран
        return Math.round(scrollPosition / slideWidth);
    }
    
    // Обработчик изменения размера окна для пересчета ширины слайда
    const handleResize = () => {
        const newWidth = getSlideWidth();
        if (newWidth !== slideWidth && slideWidth > 0) {
            // Пересчитываем позицию скролла при изменении размера
            const currentIndex = getCurrentSlideIndex();
            slideWidth = newWidth;
            slider.scrollLeft = 16 + (currentIndex * slideWidth);
        }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Сохраняем обработчик для последующего удаления
    slider.dataset.resizeHandler = 'true';
    
    // Функция для обновления индикатора
    function updateIndicator(index) {
        const indicator = sliderElement.querySelector('.product-slider-indicator');
        if (!indicator) return;
        
        const dots = indicator.querySelectorAll('.product-slider-dot');
        dots.forEach((dot, i) => {
            if (i === index) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
    
    // Функция для snap к ближайшему слайду с ограничением на 1 слайд
    function snapToNearestSlide() {
        const scrollPosition = slider.scrollLeft;
        // Padding убран - слайдер на весь экран
        
        // Получаем текущий индекс
        const currentIndex = getCurrentSlideIndex();
        
        // Находим ближайший слайд
        let nearestIndex = Math.round(scrollPosition / slideWidth);
        nearestIndex = Math.max(0, Math.min(nearestIndex, totalSlides - 1));
        
        // ОГРАНИЧЕНИЕ: максимум 1 слайд за раз (запрет пропуска)
        const delta = nearestIndex - currentIndex;
        if (Math.abs(delta) > 1) {
            // Если пытаемся перепрыгнуть больше чем на 1 слайд, ограничиваем
            nearestIndex = currentIndex + (delta > 0 ? 1 : -1);
            nearestIndex = Math.max(0, Math.min(nearestIndex, totalSlides - 1));
        }
        
        // Вычисляем позицию (center snap работает через CSS)
        const targetScroll = nearestIndex * slideWidth;
        
        // Плавная прокрутка к целевому слайду
        slider.scrollTo({
            left: targetScroll,
            behavior: 'smooth'
        });
        
        // Обновляем индекс в состоянии
        if (modalState) {
            modalState.currentImageIndex = nearestIndex;
        }
        
        updateIndicator(nearestIndex);
    }
    
    // Debounce для snap через scroll event (улучшенный)
    function scheduleSnap() {
        clearTimeout(snapTimeout);
        snapTimeout = setTimeout(() => {
            if (!isDragging) {
                snapToNearestSlide();
            }
        }, 100); // Увеличена задержка до 100ms для более плавной парковки
    }
    
    // Touch события БЕЗ блокировки вертикального скролла
    slider.addEventListener('touchstart', (e) => {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        scrollLeft = slider.scrollLeft;
        velocity = 0;
        lastX = e.touches[0].clientX;
        lastTime = Date.now();
        isHorizontalSwipe = false; // Сбрасываем флаг
        
        // Отменяем плавную прокрутку для мгновенного отклика
        slider.style.scrollBehavior = 'auto';
    }, { passive: true });
    
    slider.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const dx = Math.abs(currentX - startX);
        const dy = Math.abs(currentY - startY);
        
        // Определяем направление свайпа (порог увеличен для лучшего определения)
        if (dx > dy && dx > 15) {
            // Горизонтальный свайп - НЕ блокируем вертикальный скролл, только управляем горизонтальным
            isHorizontalSwipe = true;
            // НЕ вызываем preventDefault - позволяем вертикальному скроллу работать
            
            const x = currentX - slider.getBoundingClientRect().left;
            const walk = (x - (startX - slider.getBoundingClientRect().left));
            const newScrollLeft = scrollLeft - walk;
            
            // Ограничиваем скролл границами (padding убран)
            const maxScroll = slideWidth * (totalSlides - 1);
            slider.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));
            
            // Вычисляем скорость для инерции
            const now = Date.now();
            const timeDelta = now - lastTime;
            if (timeDelta > 0) {
                const distance = currentX - lastX;
                velocity = distance / timeDelta;
            }
            lastX = currentX;
            lastTime = now;
        } else if (dy > dx && dy > 15) {
            // Вертикальный свайп - не трогаем слайдер, позволяем скроллить страницу
            isHorizontalSwipe = false;
        }
    }, { passive: true }); // passive: true - не блокируем нативные события
    
    slider.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        
        // Восстанавливаем плавную прокрутку
        slider.style.scrollBehavior = 'smooth';
        
        // Применяем инерцию только если был горизонтальный свайп
        if (isHorizontalSwipe) {
            const threshold = 30; // Уменьшен порог для более чувствительного определения
            const currentIndex = getCurrentSlideIndex();
            const scrollPosition = slider.scrollLeft;
            const slidePosition = currentIndex * slideWidth;
            const distance = scrollPosition - slidePosition;
            
            // ОГРАНИЧЕНИЕ: максимум 1 слайд за жест
            // Если скорость высокая или расстояние большое - перелистываем на 1 слайд
            if (Math.abs(velocity) > 0.3 || Math.abs(distance) > threshold) {
                if (velocity > 0.2 && currentIndex > 0) {
                    // Свайп влево - предыдущий слайд (максимум 1)
                    const targetScroll = (currentIndex - 1) * slideWidth;
                    slider.scrollTo({
                        left: targetScroll,
                        behavior: 'smooth'
                    });
                    if (modalState) modalState.currentImageIndex = currentIndex - 1;
                    updateIndicator(currentIndex - 1);
                } else if (velocity < -0.2 && currentIndex < totalSlides - 1) {
                    // Свайп вправо - следующий слайд (максимум 1)
                    const targetScroll = (currentIndex + 1) * slideWidth;
                    slider.scrollTo({
                        left: targetScroll,
                        behavior: 'smooth'
                    });
                    if (modalState) modalState.currentImageIndex = currentIndex + 1;
                    updateIndicator(currentIndex + 1);
                } else {
                    // Возвращаемся к ближайшему слайду через debounce
                    scheduleSnap();
                }
            } else {
                // Медленный свайп - возвращаемся к текущему слайду через debounce
                scheduleSnap();
            }
        }
        
        velocity = 0;
        isHorizontalSwipe = false;
    }, { passive: true });
    
    // Mouse события (для десктопа)
    slider.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        velocity = 0;
        lastX = e.pageX;
        lastTime = Date.now();
        slider.style.scrollBehavior = 'auto';
        slider.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    slider.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX);
        const newScrollLeft = scrollLeft - walk;
        
        const maxScroll = slideWidth * (totalSlides - 1);
        slider.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));
        
        const now = Date.now();
        const timeDelta = now - lastTime;
        if (timeDelta > 0) {
            const distance = e.pageX - lastX;
            velocity = distance / timeDelta;
        }
        lastX = e.pageX;
        lastTime = now;
    });
    
    slider.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            slider.style.scrollBehavior = 'smooth';
            slider.style.cursor = 'grab';
            scheduleSnap();
        }
    });
    
    slider.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            slider.style.scrollBehavior = 'smooth';
            slider.style.cursor = 'grab';
            
            const threshold = 50;
            const currentIndex = getCurrentSlideIndex();
            const scrollPosition = slider.scrollLeft;
            const slidePosition = currentIndex * slideWidth;
            const distance = scrollPosition - slidePosition;
            
            if (Math.abs(velocity) > 0.5 || Math.abs(distance) > threshold) {
                if (velocity > 0.3 && currentIndex > 0) {
                    const targetScroll = (currentIndex - 1) * slideWidth;
                    slider.scrollTo({
                        left: targetScroll,
                        behavior: 'smooth'
                    });
                    if (modalState) modalState.currentImageIndex = currentIndex - 1;
                    updateIndicator(currentIndex - 1);
                } else if (velocity < -0.3 && currentIndex < totalSlides - 1) {
                    const targetScroll = (currentIndex + 1) * slideWidth;
                    slider.scrollTo({
                        left: targetScroll,
                        behavior: 'smooth'
                    });
                    if (modalState) modalState.currentImageIndex = currentIndex + 1;
                    updateIndicator(currentIndex + 1);
                } else {
                    scheduleSnap();
                }
            } else {
                scheduleSnap();
            }
            
            velocity = 0;
        }
    });
    
    // Обработчик события scroll для обновления индикатора и debounce snap
    slider.addEventListener('scroll', () => {
        if (!isDragging) {
            const index = getCurrentSlideIndex();
            if (modalState) modalState.currentImageIndex = index;
            updateIndicator(index);
            // Debounce snap для "мягкой парковки"
            scheduleSnap();
        }
    }, { passive: true });
    
    // Устанавливаем начальную позицию (padding убран)
    slider.scrollLeft = currentIndex * slideWidth;
    updateIndicator(currentIndex);
    
    // Очистка обработчиков при удалении слайдера
    const originalRemove = slider.remove;
    slider.remove = function() {
        window.removeEventListener('resize', handleResize);
        clearTimeout(snapTimeout);
        if (originalRemove) originalRemove.call(this);
    };
}

// Функция для отображения слайдера изображений на странице товара
function showProductPageImage(index = 0) {
    if (!modalState) {
        console.error('❌ [PRODUCT PAGE IMG] Modal state not initialized!');
        return;
    }
    
    const productPageImage = document.getElementById('product-page-image');
    if (!productPageImage) {
        console.error('❌ [PRODUCT PAGE IMG] Product page image element not found!');
        return;
    }
    
    // На странице товара бейджи hot/hidden на фото не показываем (только в карточках каталога)
    // Увеличиваем ID загрузки, чтобы отменить старые запросы
    modalState.currentImageLoadId++;
    const loadId = modalState.currentImageLoadId;
    
    // Очищаем предыдущие blob URL если были
    const oldBlobUrls = productPageImage.dataset.blobUrls ? JSON.parse(productPageImage.dataset.blobUrls) : [];
    oldBlobUrls.forEach(url => {
        if (url) URL.revokeObjectURL(url);
    });
    delete productPageImage.dataset.blobUrls;
    
    // Очищаем содержимое полностью
    productPageImage.innerHTML = '';
    
    // Если товар без фото, показываем placeholder и выходим
    if (modalState.currentImages.length === 0) {
        productPageImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
        const placeholderDiv = document.createElement('div');
        placeholderDiv.className = 'product-slider-placeholder';
        placeholderDiv.innerHTML = '📷';
        productPageImage.appendChild(placeholderDiv);
        return;
    }
    
    // Валидация индекса
    const validIndex = Math.max(0, Math.min(index, modalState.currentImages.length - 1));
    modalState.currentImageIndex = validIndex;
    
    console.log(`[PRODUCT SLIDER] Creating slider: index=${validIndex}, totalImages=${modalState.currentImages.length}, productId=${modalState.currentProduct?.id || 'unknown'}`);
    console.log(`[PRODUCT SLIDER] modalState.currentImages:`, modalState.currentImages);
    
    // Проверяем, что есть изображения для слайдера
    if (!modalState.currentImages || modalState.currentImages.length === 0) {
        console.error('[PRODUCT SLIDER] No images to create slider!');
        console.error('[PRODUCT SLIDER] modalState:', modalState);
        console.error('[PRODUCT SLIDER] productPageImage:', productPageImage);
        return;
    }
    
    // Создаем структуру слайдера
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'product-slider-container';
    sliderContainer.style.cssText = 'position: relative; width: 100%; height: 100%;';
    
    const slider = document.createElement('div');
    slider.className = 'product-slider';
    slider.style.cursor = 'grab';
    
    const sliderTrack = document.createElement('div');
    sliderTrack.className = 'product-slider-track';
    // Явно устанавливаем display: flex для track
    sliderTrack.style.display = 'flex';
    sliderTrack.style.flexDirection = 'row';
    
    // Массив для хранения blob URL (для очистки)
    const blobUrls = [];
    
    // Определяем, мобильное устройство или десктоп
    const isMobile = isMobileDevice();
    
    // Создаем слайды для всех изображений
    modalState.currentImages.forEach((imageUrl, imgIndex) => {
        const slide = document.createElement('div');
        slide.className = 'product-slider-slide';
        slide.dataset.index = imgIndex;
        
        // Placeholder для загрузки
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); color: var(--text-hint); font-size: 48px;';
        placeholder.innerHTML = '⏳';
        slide.appendChild(placeholder);
        
        // Загружаем изображение
        const loadImage = (url) => {
            if (isMobile) {
                // На мобильных устройствах используем fetch + blob URL
                fetch(url, {
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
                    blobUrls.push(blobUrl);
                    
                    const img = document.createElement('img');
                    img.src = blobUrl;
                    img.alt = modalState.currentProduct ? modalState.currentProduct.name : 'Product';
                    
                    img.onload = () => {
                        if (loadId !== modalState.currentImageLoadId) {
                            URL.revokeObjectURL(blobUrl);
                            return;
                        }
                        slide.innerHTML = '';
                        slide.appendChild(img);
                    };
                    
                    img.onerror = () => {
                        if (loadId !== modalState.currentImageLoadId) {
                            URL.revokeObjectURL(blobUrl);
                            return;
                        }
                        slide.innerHTML = '';
                        const errorPlaceholder = document.createElement('div');
                        errorPlaceholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); color: var(--text-hint); font-size: 48px;';
                        errorPlaceholder.textContent = '📷';
                        slide.appendChild(errorPlaceholder);
                    };
                })
                .catch(error => {
                    if (loadId !== modalState.currentImageLoadId) {
                        return;
                    }
                    console.error(`[PRODUCT SLIDER] Image load error: ${error.message}`);
                    slide.innerHTML = '';
                    const errorPlaceholder = document.createElement('div');
                    errorPlaceholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); color: var(--text-hint); font-size: 48px;';
                    errorPlaceholder.textContent = '📷';
                    slide.appendChild(errorPlaceholder);
                });
            } else {
                // На десктопе используем прямые URL
                const img = document.createElement('img');
                img.src = url;
                img.alt = modalState.currentProduct ? modalState.currentProduct.name : 'Product';
                
                img.onload = () => {
                    if (loadId !== modalState.currentImageLoadId) {
                        return;
                    }
                    slide.innerHTML = '';
                    slide.appendChild(img);
                };
                
                img.onerror = () => {
                    if (loadId !== modalState.currentImageLoadId) {
                        return;
                    }
                    // Fallback через fetch
                    fetch(url, {
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
                        blobUrls.push(blobUrl);
                        img.src = blobUrl;
                    })
                    .catch(error => {
                        if (loadId !== modalState.currentImageLoadId) {
                            return;
                        }
                        slide.innerHTML = '';
                        const errorPlaceholder = document.createElement('div');
                        errorPlaceholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); color: var(--text-hint); font-size: 48px;';
                        errorPlaceholder.textContent = '📷';
                        slide.appendChild(errorPlaceholder);
                    });
                };
            }
        };
        
        loadImage(imageUrl);
        sliderTrack.appendChild(slide);
    });
    
    // Проверяем, что слайды созданы
    console.log(`[PRODUCT SLIDER] Created ${sliderTrack.children.length} slides`);
    if (sliderTrack.children.length === 0) {
        console.error('[PRODUCT SLIDER] No slides created!');
        return;
    }
    
    // Если только одно фото - центрируем его
    if (sliderTrack.children.length === 1) {
        sliderTrack.classList.add('single-slide');
        sliderTrack.style.justifyContent = 'center';
    }
    
    // Сохраняем blob URLs для очистки
    productPageImage.dataset.blobUrls = JSON.stringify(blobUrls);
    
    slider.appendChild(sliderTrack);
    sliderContainer.appendChild(slider);
    
    // Добавляем индикатор точек (только если больше одного изображения)
    if (modalState.currentImages.length > 1) {
        const indicator = document.createElement('div');
        indicator.className = 'product-slider-indicator';
        
        modalState.currentImages.forEach((_, dotIndex) => {
            const dot = document.createElement('div');
            dot.className = 'product-slider-dot';
            if (dotIndex === validIndex) {
                dot.classList.add('active');
            }
            indicator.appendChild(dot);
        });
        
        sliderContainer.appendChild(indicator);
    }
    
    productPageImage.appendChild(sliderContainer);
    productPageImage.style.backgroundColor = 'transparent';
    
    // Инициализируем слайдер после добавления в DOM
    setTimeout(() => {
        initProductSlider(sliderContainer, modalState.currentImages, validIndex);
    }, 0);
}

// Старая функция навигации удалена - теперь используется слайдер с встроенной навигацией

// Функция для обновления значка горящего предложения на странице товара
// На product-page бейджи на фото отключены — бейджи только в карточках каталога.
function updateHotOfferBadgeOnProductPage(isHotOffer) {
    // Ничего не делаем: на странице товара бейджи на фото не показываем.
}

// Функция для обновления badge скрытого товара на странице товара
// На product-page бейджи на фото отключены — бейджи только в карточках каталога.
function updateHiddenBadgeOnProductPage(isHidden, prod) {
    // Ничего не делаем: на странице товара бейджи на фото не показываем.
}

// Показ страницы товара (вместо модального окна)
export function showProductModal(prod, finalPrice, fullImages, fromAdmin = false, clientId = null) {
    if (!modalState) {
        console.error('❌ [PRODUCT PAGE] Modal state not initialized!');
        return;
    }
    
    console.log('[PRODUCT PAGE] showProductModal called:', {
        productId: prod?.id,
        productName: prod?.name,
        fullImages: fullImages,
        fullImagesLength: fullImages?.length,
        images_urls: prod?.images_urls,
        image_url: prod?.image_url
    });
    
    // Получаем элементы страницы товара
    const productPage = document.getElementById('product-page');
    const mainContent = document.getElementById('main-content');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPage = document.getElementById('cart-page');
    const cartPageNew = document.getElementById('cart-page-new');
    const operationDetailPage = document.getElementById('operation-detail-page');
    const fromOperationDetail = operationDetailPage && (operationDetailPage.style.display === 'block' || operationDetailPage.style.display === 'flex');
    
    if (!productPage) {
        console.error('❌ [PRODUCT PAGE] Product page element not found!');
        return;
    }
    
    console.log(`[PRODUCT PAGE] Opening product page: productId=${prod.id}, productName="${prod.name}"`);
    
    // Определяем, с какой страницы мы пришли
    // Если явно указано, что пришли из админки, сохраняем это (приоритет над другими проверками)
    if (fromAdmin) {
        navigationHistory = 'admin';
        adminClientId = clientId || (typeof window !== 'undefined' ? window.adminClientId : null); // Сохраняем ID клиента для возврата
        console.log('[PRODUCT PAGE] Coming from admin page, clientId:', adminClientId, 'fromAdmin:', fromAdmin);
    } else if (fromOperationDetail) {
        navigationHistory = 'operation-detail';
        adminClientId = null;
        console.log('[PRODUCT PAGE] Coming from operation detail page');
    } else {
        // Если НЕ из админки, ВСЕГДА сбрасываем историю навигации админки
        if (favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex')) {
            navigationHistory = 'favorites';
            adminClientId = null;
            console.log('[PRODUCT PAGE] Coming from favorites page, resetting admin history');
        } else if ((cartPageNew && (cartPageNew.style.display === 'block' || cartPageNew.style.display === 'flex')) ||
                   (cartPage && (cartPage.style.display === 'block' || cartPage.style.display === 'flex'))) {
            navigationHistory = 'cart';
            adminClientId = null;
            console.log('[PRODUCT PAGE] Coming from cart page, resetting admin history');
        } else {
            navigationHistory = 'main';
            adminClientId = null;
            console.log('[PRODUCT PAGE] Coming from main page, resetting admin history. fromAdmin:', fromAdmin);
        }
    }
    
    // Сбрасываем ID загрузки при открытии нового товара
    modalState.currentImageLoadId = 0;
    
    // Формируем fullImages если они не переданы
    let imagesToUse = fullImages;
    if (!imagesToUse || imagesToUse.length === 0) {
        // Fallback: формируем из prod.images_urls или prod.image_url
        let imagesList = [];
        if (prod.images_urls && Array.isArray(prod.images_urls) && prod.images_urls.length > 0) {
            imagesList = prod.images_urls;
        } else if (prod.image_url) {
            imagesList = [prod.image_url];
        }
        
        // Преобразуем в полные URL (синхронно)
        const API_BASE = window.API_BASE || '';
        imagesToUse = imagesList.map(imgUrl => {
            if (!imgUrl) return '';
            if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
                return imgUrl;
            }
            if (imgUrl.startsWith('/')) {
                return API_BASE + imgUrl;
            }
            return API_BASE + '/' + imgUrl;
        }).filter(url => url !== '');
        
        console.log('[PRODUCT PAGE] fullImages not provided, generated from prod:', imagesToUse);
    }
    
    modalState.currentProduct = prod;
    modalState.currentImages = imagesToUse || [];
    modalState.currentImageIndex = 0;
    
    console.log(`[PRODUCT PAGE] State updated: currentImages.length=${modalState.currentImages.length}, currentImageLoadId=${modalState.currentImageLoadId}, productId=${prod.id}`);
    console.log(`[PRODUCT PAGE] fullImages:`, fullImages);
    console.log(`[PRODUCT PAGE] imagesToUse:`, imagesToUse);
    console.log(`[PRODUCT PAGE] modalState.currentImages:`, modalState.currentImages);
    
    // Активируем блокировку горизонтального скролла
    enableHorizontalScrollBlock();
    
    // Единый способ: скрыть все страницы, затем показать страницу товара
    hideAllPages();
    productPage.style.display = 'block';
    
    // Высота верхнего меню для позиции toast (ниже меню) — безопасно, не бросаем ошибок
    try {
        const productTopMenu = document.querySelector('.product-new-top-menu');
        const menuHeight = (productTopMenu && productTopMenu.offsetHeight) ? productTopMenu.offsetHeight : 64;
        if (productPage.style && typeof productPage.style.setProperty === 'function') {
            productPage.style.setProperty('--product-top-menu-height', String(menuHeight) + 'px');
        }
    } catch (_) { /* игнорируем */ }
    
    // Сбрасываем позицию скролла при открытии новой карточки товара
    // Используем несколько способов для надежности
    const resetScroll = () => {
        productPage.scrollTop = 0;
        if (productPage.scrollTo) {
            productPage.scrollTo(0, 0);
        }
        if (window.scrollTo) {
            window.scrollTo(0, 0);
        }
        // Также сбрасываем через scrollIntoView
        const firstElement = productPage.firstElementChild;
        if (firstElement && firstElement.scrollIntoView) {
            firstElement.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
    };
    
    // Сбрасываем сразу
    resetScroll();
    
    // Сбрасываем после небольшой задержки (когда DOM обновится)
    setTimeout(resetScroll, 0);
    
    // Сбрасываем через requestAnimationFrame (после рендеринга)
    requestAnimationFrame(() => {
        resetScroll();
        // И еще раз после следующего кадра для надежности
        requestAnimationFrame(resetScroll);
    });
    
    // Обработчик скролла для появления фона меню
    const productTopMenu = document.querySelector('.product-new-top-menu');
    let scrollHandler = null;
    
    if (productTopMenu) {
        scrollHandler = () => {
            // Проверяем скролл страницы товара (она имеет overflow-y: auto)
            const scrollTop = productPage.scrollTop || 0;
            if (scrollTop > 20) {
                productTopMenu.classList.add('scrolled');
            } else {
                productTopMenu.classList.remove('scrolled');
            }
        };
        
        // Добавляем обработчик скролла на страницу товара
        productPage.addEventListener('scroll', scrollHandler, { passive: true });
        // Проверяем начальное состояние (после сброса скролла)
        // Используем setTimeout, чтобы убедиться, что скролл сброшен
        setTimeout(() => {
            scrollHandler();
        }, 0);
    }
    
    // Сохраняем обработчик для удаления при закрытии
    window.productPageScrollHandler = scrollHandler;
    
    // Настраиваем кнопку закрытия в верхнем меню
    const productPageClose = document.getElementById('product-page-close');
    if (productPageClose) {
        productPageClose.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeProductPage();
        };
    }
    
    // Получаем актуальный appContext
    const appContext = appContextGetter ? appContextGetter() : null;
    
    // Класс для отступов контента: админ (без bottom-sheet) / клиент
    productPage.classList.remove('is-admin', 'is-client');
    if (appContext && appContext.role === 'client') {
        productPage.classList.add('is-client');
    } else if (appContext && appContext.role === 'owner') {
        productPage.classList.add('is-admin');
    }
    
    // Отслеживаем просмотр конкретного товара (только для клиентов, не для владельца)
    if (appContext && appContext.role === 'client' && appContext.shop_owner_id) {
        trackShopVisit(appContext.shop_owner_id, prod.id).catch(err => {
            console.warn('Failed to track product view:', err);
        });
    }
    
    // Управление горящим предложением и видимостью (только для владельца) — в верхнем меню, компактные тумблеры с emoji
    const productTopMenuAdminToggles = document.getElementById('product-top-menu-admin-toggles');
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        productTopMenuAdminToggles.style.display = 'flex';
        productTopMenuAdminToggles.innerHTML = '';

        const hotItem = document.createElement('div');
        hotItem.className = 'product-top-menu-toggle-item';
        const hotOfferEmoji = document.createElement('span');
        hotOfferEmoji.className = 'product-top-menu-toggle-emoji';
        hotOfferEmoji.textContent = '🔥';
        const hotOfferToggle = document.createElement('label');
        hotOfferToggle.className = 'toggle-switch toggle--sm';
        hotOfferToggle.style.cssText = 'margin: 0;';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = prod.is_hot_offer || false;
        toggleInput.onchange = async (e) => {
            const isHotOffer = e.target.checked;
            try {
                await toggleHotOffer(prod.id, appContext.shop_owner_id, isHotOffer);
                prod.is_hot_offer = isHotOffer;
                showNotification(
                    isHotOffer ? '🔥 Горящее предложение: ВКЛЮЧЕНО. Товар выделен на витрине.' : '🔥 Горящее предложение: ВЫКЛЮЧЕНО. Товар больше не выделяется.',
                    isHotOffer ? 'success' : 'error',
                    { anchor: 'product-page' }
                );
                updateHotOfferBadgeOnProductPage(isHotOffer);
                if (loadDataCallback) setTimeout(() => loadDataCallback(), 300);
            } catch (error) {
                console.error('Error toggling hot offer:', error);
                alert('Ошибка при изменении статуса: ' + error.message);
                toggleInput.checked = !isHotOffer;
            }
        };
        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'toggle-slider';
        hotOfferToggle.appendChild(toggleInput);
        hotOfferToggle.appendChild(toggleSlider);
        hotItem.appendChild(hotOfferEmoji);
        hotItem.appendChild(hotOfferToggle);
        productTopMenuAdminToggles.appendChild(hotItem);

        const visItem = document.createElement('div');
        visItem.className = 'product-top-menu-toggle-item';
        const hiddenEmoji = document.createElement('span');
        hiddenEmoji.className = 'product-top-menu-toggle-emoji';
        hiddenEmoji.textContent = prod.is_hidden ? '👁️‍🗨️' : '👁️';
        const hiddenToggle = document.createElement('label');
        hiddenToggle.className = 'toggle-switch toggle--sm';
        hiddenToggle.style.cssText = 'margin: 0;';
        const hiddenToggleInput = document.createElement('input');
        hiddenToggleInput.type = 'checkbox';
        hiddenToggleInput.checked = prod.is_hidden || false;
        hiddenToggleInput.onchange = async (e) => {
            const isHidden = e.target.checked;
            try {
                await updateProductHiddenAPI(prod.id, appContext.shop_owner_id, isHidden);
                prod.is_hidden = isHidden;
                hiddenEmoji.textContent = isHidden ? '👁️‍🗨️' : '👁️';
                showNotification(
                    isHidden ? '👁‍🗨️ Товар СКРЫТ. Не показывается на витрине клиентам.' : '👁 Товар ВИДЕН. Показывается на витрине клиентам.',
                    isHidden ? 'error' : 'success',
                    { anchor: 'product-page' }
                );
                updateHiddenBadgeOnProductPage(isHidden, prod);
                if (loadDataCallback) setTimeout(() => loadDataCallback(), 300);
            } catch (error) {
                console.error('Error toggling hidden status:', error);
                alert('Ошибка при изменении статуса скрытия: ' + error.message);
                hiddenToggleInput.checked = !isHidden;
            }
        };
        const hiddenToggleSlider = document.createElement('span');
        hiddenToggleSlider.className = 'toggle-slider';
        hiddenToggle.appendChild(hiddenToggleInput);
        hiddenToggle.appendChild(hiddenToggleSlider);
        visItem.appendChild(hiddenEmoji);
        visItem.appendChild(hiddenToggle);
        productTopMenuAdminToggles.appendChild(visItem);
    } else {
        productTopMenuAdminToggles.style.display = 'none';
    }
    
    // Блок кнопок в контенте всегда скрыт; управление перенесено в top-menu (админ-иконки)
    const productPageEditControl = document.getElementById('product-page-edit-control');
    if (productPageEditControl) productPageEditControl.style.display = 'none';
    
    const productTopMenuAdminActions = document.getElementById('product-top-menu-admin-actions');
    if (productTopMenuAdminActions) {
        if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
            productTopMenuAdminActions.style.display = 'flex';
            const isForSale = prod.is_for_sale === true || prod.is_for_sale === 1 || prod.is_for_sale === '1' ||
                prod.is_for_sale === 'true' || String(prod.is_for_sale).toLowerCase() === 'true';
            const editBtn = productTopMenuAdminActions.querySelector('[data-action="edit"]');
            const soldBtn = productTopMenuAdminActions.querySelector('[data-action="sold"]');
            const deleteBtn = productTopMenuAdminActions.querySelector('[data-action="delete"]');
            if (soldBtn) soldBtn.style.display = isForSale ? 'none' : 'flex';
            if (editBtn) {
                editBtn.onclick = () => { if (showEditProductModalCallback) showEditProductModalCallback(prod); };
            }
            if (soldBtn) {
                soldBtn.onclick = () => { if (markAsSoldCallback) markAsSoldCallback(prod.id, prod); };
            }
            if (deleteBtn) {
                deleteBtn.onclick = () => { if (deleteProductCallback) deleteProductCallback(prod.id); };
            }
        } else {
            productTopMenuAdminActions.style.display = 'none';
        }
    }
    
    // Добавляем отступ после блока кнопок, чтобы текст не прилипал
    const productPageName = document.getElementById('product-page-name');
    if (productPageName) {
        productPageName.textContent = prod.name;
    }

    // Блок цен на странице товара: подпись слева, цена справа (отдельный рендер только для product-page)
    const productPagePriceContainer = document.getElementById('product-page-price-container');
    productPagePriceContainer.innerHTML = renderProductPagePricesBlock(prod);

    // Блок доставки: данные из товара (product_delivery с страницы редактирования ИЛИ delivery_time/delivery_price из бота); скрыт, если нет данных
    const productPageDelivery = document.getElementById('product-page-delivery');
    if (productPageDelivery) {
        const deliveryOpt = prod.delivery;
        const time = prod.delivery_time ?? prod.deliveryTime;
        const priceSimple = prod.delivery_price ?? prod.deliveryPrice;
        const hasSimpleTime = time != null && String(time).trim().length > 0;
        const hasSimplePrice = priceSimple != null && priceSimple !== '' && (Number(priceSimple) === 0 || Number(priceSimple) > 0);
        const hasEditDelivery = deliveryOpt && (
            deliveryOpt.is_delivery_enabled === true ||
            deliveryOpt.is_pickup_enabled === true ||
            (deliveryOpt.delivery_price != null && deliveryOpt.delivery_price !== '') ||
            (deliveryOpt.pickup_address != null && String(deliveryOpt.pickup_address).trim().length > 0) ||
            (deliveryOpt.delivery_time != null && String(deliveryOpt.delivery_time).trim().length > 0)
        );
        const hasAny = hasSimpleTime || hasSimplePrice || hasEditDelivery;
        if (!hasAny) {
            productPageDelivery.style.display = 'none';
            productPageDelivery.innerHTML = '';
        } else {
            productPageDelivery.style.display = '';
            const lines = [];
            const escapeText = (s) => {
                if (s == null) return '';
                const div = document.createElement('div');
                div.textContent = String(s);
                return div.innerHTML;
            };
            if (hasEditDelivery) {
                if (deliveryOpt.delivery_time != null && String(deliveryOpt.delivery_time).trim()) {
                    lines.push(`<p>Срок доставки: ${escapeText(deliveryOpt.delivery_time.trim())}</p>`);
                }
                if (deliveryOpt.delivery_price != null && deliveryOpt.delivery_price !== '') {
                    const num = Number(deliveryOpt.delivery_price);
                    const formatted = Number.isFinite(num) ? (num % 1 === 0 ? String(Math.round(num)) : String(num)) : String(deliveryOpt.delivery_price);
                    lines.push(`<p>Стоимость доставки: ${formatted} ₽</p>`);
                }
                if (deliveryOpt.pickup_address != null && String(deliveryOpt.pickup_address).trim()) {
                    lines.push(`<p>Адрес самовывоза: ${escapeText(deliveryOpt.pickup_address.trim())}</p>`);
                }
            }
            if (!lines.length && (hasSimpleTime || hasSimplePrice)) {
                if (hasSimpleTime) lines.push(`<p>Доставка: ${escapeText(time)}</p>`);
                if (hasSimplePrice) {
                    const num = Number(priceSimple);
                    const formatted = Number.isFinite(num) ? (num % 1 === 0 ? String(Math.round(num)) : String(num)) : String(priceSimple);
                    lines.push(`<p>Стоимость доставки: ${formatted} ₽</p>`);
                }
            }
            productPageDelivery.innerHTML = lines.join('');
        }
    }

    // Заглушка отзывов (без карточки)
    const productPageReviews = document.getElementById('product-page-reviews');
    if (productPageReviews) {
        productPageReviews.textContent = '⭐ 4.8 · 32 отзыва';
    }

    // Блок "О товаре": описание + кнопка "Читать далее" / "Свернуть"
    const productPageDescription = document.getElementById('product-page-description');
    const productPageAboutSection = document.getElementById('product-page-about-section');
    const productPageDescriptionToggle = document.getElementById('product-page-description-toggle');
    if (productPageDescription && productPageAboutSection && productPageDescriptionToggle) {
        const descText = prod.description && String(prod.description).trim() ? prod.description.trim() : 'Описание появится скоро';
        productPageDescription.textContent = descText;
        productPageDescription.style.removeProperty('display');
        productPageAboutSection.classList.remove('description-expanded');
        productPageDescription.classList.remove('expanded');
        productPageDescription.classList.add('collapsed');
        const needToggle = descText.length > 120;
        if (needToggle) {
            productPageDescriptionToggle.style.display = 'inline-block';
            productPageDescriptionToggle.textContent = 'Читать далее';
            productPageDescriptionToggle.onclick = () => {
                const isExpanded = productPageAboutSection.classList.contains('description-expanded');
                if (isExpanded) {
                    productPageAboutSection.classList.remove('description-expanded');
                    productPageDescription.classList.remove('expanded');
                    productPageDescription.classList.add('collapsed');
                    productPageDescription.style.removeProperty('display');
                    productPageDescriptionToggle.textContent = 'Читать далее';
                } else {
                    productPageAboutSection.classList.add('description-expanded');
                    productPageDescription.classList.remove('collapsed');
                    productPageDescription.classList.add('expanded');
                    productPageDescription.style.display = 'block';
                    productPageDescriptionToggle.textContent = 'Свернуть';
                }
            };
        } else {
            productPageDescriptionToggle.style.display = 'none';
            productPageDescription.classList.remove('collapsed');
            productPageDescription.classList.add('expanded');
        }
    }

    // Блок "Все характеристики": заполняем из prod.characteristics или скрываем, если пусто
    const productPageSpecsSection = document.getElementById('product-page-specs-section');
    const productPageSpecsToggle = document.getElementById('product-page-specs-toggle');
    const productPageSpecsContent = document.getElementById('product-page-specs-content');
    if (productPageSpecsSection && productPageSpecsToggle && productPageSpecsContent) {
        const chars = prod.characteristics && Array.isArray(prod.characteristics) ? prod.characteristics : [];
        if (chars.length > 0) {
            productPageSpecsSection.style.display = '';
            productPageSpecsContent.innerHTML = chars
                .map(c => {
                    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    return `<div class="product-page-spec-row"><span class="product-page-spec-label">${esc(c.name)}</span><span class="product-page-spec-value">${esc(c.value)}</span></div>`;
                })
                .join('');
        } else {
            productPageSpecsSection.style.display = 'none';
        }
        productPageSpecsSection.classList.remove('expanded');
        productPageSpecsToggle.setAttribute('aria-expanded', 'false');
        productPageSpecsToggle.onclick = () => {
            const isExpanded = productPageSpecsSection.classList.contains('expanded');
            if (isExpanded) {
                productPageSpecsSection.classList.remove('expanded');
                productPageSpecsToggle.setAttribute('aria-expanded', 'false');
            } else {
                productPageSpecsSection.classList.add('expanded');
                productPageSpecsToggle.setAttribute('aria-expanded', 'true');
            }
        };
    }

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
    
    // КНОПКИ ДЕЙСТВИЙ УДАЛЕНЫ - теперь используется Bottom Sheet
    // Все действия (Зарезервировать, Заказать, Продать, Купить) выполняются через Bottom Sheet
    // См. функцию updateProductPageBottomSheet() ниже
    
    // Добавляем кнопку избранного на страницу товара (только для клиентов)
    const productPageImage = document.getElementById('product-page-image');
    console.log('[PRODUCT PAGE] Adding favorite button:', {
        productPageImage: !!productPageImage,
        appContext: !!appContext,
        role: appContext?.role,
        isClient: appContext?.role === 'client'
    });
    
    // Настраиваем кнопку избранного в верхнем меню (для клиентов)
    const productTopMenuFavorite = document.getElementById('product-top-menu-favorite');
    if (productTopMenuFavorite && appContext && appContext.role === 'client') {
        // Показываем кнопку избранного в меню
        productTopMenuFavorite.style.display = 'flex';
        productTopMenuFavorite.dataset.productId = prod.id;
        productTopMenuFavorite.setAttribute('aria-label', 'Добавить в избранное');
        
        // Удаляем старую кнопку избранного из изображения, если она есть
        const oldFavoriteButton = productPageImage ? productPageImage.querySelector('.favorite-button-product-page') : null;
        if (oldFavoriteButton) {
            oldFavoriteButton.remove();
        }
        
        // Используем кнопку из меню как основную
        const favoriteButton = productTopMenuFavorite;
        console.log('[PRODUCT PAGE] Favorite button in top menu for product:', prod.id);
        
        // Функция обновления состояния кнопки избранного
        function updateFavoriteButtonState(button, favorite) {
            if (!button) return;
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
                // Обновляем кнопку в верхнем меню страницы товара
                updateFavoriteButtonState(favoriteButton, isFavorite);
                
                // Находим и обновляем все кнопки избранного на карточках товаров
                // Используем селектор, который найдет кнопки на карточках, но не в верхнем меню
                const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                allFavoriteButtons.forEach(btn => {
                    // Пропускаем кнопку в верхнем меню, чтобы не обновлять её дважды
                    if (btn !== favoriteButton && !btn.classList.contains('product-top-menu-favorite')) {
                        updateFavoriteButtonState(btn, isFavorite);
                    }
                });
            }
            
            // Обновляем ВСЕ кнопки избранного для этого товара (optimistic)
            updateAllFavoriteButtonsForProductOptimistic(prod.id, newFavoriteState);
            
            // Функция для обновления всех кнопок избранного для этого товара
            function updateAllFavoriteButtonsForProduct(productId, isFavorite) {
                // Обновляем кнопку в верхнем меню страницы товара
                updateFavoriteButtonState(favoriteButton, isFavorite);
                
                // Находим и обновляем все кнопки избранного на карточках товаров
                // Используем селектор, который найдет кнопки на карточках, но не в верхнем меню
                const allFavoriteButtons = document.querySelectorAll(`.favorite-button-card[data-product-id="${productId}"]`);
                allFavoriteButtons.forEach(btn => {
                    // Пропускаем кнопку в верхнем меню, чтобы не обновлять её дважды
                    if (btn !== favoriteButton && !btn.classList.contains('product-top-menu-favorite')) {
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
        
        // Кнопка избранного теперь в верхнем меню, не добавляем её в изображение
    } else if (productTopMenuFavorite) {
        // Если пользователь не клиент, скрываем кнопку избранного
        productTopMenuFavorite.style.display = 'none';
    }

    // Режим «из детали операции»: только просмотр, без лайка и корзины
    if (fromOperationDetail) {
        if (productTopMenuFavorite) productTopMenuFavorite.style.display = 'none';
        const productPageBottomSheet = document.getElementById('product-page-bottom-sheet');
        if (productPageBottomSheet) productPageBottomSheet.style.display = 'none';
    }
    
    // Показываем изображение на странице товара
    showProductPageImage(0);
    
    // Не вызывать bottom sheet / ensureProductInCart при открытии со страницы операции (order/purchase/sale)
    if (!fromOperationDetail) {
        updateProductPageBottomSheet(prod);
    }
    
    // Дополнительно сбрасываем скролл после загрузки изображений
    // Используем несколько попыток для надежности
    const finalScrollReset = () => {
        if (productPage) {
            productPage.scrollTop = 0;
            if (productPage.scrollTo) {
                productPage.scrollTo({ top: 0, behavior: 'instant' });
            }
        }
    };
    
    // Сбрасываем после небольшой задержки (когда изображения начнут загружаться)
    setTimeout(finalScrollReset, 50);
    setTimeout(finalScrollReset, 100);
    setTimeout(finalScrollReset, 200);
    
    // Сбрасываем через requestAnimationFrame
    requestAnimationFrame(() => {
        finalScrollReset();
        requestAnimationFrame(finalScrollReset);
    });
}
// ========== END REFACTORING STEP 3.1 ==========

/**
 * Обновление bottom sheet на странице товара (постоянно видимый)
 */
export async function updateProductPageBottomSheet(product) {
    // ========== ИСПРАВЛЕНИЕ: Получаем СВЕЖИЙ продукт из кэша перед обновлением UI ==========
    // Используем свежие данные из allProducts, чтобы гарантировать актуальность action_type и can_add_to_cart
    let freshProduct = product;
    try {
        // Пытаемся получить свежий продукт из кэша
        if (typeof window.getAllProducts === 'function') {
            const allProducts = window.getAllProducts();
            if (Array.isArray(allProducts)) {
                const cachedProduct = allProducts.find(p => 
                    p && (p.id === product.id || 
                         (p.sync_product_id && p.sync_product_id === product.id) ||
                         (product.sync_product_id && p.id === product.sync_product_id))
                );
                if (cachedProduct) {
                    freshProduct = cachedProduct;
                    console.log(`[PRODUCT MODAL] Using fresh product from cache for ${product.id}, action_type=${cachedProduct.action_type}, can_add_to_cart=${cachedProduct.can_add_to_cart}`);
                    
                    // ========== DEBUG: Логирование найденного товара в кэше ==========
                    const DEBUG_BOTTOM_SHEET_CACHE = true; // Установить в false для отключения
                    if (DEBUG_BOTTOM_SHEET_CACHE) {
                        console.log(`[PRODUCT MODAL DEBUG] Found product in cache for ${product.id}:`, {
                            productId: product.id,
                            cachedProductId: cachedProduct.id,
                            action_type: cachedProduct.action_type,
                            can_add_to_cart: cachedProduct.can_add_to_cart,
                            is_sale_enabled: cachedProduct.is_sale_enabled,
                            is_made_to_order: cachedProduct.is_made_to_order,
                            is_reservation_enabled: cachedProduct.is_reservation_enabled
                        });
                    }
                    // ========== КОНЕЦ DEBUG ==========
                }
            }
        }
    } catch (cacheError) {
        // Если не удалось получить из кэша, используем переданный продукт
        console.warn(`[PRODUCT MODAL] Could not get fresh product from cache:`, {
            message: cacheError?.message || 'Unknown error',
            stack: cacheError?.stack || '',
            productId: product?.id
        });
    }
    // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
    
    const productPageBottomSheet = document.getElementById('product-page-bottom-sheet');
    if (!productPageBottomSheet) {
        console.warn('⚠️ Product page bottom sheet not found');
        return;
    }
    
    // Получаем контекст приложения
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        console.error('❌ App context not available');
        // Скрываем bottom sheet если контекст недоступен
        productPageBottomSheet.style.display = 'none';
        return;
    }
    
    // ВАЖНО: Bottom sheet показывается только клиентам, не админам
    if (appContext.role !== 'client') {
        // Скрываем bottom sheet для админов и других ролей
        productPageBottomSheet.style.display = 'none';
        return;
    }
    
    const sheetContent = productPageBottomSheet.querySelector('.cart-bottom-sheet-content');
    if (!sheetContent) {
        console.warn('⚠️ Product page bottom sheet content not found');
        return;
    }
    
    // Получаем текущее количество товара в корзине
    let currentQuantity = 1;
    try {
        const { getCartItems } = await import('../cart/cartStore.js');
        const cartItems = getCartItems();
        const existingItem = cartItems.find(item => item.product.id === freshProduct.id);
        if (existingItem) {
            currentQuantity = existingItem.quantity || 1;
        }
    } catch (error) {
        console.error('❌ Error getting cart items:', error);
    }
    
    // Заполняем информацию о товаре
    const productImage = sheetContent.querySelector('.cart-bottom-sheet-product-image');
    const productName = sheetContent.querySelector('.cart-bottom-sheet-product-name');
    const productPrice = sheetContent.querySelector('.cart-bottom-sheet-product-price');
    const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
    const primaryBtn = document.getElementById('product-page-bottom-sheet-primary-btn');
    const minusBtn = sheetContent.querySelector('.cart-bottom-sheet-quantity-btn.minus');
    const plusBtn = sheetContent.querySelector('.cart-bottom-sheet-quantity-btn.plus');
    
    // Изображение товара
    if (productImage) {
        let imageUrl = '';
        if (freshProduct.images_urls && Array.isArray(freshProduct.images_urls) && freshProduct.images_urls.length > 0) {
            imageUrl = freshProduct.images_urls[0];
        } else if (freshProduct.image_url) {
            imageUrl = freshProduct.image_url;
        }
        
        if (imageUrl) {
            if (!imageUrl.startsWith('http')) {
                const API_BASE = window.API_BASE || '';
                imageUrl = imageUrl.startsWith('/') ? API_BASE + imageUrl : API_BASE + '/' + imageUrl;
            }
            productImage.style.backgroundImage = `url('${imageUrl}')`;
        } else {
            productImage.style.backgroundImage = 'none';
            productImage.style.backgroundColor = 'var(--bg-secondary)';
        }
    }
    
    // Название товара
    if (productName) {
        productName.textContent = freshProduct.name || '';
    }
    
    // Цена товара
    if (productPrice) {
        const priceDisplay = getProductPriceDisplay(freshProduct);
        productPrice.textContent = priceDisplay;
    }
    
    // Количество - устанавливаем ограничения и значение
    if (quantityInput) {
        // Устанавливаем минимальное значение
        quantityInput.min = 1;
        
        // Получаем максимальное доступное количество с учетом резерваций
        const productQuantity = freshProduct.quantity !== undefined && freshProduct.quantity !== null ? freshProduct.quantity : null;
        const activeReservationsCount = freshProduct.reservation && freshProduct.reservation.active_count 
            ? freshProduct.reservation.active_count 
            : 0;
        const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
            ? Math.max(0, productQuantity - activeReservationsCount)
            : null;
        
        // Устанавливаем максимальное значение
        if (maxQuantity !== null) {
            quantityInput.max = maxQuantity;
            // Если текущее количество больше доступного, ограничиваем его
            if (currentQuantity > maxQuantity) {
                currentQuantity = maxQuantity;
            }
        } else {
            // Если количество неограниченно, убираем ограничение max
            quantityInput.removeAttribute('max');
        }
        
        // Устанавливаем временное значение до синхронизации
        quantityInput.value = currentQuantity;
        
        // СИНХРОНИЗАЦИЯ: Для резервации и заказа синхронизируем с store при открытии Bottom Sheet
        // Используем динамический импорт без await, чтобы не блокировать
        Promise.all([
            import('../reservationStore.js').catch(() => null),
            import('../orderStore.js').catch(() => null)
        ]).then(([reservationStore, orderStore]) => {
            try {
                let storedQuantity = currentQuantity;
                
                // Проверяем количество для резервации
                if (reservationStore) {
                    const reservationQty = reservationStore.getReservationQuantity(freshProduct.id, currentQuantity);
                    if (reservationQty >= 1 && (maxQuantity === null || reservationQty <= maxQuantity)) {
                        storedQuantity = reservationQty;
                    }
                }
                
                // Проверяем количество для заказа (приоритет, если есть)
                if (orderStore) {
                    const orderQty = orderStore.getOrderQuantity(freshProduct.id, storedQuantity);
                    if (orderQty >= 1 && (maxQuantity === null || orderQty <= maxQuantity)) {
                        storedQuantity = orderQty;
                    }
                }
                
                // Используем сохраненное количество, если оно валидно
                // Приоритет: заказ > резервация > корзина
                if (storedQuantity >= 1 && (maxQuantity === null || storedQuantity <= maxQuantity)) {
                    // Если сохраненное количество отличается от текущего, обновляем
                    if (storedQuantity !== currentQuantity) {
                        currentQuantity = storedQuantity;
                        quantityInput.value = currentQuantity;
                    } else {
                        // Если совпадает, все равно обновляем для уверенности
                        quantityInput.value = currentQuantity;
                    }
                } else {
                    // Если сохраненное количество невалидно, используем текущее из корзины
                    quantityInput.value = currentQuantity;
                }
                
                // Сохраняем текущее количество в оба store
                if (reservationStore) {
                    reservationStore.setReservationQuantity(freshProduct.id, currentQuantity);
                }
                if (orderStore) {
                    orderStore.setOrderQuantity(freshProduct.id, currentQuantity);
                }
            } catch (error) {
                console.error('❌ Error syncing quantity on open:', error);
            }
        }).catch((error) => {
            console.error('❌ Error importing stores:', error);
        });
        
        // Убираем readonly, чтобы пользователь мог вводить значение
        quantityInput.removeAttribute('readonly');
    }
    
    // Определяем тип товара через единый helper (КРИТИЧНО для консистентности)
    // Используем getProductActionType вместо локальной логики
    let actionType = 'none';
    let getProductActionType = null;
    let getActionButtonText = null;
    
    try {
        // Динамический импорт для избежания проблем с порядком загрузки
        const actionTypeModule = await import('../utils/productActionType.js');
        getProductActionType = actionTypeModule.getProductActionType;
        getActionButtonText = actionTypeModule.getActionButtonText;
        
        const shopSettings = getCurrentShopSettings();
        actionType = getProductActionType(freshProduct, appContext, shopSettings);
    } catch (error) {
        console.error('❌ Error loading productActionType helper:', error);
        // Fallback: используем старую логику только в случае ошибки
        const isForSale = freshProduct.is_for_sale === true || 
                         freshProduct.is_for_sale === 1 || 
                         freshProduct.is_for_sale === '1' ||
                         freshProduct.is_for_sale === 'true' ||
                         String(freshProduct.is_for_sale).toLowerCase() === 'true';
        
        const isSaleEnabled = freshProduct.is_sale_enabled === true || 
                             freshProduct.is_sale_enabled === 1 || 
                             freshProduct.is_sale_enabled === '1' ||
                             freshProduct.is_sale_enabled === 'true' ||
                             String(freshProduct.is_sale_enabled).toLowerCase() === 'true';
        
        const isClientSale = freshProduct.is_client_sale === true || 
                            freshProduct.is_client_sale === 1 || 
                            freshProduct.is_client_sale === '1' ||
                            freshProduct.is_client_sale === 'true' ||
                            String(freshProduct.is_client_sale).toLowerCase() === 'true';
        
        const isMadeToOrder = freshProduct.is_made_to_order === true || 
                             freshProduct.is_made_to_order === 1 || 
                             freshProduct.is_made_to_order === '1' ||
                             freshProduct.is_made_to_order === 'true' ||
                             String(freshProduct.is_made_to_order).toLowerCase() === 'true';
        
        if (isForSale && appContext.role === 'client') {
            actionType = 'purchase';
        } else if ((isSaleEnabled || isClientSale) && appContext.role === 'client') {
            actionType = 'sale';
        } else if (isMadeToOrder && appContext.role === 'client') {
            actionType = 'order';
        } else {
            const shopSettings = getCurrentShopSettings();
            const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
            const canReserve = appContext.role === 'client' && 
                              appContext.permissions && 
                              appContext.permissions.can_reserve && 
                              reservationsEnabled &&
                              !isMadeToOrder &&
                              !isSaleEnabled &&
                              !isClientSale;
            
            if (canReserve) {
                actionType = 'reserve';
            }
        }
    }
    
    // Настраиваем кнопки в зависимости от типа товара
    if (primaryBtn) {
        // Используем helper для получения текста кнопки
        if (getActionButtonText) {
            primaryBtn.textContent = getActionButtonText(actionType);
        } else {
            // Fallback текст
            switch (actionType) {
                case 'sale':
                    primaryBtn.textContent = 'Купить сейчас';
                    break;
                case 'reserve':
                    primaryBtn.textContent = 'Резервировать сейчас';
                    break;
                case 'order':
                    primaryBtn.textContent = 'Заказать сейчас';
                    break;
                case 'purchase':
                    primaryBtn.textContent = 'Продать сейчас';
                    break;
                default:
                    primaryBtn.textContent = 'Готово';
            }
        }
        primaryBtn.style.display = 'flex';
        
        // Обработчик основной кнопки
        primaryBtn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            try {
                // ВАЛИДАЦИЯ: Проверяем количество перед действием
                if (quantityInput) {
                    let quantity = parseInt(quantityInput.value) || 1;
                    const productQuantity = freshProduct.quantity !== undefined && freshProduct.quantity !== null ? freshProduct.quantity : null;
                    const activeReservationsCount = freshProduct.reservation && freshProduct.reservation.active_count 
                        ? freshProduct.reservation.active_count 
                        : 0;
                    const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
                        ? Math.max(0, productQuantity - activeReservationsCount)
                        : null;
                    
                    // Если количество превышает доступное, ограничиваем его
                    if (maxQuantity !== null && quantity > maxQuantity) {
                        quantity = maxQuantity;
                        quantityInput.value = quantity;
                        
                        // Обновляем количество в корзине с валидированным значением
                        try {
                            const { updateCartItemQuantity } = await import('../cart/cartStore.js');
                            await updateCartItemQuantity(product.id, quantity);
                            if (window.updateCartButtonsState) {
                                window.updateCartButtonsState();
                            }
                        } catch (error) {
                            console.error('❌ Error updating cart quantity:', error);
                        }
                    }
                    
                    // Синхронизируем финальное значение с store перед действием
                    try {
                        const { setReservationQuantity } = await import('../reservationStore.js');
                        setReservationQuantity(product.id, quantity);
                    } catch (error) {
                        console.error('❌ Error syncing reservation quantity before action:', error);
                    }
                }
                
                // Выполняем действие в зависимости от типа операции (используем actionType из helper)
                switch (actionType) {
                    case 'purchase':
                        if (showPurchaseModalCallback) {
                            showPurchaseModalCallback(freshProduct);
                        }
                        break;
                    case 'sale':
                        if (showSaleOrderModalCallback) {
                            showSaleOrderModalCallback(freshProduct);
                        }
                        break;
                    case 'order':
                        if (showOrderModalCallback) {
                            showOrderModalCallback(freshProduct.id);
                        }
                        break;
                    case 'reserve':
                        if (showReservationModalCallback) {
                            showReservationModalCallback(freshProduct.id);
                        }
                        break;
                    default:
                        // Для остальных товаров - просто обновляем состояние кнопок
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                }
            } catch (error) {
                console.error('❌ Error in primary button action:', error);
            }
        };
    }
    
    // Вспомогательная функция для получения максимального доступного количества
    const getMaxAvailableQuantity = (prod) => {
        if (!prod) return null;
        const prodQuantity = prod.quantity !== undefined && prod.quantity !== null ? prod.quantity : null;
        if (prodQuantity === null || prodQuantity === undefined || prodQuantity === 0) {
            return null; // Неограниченное количество
        }
        const activeReservationsCount = prod.reservation && prod.reservation.active_count 
            ? prod.reservation.active_count 
            : 0;
        return Math.max(0, prodQuantity - activeReservationsCount);
    };
    
    // Функция для обновления состояния кнопок количества
    const updateQuantityButtonsState = () => {
        if (!product || !plusBtn || !quantityInput) return;
        const maxQuantity = getMaxAvailableQuantity(product);
        const currentValue = parseInt(quantityInput.value) || 1;
        
        if (maxQuantity !== null && currentValue >= maxQuantity) {
            plusBtn.disabled = true;
            plusBtn.style.opacity = '0.5';
            plusBtn.style.cursor = 'not-allowed';
            plusBtn.setAttribute('aria-disabled', 'true');
        } else {
            plusBtn.disabled = false;
            plusBtn.style.opacity = '1';
            plusBtn.style.cursor = 'pointer';
            plusBtn.removeAttribute('aria-disabled');
        }
    };
    
    // Обработчики кнопок количества
    if (minusBtn) {
        minusBtn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (quantityInput && product) {
                const currentValue = parseInt(quantityInput.value) || 1;
                if (currentValue > 1) {
                    const newQuantity = currentValue - 1;
                    quantityInput.value = newQuantity;
                    try {
                        const { updateCartItemQuantity } = await import('../cart/cartStore.js');
                        await updateCartItemQuantity(product.id, newQuantity);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error updating cart quantity:', error);
                    }
                    
                    // Синхронизируем выбранное количество для резервации и заказа (без блокировки)
                    import('../reservationStore.js').then(({ setReservationQuantity }) => {
                        setReservationQuantity(product.id, newQuantity);
                    }).catch((error) => {
                        console.error('❌ Error syncing reservation quantity:', error);
                    });
                    
                    import('../orderStore.js').then(({ setOrderQuantity }) => {
                        setOrderQuantity(product.id, newQuantity);
                    }).catch((error) => {
                        console.error('❌ Error syncing order quantity:', error);
                    });
                    
                    updateQuantityButtonsState();
                } else if (currentValue === 1) {
                    // Удаляем товар из корзины
                    quantityInput.value = 0;
                    try {
                        const { updateCartItemQuantity } = await import('../cart/cartStore.js');
                        await updateCartItemQuantity(product.id, 0);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error removing product from cart:', error);
                    }
                }
            }
        };
    }
    
    if (plusBtn) {
        plusBtn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (quantityInput && product) {
                const currentValue = parseInt(quantityInput.value) || 1;
                const maxQuantity = getMaxAvailableQuantity(product);
                
                // Проверяем ограничение: если есть максимум и текущее значение достигло его, не увеличиваем
                if (maxQuantity !== null && currentValue >= maxQuantity) {
                    return; // Уже достигнут максимум
                }
                
                // Увеличиваем количество, но не больше максимума
                const newQuantity = maxQuantity !== null 
                    ? Math.min(currentValue + 1, maxQuantity)
                    : currentValue + 1;
                
                quantityInput.value = newQuantity;
                try {
                    const { updateCartItemQuantity } = await import('../cart/cartStore.js');
                    await updateCartItemQuantity(product.id, newQuantity);
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                } catch (error) {
                    console.error('❌ Error updating cart quantity:', error);
                }
                
                // Синхронизируем выбранное количество для резервации и заказа (без блокировки)
                import('../reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(product.id, newQuantity);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity:', error);
                });
                
                import('../orderStore.js').then(({ setOrderQuantity }) => {
                    setOrderQuantity(product.id, newQuantity);
                }).catch((error) => {
                    console.error('❌ Error syncing order quantity:', error);
                });
                
                updateQuantityButtonsState();
            }
        };
    }
    
    // Обработчик валидации ввода в инпут
    if (quantityInput) {
        quantityInput.oninput = () => {
            const value = parseInt(quantityInput.value) || 1;
            const maxQuantity = getMaxAvailableQuantity(product);
            
            // Валидация: ограничиваем значение максимумом и минимумом 1
            let validatedValue = value;
            if (value < 1) {
                validatedValue = 1;
            } else if (maxQuantity !== null && value > maxQuantity) {
                validatedValue = maxQuantity;
            }
            
            if (validatedValue !== value) {
                quantityInput.value = validatedValue;
            }
            
            // Синхронизируем с единым store при вводе (без блокировки)
            import('../reservationStore.js').then(({ setReservationQuantity }) => {
                setReservationQuantity(product.id, validatedValue);
            }).catch((error) => {
                console.error('❌ Error syncing reservation quantity on input:', error);
            });
            
            import('../orderStore.js').then(({ setOrderQuantity }) => {
                setOrderQuantity(product.id, validatedValue);
            }).catch((error) => {
                console.error('❌ Error syncing order quantity on input:', error);
            });
            
            updateQuantityButtonsState();
        };
        
        quantityInput.onblur = async () => {
            const value = parseInt(quantityInput.value) || 1;
            const maxQuantity = getMaxAvailableQuantity(product);
            
            // Финальная валидация при потере фокуса
            let validatedValue = value;
            if (value < 1) {
                validatedValue = 1;
            } else if (maxQuantity !== null && value > maxQuantity) {
                validatedValue = maxQuantity;
            }
            
            if (validatedValue !== value) {
                quantityInput.value = validatedValue;
            }
            
            // Обновляем количество в корзине при потере фокуса
            if (product && validatedValue > 0) {
                try {
                    const { updateCartItemQuantity } = await import('../cart/cartStore.js');
                    await updateCartItemQuantity(product.id, validatedValue);
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                } catch (error) {
                    console.error('❌ Error updating cart quantity:', error);
                }
                
                // Синхронизируем выбранное количество для резервации (без блокировки)
                import('../reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(product.id, validatedValue);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity:', error);
                });
                
                // Синхронизируем выбранное количество для заказа (без блокировки)
                import('../orderStore.js').then(({ setOrderQuantity }) => {
                    setOrderQuantity(product.id, validatedValue);
                }).catch((error) => {
                    console.error('❌ Error syncing order quantity:', error);
                });
            }
            
            updateQuantityButtonsState();
        };
    }
    
    // Обновляем состояние кнопок после настройки
    updateQuantityButtonsState();
    
    // Убеждаемся, что bottom sheet видимый
    productPageBottomSheet.style.display = 'flex';
    
    // Также убеждаемся, что товар добавлен в корзину (если его там еще нет)
    // ВАЖНО: Добавляем только если товар типа 'sale' и can_add_to_cart === true
    try {
        // Проверяем, можно ли добавлять товар в корзину
        const canAddToCart = freshProduct.can_add_to_cart === true || 
                            (freshProduct.action_type === 'sale' && freshProduct.can_add_to_cart !== false);
        
        if (canAddToCart) {
            // Безопасно импортируем функции корзины
            try {
                const cartModule = await import('../cart/cartStore.js');
                if (cartModule && cartModule.getCartItems && cartModule.addProductToCart) {
                    const cartItems = cartModule.getCartItems();
                    const existingItem = cartItems.find(item => item.product && item.product.id === freshProduct.id);
                    if (!existingItem) {
                        // Если товара нет в корзине, добавляем его
                        await cartModule.addProductToCart(freshProduct, currentQuantity);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    }
                }
            } catch (importError) {
                // Если импорт не удался, просто логируем и продолжаем
                console.warn(`[PRODUCT MODAL] Could not import cartStore for ensureProductInCart:`, {
                    message: importError?.message || 'Unknown error',
                    productId: freshProduct?.id
                });
            }
        }
    } catch (error) {
        // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
        console.error('❌ Error ensuring product in cart:', {
            message: error?.message || 'Unknown error',
            stack: error?.stack || '',
            name: error?.name || 'Error',
            productId: freshProduct?.id,
            productName: freshProduct?.name,
            currentQuantity: currentQuantity,
            can_add_to_cart: freshProduct?.can_add_to_cart,
            action_type: freshProduct?.action_type
        });
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
    }
}

// История навигации - отслеживаем, откуда пришли на страницу товара
let navigationHistory = null; // 'main', 'favorites', 'cart', или 'admin'
let adminClientId = null; // ID клиента в админке, к которому нужно вернуться

// Экспортируем переменные в window для доступа из других модулей
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'navigationHistory', {
        get: () => navigationHistory,
        set: (val) => { navigationHistory = val; }
    });
    Object.defineProperty(window, 'adminClientId', {
        get: () => adminClientId,
        set: (val) => { adminClientId = val; }
    });
}

// Функция для закрытия страницы товара
export function closeProductPage() {
    console.log('[PRODUCT PAGE] Closing product page, returning to:', navigationHistory);
    const productPage = document.getElementById('product-page');
    const mainContent = document.getElementById('main-content');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPage = document.getElementById('cart-page');
    const cartPageNew = document.getElementById('cart-page-new');
    const productPageImage = document.getElementById('product-page-image');
    
    if (productPage) {
        // Очищаем blob URLs если были
        if (productPageImage) {
            // Очищаем старый формат (одиночный blob URL)
            const oldBlobUrl = productPageImage.dataset.blobUrl;
            if (oldBlobUrl) {
                URL.revokeObjectURL(oldBlobUrl);
                delete productPageImage.dataset.blobUrl;
            }
            // Очищаем новый формат (массив blob URLs)
            const oldBlobUrls = productPageImage.dataset.blobUrls;
            if (oldBlobUrls) {
                try {
                    const urls = JSON.parse(oldBlobUrls);
                    urls.forEach(url => {
                        if (url) URL.revokeObjectURL(url);
                    });
                } catch (e) {
                    console.warn('[PRODUCT PAGE] Error parsing blob URLs:', e);
                }
                delete productPageImage.dataset.blobUrls;
            }
            // Удаляем обработчики resize слайдера (если есть)
            const slider = productPageImage.querySelector('.product-slider');
            if (slider && slider.dataset.resizeHandler) {
                // Обработчик resize будет удален при очистке innerHTML
                delete slider.dataset.resizeHandler;
            }
            // Полностью очищаем содержимое
            productPageImage.innerHTML = '';
        }
        
        // Деактивируем блокировку горизонтального скролла
        disableHorizontalScrollBlock();
        
        productPage.classList.remove('is-admin', 'is-client');
        // Скрываем страницу товара
        productPage.style.display = 'none';
        
        // Скрываем bottom sheet страницы товара
        const productPageBottomSheet = document.getElementById('product-page-bottom-sheet');
        if (productPageBottomSheet) {
            productPageBottomSheet.style.display = 'none';
        }
        
        // Убираем обработчик скролла и класс scrolled
        const productTopMenu = document.querySelector('.product-new-top-menu');
        if (productTopMenu && window.productPageScrollHandler) {
            productPage.removeEventListener('scroll', window.productPageScrollHandler);
            productTopMenu.classList.remove('scrolled');
            window.productPageScrollHandler = null;
        }
        
        // Возвращаемся на предыдущую страницу в зависимости от истории навигации
        if (mainContent) mainContent.style.display = 'none';
        if (favoritesPage) favoritesPage.style.display = 'none';
        if (cartPage) cartPage.style.display = 'none';
        if (cartPageNew) cartPageNew.style.display = 'none';
        
        const operationDetailPage = document.getElementById('operation-detail-page');
        if (operationDetailPage) operationDetailPage.style.display = 'none';
        
        if (navigationHistory === 'admin') {
            // Возвращаемся в админку
            console.log('[PRODUCT PAGE] Returning to admin page, clientId:', adminClientId);
            const savedClientId = adminClientId; // Сохраняем ID клиента перед сбросом
            // НЕ сбрасываем navigationHistory и adminClientId здесь - они нужны для следующего открытия товара
            // Сбрасываем их только если возвращаемся НЕ в админку
            openAdmin().then(async () => {
                // Если был открыт конкретный клиент, открываем его снова
                // Добавляем небольшую задержку, чтобы админка успела полностью загрузиться
                if (savedClientId) {
                    console.log('[PRODUCT PAGE] Opening client detail:', savedClientId);
                    setTimeout(async () => {
                        try {
                            await showClientDetail(savedClientId);
                        } catch (err) {
                            console.error('[PRODUCT PAGE] Error opening client detail:', err);
                        }
                    }, 100); // Небольшая задержка для загрузки админки
                }
            }).catch(err => {
                console.error('[PRODUCT PAGE] Error opening admin:', err);
                // Fallback: показываем главную страницу
                if (mainContent) mainContent.style.display = 'block';
                // Сбрасываем историю навигации только при ошибке
                navigationHistory = null;
                adminClientId = null;
            });
        } else if (navigationHistory === 'favorites' && favoritesPage) {
            favoritesPage.style.display = 'block';
            // Сбрасываем историю навигации только если возвращаемся НЕ в админку
            navigationHistory = null;
            adminClientId = null;
        } else if (navigationHistory === 'cart' && cartPageNew) {
            cartPageNew.style.display = 'block';
            navigationHistory = null;
            adminClientId = null;
        } else if (navigationHistory === 'operation-detail' && operationDetailPage) {
            operationDetailPage.style.display = 'block';
            navigationHistory = null;
            adminClientId = null;
        } else if (mainContent) {
            // По умолчанию возвращаемся на главную
            mainContent.style.display = 'block';
            // Сбрасываем историю навигации только если возвращаемся НЕ в админку
            navigationHistory = null;
            adminClientId = null;
        }
        
        // Сбрасываем состояние
        if (modalState) {
            modalState.currentImageLoadId = 0;
            modalState.currentImages = [];
            modalState.currentImageIndex = 0;
        }
    }
}

