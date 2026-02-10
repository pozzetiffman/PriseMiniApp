// Новая корзина (в разработке)
// Старая корзина отключена, но сохранена для возможности восстановления

import { API_BASE, fetchProducts } from '../api.js';
import { goToMainContent, hideAllPages } from '../operationsBase.js';
import { renderProductPricesBlock } from '../utils/productCardParts.js';
import {
    addToCart,
    deselectAllCartItems,
    getAvailableQuantity,
    getCartItems,
    getCartItemsCount,
    getCartPaymentMethod,
    getSelectedCartHasAnyCash,
    getSelectedCartHasRequestPrice,
    getSelectedCartItemsCount,
    getSelectedCartItemsForCheckout,
    getSelectedCartTotal,
    getSelectedCartTotalOriginal,
    isProductSelectableInCart,
    loadCartFromStorage,
    removeSelectedCartItems,
    selectAllCartItems,
    setCartPaymentMethod,
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

/** Краткое уведомление в корзине (toast) */
async function showCartToast(message, type = 'success') {
    try {
        const { showNotification } = await import('../utils/admin_utils.js');
        showNotification(message, type, { top: 80 });
    } catch {
        if (typeof window.Telegram?.WebApp?.showPopup === 'function') {
            window.Telegram.WebApp.showPopup({ title: '', message });
        } else {
            alert(message);
        }
    }
}

/**
 * Инициализация новой корзины
 * Настраивает обработчики для кнопки "Назад" и других элементов
 */
export function initCartNew() {
    console.log('[CART NEW] Initializing new cart...');
    
    // Кнопка закрытия корзины — вешаем один раз (data-bound)
    const cartPageNewClose = document.getElementById('cart-page-new-close');
    if (cartPageNewClose && !cartPageNewClose.dataset.bound) {
        cartPageNewClose.dataset.bound = '1';
        cartPageNewClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeCartPageNew();
        });
        console.log('[CART NEW] ✅ Close button initialized');
    } else if (!cartPageNewClose) {
        console.warn('[CART NEW] ⚠️ Close button not found');
    }
    
    // Настраиваем кнопку "Выбрать все" в верхнем меню
    const topSelectAllCheckbox = document.getElementById('cart-top-select-all');
    if (topSelectAllCheckbox) {
        topSelectAllCheckbox.addEventListener('change', async (e) => {
            try {
                if (e.target.checked) {
                    const beforeOutOfStock = getCartItems().filter(i => !isProductSelectableInCart(i.product)).length;
                    await selectAllCartItems();
                    renderCart();
                    if (beforeOutOfStock > 0) {
                        showCartToast('Некоторые товары не выбраны: нет в наличии', 'error');
                    }
                } else {
                    await deselectAllCartItems();
                    renderCart();
                }
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
    
    // Кнопка «К оформлению»: start -> открыть страницу оформления сделки (шаги оплата/доставка/контакты/комментарий)
    const checkoutBtn = document.getElementById('cart-new-checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async () => {
            const items = getSelectedCartItemsForCheckout();
            if (!items || items.length === 0) {
                const { safeAlert } = await import('../telegram.js').catch(() => ({ safeAlert: (m) => alert(m) }));
                await safeAlert('Выберите товары для оформления');
                return;
            }
            try {
                const { startDealCheckoutAPI } = await import('../api/deals.js');
                const { openDealCheckoutPage } = await import('../dealCheckout.js');
                const result = await startDealCheckoutAPI({ items });
                openDealCheckoutPage(result.deal_id, {
                    total_items_count: result.total_items_count,
                    total_amount: result.total_amount,
                    currency: result.currency,
                }, { source: 'cart' });
            } catch (e) {
                console.error('Checkout start error:', e);
                const { safeAlert } = await import('../telegram.js').catch(() => ({ safeAlert: (m) => alert(m) }));
                await safeAlert('Ошибка: ' + (e.message || 'не удалось начать оформление'));
            }
        });
    }

    // Выбор способа оплаты для итога: клик по строке "По карте" / "Наличными"
    const summaryBlock = document.getElementById('cart-new-summary');
    if (summaryBlock) {
        summaryBlock.addEventListener('click', (e) => {
            const row = e.target.closest('.cart-payment-choice');
            if (!row) return;
            const method = row.dataset.payment === 'cash' ? 'cash' : null;
            setCartPaymentMethod(method);
            summaryBlock.querySelectorAll('.cart-payment-choice').forEach(el => el.classList.remove('cart-payment-selected'));
            row.classList.add('cart-payment-selected');
            updateCartSummary();
        });
        summaryBlock.addEventListener('keydown', (e) => {
            const row = e.target.closest('.cart-payment-choice');
            if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            row.click();
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
    if (!cartPageNew) {
        console.error('[CART NEW] ❌ Cart page not found');
        return;
    }
    
    // Единый способ: скрыть все страницы, затем показать корзину
    hideAllPages();
    cartPageNew.classList.add('is-active');
    cartPageNew.style.display = 'block';
    
    // Синхронизируем корзину с сервером (это загрузит актуальные данные)
    try {
        await syncCartFromServer();
        updateCartButtonCount();
    } catch (error) {
        console.error('[CART NEW] ⚠️ Error syncing cart from server, using local data:', error);
    }
    
    await refreshCartProducts();
    renderCart();
    console.log('[CART NEW] ✅ Cart page opened');
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
        
        // Обновляем чекбокс "Выбрать все" — только для товаров в наличии
        const topSelectAllCheckbox = document.getElementById('cart-top-select-all');
        if (topSelectAllCheckbox) {
            const selectableItems = items.filter(item => isProductSelectableInCart(item.product));
            const allSelected = selectableItems.length > 0 && selectableItems.every(item => item.selected);
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
    updateCartSummaryAsync();
    
    // Обновляем счетчик в верхнем меню
    updateCartTopMenuCount();
}

/**
 * Создание карточки товара в корзине
 */
function createCartItemCard(item) {
    const { product, quantity, selected } = item;
    const outOfStock = !isProductSelectableInCart(product);
    const effectiveSelected = outOfStock ? false : selected;
    
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
    
    const maxQty = getAvailableQuantity(product);
    
    let description = '';
    const rawDescription = product.description;
    if (rawDescription != null && String(rawDescription).trim()) {
        const desc = String(rawDescription).trim();
        description = desc.length > 35 ? desc.substring(0, 35) + '...' : desc;
    }
    
    const pricesHtml = renderProductPricesBlock(product, { quantity });
    
    const card = document.createElement('div');
    card.className = 'cart-item-card' + (outOfStock ? ' cart-item-card--out-of-stock' : '');
    card.dataset.productId = product.id;
    
    const checkboxId = `cart-item-checkbox-${product.id}`;
    const labelFor = outOfStock ? '' : ` for="${checkboxId}"`;
    card.innerHTML = `
        <div class="cart-item-checkbox-container">
            <label class="cart-item-checkbox-label"${labelFor}>
                <input type="checkbox" id="${checkboxId}" class="cart-item-checkbox" ${effectiveSelected ? 'checked' : ''} ${outOfStock ? 'disabled' : ''} data-product-id="${product.id}">
            </label>
        </div>
        <div class="cart-item-image-container">
            ${outOfStock ? '<div class="cart-item-out-of-stock-badge">Нет в наличии</div>' : ''}
            <img src="${imageUrl || ''}" alt="${product.name}" class="cart-item-image" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-glass);color:var(--text-hint);font-size:24px;\\'>📷</div>';">
            <button class="cart-item-favorite-btn" data-product-id="${product.id}" aria-label="Добавить в избранное">
                <svg viewBox="0 0 24 24" class="cart-favorite-heart" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </button>
        </div>
        <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(product.name)}</div>
            ${description ? `<div class="cart-item-description">${escapeHtml(description)}</div>` : ''}
            <div class="cart-item-prices-wrap">${pricesHtml}</div>
        </div>
        <div class="cart-item-quantity-controls">
            <button class="cart-quantity-btn cart-quantity-decrease" data-product-id="${product.id}">−</button>
            <span class="cart-quantity-value">${quantity}</span>
            <button class="cart-quantity-btn cart-quantity-increase" data-product-id="${product.id}" ${maxQty !== null && quantity >= maxQty ? 'disabled' : ''}>+</button>
        </div>
    `;
    
    const checkbox = card.querySelector('.cart-item-checkbox');
    const checkboxContainer = card.querySelector('.cart-item-checkbox-container');
    const checkboxLabel = card.querySelector('.cart-item-checkbox-label');
    [checkboxContainer, checkboxLabel, checkbox].filter(Boolean).forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    if (outOfStock) {
        const handleOutOfStockClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCartToast('Нет в наличии', 'error');
        };
        if (checkboxContainer) checkboxContainer.addEventListener('click', handleOutOfStockClick);
        if (checkboxLabel) checkboxLabel.addEventListener('click', handleOutOfStockClick);
    } else {
        checkbox.addEventListener('change', async () => {
            try {
                await toggleCartItemSelection(product.id);
                renderCart();
            } catch (error) {
                console.error('[CART NEW] Error toggling item selection:', error);
            }
        });
    }
    
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
    const increaseBtn = card.querySelector('.cart-quantity-increase');
    [decreaseBtn, increaseBtn].filter(Boolean).forEach(btn => {
        btn.addEventListener('click', (e) => e.stopPropagation());
        btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    decreaseBtn.addEventListener('click', async () => {
        const newQty = quantity - 1;
        try {
            await updateCartItemQuantity(product.id, newQty);
            renderCart();
        } catch (error) {
            console.error('[CART NEW] Error decreasing quantity:', error);
        }
    });
    

    increaseBtn.addEventListener('click', async () => {
        const nextQty = quantity + 1;
        if (maxQty !== null && nextQty > maxQty) {
            showCartToast(`Доступно: ${maxQty} шт.`, 'success');
            return;
        }
        try {
            await updateCartItemQuantity(product.id, nextQty);
            renderCart();
        } catch (error) {
            console.error('[CART NEW] Error increasing quantity:', error);
        }
    });

    card.addEventListener('click', () => {
        if (typeof window.showProductModal !== 'function') return;
        const imagesList = (product.images_urls && Array.isArray(product.images_urls) && product.images_urls.length > 0)
            ? product.images_urls
            : (product.image_url ? [product.image_url] : []);
        const fullImages = imagesList.map(url => {
            if (!url) return '';
            if (url.startsWith('http')) return url;
            return url.startsWith('/') ? API_BASE + url : API_BASE + '/' + url;
        }).filter(Boolean);
        window.showProductModal(product, null, fullImages);
    });

    return card;
}

/**
 * Обновление футера корзины
 */
function updateCartFooter() {
    const countText = document.getElementById('cart-footer-count-text');
    const totalAmount = document.getElementById('cart-footer-total-amount');
    const oldPriceElement = document.getElementById('cart-footer-old-price');
    
    const paymentMethod = getCartPaymentMethod();
    const selectedCount = getSelectedCartItemsCount();
    const totalOriginal = getSelectedCartTotalOriginal(null, paymentMethod ?? null);
    const total = getSelectedCartTotal(null, paymentMethod ?? null);
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
 * Обновление блока промокода и итогов (асинхронно — с учётом доставки из pricing quote).
 */
async function updateCartSummaryAsync() {
    const paymentMethod = getCartPaymentMethod();
    const selectedCount = getSelectedCartItemsCount();
    const totalCardWithoutDiscount = getSelectedCartTotalOriginal(null, null);
    const totalCardWithDiscount = getSelectedCartTotal(null, null);
    const totalCash = getSelectedCartTotal(null, 'cash');
    const hasRequestPrice = getSelectedCartHasRequestPrice(paymentMethod ?? null);
    const discountSavings = Math.max(0, totalCardWithoutDiscount - totalCardWithDiscount);
    const hasDiscount = discountSavings > 0;

    let deliveryFee = 0;
    try {
        const items = getSelectedCartItemsForCheckout();
        if (items.length > 0) {
            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
            const deliveryMethod = shopSettings?.default_delivery_method ?? shopSettings?.delivery_method ?? 'none';
            const pm = paymentMethod === 'cash' ? 'cash' : 'card';
            const quote = await import('../api/pricing.js').then(m => m.getPricingQuoteAPI({
                items,
                payment_method: pm,
                delivery_method: deliveryMethod
            }));
            deliveryFee = quote?.delivery_fee ?? 0;
        }
    } catch {
        deliveryFee = 0;
    }

    const cardTotalFinal = totalCardWithDiscount + (deliveryFee > 0 ? deliveryFee : 0);
    const cashTotalFinal = totalCash + (deliveryFee > 0 ? deliveryFee : 0);
    const hasAnyCash = getSelectedCartHasAnyCash();
    const pm = getCartPaymentMethod();
    const displayTotal = pm === 'cash' ? cashTotalFinal : cardTotalFinal;

    const countElement = document.getElementById('cart-summary-count');
    if (countElement) {
        countElement.textContent = `${selectedCount} ${selectedCount === 1 ? 'товар' : selectedCount < 5 ? 'товара' : 'товаров'}`;
    }

    const originalTotalElement = document.getElementById('cart-summary-original-total');
    if (originalTotalElement) {
        originalTotalElement.textContent = `${formatPrice(totalCardWithoutDiscount)}₽`;
    }

    const discountRow = document.getElementById('cart-summary-discount-row');
    const discountPercentElement = document.getElementById('cart-summary-discount-percent');
    const discountAmountElement = document.getElementById('cart-summary-discount-amount');
    if (hasDiscount && discountSavings > 0) {
        if (discountRow) discountRow.style.display = 'flex';
        if (discountPercentElement) { discountPercentElement.textContent = ''; discountPercentElement.style.display = 'none'; }
        if (discountAmountElement) {
            discountAmountElement.textContent = `−${formatPrice(discountSavings)}₽`;
            discountAmountElement.classList.add('cart-summary-savings-value');
        }
    } else {
        if (discountRow) discountRow.style.display = 'none';
        if (discountPercentElement) discountPercentElement.style.display = '';
        if (discountAmountElement) discountAmountElement.classList.remove('cart-summary-savings-value');
    }

    const deliveryRow = document.getElementById('cart-summary-delivery-row');
    const deliveryValueEl = document.getElementById('cart-summary-delivery-value');
    if (deliveryFee > 0 && deliveryRow && deliveryValueEl) {
        deliveryRow.style.display = 'flex';
        deliveryValueEl.textContent = `${formatPrice(deliveryFee)}₽`;
    } else if (deliveryRow) {
        deliveryRow.style.display = 'none';
    }

    const totalCardElement = document.getElementById('cart-summary-total-card');
    const totalCashElement = document.getElementById('cart-summary-total-cash');
    const cardRow = document.querySelector('.cart-payment-choice[data-payment="card"]');
    const cashRow = document.querySelector('.cart-payment-choice[data-payment="cash"]');

    if (hasAnyCash) {
        if (totalCardElement) totalCardElement.textContent = hasRequestPrice && totalCardWithDiscount === 0 ? '—' : `${formatPrice(cardTotalFinal)}₽`;
        if (totalCashElement) totalCashElement.textContent = `${formatPrice(cashTotalFinal)}₽`;
        if (cardRow) {
            cardRow.classList.remove('cart-total-row--active');
            cardRow.classList.add('cart-total-row--inactive');
            cardRow.style.display = '';
        }
        if (cashRow) {
            cashRow.classList.add('cart-total-row--active');
            cashRow.classList.remove('cart-total-row--inactive');
            cashRow.style.display = '';
        }
    } else {
        if (totalCardElement) totalCardElement.textContent = hasRequestPrice && totalCardWithDiscount === 0 ? '—' : `${formatPrice(cardTotalFinal)}₽`;
        if (cardRow) {
            cardRow.classList.add('cart-total-row--active');
            cardRow.classList.remove('cart-total-row--inactive');
            cardRow.style.display = '';
        }
        if (cashRow) cashRow.style.display = 'none';
    }

    const footerTotal = document.getElementById('cart-footer-total-amount');
    if (footerTotal) {
        if (hasRequestPrice && displayTotal === 0) {
            footerTotal.textContent = 'Уточнить';
        } else {
            footerTotal.textContent = `${formatPrice(displayTotal)}₽`;
        }
    }

    document.querySelectorAll('.cart-payment-choice').forEach(el => {
        el.classList.toggle('cart-payment-selected', (el.dataset.payment === 'cash') === (pm === 'cash'));
    });
}

function updateCartSummary() {
    updateCartSummaryAsync();
}

/**
 * Добавить товар в корзину (публичная функция для использования из других модулей)
 */
export async function addProductToCart(product, quantity = 1) {
    try {
        // ========== DEBUG: Логирование попытки добавления в корзину ==========
        const appContext = window.getAppContext ? window.getAppContext() : null;
        const stackTrace = new Error().stack;
        console.log(`[CART NEW DEBUG] addProductToCart called:`, {
            productId: product?.id,
            productName: product?.name,
            quantity,
            role: appContext?.role,
            is_for_sale: product?.is_for_sale,
            is_sale_enabled: product?.is_sale_enabled,
            is_made_to_order: product?.is_made_to_order,
            is_reservation_enabled: product?.is_reservation_enabled,
            action_type: product?.action_type,
            can_add_to_cart: product?.can_add_to_cart,
            reason_not_sale: product?.reason_not_sale,
            stackTrace: stackTrace
        });
        // ========== КОНЕЦ DEBUG ==========
        
        // ========== ВАЛИДАЦИЯ ТИПА ТОВАРА ==========
        // Проверяем, что товар можно добавлять в корзину (только sale)
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        
        if (appContext && appContext.role === 'client') {
            const { canAddToCart } = await import('../utils/productActionType.js');
            const canAdd = canAddToCart(product, appContext, shopSettings);
            
            if (!canAdd) {
                // Товар не продается - нельзя добавлять в корзину
                const actionType = product.action_type || 'none';
                const reason = product.reason_not_sale || 'not_sale';
                const actionTypeText = {
                    'purchase': 'покупка',
                    'order': 'заказ',
                    'reserve': 'резервация',
                    'none': 'не продается'
                }[actionType] || 'не продается';
                
                const errorMessage = `Этот товар не продаётся. Доступно: ${actionTypeText}`;
                console.warn(`[CART NEW] ❌ Cannot add product ${product.id} to cart: ${errorMessage}`, {
                    actionType,
                    reason,
                    can_add_to_cart: product.can_add_to_cart
                });
                showCartToast(errorMessage, 'error');
                throw new Error(errorMessage);
            }
        }
        // ========== КОНЕЦ ВАЛИДАЦИИ ==========
        
        const wasOutOfStock = !isProductSelectableInCart(product);
        await addToCart(product, quantity);
        
        if (wasOutOfStock) {
            showCartToast('Товара нет в наличии', 'error');
        }
        
        const cartPageNew = document.getElementById('cart-page-new');
        if (cartPageNew && cartPageNew.classList.contains('is-active')) {
            renderCart();
        }
        
        updateCartButtonCount();
    } catch (error) {
        // ========== DEBUG: Логирование ошибки с полной информацией ==========
        console.error('[CART NEW] Error in addProductToCart:', {
            error: error.message,
            stack: error.stack,
            productId: product?.id,
            productName: product?.name
        });
        // ========== КОНЕЦ DEBUG ==========
        throw error;
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
        
        // Показываем/скрываем кнопку корзины через классы состояния (fallback: inline style)
        if (count > 0) {
            cartButton.classList.remove('is-hidden', 'is-disabled');
            cartButton.classList.add('is-visible');
            cartButton.style.display = '';
        } else {
            cartButton.classList.remove('is-visible', 'is-disabled');
            cartButton.classList.add('is-hidden');
            cartButton.style.display = 'none';
        }
        
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
 * Закрытие новой страницы корзины. Сначала снимаем is-active и скрываем, затем goToMainContent().
 */
export function closeCartPageNew() {
    console.log('[CART NEW] Closing new cart page...');
    const cartPageNew = document.getElementById('cart-page-new');
    if (cartPageNew) {
        cartPageNew.classList.remove('is-active');
        cartPageNew.style.display = 'none';
    }
    goToMainContent();
}
