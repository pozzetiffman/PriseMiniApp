// Модуль для работы с резервациями
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { updateActivityCounts } from './activityIndicators.js';
import { getCurrentShopSettings } from './admin.js';
import { cancelReservationAPI, createReservationAPI } from './api.js';
import { closeProductPage } from './handlers/products_modal.js';

// Зависимости, которые будут переданы из app.js
let appContextGetter = null; // Функция-геттер для получения appContext
let currentProductGetter = null; // Функция-геттер для получения currentProduct
let allProductsGetter = null; // Функция-геттер для получения allProducts
let reservationModalElement = null; // DOM элемент модального окна резервации
let modalElement = null; // DOM элемент модального окна товара
let loadDataCallback = null; // Функция для загрузки данных
let updateCartUICallback = null; // Функция для обновления корзины
let loadCartCallback = null; // Функция для загрузки корзины

// Инициализация зависимостей
export function initReservationsDependencies(dependencies) {
    appContextGetter = dependencies.appContextGetter;
    currentProductGetter = dependencies.currentProductGetter;
    allProductsGetter = dependencies.allProductsGetter;
    reservationModalElement = dependencies.reservationModal;
    modalElement = dependencies.modal; // Модальное окно товара
    loadDataCallback = dependencies.loadData; // Функция загрузки данных
    updateCartUICallback = dependencies.updateCartUI; // Функция обновления корзины
    loadCartCallback = dependencies.loadCart; // Функция загрузки корзины
    
    // Инициализируем глобальные функции для использования в HTML
    setupGlobalFunctions();
}

// Настройка глобальных функций для использования в HTML
function setupGlobalFunctions() {
    // Глобальная функция для отмены резервации из корзины
    window.cancelReservationFromCart = async function(reservationId, productId) {
        await cancelReservation(reservationId, productId);
        if (loadCartCallback) {
            loadCartCallback();
        }
        if (updateCartUICallback) {
            await updateCartUICallback();
        }
    };
    
    // Глобальная функция для очистки истории резерваций
    window.clearReservationsHistory = async function() {
        const { safeConfirm, safeAlert } = await import('./telegram.js');
        
        const confirmed = await safeConfirm('Вы уверены, что хотите очистить всю историю резерваций? Это действие нельзя отменить.');
        if (!confirmed) {
            return;
        }
        
        try {
            const { clearReservationsHistoryAPI } = await import('./api.js');
            const result = await clearReservationsHistoryAPI();
            await safeAlert(`✅ История резерваций очищена (удалено ${result.deleted_count || 0} записей)`);
            
            // Перезагружаем историю
            // ========== REFACTORING STEP 4.1: cartHistory.js ==========
            // НОВЫЙ КОД (используется сейчас)
            const { loadReservationsHistory } = await import('./cart/cartHistory.js');
            await loadReservationsHistory();
            // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
            /*
            const { loadReservationsHistory } = await import('./cart.js');
            await loadReservationsHistory();
            */
            // ========== END REFACTORING STEP 4.1 ==========
        } catch (e) {
            console.error('Clear reservations history error:', e);
            await safeAlert(`❌ Ошибка: ${e.message}`);
        }
    };
}

// Показ модального окна резервации
export function showReservationModal(productId) {
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    // Находим товар в текущем списке (используем allProducts или currentProduct)
    const currentProduct = currentProductGetter ? currentProductGetter() : null;
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    
    let product = currentProduct; // Сначала пробуем текущий товар из модального окна
    if (!product || product.id !== productId) {
        // Если не совпадает, ищем в allProducts
        product = allProducts.find(p => p.id === productId);
    }
    if (!product) {
        console.error('❌ Product not found:', productId, 'allProducts length:', allProducts.length);
        alert('❌ Ошибка: товар не найден');
        return;
    }
    
    const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : 0;
    console.log('🔒 showReservationModal:', { productId, productQuantity, productName: product.name, quantity_show_enabled: product.quantity_show_enabled });
    
    // Проверяем, включен ли показ количества в настройках
    const shopSettings = getCurrentShopSettings();
    const globalQuantityEnabled = shopSettings ? (shopSettings.quantity_enabled !== false) : true;
    
    // Определяем, какую настройку использовать для резервации: индивидуальную или общую
    let quantityEnabled;
    if (product.quantity_show_enabled === null || product.quantity_show_enabled === undefined) {
        quantityEnabled = globalQuantityEnabled;
    } else {
        quantityEnabled = product.quantity_show_enabled === true || product.quantity_show_enabled === 1 || product.quantity_show_enabled === 'true' || product.quantity_show_enabled === '1';
    }
    console.log('🔒 quantityEnabled:', { globalQuantityEnabled, individualSetting: product.quantity_show_enabled, finalQuantityEnabled: quantityEnabled });
    
    const quantityContainer = document.getElementById('reservation-quantity-container');
    const quantityInput = document.getElementById('reservation-quantity');
    const quantityInfo = document.getElementById('reservation-quantity-info');
    
    if (!quantityContainer || !quantityInput || !quantityInfo) {
        console.error('❌ Reservation modal elements not found!', { quantityContainer, quantityInput, quantityInfo });
        alert('❌ Ошибка: элементы модального окна не найдены');
        return;
    }
    
    // Сбрасываем состояние disabled при каждом открытии модального окна
    quantityInput.disabled = false;
    
    // Показываем выбор количества если quantity_enabled включен
    if (quantityEnabled) {
        console.log('🔒 Showing quantity selector for product with quantity:', productQuantity);
        quantityContainer.style.display = 'block';
        
        // Если quantity не указан или равен 0, считаем что товар в наличии (неограниченное количество)
        const hasQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0;
        
        if (hasQuantity) {
            // Показываем информацию о доступном количестве
            const activeReservationsCount = product.reservation && product.reservation.active_count ? product.reservation.active_count : 0;
            const availableCount = Math.max(0, productQuantity - activeReservationsCount);
            const quantityUnit = product.quantity_unit || 'шт';
            
            // СИНХРОНИЗАЦИЯ: Получаем выбранное количество из единого store
            let selectedQuantity = Math.min(1, availableCount);
            // Используем динамический импорт без await, чтобы не блокировать
            import('./reservationStore.js').then(({ getReservationQuantity }) => {
                try {
                    const storedQuantity = getReservationQuantity(productId, 1);
                    // Валидируем сохраненное количество
                    if (storedQuantity >= 1 && storedQuantity <= availableCount) {
                        selectedQuantity = storedQuantity;
                        quantityInput.value = selectedQuantity;
                    }
                } catch (error) {
                    console.error('❌ Error getting reservation quantity from store:', error);
                }
            }).catch((error) => {
                console.error('❌ Error importing reservationStore:', error);
            });
            
            // Устанавливаем максимальное значение для input
            quantityInput.max = availableCount;
            quantityInput.value = selectedQuantity;
            
            // Обновляем информацию о доступном количестве
            if (availableCount > 0) {
                quantityInfo.textContent = `Доступно для резервации: ${availableCount} из ${productQuantity} ${quantityUnit}`;
            } else {
                quantityInfo.textContent = `❌ Нет доступных единиц для резервации (зарезервировано: ${activeReservationsCount} из ${productQuantity} ${quantityUnit})`;
                quantityInput.disabled = true;
            }
            
            // Обновляем max при изменении и синхронизируем с store
            quantityInput.oninput = async () => {
                const value = parseInt(quantityInput.value) || 1;
                let validatedValue = value;
                if (value > availableCount) {
                    validatedValue = availableCount;
                    quantityInput.value = validatedValue;
                }
                if (value < 1) {
                    validatedValue = 1;
                    quantityInput.value = validatedValue;
                }
                
                // Синхронизируем с единым store (без блокировки)
                import('./reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(productId, validatedValue);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity on input:', error);
                });
            };
        } else {
            // Если quantity не указан, считаем что товар в наличии (неограниченное количество)
            // СИНХРОНИЗАЦИЯ: Получаем выбранное количество из единого store
            let selectedQuantity = 1;
            // Используем динамический импорт без await, чтобы не блокировать
            import('./reservationStore.js').then(({ getReservationQuantity }) => {
                try {
                    const storedQuantity = getReservationQuantity(productId, 1);
                    if (storedQuantity >= 1) {
                        selectedQuantity = storedQuantity;
                        quantityInput.value = selectedQuantity;
                    }
                } catch (error) {
                    console.error('❌ Error getting reservation quantity from store:', error);
                }
            }).catch((error) => {
                console.error('❌ Error importing reservationStore:', error);
            });
            
            quantityInput.max = ''; // Убираем ограничение
            quantityInput.value = selectedQuantity;
            quantityInfo.textContent = 'Введите количество для резервации';
            
            // Обновляем max при изменении и синхронизируем с store
            quantityInput.oninput = async () => {
                const value = parseInt(quantityInput.value) || 1;
                let validatedValue = value;
                if (value < 1) {
                    validatedValue = 1;
                    quantityInput.value = validatedValue;
                }
                
                // Синхронизируем с единым store (без блокировки)
                import('./reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(productId, validatedValue);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity on input:', error);
                });
            };
        }
    } else {
        // Если quantity_enabled выключен, скрываем выбор количества
        console.log('🔒 Hiding quantity selector: quantity_enabled=false');
        quantityContainer.style.display = 'none';
    }
    
    if (!reservationModalElement) {
        console.error('❌ Reservation modal not found!');
        alert('❌ Ошибка: модальное окно резервации не найдено');
        return;
    }
    
    console.log('🔒 Opening reservation modal');
    reservationModalElement.style.display = 'flex';
    
    // Убеждаемся, что обработчики событий устанавливаются заново каждый раз
    const options = document.querySelectorAll('.reservation-option');
    console.log('🔒 Found reservation options:', options.length);
    
    if (options.length === 0) {
        console.error('❌ No reservation options found!');
        alert('❌ Ошибка: кнопки выбора времени не найдены');
        return;
    }
    
    options.forEach((option, index) => {
        // Удаляем старые обработчики
        const newOption = option.cloneNode(true);
        option.parentNode.replaceChild(newOption, option);
        
        newOption.onclick = async () => {
            const hours = parseInt(newOption.dataset.hours);
            let quantity = 1;
            
            console.log('🔒 Reservation option clicked:', { hours, productQuantity, quantityEnabled, containerDisplay: quantityContainer ? quantityContainer.style.display : 'not found' });
            
            // Если показывается выбор количества (quantity_enabled включен), берем значение из input
            if (quantityEnabled && quantityContainer && quantityContainer.style.display !== 'none') {
                quantity = parseInt(quantityInput.value) || 1;
                
                // ВАЛИДАЦИЯ: Проверяем количество перед подтверждением резервации
                // Проверяем количество только если оно указано для товара
                const hasQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0;
                if (hasQuantity) {
                    const activeReservationsCount = product.reservation && product.reservation.active_count ? product.reservation.active_count : 0;
                    const availableCount = Math.max(0, productQuantity - activeReservationsCount);
                    const quantityUnit = product.quantity_unit || 'шт';
                    console.log('🔒 Quantity check:', { quantity, availableCount, productQuantity, activeReservationsCount });
                    if (quantity > availableCount) {
                        alert(`❌ Недостаточно товара. Доступно для резервации: ${availableCount} ${quantityUnit}`);
                        return;
                    }
                }
                
                if (quantity < 1) {
                    alert('❌ Количество должно быть не менее 1');
                    return;
                }
                
                // Синхронизируем финальное значение с store перед созданием резервации (без блокировки)
                import('./reservationStore.js').then(({ setReservationQuantity }) => {
                    setReservationQuantity(productId, quantity);
                }).catch((error) => {
                    console.error('❌ Error syncing reservation quantity before creation:', error);
                });
            } else {
                console.log('🔒 Using default quantity=1 (quantity selector not shown)');
            }
            
            console.log('🔒 Creating reservation with:', { productId, hours, quantity });
            reservationModalElement.style.display = 'none';
            await createReservation(productId, hours, quantity);
        };
    });
    
    console.log('🔒 Reservation modal setup complete');
}

// Создание резервации
export async function createReservation(productId, hours, quantity = 1) {
    try {
        console.log('🔒 createReservation called:', { productId, hours, quantity });
        const appContext = appContextGetter ? appContextGetter() : null;
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // reserved_by_user_id определяется на backend из initData
        console.log('🔒 Calling createReservationAPI with quantity:', quantity);
        const reservation = await createReservationAPI(productId, hours, quantity);
        console.log('✅ Reservation created:', reservation);
        
        // Очищаем сохраненное количество после успешного создания резервации (без блокировки)
        import('./reservationStore.js').then(({ clearReservationQuantity }) => {
            clearReservationQuantity(productId);
        }).catch((error) => {
            console.error('❌ Error clearing reservation quantity after creation:', error);
        });
        
        const quantityText = quantity > 1 ? ` (${quantity} шт.)` : '';
        alert(`✅ Товар зарезервирован на ${hours} ${hours === 1 ? 'час' : hours === 2 ? 'часа' : 'часов'}${quantityText}`);
        
        // Закрываем страницу товара вместо модального окна
        try {
            if (typeof closeProductPage === 'function') {
                closeProductPage();
            } else {
                console.warn('⚠️ closeProductPage is not a function');
            }
        } catch (e) {
            console.error('❌ Error closing product page:', e);
        }
        
        // Обновляем данные и корзину
        setTimeout(async () => {
            if (loadDataCallback) {
                await loadDataCallback();
            }
            if (updateCartUICallback) {
                await updateCartUICallback();
            }
            // Обновляем индикаторы активности
            await updateActivityCounts();
        }, 500);
    } catch (e) {
        console.error('Reservation error:', e);
        alert(`❌ Ошибка при резервации: ${e.message}`);
    }
}

// Отмена резервации
export async function cancelReservation(reservationId, productId) {
    const { safeConfirm, safeAlert } = await import('./telegram.js');
    
    const confirmed = await safeConfirm('Вы уверены, что хотите снять резервацию с этого товара?');
    if (!confirmed) {
        return;
    }
    
    try {
        const appContext = appContextGetter ? appContextGetter() : null;
        if (!appContext) {
            await safeAlert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // user_id определяется на backend из initData
        await cancelReservationAPI(reservationId);
        await safeAlert('✅ Резервация снята');
        
        // Закрываем страницу товара вместо модального окна
        try {
            if (typeof closeProductPage === 'function') {
                closeProductPage();
            } else {
                console.warn('⚠️ closeProductPage is not a function');
            }
        } catch (e) {
            console.error('❌ Error closing product page:', e);
        }
        document.body.style.overflow = 'auto';
        
        setTimeout(async () => {
            if (loadDataCallback) {
                await loadDataCallback();
            }
            if (updateCartUICallback) {
                await updateCartUICallback();
            }
            // Обновляем индикаторы активности
            await updateActivityCounts();
        }, 500);
    } catch (e) {
        console.error('Cancel reservation error:', e);
        await safeAlert(`❌ Ошибка: ${e.message}`);
    }
}

