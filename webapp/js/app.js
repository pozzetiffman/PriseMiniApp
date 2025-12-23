// Главный файл приложения - инициализация и координация модулей
import { getCurrentShopSettings, initAdmin, loadShopSettings, openAdmin } from './admin.js';
import { API_BASE, cancelReservationAPI, createReservationAPI, fetchCategories, fetchProducts, getContext, getShopSettings, toggleHotOffer, trackShopVisit, updateProductAPI, updateProductNameDescriptionAPI, updateProductQuantityAPI } from './api.js';
import { initCart, loadCart, setupCartButton, setupCartModal, updateCartUI } from './cart.js';
import { getInitData, getTelegramInstance, initTelegram, requireTelegram } from './telegram.js';

// Глобальные переменные
let appContext = null; // Контекст магазина (viewer_id, shop_owner_id, role, permissions)
let currentCategoryId = null;

// Элементы DOM
const userNameElement = document.getElementById('user-name');
const categoriesNav = document.getElementById('categories-nav');
const productsGrid = document.getElementById('products-grid');
const modal = document.getElementById('product-modal');
const modalClose = document.querySelector('.modal-close');
const reservationModal = document.getElementById('reservation-modal');
const reservationClose = document.querySelector('.reservation-close');

// Состояние модального окна товара
let currentImageIndex = 0;
let currentImages = [];
let currentProduct = null;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOMContentLoaded - инициализация приложения');
    
    // 1. Инициализируем Telegram WebApp
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    try {
        initTelegram();
    } catch (e) {
        productsGrid.innerHTML = `<p class="loading">${e.message}</p>`;
        return;
    }
    
    // 2. Ждем немного, чтобы initData стал доступен
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 3. Проверяем, что Telegram доступен
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
    try {
        requireTelegram();
    } catch (e) {
        productsGrid.innerHTML = `<p class="loading">${e.message}</p>`;
        return;
    }
    
    // 4. Инициализируем cartModal
    setupCartModal();
    
    // 5. Получаем контекст магазина из backend
    try {
        // Проверяем, есть ли shop_owner_id в URL (для просмотра чужого магазина)
        const urlParams = new URLSearchParams(window.location.search);
        const shopOwnerIdParam = urlParams.get('user_id');
        const shopOwnerId = shopOwnerIdParam ? parseInt(shopOwnerIdParam, 10) : null;
        
        console.log('📡 Loading context, shopOwnerId:', shopOwnerId);
        console.log('📡 Telegram instance:', getTelegramInstance());
        console.log('📡 initData available:', !!getInitData());
        console.log('📡 initDataUnsafe:', getTelegramInstance()?.initDataUnsafe);
        
        appContext = await getContext(shopOwnerId);
        console.log('✅ Context loaded:', appContext);
    } catch (e) {
        console.error('❌ Failed to load context:', e);
        console.error('❌ Error details:', {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        
        // ВРЕМЕННО: для отладки используем fallback из URL
        // TODO: Убрать после исправления проблемы с контекстом
        const urlParams = new URLSearchParams(window.location.search);
        const shopOwnerIdParam = urlParams.get('user_id');
        
        if (shopOwnerIdParam) {
            console.warn('⚠️ FALLBACK: Using user_id from URL for debugging');
            appContext = {
                viewer_id: null,
                shop_owner_id: parseInt(shopOwnerIdParam, 10),
                role: 'client',
                permissions: {
                    can_create_products: false,
                    can_reserve: false,
                    can_cancel_reservation: false,
                    can_view_products: true,
                    can_view_categories: true
                }
            };
            console.log('✅ Using fallback context:', appContext);
        } else {
            // Согласно аудиту: приложение работает ТОЛЬКО через Telegram
            // Если контекст не загрузился - это критическая ошибка
            let errorMessage = 'Ошибка загрузки контекста';
            if (e.message.includes('401') || e.message.includes('initData')) {
                errorMessage = 'Ошибка авторизации. Убедитесь, что приложение открыто через Telegram-бота.';
            } else if (e.message.includes('404')) {
                errorMessage = 'Магазин не найден.';
            } else {
                errorMessage = `Ошибка: ${e.message}`;
            }
            
            productsGrid.innerHTML = `<p class="loading">${errorMessage}</p>`;
            return;
        }
    }
    
    // 5. Устанавливаем приветствие (будет обновлено после загрузки настроек)
    const tg = getTelegramInstance();
    if (appContext.role === 'client') {
        userNameElement.innerText = "Магазин"; // Временно, обновится после загрузки настроек
    } else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userNameElement.innerText = "Привет, " + tg.initDataUnsafe.user.first_name + "!";
    } else {
        userNameElement.innerText = "Прайс";
    }

// Обновление заголовка с названием магазина
window.updateShopNameInHeader = async function updateShopNameInHeader() {
    if (appContext && appContext.role === 'client') {
        // ВАЖНО: Всегда загружаем настройки заново для текущего магазина,
        // чтобы избежать проблем с кэшированием настроек разных магазинов
        const currentShopOwnerId = appContext.shop_owner_id;
        console.log(`🏷️ Updating shop name header for shop_owner_id: ${currentShopOwnerId}`);
        
        try {
            // Загружаем настройки заново для текущего магазина
            const shopSettings = await getShopSettings(currentShopOwnerId);
            console.log(`🏷️ Shop settings loaded for shop_owner_id ${currentShopOwnerId}:`, shopSettings);
            
            const shopName = shopSettings && shopSettings.shop_name ? shopSettings.shop_name : 'Магазин';
            userNameElement.innerText = shopName; // Убираем эмодзи, показываем только название
            
            // Обновляем глобальную переменную для других частей приложения
            await loadShopSettings(currentShopOwnerId);
            console.log(`✅ Shop name header updated to: "${shopName}"`);
        } catch (error) {
            console.error(`❌ Error loading shop settings for header (shop_owner_id: ${currentShopOwnerId}):`, error);
            // В случае ошибки используем кэшированные настройки или дефолт
            const shopSettings = getCurrentShopSettings();
            const shopName = shopSettings && shopSettings.shop_name ? shopSettings.shop_name : 'Магазин';
            userNameElement.innerText = shopName;
        }
    }
}
    
    // 6. Настраиваем обработчики модальных окон
    setupModals();
    
    // 7. Инициализируем корзину
    setupCartButton();
    initCart();
    
    // 8. Загружаем настройки магазина
    if (appContext.role === 'owner') {
        // Для владельца загружаем свои настройки
        await loadShopSettings();
        initAdmin();
        setupAdminButton();
    } else {
        // Для клиентов загружаем настройки владельца магазина
        await loadShopSettings(appContext.shop_owner_id);
    }
    
    // Обновляем заголовок с названием магазина (async функция)
    await updateShopNameInHeader();
    
    // 9. Загружаем данные
    await loadData();
    
    // 10. Обновляем корзину после загрузки данных
    setTimeout(async () => {
        console.log('🛒 Обновление корзины после загрузки данных...');
        await updateCartUI();
    }, 500);
});

// Загрузка данных (категории и товары)
window.loadData = async function loadData() {
    console.log('🚀 loadData() called');
    console.log('🚀 appContext:', appContext);
    
    if (!appContext) {
        console.error('❌ loadData: appContext is null!');
        productsGrid.innerHTML = '<p class="loading">Ошибка: контекст не загружен</p>';
        return;
    }

    console.log('📦 Starting data load for shop_owner_id:', appContext.shop_owner_id);
    productsGrid.innerHTML = '<p class="loading">Загрузка товаров...</p>';
    
    try {
        console.log('📦 Loading data for shop_owner_id:', appContext.shop_owner_id);
        console.log('📦 API_BASE:', API_BASE);
        
        // Загружаем категории для магазина (shop_owner_id)
        console.log('📂 Step 1: Fetching categories...');
        const categoriesUrl = `${API_BASE}/api/categories/?user_id=${appContext.shop_owner_id}`;
        console.log('📂 Categories URL:', categoriesUrl);
        const categories = await fetchCategories(appContext.shop_owner_id);
        console.log('✅ Step 1 complete: Categories loaded:', categories.length);
        renderCategories(categories);
        
        // Загружаем товары для магазина (shop_owner_id)
        console.log('📦 Step 2: Fetching products...');
        const productsUrl = `${API_BASE}/api/products/?user_id=${appContext.shop_owner_id}`;
        console.log('📦 Products URL:', productsUrl);
        const products = await fetchProducts(appContext.shop_owner_id, currentCategoryId);
        console.log('✅ Step 2 complete: Products loaded:', products.length);
        renderProducts(products);
        
        // Отслеживаем общее посещение магазина (только для клиентов, не для владельца)
        if (appContext && appContext.role === 'client' && appContext.shop_owner_id) {
            trackShopVisit(appContext.shop_owner_id).catch(err => {
                console.warn('Failed to track shop visit:', err);
            });
        }
        
        // Обновляем корзину
        console.log('🛒 Step 3: Updating cart...');
        await updateCartUI();
        console.log('✅ Step 3 complete: Cart updated');
        
        console.log('✅✅✅ loadData() completed successfully!');
    } catch (e) {
        console.error("❌❌❌ Load Error:", e);
        console.error("❌ Error details:", {
            message: e.message,
            stack: e.stack,
            name: e.name
        });
        productsGrid.innerHTML = '<p class="loading">Ошибка загрузки: ' + e.message + '</p>';
    }
}

// Рендеринг категорий
function renderCategories(categories) {
    categoriesNav.innerHTML = '';
    
    const allBadge = document.createElement('div');
    allBadge.className = 'category-badge ' + (currentCategoryId === null ? 'active' : '');
    allBadge.innerText = 'Все';
    allBadge.onclick = () => { 
        currentCategoryId = null; 
        loadData(); 
    };
    categoriesNav.appendChild(allBadge);

    if (Array.isArray(categories)) {
        categories.forEach(cat => {
            const badge = document.createElement('div');
            badge.className = 'category-badge ' + (currentCategoryId === cat.id ? 'active' : '');
            badge.innerText = cat.name;
            badge.onclick = () => { 
                currentCategoryId = cat.id; 
                loadData(); 
            };
            categoriesNav.appendChild(badge);
        });
    }
}

// Рендеринг товаров
function renderProducts(products) {
    productsGrid.innerHTML = '';
    
    if (!products || products.length === 0) {
        if (appContext.role === 'client') {
            productsGrid.innerHTML = '<p class="loading">В этой витрине пока нет товаров.</p>';
        } else {
            productsGrid.innerHTML = '<p class="loading">Товаров пока нет. Используйте /manage в боте для добавления.</p>';
        }
        return;
    }

    products.forEach(prod => {
        const finalPrice = prod.discount > 0 ? Math.round(prod.price * (1 - prod.discount / 100)) : prod.price;
        
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
        
        // Создаем badge количества товара
        let quantityBadge = null;
        if (prod.quantity !== undefined && prod.quantity !== null) {
            quantityBadge = document.createElement('div');
            quantityBadge.className = 'product-quantity-badge';
            const quantity = prod.quantity;
            if (quantity > 0) {
                quantityBadge.textContent = `В наличии: ${quantity}`;
                quantityBadge.style.background = 'rgba(52, 199, 89, 0.95)'; // Зеленый для наличия
                quantityBadge.style.color = '#ffffff';
            } else {
                quantityBadge.textContent = 'Нет в наличии';
                quantityBadge.style.background = 'rgba(255, 59, 48, 0.95)'; // Красный для отсутствия
                quantityBadge.style.color = '#ffffff';
            }
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
        productsGrid.appendChild(card);
        
        // ДИАГНОСТИКА: Проверяем, что card в DOM
        if (prod.id) {
            console.log(`[IMG DEBUG] Product ${prod.id}: card added to productsGrid, in DOM: ${productsGrid.contains(card)}`);
        }
        
        if (fullImg) {
            // КРИТИЧЕСКОЕ РЕШЕНИЕ: Загружаем изображение через fetch и создаем blob URL
            // Это обходит блокировку Telegram WebView для ngrok доменов
            // Telegram WebView может блокировать прямые запросы к ngrok доменам через <img src>
            // Но fetch запросы работают, поэтому мы загружаем через fetch и создаем blob URL
            
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
            
            // Загружаем изображение через fetch для обхода блокировки Telegram WebView
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
                    console.log(`[IMG DEBUG] Product ${prod.id}: Image loaded via fetch, blob URL created: ${blobUrl.substring(0, 50)}...`);
                }
                
                // Создаем img элемент и устанавливаем blob URL
                const img = document.createElement('img');
                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block;';
                img.alt = prod.name;
                
                img.onload = function() {
                    // Изображение загружено успешно
                    if (prod.id) {
                        console.log(`[IMG DEBUG] Product ${prod.id}: IMAGE LOADED SUCCESSFULLY via blob URL`);
                    }
                    // Удаляем placeholder
                    if (loadingPlaceholder.parentNode) {
                        loadingPlaceholder.remove();
                    }
                };
                
                img.onerror = function() {
                    // Ошибка загрузки изображения
                    if (prod.id) {
                        console.error(`[IMG DEBUG] Product ${prod.id}: IMAGE LOAD ERROR - blob URL failed`);
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
                
                // Сохраняем blob URL для последующей очистки (опционально)
                // Можно добавить очистку при удалении карточки
            })
            .catch(error => {
                if (prod.id) {
                    console.error(`[IMG DEBUG] Product ${prod.id}: Fetch error:`, error);
                    console.error(`[IMG DEBUG] Product ${prod.id}: Failed URL: "${fullImg}"`);
                }
                showError();
            });
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
        
        // Цена
        const priceContainer = document.createElement('div');
        priceContainer.className = 'product-price-container';
        const priceSpan = document.createElement('span');
        priceSpan.className = 'product-price';
        priceSpan.textContent = `${finalPrice} ₽`;
        priceContainer.appendChild(priceSpan);
        
        if (prod.discount > 0) {
            const oldPriceSpan = document.createElement('span');
            oldPriceSpan.className = 'old-price';
            oldPriceSpan.textContent = `${prod.price} ₽`;
            priceContainer.appendChild(oldPriceSpan);
        }
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
        
        card.onclick = () => showProductModal(prod, finalPrice, fullImages);
        
        // card уже добавлен в DOM выше (перед установкой img.src)
    });
}

// Показ модального окна товара
function showProductModal(prod, finalPrice, fullImages) {
    currentProduct = prod;
    currentImages = fullImages;
    currentImageIndex = 0;
    
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
                setTimeout(() => {
                    loadData();
                }, 300);
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
    
    // Кнопка редактирования (только для владельца)
    const modalEditControl = document.getElementById('modal-edit-control');
    if (!modalEditControl) {
        // Создаем контейнер для кнопки редактирования, если его еще нет
        const editControlDiv = document.createElement('div');
        editControlDiv.id = 'modal-edit-control';
        editControlDiv.style.cssText = 'margin: 12px 0;';
        const modalContent = document.querySelector('#product-modal .modal-content');
        const modalName = document.getElementById('modal-name');
        modalContent.insertBefore(editControlDiv, modalName);
    }
    
    const editControl = document.getElementById('modal-edit-control');
    editControl.innerHTML = '';
    
    if (appContext && appContext.role === 'owner' && prod.user_id === appContext.shop_owner_id) {
        const editBtn = document.createElement('button');
        editBtn.className = 'reserve-btn';
        editBtn.style.cssText = 'width: 100%; background: var(--tg-theme-button-color, #3390ec); color: var(--tg-theme-button-text-color, #ffffff);';
        editBtn.textContent = '✏️ Редактировать товар';
        editBtn.onclick = () => showEditProductModal(prod);
        editControl.appendChild(editBtn);
        editControl.style.display = 'block';
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
    priceSpan.textContent = `${finalPrice} ₽`;
    modalPriceContainer.appendChild(priceSpan);
    
    if (prod.discount > 0) {
        const oldPriceSpan = document.createElement('span');
        oldPriceSpan.className = 'old-price';
        oldPriceSpan.textContent = `${prod.price} ₽`;
        modalPriceContainer.appendChild(oldPriceSpan);
    }
    
    // Количество товара в модальном окне
    const modalQuantityDiv = document.getElementById('modal-quantity');
    if (modalQuantityDiv) {
        if (prod.quantity !== undefined && prod.quantity !== null) {
            modalQuantityDiv.style.display = 'block';
            modalQuantityDiv.textContent = `📦 В наличии: ${prod.quantity} шт.`;
        } else {
            modalQuantityDiv.style.display = 'none';
        }
    }
    
    // Резервация
    const modalReservationButton = document.getElementById('modal-reservation-button');
    const modalReservationStatus = document.getElementById('modal-reservation-status');
    modalReservationButton.innerHTML = '';
    modalReservationStatus.style.display = 'none';
    
    // Используем контекст для определения прав (backend уже проверил все)
    const hasActiveReservation = prod.reservation && prod.reservation.reserved_until;
    const activeReservationsCount = prod.reservation && prod.reservation.active_count ? prod.reservation.active_count : 0;
    const productQuantity = prod.quantity !== undefined && prod.quantity !== null ? prod.quantity : 0;
    
    // Проверяем, можно ли еще резервировать товар (для товаров с quantity > 1)
    const canStillReserve = productQuantity > 0 && activeReservationsCount < productQuantity;
    
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
        
        // Показываем информацию о резервации с учетом количества
        if (productQuantity > 1 && activeReservationsCount > 0) {
            const availableCount = productQuantity - activeReservationsCount;
            modalReservationStatus.textContent = `⏰ Зарезервировано: ${activeReservationsCount} из ${productQuantity} шт. (доступно: ${availableCount} шт.) до ${timeText}`;
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
            cancelBtn.textContent = '❌ Снять резервацию';
            cancelBtn.onclick = () => cancelReservation(prod.reservation.id, prod.id);
            modalReservationButton.appendChild(cancelBtn);
        }
    }
    
    // Показываем кнопку резервации только если:
    // 1. Это не наш магазин (клиент)
    // 2. Нет активной резервации ИЛИ можно еще резервировать (для товаров с quantity > 1)
    // 3. Резервация включена в настройках магазина
    const shopSettings = getCurrentShopSettings();
    const reservationsEnabled = shopSettings ? shopSettings.reservations_enabled : true; // По умолчанию включено
    
    console.log('🔒 Reservation check:', {
        hasActiveReservation,
        activeReservationsCount,
        productQuantity,
        canStillReserve,
        role: appContext.role,
        can_reserve: appContext.permissions.can_reserve,
        reservationsEnabled
    });
    
    // Показываем кнопку резервации, если:
    // - Нет активной резервации ИЛИ
    // - Есть активная резервация, но можно еще резервировать (quantity > active_count)
    const shouldShowReserveButton = (!hasActiveReservation || canStillReserve) && 
                                     appContext.role === 'client' && 
                                     appContext.permissions.can_reserve && 
                                     reservationsEnabled;
    
    if (shouldShowReserveButton) {
        const reserveBtn = document.createElement('button');
        reserveBtn.className = 'reserve-btn';
        reserveBtn.textContent = '🔒 Зарезервировать товар';
        reserveBtn.onclick = () => showReservationModal(prod.id);
        modalReservationButton.appendChild(reserveBtn);
    } else if (!reservationsEnabled) {
        console.log('🔒 Reservations disabled - button not shown');
    }
    
    showModalImage(0);
    modal.style.display = 'block';
}

// Показ модального окна резервации
function showReservationModal(productId) {
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    reservationModal.style.display = 'block';
    const options = document.querySelectorAll('.reservation-option');
    options.forEach(option => {
        option.onclick = async () => {
            const hours = parseInt(option.dataset.hours);
            reservationModal.style.display = 'none';
            await createReservation(productId, hours);
        };
    });
}

// Создание резервации
async function createReservation(productId, hours) {
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // reserved_by_user_id определяется на backend из initData
        const reservation = await createReservationAPI(productId, hours);
        
        alert(`✅ Товар зарезервирован на ${hours} ${hours === 1 ? 'час' : hours === 2 ? 'часа' : 'часов'}`);
        
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Обновляем данные и корзину
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Reservation error:', e);
        alert(`❌ Ошибка при резервации: ${e.message}`);
    }
}

// Отмена резервации
async function cancelReservation(reservationId, productId) {
    if (!confirm('Вы уверены, что хотите снять резервацию с этого товара?')) {
        return;
    }
    
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // user_id определяется на backend из initData
        await cancelReservationAPI(reservationId);
        alert('✅ Резервация снята');
        
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        setTimeout(async () => {
            await loadData();
            await updateCartUI();
        }, 500);
    } catch (e) {
        console.error('Cancel reservation error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Показ модального окна редактирования товара
function showEditProductModal(prod) {
    const editProductModal = document.getElementById('edit-product-modal');
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    const editPriceInput = document.getElementById('edit-price');
    const editDiscountInput = document.getElementById('edit-discount');
    const editQuantityInput = document.getElementById('edit-quantity');
    
    // Заполняем поля текущими значениями
    editNameInput.value = prod.name || '';
    editDescriptionInput.value = prod.description || '';
    editPriceInput.value = prod.price || '';
    editDiscountInput.value = prod.discount || 0;
    editQuantityInput.value = prod.quantity !== undefined && prod.quantity !== null ? prod.quantity : 0;
    
    // Показываем модальное окно
    editProductModal.style.display = 'block';
    
    // Обработчик сохранения
    const saveBtn = document.getElementById('edit-product-save');
    const cancelBtn = document.getElementById('edit-product-cancel');
    
    // Удаляем старые обработчики, если есть
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Добавляем новые обработчики
    newSaveBtn.onclick = async () => {
        await saveProductEdit(prod.id);
    };
    
    newCancelBtn.onclick = () => {
        editProductModal.style.display = 'none';
    };
}

// Сохранение изменений товара
async function saveProductEdit(productId) {
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    const editPriceInput = document.getElementById('edit-price');
    const editDiscountInput = document.getElementById('edit-discount');
    const editQuantityInput = document.getElementById('edit-quantity');
    
    const newName = editNameInput.value.trim();
    const newDescription = editDescriptionInput.value.trim();
    const newPrice = parseFloat(editPriceInput.value);
    const newDiscount = parseFloat(editDiscountInput.value);
    const newQuantity = parseInt(editQuantityInput.value, 10);
    
    // Валидация
    if (!newName || newName.length === 0) {
        alert('❌ Введите название товара');
        return;
    }
    
    if (isNaN(newPrice) || newPrice <= 0) {
        alert('❌ Введите корректную цену (больше 0)');
        return;
    }
    
    if (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100) {
        alert('❌ Введите корректную скидку (от 0 до 100%)');
        return;
    }
    
    if (isNaN(newQuantity) || newQuantity < 0) {
        alert('❌ Введите корректное количество (0 или больше)');
        return;
    }
    
    try {
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Обновляем название и описание (без уведомлений)
        await updateProductNameDescriptionAPI(productId, appContext.shop_owner_id, newName, newDescription || null);
        
        // Обновляем цену и скидку (с уведомлениями)
        await updateProductAPI(productId, appContext.shop_owner_id, newPrice, newDiscount);
        
        // Обновляем количество (без уведомлений)
        await updateProductQuantityAPI(productId, appContext.shop_owner_id, newQuantity);
        
        // Закрываем модальное окно редактирования
        const editProductModal = document.getElementById('edit-product-modal');
        editProductModal.style.display = 'none';
        
        // Закрываем модальное окно товара
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Показываем уведомление
        alert('✅ Товар обновлен!');
        
        // Обновляем данные
        setTimeout(async () => {
            await loadData();
        }, 500);
    } catch (e) {
        console.error('Save product edit error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Показ изображения в модальном окне
function showModalImage(index) {
    const modalImage = document.getElementById('modal-image');
    
    if (currentImages.length === 0) {
        modalImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
        modalImage.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
        return;
    }
    
    if (index < 0 || index >= currentImages.length) return;
    
    currentImageIndex = index;
    const fullImg = currentImages[index];
    
    // Очищаем содержимое, но сохраняем структуру для навигации
    const oldContainer = modalImage.querySelector('.image-container');
    if (oldContainer) {
        oldContainer.remove();
    }
    
    // Очищаем предыдущий blob URL если был
    const oldBlobUrl = modalImage.dataset.blobUrl;
    if (oldBlobUrl) {
        URL.revokeObjectURL(oldBlobUrl);
        delete modalImage.dataset.blobUrl;
    }
    
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    imageContainer.style.cssText = 'position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;';
    imageContainer.innerHTML = '<div style="color: var(--tg-theme-hint-color); font-size: 48px;">⏳</div>';
    modalImage.style.backgroundColor = 'var(--tg-theme-secondary-bg-color)';
    modalImage.appendChild(imageContainer);
    
    // Загружаем изображение через fetch для обхода блокировки Telegram WebView
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
        modalImage.dataset.blobUrl = blobUrl; // Сохраняем для последующей очистки
        
        const img = document.createElement('img');
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 12px; display: block;';
        img.alt = currentProduct ? currentProduct.name : 'Product';
        
        img.onload = () => {
            imageContainer.innerHTML = '';
            imageContainer.appendChild(img);
            modalImage.style.backgroundColor = 'transparent';
            
            // Добавляем навигацию по фото, если их больше одного
            if (currentImages.length > 1) {
                updateImageNavigation();
            }
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            delete modalImage.dataset.blobUrl;
            imageContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
        };
        
        img.src = blobUrl;
    })
    .catch(error => {
        console.error('[MODAL IMG] Fetch error:', error);
        console.error('[MODAL IMG] Failed URL:', fullImg);
        imageContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-theme-hint-color); font-size: 48px;">📷</div>';
    });
}

// Обновление навигации по фото
function updateImageNavigation() {
    const modalImage = document.getElementById('modal-image');
    
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
    if (currentImageIndex > 0) {
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
            showModalImage(currentImageIndex - 1);
        };
        navContainer.appendChild(prevBtn);
    }
    
    // Индикатор фото в стиле Liquid Glass
    const indicator = document.createElement('div');
    indicator.textContent = `${currentImageIndex + 1}/${currentImages.length}`;
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
    if (currentImageIndex < currentImages.length - 1) {
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
            showModalImage(currentImageIndex + 1);
        };
        navContainer.appendChild(nextBtn);
    }
    
    modalImage.appendChild(navContainer);
    
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
            if (diff > 0 && currentImageIndex < currentImages.length - 1) {
                // Свайп влево - следующее фото
                showModalImage(currentImageIndex + 1);
            } else if (diff < 0 && currentImageIndex > 0) {
                // Свайп вправо - предыдущее фото
                showModalImage(currentImageIndex - 1);
            }
        }
    }
}

// Настройка модальных окон
function setupModals() {
    // Закрытие модального окна товара
    modalClose.onclick = () => {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };
    
    // Закрытие модального окна резервации
    if (reservationClose) {
        reservationClose.onclick = () => {
            reservationModal.style.display = 'none';
        };
    }
    
    reservationModal.onclick = (e) => {
        if (e.target === reservationModal) {
            reservationModal.style.display = 'none';
        }
    };
    
    // Закрытие модального окна редактирования товара
    const editProductModal = document.getElementById('edit-product-modal');
    const editProductClose = document.querySelector('.edit-product-close');
    if (editProductClose) {
        editProductClose.onclick = () => {
            editProductModal.style.display = 'none';
        };
    }
    
    if (editProductModal) {
        editProductModal.onclick = (e) => {
            if (e.target === editProductModal) {
                editProductModal.style.display = 'none';
            }
        };
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal.style.display === 'block') {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            if (reservationModal.style.display === 'block') {
                reservationModal.style.display = 'none';
            }
            const cartModal = document.getElementById('cart-modal');
            if (cartModal && cartModal.style.display === 'block') {
                cartModal.style.display = 'none';
            }
            const adminModal = document.getElementById('admin-modal');
            if (adminModal && adminModal.style.display === 'block') {
                adminModal.style.display = 'none';
            }
            if (editProductModal && editProductModal.style.display === 'block') {
                editProductModal.style.display = 'none';
            }
        }
    });
}

// Настройка кнопки админки
function setupAdminButton() {
    const adminButton = document.getElementById('admin-button');
    if (adminButton) {
        adminButton.style.display = 'block';
        adminButton.onclick = () => {
            openAdmin();
        };
        console.log('✅ Admin button set up');
    } else {
        console.error('❌ Admin button not found');
    }
}

// Глобальная функция для отмены резервации из корзины
window.cancelReservationFromCart = async function(reservationId, productId) {
    await cancelReservation(reservationId, productId);
    loadCart();
    await updateCartUI();
};
