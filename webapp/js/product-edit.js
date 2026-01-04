// Модуль для редактирования товаров
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { getCurrentShopSettings } from './admin.js';

// Зависимости, которые будут переданы из app.js
let currentProductGetter = null; // Функция-геттер для получения currentProduct
let currentProductSetter = null; // Функция-сеттер для установки currentProduct
let saveProductEditCallback = null; // Функция для сохранения изменений товара

// Инициализация зависимостей
export function initProductEditDependencies(dependencies) {
    currentProductGetter = dependencies.currentProductGetter;
    currentProductSetter = dependencies.currentProductSetter;
    saveProductEditCallback = dependencies.saveProductEdit;
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
    editProductModal.style.display = 'block';
    
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
        if (saveProductEditCallback) {
            await saveProductEditCallback(prod.id);
        }
    };
    
    newCancelBtn.onclick = () => {
        editProductModal.style.display = 'none';
    };
    } catch (error) {
        console.error('❌ Error in showEditProductModal:', error);
        alert(`❌ Ошибка при открытии окна редактирования: ${error.message}`);
    }
}

