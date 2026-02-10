// Модуль для редактирования товаров
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { getCurrentShopSettings } from './admin.js';
import {
    API_BASE,
    deleteProductAPI,
    getCharacteristicNamesAPI,
    getProductByIdAPI,
    markProductSoldAPI,
    updateProductAPI,
    updateProductCharacteristicsAPI,
    updateProductDeliveryAPI,
    updateProductForSaleAPI,
    updateProductMadeToOrderAPI,
    updateProductNameDescriptionAPI,
    updateProductQuantityAPI,
    updateProductQuantityShowEnabledAPI,
    updateProductReservationEnabledAPI,
    updateProductSaleEnabledAPI
} from './api.js';
import { hideAllPages, setupPageScrollHandler } from './operationsBase.js';

// Зависимости, которые будут переданы из app.js
let currentProductGetter = null; // Функция-геттер для получения currentProduct
let currentProductSetter = null; // Функция-сеттер для установки currentProduct
let appContextGetter = null; // Функция-геттер для получения appContext
let modalElement = null; // Элемент модального окна товара
let loadDataCallback = null; // Функция для загрузки данных
let allProductsGetter = null; // Функция-геттер для получения allProducts
let allProductsSetter = null; // Функция-сеттер для обновления allProducts (client-visible после сохранения)
let applyFiltersCallback = null; // Перерисовать сетку после подстановки свежих товаров
let showSellModalCallback = null; // Функция для показа модального окна продажи (используется в markAsSold)
let sellModalElement = null; // Элемент модального окна продажи
let showProductModalCallback = null; // Функция для показа/обновления страницы товара

// Инициализация зависимостей
export function initProductEditDependencies(dependencies) {
    currentProductGetter = dependencies.currentProductGetter;
    currentProductSetter = dependencies.currentProductSetter;
    appContextGetter = dependencies.appContextGetter;
    modalElement = dependencies.modal;
    loadDataCallback = dependencies.loadData;
    allProductsGetter = dependencies.allProductsGetter;
    allProductsSetter = dependencies.allProductsSetter;
    applyFiltersCallback = dependencies.applyFiltersCallback;
    showSellModalCallback = dependencies.showSellModal;
    sellModalElement = dependencies.sellModal;
    showProductModalCallback = dependencies.showProductModal;
}

/**
 * Рендер списка характеристик в форме редактирования товара.
 * Каждая строка: название, input value, кнопка удаления.
 * data-id — для существующих (обновление), отсутствует для новых.
 */
function renderEditCharacteristics(characteristics) {
    const listEl = document.getElementById('edit-characteristics-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const chars = Array.isArray(characteristics) ? characteristics : [];
    chars.forEach((c, index) => {
        const id = c.id != null ? c.id : '';
        const name = String(c.name || '').trim();
        const value = String(c.value || '').trim();
        if (!name) return;
        const row = document.createElement('div');
        row.className = 'edit-char-row';
        row.dataset.id = id ? String(id) : '';
        row.dataset.name = name;
        row.innerHTML = `
            <div class="edit-char-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <input type="text" class="edit-char-value" value="${escapeHtml(value)}" placeholder="Значение" />
            <button type="button" class="edit-char-delete" aria-label="Удалить">✕</button>
        `;
        const valueInput = row.querySelector('.edit-char-value');
        const deleteBtn = row.querySelector('.edit-char-delete');
        deleteBtn.onclick = () => {
            row.remove();
        };
        listEl.appendChild(row);
    });
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

/**
 * UX: установка состояния "сохранение" на кнопке (текст, disabled, класс is-saving).
 * @param {HTMLButtonElement} btn - кнопка
 * @param {boolean} isSaving - true = показать прогресс, false = вернуть исходное состояние
 * @param {string} [savingText] - текст при сохранении (по умолчанию "Сохранение…")
 */
function setButtonSavingState(btn, isSaving, savingText) {
    if (!btn) return;
    if (!btn.dataset.originalText) {
        btn.dataset.originalText = (btn.textContent || '').trim();
    }
    if (isSaving) {
        btn.disabled = true;
        btn.classList.add('is-saving');
        btn.textContent = savingText || 'Сохранение…';
    } else {
        btn.disabled = false;
        btn.classList.remove('is-saving');
        btn.textContent = btn.dataset.originalText || btn.textContent;
    }
}

/**
 * Сбор характеристик из DOM списка в payload для API.
 */
function collectEditCharacteristics() {
    const listEl = document.getElementById('edit-characteristics-list');
    if (!listEl) return [];
    const rows = listEl.querySelectorAll('.edit-char-row');
    const result = [];
    rows.forEach((row, index) => {
        const id = row.dataset.id ? parseInt(row.dataset.id, 10) : undefined;
        const name = (row.dataset.name || '').trim();
        const valueInput = row.querySelector('.edit-char-value');
        const value = valueInput ? (valueInput.value || '').trim() : '';
        if (!name || !value) return; // пропускаем пустые
        result.push({
            id: isNaN(id) ? undefined : id,
            name,
            value,
            sort_order: index
        });
    });
    return result;
}

/**
 * Закрытие страницы редактирования товара. Возврат из dataset.returnTo (по умолчанию product-page).
 * Этап 4: сначала снять is-active и скрыть, затем hideAllPages(), затем показать целевую страницу.
 */
export function closeEditProductPage() {
    const editProductPage = document.getElementById('edit-product-page');
    if (editProductPage) {
        editProductPage.classList.remove('is-active');
        editProductPage.style.display = 'none';
    }
    const returnToId = (editProductPage && editProductPage.dataset.returnTo) || 'product-page';
    hideAllPages();
    const target = document.getElementById(returnToId);
    if (target) {
        target.classList.add('is-active');
        target.style.display = 'block';
    }
}

/**
 * Показ страницы редактирования товара (вместо модального окна)
 */
export function showEditProductPage(prod) {
    hideAllPages();
    const editProductPage = document.getElementById('edit-product-page');
    if (!editProductPage) {
        console.error('❌ Edit product page not found!');
        alert('❌ Ошибка: страница редактирования не найдена');
        return;
    }
    // Возврат по "Назад": редактирование открыто из карточки товара → вернуть в product-page (этап 4)
    editProductPage.dataset.returnTo = 'product-page';
    editProductPage.classList.add('is-active');
    editProductPage.style.display = 'block';
    editProductPage.scrollTop = 0;
    const backBtn = document.getElementById('edit-product-page-back');
    if (backBtn) backBtn.onclick = closeEditProductPage;
    setupPageScrollHandler(editProductPage);
    showEditProductForm(prod, closeEditProductPage);

    /* DEBUG отступов: удалить после проверки — логирует padding-bottom и высоту ::after скролл-контента */
    const contentEl = editProductPage.querySelector('.operation-page-content');
    if (contentEl && typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
            const style = getComputedStyle(contentEl);
            let afterHeight = 'N/A';
            try {
                const afterStyle = getComputedStyle(contentEl, '::after');
                afterHeight = afterStyle ? afterStyle.height : 'N/A';
            } catch (_) { /* старые браузеры */ }
            console.log('[edit-product-page] .operation-page-content paddingBottom:', style.paddingBottom, '::after height:', afterHeight);
        });
    }
}

/**
 * Внутренняя функция: заполнение формы и кнопок (используется модалом и страницей)
 */
function showEditProductForm(prod, onCancel) {
    try {
        if (currentProductSetter) currentProductSetter(prod);
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    
    if (!editNameInput || !editDescriptionInput) {
        console.error('❌ Required input fields not found!');
        alert('❌ Ошибка: обязательные поля не найдены');
        return;
    }
    const editPriceInput = document.getElementById('edit-price');
    const editPriceCashInput = document.getElementById('edit-price-cash');
    const editPriceCashField = editPriceCashInput ? editPriceCashInput.closest('.edit-product-field') : null;
    const editDiscountInput = document.getElementById('edit-discount');
    const editQuantityInput = document.getElementById('edit-quantity');
    const editQuantityUnitGeneralInput = document.getElementById('edit-quantity-unit-general');
    const editQuantityShowEnabledInput = document.getElementById('edit-quantity-show-enabled');
    const editMadeToOrderInput = document.getElementById('edit-made-to-order');
    const editMadeToOrderField = document.getElementById('edit-made-to-order-field');
    const editPriceField = editPriceInput ? editPriceInput.closest('.edit-product-field') : null;
    const editDiscountField = editDiscountInput ? editDiscountInput.closest('.edit-product-field') : null;
    const editQuantityField = editQuantityInput ? editQuantityInput.closest('.edit-product-field') : null;
    const editQuantityUnitGeneralField = editQuantityUnitGeneralInput ? editQuantityUnitGeneralInput.closest('.edit-product-field') : null;
    const editQuantityShowEnabledField = editQuantityShowEnabledInput ? editQuantityShowEnabledInput.closest('.edit-product-field') : null;
    const editPriceFromInput = document.getElementById('edit-price-from');
    const editPriceToInput = document.getElementById('edit-price-to');
    const editPriceFixedInput = document.getElementById('edit-price-fixed');
    const editPriceTypeRangeRadio = document.getElementById('edit-price-type-range');
    const editPriceTypeFixedRadio = document.getElementById('edit-price-type-fixed');
    const priceRangeFields = document.getElementById('price-range-fields');
    const priceFixedField = document.getElementById('price-fixed-field');
    const editQuantityFromInput = document.getElementById('edit-quantity-from');
    const editQuantityUnitInput = document.getElementById('edit-quantity-unit');
    const forSaleFields = document.getElementById('for-sale-fields');
    const editSaleEnabledInput = document.getElementById('edit-sale-enabled');
    const editSaleEnabledField = document.getElementById('edit-sale-enabled-field');
    const editReservationEnabledInput = document.getElementById('edit-reservation-enabled');
    const editReservationEnabledField = document.getElementById('edit-reservation-enabled-field');

    // Проверяем is_for_sale
    const isForSale = prod.is_for_sale === true || 
                      prod.is_for_sale === 1 || 
                      prod.is_for_sale === '1' ||
                      prod.is_for_sale === 'true' ||
                      String(prod.is_for_sale).toLowerCase() === 'true';
    
    // Проверяем is_made_to_order (определяем до блока if-else, чтобы была доступна везде)
    const isMadeToOrder = prod.is_made_to_order === true || 
                          prod.is_made_to_order === 1 || 
                          prod.is_made_to_order === '1' ||
                          prod.is_made_to_order === 'true' ||
                          String(prod.is_made_to_order).toLowerCase() === 'true';
    
    // Заполняем поля текущими значениями
    editNameInput.value = prod.name || '';
    editDescriptionInput.value = prod.description || '';
    
    if (isForSale) {
        // Для товаров с флагом продажа скрываем обычные поля
        if (editPriceField) editPriceField.style.display = 'none';
        if (editPriceCashField) editPriceCashField.style.display = 'none';
        if (editDiscountField) editDiscountField.style.display = 'none';
        if (editQuantityField) editQuantityField.style.display = 'none';
        if (editQuantityUnitGeneralField) editQuantityUnitGeneralField.style.display = 'none';
        if (editQuantityShowEnabledField) editQuantityShowEnabledField.style.display = 'none';
        if (editMadeToOrderField) editMadeToOrderField.style.display = 'none';
        if (editSaleEnabledField) editSaleEnabledField.style.display = 'none';
        if (editReservationEnabledField) editReservationEnabledField.style.display = 'none';

        // Показываем поля для продажи
        if (forSaleFields) {
            forSaleFields.style.display = 'block';
        }
        
        // Заполняем поля для продажи
        const priceType = prod.price_type || 'range';
        if (editPriceFromInput) editPriceFromInput.value = prod.price_from || '';
        if (editPriceToInput) editPriceToInput.value = prod.price_to || '';
        if (editPriceFixedInput) editPriceFixedInput.value = prod.price_fixed || '';
        if (editQuantityFromInput) editQuantityFromInput.value = prod.quantity_from !== undefined && prod.quantity_from !== null ? prod.quantity_from : '';
        
        // Устанавливаем единицу измерения для продажи
        if (editQuantityUnitInput) {
            const quantityUnit = prod.quantity_unit || 'шт';
            const selectElement = editQuantityUnitInput;
            const options = Array.from(selectElement.options);
            const matchingOption = options.find(opt => opt.value === quantityUnit);
            if (matchingOption) {
                editQuantityUnitInput.value = matchingOption.value;
            } else {
                editQuantityUnitInput.value = 'шт';
            }
        }
        
        // Устанавливаем тип цены
        if (editPriceTypeRangeRadio && editPriceTypeFixedRadio) {
            editPriceTypeRangeRadio.checked = priceType === 'range';
            editPriceTypeFixedRadio.checked = priceType === 'fixed';
        }
        
        // Показываем/скрываем поля в зависимости от типа цены
        if (priceRangeFields && priceFixedField) {
            priceRangeFields.style.display = priceType === 'range' ? 'block' : 'none';
            priceFixedField.style.display = priceType === 'fixed' ? 'block' : 'none';
        }
        
        // Функция для обновления визуального состояния типа цены
        const updatePriceTypeVisual = () => {
            if (!editPriceTypeRangeRadio || !editPriceTypeFixedRadio) return;
            
            const rangeLabel = editPriceTypeRangeRadio.closest('label');
            const fixedLabel = editPriceTypeFixedRadio.closest('label');
            
            if (rangeLabel && fixedLabel) {
                if (editPriceTypeRangeRadio.checked) {
                    rangeLabel.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                        padding: 12px;
                        border-radius: 8px;
                        background: rgba(90, 200, 250, 0.2);
                        border: 2px solid rgba(90, 200, 250, 0.5);
                        transition: all 0.3s ease;
                    `;
                    fixedLabel.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                        padding: 12px;
                        border-radius: 8px;
                        background: transparent;
                        border: 2px solid transparent;
                        transition: all 0.3s ease;
                    `;
                } else if (editPriceTypeFixedRadio.checked) {
                    fixedLabel.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                        padding: 12px;
                        border-radius: 8px;
                        background: rgba(90, 200, 250, 0.2);
                        border: 2px solid rgba(90, 200, 250, 0.5);
                        transition: all 0.3s ease;
                    `;
                    rangeLabel.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                        padding: 12px;
                        border-radius: 8px;
                        background: transparent;
                        border: 2px solid transparent;
                        transition: all 0.3s ease;
                    `;
                }
            }
        };
        
        // Инициализируем визуальное состояние при загрузке
        setTimeout(() => {
            updatePriceTypeVisual();
        }, 50);
        
        // Обработчики изменения типа цены
        if (editPriceTypeRangeRadio && editPriceTypeFixedRadio && priceRangeFields && priceFixedField) {
            editPriceTypeRangeRadio.onchange = () => {
                if (editPriceTypeRangeRadio.checked) {
                    priceRangeFields.style.display = 'block';
                    priceFixedField.style.display = 'none';
                    updatePriceTypeVisual();
                }
            };
            
            editPriceTypeFixedRadio.onchange = () => {
                if (editPriceTypeFixedRadio.checked) {
                    priceRangeFields.style.display = 'none';
                    priceFixedField.style.display = 'block';
                    updatePriceTypeVisual();
                }
            };
        }
    } else {
        // Для обычных товаров показываем обычные поля
        if (editPriceField) editPriceField.style.display = 'block';
        if (editPriceCashField) editPriceCashField.style.display = 'block';
        if (editDiscountField) editDiscountField.style.display = 'block';
        if (editQuantityField) editQuantityField.style.display = 'block';
        if (editQuantityUnitGeneralField) editQuantityUnitGeneralField.style.display = 'block';
        if (editQuantityShowEnabledField) editQuantityShowEnabledField.style.display = 'block';
        if (editMadeToOrderField) editMadeToOrderField.style.display = 'block';
        if (editSaleEnabledField) editSaleEnabledField.style.display = 'block';
        if (editReservationEnabledField) editReservationEnabledField.style.display = 'block';

        // Скрываем поля для продажи
        if (forSaleFields) {
            forSaleFields.style.display = 'none';
        }
        
        // Заполняем обычные поля: цена по карте (price_card приоритет над legacy price), цена наличными
        const priceCard = prod.price_card ?? prod.price;
        editPriceInput.value = priceCard != null && priceCard !== '' ? priceCard : '';
        if (editPriceCashInput) editPriceCashInput.value = (prod.price_cash != null && prod.price_cash !== '') ? prod.price_cash : '';
        editDiscountInput.value = prod.discount ?? 0;
        editQuantityInput.value = prod.quantity !== undefined && prod.quantity !== null ? prod.quantity : 0;
        
        // Устанавливаем единицу измерения для обычных товаров
        if (editQuantityUnitGeneralInput) {
            const quantityUnit = prod.quantity_unit || 'шт';
            const selectElement = editQuantityUnitGeneralInput;
            const options = Array.from(selectElement.options);
            const matchingOption = options.find(opt => opt.value === quantityUnit);
            if (matchingOption) {
                editQuantityUnitGeneralInput.value = matchingOption.value;
            } else {
                editQuantityUnitGeneralInput.value = 'шт';
            }
        }
        
        // Устанавливаем тумблер "Показ количества"
        const shopSettingsForEdit = getCurrentShopSettings();
        const globalQuantityEnabled = shopSettingsForEdit ? (shopSettingsForEdit.quantity_enabled !== false) : true;
        
        // Если индивидуальная настройка не установлена (null), используем общую настройку
        let quantityShowEnabledValue;
        if (prod.quantity_show_enabled === null || prod.quantity_show_enabled === undefined) {
            quantityShowEnabledValue = globalQuantityEnabled;
            editQuantityShowEnabledInput.dataset.isUsingGlobal = 'true';
        } else {
            quantityShowEnabledValue = prod.quantity_show_enabled === true || prod.quantity_show_enabled === 1 || prod.quantity_show_enabled === 'true' || prod.quantity_show_enabled === '1';
            editQuantityShowEnabledInput.dataset.isUsingGlobal = 'false';
        }
        editQuantityShowEnabledInput.checked = quantityShowEnabledValue;
        
        // Используем уже определенную переменную isMadeToOrder
        if (editMadeToOrderInput) {
            editMadeToOrderInput.checked = isMadeToOrder;
        }
        
        // Устанавливаем тумблер "Продажа"
        let isSaleEnabled = false;
        if (editSaleEnabledInput) {
            isSaleEnabled = prod.is_sale_enabled === true || prod.is_sale_enabled === 1 || prod.is_sale_enabled === '1' || prod.is_sale_enabled === 'true' || String(prod.is_sale_enabled).toLowerCase() === 'true';
            editSaleEnabledInput.checked = isSaleEnabled;
        }
        // Устанавливаем тумблер "Резервация"
        let isReservationEnabled = false;
        if (editReservationEnabledInput) {
            isReservationEnabled = prod.is_reservation_enabled === true || prod.is_reservation_enabled === 1 || prod.is_reservation_enabled === '1' || prod.is_reservation_enabled === 'true' || String(prod.is_reservation_enabled || '').toLowerCase() === 'true';
            editReservationEnabledInput.checked = isReservationEnabled;
        }
        // Нормализация: только один из трёх режимов (sale / order / reserve). Приоритет: sale > order > reserve.
        const count = (isSaleEnabled ? 1 : 0) + (isMadeToOrder ? 1 : 0) + (isReservationEnabled ? 1 : 0);
        if (count > 1) {
            if (isSaleEnabled) {
                isMadeToOrder = false;
                isReservationEnabled = false;
            } else if (isMadeToOrder) {
                isReservationEnabled = false;
            }
            if (editSaleEnabledInput) editSaleEnabledInput.checked = isSaleEnabled;
            if (editMadeToOrderInput) editMadeToOrderInput.checked = isMadeToOrder;
            if (editReservationEnabledInput) editReservationEnabledInput.checked = isReservationEnabled;
        }

        // Делаем тумблер "Показ количества" неактивным, если включен "Под заказ"
        // При включенном "Под заказ" количество не отображается, поэтому тумблер неактивен
        editQuantityShowEnabledInput.disabled = isMadeToOrder;
        
        // Обработчик изменения тумблера "Под заказ" - отключаем/включаем тумблер "Показ количества" и взаимоисключение
        editMadeToOrderInput.onchange = () => {
            const madeToOrderEnabled = editMadeToOrderInput.checked;
            editQuantityShowEnabledInput.disabled = madeToOrderEnabled;
            if (madeToOrderEnabled) {
                if (editSaleEnabledInput) editSaleEnabledInput.checked = false;
                if (editReservationEnabledInput) editReservationEnabledInput.checked = false;
            }
        };
        if (editSaleEnabledInput) {
            editSaleEnabledInput.onchange = () => {
                if (editSaleEnabledInput.checked) {
                    if (editMadeToOrderInput) editMadeToOrderInput.checked = false;
                    if (editReservationEnabledInput) editReservationEnabledInput.checked = false;
                    editQuantityShowEnabledInput.disabled = false;
                }
            };
        }
        if (editReservationEnabledInput) {
            editReservationEnabledInput.onchange = () => {
                if (editReservationEnabledInput.checked) {
                    if (editSaleEnabledInput) editSaleEnabledInput.checked = false;
                    if (editMadeToOrderInput) {
                        editMadeToOrderInput.checked = false;
                        editQuantityShowEnabledInput.disabled = false;
                    }
                }
            };
        }
    }
    
    console.log('🔧 Edit product form - full product object:', JSON.stringify(prod, null, 2));
    
    // --- Блок доставки: заполнение и кнопка «Сохранить доставку» ---
    const editDeliveryEnabled = document.getElementById('edit-delivery-enabled');
    const editDeliveryTime = document.getElementById('edit-delivery-time');
    const editDeliveryPrice = document.getElementById('edit-delivery-price');
    const editPickupEnabled = document.getElementById('edit-pickup-enabled');
    const editPickupAddress = document.getElementById('edit-pickup-address');
    const editDeliverySaveBtn = document.getElementById('edit-delivery-save');
    const editDeliveryStatus = document.getElementById('edit-delivery-status');
    const delivery = prod.delivery || {};
    if (editDeliveryEnabled) editDeliveryEnabled.checked = !!delivery.is_delivery_enabled;
    if (editDeliveryTime) editDeliveryTime.value = delivery.delivery_time != null ? String(delivery.delivery_time) : '';
    if (editDeliveryPrice) editDeliveryPrice.value = delivery.delivery_price != null && delivery.delivery_price !== '' ? String(delivery.delivery_price) : '';
    if (editPickupEnabled) editPickupEnabled.checked = !!delivery.is_pickup_enabled;
    if (editPickupAddress) editPickupAddress.value = delivery.pickup_address || '';
    if (editDeliveryStatus) editDeliveryStatus.textContent = '';
    if (editDeliverySaveBtn) {
        editDeliverySaveBtn.onclick = async () => {
            if (editDeliverySaveBtn.disabled || editDeliverySaveBtn.classList.contains('is-saving')) return;
            const appContext = appContextGetter ? appContextGetter() : null;
            if (!appContext || !appContext.shop_owner_id) {
                if (editDeliveryStatus) editDeliveryStatus.textContent = 'Ошибка: нет контекста';
                return;
            }
            const productId = prod.id;
            if (!productId) {
                if (editDeliveryStatus) editDeliveryStatus.textContent = 'Ошибка: нет ID товара';
                return;
            }
            const priceVal = editDeliveryPrice && editDeliveryPrice.value.trim() !== '' ? parseFloat(editDeliveryPrice.value) : null;
            const payload = {
                is_delivery_enabled: editDeliveryEnabled ? editDeliveryEnabled.checked : false,
                is_pickup_enabled: editPickupEnabled ? editPickupEnabled.checked : false,
                delivery_price: priceVal,
                pickup_address: editPickupAddress ? (editPickupAddress.value || '').trim() || null : null,
                delivery_time: editDeliveryTime ? (editDeliveryTime.value || '').trim() || null : null
            };
            try {
                editDeliverySaveBtn.disabled = true;
                editDeliverySaveBtn.classList.add('is-saving');
                if (editDeliveryStatus) editDeliveryStatus.textContent = 'Сохранение…';
                await updateProductDeliveryAPI(productId, appContext.shop_owner_id, payload);
                if (editDeliveryStatus) editDeliveryStatus.textContent = 'Сохранено';
                setTimeout(() => { if (editDeliveryStatus) editDeliveryStatus.textContent = ''; }, 2000);
            } catch (e) {
                console.error('Failed to save delivery:', e);
                if (editDeliveryStatus) editDeliveryStatus.textContent = e.message || 'Ошибка сохранения';
            } finally {
                editDeliverySaveBtn.classList.remove('is-saving');
                editDeliverySaveBtn.disabled = false;
            }
        };
    }

    // --- Блок характеристик: рендер, справочник, переключение select/manual, добавление ---
    try {
    renderEditCharacteristics(prod.characteristics || []);
    const listEl = document.getElementById('edit-characteristics-list');
    const nameSelect = document.getElementById('edit-characteristics-name-select');
    const nameManualInput = document.getElementById('edit-characteristics-name-manual');
    const valueInput = document.getElementById('edit-characteristics-value');
    const addBtn = document.getElementById('edit-characteristics-add-btn');
    const toggleBtn = document.getElementById('edit-characteristics-name-toggle-btn');
    
    let characteristicNameMode = 'select';
    
    function setCharacteristicNameMode(mode) {
        characteristicNameMode = mode;
        if (!nameSelect || !nameManualInput) return;
        nameSelect.disabled = false;
        nameSelect.removeAttribute('disabled');
        nameSelect.style.pointerEvents = '';
        nameSelect.style.position = '';
        nameSelect.style.left = '';
        nameSelect.style.opacity = '';
        nameSelect.style.width = '';
        nameSelect.style.height = '';
        nameManualInput.style.pointerEvents = '';
        nameManualInput.style.position = '';
        nameManualInput.style.left = '';
        nameManualInput.style.opacity = '';
        nameManualInput.style.width = '';
        nameManualInput.style.height = '';
        nameSelect.classList.remove('offscreen-hidden');
        nameManualInput.classList.remove('offscreen-hidden');
        if (mode === 'select') {
            nameManualInput.classList.add('offscreen-hidden');
            nameManualInput.blur();
            nameManualInput.value = '';
            if (toggleBtn) { toggleBtn.textContent = '✍️'; toggleBtn.title = 'Ввести вручную'; }
            void nameSelect.offsetHeight;
        } else {
            nameSelect.classList.add('offscreen-hidden');
            if (toggleBtn) { toggleBtn.textContent = '📋'; toggleBtn.title = 'Выбрать из списка'; }
            nameManualInput.focus({ preventScroll: true });
        }
    }
    
    if (nameSelect) {
        nameSelect.innerHTML = '<option value="">— Выбрать —</option>';
        const appContext = appContextGetter ? appContextGetter() : null;
        if (appContext && appContext.shop_owner_id) {
            getCharacteristicNamesAPI(appContext.shop_owner_id, appContext.bot_id || null).then(names => {
                (names || []).forEach(n => {
                    const opt = document.createElement('option');
                    opt.value = n;
                    opt.textContent = n;
                    nameSelect.appendChild(opt);
                });
            }).catch(() => {});
        }
    }
    
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            setCharacteristicNameMode(characteristicNameMode === 'select' ? 'manual' : 'select');
        };
        toggleBtn.textContent = '✍️';
        toggleBtn.title = 'Ввести вручную';
    }
    
    setCharacteristicNameMode('select');
    
    if (addBtn && valueInput) {
        addBtn.onclick = () => {
            let name = '';
            if (characteristicNameMode === 'manual' && nameManualInput) {
                name = (nameManualInput.value || '').trim();
            } else if (nameSelect && nameSelect.value) {
                name = (nameSelect.value || '').trim();
            }
            const value = (valueInput.value || '').trim();
            if (!name || !value) {
                alert('Введите название и значение характеристики');
                return;
            }
            const existingRow = listEl && Array.from(listEl.querySelectorAll('.edit-char-row')).find(r => r.dataset.name === name);
            if (existingRow) {
                const v = existingRow.querySelector('.edit-char-value');
                if (v) v.value = value;
            } else {
                const row = document.createElement('div');
                row.className = 'edit-char-row';
                row.dataset.id = '';
                row.dataset.name = name;
                row.innerHTML = `
                    <div class="edit-char-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                    <input type="text" class="edit-char-value" value="${escapeHtml(value)}" placeholder="Значение" />
                    <button type="button" class="edit-char-delete" aria-label="Удалить">✕</button>
                `;
                row.querySelector('.edit-char-delete').onclick = () => row.remove();
                if (listEl) listEl.appendChild(row);
            }
            valueInput.value = '';
            if (nameManualInput) nameManualInput.value = '';
            if (nameSelect) nameSelect.value = '';
        };
    }
    
    } catch (charErr) {
        console.warn('⚠️ [product-edit] Characteristics block init skipped:', charErr);
    }
    
    // --- Конец блока характеристик ---
    
    // Обработчик сохранения
    const saveBtn = document.getElementById('edit-product-save');
    const cancelBtn = document.getElementById('edit-product-cancel');
    
    if (!saveBtn || !cancelBtn) {
        console.error('❌ Save or cancel button not found!');
        alert('❌ Ошибка: кнопки сохранения/отмены не найдены');
        return;
    }
    
    // Удаляем старые обработчики, если есть
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Добавляем новые обработчики (с защитой от двойного клика и индикатором сохранения)
    newSaveBtn.onclick = async (e) => {
        e.preventDefault();
        if (newSaveBtn.disabled || newSaveBtn.classList.contains('is-saving')) return;
        try {
            setButtonSavingState(newSaveBtn, true, 'Сохранение…');
            await saveProductEdit(prod.id);
        } finally {
            setButtonSavingState(newSaveBtn, false);
        }
    };

    newCancelBtn.onclick = onCancel;
    } catch (error) {
        console.error('❌ Error in showEditProductForm:', error);
        alert(`❌ Ошибка при открытии формы редактирования: ${error.message}`);
    }
}

// Показ модального окна редактирования товара (устарело: используется showEditProductPage)
export function showEditProductModal(prod) {
    const editProductModal = document.getElementById('edit-product-modal');
    if (!editProductModal) return;
    showEditProductForm(prod, () => { editProductModal.classList.remove('is-open'); editProductModal.style.display = 'none'; });
    editProductModal.classList.add('is-open');
    editProductModal.style.display = 'flex';
}

// Сохранение изменений товара
export async function saveProductEdit(productId) {
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    const editPriceInput = document.getElementById('edit-price');
    const editDiscountInput = document.getElementById('edit-discount');
    const editQuantityInput = document.getElementById('edit-quantity');
    const editQuantityShowEnabledInput = document.getElementById('edit-quantity-show-enabled');
    const editMadeToOrderInput = document.getElementById('edit-made-to-order');
    const editQuantityUnitGeneralInput = document.getElementById('edit-quantity-unit-general');
    const editSaleEnabledInput = document.getElementById('edit-sale-enabled');
    const editReservationEnabledInput = document.getElementById('edit-reservation-enabled');

    // Получаем currentProduct через геттер
    const currentProduct = currentProductGetter ? currentProductGetter() : null;
    
    // Проверяем, является ли товар для продажи (is_for_sale)
    // Используем currentProduct, который был установлен при открытии модального окна редактирования
    const isForSale = currentProduct && (
        currentProduct.is_for_sale === true || 
        currentProduct.is_for_sale === 1 || 
        currentProduct.is_for_sale === '1' ||
        currentProduct.is_for_sale === 'true' ||
        String(currentProduct.is_for_sale).toLowerCase() === 'true'
    );
    
    const newName = editNameInput.value.trim();
    let newDescription = editDescriptionInput.value.trim();
    
    // Фильтрация UI-текста из description: если description содержит текст настроек количества,
    // это явно ошибка (UI-текст попал в поле описания товара) — очищаем его.
    if (newDescription && (
        newDescription.includes('Показывать количество товара на витрине') ||
        newDescription.includes('• Использовать настройку магазина') ||
        newDescription.includes('• Показывать - всегда показывать количество') ||
        newDescription.includes('• Не показывать - скрыть количество')
    )) {
        console.log(`[DESCRIPTION FILTER] Filtered UI text from description for product_id=${productId}, original_length=${newDescription.length}`);
        newDescription = ''; // Очищаем description от UI-текста
    }

    let newSaleEnabled = !!(editSaleEnabledInput && editSaleEnabledInput.checked);
    let newMadeToOrder = !!(editMadeToOrderInput && editMadeToOrderInput.checked);
    let newReservationEnabled = !!(editReservationEnabledInput && editReservationEnabledInput.checked);
    if (newSaleEnabled) {
        newMadeToOrder = false;
        newReservationEnabled = false;
    } else if (newMadeToOrder) {
        newSaleEnabled = false;
        newReservationEnabled = false;
    } else if (newReservationEnabled) {
        newSaleEnabled = false;
        newMadeToOrder = false;
    }

    // Для товаров с флагом продажа не парсим обычные поля
    let newPriceCard, newPriceCash, newDiscount, newQuantity, newQuantityUnitGeneral, quantityShowEnabledToSave;
    const editPriceCashInputSave = document.getElementById('edit-price-cash');
    if (!isForSale) {
        // Парсим значения: если поле пустое или только пробелы, сохраняем null
        const priceVal = editPriceInput.value.trim();
        newPriceCard = priceVal ? (isNaN(parseFloat(priceVal)) ? null : parseFloat(priceVal)) : null;
        const priceCashVal = editPriceCashInputSave && editPriceCashInputSave.value.trim();
        newPriceCash = priceCashVal ? (isNaN(parseFloat(priceCashVal)) ? null : parseFloat(priceCashVal)) : null;
        
        const discountVal = editDiscountInput.value.trim();
        newDiscount = discountVal ? (isNaN(parseFloat(discountVal)) ? null : parseFloat(discountVal)) : null;
        
        const quantityVal = editQuantityInput.value.trim();
        newQuantity = quantityVal ? (isNaN(parseInt(quantityVal, 10)) ? null : parseInt(quantityVal, 10)) : null;
        // Получаем единицу измерения для обычных товаров
        newQuantityUnitGeneral = editQuantityUnitGeneralInput ? editQuantityUnitGeneralInput.value || null : null;
        // Получаем значение тумблера "Показ количества"
        const shopSettingsForSave = getCurrentShopSettings();
        const globalQuantityEnabledForSave = shopSettingsForSave ? (shopSettingsForSave.quantity_enabled !== false) : true;

        // Если включен "Под заказ", настройка "Показ количества" не применяется (количество не отображается)
        // Поэтому сохраняем null (использовать глобальную настройку)
        if (newMadeToOrder) {
            // При "Под заказ" количество не отображается, поэтому сохраняем null
            quantityShowEnabledToSave = null;
        } else {
            // Если "Под заказ" выключен, сохраняем настройку "Показ количества"
            const newQuantityShowEnabled = editQuantityShowEnabledInput.checked;
            
            // Определяем, какое значение сохранить: если совпадает с глобальной настройкой, сохраняем null
            if (editQuantityShowEnabledInput.dataset.isUsingGlobal === 'true') {
                // Использовалась глобальная настройка
                if (newQuantityShowEnabled === globalQuantityEnabledForSave) {
                    quantityShowEnabledToSave = null; // Оставляем глобальную настройку
                } else {
                    quantityShowEnabledToSave = newQuantityShowEnabled; // Устанавливаем индивидуальную
                }
            } else {
                // Использовалась индивидуальная настройка
                if (newQuantityShowEnabled === globalQuantityEnabledForSave) {
                    quantityShowEnabledToSave = null; // Возвращаемся к глобальной
                } else {
                    quantityShowEnabledToSave = newQuantityShowEnabled; // Сохраняем индивидуальную
                }
            }
        }
    }
    
    // Для товаров с флагом продажа получаем данные из полей продажи
    let newPriceType, newPriceFrom, newPriceTo, newPriceFixed, newQuantityFrom, newQuantityUnit;
    if (isForSale) {
        const editPriceTypeRangeRadio = document.getElementById('edit-price-type-range');
        const editPriceFromInput = document.getElementById('edit-price-from');
        const editPriceToInput = document.getElementById('edit-price-to');
        const editPriceFixedInput = document.getElementById('edit-price-fixed');
        const editQuantityFromInput = document.getElementById('edit-quantity-from');
        const editQuantityUnitInput = document.getElementById('edit-quantity-unit');
        
        newPriceType = editPriceTypeRangeRadio && editPriceTypeRangeRadio.checked ? 'range' : 'fixed';
        // Парсим значения: если поле пустое или только пробелы, сохраняем null
        // Если parseFloat/parseInt возвращает NaN, тоже сохраняем null
        const priceFromVal = editPriceFromInput.value.trim();
        newPriceFrom = priceFromVal ? (isNaN(parseFloat(priceFromVal)) ? null : parseFloat(priceFromVal)) : null;
        
        const priceToVal = editPriceToInput.value.trim();
        newPriceTo = priceToVal ? (isNaN(parseFloat(priceToVal)) ? null : parseFloat(priceToVal)) : null;
        
        const priceFixedVal = editPriceFixedInput.value.trim();
        newPriceFixed = priceFixedVal ? (isNaN(parseFloat(priceFixedVal)) ? null : parseFloat(priceFixedVal)) : null;
        
        const quantityFromVal = editQuantityFromInput.value.trim();
        newQuantityFrom = quantityFromVal ? (isNaN(parseInt(quantityFromVal, 10)) ? null : parseInt(quantityFromVal, 10)) : null;
        
        newQuantityUnit = editQuantityUnitInput.value.trim() || null;
    }
    
    // Валидация
    if (!newName || newName.length === 0) {
        alert('❌ Введите название товара');
        return;
    }
    
    // Валидация для обычных товаров
    if (!isForSale) {
        // Разрешаем пустое значение (null) для цены по карте - будет отображаться "Цена по запросу"
        if (newPriceCard !== null && (isNaN(newPriceCard) || newPriceCard <= 0)) {
            alert('❌ Введите корректную цену по карте (больше 0) или оставьте пустым для "Цена по запросу"');
            return;
        }
        if (newPriceCash !== null && (isNaN(newPriceCash) || newPriceCash < 0)) {
            alert('❌ Введите корректную цену наличными (0 или больше) или оставьте пустым');
            return;
        }
        
        if (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100) {
            alert('❌ Введите корректную скидку (от 0 до 100%)');
            return;
        }
        
        if (isNaN(newQuantity) || newQuantity < 0) {
            alert('❌ Введите корректное количество (0 или больше)');
            return;
        }
    } else {
        // Валидация для товаров с флагом продажа
        if (newPriceType === 'range') {
            if (newPriceFrom !== null && (isNaN(newPriceFrom) || newPriceFrom < 0)) {
                alert('❌ Введите корректную цену от (0 или больше)');
                return;
            }
            if (newPriceTo !== null && (isNaN(newPriceTo) || newPriceTo < 0)) {
                alert('❌ Введите корректную цену до (0 или больше)');
                return;
            }
            if (newPriceFrom !== null && newPriceTo !== null && newPriceFrom > newPriceTo) {
                alert('❌ Цена от не может быть больше цены до');
                return;
            }
        } else if (newPriceType === 'fixed') {
            // Разрешаем пустое значение (null) для фиксированной цены - будет отображаться "Цена по запросу"
            // Если значение указано, проверяем что это валидное число >= 0
            if (newPriceFixed !== null && (isNaN(newPriceFixed) || newPriceFixed < 0)) {
                alert('❌ Введите корректную фиксированную цену (0 или больше) или оставьте пустым для "Цена по запросу"');
                return;
            }
        }
        if (newQuantityFrom !== null && (isNaN(newQuantityFrom) || newQuantityFrom < 0)) {
            alert('❌ Введите корректное количество от (0 или больше)');
            return;
        }
    }
    
    try {
        // Получаем appContext через геттер
        const appContext = appContextGetter ? appContextGetter() : null;
        
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Обновляем название и описание (без уведомлений)
        await updateProductNameDescriptionAPI(productId, appContext.shop_owner_id, newName, newDescription || null);
        
        if (isForSale) {
            // Для товаров с флагом продажа обновляем данные продажи
            console.log(`💾 Saving for-sale: productId=${productId}`, { 
                is_for_sale: true, 
                price_type: newPriceType, 
                price_from: newPriceFrom, 
                price_to: newPriceTo, 
                price_fixed: newPriceFixed, 
                quantity_from: newQuantityFrom, 
                quantity_unit: newQuantityUnit 
            });
            const forSaleResult = await updateProductForSaleAPI(productId, appContext.shop_owner_id, {
                is_for_sale: true,
                price_type: newPriceType,
                price_from: newPriceFrom,
                price_to: newPriceTo,
                price_fixed: newPriceFixed,
                quantity_from: newQuantityFrom,
                quantity_unit: newQuantityUnit
            });
            console.log(`✅ For-sale saved:`, forSaleResult);
        } else {
            // Для обычных товаров обновляем обычные поля (цена по карте, наличными, скидка)
            await updateProductAPI(productId, appContext.shop_owner_id, newPriceCard, newPriceCash, newDiscount ?? 0);
            
            // Обновляем количество и единицу измерения (без уведомлений)
            await updateProductQuantityAPI(productId, appContext.shop_owner_id, newQuantity, newQuantityUnitGeneral);

            // Порядок: sale_enabled → made_to_order → reservation_enabled → quantity_show_enabled
            console.log(`[SAVE ACTION FLAGS] productId=${productId} sale=${newSaleEnabled} order=${newMadeToOrder} reservation=${newReservationEnabled}`);
            try {
                await updateProductSaleEnabledAPI(productId, appContext.shop_owner_id, newSaleEnabled);
                console.log(`[SAVE ACTION FLAGS] ✅ sale_enabled updated`);
            } catch (e) {
                console.error(`[SAVE ACTION FLAGS] ❌ sale_enabled failed:`, e);
                throw e;
            }
            try {
                await updateProductMadeToOrderAPI(productId, appContext.shop_owner_id, newMadeToOrder);
                console.log(`[SAVE ACTION FLAGS] ✅ made_to_order updated`);
            } catch (e) {
                console.error(`[SAVE ACTION FLAGS] ❌ made_to_order failed:`, e);
                throw e;
            }
            try {
                await updateProductReservationEnabledAPI(productId, appContext.shop_owner_id, newReservationEnabled);
                console.log(`[SAVE ACTION FLAGS] ✅ reservation_enabled updated`);
            } catch (e) {
                console.error(`[SAVE ACTION FLAGS] ❌ reservation_enabled failed:`, e);
                throw e;
            }
            await updateProductQuantityShowEnabledAPI(productId, appContext.shop_owner_id, quantityShowEnabledToSave);
        }
        
        // ========== ПОЛУЧЕНИЕ СВЕЖИХ ДАННЫХ ТОВАРА ПЕРЕД СИНХРОНИЗАЦИЕЙ КОРЗИНЫ ==========
        // ВАЖНО: Получаем свежие данные ДО использования в синхронизации корзины, чтобы избежать TDZ
        let freshOwnerProduct = null;
        let freshClientProduct = null;
        let clientVisibleId = productId;
        
        // Получаем актуальный товар с сервера (редактируемый ID)
        try {
            freshOwnerProduct = await getProductByIdAPI(productId);
            // Определяем "клиентский" ID: клиент на витрине/в избранном может видеть sync-копию (main bot)
            clientVisibleId = (freshOwnerProduct && (freshOwnerProduct.sync_product_id != null)) ? freshOwnerProduct.sync_product_id : productId;
            freshClientProduct = freshOwnerProduct;
            if (freshOwnerProduct && clientVisibleId !== productId) {
                try {
                    freshClientProduct = await getProductByIdAPI(clientVisibleId);
                } catch (e) {
                    console.warn('⚠️ Could not fetch client-visible product:', e);
                }
            }
        } catch (e) {
            console.warn('⚠️ Could not fetch updated product:', e);
        }
        // ========== КОНЕЦ ПОЛУЧЕНИЯ СВЕЖИХ ДАННЫХ ==========
        
        // ========== СИНХРОНИЗАЦИЯ КОРЗИНЫ ПОСЛЕ ИЗМЕНЕНИЯ ТИПА ТОВАРА ==========
        // Проверяем, нужно ли удалить товар из корзины, если он стал не-sale
        try {
            const { getProductActionType } = await import('./utils/productActionType.js');
            const { isProductInCart, removeFromCart } = await import('./cart/cartStore.js');
            const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
            
            // Проверяем текущий тип товара (используем свежие данные если есть, иначе старые)
            const productForCheck = freshOwnerProduct || currentProduct;
            if (productForCheck && appContext) {
                const currentActionType = getProductActionType(productForCheck, appContext, shopSettings);
                const wasInCart = isProductInCart(productId);
                
                // Если товар был в корзине и стал не-sale - удаляем его
                if (wasInCart && currentActionType !== 'sale') {
                    console.log(`[PRODUCT EDIT] Removing product ${productId} from cart: actionType changed to ${currentActionType}`);
                    try {
                        await removeFromCart(productId);
                        // Показываем уведомление пользователю
                        const actionTypeText = {
                            'purchase': 'покупка',
                            'order': 'заказ',
                            'reserve': 'резервация',
                            'none': 'не продается'
                        }[currentActionType] || 'не продается';
                        console.log(`[PRODUCT EDIT] ✅ Product ${productId} removed from cart (type: ${actionTypeText})`);
                    } catch (cartError) {
                        // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
                        console.error(`[PRODUCT EDIT] ⚠️ Failed to remove product from cart:`, {
                            message: cartError?.message || 'Unknown error',
                            stack: cartError?.stack || '',
                            name: cartError?.name || 'Error',
                            productId: productId,
                            actionType: currentActionType,
                            actionTypeText: actionTypeText
                        });
                        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
                    }
                }
            }
        } catch (syncError) {
            // ========== ИСПРАВЛЕНИЕ: Детальное логирование ошибки ==========
            console.error(`[PRODUCT EDIT] ⚠️ Error syncing cart after type change:`, {
                message: syncError?.message || 'Unknown error',
                stack: syncError?.stack || '',
                name: syncError?.name || 'Error',
                productId: productId,
                // Дополнительная информация для диагностики
                ...(syncError?.response ? { responseStatus: syncError.response.status, responseText: String(syncError.response.text || '').substring(0, 200) } : {})
            });
            // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
            // Не блокируем сохранение при ошибке синхронизации корзины
        }
        // ========== КОНЕЦ СИНХРОНИЗАЦИИ КОРЗИНЫ ==========
        
        // Обновляем характеристики товара (замена списком)
        const characteristicsPayload = collectEditCharacteristics();
        await updateProductCharacteristicsAPI(productId, appContext.shop_owner_id, characteristicsPayload);
        console.log(`✅ Characteristics saved: count=${characteristicsPayload.length}`);
        
        // ВАЖНО: freshOwnerProduct, freshClientProduct и clientVisibleId уже получены выше (перед синхронизацией корзины)
        
        // Закрываем страницу или модальное окно редактирования (проверка по is-active)
        const editProductPage = document.getElementById('edit-product-page');
        if (editProductPage && editProductPage.classList.contains('is-active')) {
            closeEditProductPage();
        } else {
            const editProductModal = document.getElementById('edit-product-modal');
            if (editProductModal) editProductModal.style.display = 'none';
        }
        if (modalElement) {
            modalElement.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        
        alert('✅ Товар обновлен!');
        
        if (currentProductSetter && freshOwnerProduct) {
            currentProductSetter(freshOwnerProduct);
        }
        
        // Перезагружаем список товаров (сетка) — после sync на бэкенде список уже актуален
        if (loadDataCallback) {
            await loadDataCallback();
        }
        
        // Подставляем в allProducts свежие данные по обоим ID (редактируемый и client-visible), чтобы витрина/избранное использовали актуальный actionType
        if (allProductsGetter && allProductsSetter && (freshOwnerProduct || freshClientProduct)) {
            const list = allProductsGetter();
            if (Array.isArray(list) && list.length > 0) {
                let changed = false;
                const next = list.map(p => {
                    if (!p || p.id == null) return p;
                    if (freshOwnerProduct && p.id === freshOwnerProduct.id) {
                        changed = true;
                        // ========== ВАЖНО: Сохраняем action_type и can_add_to_cart от бэка ==========
                        return { ...freshOwnerProduct };
                    }
                    if (freshClientProduct && p.id === freshClientProduct.id) {
                        changed = true;
                        // ========== ВАЖНО: Сохраняем action_type и can_add_to_cart от бэка ==========
                        return { ...freshClientProduct };
                    }
                    return p;
                });
                if (changed) {
                    allProductsSetter(next);
                    if (applyFiltersCallback) applyFiltersCallback();
                    console.log(`[PRODUCT EDIT] ✅ Updated allProducts cache with fresh products (action_type preserved from backend)`);
                    
                    // ========== ЭМИССИЯ СОБЫТИЯ ОБНОВЛЕНИЯ ТОВАРА ==========
                    // Эмитим событие для обновления UI в других модулях (products_modal.js, products_render.js)
                    try {
                        const updateEvent = new CustomEvent('product:updated', {
                            detail: {
                                productId: productId,
                                clientVisibleId: clientVisibleId,
                                ownerProduct: freshOwnerProduct,
                                clientProduct: freshClientProduct,
                                timestamp: Date.now()
                            }
                        });
                        window.dispatchEvent(updateEvent);
                        
                        // ========== DEBUG: Логирование события ==========
                        const DEBUG_PRODUCT_EDIT = true; // Установить в false для отключения
                        if (DEBUG_PRODUCT_EDIT) {
                            const productForDebug = freshClientProduct || freshOwnerProduct;
                            console.log(`[PRODUCT EDIT] ✅ Dispatched product:updated event for product ${productId}:`, {
                                productId: productId,
                                clientVisibleId: clientVisibleId,
                                action_type: productForDebug?.action_type,
                                can_add_to_cart: productForDebug?.can_add_to_cart,
                                timestamp: updateEvent.detail.timestamp
                            });
                        }
                        // ========== КОНЕЦ DEBUG ==========
                    } catch (eventError) {
                        console.warn(`[PRODUCT EDIT] ⚠️ Failed to dispatch product:updated event:`, {
                            message: eventError?.message || 'Unknown error',
                            productId: productId
                        });
                        // Не блокируем сохранение при ошибке события
                    }
                    // ========== КОНЕЦ ЭМИССИИ СОБЫТИЯ ==========
                    
                    // ========== DEBUG: Временные логи для диагностики (можно выключить флагом) ==========
                    const DEBUG_PRODUCT_EDIT = true; // Установить в false для отключения
                    if (DEBUG_PRODUCT_EDIT && (freshOwnerProduct || freshClientProduct)) {
                        // ВАЖНО: Вычисляем isProductPageOpen ДО использования в debug-логе
                        const productPageForDebug = document.getElementById('product-page');
                        const isProductPageOpenForDebug = productPageForDebug && productPageForDebug.classList.contains('is-active');
                        const favoritesPageEl = document.getElementById('favorites-page');
                        const productForDebug = freshClientProduct || freshOwnerProduct;
                        console.log(`[PRODUCT EDIT DEBUG] After save - Product ${productId}:`, {
                            productId: productId,
                            clientVisibleId: clientVisibleId,
                            action_type: productForDebug.action_type,
                            can_add_to_cart: productForDebug.can_add_to_cart,
                            reason_not_sale: productForDebug.reason_not_sale,
                            is_for_sale: productForDebug.is_for_sale,
                            is_sale_enabled: productForDebug.is_sale_enabled,
                            is_made_to_order: productForDebug.is_made_to_order,
                            is_reservation_enabled: productForDebug.is_reservation_enabled,
                            allProductsCacheUpdated: changed,
                            productPageOpen: isProductPageOpenForDebug,
                            favoritesPageOpen: favoritesPageEl && favoritesPageEl.classList.contains('is-active')
                        });
                    }
                    // ========== КОНЕЦ DEBUG ==========
                    
                    // ========== DEBUG: Логирование обновления allProducts ==========
                    const DEBUG_ALLPRODUCTS_UPDATE = true; // Установить в false для отключения
                    if (DEBUG_ALLPRODUCTS_UPDATE) {
                        const updatedProduct = next.find(p => p && (p.id === productId || p.id === clientVisibleId));
                        console.log(`[PRODUCT EDIT DEBUG] allProducts updated:`, {
                            productId,
                            clientVisibleId,
                            updatedProductFound: !!updatedProduct,
                            updatedProductActionType: updatedProduct?.action_type,
                            updatedProductCanAddToCart: updatedProduct?.can_add_to_cart,
                            allProductsLength: next.length
                        });
                    }
                    // ========== КОНЕЦ DEBUG ==========
                }
            }
        }

        // ========== ВАЖНО: Вычисляем isProductPageOpen по state-классу is-active ==========
        const productPage = document.getElementById('product-page');
        const isProductPageOpen = productPage && productPage.classList.contains('is-active');
        const productForModal = freshClientProduct || freshOwnerProduct;
        
        // Страница товара (модалка): переоткрыть с товаром, который видит клиент (кнопка Купить/Заказ/Резерв)
        if (isProductPageOpen && showProductModalCallback && productForModal) {
            let imagesList = [];
            if (productForModal.images_urls && Array.isArray(productForModal.images_urls) && productForModal.images_urls.length > 0) {
                imagesList = productForModal.images_urls;
            } else if (productForModal.image_url) {
                imagesList = [productForModal.image_url];
            }
            const fullImages = imagesList.map(imgUrl => {
                if (!imgUrl) return '';
                if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) return imgUrl;
                if (imgUrl.startsWith('/')) return API_BASE + imgUrl;
                return API_BASE + '/' + imgUrl;
            }).filter(url => url !== '');
            showProductModalCallback(productForModal, null, fullImages);
        }

        // ========== ИСПРАВЛЕНИЕ: Принудительное обновление bottom sheet на странице товара ==========
        // Если страница товара открыта, нужно обновить bottom sheet с СВЕЖИМИ данными из кэша
        // ВАЖНО: isProductPageOpen и productForModal уже вычислены выше
        if (isProductPageOpen && productForModal) {
            try {
                // Получаем СВЕЖИЙ продукт из кэша (может быть обновлен после loadDataCallback)
                let freshProductFromCache = null;
                if (allProductsGetter) {
                    const allProducts = allProductsGetter();
                    if (Array.isArray(allProducts)) {
                        freshProductFromCache = allProducts.find(p => 
                            p && (p.id === productForModal.id || p.id === clientVisibleId || 
                                 (p.sync_product_id && (p.sync_product_id === productForModal.id || p.sync_product_id === clientVisibleId)))
                        );
                    }
                }
                
                const productToUpdate = freshProductFromCache || productForModal;
                
                // Импортируем функцию обновления bottom sheet
                const { updateProductPageBottomSheet } = await import('./handlers/products_modal.js');
                if (updateProductPageBottomSheet) {
                    // Обновляем bottom sheet с СВЕЖИМИ данными
                    await updateProductPageBottomSheet(productToUpdate);
                    console.log(`[PRODUCT EDIT] ✅ Updated product page bottom sheet with fresh data for product ${productToUpdate.id}`);
                }
            } catch (updateError) {
                // Логируем ошибку с полной информацией
                console.error(`[PRODUCT EDIT] ⚠️ Error updating product page bottom sheet:`, {
                    message: updateError?.message || 'Unknown error',
                    stack: updateError?.stack || '',
                    name: updateError?.name || 'Error',
                    productId: productForModal?.id,
                    clientVisibleId: clientVisibleId
                });
                // Не блокируем сохранение при ошибке обновления UI
            }
        }
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========

        // Избранное: перезагрузить страницу (проверка по is-active)
        const favoritesPageEl = document.getElementById('favorites-page');
        if (favoritesPageEl && favoritesPageEl.classList.contains('is-active')) {
            try {
                if (typeof window.loadFavoritesPage === 'function') await window.loadFavoritesPage();
            } catch (_) {}
        }

        if (typeof window.updateCartButtonsState === 'function') window.updateCartButtonsState();

        // ========== DEBUG: Логирование изменений типа товара ==========
        if (freshOwnerProduct || freshClientProduct) {
            try {
                const productForDebug = freshClientProduct || freshOwnerProduct;
                const shopSettings = window.getCurrentShopSettings ? window.getCurrentShopSettings() : null;
                const { getProductActionType } = await import('./utils/productActionType.js');
                const newActionType = getProductActionType(productForDebug, appContext, shopSettings);
                console.log(`[PRODUCT EDIT DEBUG] Product ${productId} type changed:`, {
                    productId,
                    clientVisibleId,
                    is_for_sale: productForDebug.is_for_sale,
                    is_sale_enabled: productForDebug.is_sale_enabled,
                    is_made_to_order: productForDebug.is_made_to_order,
                    is_reservation_enabled: productForDebug.is_reservation_enabled,
                    newActionType
                });
            } catch (debugError) {
                // Игнорируем ошибки debug-логирования
            }
        }
        // ========== КОНЕЦ DEBUG ==========

        // Bottom sheet: если открыт по этому товару — переоткрыть со свежим client-visible продуктом
        try {
            const cartSheet = await import('./cart/cartBottomSheet.js');
            const openSheetId = cartSheet.getCurrentBottomSheetProductId && cartSheet.getCurrentBottomSheetProductId();
            const isOpenForThis = (openSheetId === productId || openSheetId === clientVisibleId) && productForModal && cartSheet.showCartBottomSheet;
            if (isOpenForThis) {
                await cartSheet.showCartBottomSheet(productForModal);
            }
        } catch (_) {}
    } catch (e) {
        console.error('Save product edit error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Удаление товара
export async function deleteProduct(productId) {
    if (!confirm('Вы уверены, что хотите удалить этот товар? Это действие нельзя отменить.')) {
        return;
    }
    
    try {
        // Получаем appContext через геттер
        const appContext = appContextGetter ? appContextGetter() : null;
        
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        await deleteProductAPI(productId, appContext.shop_owner_id);
        alert('✅ Товар удален');
        
        // Закрываем модальное окно
        if (modalElement) {
            modalElement.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        
        // Обновляем данные
        if (loadDataCallback) {
            setTimeout(async () => {
                await loadDataCallback();
            }, 500);
        }
    } catch (e) {
        console.error('Delete product error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Пометить товар как проданный
export async function markAsSold(productId, product = null) {
    try {
        // Получаем appContext через геттер
        const appContext = appContextGetter ? appContextGetter() : null;
        
        if (!appContext) {
            alert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // Получаем allProducts через геттер
        const allProducts = allProductsGetter ? allProductsGetter() : [];
        
        // Если product не передан, ищем его в allProducts
        if (!product) {
            product = allProducts.find(p => p.id === productId);
        }
        
        // Проверяем количество товара
        const productQuantity = product?.quantity || 0;
        const hasQuantity = productQuantity > 1;
        
        if (hasQuantity) {
            // Если товаров больше 1, показываем модальное окно для выбора количества
            if (showSellModalCallback) {
                showSellModalCallback(productId, product);
            }
        } else {
            // Если товаров 1 или нет, продаем 1 товар по умолчанию
            if (!confirm('Пометить товар как проданный? Товар будет скрыт с витрины и добавлен в историю продаж.')) {
                return;
            }
            await markProductSoldAPI(productId, appContext.shop_owner_id, 1);
            alert('✅ Товар помечен как проданный');
            
            // Закрываем модальное окно
            if (modalElement) {
                modalElement.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            
            // Обновляем данные
            if (loadDataCallback) {
                setTimeout(async () => {
                    await loadDataCallback();
                }, 500);
            }
        }
    } catch (e) {
        console.error('Mark as sold error:', e);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

// Показать модальное окно для продажи товара
export function showSellModal(productId, product) {
    // Получаем appContext через геттер
    const appContext = appContextGetter ? appContextGetter() : null;
    
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    
    if (!sellModalElement) {
        alert('❌ Ошибка: модальное окно продажи не найдено');
        return;
    }
    
    const productQuantity = product?.quantity !== undefined && product?.quantity !== null ? product.quantity : 0;
    
    // Устанавливаем максимальное значение и значение по умолчанию
    const quantityInput = document.getElementById('sell-quantity');
    const sellAllCheckbox = document.getElementById('sell-all-checkbox');
    
    if (quantityInput) {
        quantityInput.value = 1;
        quantityInput.max = Math.max(1, productQuantity);
        quantityInput.min = 1;
    }
    
    // Сбрасываем чекбокс "Продать все"
    if (sellAllCheckbox) {
        sellAllCheckbox.checked = false;
    }
    
    // Обработчик чекбокса "Продать все"
    if (sellAllCheckbox && quantityInput) {
        sellAllCheckbox.onchange = (e) => {
            if (e.target.checked) {
                quantityInput.value = productQuantity;
                quantityInput.disabled = true;
            } else {
                quantityInput.disabled = false;
                quantityInput.value = 1;
            }
        };
    }
    
    // Показываем информацию о доступном количестве
    const quantityInfo = document.getElementById('sell-quantity-info');
    if (quantityInfo) {
        quantityInfo.textContent = `Доступно: ${productQuantity} шт.`;
    }
    
    // Устанавливаем обработчик кнопки продажи
    const submitBtn = document.getElementById('sell-submit');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            let quantity;
            if (sellAllCheckbox && sellAllCheckbox.checked) {
                quantity = productQuantity;
            } else {
                quantity = parseInt(quantityInput.value) || 1;
            }
            
            if (quantity < 1) {
                alert('❌ Количество должно быть не менее 1');
                return;
            }
            if (quantity > productQuantity) {
                alert(`❌ Нельзя продать больше, чем есть в наличии (${productQuantity} шт.)`);
                return;
            }
            
            sellModalElement.style.display = 'none';
            await markProductSoldAPI(productId, appContext.shop_owner_id, quantity);
            alert(`✅ Продано ${quantity} шт. товара`);
            
            // Закрываем модальное окно товара
            if (modalElement) {
                modalElement.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            
            // Обновляем данные
            if (loadDataCallback) {
                setTimeout(async () => {
                    await loadDataCallback();
                }, 500);
            }
        };
    }
    
    sellModalElement.classList.add('is-open');
    sellModalElement.style.display = 'flex';
}

