// Модуль для работы с заказами
// Вынесено из app.js для рефакторинга

// Импорты API
// ========== REFACTORING STEP 8: Исправление циклической зависимости ==========
// НОВЫЙ КОД (используется сейчас) - импорт напрямую из модуля orders.js
import { cancelOrderAPI, createOrderAPI } from './api/orders.js';
// СТАРЫЙ КОД (закомментирован, будет удален после проверки)
// import { cancelOrderAPI, createOrderAPI } from './api.js';
// ========== END REFACTORING STEP 8 ==========

// Зависимости, которые будут переданы из app.js
let appContextGetter = null; // Функция-геттер для получения appContext
let allProductsGetter = null; // Функция-геттер для получения allProducts
let orderModalElement = null; // DOM элемент модального окна заказа
let modalElement = null; // DOM элемент модального окна товара
let loadDataCallback = null; // Функция для загрузки данных
let updateCartUICallback = null; // Функция для обновления корзины
let loadOrdersCallback = null; // Функция для загрузки заказов

// Текущий товар для заказа (локальная переменная модуля)
let currentOrderProduct = null;

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

// Показ модального окна заказа
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
    
    // Находим товар
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        alert('❌ Товар не найден');
        return;
    }
    
    currentOrderProduct = product;
    
    // Сбрасываем форму
    resetOrderForm();
    
    // Показываем информацию о товаре
    updateOrderProductSummary(product);
    
    // Показываем первый шаг
    showOrderStep(1);
    
    // Устанавливаем обработчики
    setupOrderFormHandlers(productId);
    
    orderModalElement.style.display = 'block';
}

// Сброс формы заказа
export function resetOrderForm() {
    document.getElementById('order-promo-code').value = '';
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
    
    quantityInput.oninput = updateTotal;
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
            const quantity = parseInt(document.getElementById('order-quantity').value) || 1;
            if (quantity < 1) {
                alert('❌ Количество должно быть не менее 1');
                return;
            }
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
        const orderData = {
            product_id: productId,
            quantity: parseInt(document.getElementById('order-quantity').value) || 1,
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
        
        alert(`✅ Заказ оформлен! Статус: ожидание`);
        
        if (orderModalElement) {
            orderModalElement.style.display = 'none';
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

