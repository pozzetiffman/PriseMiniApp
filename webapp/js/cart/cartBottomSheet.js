// Модуль для управления bottom sheet при добавлении товара в корзину
// 
// НОВАЯ ЛОГИКА:
// 1. При клике на кнопку корзины товар СРАЗУ добавляется в корзину с количеством 1
// 2. Затем открывается bottom sheet
// 3. При изменении количества в bottom sheet (плюс/минус) количество ОБНОВЛЯЕТСЯ в корзине в реальном времени
// 4. При нажатии на кнопку "Готово" bottom sheet просто закрывается

// Импорт единого helper для определения типа операции (динамический для избежания проблем с порядком загрузки)
let getProductActionType = null;
let getActionButtonText = null;

// Загружаем helper при первом использовании
async function loadProductActionTypeHelper() {
    if (!getProductActionType || !getActionButtonText) {
        try {
            const module = await import('../utils/productActionType.js');
            getProductActionType = module.getProductActionType;
            getActionButtonText = module.getActionButtonText;
        } catch (error) {
            console.error('❌ Error loading productActionType helper:', error);
            // Fallback функции
            getProductActionType = () => 'none';
            getActionButtonText = () => 'Готово';
        }
    }
    return { getProductActionType, getActionButtonText };
}

let currentProduct = null;
let currentQuantity = 1;
let isDragging = false;
let startY = 0;
let currentY = 0;
let sheetElement = null;
let sheetContent = null;
let sheetBackdrop = null;
let isBottomSheetOpen = false; // Флаг открытого состояния bottom sheet
let scrollHandler = null; // Обработчик прокрутки страницы
let clickHandler = null; // Обработчик клика на товары/кнопки
let lastScrollY = 0; // Последняя позиция прокрутки

/**
 * Получить максимальное доступное количество товара с учетом резерваций
 * @param {Object} product - Объект товара
 * @returns {number|null} - Максимальное доступное количество или null если неограниченно
 */
function getMaxAvailableQuantity(product) {
    if (!product) return null;
    
    // Если quantity не указан или равен 0, считаем товар неограниченным
    const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : null;
    if (productQuantity === null || productQuantity === undefined || productQuantity === 0) {
        return null; // Неограниченное количество
    }
    
    // Учитываем активные резервации
    const activeReservationsCount = product.reservation && product.reservation.active_count 
        ? product.reservation.active_count 
        : 0;
    
    const availableCount = Math.max(0, productQuantity - activeReservationsCount);
    return availableCount;
}

/**
 * Обновить состояние кнопок количества (блокировка + при достижении максимума)
 */
function updateQuantityButtonsState() {
    if (!sheetContent || !currentProduct) return;
    
    const plusBtn = sheetContent.querySelector('.cart-bottom-sheet-quantity-btn.plus');
    const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
    
    if (!plusBtn || !quantityInput) return;
    
    const maxQuantity = getMaxAvailableQuantity(currentProduct);
    const currentValue = parseInt(quantityInput.value) || 1;
    
    // Если есть ограничение и текущее значение достигло максимума, блокируем кнопку +
    if (maxQuantity !== null && currentValue >= maxQuantity) {
        plusBtn.disabled = true;
        plusBtn.style.opacity = '0.5';
        plusBtn.style.cursor = 'not-allowed';
        plusBtn.setAttribute('aria-disabled', 'true');
    } else {
        plusBtn.disabled = false;
        plusBtn.style.opacity = '1';
        plusBtn.style.cursor = 'pointer';
        plusBtn.removeAttribute('aria-disabled');
    }
}

/**
 * Инициализация bottom sheet
 */
export function initCartBottomSheet() {
    try {
        sheetElement = document.getElementById('cart-bottom-sheet');
        if (!sheetElement) {
            console.warn('⚠️ Cart bottom sheet element not found, will retry');
            // Повторяем попытку через небольшую задержку
            setTimeout(() => {
                initCartBottomSheet();
            }, 100);
            return;
        }
        
        sheetContent = sheetElement.querySelector('.cart-bottom-sheet-content');
        sheetBackdrop = sheetElement.querySelector('.cart-bottom-sheet-backdrop');
        
        if (!sheetContent || !sheetBackdrop) {
            console.warn('⚠️ Cart bottom sheet elements not found, will retry');
            setTimeout(() => {
                initCartBottomSheet();
            }, 100);
            return;
        }
        
    // Убираем обработчик клика на backdrop, так как фон теперь прозрачный
    // sheetBackdrop.addEventListener('click', closeBottomSheet);
        
        // Обработчик свайпа вниз
        setupSwipeHandler();
        
        // Обработчики кнопок количества (будет вызываться при каждом показе)
        // setupQuantityControls(); // Не вызываем здесь, так как элементы могут быть не готовы
        
        // Обработчики кнопок действий (будет вызываться при каждом показе)
        // setupActionButtons(); // Не вызываем здесь, так как элементы могут быть не готовы
        
        console.log('✅ Cart bottom sheet initialized');
    } catch (error) {
        console.error('❌ Error initializing cart bottom sheet:', error);
    }
}

/**
 * Настройка обработчика свайпа вниз (работает по всему блоку)
 */
function setupSwipeHandler() {
    if (!sheetContent) return;
    
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isDragging = false;
    let startScrollTop = 0;
    
    // Начало касания - на всем контенте
    sheetContent.addEventListener('touchstart', (e) => {
        // Проверяем, не кликнули ли на интерактивные элементы
        const target = e.target;
        if (target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' || 
            target.closest('button') || 
            target.closest('input') || 
            target.closest('.cart-bottom-sheet-quantity-controls') ||
            target.closest('.cart-bottom-sheet-actions')) {
            return; // Не обрабатываем свайп на интерактивных элементах
        }
        
        touchStartY = e.touches[0].clientY;
        startScrollTop = sheetContent.scrollTop;
        isDragging = true;
        sheetContent.style.transition = 'none';
    }, { passive: true });
    
    // Движение
    sheetContent.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        touchCurrentY = e.touches[0].clientY;
        const deltaY = touchCurrentY - touchStartY;
        
        // Если контент прокручивается, не обрабатываем свайп
        if (sheetContent.scrollTop > 0 && deltaY < 0) {
            return;
        }
        
        // Если свайп вниз и контент не прокручивается
        if (deltaY > 0 && startScrollTop === 0) {
            e.preventDefault();
            sheetContent.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: false });
    
    // Конец касания
    sheetContent.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        sheetContent.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        const deltaY = touchCurrentY - touchStartY;
        if (deltaY > 50 && startScrollTop === 0) {
            // Свайп вниз достаточно большой - закрываем (уменьшен порог с 100px до 50px)
            closeBottomSheet();
        } else {
            // Возвращаем на место
            sheetContent.style.transform = 'translateY(0)';
        }
    }, { passive: true });
    
    // Также для мыши (для тестирования)
    sheetContent.addEventListener('mousedown', (e) => {
        // Проверяем, не кликнули ли на интерактивные элементы
        const target = e.target;
        if (target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' || 
            target.closest('button') || 
            target.closest('input') || 
            target.closest('.cart-bottom-sheet-quantity-controls') ||
            target.closest('.cart-bottom-sheet-actions')) {
            return;
        }
        
        touchStartY = e.clientY;
        startScrollTop = sheetContent.scrollTop;
        isDragging = true;
        sheetContent.style.transition = 'none';
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            touchCurrentY = e.clientY;
            const deltaY = touchCurrentY - touchStartY;
            
            if (deltaY > 0 && startScrollTop === 0) {
                sheetContent.style.transform = `translateY(${deltaY}px)`;
            }
        };
        
        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            sheetContent.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            
            const deltaY = touchCurrentY - touchStartY;
            if (deltaY > 50 && startScrollTop === 0) {
                // Свайп вниз достаточно большой - закрываем (уменьшен порог с 100px до 50px)
                closeBottomSheet();
            } else {
                sheetContent.style.transform = 'translateY(0)';
            }
            
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

/**
 * Настройка контролов количества
 */
function setupQuantityControls() {
    if (!sheetContent) return;
    
    const minusBtn = sheetContent.querySelector('.cart-bottom-sheet-quantity-btn.minus');
    const plusBtn = sheetContent.querySelector('.cart-bottom-sheet-quantity-btn.plus');
    const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
    
    if (!minusBtn || !plusBtn || !quantityInput) {
        console.warn('⚠️ Quantity controls not found in bottom sheet');
        return;
    }
    
    // Используем делегирование событий для надежности
    // Удаляем старые обработчики через клонирование
    try {
        const minusBtnClone = minusBtn.cloneNode(true);
        const plusBtnClone = plusBtn.cloneNode(true);
        minusBtn.parentNode.replaceChild(minusBtnClone, minusBtn);
        plusBtn.parentNode.replaceChild(plusBtnClone, plusBtn);
        
        minusBtnClone.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const input = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
            if (input && currentProduct) {
                const currentValue = parseInt(input.value) || 1;
                if (currentValue > 1) {
                    currentQuantity = currentValue - 1;
                    input.value = currentQuantity;
                    
                // НОВАЯ ЛОГИКА: Обновляем количество в корзине
                try {
                    const { updateCartItemQuantity } = await import('./cartStore.js');
                    await updateCartItemQuantity(currentProduct.id, currentQuantity);
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                } catch (error) {
                    console.error('❌ Error updating cart quantity:', error);
                }
                
                // Синхронизируем выбранное количество для резервации (без блокировки)
                import('../reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(currentProduct.id, currentQuantity);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity:', error);
                });
                
                // Синхронизируем выбранное количество для заказа (без блокировки)
                import('../orderStore.js').then(({ setOrderQuantity }) => {
                    setOrderQuantity(currentProduct.id, currentQuantity);
                }).catch((error) => {
                    console.error('❌ Error syncing order quantity:', error);
                });
                
                // Обновляем состояние кнопок после изменения количества
                updateQuantityButtonsState();
                } else if (currentValue === 1) {
                    // Если количество было 1, уменьшаем до 0 - товар удаляется из корзины
                    currentQuantity = 0;
                    input.value = 0;
                    
                    try {
                        const { updateCartItemQuantity } = await import('./cartStore.js');
                        await updateCartItemQuantity(currentProduct.id, 0); // Это удалит товар из корзины
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                        // Закрываем bottom sheet, так как товар удален
                        closeBottomSheet();
                    } catch (error) {
                        console.error('❌ Error removing product from cart:', error);
                    }
                }
            }
        });
        
        plusBtnClone.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const input = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
            if (input && currentProduct) {
                const currentValue = parseInt(input.value) || 1;
                const maxQuantity = getMaxAvailableQuantity(currentProduct);
                
                // Проверяем ограничение: если есть максимум и текущее значение достигло его, не увеличиваем
                if (maxQuantity !== null && currentValue >= maxQuantity) {
                    // Уже достигнут максимум, не увеличиваем
                    return;
                }
                
                // Увеличиваем количество, но не больше максимума
                const newQuantity = maxQuantity !== null 
                    ? Math.min(currentValue + 1, maxQuantity)
                    : currentValue + 1;
                
                currentQuantity = newQuantity;
                input.value = currentQuantity;
                
                // НОВАЯ ЛОГИКА: Обновляем количество в корзине
                try {
                    const { updateCartItemQuantity } = await import('./cartStore.js');
                    await updateCartItemQuantity(currentProduct.id, currentQuantity);
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                } catch (error) {
                    console.error('❌ Error updating cart quantity:', error);
                }
                
                // Синхронизируем выбранное количество для резервации (без блокировки)
                import('../reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(currentProduct.id, currentQuantity);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity:', error);
                });
                
                // Синхронизируем выбранное количество для заказа (без блокировки)
                import('../orderStore.js').then(({ setOrderQuantity }) => {
                    setOrderQuantity(currentProduct.id, currentQuantity);
                }).catch((error) => {
                    console.error('❌ Error syncing order quantity:', error);
                });
                
                // Обновляем состояние кнопок после изменения количества
                updateQuantityButtonsState();
            }
        });
        
        // Добавляем обработчик для валидации ввода в инпут
        if (quantityInput) {
            // Удаляем старый обработчик, если есть
            const inputClone = quantityInput.cloneNode(true);
            quantityInput.parentNode.replaceChild(inputClone, quantityInput);
            
            inputClone.addEventListener('input', (e) => {
                const value = parseInt(e.target.value) || 1;
                const maxQuantity = getMaxAvailableQuantity(currentProduct);
                
                // Валидация: ограничиваем значение максимумом и минимумом 1
                let validatedValue = value;
                if (value < 1) {
                    validatedValue = 1;
                } else if (maxQuantity !== null && value > maxQuantity) {
                    validatedValue = maxQuantity;
                }
                
                if (validatedValue !== value) {
                    e.target.value = validatedValue;
                }
                
                currentQuantity = validatedValue;
                
                // Обновляем состояние кнопок
                updateQuantityButtonsState();
            });
            
            inputClone.addEventListener('blur', async (e) => {
                const value = parseInt(e.target.value) || 1;
                const maxQuantity = getMaxAvailableQuantity(currentProduct);
                
                // Финальная валидация при потере фокуса
                let validatedValue = value;
                if (value < 1) {
                    validatedValue = 1;
                } else if (maxQuantity !== null && value > maxQuantity) {
                    validatedValue = maxQuantity;
                }
                
                if (validatedValue !== value) {
                    e.target.value = validatedValue;
                }
                
                currentQuantity = validatedValue;
                
                // Обновляем количество в корзине при потере фокуса
                if (currentProduct && validatedValue > 0) {
                    try {
                        const { updateCartItemQuantity } = await import('./cartStore.js');
                        await updateCartItemQuantity(currentProduct.id, validatedValue);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error updating cart quantity:', error);
                    }
                    
                    // Синхронизируем выбранное количество для резервации (без блокировки)
                    import('../reservationStore.js').then(({ setReservationQuantity }) => {
                        setReservationQuantity(currentProduct.id, validatedValue);
                    }).catch((error) => {
                        console.error('❌ Error syncing reservation quantity:', error);
                    });
                }
                
                // Обновляем состояние кнопок
                updateQuantityButtonsState();
            });
        }
    } catch (error) {
        console.error('❌ Error setting up quantity controls:', error);
    }
}

// Глобальные обработчики для кнопок (будут переустанавливаться при каждом показе)
let primaryBtnHandler = null;
let secondaryBtnHandler = null;

/**
 * Настройка кнопок действий
 */
function setupActionButtons() {
    if (!sheetContent) return;
    
    const primaryBtn = document.getElementById('cart-bottom-sheet-primary-btn');
    const secondaryBtn = document.getElementById('cart-bottom-sheet-secondary-btn');
    
    if (!primaryBtn) {
        console.warn('⚠️ Primary button not found in bottom sheet');
        return;
    }
    
    // Удаляем старые обработчики, если они есть
    if (primaryBtnHandler) {
        primaryBtn.removeEventListener('click', primaryBtnHandler);
    }
    if (secondaryBtn && secondaryBtnHandler) {
        secondaryBtn.removeEventListener('click', secondaryBtnHandler);
    }
    
    // Создаем новый обработчик для основной кнопки
    primaryBtnHandler = async () => {
        if (!currentProduct) return;
        
        const appContext = window.getAppContext ? window.getAppContext() : null;
        if (!appContext) return;
        
        // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ==========
        // Получаем актуальный продукт из allProducts кэша (может быть обновлен после редактирования)
        let actualProduct = currentProduct;
        try {
            const allProducts = window.getAllProducts ? window.getAllProducts() : null;
            if (Array.isArray(allProducts)) {
                const freshProduct = allProducts.find(p => p && p.id === currentProduct.id);
                if (freshProduct) {
                    actualProduct = freshProduct;
                    console.log(`[CART BOTTOM SHEET] Using fresh product from cache for ${currentProduct.id}`);
                }
            }
        } catch (e) {
            console.warn(`[CART BOTTOM SHEET] Could not get fresh product from cache:`, e);
        }
        // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
        
        // Загружаем helper если еще не загружен
        await loadProductActionTypeHelper();
        
        // Получаем тип операции через единый helper с АКТУАЛЬНЫМ продуктом
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        const actionType = getProductActionType(actualProduct, appContext, shopSettings);
        
        // ========== DEBUG: Логирование типа при клике на кнопку ==========
        console.log(`[CART BOTTOM SHEET DEBUG] Primary button clicked for product ${currentProduct.id}:`, {
            productId: currentProduct.id,
            actionType,
            action_type_backend: actualProduct.action_type,
            can_add_to_cart_backend: actualProduct.can_add_to_cart,
            reason_not_sale: actualProduct.reason_not_sale,
            is_for_sale: actualProduct.is_for_sale,
            is_sale_enabled: actualProduct.is_sale_enabled,
            is_made_to_order: actualProduct.is_made_to_order,
            is_reservation_enabled: actualProduct.is_reservation_enabled
        });
        // ========== КОНЕЦ DEBUG ==========
        
        try {
            // Получаем актуальное количество из инпута
            const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
            let quantity = quantityInput ? parseInt(quantityInput.value) || currentQuantity : currentQuantity;
            
            // ВАЛИДАЦИЯ: Проверяем, что количество не превышает доступное
            const maxQuantity = getMaxAvailableQuantity(actualProduct);
            if (maxQuantity !== null && quantity > maxQuantity) {
                // Если количество превышает доступное, ограничиваем его
                quantity = maxQuantity;
                if (quantityInput) {
                    quantityInput.value = quantity;
                }
                currentQuantity = quantity;
                
                // Обновляем количество в корзине с валидированным значением (только для типа 'sale')
                // Используем can_add_to_cart от бэка для проверки
                const { canAddToCart } = await import('../utils/productActionType.js');
                const canAdd = canAddToCart(actualProduct, appContext, shopSettings);
                if (canAdd) {
                    try {
                        const { updateCartItemQuantity } = await import('./cartStore.js');
                        await updateCartItemQuantity(actualProduct.id, quantity);
                        if (window.updateCartButtonsState) {
                            window.updateCartButtonsState();
                        }
                    } catch (error) {
                        console.error('❌ Error updating cart quantity:', error);
                    }
                }
            }
            
            // Выполняем действие в зависимости от типа операции
            closeBottomSheet();
            
            switch (actionType) {
                case 'purchase':
                    // Продать - когда клиент продает нам
                    try {
                        const { showPurchasePage } = await import('../purchases.js');
                        closeBottomSheet();
                        showPurchasePage(actualProduct); // Используем актуальный продукт
                    } catch (error) {
                        console.error('❌ Error importing showPurchasePage:', error);
                        alert('Ошибка при открытии формы продажи');
                    }
                    break;
                    
                case 'sale':
                    // Купить — единый поток через Deal: start -> deal-checkout-page -> confirm (как из корзины)
                    try {
                        const { startDealCheckoutAPI } = await import('../api/deals.js');
                        const { openDealCheckoutPage } = await import('../dealCheckout.js');
                        const quantity = quantityInput ? Math.max(1, parseInt(quantityInput.value) || 1) : currentQuantity;
                        const result = await startDealCheckoutAPI({
                            items: [{ product_id: actualProduct.id, quantity }], // Используем актуальный продукт
                        });
                        openDealCheckoutPage(result.deal_id, {
                            total_items_count: result.total_items_count,
                            total_amount: result.total_amount,
                            currency: result.currency,
                        }, { source: 'single' });
                    } catch (error) {
                        console.error('❌ Error starting deal checkout (buy from card):', error);
                        alert('Ошибка при оформлении: ' + (error.message || 'не удалось начать оформление'));
                    }
                    break;
                    
                case 'order':
                    // Заказать - когда клиент делает заказ
                    try {
                        const { showOrderPage } = await import('../orders.js');
                        closeBottomSheet();
                        showOrderPage(actualProduct.id, false); // Используем актуальный продукт
                    } catch (error) {
                        console.error('❌ Error importing showOrderPage:', error);
                        alert('Ошибка при открытии формы заказа');
                    }
                    break;
                    
                case 'reserve':
                    // Резервировать - когда клиент делает резервацию
                    try {
                        const { showReservationModal } = await import('../reservations.js');
                        showReservationModal(actualProduct.id); // Используем актуальный продукт
                    } catch (error) {
                        console.error('❌ Error importing showReservationModal:', error);
                        alert('Ошибка при открытии формы резервации');
                    }
                    break;
                    
                default:
                    // Для остальных товаров - просто закрываем bottom sheet
                    // Количество уже обновлено при изменении в bottom sheet
                    if (window.updateCartButtonsState) {
                        window.updateCartButtonsState();
                    }
                    break;
            }
        } catch (error) {
            console.error('❌ Error in primary button action:', error);
            alert('Ошибка: ' + (error.message || 'Неизвестная ошибка'));
        }
    };
    
    // Добавляем обработчик для основной кнопки
    primaryBtn.addEventListener('click', primaryBtnHandler);
    
    // Вторичная кнопка не используется (все действия через primaryBtn)
    if (secondaryBtn) {
        secondaryBtn.style.display = 'none';
    }
}

/**
 * Показать bottom sheet с товаром
 */
export async function showCartBottomSheet(product) {
    if (!sheetElement || !sheetContent) {
        console.error('❌ Cart bottom sheet not initialized');
        return;
    }
    
    // Проверяем, что мы на странице избранного - bottom sheet показывается только там
    const favoritesPage = document.getElementById('favorites-page');
    const isOnFavoritesPage = favoritesPage && (favoritesPage.style.display === 'block' || favoritesPage.style.display === 'flex');
    
    if (!isOnFavoritesPage) {
        console.log('⚠️ Bottom sheet can only be shown on favorites page');
        return; // Не показываем bottom sheet на главной странице
    }
    
    currentProduct = product;
    
    // ========== ПОЛУЧЕНИЕ АКТУАЛЬНОГО ПРОДУКТА ИЗ КЭША ПРИ ОТКРЫТИИ ==========
    // Получаем актуальный продукт из allProducts кэша (может быть обновлен после редактирования)
    try {
        const allProducts = window.getAllProducts ? window.getAllProducts() : null;
        if (Array.isArray(allProducts)) {
            const freshProduct = allProducts.find(p => p && p.id === product.id);
            if (freshProduct) {
                currentProduct = freshProduct;
                console.log(`[CART BOTTOM SHEET] Using fresh product from cache on open for ${product.id}`);
            }
        }
    } catch (e) {
        console.warn(`[CART BOTTOM SHEET] Could not get fresh product from cache on open:`, e);
    }
    // ========== КОНЕЦ ПОЛУЧЕНИЯ АКТУАЛЬНОГО ПРОДУКТА ==========
    
    // НОВАЯ ЛОГИКА: Получаем текущее количество товара в корзине
    // Используем await для синхронного получения количества
    try {
        // Получаем количество из корзины
        const { getCartItems } = await import('./cartStore.js');
        const cartItems = getCartItems();
        const existingItem = cartItems.find(item => item.product.id === product.id);
        
        if (existingItem) {
            // Если товар уже в корзине, используем его текущее количество
            currentQuantity = existingItem.quantity || 1;
        } else {
            // Если товара нет в корзине, значит он только что добавлен с количеством 1
            currentQuantity = 1;
        }
    } catch (error) {
        console.error('❌ Error getting cart items:', error);
        // Fallback: если не удалось получить количество, используем 1
        currentQuantity = 1;
    }
    
    // Обновляем значение в инпуте и устанавливаем ограничения
    const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
    if (quantityInput) {
        // Устанавливаем минимальное значение
        quantityInput.min = 1;
        
        // Устанавливаем максимальное значение на основе доступного количества
        const maxQuantity = getMaxAvailableQuantity(product);
        if (maxQuantity !== null) {
            quantityInput.max = maxQuantity;
            // Если текущее количество больше доступного, ограничиваем его
            if (currentQuantity > maxQuantity) {
                currentQuantity = maxQuantity;
            }
        } else {
            // Если количество неограниченно, убираем ограничение max
            quantityInput.removeAttribute('max');
        }
        
        // Для резервации и заказа: синхронизируем с store при открытии Bottom Sheet
        // Используем динамический импорт без await, чтобы не блокировать
        Promise.all([
            import('../reservationStore.js').catch(() => null),
            import('../orderStore.js').catch(() => null)
        ]).then(([reservationStore, orderStore]) => {
            try {
                let storedQuantity = currentQuantity;
                
                // Проверяем количество для резервации
                if (reservationStore) {
                    const reservationQty = reservationStore.getReservationQuantity(product.id, currentQuantity);
                    if (reservationQty >= 1 && (maxQuantity === null || reservationQty <= maxQuantity)) {
                        storedQuantity = reservationQty;
                    }
                }
                
                // Проверяем количество для заказа (приоритет, если есть)
                if (orderStore) {
                    const orderQty = orderStore.getOrderQuantity(product.id, storedQuantity);
                    if (orderQty >= 1 && (maxQuantity === null || orderQty <= maxQuantity)) {
                        storedQuantity = orderQty;
                    }
                }
                
                // Используем сохраненное количество, если оно валидно
                if (storedQuantity !== currentQuantity && storedQuantity >= 1 && (maxQuantity === null || storedQuantity <= maxQuantity)) {
                    currentQuantity = storedQuantity;
                    quantityInput.value = currentQuantity;
                }
                
                // Сохраняем текущее количество в оба store
                if (reservationStore) {
                    reservationStore.setReservationQuantity(product.id, currentQuantity);
                }
                if (orderStore) {
                    orderStore.setOrderQuantity(product.id, currentQuantity);
                }
            } catch (error) {
                console.error('❌ Error syncing quantity on open:', error);
            }
        }).catch((error) => {
            console.error('❌ Error importing stores:', error);
        });
        
        quantityInput.value = currentQuantity;
        
        // Убираем readonly, чтобы пользователь мог вводить значение
        quantityInput.removeAttribute('readonly');
    }
    
    // Получаем контекст приложения
    const appContext = window.getAppContext ? window.getAppContext() : null;
    if (!appContext) {
        console.error('❌ App context not available');
        return;
    }
    
    // Заполняем информацию о товаре
    const productImage = sheetContent.querySelector('.cart-bottom-sheet-product-image');
    const productName = sheetContent.querySelector('.cart-bottom-sheet-product-name');
    const primaryBtn = document.getElementById('cart-bottom-sheet-primary-btn');
    const secondaryBtn = document.getElementById('cart-bottom-sheet-secondary-btn');
    
    // Изображение товара (уменьшенное)
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
    
    // Название товара (без цены)
    if (productName) {
        productName.textContent = product.name || '';
    }
    
    // Количество
    if (quantityInput) {
        quantityInput.value = currentQuantity;
    }
    
    // Загружаем helper если еще не загружен
    await loadProductActionTypeHelper();
    
    // Получаем тип операции через единый helper
    const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
    const actionType = getProductActionType(product, appContext, shopSettings);
    
    // Настраиваем primary-кнопку в зависимости от типа операции
    if (primaryBtn) {
        primaryBtn.textContent = getActionButtonText(actionType);
        primaryBtn.style.display = 'flex';
    }
    
    // Вторичная кнопка не используется (скрыта)
    if (secondaryBtn) {
        secondaryBtn.style.display = 'none';
    }
    
    // Переустанавливаем обработчики кнопок и количества для текущего товара
    setupQuantityControls();
    setupActionButtons();
    
    // Обновляем состояние кнопок после настройки
    updateQuantityButtonsState();
    
    // Показываем bottom sheet с z-index выше карточек, но ниже меню
    // НИКОГДА не устанавливаем z-index выше 10010, чтобы меню всегда было поверх
    sheetElement.style.setProperty('z-index', '5000', 'important');
    sheetElement.style.display = 'flex';
    
    // Устанавливаем флаг открытого состояния
    isBottomSheetOpen = true;
    
    // Добавляем обработчики прокрутки и клика для закрытия bottom sheet
    addScrollAndClickHandlers();
    
    // Принудительная перерисовка для анимации
    requestAnimationFrame(() => {
        sheetContent.style.transform = 'translateY(0)';
    });
}

/** ID товара в открытом bottom sheet (для обновления UI после редактирования) */
export function getCurrentBottomSheetProductId() {
    return isBottomSheetOpen && currentProduct ? currentProduct.id : null;
}

/**
 * Закрыть bottom sheet
 */
export function closeBottomSheet() {
    if (!sheetElement || !sheetContent || !sheetBackdrop) return;
    
    // Удаляем обработчики прокрутки и клика
    removeScrollAndClickHandlers();
    
    // Сразу скрываем элемент
    // НИКОГДА не устанавливаем z-index выше 10010, чтобы меню всегда было поверх
    sheetElement.style.setProperty('z-index', '5000', 'important');
    sheetContent.style.transform = 'translateY(100%)';
    
    setTimeout(() => {
        sheetElement.style.display = 'none';
        // Убеждаемся, что z-index остается правильным (5000 - выше карточек, но ниже меню)
        sheetElement.style.setProperty('z-index', '5000', 'important');
        currentProduct = null;
        currentQuantity = 1;
        isBottomSheetOpen = false;
    }, 300);
}

/**
 * Добавить обработчики прокрутки и клика для закрытия bottom sheet
 */
function addScrollAndClickHandlers() {
    // Удаляем старые обработчики, если они есть
    removeScrollAndClickHandlers();
    
    // Применяем исправления стилей для body при открытом bottom sheet
    applyBodyScrollFix();
    
    // Обработчик прокрутки страницы - закрывает bottom sheet при любой прокрутке (вверх или вниз)
    // Сохраняем начальные позиции прокрутки для всех возможных контейнеров
    const mainContent = document.getElementById('main-content');
    const favoritesPage = document.getElementById('favorites-page');
    lastScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    let lastMainContentScroll = mainContent ? mainContent.scrollTop : 0;
    let lastFavoritesScroll = favoritesPage ? favoritesPage.scrollTop : 0;
    let lastBodyScroll = document.body.scrollTop || 0;
    
    scrollHandler = () => {
        if (!isBottomSheetOpen) return;
        
        // Проверяем прокрутку window
        const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        if (Math.abs(currentScrollY - lastScrollY) > 1) {
            closeBottomSheet();
            return;
        }
        
        // Проверяем прокрутку body
        const currentBodyScroll = document.body.scrollTop || 0;
        if (Math.abs(currentBodyScroll - lastBodyScroll) > 1) {
            closeBottomSheet();
            return;
        }
        lastBodyScroll = currentBodyScroll;
        
        // Проверяем прокрутку main-content
        if (mainContent) {
            const currentMainScroll = mainContent.scrollTop;
            if (Math.abs(currentMainScroll - lastMainContentScroll) > 1) {
                closeBottomSheet();
                return;
            }
            lastMainContentScroll = currentMainScroll;
        }
        
        // Проверяем прокрутку favorites-page
        if (favoritesPage) {
            const currentFavoritesScroll = favoritesPage.scrollTop;
            if (Math.abs(currentFavoritesScroll - lastFavoritesScroll) > 1) {
                closeBottomSheet();
                return;
            }
            lastFavoritesScroll = currentFavoritesScroll;
        }
        
        lastScrollY = currentScrollY;
    };
    
    // Обработчик клика на товары/кнопки - закрывает bottom sheet перед открытием товара
    clickHandler = (e) => {
        if (!isBottomSheetOpen) return;
        
        // Проверяем, кликнули ли на сам bottom sheet или его содержимое
        const target = e.target;
        const clickedElement = target.closest('#cart-bottom-sheet');
        
        // Если клик внутри bottom sheet, не закрываем его
        if (clickedElement) {
            return;
        }
        
        // Если клик вне bottom sheet, закрываем его
        // Это работает для всех элементов: товары, категории, поиск, кнопки и т.д.
        // Устанавливаем флаг закрытия сразу, чтобы предотвратить повторную обработку
        isBottomSheetOpen = false;
        
        // Закрываем bottom sheet используя функцию closeBottomSheet
        // Это гарантирует правильное закрытие с анимацией и очисткой
        closeBottomSheet();
        
        // Не предотвращаем событие - оно продолжит обработку и откроет товар/категорию/поиск
        // Клик автоматически обработается соответствующим обработчиком
    };
    
    // Добавляем обработчики
    window.addEventListener('scroll', scrollHandler, { passive: true });
    document.body.addEventListener('scroll', scrollHandler, { passive: true });
    if (mainContent) {
        mainContent.addEventListener('scroll', scrollHandler, { passive: true });
    }
    if (favoritesPage) {
        favoritesPage.addEventListener('scroll', scrollHandler, { passive: true });
    }
    document.addEventListener('click', clickHandler, true); // Используем capture phase для раннего перехвата
}

/**
 * Удалить обработчики прокрутки и клика
 */
function removeScrollAndClickHandlers() {
    if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
        document.body.removeEventListener('scroll', scrollHandler);
        const mainContent = document.getElementById('main-content');
        const favoritesPage = document.getElementById('favorites-page');
        if (mainContent) {
            mainContent.removeEventListener('scroll', scrollHandler);
        }
        if (favoritesPage) {
            favoritesPage.removeEventListener('scroll', scrollHandler);
        }
        scrollHandler = null;
    }
    
    if (clickHandler) {
        document.removeEventListener('click', clickHandler, true);
        clickHandler = null;
    }
    
    // Убираем исправления стилей для body
    removeBodyScrollFix();
}

/**
 * Применить исправления стилей для body при открытом bottom sheet
 * Это предотвращает появление серого фона при прокрутке
 */
function applyBodyScrollFix() {
    const body = document.body;
    if (!body) return;
    
    // Сохраняем оригинальные значения
    if (!body.dataset.originalBackgroundAttachment) {
        body.dataset.originalBackgroundAttachment = getComputedStyle(body).backgroundAttachment;
    }
    if (!body.dataset.originalOverscrollBehavior) {
        body.dataset.originalOverscrollBehavior = getComputedStyle(body).overscrollBehavior;
    }
    if (!body.dataset.originalOverscrollBehaviorY) {
        body.dataset.originalOverscrollBehaviorY = getComputedStyle(body).overscrollBehaviorY;
    }
    
    // Применяем исправления
    body.style.backgroundAttachment = 'scroll';
    body.style.overscrollBehavior = 'contain';
    body.style.overscrollBehaviorY = 'contain';
    
    // Исправляем body::before если он есть
    const bodyBefore = getComputedStyle(body, '::before');
    if (bodyBefore && bodyBefore.position === 'fixed') {
        // Применяем исправление через CSS переменную или класс
        body.classList.add('bottom-sheet-open');
    }
}

/**
 * Убрать исправления стилей для body
 */
function removeBodyScrollFix() {
    const body = document.body;
    if (!body) return;
    
    // Восстанавливаем оригинальные значения
    if (body.dataset.originalBackgroundAttachment) {
        body.style.backgroundAttachment = body.dataset.originalBackgroundAttachment;
    }
    if (body.dataset.originalOverscrollBehavior) {
        body.style.overscrollBehavior = body.dataset.originalOverscrollBehavior;
    }
    if (body.dataset.originalOverscrollBehaviorY) {
        body.style.overscrollBehaviorY = body.dataset.originalOverscrollBehaviorY;
    }
    
    // Убираем класс
    body.classList.remove('bottom-sheet-open');
}
