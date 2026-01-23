// Модуль для редактирования товаров
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { getCurrentShopSettings } from './admin.js';
import {
    API_BASE,
    deleteProductAPI,
    markProductSoldAPI,
    updateProductAPI,
    updateProductForSaleAPI,
    updateProductMadeToOrderAPI,
    updateProductNameDescriptionAPI,
    updateProductQuantityAPI,
    updateProductQuantityShowEnabledAPI,
    updateProductSaleEnabledAPI
} from './api.js';

// Зависимости, которые будут переданы из app.js
let currentProductGetter = null; // Функция-геттер для получения currentProduct
let currentProductSetter = null; // Функция-сеттер для установки currentProduct
let appContextGetter = null; // Функция-геттер для получения appContext
let modalElement = null; // Элемент модального окна товара
let loadDataCallback = null; // Функция для загрузки данных
let allProductsGetter = null; // Функция-геттер для получения allProducts
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
    showSellModalCallback = dependencies.showSellModal;
    sellModalElement = dependencies.sellModal;
    showProductModalCallback = dependencies.showProductModal;
}

// Показ модального окна редактирования товара
export function showEditProductModal(prod) {
    try {
        // Сохраняем текущий товар для использования в saveProductEdit
        if (currentProductSetter) {
            currentProductSetter(prod);
        }
        
        const editProductModal = document.getElementById('edit-product-modal');
        if (!editProductModal) {
            console.error('❌ Edit product modal not found!');
            alert('❌ Ошибка: модальное окно редактирования не найдено');
            return;
        }
    
    const editNameInput = document.getElementById('edit-name');
    const editDescriptionInput = document.getElementById('edit-description');
    
    if (!editNameInput || !editDescriptionInput) {
        console.error('❌ Required input fields not found!');
        alert('❌ Ошибка: обязательные поля не найдены');
        return;
    }
    const editPriceInput = document.getElementById('edit-price');
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
        if (editDiscountField) editDiscountField.style.display = 'none';
        if (editQuantityField) editQuantityField.style.display = 'none';
        if (editQuantityUnitGeneralField) editQuantityUnitGeneralField.style.display = 'none';
        if (editQuantityShowEnabledField) editQuantityShowEnabledField.style.display = 'none';
        if (editMadeToOrderField) editMadeToOrderField.style.display = 'none';
        
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
        if (editDiscountField) editDiscountField.style.display = 'block';
        if (editQuantityField) editQuantityField.style.display = 'block';
        if (editQuantityUnitGeneralField) editQuantityUnitGeneralField.style.display = 'block';
        if (editQuantityShowEnabledField) editQuantityShowEnabledField.style.display = 'block';
        if (editMadeToOrderField) editMadeToOrderField.style.display = 'block';
        
        // Скрываем поля для продажи
        if (forSaleFields) {
            forSaleFields.style.display = 'none';
        }
        
        // Заполняем обычные поля
        editPriceInput.value = prod.price || '';
        editDiscountInput.value = prod.discount || 0;
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
        if (editSaleEnabledInput) {
            const isSaleEnabled = prod.is_sale_enabled === true || 
                                 prod.is_sale_enabled === 1 || 
                                 prod.is_sale_enabled === '1' ||
                                 prod.is_sale_enabled === 'true' ||
                                 String(prod.is_sale_enabled).toLowerCase() === 'true';
            editSaleEnabledInput.checked = isSaleEnabled;
        }
        
        // Делаем тумблер "Показ количества" неактивным, если включен "Под заказ"
        // При включенном "Под заказ" количество не отображается, поэтому тумблер неактивен
        editQuantityShowEnabledInput.disabled = isMadeToOrder;
        
        // Обработчик изменения тумблера "Под заказ" - отключаем/включаем тумблер "Показ количества"
        editMadeToOrderInput.onchange = () => {
            const madeToOrderEnabled = editMadeToOrderInput.checked;
            // Отключаем тумблер "Показ количества" при включении "Под заказ"
            editQuantityShowEnabledInput.disabled = madeToOrderEnabled;
        };
    }
    
    console.log('🔧 Edit product modal - full product object:', JSON.stringify(prod, null, 2));
    console.log('🔧 Edit product modal - is_made_to_order raw:', prod.is_made_to_order, 'type:', typeof prod.is_made_to_order, 'checked:', isMadeToOrder);
    console.log('🔧 Edit product modal - is_for_sale raw:', prod.is_for_sale, 'type:', typeof prod.is_for_sale, 'checked:', isForSale);
    
    // Показываем модальное окно
    editProductModal.style.display = 'flex';
    
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
    
    // Добавляем новые обработчики
    newSaveBtn.onclick = async () => {
        await saveProductEdit(prod.id);
    };
    
    newCancelBtn.onclick = () => {
        editProductModal.style.display = 'none';
    };
    } catch (error) {
        console.error('❌ Error in showEditProductModal:', error);
        alert(`❌ Ошибка при открытии окна редактирования: ${error.message}`);
    }
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
    const newDescription = editDescriptionInput.value.trim();
    
    // Для товаров с флагом продажа не парсим обычные поля
    let newPrice, newDiscount, newQuantity, newQuantityUnitGeneral, newMadeToOrder, quantityShowEnabledToSave;
    if (!isForSale) {
        // Парсим значения: если поле пустое или только пробелы, сохраняем null
        // Если parseFloat/parseInt возвращает NaN, тоже сохраняем null
        const priceVal = editPriceInput.value.trim();
        newPrice = priceVal ? (isNaN(parseFloat(priceVal)) ? null : parseFloat(priceVal)) : null;
        
        const discountVal = editDiscountInput.value.trim();
        newDiscount = discountVal ? (isNaN(parseFloat(discountVal)) ? null : parseFloat(discountVal)) : null;
        
        const quantityVal = editQuantityInput.value.trim();
        newQuantity = quantityVal ? (isNaN(parseInt(quantityVal, 10)) ? null : parseInt(quantityVal, 10)) : null;
        // Получаем единицу измерения для обычных товаров
        newQuantityUnitGeneral = editQuantityUnitGeneralInput ? editQuantityUnitGeneralInput.value || null : null;
        // Получаем значение тумблера "Показ количества"
        const shopSettingsForSave = getCurrentShopSettings();
        const globalQuantityEnabledForSave = shopSettingsForSave ? (shopSettingsForSave.quantity_enabled !== false) : true;
        newMadeToOrder = editMadeToOrderInput.checked;
        
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
        // Разрешаем пустое значение (null) для цены - будет отображаться "Цена по запросу"
        if (newPrice !== null && (isNaN(newPrice) || newPrice <= 0)) {
            alert('❌ Введите корректную цену (больше 0) или оставьте пустым для "Цена по запросу"');
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
            // Для обычных товаров обновляем обычные поля
            // Обновляем цену и скидку (с уведомлениями)
            await updateProductAPI(productId, appContext.shop_owner_id, newPrice, newDiscount);
            
            // Обновляем количество и единицу измерения (без уведомлений)
            await updateProductQuantityAPI(productId, appContext.shop_owner_id, newQuantity, newQuantityUnitGeneral);
            
            // Обновляем индивидуальную настройку показа количества (без уведомлений)
            console.log(`💾 Saving quantity-show-enabled: productId=${productId}, quantityShowEnabled=${quantityShowEnabledToSave}`);
            await updateProductQuantityShowEnabledAPI(productId, appContext.shop_owner_id, quantityShowEnabledToSave);
            console.log(`✅ Quantity-show-enabled saved:`, quantityShowEnabledToSave);
            
            // Обновляем статус 'под заказ' (без уведомлений)
            console.log(`💾 Saving made-to-order: productId=${productId}, isMadeToOrder=${newMadeToOrder}`);
            const madeToOrderResult = await updateProductMadeToOrderAPI(productId, appContext.shop_owner_id, newMadeToOrder);
            console.log(`✅ Made-to-order saved:`, madeToOrderResult);
            
            // Обновляем статус 'продажа' (без уведомлений)
            const editSaleEnabledInput = document.getElementById('edit-sale-enabled');
            const newSaleEnabled = editSaleEnabledInput ? editSaleEnabledInput.checked : false;
            console.log(`💾 Saving sale-enabled: productId=${productId}, isSaleEnabled=${newSaleEnabled}`);
            const saleEnabledResult = await updateProductSaleEnabledAPI(productId, appContext.shop_owner_id, newSaleEnabled);
            console.log(`✅ Sale-enabled saved:`, saleEnabledResult);
        }
        
        // Закрываем модальное окно редактирования
        const editProductModal = document.getElementById('edit-product-modal');
        editProductModal.style.display = 'none';
        
        // Закрываем модальное окно товара
        if (modalElement) {
            modalElement.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        
        // Показываем уведомление
        alert('✅ Товар обновлен!');
        
        // Обновляем данные и сбрасываем currentProduct
        if (currentProductSetter) {
            currentProductSetter(null);
        }
        
        // Обновляем данные (товары и категории)
        if (loadDataCallback) {
            await loadDataCallback();
            console.log('✅ Data reloaded after product edit');
        }
        
        // Проверяем, открыта ли страница товара, и обновляем её если нужно
        const productPage = document.getElementById('product-page');
        const isProductPageOpen = productPage && (productPage.style.display === 'block' || productPage.style.display === 'flex');
        
        if (isProductPageOpen && showProductModalCallback && allProductsGetter) {
            // Получаем обновленный список товаров
            const allProducts = allProductsGetter();
            if (allProducts && Array.isArray(allProducts)) {
                // Ищем обновленный товар в списке
                const updatedProduct = allProducts.find(p => p.id === productId);
                if (updatedProduct) {
                    // Получаем изображения товара
                    let imagesList = [];
                    if (updatedProduct.images_urls && Array.isArray(updatedProduct.images_urls) && updatedProduct.images_urls.length > 0) {
                        imagesList = updatedProduct.images_urls;
                    } else if (updatedProduct.image_url) {
                        imagesList = [updatedProduct.image_url];
                    }
                    
                    // Формируем полные URL изображений
                    const fullImages = imagesList.map(imgUrl => {
                        if (!imgUrl) return '';
                        if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
                            return imgUrl;
                        }
                        if (imgUrl.startsWith('/')) {
                            return API_BASE + imgUrl;
                        }
                        return API_BASE + '/' + imgUrl;
                    }).filter(url => url !== '');
                    
                    // Обновляем страницу товара с новыми данными
                    console.log('🔄 Updating product page with new data for product:', updatedProduct.id);
                    showProductModalCallback(updatedProduct, null, fullImages);
                } else {
                    console.warn('⚠️ Updated product not found in products list');
                }
            }
        }
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
    
    sellModalElement.style.display = 'flex';
}

