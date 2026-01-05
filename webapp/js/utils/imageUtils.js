// ========== REFACTORING STEP 2.1, 2.2: imageUtils.js ==========
// Модуль утилит для работы с изображениями товаров
// Дата создания: 2024-12-19
// Статус: В процессе

/**
 * Получает URL изображения товара с учетом приоритета (images_urls > image_url)
 * @param {Object} product - Объект товара
 * @param {string} API_BASE - Базовый URL API
 * @returns {string|null} Полный URL изображения или null если изображения нет
 */
export function getProductImageUrl(product, API_BASE) {
    let imageUrl = null;
    
    // Приоритет: сначала проверяем массив images_urls
    if (product.images_urls && Array.isArray(product.images_urls) && product.images_urls.length > 0) {
        const firstImage = product.images_urls[0];
        // Проверяем, что это не пустая строка
        if (firstImage && typeof firstImage === 'string' && firstImage.trim() !== '') {
            imageUrl = firstImage.startsWith('http') 
                ? firstImage 
                : `${API_BASE}${firstImage.startsWith('/') ? '' : '/'}${firstImage}`;
        }
    }
    
    // Если не нашли в images_urls, проверяем image_url
    if (!imageUrl && product.image_url) {
        // Проверяем, что это не пустая строка
        if (typeof product.image_url === 'string' && product.image_url.trim() !== '') {
            imageUrl = product.image_url.startsWith('http') 
                ? product.image_url 
                : `${API_BASE}${product.image_url.startsWith('/') ? '' : '/'}${product.image_url}`;
        }
    }
    
    return imageUrl;
}

/**
 * Создает контейнер изображения с загрузкой через fetch для обхода блокировки Telegram WebView
 * @param {string|null} imageUrl - URL изображения или null если изображения нет
 * @param {string} productName - Название товара для alt текста
 * @param {string} [logPrefix='[IMG]'] - Префикс для логов ошибок (опционально)
 * @returns {HTMLElement} Контейнер div с классом cart-item-image-container
 */
export function createImageContainer(imageUrl, productName, logPrefix = '[IMG]') {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'cart-item-image-container';
    
    if (imageUrl) {
        // Показываем placeholder во время загрузки
        const placeholder = document.createElement('div');
        placeholder.className = 'cart-item-image-placeholder';
        placeholder.textContent = '⏳';
        imageContainer.appendChild(placeholder);
        
        // Загружаем изображение через fetch для обхода блокировки Telegram WebView
        fetch(imageUrl, {
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
            const img = document.createElement('img');
            img.src = blobUrl;
            img.alt = productName;
            img.className = 'cart-item-image';
            img.onerror = () => {
                console.error(`${logPrefix} Image load error for "${productName}":`, blobUrl);
                URL.revokeObjectURL(blobUrl);
                placeholder.textContent = '📦';
                placeholder.style.display = 'flex';
                if (img.parentNode) {
                    img.remove();
                }
            };
            img.onload = () => {
                if (placeholder.parentNode) {
                    placeholder.remove();
                }
            };
            imageContainer.appendChild(img);
        })
        .catch(error => {
            console.error(`${logPrefix} Fetch error for "${productName}":`, {
                error: error.message,
                url: imageUrl
            });
            placeholder.textContent = '📦';
        });
    } else {
        // Нет изображения - показываем placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'cart-item-image-placeholder';
        placeholder.textContent = '📦';
        imageContainer.appendChild(placeholder);
    }
    
    return imageContainer;
}

