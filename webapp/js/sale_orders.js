// Модуль для работы с заказами на покупку (когда мы продаем товар клиенту)
// Аналогично orders.js, но для заказов на покупку

// Импорт утилит для работы с ценами
import { getProductPriceDisplay } from './utils/priceUtils.js';

// Вспомогательные функции для работы с ценами

/**
 * Получить числовое значение цены товара (для расчетов)
 * @param {Object} product - Объект товара
 * @returns {number|null} Числовое значение цены или null, если цена по запросу
 */
function getProductNumericPrice(product) {
    if (!product) return null;
    
    // Для товаров на продажу (is_for_sale)
    const isForSale = product.is_for_sale === true || 
                     product.is_for_sale === 1 || 
                     product.is_for_sale === '1' ||
                     product.is_for_sale === 'true' ||
                     String(product.is_for_sale).toLowerCase() === 'true';
    
    if (isForSale) {
        const priceType = product.price_type || 'range';
        if (priceType === 'fixed') {
            // Фиксированная цена
            if (product.price_fixed != null && product.price_fixed !== '' && product.price_fixed !== undefined) {
                const fixedPrice = Number(product.price_fixed);
                if (!isNaN(fixedPrice) && isFinite(fixedPrice) && fixedPrice > 0) {
                    return fixedPrice;
                }
            }
        } else if (priceType === 'range') {
            // Для диапазона берем минимальную цену (price_from)
            if (product.price_from != null && product.price_from !== '') {
                const fromPrice = Number(product.price_from);
                if (!isNaN(fromPrice) && isFinite(fromPrice) && fromPrice > 0) {
                    return fromPrice;
                }
            }
        }
        return null; // Цена по запросу
    } else {
        // Обычная цена со скидкой
        if (product.price != null && product.price !== '' && product.price !== undefined) {
            const basePrice = Number(product.price);
            if (!isNaN(basePrice) && isFinite(basePrice) && basePrice > 0) {
                // Применяем скидку
                const finalPrice = product.discount > 0 
                    ? Math.round(basePrice * (1 - product.discount / 100)) 
                    : basePrice;
                return finalPrice;
            }
        }
        return null; // Цена по запросу
    }
}

/**
 * Форматировать цену для отображения
 * @param {number} price - Цена
 * @returns {string} Отформатированная строка
 */
function formatPrice(price) {
    if (price == null || isNaN(price) || !isFinite(price)) {
        return 'Цена по запросу';
    }
    // Форматируем с пробелами для тысяч
    return `${Math.round(price).toLocaleString('ru-RU')} ₽`;
}

// Зависимости, которые будут переданы из app.js
let appContextGetter = null; // Функция-геттер для получения appContext
let allProductsGetter = null; // Функция-геттер для получения allProducts
let saleOrderPageElement = null; // DOM элемент страницы заказа на покупку
let loadDataCallback = null; // Функция для загрузки данных
let updateCartUICallback = null; // Функция для обновления корзины
let loadSaleOrdersCallback = null; // Функция для загрузки заказов на покупку
let closeProductPageCallback = null; // Функция для закрытия страницы товара

// Текущий товар для заказа (локальная переменная модуля)
let currentSaleOrderProduct = null;
let currentSaleOrderStep = 1;

// Инициализация зависимостей
export function initSaleOrdersDependencies(dependencies) {
    console.log('📦 [SALE ORDER] initSaleOrdersDependencies called with:', {
        hasAppContextGetter: !!dependencies.appContextGetter,
        hasAllProductsGetter: !!dependencies.allProductsGetter,
        saleOrderPage: dependencies.saleOrderPage,
        hasLoadData: !!dependencies.loadData,
        hasUpdateCartUI: !!dependencies.updateCartUI,
        hasLoadSaleOrders: !!dependencies.loadSaleOrders,
        hasCloseProductPage: !!dependencies.closeProductPage
    });
    
    appContextGetter = dependencies.appContextGetter;
    allProductsGetter = dependencies.allProductsGetter;
    saleOrderPageElement = dependencies.saleOrderPage;
    loadDataCallback = dependencies.loadData;
    updateCartUICallback = dependencies.updateCartUI;
    loadSaleOrdersCallback = dependencies.loadSaleOrders;
    closeProductPageCallback = dependencies.closeProductPage;
    
    console.log('📦 [SALE ORDER] Dependencies initialized:', {
        appContextGetter: !!appContextGetter,
        allProductsGetter: !!allProductsGetter,
        saleOrderPageElement: !!saleOrderPageElement,
        loadDataCallback: !!loadDataCallback,
        updateCartUICallback: !!updateCartUICallback,
        loadSaleOrdersCallback: !!loadSaleOrdersCallback,
        closeProductPageCallback: !!closeProductPageCallback
    });
    
    // Настраиваем обработчики закрытия страницы
    setupSaleOrderPageCloseHandlers();
    console.log('✅ [SALE ORDER] initSaleOrdersDependencies completed');
}

// Настройка обработчиков закрытия страницы
function setupSaleOrderPageCloseHandlers() {
    if (!saleOrderPageElement) return;
    
    // Закрытие по клику на кнопку "Назад"
    const backBtn = saleOrderPageElement.querySelector('#sale-order-page-back');
    if (backBtn) {
        backBtn.onclick = () => {
            closeSaleOrderPage();
        };
    }
}

// Показ страницы заказа на покупку
export function showSaleOrderModal(product) {
    console.log('📦 [SALE ORDER] showSaleOrderModal called with product:', product?.id, product?.name);
    console.log('📦 [SALE ORDER] saleOrderPageElement:', saleOrderPageElement);
    console.log('📦 [SALE ORDER] appContextGetter:', appContextGetter);
    
    const appContext = appContextGetter ? appContextGetter() : null;
    console.log('📦 [SALE ORDER] appContext:', appContext);
    
    if (!appContext) {
        console.error('❌ [SALE ORDER] appContext is null');
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    if (!saleOrderPageElement) {
        console.error('❌ [SALE ORDER] saleOrderPageElement is null');
        alert('❌ Ошибка: страница заказа на покупку не найдена');
        return;
    }
    
    console.log('📦 [SALE ORDER] Setting up page...');
    currentSaleOrderProduct = product;
    currentSaleOrderStep = 1;
    
    // Скрываем все страницы
    const mainContent = document.getElementById('main-content');
    const productPage = document.getElementById('product-page');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPage = document.getElementById('cart-page');
    const adminPage = document.getElementById('admin-page');
    
    if (mainContent) mainContent.style.display = 'none';
    if (productPage) productPage.style.display = 'none';
    if (favoritesPage) favoritesPage.style.display = 'none';
    if (cartPage) cartPage.style.display = 'none';
    if (adminPage) adminPage.style.display = 'none';
    
    // Сбрасываем форму
    resetSaleOrderForm();
    
    // Показываем первый шаг
    showSaleOrderStep(1);
    
    // Показываем информацию о товаре (асинхронно, чтобы не блокировать)
    updateSaleOrderProductSummary(product).catch(err => {
        console.error('❌ [SALE ORDER] Error updating product summary:', err);
    });
    
    // Устанавливаем обработчики
    setupSaleOrderFormHandlers();
    
    // Показываем страницу
    saleOrderPageElement.style.display = 'block';
    console.log('✅ [SALE ORDER] Page displayed');
}

// Закрытие страницы заказа на покупку
function closeSaleOrderPage() {
    console.log('📦 [SALE ORDER] Closing sale order page');
    
    if (saleOrderPageElement) {
        saleOrderPageElement.style.display = 'none';
    }
    
    // Скрываем все страницы
    const mainContent = document.getElementById('main-content');
    const favoritesPage = document.getElementById('favorites-page');
    const cartPage = document.getElementById('cart-page');
    const adminPage = document.getElementById('admin-page');
    
    if (mainContent) mainContent.style.display = 'none';
    if (favoritesPage) favoritesPage.style.display = 'none';
    if (cartPage) cartPage.style.display = 'none';
    if (adminPage) adminPage.style.display = 'none';
    
    // Возвращаемся на страницу товара
    const productPage = document.getElementById('product-page');
    if (productPage && currentSaleOrderProduct) {
        // Показываем страницу товара
        productPage.style.display = 'block';
    } else {
        // Если страницы товара нет, возвращаемся на главную
        if (mainContent) {
            mainContent.style.display = 'block';
        }
    }
    
    currentSaleOrderStep = 1;
    currentSaleOrderProduct = null;
}

// Сброс формы заказа на покупку
function resetSaleOrderForm() {
    const promoCodeInput = document.getElementById('sale-order-page-promo-code');
    const quantityInput = document.getElementById('sale-order-page-quantity');
    const firstNameInput = document.getElementById('sale-order-page-first-name');
    const lastNameInput = document.getElementById('sale-order-page-last-name');
    const phoneCountryCodeInput = document.getElementById('sale-order-page-phone-country-code');
    const phoneNumberInput = document.getElementById('sale-order-page-phone-number');
    const emailInput = document.getElementById('sale-order-page-email');
    const notesInput = document.getElementById('sale-order-page-notes');
    
    if (promoCodeInput) promoCodeInput.value = '';
    if (quantityInput) quantityInput.value = 1;
    if (firstNameInput) firstNameInput.value = '';
    if (lastNameInput) lastNameInput.value = '';
    if (phoneCountryCodeInput) phoneCountryCodeInput.value = '+7';
    if (phoneNumberInput) phoneNumberInput.value = '';
    if (emailInput) emailInput.value = '';
    if (notesInput) notesInput.value = '';
    
    // Сбрасываем способ доставки и оплаты
    const deliveryMethodInput = document.querySelector('input[name="sale-order-page-delivery-method"][value="delivery"]');
    const paymentMethodInput = document.querySelector('input[name="sale-order-page-payment-method"][value="cash"]');
    if (deliveryMethodInput) deliveryMethodInput.checked = true;
    if (paymentMethodInput) paymentMethodInput.checked = true;
}

// Обновление информации о товаре в форме
async function updateSaleOrderProductSummary(product) {
    console.log('📦 [SALE ORDER] updateSaleOrderProductSummary called with product:', product?.id, product?.name);
    
    const summaryDiv = document.getElementById('sale-order-page-product-summary');
    const totalDiv = document.getElementById('sale-order-page-total');
    
    console.log('📦 [SALE ORDER] Elements found:', {
        summaryDiv: !!summaryDiv,
        totalDiv: !!totalDiv
    });
    
    if (!summaryDiv || !totalDiv) {
        console.error('❌ [SALE ORDER] Elements not found! summaryDiv:', summaryDiv, 'totalDiv:', totalDiv);
        return;
    }
    
    if (!product || !product.name) {
        console.error('❌ [SALE ORDER] Product is invalid:', product);
        return;
    }
    
    try {
        // Используем функцию из priceUtils.js для форматирования цены
        console.log('📦 [SALE ORDER] Calling getProductPriceDisplay with product:', {
            id: product.id,
            name: product.name,
            price: product.price,
            is_for_sale: product.is_for_sale,
            is_sale_enabled: product.is_sale_enabled
        });
        
        const priceDisplay = getProductPriceDisplay(product);
        console.log('📦 [SALE ORDER] Price display result:', priceDisplay);
        
        summaryDiv.innerHTML = `
            <div style="padding: 12px; background: var(--bg-glass); border-radius: 8px; margin-bottom: 12px;">
                <div style="font-weight: 600; margin-bottom: 4px;">${product.name}</div>
                <div style="font-size: 14px; color: var(--text-hint);">${priceDisplay}</div>
            </div>
        `;
        
        await updateSaleOrderTotal();
        console.log('✅ [SALE ORDER] Product summary updated');
    } catch (error) {
        console.error('❌ [SALE ORDER] Error in updateSaleOrderProductSummary:', error);
        console.error('❌ [SALE ORDER] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Показываем товар с базовой информацией о цене
        let priceText = 'Цена по запросу';
        if (product.price != null && product.price !== undefined && product.price !== '') {
            const price = Number(product.price);
            if (!isNaN(price) && isFinite(price) && price > 0) {
                priceText = `${price}₽`;
            }
        }
        
        summaryDiv.innerHTML = `
            <div style="padding: 12px; background: var(--bg-glass); border-radius: 8px; margin-bottom: 12px;">
                <div style="font-weight: 600; margin-bottom: 4px;">${product.name}</div>
                <div style="font-size: 14px; color: var(--text-hint);">${priceText}</div>
            </div>
        `;
    }
}

// Обновление общей суммы заказа
async function updateSaleOrderTotal() {
    console.log('📦 [SALE ORDER] updateSaleOrderTotal called');
    console.log('📦 [SALE ORDER] currentSaleOrderProduct:', currentSaleOrderProduct?.id, currentSaleOrderProduct?.name);
    
    const totalDiv = document.getElementById('sale-order-page-total');
    const quantityInput = document.getElementById('sale-order-page-quantity');
    
    console.log('📦 [SALE ORDER] Elements found:', {
        totalDiv: !!totalDiv,
        quantityInput: !!quantityInput,
        currentSaleOrderProduct: !!currentSaleOrderProduct
    });
    
    if (!totalDiv || !quantityInput || !currentSaleOrderProduct) {
        console.error('❌ [SALE ORDER] Cannot update total - missing elements or product');
        return;
    }
    
    const quantity = parseInt(quantityInput.value) || 1;
    console.log('📦 [SALE ORDER] Quantity:', quantity);
    
    try {
        // Получаем числовое значение цены товара
        const productPrice = getProductNumericPrice(currentSaleOrderProduct);
        console.log('📦 [SALE ORDER] Product numeric price:', productPrice);
        
        if (productPrice === null) {
            // Цена по запросу - показываем без расчета
            const priceDisplay = getProductPriceDisplay(currentSaleOrderProduct);
            totalDiv.innerHTML = `<div style="margin-top: 8px; font-weight: 600; font-size: 18px;">Итого: ${priceDisplay}</div>`;
        } else {
            // Рассчитываем итоговую сумму: цена * количество
            const totalPrice = productPrice * quantity;
            console.log('📦 [SALE ORDER] Total price calculation:', productPrice, '×', quantity, '=', totalPrice);
            
            // Форматируем итоговую сумму
            const formattedTotal = formatPrice(totalPrice);
            const priceDisplay = getProductPriceDisplay(currentSaleOrderProduct);
            
            totalDiv.innerHTML = `
                <div style="margin-top: 8px; font-weight: 600; font-size: 18px;">
                    Итого: ${formattedTotal}
                    ${quantity > 1 ? `<div style="font-size: 12px; color: var(--text-hint); margin-top: 4px;">${priceDisplay} × ${quantity} шт.</div>` : ''}
                </div>
            `;
        }
        
        console.log('✅ [SALE ORDER] Total updated');
    } catch (error) {
        console.error('❌ [SALE ORDER] Error in updateSaleOrderTotal:', error);
        console.error('❌ [SALE ORDER] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Fallback: показываем цену из товара напрямую
        let priceText = 'Цена по запросу';
        const fallbackPrice = getProductNumericPrice(currentSaleOrderProduct);
        if (fallbackPrice !== null) {
            const totalPrice = fallbackPrice * quantity;
            priceText = formatPrice(totalPrice);
            if (quantity > 1) {
                priceText += ` (${formatPrice(fallbackPrice)} × ${quantity} шт.)`;
            }
        }
        
        totalDiv.innerHTML = `<div style="margin-top: 8px; font-weight: 600; font-size: 18px;">Итого: ${priceText}</div>`;
    }
}

// Показ шага формы
function showSaleOrderStep(step) {
    console.log(`📦 [SALE ORDER] showSaleOrderStep called with step: ${step}`);
    currentSaleOrderStep = step;
    
    // Скрываем все шаги
    for (let i = 1; i <= 3; i++) {
        const stepDiv = document.getElementById(`sale-order-page-step-${i}`);
        if (stepDiv) {
            stepDiv.classList.remove('active');
            stepDiv.style.display = 'none';
        } else {
            console.warn(`⚠️ [SALE ORDER] Step ${i} element not found`);
        }
    }
    
    // Показываем нужный шаг
    const currentStepDiv = document.getElementById(`sale-order-page-step-${step}`);
    if (currentStepDiv) {
        currentStepDiv.classList.add('active');
        currentStepDiv.style.display = 'block';
        console.log(`✅ [SALE ORDER] Step ${step} displayed`);
    } else {
        console.error(`❌ [SALE ORDER] Step ${step} element not found!`);
    }
}

// Настройка обработчиков формы
function setupSaleOrderFormHandlers() {
    // Шаг 1: Продолжить
    const step1NextBtn = document.getElementById('sale-order-page-step-1-next');
    if (step1NextBtn) {
        step1NextBtn.onclick = () => {
            const quantityInput = document.getElementById('sale-order-page-quantity');
            if (quantityInput && (!quantityInput.value || parseInt(quantityInput.value) < 1)) {
                alert('❌ Введите корректное количество');
                return;
            }
            showSaleOrderStep(2);
        };
    }
    
    // Шаг 2: Назад
    const step2BackBtn = document.getElementById('sale-order-page-step-2-back');
    if (step2BackBtn) {
        step2BackBtn.onclick = () => {
            showSaleOrderStep(1);
        };
    }
    
    // Шаг 2: Продолжить
    const step2NextBtn = document.getElementById('sale-order-page-step-2-next');
    if (step2NextBtn) {
        step2NextBtn.onclick = () => {
            const firstNameInput = document.getElementById('sale-order-page-first-name');
            const lastNameInput = document.getElementById('sale-order-page-last-name');
            const phoneNumberInput = document.getElementById('sale-order-page-phone-number');
            
            if (!firstNameInput || !firstNameInput.value.trim()) {
                alert('❌ Введите имя');
                return;
            }
            if (!lastNameInput || !lastNameInput.value.trim()) {
                alert('❌ Введите фамилию');
                return;
            }
            if (!phoneNumberInput || !phoneNumberInput.value.trim()) {
                alert('❌ Введите номер телефона');
                return;
            }
            showSaleOrderStep(3);
        };
    }
    
    // Шаг 3: Назад
    const step3BackBtn = document.getElementById('sale-order-page-step-3-back');
    if (step3BackBtn) {
        step3BackBtn.onclick = () => {
            showSaleOrderStep(2);
        };
    }
    
    // Шаг 3: Оформить заказ
    const step3SubmitBtn = document.getElementById('sale-order-page-step-3-submit');
    if (step3SubmitBtn) {
        step3SubmitBtn.onclick = async () => {
            await submitSaleOrder();
        };
    }
    
    // Обновление общей суммы при изменении количества
    const quantityInput = document.getElementById('sale-order-page-quantity');
    if (quantityInput) {
        quantityInput.oninput = () => {
            updateSaleOrderTotal();
        };
    }
}

// Отправка заказа на покупку
async function submitSaleOrder() {
    if (!currentSaleOrderProduct) {
        alert('❌ Товар не найден');
        return;
    }
    
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    // Собираем данные формы
    const quantityInput = document.getElementById('sale-order-page-quantity');
    const promoCodeInput = document.getElementById('sale-order-page-promo-code');
    const firstNameInput = document.getElementById('sale-order-page-first-name');
    const lastNameInput = document.getElementById('sale-order-page-last-name');
    const phoneCountryCodeInput = document.getElementById('sale-order-page-phone-country-code');
    const phoneNumberInput = document.getElementById('sale-order-page-phone-number');
    const emailInput = document.getElementById('sale-order-page-email');
    const notesInput = document.getElementById('sale-order-page-notes');
    const deliveryMethodInput = document.querySelector('input[name="sale-order-page-delivery-method"]:checked');
    const paymentMethodInput = document.querySelector('input[name="sale-order-page-payment-method"]:checked');
    
    const orderData = {
        product_id: currentSaleOrderProduct.id,
        quantity: parseInt(quantityInput?.value) || 1,
        promo_code: promoCodeInput?.value?.trim() || null,
        first_name: firstNameInput?.value?.trim() || '',
        last_name: lastNameInput?.value?.trim() || '',
        phone_country_code: phoneCountryCodeInput?.value?.trim() || '+7',
        phone_number: phoneNumberInput?.value?.trim() || '',
        email: emailInput?.value?.trim() || null,
        notes: notesInput?.value?.trim() || null,
        delivery_method: deliveryMethodInput?.value || 'delivery',
        payment_method: paymentMethodInput?.value || 'cash'
    };
    
    // Валидация
    if (!orderData.first_name || !orderData.last_name || !orderData.phone_number) {
        alert('❌ Заполните все обязательные поля');
        return;
    }
    
    try {
        // Импортируем API функцию
        const { createSaleOrderAPI } = await import('./api/sale_orders.js');
        
        console.log('📦 [SALE ORDER] Submitting sale order:', orderData);
        
        // Создаем заказ на покупку через API
        const result = await createSaleOrderAPI(orderData);
        
        console.log('✅ [SALE ORDER] Sale order created successfully:', result);
        
        // Показываем уведомление
        const { safeAlert } = await import('./telegram.js');
        await safeAlert('✅ Заказ оформлен! Товар добавлен в корзину.');
        
        // Закрываем страницу
        closeSaleOrderPage();
        
        // Обновляем корзину
        if (updateCartUICallback) {
            await updateCartUICallback();
        }
        
        // Обновляем список заказов на покупку
        if (loadSaleOrdersCallback) {
            await loadSaleOrdersCallback();
        }
        
        currentSaleOrderStep = 1;
        currentSaleOrderProduct = null;
    } catch (error) {
        console.error('❌ [SALE ORDER] Error submitting sale order:', error);
        const { safeAlert } = await import('./telegram.js');
        await safeAlert(`❌ Ошибка при оформлении заказа: ${error.message}`);
    }
}

// Отмена заказа на покупку из корзины
export async function cancelSaleOrderFromCart(saleOrderId) {
    try {
        console.log(`📦 [SALE ORDER] Cancelling sale order ${saleOrderId} from cart`);
        
        const { safeAlert, safeConfirm } = await import('./telegram.js');
        const confirmed = await safeConfirm('Вы уверены, что хотите отменить этот заказ?');
        
        if (!confirmed) {
            return;
        }
        
        // Импортируем API функцию
        const { cancelSaleOrderAPI } = await import('./api/sale_orders.js');
        
        // Отменяем заказ
        await cancelSaleOrderAPI(saleOrderId);
        
        console.log(`✅ [SALE ORDER] Sale order ${saleOrderId} cancelled successfully`);
        
        // Показываем уведомление
        await safeAlert('✅ Заказ отменен');
        
        // Обновляем корзину
        if (updateCartUICallback) {
            await updateCartUICallback();
        }
        
        // Обновляем список заказов на покупку
        if (loadSaleOrdersCallback) {
            await loadSaleOrdersCallback();
        }
    } catch (error) {
        console.error(`❌ [SALE ORDER] Error cancelling sale order ${saleOrderId}:`, error);
        const { safeAlert } = await import('./telegram.js');
        await safeAlert(`❌ Ошибка при отмене заказа: ${error.message}`);
    }
}

// Делаем функцию доступной глобально для вызова из HTML
window.cancelSaleOrderFromCart = cancelSaleOrderFromCart;
