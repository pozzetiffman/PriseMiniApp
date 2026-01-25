// Модуль для создания слайдера изображений на карточках товаров

/**
 * Создает слайдер изображений с индикаторами и обработкой свайпа
 * @param {HTMLElement} container - Контейнер для слайдера (product-image)
 * @param {Array<string>} images - Массив URL изображений
 * @param {Object} options - Опции слайдера
 */
export function createImageSlider(container, images, options = {}) {
    if (!images || images.length === 0) {
        return null;
    }

    const {
        onImageLoad = null,
        onImageError = null,
        isMobile = false
    } = options;

    // Создаем структуру слайдера
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'product-image-slider';
    // Добавляем класс для множественных изображений
    if (images.length > 1) {
        sliderContainer.classList.add('product-image-slider-multiple');
    }
    
    const imagesWrapper = document.createElement('div');
    imagesWrapper.className = 'product-images-wrapper';
    
    // Создаем индикаторы только если изображений больше одного
    let indicatorsContainer = null;
    if (images.length > 1) {
        indicatorsContainer = document.createElement('div');
        indicatorsContainer.className = 'product-image-indicators';
        
        // Создаем точки-индикаторы
        images.forEach((_, index) => {
            const indicator = document.createElement('div');
            indicator.className = 'product-image-indicator';
            if (index === 0) {
                indicator.classList.add('active');
            }
            indicatorsContainer.appendChild(indicator);
        });
    }

    // Создаем изображения
    let currentIndex = 0;
    images.forEach((imageUrl, index) => {
        const imageSlide = document.createElement('div');
        imageSlide.className = 'product-image-slide';
        imageSlide.style.cssText = 'flex: 0 0 100%; width: 100%; height: 100%; position: relative;';
        
        const img = document.createElement('img');
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
        img.alt = '';
        
        // Загрузка изображения
        // Используем fetch + blob для всех устройств, чтобы обойти CORS и блокировки Telegram WebView
        if (imageUrl) {
            fetch(imageUrl, {
                headers: {
                    'ngrok-skip-browser-warning': '69420'
                }
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.blob();
            })
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                img.src = blobUrl;
                if (onImageLoad) onImageLoad(img, index);
            })
            .catch(error => {
                console.error('Image load error:', error);
                // Fallback: пробуем прямую загрузку если fetch не сработал
                img.src = imageUrl;
                img.onload = () => {
                    if (onImageLoad) onImageLoad(img, index);
                };
                img.onerror = () => {
                    if (onImageError) onImageError(img, index);
                };
            });
        }
        
        imageSlide.appendChild(img);
        imagesWrapper.appendChild(imageSlide);
    });

    sliderContainer.appendChild(imagesWrapper);
    // Индикаторы НЕ добавляем в слайдер - они будут добавлены в карточку товара отдельно

    // Функция для переключения слайда
    function goToSlide(index) {
        if (index < 0 || index >= images.length) return;
        currentIndex = index;
        imagesWrapper.style.transform = `translateX(-${index * 100}%)`;
        
        // Обновляем индикаторы
        if (indicatorsContainer) {
            const indicators = indicatorsContainer.querySelectorAll('.product-image-indicator');
            indicators.forEach((indicator, i) => {
                if (i === index) {
                    indicator.classList.add('active');
                } else {
                    indicator.classList.remove('active');
                }
            });
        }
    }

    // Обработка свайпа
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    let isHorizontalSwipe = false;
    let startTranslate = 0;
    let currentTranslate = 0;

    function getEventX(e) {
        return e.touches ? e.touches[0].clientX : e.clientX;
    }

    function getEventY(e) {
        return e.touches ? e.touches[0].clientY : e.clientY;
    }

    function touchStart(e) {
        startX = getEventX(e);
        startY = getEventY(e);
        isDragging = true;
        isHorizontalSwipe = false; // Сбрасываем флаг направления
        startTranslate = currentTranslate;
        imagesWrapper.style.transition = 'none';
        // НЕ вызываем preventDefault здесь, чтобы не блокировать прокрутку
    }

    function touchMove(e) {
        if (!isDragging) return;
        
        currentX = getEventX(e);
        currentY = getEventY(e);
        
        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(currentY - startY);
        
        // Определяем направление свайпа только один раз, с большим порогом
        if (!isHorizontalSwipe && (deltaX > 10 || deltaY > 10)) {
            if (deltaX > deltaY * 1.5) {
                // Явно горизонтальный свайп - блокируем прокрутку страницы
                isHorizontalSwipe = true;
                e.preventDefault();
                e.stopPropagation();
            } else if (deltaY > deltaX * 1.5) {
                // Явно вертикальный свайп - разрешаем прокрутку страницы
                isDragging = false;
                isHorizontalSwipe = false;
                return;
            }
            // Если направления примерно равны, продолжаем ждать
        }
        
        // Обрабатываем только горизонтальные свайпы
        if (isHorizontalSwipe) {
            e.preventDefault();
            e.stopPropagation();
            currentTranslate = startTranslate + currentX - startX;
            imagesWrapper.style.transform = `translateX(${currentTranslate}px)`;
        }
        // Если не горизонтальный свайп, не вызываем preventDefault - страница может прокручиваться
    }

    function touchEnd(e) {
        if (!isDragging) {
            isDragging = false;
            isHorizontalSwipe = false;
            return;
        }
        
        if (isHorizontalSwipe) {
            if (e) {
                e.stopPropagation();
            }
            imagesWrapper.style.transition = 'transform 0.3s ease';
            
            const movedBy = currentTranslate - startTranslate;
            const threshold = sliderContainer.offsetWidth * 0.3; // 30% ширины для переключения
            
            if (Math.abs(movedBy) > threshold) {
                if (movedBy > 0 && currentIndex > 0) {
                    goToSlide(currentIndex - 1);
                } else if (movedBy < 0 && currentIndex < images.length - 1) {
                    goToSlide(currentIndex + 1);
                } else {
                    goToSlide(currentIndex); // Возвращаемся к текущему
                }
            } else {
                goToSlide(currentIndex); // Возвращаемся к текущему
            }
            
            currentTranslate = -currentIndex * sliderContainer.offsetWidth;
        }
        
        isDragging = false;
        isHorizontalSwipe = false;
    }

    // Добавляем обработчики событий только если изображений больше одного
    if (images.length > 1) {
        sliderContainer.addEventListener('touchstart', touchStart, { passive: false });
        sliderContainer.addEventListener('touchmove', touchMove, { passive: false });
        sliderContainer.addEventListener('touchend', touchEnd);
        sliderContainer.addEventListener('touchcancel', touchEnd);

        // Также поддерживаем мышь для десктопа
        sliderContainer.addEventListener('mousedown', touchStart);
        sliderContainer.addEventListener('mousemove', touchMove);
        sliderContainer.addEventListener('mouseup', touchEnd);
        sliderContainer.addEventListener('mouseleave', touchEnd);
    } else {
        // Если только одно изображение, отключаем свайп
        sliderContainer.style.touchAction = 'auto';
    }

    // Инициализация
    currentTranslate = 0;
    goToSlide(0);
    
    // Добавляем слайдер в контейнер
    container.appendChild(sliderContainer);

    return {
        container: sliderContainer,
        indicatorsContainer: indicatorsContainer, // Возвращаем индикаторы отдельно для размещения в карточке
        goToSlide,
        getCurrentIndex: () => currentIndex
    };
}
