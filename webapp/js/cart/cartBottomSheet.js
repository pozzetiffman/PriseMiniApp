// Модуль для управления bottom sheet при добавлении товара в корзину
// 
// НОВАЯ ЛОГИКА:
// 1. При клике на кнопку корзины товар СРАЗУ добавляется в корзину с количеством 1
// 2. Затем открывается bottom sheet
// 3. При изменении количества в bottom sheet (плюс/минус) количество ОБНОВЛЯЕТСЯ в корзине в реальном времени
// 4. При нажатии на кнопку "Готово" bottom sheet просто закрывается

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
                currentQuantity = currentValue + 1;
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
            }
        });
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
        
        // Определяем тип товара
        const isForSale = currentProduct.is_for_sale === true || 
                         currentProduct.is_for_sale === 1 || 
                         currentProduct.is_for_sale === '1' ||
                         currentProduct.is_for_sale === 'true' ||
                         String(currentProduct.is_for_sale).toLowerCase() === 'true';
        
        const isMadeToOrder = currentProduct.is_made_to_order === true || 
                             currentProduct.is_made_to_order === 1 || 
                             currentProduct.is_made_to_order === '1' ||
                             currentProduct.is_made_to_order === 'true' ||
                             String(currentProduct.is_made_to_order).toLowerCase() === 'true';
        
        // Проверяем настройки резервации
        const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
        const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
        const canReserve = appContext.role === 'client' && 
                          appContext.permissions && 
                          appContext.permissions.can_reserve && 
                          reservationsEnabled &&
                          !isMadeToOrder;
        
        try {
            // Получаем актуальное количество из инпута
            const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
            const quantity = quantityInput ? parseInt(quantityInput.value) || currentQuantity : currentQuantity;
            
            // В зависимости от типа товара выполняем разные действия
            // Приоритет: Продать > Заказать > Резервировать > Готово
            if (isForSale && appContext.role === 'client') {
                // Тип 1: Продать - когда клиент продает нам
                // Открываем модальное окно продажи
                closeBottomSheet();
                try {
                    const { showPurchaseModal } = await import('../purchases.js');
                    showPurchaseModal(currentProduct);
                } catch (error) {
                    console.error('❌ Error importing showPurchaseModal:', error);
                    // Fallback: используем прямое открытие модального окна
                    try {
                        const purchaseModal = document.getElementById('purchase-modal');
                        if (purchaseModal) {
                            purchaseModal.style.display = 'block';
                        } else {
                            alert('Ошибка при открытии формы продажи');
                        }
                    } catch (fallbackError) {
                        alert('Ошибка при открытии формы продажи');
                    }
                }
            } else if (isMadeToOrder && appContext.role === 'client') {
                // Тип 2: Заказать - когда клиент делает заказ
                closeBottomSheet();
                try {
                    const { showOrderModal } = await import('../orders.js');
                    showOrderModal(currentProduct.id);
                } catch (error) {
                    console.error('❌ Error importing showOrderModal:', error);
                    alert('Ошибка при открытии формы заказа');
                }
            } else if (canReserve) {
                // Тип 3: Резервировать - когда клиент делает резервацию
                closeBottomSheet();
                try {
                    const { showReservationModal } = await import('../reservations.js');
                    showReservationModal(currentProduct.id);
                } catch (error) {
                    console.error('❌ Error importing showReservationModal:', error);
                    alert('Ошибка при открытии формы резервации');
                }
            } else {
                // Для остальных товаров - просто закрываем bottom sheet
                // Количество уже обновлено при изменении в bottom sheet
                closeBottomSheet();
                if (window.updateCartButtonsState) {
                    window.updateCartButtonsState();
                }
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
    
    // НОВАЯ ЛОГИКА: Получаем текущее количество товара в корзине
    try {
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
    
    // Обновляем значение в инпуте
    const quantityInput = sheetContent.querySelector('.cart-bottom-sheet-quantity-input');
    if (quantityInput) {
        quantityInput.value = currentQuantity;
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
    
    // Определяем тип товара и показываем соответствующие кнопки
    const isForSale = product.is_for_sale === true || 
                     product.is_for_sale === 1 || 
                     product.is_for_sale === '1' ||
                     product.is_for_sale === 'true' ||
                     String(product.is_for_sale).toLowerCase() === 'true';
    
    const isMadeToOrder = product.is_made_to_order === true || 
                         product.is_made_to_order === 1 || 
                         product.is_made_to_order === '1' ||
                         product.is_made_to_order === 'true' ||
                         String(product.is_made_to_order).toLowerCase() === 'true';
    
    // Проверяем настройки резервации
    const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
    const reservationsEnabled = shopSettings ? (shopSettings.reservations_enabled === true) : true;
    const canReserve = appContext.role === 'client' && 
                      appContext.permissions && 
                      appContext.permissions.can_reserve && 
                      reservationsEnabled &&
                      !isMadeToOrder;
    
    // Настраиваем кнопки в зависимости от типа товара
    // Приоритет: Продать > Заказать > Резервировать > Готово
    if (primaryBtn) {
        if (isForSale && appContext.role === 'client') {
            // Тип 1: Продать - когда клиент продает нам
            primaryBtn.textContent = 'Продать сейчас';
            primaryBtn.style.display = 'flex';
        } else if (isMadeToOrder && appContext.role === 'client') {
            // Тип 2: Заказать - когда клиент делает заказ
            primaryBtn.textContent = 'Заказать сейчас';
            primaryBtn.style.display = 'flex';
        } else if (canReserve) {
            // Тип 3: Резервировать - когда клиент делает резервацию
            primaryBtn.textContent = 'Резервировать сейчас';
            primaryBtn.style.display = 'flex';
        } else {
            // Для остальных товаров - просто закрываем bottom sheet
            // Товар уже добавлен в корзину, количество обновляется автоматически
            primaryBtn.textContent = 'Готово';
            primaryBtn.style.display = 'flex';
        }
    }
    
    // Вторичная кнопка не используется (скрыта)
    if (secondaryBtn) {
        secondaryBtn.style.display = 'none';
    }
    
    // Переустанавливаем обработчики кнопок и количества для текущего товара
    setupQuantityControls();
    setupActionButtons();
    
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
