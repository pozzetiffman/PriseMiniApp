// Модуль для рендеринга товаров
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 4.1: renderProducts ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { getCurrentShopSettings } from '../admin.js';
import { API_BASE } from '../api.js';
import { showProductModal } from '../products.js'; // Импортируем из products.js, так как она еще не вынесена
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import { isMobileDevice } from '../utils/products_utils.js';

// Зависимости, которые будут переданы из products.js через initRenderProductsDependencies
let productsGridElement = null;
let appContextGetter = null; // Функция для получения актуального appContext

// Инициализация зависимостей для renderProducts
export function initRenderProductsDependencies(dependencies) {
    productsGridElement = dependencies.productsGrid;
    appContextGetter = dependencies.appContext; // Функция-геттер для получения актуального appContext
}

// Рендеринг товаров
export function renderProducts(products) {
    if (!productsGridElement) {
        console.error('❌ productsGrid element not initialized!');
        return;
    }
    
    productsGridElement.innerHTML = '';
    
    // Отладочный вывод - проверяем, что приходит с сервера
    console.log('[RENDER DEBUG] Products received:', products);
    if (products && products.length > 0) {
        console.log('[RENDER DEBUG] First product is_made_to_order:', products[0].is_made_to_order, 'type:', typeof products[0].is_made_to_order);
    }
    
    if (!products || products.length === 0) {
        const currentAppContext = appContextGetter ? appContextGetter() : null;
        if (currentAppContext && currentAppContext.role === 'client') {
            productsGridElement.innerHTML = '<p class="loading">В этой витрине пока нет товаров.</p>';
        } else {
            productsGridElement.innerHTML = '<p class="loading">Товаров пока нет. Используйте /manage в боте для добавления.</p>';
        }
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
        
        // Бейдж резервации будет добавлен в нижнюю часть фото
        let reservedBadge = null;
        if (prod.reservation) {
            card.style.opacity = '0.7';
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
        
        // Изображение
        const imageDiv = document.createElement('div');
        imageDiv.className = 'product-image';
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
        
        // Создаем badge горящего предложения
        let hotOfferBadge = null;
        if (prod.is_hot_offer) {
            hotOfferBadge = document.createElement('div');
            hotOfferBadge.className = 'hot-offer-badge';
            hotOfferBadge.innerHTML = '🔥';
            hotOfferBadge.setAttribute('aria-label', 'Горящее предложение');
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
            quantityBadge.className = 'product-quantity-badge';
            // Формируем текст с количеством от и единицей измерения
            let badgeText = 'Покупка';
            const quantityFrom = prod.quantity_from !== null && prod.quantity_from !== undefined ? prod.quantity_from : null;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantityFrom !== null && quantityFrom !== undefined) {
                badgeText = `От ${quantityFrom} ${quantityUnit}`;
            } else {
                badgeText = 'Покупка';
            }
            quantityBadge.textContent = badgeText;
            quantityBadge.style.background = 'rgba(255, 149, 0, 0.95)'; // Оранжевый для покупки
            quantityBadge.style.color = '#ffffff';
        } else if (isMadeToOrder) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            quantityBadge.textContent = 'Под заказ';
            quantityBadge.style.background = 'rgba(90, 200, 250, 0.95)'; // Синий для под заказ
            quantityBadge.style.color = '#ffffff';
        } else if (prod.quantity !== undefined && prod.quantity !== null) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            const quantity = prod.quantity;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantity > 0) {
                // Проверяем активные резервации
                const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
                const availableCount = quantity - activeReservationsCount;
                
                // Если quantity_enabled включен, показываем количество с учетом резерваций
                if (quantityEnabled) {
                    if (activeReservationsCount > 0) {
                        // Если есть резервации, показываем "Доступно: X из Y единица"
                        quantityBadge.textContent = `Доступно: ${availableCount} из ${quantity} ${quantityUnit}`;
                    } else {
                        // Если резерваций нет, показываем просто "В наличии: Y единица"
                        quantityBadge.textContent = `В наличии: ${quantity} ${quantityUnit}`;
                    }
                } else {
                    // Если quantity_enabled выключен, показываем просто "В наличии"
                    quantityBadge.textContent = 'В наличии';
                }
                quantityBadge.style.background = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
                quantityBadge.style.color = '#ffffff';
            } else {
                quantityBadge.textContent = 'Нет в наличии';
                quantityBadge.style.background = 'rgba(255, 59, 48, 0.95)'; // Красный для отсутствия
                quantityBadge.style.color = '#ffffff';
            }
        } else if (!quantityEnabled) {
            // Если quantity_enabled выключен и quantity не указан, показываем просто "В наличии"
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            quantityBadge.textContent = 'В наличии';
            quantityBadge.style.background = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
            quantityBadge.style.color = '#ffffff';
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
        
        if (fullImg) {
            // Показываем placeholder во время загрузки
            imageDiv.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
            const loadingPlaceholder = document.createElement('div');
            loadingPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 24px;';
            loadingPlaceholder.textContent = '⏳';
            imageDiv.appendChild(loadingPlaceholder);
            
            // Добавляем badge скидки ПЕРЕД загрузкой (чтобы он был поверх)
            if (discountBadge) {
                discountBadge.style.zIndex = '10';
                discountBadge.style.position = 'absolute';
                imageDiv.appendChild(discountBadge);
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
            
            // Добавляем badge резервации в нижней части фото
            if (reservedBadge) {
                imageDiv.appendChild(reservedBadge);
            }
            
            // Функция для показа ошибки
            const showError = () => {
                if (prod.id) {
                    console.error(`[IMG DEBUG] Product ${prod.id}: IMAGE LOAD ERROR`);
                }
                imageDiv.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
                const errorPlaceholder = document.createElement('div');
                errorPlaceholder.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 24px;';
                errorPlaceholder.textContent = '📷';
                imageDiv.innerHTML = '';
                imageDiv.appendChild(errorPlaceholder);
                if (discountBadge) {
                    imageDiv.appendChild(discountBadge);
                }
                if (hotOfferBadge) {
                    imageDiv.appendChild(hotOfferBadge);
                }
                if (reservedBadge) {
                    imageDiv.appendChild(reservedBadge);
                }
            };
            
            // Определяем, мобильное устройство или десктоп
            const isMobile = isMobileDevice();
            
            if (isMobile) {
                // На мобильных устройствах используем fetch + blob URL для обхода блокировки Telegram WebView
                // Telegram WebView может блокировать прямые запросы к ngrok доменам через <img src>
                // Но fetch запросы работают, поэтому мы загружаем через fetch и создаем blob URL
                fetch(fullImg, {
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
                    // Создаем blob URL для обхода блокировки ngrok доменов
                    const blobUrl = URL.createObjectURL(blob);
                    
                    if (prod.id) {
                        console.log(`[IMG DEBUG] Product ${prod.id}: Image loaded via fetch, blob URL created (mobile)`);
                    }
                    
                    // Создаем img элемент и устанавливаем blob URL
                    const img = document.createElement('img');
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;';
                    img.alt = prod.name;
                    
                    img.onload = function() {
                        // Изображение загружено успешно
                        if (prod.id) {
                            console.log(`[IMG DEBUG] Product ${prod.id}: IMAGE LOADED SUCCESSFULLY via blob URL (mobile)`);
                        }
                        // Удаляем placeholder
                        if (loadingPlaceholder.parentNode) {
                            loadingPlaceholder.remove();
                        }
                    };
                    
                    img.onerror = function() {
                        // Ошибка загрузки изображения
                        if (prod.id) {
                            console.error(`[IMG DEBUG] Product ${prod.id}: IMAGE LOAD ERROR - blob URL failed (mobile)`);
                        }
                        URL.revokeObjectURL(blobUrl); // Освобождаем память
                        showError();
                    };
                    
                    // Заменяем placeholder на изображение
                    imageDiv.innerHTML = '';
                    imageDiv.appendChild(img);
                    if (discountBadge) {
                        imageDiv.appendChild(discountBadge);
                    }
                    if (hotOfferBadge) {
                        imageDiv.appendChild(hotOfferBadge);
                    }
                    if (reservedBadge) {
                        imageDiv.appendChild(reservedBadge);
                    }
                    
                    // Устанавливаем blob URL
                    img.src = blobUrl;
                })
                .catch(error => {
                    if (prod.id) {
                        console.error(`[IMG DEBUG] Product ${prod.id}: Fetch error (mobile):`, error);
                        console.error(`[IMG DEBUG] Product ${prod.id}: Failed URL: "${fullImg}"`);
                    }
                    showError();
                });
            } else {
                // На десктопе используем прямые URL (более надежно и быстрее)
                const img = document.createElement('img');
                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;';
                img.alt = prod.name;
                
                img.onload = function() {
                    // Изображение загружено успешно
                    if (prod.id) {
                        console.log(`[IMG DEBUG] Product ${prod.id}: IMAGE LOADED SUCCESSFULLY via direct URL (desktop)`);
                    }
                    // Удаляем placeholder
                    if (loadingPlaceholder.parentNode) {
                        loadingPlaceholder.remove();
                    }
                };
                
                img.onerror = function() {
                    // Ошибка загрузки изображения - пробуем через fetch как fallback
                    if (prod.id) {
                        console.warn(`[IMG DEBUG] Product ${prod.id}: Direct URL failed, trying fetch fallback (desktop)`);
                    }
                    // Fallback: пробуем через fetch
                    fetch(fullImg, {
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
                        img.src = blobUrl;
                        if (prod.id) {
                            console.log(`[IMG DEBUG] Product ${prod.id}: Image loaded via fetch fallback (desktop)`);
                        }
                    })
                    .catch(error => {
                        if (prod.id) {
                            console.error(`[IMG DEBUG] Product ${prod.id}: Fetch fallback also failed:`, error);
                        }
                        showError();
                    });
                };
                
                // Заменяем placeholder на изображение
                imageDiv.innerHTML = '';
                imageDiv.appendChild(img);
                if (discountBadge) {
                    imageDiv.appendChild(discountBadge);
                }
                if (hotOfferBadge) {
                    imageDiv.appendChild(hotOfferBadge);
                }
                if (reservedBadge) {
                    imageDiv.appendChild(reservedBadge);
                }
                
                // Устанавливаем прямой URL
                img.src = fullImg;
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
            
            // Добавляем badge горящего предложения даже если нет изображения (всегда справа)
            if (hotOfferBadge) {
                hotOfferBadge.style.zIndex = '11';
                hotOfferBadge.style.position = 'absolute';
                hotOfferBadge.style.top = '8px';
                hotOfferBadge.style.right = '8px';
                hotOfferBadge.style.left = 'auto';
                imageDiv.appendChild(hotOfferBadge);
            }
            
            // Добавляем badge резервации в нижней части фото даже если нет изображения
            if (reservedBadge) {
                imageDiv.appendChild(reservedBadge);
            }
        }
        
        // Название
        const nameDiv = document.createElement('div');
        nameDiv.className = 'product-name';
        nameDiv.textContent = prod.name;
        
        // Цена - определяем что показывать
        const priceContainer = document.createElement('div');
        priceContainer.className = 'product-price-container';
        const priceSpan = document.createElement('span');
        priceSpan.className = 'product-price';
        
        // Используем функцию из priceUtils.js для форматирования цены
        const priceDisplay = getProductPriceDisplay(prod);
        priceSpan.textContent = priceDisplay;
        
        // Старая цена при скидке (только для обычных товаров)
        const isForSaleCard = prod.is_for_sale === true || 
                         prod.is_for_sale === 1 || 
                         prod.is_for_sale === '1' ||
                         prod.is_for_sale === 'true' ||
                         String(prod.is_for_sale).toLowerCase() === 'true';
        
        if (!isForSaleCard && prod.discount > 0 && prod.price != null && prod.price > 0) {
            const oldPriceSpan = document.createElement('span');
            oldPriceSpan.className = 'old-price';
            oldPriceSpan.textContent = `${prod.price} ₽`;
            priceContainer.appendChild(oldPriceSpan);
        }
        
        priceContainer.appendChild(priceSpan);
        card.appendChild(nameDiv);
        card.appendChild(priceContainer);
        
        // Количество товара под ценой
        if (quantityBadge) {
            // Убираем абсолютное позиционирование, так как теперь это обычный блок
            quantityBadge.style.position = 'static';
            quantityBadge.style.zIndex = 'auto';
            quantityBadge.style.bottom = 'auto';
            quantityBadge.style.right = 'auto';
            quantityBadge.style.left = 'auto';
            card.appendChild(quantityBadge);
        }
        
        card.onclick = () => {
            // Используем экспортированную функцию напрямую
            showProductModal(prod, null, fullImages);
        };
        
        // card уже добавлен в DOM выше (перед установкой img.src)
    });
}
// ========== END REFACTORING STEP 4.1 ==========

