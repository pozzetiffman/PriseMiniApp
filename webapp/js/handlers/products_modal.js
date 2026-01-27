// Модуль для модального окна товара
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 3.1: showProductModal ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { getCurrentShopSettings, openAdmin } from '../admin.js';
import { toggleHotOffer, trackShopVisit, updateProductHiddenAPI } from '../api.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import { isMobileDevice } from '../utils/products_utils.js';
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
        
        const hiddenBadge = createHiddenBadge();
        if (hiddenBadge) {
            placeholderDiv.appendChild(hiddenBadge);
        }
        
        if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
            const hotOfferBadge = document.createElement('div');
            hotOfferBadge.className = 'hot-offer-badge';
            hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
            hotOfferBadge.style.position = 'absolute';
            hotOfferBadge.style.top = '12px';
            hotOfferBadge.style.right = '12px';
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
    
    // Добавляем badge скрытого товара (слева вверху, только для админа)
    const hiddenBadge = createHiddenBadge();
    if (hiddenBadge) {
        sliderContainer.appendChild(hiddenBadge);
    }
    
    // Добавляем значок горящего предложения, если товар горящий
    if (modalState.currentProduct && modalState.currentProduct.is_hot_offer) {
        const hotOfferBadge = document.createElement('div');
        hotOfferBadge.className = 'hot-offer-badge';
        hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
        hotOfferBadge.style.position = 'absolute';
        hotOfferBadge.style.top = '12px';
        hotOfferBadge.style.right = '12px';
        hotOfferBadge.style.zIndex = '12';
        hotOfferBadge.innerHTML = `
            <span class="fire-wrap" aria-hidden="true">
                <span class="fire-back">🔥</span>
                <span class="fire-front">🔥</span>
                <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
                <i class="spark s6"></i><i class="spark s7"></i><i class="spark s8"></i><i class="spark s9"></i><i class="spark s10"></i>
            </span>
        `;
        sliderContainer.appendChild(hotOfferBadge);
    }
    
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
    } else {
        // Если НЕ из админки, ВСЕГДА сбрасываем историю навигации админки
        // Это важно для случая, когда пользователь открывает товар с главной страницы после перехода из админки
        if (favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex')) {
            navigationHistory = 'favorites';
            adminClientId = null; // Сбрасываем ID клиента, если не из админки
            console.log('[PRODUCT PAGE] Coming from favorites page, resetting admin history');
        } else if (cartPage && (cartPage.style.display === 'block' || cartPage.style.display === 'flex')) {
            navigationHistory = 'cart';
            adminClientId = null; // Сбрасываем ID клиента, если не из админки
            console.log('[PRODUCT PAGE] Coming from cart page, resetting admin history');
        } else {
            navigationHistory = 'main';
            adminClientId = null; // Сбрасываем ID клиента, если не из админки
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
    
    // Скрываем все страницы и показываем страницу товара
    const adminPage = document.getElementById('admin-page');
    if (adminPage) adminPage.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    if (favoritesPage) favoritesPage.style.display = 'none';
    if (cartPage) cartPage.style.display = 'none';
    productPage.style.display = 'block';
    
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
    
    // Проверяем, является ли товар для продажи (is_for_sale) - когда нам продают товар
    const isForSale = prod.is_for_sale === true || 
                     prod.is_for_sale === 1 || 
                     prod.is_for_sale === '1' ||
                     prod.is_for_sale === 'true' ||
                     String(prod.is_for_sale).toLowerCase() === 'true';
    
    // Проверяем, включена ли продажа товара клиентам (is_sale_enabled) - когда мы продаем товар
    const isSaleEnabled = prod.is_sale_enabled === true || 
                         prod.is_sale_enabled === 1 || 
                         prod.is_sale_enabled === '1' ||
                         prod.is_sale_enabled === 'true' ||
                         String(prod.is_sale_enabled).toLowerCase() === 'true';
    
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
    } else if (isSaleEnabled && appContext.role === 'client') {
        // Для товаров с is_sale_enabled показываем кнопку "Купить"
        const buyBtn = document.createElement('button');
        buyBtn.className = 'reserve-btn';
        buyBtn.style.background = 'rgba(90, 200, 250, 0.95)';
        buyBtn.textContent = '🛒 Купить';
        buyBtn.onclick = () => {
            console.log('🛒 [BUY BUTTON] Clicked on buy button for product:', prod.id, prod.name);
            console.log('🛒 [BUY BUTTON] showSaleOrderModalCallback:', showSaleOrderModalCallback);
            // Показываем форму оформления заказа для покупки
            if (showSaleOrderModalCallback) {
                console.log('🛒 [BUY BUTTON] Calling showSaleOrderModalCallback...');
                showSaleOrderModalCallback(prod);
            } else {
                console.error('❌ [BUY BUTTON] showSaleOrderModalCallback is not set!');
                alert('❌ Ошибка: функция оформления заказа не инициализирована');
            }
        };
        productPageReservationButton.appendChild(buyBtn);
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
    
    // Показываем изображение на странице товара
    showProductPageImage(0);
    
    // Инициализируем и обновляем bottom sheet для страницы товара
    updateProductPageBottomSheet(prod);
    
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
async function updateProductPageBottomSheet(product) {
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
        const existingItem = cartItems.find(item => item.product.id === product.id);
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
        if (product.images_urls && Array.isArray(product.images_urls) && product.images_urls.length > 0) {
            imageUrl = product.images_urls[0];
        } else if (product.image_url) {
            imageUrl = product.image_url;
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
        productName.textContent = product.name || '';
    }
    
    // Цена товара
    if (productPrice) {
        const priceDisplay = getProductPriceDisplay(product);
        productPrice.textContent = priceDisplay;
    }
    
    // Количество
    if (quantityInput) {
        quantityInput.value = currentQuantity;
    }
    
    // Определяем тип товара и показываем соответствующие кнопки
    const isForSale = product.is_for_sale === true || 
                     product.is_for_sale === 1 || 
                     product.is_for_sale === '1' ||
                     product.is_for_sale === 'true' ||
                     String(product.is_for_sale).toLowerCase() === 'true';
    
    const isMadeToOrder = product.is_made_to_order === true || 
                         product.is_made_to_order === 1 || 
                         product.is_made_to_order === '1' ||
                         product.is_made_to_order === 'true' ||
                         String(product.is_made_to_order).toLowerCase() === 'true';
    
    // Проверяем настройки резервации
    const shopSettings = getCurrentShopSettings();
    const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
    const canReserve = appContext.role === 'client' && 
                      appContext.permissions && 
                      appContext.permissions.can_reserve && 
                      reservationsEnabled &&
                      !isMadeToOrder;
    
    // Настраиваем кнопки в зависимости от типа товара
    if (primaryBtn) {
        if (isForSale && appContext.role === 'client') {
            primaryBtn.textContent = 'Продать сейчас';
            primaryBtn.style.display = 'flex';
        } else if (isMadeToOrder && appContext.role === 'client') {
            primaryBtn.textContent = 'Заказать сейчас';
            primaryBtn.style.display = 'flex';
        } else if (canReserve) {
            primaryBtn.textContent = 'Резервировать сейчас';
            primaryBtn.style.display = 'flex';
        } else {
            primaryBtn.textContent = 'Готово';
            primaryBtn.style.display = 'flex';
        }
        
        // Обработчик основной кнопки
        primaryBtn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            try {
                if (isForSale && appContext.role === 'client') {
                    if (showSaleOrderModalCallback) {
                        showSaleOrderModalCallback(product);
                    }
                } else if (isMadeToOrder && appContext.role === 'client') {
                    if (showOrderModalCallback) {
                        showOrderModalCallback(product.id);
                    }
                } else if (canReserve) {
                    if (showReservationModalCallback) {
                        showReservationModalCallback(product.id);
                    }
                }
                // Для остальных товаров - просто обновляем состояние кнопок
                if (window.updateCartButtonsState) {
                    window.updateCartButtonsState();
                }
            } catch (error) {
                console.error('❌ Error in primary button action:', error);
            }
        };
    }
    
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
                const newQuantity = currentValue + 1;
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
            }
        };
    }
    
    // Убеждаемся, что bottom sheet видимый
    productPageBottomSheet.style.display = 'flex';
    
    // Также убеждаемся, что товар добавлен в корзину (если его там еще нет)
    try {
        const { getCartItems, addProductToCart } = await import('../cart/cartStore.js');
        const cartItems = getCartItems();
        const existingItem = cartItems.find(item => item.product.id === product.id);
        if (!existingItem) {
            // Если товара нет в корзине, добавляем его
            await addProductToCart(product, currentQuantity);
            if (window.updateCartButtonsState) {
                window.updateCartButtonsState();
            }
        }
    } catch (error) {
        console.error('❌ Error ensuring product in cart:', error);
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
        // Скрываем все страницы сначала
        if (mainContent) mainContent.style.display = 'none';
        if (favoritesPage) favoritesPage.style.display = 'none';
        if (cartPage) cartPage.style.display = 'none';
        
        // Показываем нужную страницу
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
        } else if (navigationHistory === 'cart' && cartPage) {
            cartPage.style.display = 'block';
            // Сбрасываем историю навигации только если возвращаемся НЕ в админку
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

