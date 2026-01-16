// ========== REFACTORING STEP 5.1: toggleHotOffer() ==========
// Модуль для обновления товаров
// Дата начала: 2024-12-19
// Статус: В процессе

import { API_BASE, getBaseHeaders } from './config.js';

// Переключение статуса "горящее предложение" для товара
export async function toggleHotOffer(productId, shopOwnerId, isHotOffer) {
    const url = `${API_BASE}/api/products/${productId}/hot-offer?user_id=${shopOwnerId}`;
    console.log(`Toggling hot offer: productId=${productId}, isHotOffer=${isHotOffer}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_hot_offer: isHotOffer
        })
    });
    
    const responseText = await response.text();
    console.log(`Hot offer toggle response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось изменить статус горящего предложения';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.1 ==========

// ========== REFACTORING STEP 5.2: updateProductAPI() ==========
// Обновление цены и скидки товара
export async function updateProductAPI(productId, shopOwnerId, price, discount) {
    const url = `${API_BASE}/api/products/${productId}/update-price-discount?user_id=${shopOwnerId}`;
    console.log(`Updating product: productId=${productId}, price=${price}, discount=${discount}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            price: price,
            discount: discount
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить товар';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.2 ==========

// ========== REFACTORING STEP 5.3: updateProductNameDescriptionAPI() ==========
// Обновление названия и описания товара (без уведомлений)
export async function updateProductNameDescriptionAPI(productId, shopOwnerId, name, description) {
    const url = `${API_BASE}/api/products/${productId}/update-name-description?user_id=${shopOwnerId}`;
    console.log(`Updating product name/description: productId=${productId}, name=${name}, description=${description}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            name: name,
            description: description || null
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product name/description response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить название и описание товара';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.3 ==========

// ========== REFACTORING STEP 5.4: updateProductQuantityAPI() ==========
// Обновление количества товара (без уведомлений)
export async function updateProductQuantityAPI(productId, shopOwnerId, quantity, quantityUnit = null) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity: productId=${productId}, quantity=${quantity}, quantityUnit=${quantityUnit}`);
    
    const body = { quantity: quantity };
    if (quantityUnit !== null) {
        body.quantity_unit = quantityUnit;
    }
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    console.log(`Update product quantity response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить количество товара';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.4 ==========

// ========== REFACTORING STEP 5.5: updateProductMadeToOrderAPI() ==========
// Обновление статуса 'под заказ' товара (без уведомлений)
export async function updateProductMadeToOrderAPI(productId, shopOwnerId, isMadeToOrder) {
    const url = `${API_BASE}/api/products/${productId}/update-made-to-order?user_id=${shopOwnerId}`;
    console.log(`Updating product made-to-order: productId=${productId}, isMadeToOrder=${isMadeToOrder}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_made_to_order: isMadeToOrder
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product made-to-order response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Made-to-order updated successfully: is_made_to_order=${result.is_made_to_order}`);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус "под заказ"';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.5 ==========

// ========== REFACTORING STEP 5.6: updateProductQuantityShowEnabledAPI() ==========
// Обновление индивидуальной настройки показа количества товара (без уведомлений)
export async function updateProductQuantityShowEnabledAPI(productId, shopOwnerId, quantityShowEnabled) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity-show-enabled?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity-show-enabled: productId=${productId}, quantityShowEnabled=${quantityShowEnabled}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            quantity_show_enabled: quantityShowEnabled
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product quantity-show-enabled response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Quantity-show-enabled updated successfully: quantity_show_enabled=${result.quantity_show_enabled}`);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить настройку показа количества';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.6 ==========

// ========== REFACTORING STEP 5.7: updateProductForSaleAPI() ==========
// Обновление функции 'покупка' товара (без уведомлений)
export async function updateProductForSaleAPI(productId, shopOwnerId, forSaleData) {
    const url = `${API_BASE}/api/products/${productId}/update-for-sale?user_id=${shopOwnerId}`;
    console.log(`Updating product for-sale: productId=${productId}`, forSaleData);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_for_sale: forSaleData.is_for_sale,
            price_type: forSaleData.price_type,
            price_from: forSaleData.price_from,
            price_to: forSaleData.price_to,
            price_fixed: forSaleData.price_fixed,
            quantity_from: forSaleData.quantity_from,
            quantity_unit: forSaleData.quantity_unit
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product for-sale response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ For-sale updated successfully:`, result);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить функцию "покупка"';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.7 ==========

// ========== REFACTORING STEP 5.8: bulkUpdateAllProductsMadeToOrderAPI() ==========
// Массовое обновление статуса 'под заказ' для всех товаров
export async function bulkUpdateAllProductsMadeToOrderAPI(isMadeToOrder) {
    const url = `${API_BASE}/api/products/bulk-update-made-to-order`;
    console.log(`Bulk updating all products made-to-order: isMadeToOrder=${isMadeToOrder}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_made_to_order: isMadeToOrder
        })
    });
    
    const responseText = await response.text();
    console.log(`Bulk update made-to-order response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Bulk update made-to-order successful: updated_count=${result.updated_count}, is_made_to_order=${result.is_made_to_order}`);
        return result;
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус "под заказ" для всех товаров';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.8 ==========

// ========== REFACTORING STEP 5.9: updateProductHiddenAPI() ==========
// Обновление статуса скрытия товара (без уведомлений)
export async function updateProductHiddenAPI(productId, shopOwnerId, isHidden) {
    const url = `${API_BASE}/api/products/${productId}/update-hidden?user_id=${shopOwnerId}`;
    console.log(`Updating product hidden status: productId=${productId}, isHidden=${isHidden}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_hidden: isHidden
        })
    });
    
    const responseText = await response.text();
    console.log(`Update product hidden status response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Hidden status updated successfully: is_hidden=${result.is_hidden}`);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус скрытия товара';
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorMessage;
        } catch (e) {
            errorMessage = responseText;
        }
        throw new Error(errorMessage);
    }
    
    return JSON.parse(responseText);
}


// ========== END REFACTORING STEP 5.9 ==========

