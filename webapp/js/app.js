// Главный файл приложения - инициализация и координация модулей
import { getCurrentShopSettings, initAdmin, loadShopSettings, openAdmin } from './admin.js';
import { API_BASE, cancelReservationAPI, createReservationAPI, fetchCategories, fetchProducts, getContext } from './api.js';
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
    
    // 5. Устанавливаем приветствие
    const tg = getTelegramInstance();
    if (appContext.role === 'client') {
        userNameElement.innerText = "🛍️ Магазин";
    } else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userNameElement.innerText = "Привет, " + tg.initDataUnsafe.user.first_name + "!";
    } else {
        userNameElement.innerText = "Прайс";
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
        
        // Бейдж резервации
        if (prod.reservation) {
            card.style.opacity = '0.7';
            card.style.position = 'relative';
            const reservedBadge = document.createElement('div');
            reservedBadge.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                background: rgba(255, 193, 7, 0.9);
                backdrop-filter: blur(10px);
                color: #1a1a1a;
                padding: 4px 10px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 700;
                z-index: 10;
            `;
            reservedBadge.textContent = '🔒 ЗАРЕЗЕРВИРОВАН';
            card.appendChild(reservedBadge);
        }
        
        // Изображение
        const imageDiv = document.createElement('div');
        imageDiv.className = 'product-image';
        imageDiv.style.position = 'relative';
        imageDiv.style.overflow = 'hidden';
        
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
        card.onclick = () => showProductModal(prod, finalPrice, fullImages);
        
        // card уже добавлен в DOM выше (перед установкой img.src)
    });
}

// Показ модального окна товара
function showProductModal(prod, finalPrice, fullImages) {
    currentProduct = prod;
    currentImages = fullImages;
    currentImageIndex = 0;
    
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
    
    // Резервация
    const modalReservationButton = document.getElementById('modal-reservation-button');
    const modalReservationStatus = document.getElementById('modal-reservation-status');
    modalReservationButton.innerHTML = '';
    modalReservationStatus.style.display = 'none';
    
    // Используем контекст для определения прав (backend уже проверил все)
    const hasActiveReservation = prod.reservation && prod.reservation.reserved_until;
    
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
        modalReservationStatus.textContent = `⏰ Товар зарезервирован на ${timeText}`;
        
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
    // 2. Нет активной резервации
    // 3. Резервация включена в настройках магазина
    const shopSettings = getCurrentShopSettings();
    const reservationsEnabled = shopSettings ? shopSettings.reservations_enabled : true; // По умолчанию включено
    
    console.log('🔒 Reservation check:', {
        hasActiveReservation,
        role: appContext.role,
        can_reserve: appContext.permissions.can_reserve,
        reservationsEnabled
    });
    
    if (!hasActiveReservation && appContext.role === 'client' && appContext.permissions.can_reserve && reservationsEnabled) {
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
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        align-items: center;
        z-index: 100;
    `;
    
    // Кнопка "Назад"
    if (currentImageIndex > 0) {
        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '◀';
        prevBtn.style.cssText = `
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(10px);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            showModalImage(currentImageIndex - 1);
        };
        navContainer.appendChild(prevBtn);
    }
    
    // Индикатор фото (1/5, 2/5 и т.д.)
    const indicator = document.createElement('div');
    indicator.textContent = `${currentImageIndex + 1}/${currentImages.length}`;
    indicator.style.cssText = `
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(10px);
        color: white;
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 600;
    `;
    navContainer.appendChild(indicator);
    
    // Кнопка "Вперед"
    if (currentImageIndex < currentImages.length - 1) {
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '▶';
        nextBtn.style.cssText = `
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(10px);
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
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
