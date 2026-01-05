// Модуль для рендеринга товаров
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { getCurrentShopSettings } from './admin.js';
import { API_BASE, toggleHotOffer, trackShopVisit } from './api.js';
import { getTelegramInstance } from './telegram.js';
import { getProductPriceDisplay } from './utils/priceUtils.js';

// Зависимости, которые будут переданы из app.js
let productsGridElement = null;
let appContextGetter = null; // Функция для получения актуального appContext

// Зависимости для showProductModal
let modalElement = null; // DOM элемент модального окна
let modalState = null; // Объект состояния модального окна { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
let loadDataCallback = null; // Функция для перезагрузки данных
let showEditProductModalCallback = null; // Функция для показа модального окна редактирования
let markAsSoldCallback = null; // Функция для пометки товара как проданного
let deleteProductCallback = null; // Функция для удаления товара
let cancelReservationCallback = null; // Функция для отмены резервации
let showPurchaseModalCallback = null; // Функция для показа модального окна продажи
let showReservationModalCallback = null; // Функция для показа модального окна резервации
let showOrderModalCallback = null; // Функция для показа модального окна заказа

// Инициализация зависимостей
export function initProductsDependencies(dependencies) {
    productsGridElement = dependencies.productsGrid;
    appContextGetter = dependencies.appContext; // Функция-геттер для получения актуального appContext
    
    // Зависимости для showProductModal
    modalElement = dependencies.modal;
    modalState = dependencies.modalState; // Объект состояния { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
    loadDataCallback = dependencies.loadData;
    showEditProductModalCallback = dependencies.showEditProductModal;
    markAsSoldCallback = dependencies.markAsSold;
    deleteProductCallback = dependencies.deleteProduct;
    cancelReservationCallback = dependencies.cancelReservation;
    showPurchaseModalCallback = dependencies.showPurchaseModal;
    showReservationModalCallback = dependencies.showReservationModal;
    showOrderModalCallback = dependencies.showOrderModal;
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

// Показ модального окна товара
export function showProductModal(prod, finalPrice, fullImages) {
    console.log(`[MODAL] showProductModal called: productId=${prod.id}, productName="${prod.name}", fullImages.length=${fullImages ? fullImages.length : 0}`);
    
    if (!modalState || !modalElement) {
        console.error('❌ Modal state or element not initialized!');
        return;
    }
    
    // Сбрасываем ID загрузки при открытии нового товара
    modalState.currentImageLoadId = 0;
    
    modalState.currentProduct = prod;
    modalState.currentImages = fullImages || [];
    modalState.currentImageIndex = 0;
    
    console.log(`[MODAL] State updated: currentImages.length=${modalState.currentImages.length}, currentImageLoadId=${modalState.currentImageLoadId}`);
    
    // Получаем актуальный appContext
    const appContext = appContextGetter ? appContextGetter() : null;
    
    // Отслеживаем просмотр конкретного товара (только для клиентов, не для владельца)
    if (appContext && appContext.role === 'client' && appContext.shop_owner_id) {
        trackShopVisit(appContext.shop_owner_id, prod.id).catch(err => {
            console.warn('Failed to track product view:', err);
        });
    }
    
    // Управление горящим предложением (только для владельца) - сразу после фото
    const modalHotOfferControl = document.getElementById('modal-hot-offer-control');
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        modalHotOfferControl.style.display = 'block';
        modalHotOfferControl.innerHTML = '';
        
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
        modalHotOfferControl.appendChild(hotOfferContainer);
    } else {
        modalHotOfferControl.style.display = 'none';
    }
    
    // Кнопки управления товаром (только для владельца)
    const modalEditControl = document.getElementById('modal-edit-control');
    if (!modalEditControl) {
        // Создаем контейнер для кнопок управления, если его еще нет
        const editControlDiv = document.createElement('div');
        editControlDiv.id = 'modal-edit-control';
        editControlDiv.style.cssText = 'margin: 12px 0; display: flex; flex-direction: column; gap: 6px;';
        const modalContent = document.querySelector('#product-modal .modal-content');
        const modalName = document.getElementById('modal-name');
        modalContent.insertBefore(editControlDiv, modalName);
    }
    
    const editControl = document.getElementById('modal-edit-control');
    editControl.innerHTML = '';
    
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
        editControl.appendChild(editBtn);
        
        // Кнопка "Продан"
        const soldBtn = document.createElement('button');
        soldBtn.className = 'reserve-btn btn-sold';
        soldBtn.textContent = '✅ Продан';
        soldBtn.onclick = () => {
            if (markAsSoldCallback) {
                markAsSoldCallback(prod.id, prod);
            }
        };
        editControl.appendChild(soldBtn);
        
        // Кнопка "Удалить"
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'reserve-btn btn-delete';
        deleteBtn.textContent = '🗑️ Удалить';
        deleteBtn.onclick = () => {
            if (deleteProductCallback) {
                deleteProductCallback(prod.id);
            }
        };
        editControl.appendChild(deleteBtn);
        
        editControl.style.display = 'flex';
    } else {
        editControl.style.display = 'none';
    }
    
    document.getElementById('modal-name').textContent = prod.name;
    
    const modalDescription = document.getElementById('modal-description');
    if (prod.description) {
        modalDescription.textContent = prod.description;
        modalDescription.style.display = 'block';
    } else {
        modalDescription.style.display = 'none';
    }
    
    const modalPriceContainer = document.getElementById('modal-price-container');
    modalPriceContainer.innerHTML = '';
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
        modalPriceContainer.appendChild(oldPriceSpan);
    }
    
    modalPriceContainer.appendChild(priceSpan);
    
    // Количество товара в модальном окне
    const modalQuantityDiv = document.getElementById('modal-quantity');
    if (modalQuantityDiv) {
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
            modalQuantityDiv.style.display = 'block';
            // Формируем текст с количеством от и единицей измерения
            const quantityFrom = prod.quantity_from !== null && prod.quantity_from !== undefined ? prod.quantity_from : null;
            const quantityUnit = prod.quantity_unit || 'шт';
            if (quantityFrom !== null && quantityFrom !== undefined) {
                modalQuantityDiv.textContent = `🛒 От ${quantityFrom} ${quantityUnit}`;
            } else {
                modalQuantityDiv.textContent = '🛒 Покупка';
            }
        } else if (isMadeToOrder) {
            modalQuantityDiv.style.display = 'block';
            modalQuantityDiv.textContent = '📦 Под заказ';
        } else if (prod.quantity !== undefined && prod.quantity !== null) {
            modalQuantityDiv.style.display = 'block';
            // Получаем единицу измерения
            const quantityUnit = prod.quantity_unit || 'шт';
            // Проверяем активные резервации
            const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
            const availableCount = prod.quantity - activeReservationsCount;
            
            // Если quantity_enabled включен, показываем количество с учетом резерваций
            if (quantityEnabledForModal) {
                if (activeReservationsCount > 0) {
                    // Если есть резервации, показываем "Доступно: X из Y единица"
                    modalQuantityDiv.textContent = `📦 Доступно: ${availableCount} из ${prod.quantity} ${quantityUnit}`;
                } else {
                    // Если резерваций нет, показываем просто "В наличии: Y единица"
                    modalQuantityDiv.textContent = `📦 В наличии: ${prod.quantity} ${quantityUnit}`;
                }
            } else {
                // Если quantity_enabled выключен, показываем просто "В наличии"
                modalQuantityDiv.textContent = '📦 В наличии';
            }
        } else if (!quantityEnabledForModal) {
            // Если quantity_enabled выключен и quantity не указан, показываем просто "В наличии"
            modalQuantityDiv.style.display = 'block';
            modalQuantityDiv.textContent = '📦 В наличии';
        } else {
            modalQuantityDiv.style.display = 'none';
        }
    }
    
    // Резервация (только если quantity_enabled включен)
    const modalReservationButton = document.getElementById('modal-reservation-button');
    const modalReservationStatus = document.getElementById('modal-reservation-status');
    modalReservationButton.innerHTML = '';
    modalReservationStatus.style.display = 'none';
    
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
        
        modalReservationStatus.style.display = 'block';
        
        // Показываем информацию о резервации с учетом количества (только если quantity_enabled включен)
        if (quantityEnabledForReservation && productQuantity > 1 && activeReservationsCount > 0) {
            const availableCount = productQuantity - activeReservationsCount;
            const quantityUnit = prod.quantity_unit || 'шт';
            modalReservationStatus.textContent = `⏰ Зарезервировано: ${activeReservationsCount} из ${productQuantity} ${quantityUnit} (доступно: ${availableCount} ${quantityUnit}) до ${timeText}`;
        } else {
            modalReservationStatus.textContent = `⏰ Товар зарезервирован на ${timeText}`;
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
            modalReservationButton.appendChild(cancelBtn);
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
        modalReservationButton.appendChild(sellBtn);
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
            modalReservationButton.appendChild(reserveBtn);
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
            modalReservationButton.appendChild(orderBtn);
        }
    }
    
    // Показываем первое изображение
    showModalImage(0);
    modalElement.style.display = 'block';
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

// Детекция устройства (мобильное/десктоп)
// В Telegram WebView на мобильных устройствах нужно использовать blob URL для обхода блокировки
// На десктопе можно использовать прямые URL
export function isMobileDevice() {
    // Проверяем через Telegram WebApp platform
    const tg = getTelegramInstance();
    if (tg && tg.platform) {
        return tg.platform === 'ios' || tg.platform === 'android';
    }
    // Fallback: проверяем через user agent
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768);
}

