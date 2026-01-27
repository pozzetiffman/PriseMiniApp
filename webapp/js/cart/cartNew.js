// Новая корзина (в разработке)
// Старая корзина отключена, но сохранена для возможности восстановления

import { API_BASE, fetchProducts } from '../api.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';
import {
    addToCart,
    deselectAllCartItems,
    getCartItems,
    getCartItemsCount,
    getSelectedCartItemsCount,
    getSelectedCartTotal,
    getSelectedCartTotalOriginal,
    loadCartFromStorage,
    removeSelectedCartItems,
    selectAllCartItems,
    syncCartFromServer,
    toggleCartItemSelection,
    updateCartItemQuantity,
    updateCartProductsFromAPI
} from './cartStore.js';

/**
 * Форматирование числа с разделителем тысяч (пробел)
 */
function formatPrice(price) {
    return price.toLocaleString('ru-RU');
}

// Загружаем корзину из localStorage при загрузке модуля (как fallback)
// Основная синхронизация будет происходить через syncCartFromServer при открытии корзины
loadCartFromStorage();

/**
 * Экранирование HTML для безопасности
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Инициализация новой корзины
 * Настраивает обработчики для кнопки "Назад" и других элементов
 */
export function initCartNew() {
    console.log('[CART NEW] Initializing new cart...');
    
    // Настраиваем кнопку закрытия в верхнем меню
    const cartPageNewClose = document.getElementById('cart-page-new-close');
    if (cartPageNewClose) {
        cartPageNewClose.onclick = () => {
            closeCartPageNew();
        };
        console.log('[CART NEW] ✅ Close button initialized');
    } else {
        console.warn('[CART NEW] ⚠️ Close button not found');
    }
    
    // Настраиваем кнопку "Выбрать все" в верхнем меню
    const topSelectAllCheckbox = document.getElementById('cart-top-select-all');
    if (topSelectAllCheckbox) {
        topSelectAllCheckbox.addEventListener('change', async (e) => {
            try {
                if (e.target.checked) {
                    await selectAllCartItems();
                } else {
                    await deselectAllCartItems();
                }
                renderCart();
            } catch (error) {
                console.error('[CART NEW] Error toggling select all:', error);
            }
        });
    }
    
    // Настраиваем кнопку "Удалить выбранные" в верхнем меню
    const topDeleteSelectedBtn = document.getElementById('cart-top-delete-selected');
    if (topDeleteSelectedBtn) {
        topDeleteSelectedBtn.addEventListener('click', async () => {
            if (confirm('Удалить выбранные товары из корзины?')) {
                try {
                    await removeSelectedCartItems();
                    renderCart();
                } catch (error) {
                    console.error('[CART NEW] Error removing selected items:', error);
                }
            }
        });
    }
    
    // Настраиваем промокод (теперь в блоке summary)
    const applyPromoBtn = document.getElementById('cart-apply-promo');
    const promoInput = document.getElementById('cart-promo-code');
    
    // Функция для применения промокода
    const applyPromo = () => {
        if (promoInput) {
            const promoCode = promoInput.value.trim();
            if (promoCode) {
                // TODO: Применить промокод
                alert('Промокод будет применен позже');
                // После применения промокода обновляем summary
                updateCartSummary();
            }
        }
    };
    
    if (applyPromoBtn) {
        applyPromoBtn.addEventListener('click', applyPromo);
    }
    
    // Обработчик Enter для поля промокода (кнопка "Готово" на клавиатуре)
    if (promoInput) {
        promoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault(); // Предотвращаем отправку формы, если есть
                applyPromo();
                promoInput.blur(); // Убираем фокус с поля, чтобы скрыть клавиатуру
            }
        });
    }
    
    // Настраиваем кнопку оформления заказа
    const checkoutBtn = document.getElementById('cart-new-checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            // TODO: Оформление заказа
            alert('Оформление заказа будет реализовано позже');
        });
    }
}

/**
 * Обновить данные товаров в корзине из API
 */
async function refreshCartProducts() {
    try {
        // Получаем контекст приложения для shopOwnerId и botId
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext) {
            console.warn('[CART NEW] ⚠️ App context not available, skipping product refresh');
            return;
        }
        
        const shopOwnerId = appContext.shop_owner_id;
        const botId = appContext.bot_id || null;
        const viewerId = appContext.viewer_id || null;
        
        if (!shopOwnerId) {
            console.warn('[CART NEW] ⚠️ shopOwnerId not available, skipping product refresh');
            return;
        }
        
        console.log('[CART NEW] 🔄 Refreshing cart products from API...', { shopOwnerId, botId, viewerId });
        
        // Получаем актуальные товары из API
        const freshProducts = await fetchProducts(shopOwnerId, null, botId, viewerId);
        
        if (!Array.isArray(freshProducts)) {
            console.warn('[CART NEW] ⚠️ Invalid products response from API');
            return;
        }
        
        console.log(`[CART NEW] ✅ Fetched ${freshProducts.length} products from API`);
        
        // Обновляем товары в корзине
        updateCartProductsFromAPI(freshProducts);
        
        console.log('[CART NEW] ✅ Cart products refreshed');
    } catch (error) {
        console.error('[CART NEW] ❌ Error refreshing cart products:', error);
        // Не блокируем отображение корзины при ошибке обновления
    }
}

/**
 * Открытие новой страницы корзины
 * Скрывает другие страницы и показывает новую корзину
 */
export async function openCartPageNew() {
    console.log('[CART NEW] Opening new cart page...');
    
    const cartPageNew = document.getElementById('cart-page-new');
    const mainContent = document.getElementById('main-content');
    const productPage = document.getElementById('product-page');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPageOld = document.getElementById('cart-page'); // Старая корзина
    
    if (cartPageNew) {
        // Скрываем все другие страницы
        if (mainContent) mainContent.style.display = 'none';
        if (productPage) productPage.style.display = 'none';
        if (favoritesPage) favoritesPage.style.display = 'none';
        if (cartPageOld) cartPageOld.style.display = 'none'; // Убеждаемся, что старая корзина скрыта
        
        // Показываем новую страницу корзины
        cartPageNew.style.display = 'block';
        
        // Синхронизируем корзину с сервером (это загрузит актуальные данные)
        try {
            await syncCartFromServer();
            // Обновляем счетчик после синхронизации
            updateCartButtonCount();
        } catch (error) {
            console.error('[CART NEW] ⚠️ Error syncing cart from server, using local data:', error);
        }
        
        // Обновляем данные товаров из API перед рендерингом (для актуальных цен и названий)
        await refreshCartProducts();
        
        // Рендерим корзину
        renderCart();
        
        console.log('[CART NEW] ✅ Cart page opened');
    } else {
        console.error('[CART NEW] ❌ Cart page not found');
    }
}

/**
 * Рендеринг корзины
 */
export function renderCart() {
    const cartItemsContainer = document.getElementById('cart-new-items');
    const cartFooter = document.getElementById('cart-new-footer');
    const cartSummary = document.getElementById('cart-new-summary');
    
    if (!cartItemsContainer) {
        console.error('[CART NEW] ❌ Cart items container not found');
        return;
    }
    
    const items = getCartItems();
    
    // Показываем/скрываем элементы управления
    if (items.length > 0) {
        if (cartFooter) cartFooter.style.display = 'flex';
        if (cartSummary) cartSummary.style.display = 'block';
        
        // Показываем кнопку удаления в верхнем меню
        const topDeleteBtn = document.getElementById('cart-top-delete-selected');
        if (topDeleteBtn) {
            const hasSelected = items.some(item => item.selected);
            topDeleteBtn.style.display = hasSelected ? 'flex' : 'none';
        }
        
        // Обновляем чекбокс "Выбрать все" в верхнем меню
        const topSelectAllCheckbox = document.getElementById('cart-top-select-all');
        if (topSelectAllCheckbox) {
            const allSelected = items.every(item => item.selected);
            topSelectAllCheckbox.checked = allSelected;
        }
        
        
        // Рендерим товары
        cartItemsContainer.innerHTML = '';
        items.forEach(item => {
            const cartItemCard = createCartItemCard(item);
            cartItemsContainer.appendChild(cartItemCard);
        });
    } else {
        if (cartFooter) cartFooter.style.display = 'none';
        if (cartSummary) cartSummary.style.display = 'none';
        cartItemsContainer.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-hint, #999);">
                <p style="font-size: 18px; margin-bottom: 8px;">🛒</p>
                <p>Корзина пуста</p>
            </div>
        `;
    }
    
    // Обновляем футер и блок итогов
    updateCartFooter();
    updateCartSummary();
    
    // Обновляем счетчик в верхнем меню
    updateCartTopMenuCount();
}

/**
 * Создание карточки товара в корзине
 */
function createCartItemCard(item) {
    const { product, quantity, selected } = item;
    
    // Логируем информацию о товаре для отладки
    console.log(`[CART NEW] Creating card for product ${product.id}:`, {
        name: product.name,
        hasDescription: !!product.description,
        description: product.description,
        descriptionType: typeof product.description,
        descriptionLength: product.description ? product.description.length : 0
    });
    
    // Получаем изображение
    let imageUrl = '';
    if (product.images_urls && Array.isArray(product.images_urls) && product.images_urls.length > 0) {
        imageUrl = product.images_urls[0];
    } else if (product.image_url) {
        imageUrl = product.image_url;
    }
    
    // Формируем полный URL изображения
    if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = imageUrl.startsWith('/') ? API_BASE + imageUrl : API_BASE + '/' + imageUrl;
    }
    
    // Получаем цену
    const priceDisplay = getProductPriceDisplay(product);
    
    // Вычисляем исходную цену (до скидки)
    let originalPrice = 0;
    if (product.price_fixed !== null && product.price_fixed !== undefined) {
        originalPrice = product.price_fixed;
    } else if (product.price_from !== null && product.price_from !== undefined) {
        originalPrice = product.price_from;
    } else if (product.price !== null && product.price !== undefined) {
        originalPrice = product.price;
    }
    
    // Вычисляем итоговую цену с учетом скидки
    let finalPrice = originalPrice;
    if (product.discount > 0) {
        finalPrice = Math.round(originalPrice * (1 - product.discount / 100));
    }
    
    const totalOriginalPrice = originalPrice * quantity;
    const totalPrice = finalPrice * quantity;
    const hasDiscount = product.discount > 0 && finalPrice < originalPrice;
    
    // Получаем описание товара (до 30 символов)
    // ВАЖНО: Проверяем описание напрямую из объекта product
    let description = '';
    const rawDescription = product.description;
    
    console.log(`[CART NEW DEBUG] Processing description for product ${product.id}:`, {
        rawDescription: rawDescription,
        descriptionType: typeof rawDescription,
        isNull: rawDescription === null,
        isUndefined: rawDescription === undefined,
        isEmptyString: rawDescription === '',
        hasValue: !!rawDescription,
        productKeys: Object.keys(product),
        productDescription: product.description,
        fullProduct: JSON.stringify(product).substring(0, 500) // Первые 500 символов для отладки
    });
    
    // Обрабатываем описание - проверяем все возможные варианты
    // Обрезаем до 35 символов (17 в первой строке, 18 во второй)
    if (rawDescription !== null && rawDescription !== undefined && String(rawDescription).trim()) {
        const desc = String(rawDescription).trim();
        description = desc.length > 35 
            ? desc.substring(0, 35) + '...' 
            : desc;
        console.log(`[CART NEW] ✅ Product ${product.id} description processed: "${description}" (original length: ${rawDescription.length})`);
    } else {
        console.log(`[CART NEW] ❌ Product ${product.id} has no description or empty:`, {
            hasDescription: !!rawDescription,
            descriptionValue: rawDescription,
            descriptionType: typeof rawDescription,
            isNull: rawDescription === null,
            isUndefined: rawDescription === undefined,
            stringValue: String(rawDescription)
        });
    }
    
    const card = document.createElement('div');
    card.className = 'cart-item-card';
    card.dataset.productId = product.id;
    
    // Логируем финальное значение description перед вставкой в HTML
    console.log(`[CART NEW FINAL] Product ${product.id} - Final description value:`, {
        description: description,
        descriptionLength: description.length,
        willBeRendered: !!description
    });
    
    card.innerHTML = `
        <div class="cart-item-checkbox-container">
            <input type="checkbox" class="cart-item-checkbox" ${selected ? 'checked' : ''} data-product-id="${product.id}">
        </div>
        <div class="cart-item-image-container">
            <img src="${imageUrl || ''}" alt="${product.name}" class="cart-item-image" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-glass);color:var(--text-hint);font-size:24px;\\'>📷</div>';">
            <button class="cart-item-favorite-btn" data-product-id="${product.id}" aria-label="Добавить в избранное">
                <svg viewBox="0 0 24 24" class="cart-favorite-heart" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </button>
        </div>
        <div class="cart-item-info">
            <div class="cart-item-name">${product.name}</div>
            ${description ? `<div class="cart-item-description">${escapeHtml(description)}</div>` : ''}
            <div class="cart-item-price-container">
                <div class="cart-item-total-price">${formatPrice(totalPrice)}₽</div>
                ${hasDiscount ? `<div class="cart-item-old-price">${formatPrice(totalOriginalPrice)}₽</div>` : ''}
            </div>
        </div>
        <div class="cart-item-quantity-controls">
            <button class="cart-quantity-btn cart-quantity-decrease" data-product-id="${product.id}">−</button>
            <span class="cart-quantity-value">${quantity}</span>
            <button class="cart-quantity-btn cart-quantity-increase" data-product-id="${product.id}">+</button>
        </div>
    `;
    
    // Обработчики событий
    const checkbox = card.querySelector('.cart-item-checkbox');
    checkbox.addEventListener('change', async (e) => {
        try {
            await toggleCartItemSelection(product.id);
            renderCart();
        } catch (error) {
            console.error('[CART NEW] Error toggling item selection:', error);
        }
    });
    
    // Обработчик для кнопки избранного
    const favoriteBtn = card.querySelector('.cart-item-favorite-btn');
    if (favoriteBtn) {
        // Проверяем статус избранного
        async function updateFavoriteButtonState() {
            try {
                const favoritesModule = await import('../favorites.js');
                if (favoritesModule.checkFavorite) {
                    const isFavorite = await favoritesModule.checkFavorite(product.id);
                    if (isFavorite) {
                        favoriteBtn.classList.add('favorite-active');
                    } else {
                        favoriteBtn.classList.remove('favorite-active');
                    }
                }
            } catch (e) {
                // Игнорируем ошибку, модуль необязательный
            }
        }
        
        updateFavoriteButtonState();
        
        favoriteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            try {
                const favoritesModule = await import('../favorites.js');
                if (favoritesModule.toggleFavorite) {
                    const result = await favoritesModule.toggleFavorite(product.id);
                    if (result.is_favorite) {
                        favoriteBtn.classList.add('favorite-active');
                    } else {
                        favoriteBtn.classList.remove('favorite-active');
                    }
                }
            } catch (error) {
                console.error('❌ Error toggling favorite:', error);
            }
        });
    }
    
    const decreaseBtn = card.querySelector('.cart-quantity-decrease');
    decreaseBtn.addEventListener('click', async () => {
        try {
            await updateCartItemQuantity(product.id, quantity - 1);
            renderCart();
        } catch (error) {
            console.error('[CART NEW] Error decreasing quantity:', error);
        }
    });
    
    const increaseBtn = card.querySelector('.cart-quantity-increase');
    increaseBtn.addEventListener('click', async () => {
        try {
            await updateCartItemQuantity(product.id, quantity + 1);
            renderCart();
        } catch (error) {
            console.error('[CART NEW] Error increasing quantity:', error);
        }
    });
    
    // Проверяем, что описание действительно добавлено в DOM
    const descriptionElement = card.querySelector('.cart-item-description');
    if (descriptionElement) {
        console.log(`[CART NEW] ✅ Description element found in DOM for product ${product.id}:`, {
            textContent: descriptionElement.textContent,
            innerHTML: descriptionElement.innerHTML,
            isVisible: descriptionElement.offsetHeight > 0
        });
    } else {
        console.log(`[CART NEW] ❌ Description element NOT found in DOM for product ${product.id}`);
    }
    
    return card;
}

/**
 * Обновление футера корзины
 */
function updateCartFooter() {
    const countText = document.getElementById('cart-footer-count-text');
    const totalAmount = document.getElementById('cart-footer-total-amount');
    const oldPriceElement = document.getElementById('cart-footer-old-price');
    
    const selectedCount = getSelectedCartItemsCount();
    const totalOriginal = getSelectedCartTotalOriginal();
    const total = getSelectedCartTotal();
    const hasDiscount = total < totalOriginal;
    
    if (countText) {
        countText.textContent = `${selectedCount} ${selectedCount === 1 ? 'товар' : selectedCount < 5 ? 'товара' : 'товаров'}`;
    }
    
    if (totalAmount) {
        totalAmount.textContent = `${formatPrice(total)}₽`;
    }
    
    if (oldPriceElement) {
        if (hasDiscount) {
            oldPriceElement.textContent = `${formatPrice(totalOriginal)}₽`;
            oldPriceElement.style.display = 'inline';
        } else {
            oldPriceElement.style.display = 'none';
        }
    }
}

/**
 * Обновление счетчика товаров в верхнем меню
 */
function updateCartTopMenuCount() {
    const countElement = document.getElementById('cart-top-menu-count');
    if (!countElement) return;
    
    const items = getCartItems();
    const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
    
    if (totalCount === 0) {
        countElement.textContent = '0 товаров';
    } else {
        const countText = totalCount === 1 ? 'товар' : totalCount < 5 ? 'товара' : 'товаров';
        countElement.textContent = `${totalCount} ${countText}`;
    }
}

/**
 * Обновление блока промокода и итогов
 */
function updateCartSummary() {
    const selectedCount = getSelectedCartItemsCount();
    const totalOriginal = getSelectedCartTotalOriginal();
    const total = getSelectedCartTotal();
    const hasDiscount = total < totalOriginal;
    const discountAmount = totalOriginal - total;
    
    // Количество товаров
    const countElement = document.getElementById('cart-summary-count');
    if (countElement) {
        countElement.textContent = `${selectedCount} ${selectedCount === 1 ? 'товар' : selectedCount < 5 ? 'товара' : 'товаров'}`;
    }
    
    // Общая цена без скидки
    const originalTotalElement = document.getElementById('cart-summary-original-total');
    if (originalTotalElement) {
        originalTotalElement.textContent = `${formatPrice(totalOriginal)}₽`;
    }
    
    // Выгода (скидка)
    const discountRow = document.getElementById('cart-summary-discount-row');
    const discountPercentElement = document.getElementById('cart-summary-discount-percent');
    const discountAmountElement = document.getElementById('cart-summary-discount-amount');
    
    if (hasDiscount && discountAmount > 0) {
        if (discountRow) {
            discountRow.style.display = 'flex';
        }
        
        // Вычисляем процент скидки
        const discountPercent = Math.round((discountAmount / totalOriginal) * 100);
        
        if (discountPercentElement) {
            discountPercentElement.textContent = `${discountPercent}%`;
        }
        
        if (discountAmountElement) {
            discountAmountElement.textContent = `−${formatPrice(discountAmount)}₽`;
        }
    } else {
        if (discountRow) {
            discountRow.style.display = 'none';
        }
    }
    
    // Итого: цена по карте (со скидкой)
    const totalCardElement = document.getElementById('cart-summary-total-card');
    if (totalCardElement) {
        totalCardElement.textContent = `${formatPrice(total)}₽`;
    }
}

/**
 * Добавить товар в корзину (публичная функция для использования из других модулей)
 */
export async function addProductToCart(product, quantity = 1) {
    try {
        console.log('[CART NEW] Adding product to cart:', product.id, product.name, 'quantity:', quantity);
        await addToCart(product, quantity);
        
        // Обновляем UI только если корзина открыта
        const cartPageNew = document.getElementById('cart-page-new');
        if (cartPageNew && cartPageNew.style.display !== 'none') {
            renderCart();
        }
        
        // Всегда обновляем счетчик на кнопке
        updateCartButtonCount();
        
        console.log('[CART NEW] Product added successfully');
    } catch (error) {
        console.error('[CART NEW] Error in addProductToCart:', error);
        throw error; // Пробрасываем ошибку дальше
    }
}

/**
 * Обновить счетчик на кнопке корзины
 */
export function updateCartButtonCount() {
    const cartCount = document.getElementById('cart-count');
    const cartButton = document.getElementById('cart-button');
    
    if (cartCount) {
        const count = getCartItemsCount();
        cartCount.textContent = count;
    }
    
    if (cartButton) {
        const count = getCartItemsCount();
        
        // Показываем/скрываем кнопку корзины
        cartButton.style.display = count > 0 ? '' : 'none';
        
        // Добавляем/удаляем класс для подсветки (как у избранного)
        if (count > 0) {
            cartButton.classList.add('cart-has-items');
        } else {
            cartButton.classList.remove('cart-has-items');
        }
    }
    
    // Обновляем состояние всех кнопок корзины на карточках товаров
    updateCartButtonsState();
}

/**
 * Обновить состояние всех кнопок корзины на карточках товаров
 */
export function updateCartButtonsState() {
    import('./cartStore.js').then(({ isProductInCart, getProductQuantityInCart }) => {
        const allCartButtons = document.querySelectorAll('.cart-button-card[data-product-id]');
        allCartButtons.forEach(button => {
            const productId = parseInt(button.dataset.productId);
            if (productId && !isNaN(productId)) {
                const quantity = getProductQuantityInCart(productId);
                const badge = button.querySelector('.cart-icon-badge');
                
                if (quantity > 0) {
                    button.classList.add('cart-active');
                    if (badge) {
                        badge.textContent = quantity > 99 ? '99+' : quantity.toString();
                        badge.style.display = 'flex';
                    }
                } else {
                    button.classList.remove('cart-active');
                    if (badge) {
                        badge.style.display = 'none';
                    }
                }
            }
        });
    }).catch(() => {
        // Игнорируем ошибки импорта
    });
}

/**
 * Закрытие новой страницы корзины
 * Скрывает новую корзину и показывает главный контент
 */
export function closeCartPageNew() {
    console.log('[CART NEW] Closing new cart page...');
    
    const cartPageNew = document.getElementById('cart-page-new');
    const mainContent = document.getElementById('main-content');
    const productPage = document.getElementById('product-page');
    const favoritesPage = document.getElementById('favorites-page');
    
    if (cartPageNew) {
        // Скрываем все страницы сначала
        if (productPage) productPage.style.display = 'none';
        if (favoritesPage) favoritesPage.style.display = 'none';
        cartPageNew.style.display = 'none';
        
        // Показываем главный контент
        if (mainContent) {
            mainContent.style.display = 'block';
        }
        
        console.log('[CART NEW] ✅ Cart page closed');
    }
}
