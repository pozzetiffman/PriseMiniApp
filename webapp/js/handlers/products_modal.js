// Модуль для модального окна товара
// Вынесено из products.js для рефакторинга

// ========== REFACTORING STEP 3.1: showProductModal ==========
// Дата начала: 2024-12-19
// Статус: В процессе

// Импорты зависимостей
import { getCurrentShopSettings } from '../admin.js';
import { toggleHotOffer, trackShopVisit } from '../api.js';
import { getProductPriceDisplay } from '../utils/priceUtils.js';
// ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
// НОВЫЙ КОД (используется сейчас)
import { showModalImage } from './products_modal_image.js';
// ========== END REFACTORING STEP 2.1-2.2 ==========

// Зависимости, которые будут переданы из products.js через initProductModalDependencies
let modalElement = null; // DOM элемент модального окна
let modalState = null; // Объект состояния модального окна { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
let appContextGetter = null; // Функция для получения актуального appContext
let loadDataCallback = null; // Функция для перезагрузки данных
let showEditProductModalCallback = null; // Функция для показа модального окна редактирования
let markAsSoldCallback = null; // Функция для пометки товара как проданного
let deleteProductCallback = null; // Функция для удаления товара
let cancelReservationCallback = null; // Функция для отмены резервации
let showPurchaseModalCallback = null; // Функция для показа модального окна продажи
let showReservationModalCallback = null; // Функция для показа модального окна резервации
let showOrderModalCallback = null; // Функция для показа модального окна заказа
// ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// let showModalImageCallback = null; // Функция для показа изображения в модальном окне
// Теперь используем функцию напрямую из products_modal_image.js
// ========== END REFACTORING STEP 2.1-2.2 ==========

// Инициализация зависимостей для showProductModal
export function initProductModalDependencies(dependencies) {
    modalElement = dependencies.modal;
    modalState = dependencies.modalState; // Объект состояния { currentImageLoadId, currentProduct, currentImages, currentImageIndex }
    appContextGetter = dependencies.appContext; // Функция-геттер для получения актуального appContext
    loadDataCallback = dependencies.loadData;
    showEditProductModalCallback = dependencies.showEditProductModal;
    markAsSoldCallback = dependencies.markAsSold;
    deleteProductCallback = dependencies.deleteProduct;
    cancelReservationCallback = dependencies.cancelReservation;
    showPurchaseModalCallback = dependencies.showPurchaseModal;
    showReservationModalCallback = dependencies.showReservationModal;
    showOrderModalCallback = dependencies.showOrderModal;
    // ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
    // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
    // showModalImageCallback = dependencies.showModalImage; // Функция для показа изображения
    // Теперь используем функцию напрямую из products_modal_image.js
    // ========== END REFACTORING STEP 2.1-2.2 ==========
}

// Показ модального окна товара
export function showProductModal(prod, finalPrice, fullImages) {
    if (!modalState || !modalElement) {
        return;
    }
    
    // ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
    // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
    // if (!showModalImageCallback) {
    //     return;
    // }
    // Теперь используем функцию напрямую из products_modal_image.js
    // ========== END REFACTORING STEP 2.1-2.2 ==========
    
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
    
    // ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
    // НОВЫЙ КОД (используется сейчас)
    // Показываем первое изображение
    showModalImage(0);
    // ========== END REFACTORING STEP 2.1-2.2 ==========
    // ========== REFACTORING STEP 2.1-2.2: showModalImage, updateImageNavigation ==========
    // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
    // if (showModalImageCallback) {
    //     showModalImageCallback(0);
    // } else {
    //     console.error('❌ showModalImageCallback not initialized!');
    // }
    // ========== END REFACTORING STEP 2.1-2.2 ==========
    modalElement.style.display = 'block';
}
// ========== END REFACTORING STEP 3.1 ==========

