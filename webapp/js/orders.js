// Модуль для работы с заказами
// Вынесено из app.js для рефакторинга

// Импорты API
// ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
// НОВЫЙ КОД (используется сейчас) - импорт напрямую из модуля orders.js
import { cancelOrderAPI, createOrderAPI } from './api/orders.js';
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { cancelOrderAPI, createOrderAPI } from './api.js';
// ========== END REFACTORING STEP 8 ==========
import { hideAllPages } from './operationsBase.js';
import { setupPageScrollHandler } from './operationsBase.js';

// Зависимости, которые будут переданы из app.js
let appContextGetter = null; // Функция-геттер для получения appContext
let allProductsGetter = null; // Функция-геттер для получения allProducts
let orderModalElement = null; // DOM элемент модального окна заказа (устарел)
let modalElement = null; // DOM элемент модального окна товара
let loadDataCallback = null; // Функция для загрузки данных
let updateCartUICallback = null; // Функция для обновления корзины
let loadOrdersCallback = null; // Функция для загрузки заказов

// Текущий товар для заказа (локальная переменная модуля)
let currentOrderProduct = null;
// Куда вернуться при закрытии страницы заказа: 'product-page' | 'cart-page-new'
let orderPageReturnTo = 'product-page';

// Инициализация зависимостей
export function initOrdersDependencies(dependencies) {
    appContextGetter = dependencies.appContextGetter;
    allProductsGetter = dependencies.allProductsGetter;
    orderModalElement = dependencies.orderModal;
    modalElement = dependencies.modal; // Модальное окно товара
    loadDataCallback = dependencies.loadData; // Функция загрузки данных
    updateCartUICallback = dependencies.updateCartUI; // Функция обновления корзины
    loadOrdersCallback = dependencies.loadOrders; // Функция загрузки заказов
    
    // Инициализируем глобальные функции для использования в HTML
    setupGlobalFunctions();
}

// Настройка глобальных функций для использования в HTML
function setupGlobalFunctions() {
    // Глобальная функция для отмены заказа из корзины
    window.cancelOrderFromCart = async function(orderId) {
        await cancelOrder(orderId);
        // Перезагружаем заказы в корзине
        if (loadOrdersCallback) {
            await loadOrdersCallback();
        }
        if (updateCartUICallback) {
            await updateCartUICallback();
        }
    };
    
    // Глобальная функция для очистки истории заказов
    window.clearOrdersHistory = async function() {
        const { safeConfirm, safeAlert } = await import('./telegram.js');
        
        const confirmed = await safeConfirm('Вы уверены, что хотите очистить всю историю заказов? Это действие нельзя отменить.');
        if (!confirmed) {
            return;
        }
        
        try {
            // ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
            // НОВЫЙ КОД (используется сейчас) - импорт напрямую из модуля orders.js
            const { clearOrdersHistoryAPI } = await import('./api/orders.js');
            // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
            // const { clearOrdersHistoryAPI } = await import('./api.js');
            // ========== END REFACTORING STEP 8 ==========
            const result = await clearOrdersHistoryAPI();
            await safeAlert(`✅ История заказов очищена (удалено ${result.deleted_count || 0} записей)`);
            
            // Перезагружаем историю
            // ========== REFACTORING STEP 4.2: cartHistory.js ==========
            // НОВЫЙ КОД (используется сейчас)
            const { loadOrdersHistory } = await import('./cart/cartHistory.js');
            await loadOrdersHistory();
            // СТАРЫЙ КОД (закомментирован, будет удален после проверки)
            /*
            const { loadOrdersHistory } = await import('./cart.js');
            await loadOrdersHistory();
            */
            // ========== END REFACTORING STEP 4.2 ==========
        } catch (e) {
            console.error('Clear orders history error:', e);
            await safeAlert(`❌ Ошибка: ${e.message}`);
        }
    };
}

/**
 * Закрытие страницы заказа, возврат на product-page или cart-page-new.
 * Сначала снимаем is-active и скрываем (state-класс после батча #2), затем показываем целевую страницу.
 */
export function closeOrderPage() {
    const orderPage = document.getElementById('order-page');
    const returnPage = document.getElementById(orderPageReturnTo);
    if (orderPage) {
        orderPage.classList.remove('is-active');
        orderPage.style.display = 'none';
    }
    if (returnPage) {
        returnPage.classList.add('is-active');
        returnPage.style.display = 'block';
    }
}

/**
 * Показ страницы оформления заказа (вместо модального окна)
 * @param {string} productId - ID товара
 * @param {boolean} fromCart - true если открыто из корзины (назад → корзина)
 */
export function showOrderPage(productId, fromCart = false) {
    orderPageReturnTo = fromCart ? 'cart-page-new' : 'product-page';
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    const orderPage = document.getElementById('order-page');
    if (!orderPage) {
        alert('❌ Ошибка: страница заказа не найдена');
        return;
    }
    hideAllPages();
    orderPage.classList.add('is-active');
    orderPage.style.display = 'block';
    orderPage.scrollTop = 0;
    const backBtn = document.getElementById('order-page-back');
    if (backBtn) backBtn.onclick = closeOrderPage;
    setupPageScrollHandler(orderPage);
    // Заполнение и обработчики — те же, что в showOrderModal
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        alert('❌ Товар не найден');
        return;
    }
    currentOrderProduct = product;
    resetOrderForm();
    const quantityInput = document.getElementById('order-quantity');
    if (quantityInput) {
        import('./orderStore.js').then(({ getOrderQuantity }) => {
            try {
                const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : null;
                const activeReservationsCount = product.reservation && product.reservation.active_count ? product.reservation.active_count : 0;
                const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
                    ? Math.max(0, productQuantity - activeReservationsCount)
                    : null;
                let selectedQuantity = getOrderQuantity(productId, 1);
                if (selectedQuantity < 1) selectedQuantity = 1;
                else if (maxQuantity !== null && selectedQuantity > maxQuantity) selectedQuantity = Math.max(1, maxQuantity);
                quantityInput.value = selectedQuantity;
                updateOrderProductSummary(product);
            } catch (error) {
                console.error('❌ Error getting order quantity from store:', error);
                quantityInput.value = 1;
            }
        }).catch(() => { if (quantityInput) quantityInput.value = 1; });
    }
    updateOrderProductSummary(product);
    showOrderStep(1);
    setupOrderFormHandlers(productId);
}

// Показ модального окна заказа (устарело: используется showOrderPage)
export function showOrderModal(productId) {
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    if (!orderModalElement) {
        alert('❌ Ошибка: модальное окно заказа не найдено');
        return;
    }
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        alert('❌ Товар не найден');
        return;
    }
    currentOrderProduct = product;
    resetOrderForm();
    const quantityInput = document.getElementById('order-quantity');
    if (quantityInput) {
        import('./orderStore.js').then(({ getOrderQuantity }) => {
            try {
                const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : null;
                const activeReservationsCount = product.reservation && product.reservation.active_count ? product.reservation.active_count : 0;
                const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
                    ? Math.max(0, productQuantity - activeReservationsCount)
                    : null;
                let selectedQuantity = getOrderQuantity(productId, 1);
                if (selectedQuantity < 1) selectedQuantity = 1;
                else if (maxQuantity !== null && selectedQuantity > maxQuantity) selectedQuantity = Math.max(1, maxQuantity);
                quantityInput.value = selectedQuantity;
                updateOrderProductSummary(product);
            } catch (error) {
                quantityInput.value = 1;
            }
        }).catch(() => { if (quantityInput) quantityInput.value = 1; });
    }
    updateOrderProductSummary(product);
    showOrderStep(1);
    setupOrderFormHandlers(productId);
    orderModalElement.classList.add('is-open');
    orderModalElement.style.display = 'flex';
}

// Сброс формы заказа
export function resetOrderForm() {
    document.getElementById('order-promo-code').value = '';
    // Количество будет установлено из store в showOrderModal
    document.getElementById('order-quantity').value = 1;
    document.getElementById('order-first-name').value = '';
    document.getElementById('order-last-name').value = '';
    document.getElementById('order-middle-name').value = '';
    document.getElementById('order-phone-country-code').value = '+7';
    document.getElementById('order-phone-number').value = '';
    document.getElementById('order-email').value = '';
    document.getElementById('order-notes').value = '';
    document.querySelector('input[name="delivery-method"][value="delivery"]').checked = true;
}

// Обновление информации о товаре в форме
export function updateOrderProductSummary(product) {
    const summaryDiv = document.getElementById('order-product-summary');
    const totalDiv = document.getElementById('order-total');
    
    if (!summaryDiv || !totalDiv) return;
    
    const finalPrice = product.discount > 0 
        ? Math.round(product.price * (1 - product.discount / 100)) 
        : product.price;
    
    summaryDiv.innerHTML = `
        <h3>${product.name}</h3>
        <div class="product-price">${finalPrice} ₽</div>
    `;
    
    // Обновляем итого при изменении количества
    const quantityInput = document.getElementById('order-quantity');
    const updateTotal = () => {
        const quantity = parseInt(quantityInput.value) || 1;
        const total = finalPrice * quantity;
        totalDiv.textContent = `Итого: ${total} ₽`;
    };
    
    // Обработчик изменения количества с синхронизацией в store
    quantityInput.oninput = () => {
        const value = parseInt(quantityInput.value) || 1;
        let validatedValue = value;
        
        // Валидация: ограничиваем значение максимумом и минимумом 1
        if (value < 1) {
            validatedValue = 1;
            quantityInput.value = validatedValue;
        }
        
        // Получаем доступное количество для валидации
        const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : null;
        const activeReservationsCount = product.reservation && product.reservation.active_count 
            ? product.reservation.active_count 
            : 0;
        const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
            ? Math.max(0, productQuantity - activeReservationsCount)
            : null;
        
        if (maxQuantity !== null && validatedValue > maxQuantity) {
            validatedValue = maxQuantity;
            quantityInput.value = validatedValue;
        }
        
        // Обновляем итого
        updateTotal();
        
        // Синхронизируем с единым store (без блокировки)
        import('./orderStore.js').then(({ setOrderQuantity }) => {
            setOrderQuantity(product.id, validatedValue);
        }).catch((error) => {
            console.error('❌ Error syncing order quantity on input:', error);
        });
    };
    
    updateTotal();
}

// Показ шага формы заказа
export function showOrderStep(step) {
    // Скрываем все шаги
    for (let i = 1; i <= 3; i++) {
        const stepDiv = document.getElementById(`order-step-${i}`);
        if (stepDiv) {
            stepDiv.classList.remove('active');
        }
    }
    
    // Показываем нужный шаг
    const stepDiv = document.getElementById(`order-step-${step}`);
    if (stepDiv) {
        stepDiv.classList.add('active');
    }
}

// Настройка обработчиков формы заказа
export function setupOrderFormHandlers(productId) {
    // Шаг 1: Продолжить
    const step1Next = document.getElementById('order-step-1-next');
    if (step1Next) {
        step1Next.onclick = () => {
            const quantityInput = document.getElementById('order-quantity');
            let quantity = parseInt(quantityInput.value) || 1;
            
            // ВАЛИДАЦИЯ: Проверяем количество перед переходом к следующему шагу
            if (quantity < 1) {
                alert('❌ Количество должно быть не менее 1');
                quantity = 1;
                quantityInput.value = quantity;
                return;
            }
            
            // Получаем доступное количество товара для валидации
            const product = currentOrderProduct;
            if (product) {
                const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : null;
                const activeReservationsCount = product.reservation && product.reservation.active_count 
                    ? product.reservation.active_count 
                    : 0;
                const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
                    ? Math.max(0, productQuantity - activeReservationsCount)
                    : null;
                
                if (maxQuantity !== null && quantity > maxQuantity) {
                    alert(`❌ Недостаточно товара. Доступно для заказа: ${maxQuantity} шт.`);
                    quantity = maxQuantity;
                    quantityInput.value = quantity;
                    return;
                }
            }
            
            // Синхронизируем финальное значение с store перед переходом
            import('./orderStore.js').then(({ setOrderQuantity }) => {
                setOrderQuantity(productId, quantity);
            }).catch((error) => {
                console.error('❌ Error syncing order quantity before step 2:', error);
            });
            
            showOrderStep(2);
        };
    }
    
    // Шаг 2: Назад
    const step2Back = document.getElementById('order-step-2-back');
    if (step2Back) {
        step2Back.onclick = () => showOrderStep(1);
    }
    
    // Шаг 2: Продолжить
    const step2Next = document.getElementById('order-step-2-next');
    if (step2Next) {
        step2Next.onclick = () => {
            const firstName = document.getElementById('order-first-name').value.trim();
            const lastName = document.getElementById('order-last-name').value.trim();
            const phoneNumber = document.getElementById('order-phone-number').value.trim();
            
            if (!firstName) {
                alert('❌ Пожалуйста, введите имя');
                return;
            }
            if (!lastName) {
                alert('❌ Пожалуйста, введите фамилию');
                return;
            }
            if (!phoneNumber) {
                alert('❌ Пожалуйста, введите номер телефона');
                return;
            }
            
            showOrderStep(3);
        };
    }
    
    // Шаг 3: Назад
    const step3Back = document.getElementById('order-step-3-back');
    if (step3Back) {
        step3Back.onclick = () => showOrderStep(2);
    }
    
    // Шаг 3: Оформить заказ
    const step3Submit = document.getElementById('order-step-3-submit');
    if (step3Submit) {
        step3Submit.onclick = async () => {
            await submitOrder(productId);
        };
    }
}

// Отправка заказа
export async function submitOrder(productId) {
    try {
        const appContext = appContextGetter ? appContextGetter() : null;
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Собираем данные формы
        let quantity = parseInt(document.getElementById('order-quantity').value) || 1;
        
        // ВАЛИДАЦИЯ: Проверяем количество перед подтверждением заказа
        const product = currentOrderProduct;
        if (product) {
            const productQuantity = product.quantity !== undefined && product.quantity !== null ? product.quantity : null;
            const activeReservationsCount = product.reservation && product.reservation.active_count 
                ? product.reservation.active_count 
                : 0;
            const maxQuantity = productQuantity !== null && productQuantity !== undefined && productQuantity > 0
                ? Math.max(0, productQuantity - activeReservationsCount)
                : null;
            
            if (quantity < 1) {
                alert('❌ Количество должно быть не менее 1');
                return;
            }
            
            if (maxQuantity !== null && quantity > maxQuantity) {
                alert(`❌ Недостаточно товара. Доступно для заказа: ${maxQuantity} шт.`);
                quantity = maxQuantity;
                document.getElementById('order-quantity').value = quantity;
                return;
            }
        }
        
        const orderData = {
            product_id: productId,
            quantity: quantity,
            promo_code: document.getElementById('order-promo-code').value.trim() || null,
            first_name: document.getElementById('order-first-name').value.trim(),
            last_name: document.getElementById('order-last-name').value.trim(),
            middle_name: document.getElementById('order-middle-name').value.trim() || null,
            phone_country_code: document.getElementById('order-phone-country-code').value,
            phone_number: document.getElementById('order-phone-number').value.trim(),
            email: document.getElementById('order-email').value.trim() || null,
            notes: document.getElementById('order-notes').value.trim() || null,
            delivery_method: document.querySelector('input[name="delivery-method"]:checked').value
        };
        
        // Проверяем обязательные поля
        if (!orderData.first_name || !orderData.last_name || !orderData.phone_number) {
            alert('❌ Пожалуйста, заполните все обязательные поля');
            return;
        }
        
        // Отправляем заказ
        const order = await createOrderAPI(orderData);
        
        // Очищаем сохраненное количество после успешного создания заказа (без блокировки)
        import('./orderStore.js').then(({ clearOrderQuantity }) => {
            clearOrderQuantity(productId);
        }).catch((error) => {
            console.error('❌ Error clearing order quantity after creation:', error);
        });
        
        alert(`✅ Заказ оформлен! Статус: ожидание`);
        
        const orderPage = document.getElementById('order-page');
        if (orderPage && orderPage.classList.contains('is-active')) {
            closeOrderPage();
        } else {
            if (orderModalElement) orderModalElement.style.display = 'none';
        }
        if (modalElement) {
            modalElement.style.display = 'none';
        }
        document.body.style.overflow = 'auto';
        
        // Обновляем данные и корзину
        setTimeout(async () => {
            if (loadDataCallback) {
                await loadDataCallback();
            }
            if (updateCartUICallback) {
                await updateCartUICallback();
            }
            // Обновляем индикаторы активности
            const { updateActivityCounts } = await import('./activityIndicators.js');
            await updateActivityCounts();
        }, 500);
    } catch (e) {
        console.error('Order error:', e);
        alert(`❌ Ошибка при оформлении заказа: ${e.message}`);
    }
}

// Создание заказа (старая функция для обратной совместимости)
export async function createOrder(productId, quantity) {
    // Эта функция больше не используется, но оставляем для совместимости
    await submitOrder(productId);
}

// Отмена заказа
export async function cancelOrder(orderId) {
    const { safeConfirm, safeAlert } = await import('./telegram.js');
    
    const confirmed = await safeConfirm('Вы уверены, что хотите отменить этот заказ?');
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
        await cancelOrderAPI(orderId);
        await safeAlert('✅ Заказ отменен');
        
        setTimeout(async () => {
            if (loadDataCallback) {
                await loadDataCallback();
            }
            if (updateCartUICallback) {
                await updateCartUICallback();
            }
            // Обновляем индикаторы активности
            const { updateActivityCounts } = await import('./activityIndicators.js');
            await updateActivityCounts();
        }, 500);
    } catch (e) {
        console.error('Cancel order error:', e);
        await safeAlert(`❌ Ошибка: ${e.message}`);
    }
}

// Экспортируем геттер для получения currentOrderProduct (если нужен в других модулях)
export function getCurrentOrderProduct() {
    return currentOrderProduct;
}

