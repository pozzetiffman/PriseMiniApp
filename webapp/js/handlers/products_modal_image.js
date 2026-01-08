// Модуль для изображений в модальном окне товара
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 2.1: showModalImage ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { isMobileDevice } from '../utils/products_utils.js';

// Зависимости, которые будут переданы из products.js через initProductModalImageDependencies
let modalState = null; // Объект состояния модального окна { currentImageLoadId, currentProduct, currentImages, currentImageIndex }

// Инициализация зависимостей для showModalImage и updateImageNavigation
export function initProductModalImageDependencies(dependencies) {
    modalState = dependencies.modalState; // Объект состояния { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
}

// Показ изображения в модальном окне
export function showModalImage(index) {
    if (!modalState) {
        console.error('❌ Modal state not initialized!');
        return;
    }
    
    const modalImage = document.getElementById('modal-image');
    if (!modalImage) {
        console.error('❌ Modal image element not found!');
        return;
    }
    
    // ВАЖНО: Всегда очищаем предыдущее состояние перед показом нового содержимого
    // Это критично для исправления бага, когда после товара без фото не показываются фото других товаров
    
    // Увеличиваем ID загрузки, чтобы отменить старые запросы
    modalState.currentImageLoadId++;
    const loadId = modalState.currentImageLoadId;
    
    console.log(`[MODAL IMG] showModalImage called: index=${index}, loadId=${loadId}, currentImages.length=${modalState.currentImages.length}, currentProduct=${modalState.currentProduct ? modalState.currentProduct.id : 'null'}`);
    
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
    if (modalState.currentImages.length === 0) {
        console.log(`[MODAL IMG] No images, showing placeholder (loadId=${loadId})`);
        modalImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
        modalImage.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
        return;
    }
    
    if (index < 0 || index >= modalState.currentImages.length) {
        console.warn(`[MODAL IMG] Invalid index: ${index}, currentImages.length=${modalState.currentImages.length}`);
        return;
    }
    
    modalState.currentImageIndex = index;
    const fullImg = modalState.currentImages[index];
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
            if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
                console.log(`[MODAL IMG] Load cancelled: loadId=${loadId}, currentLoadId=${modalState.currentImageLoadId}`);
                return null;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            // Проверяем актуальность перед созданием изображения
            if (!blob || loadId !== modalState.currentImageLoadId || !isContainerValid()) {
                if (blob) {
                    console.log(`[MODAL IMG] Load cancelled after blob: loadId=${loadId}, currentLoadId=${modalState.currentImageLoadId}`);
                }
                return;
            }
            
            // Создаем blob URL для обхода блокировки ngrok доменов
            const blobUrl = URL.createObjectURL(blob);
            modalImage.dataset.blobUrl = blobUrl; // Сохраняем для последующей очистки
            
            const img = document.createElement('img');
            img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 12px; display: block;';
            img.alt = modalState.currentProduct ? modalState.currentProduct.name : 'Product';
            
            img.onload = () => {
                // Проверяем актуальность перед обновлением DOM
                if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
                    console.log(`[MODAL IMG] Image load cancelled on onload: loadId=${loadId}, currentLoadId=${modalState.currentImageLoadId}`);
                    URL.revokeObjectURL(blobUrl);
                    return;
                }
                
                imageContainer.innerHTML = '';
                imageContainer.appendChild(img);
                modalImage.style.backgroundColor = 'transparent';
                
                console.log(`[MODAL IMG] Image loaded successfully (mobile): loadId=${loadId}`);
                
                // Добавляем навигацию по фото, если их больше одного
                if (modalState.currentImages.length > 1) {
                    updateImageNavigation();
                }
            };
            
            img.onerror = () => {
                if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
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
            if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
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
        img.alt = modalState.currentProduct ? modalState.currentProduct.name : 'Product';
        
        img.onload = () => {
            // Проверяем актуальность перед обновлением DOM
            if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
                console.log(`[MODAL IMG] Image load cancelled on onload (desktop): loadId=${loadId}, currentLoadId=${modalState.currentImageLoadId}`);
                return;
            }
            
            imageContainer.innerHTML = '';
            imageContainer.appendChild(img);
            modalImage.style.backgroundColor = 'transparent';
            
            console.log(`[MODAL IMG] Image loaded successfully (desktop): loadId=${loadId}`);
            
            // Добавляем навигацию по фото, если их больше одного
            if (modalState.currentImages.length > 1) {
                updateImageNavigation();
            }
        };
        
        img.onerror = () => {
            // Проверяем актуальность перед fallback
            if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
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
                if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
                    return null;
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                if (!blob || loadId !== modalState.currentImageLoadId || !isContainerValid()) {
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                modalImage.dataset.blobUrl = blobUrl; // Сохраняем для последующей очистки
                img.src = blobUrl;
                console.log('[MODAL IMG] Image loaded via fetch fallback (desktop)');
            })
            .catch(error => {
                if (loadId !== modalState.currentImageLoadId || !isContainerValid()) {
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
// ========== END REFACTORING STEP 2.1 ==========

// ========== REFACTORING STEP 2.2: updateImageNavigation ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Обновление навигации по фото
export function updateImageNavigation() {
    console.log('[NAV] updateImageNavigation called');
    if (!modalState) {
        console.error('❌ Modal state not initialized!');
        return;
    }
    
    console.log('[NAV] modalState:', {
        currentImageIndex: modalState.currentImageIndex,
        currentImagesLength: modalState.currentImages.length
    });
    
    const modalImage = document.getElementById('modal-image');
    if (!modalImage) {
        console.error('❌ Modal image element not found!');
        return;
    }
    
    // Находим imageContainer, в который нужно добавить навигацию
    const imageContainer = modalImage.querySelector('.image-container');
    if (!imageContainer) {
        console.warn('[NAV] imageContainer not found, navigation may not display correctly');
    }
    
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
            const newIndex = modalState.currentImageIndex - 1;
            console.log('[NAV] Previous button clicked, currentIndex:', modalState.currentImageIndex, 'newIndex:', newIndex);
            showModalImage(newIndex);
        };
        navContainer.appendChild(prevBtn);
    }
    
    // Индикатор фото в стиле Liquid Glass
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
        letter-spacing: 0.3px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    `;
    navContainer.appendChild(indicator);
    
    // Кнопка "Вперед" в стиле Liquid Glass
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
            const newIndex = modalState.currentImageIndex + 1;
            console.log('[NAV] Next button clicked, currentIndex:', modalState.currentImageIndex, 'newIndex:', newIndex);
            showModalImage(newIndex);
        };
        navContainer.appendChild(nextBtn);
    }
    
    // Добавляем навигацию в imageContainer, если он есть, иначе в modalImage
    if (imageContainer) {
        imageContainer.appendChild(navContainer);
    } else {
        modalImage.appendChild(navContainer);
    }
    
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
            if (diff > 0 && modalState.currentImageIndex < modalState.currentImages.length - 1) {
                // Свайп влево - следующее фото
                const newIndex = modalState.currentImageIndex + 1;
                console.log('[NAV] Swipe left, currentIndex:', modalState.currentImageIndex, 'newIndex:', newIndex);
                showModalImage(newIndex);
            } else if (diff < 0 && modalState.currentImageIndex > 0) {
                // Свайп вправо - предыдущее фото
                const newIndex = modalState.currentImageIndex - 1;
                console.log('[NAV] Swipe right, currentIndex:', modalState.currentImageIndex, 'newIndex:', newIndex);
                showModalImage(newIndex);
            }
        }
    }
}
// ========== END REFACTORING STEP 2.2 ==========

