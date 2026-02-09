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
// Обновление цен (по карте, наличными) и скидки товара
export async function updateProductAPI(productId, shopOwnerId, priceCard, priceCash, discount) {
    const url = `${API_BASE}/api/products/${productId}/update-price-discount?user_id=${shopOwnerId}`;
    console.log(`Updating product: productId=${productId}, price_card=${priceCard}, price_cash=${priceCash}, discount=${discount}`);
    
    const body = {
        price_card: priceCard,
        price_cash: priceCash,
        discount: discount ?? 0
    };
    if (priceCard != null) body.price = priceCard;
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(body)
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
    const payload = { is_made_to_order: isMadeToOrder };
    const appContext = window.getAppContext ? window.getAppContext() : null;
    const botId = appContext ? appContext.bot_id : null;
    // Логирование запроса для диагностики отсутствующих PATCH (перехватывается remoteLogger)
    console.log(`[TOGGLE REQUEST] url=${url} payload=${JSON.stringify(payload)} product_id=${productId} bot_id=${botId}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    // Логирование ответа для диагностики (перехватывается remoteLogger)
    console.log(`[TOGGLE RESPONSE] status=${response.status} json=${responseText.substring(0, 200)}`);
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

// ========== REFACTORING STEP 5.10: updateProductSaleEnabledAPI() ==========
// Обновление статуса 'продажа' товара (без уведомлений)
export async function updateProductSaleEnabledAPI(productId, shopOwnerId, isSaleEnabled) {
    const url = `${API_BASE}/api/products/${productId}/update-sale-enabled?user_id=${shopOwnerId}`;
    const payload = { is_sale_enabled: isSaleEnabled };
    const appContext = window.getAppContext ? window.getAppContext() : null;
    const botId = appContext ? appContext.bot_id : null;
    // Логирование запроса для диагностики отсутствующих PATCH (перехватывается remoteLogger)
    console.log(`[TOGGLE REQUEST] url=${url} payload=${JSON.stringify(payload)} product_id=${productId} bot_id=${botId}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    // Логирование ответа для диагностики (перехватывается remoteLogger)
    console.log(`[TOGGLE RESPONSE] status=${response.status} json=${responseText.substring(0, 200)}`);
    console.log(`Update product sale-enabled response: status=${response.status}, body=${responseText}`);
    
    if (response.ok) {
        const result = JSON.parse(responseText);
        console.log(`✅ Sale-enabled updated successfully: is_sale_enabled=${result.is_sale_enabled}`);
    }
    
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить статус "продажа"';
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


// ========== END REFACTORING STEP 5.10 ==========

// Обновление статуса 'резервация' товара (без уведомлений)
export async function updateProductReservationEnabledAPI(productId, shopOwnerId, isReservationEnabled) {
    const url = `${API_BASE}/api/products/${productId}/update-reservation-enabled?user_id=${shopOwnerId}`;
    const payload = { is_reservation_enabled: isReservationEnabled };
    const appContext = window.getAppContext ? window.getAppContext() : null;
    const botId = appContext ? appContext.bot_id : null;
    // Логирование запроса для диагностики отсутствующих PATCH (перехватывается remoteLogger)
    console.log(`[TOGGLE REQUEST] url=${url} payload=${JSON.stringify(payload)} product_id=${productId} bot_id=${botId}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    // Логирование ответа для диагностики (перехватывается remoteLogger)
    console.log(`[TOGGLE RESPONSE] status=${response.status} json=${responseText.substring(0, 200)}`);
    if (response.ok) {
        return JSON.parse(responseText);
    }
    let errorMessage = 'Не удалось обновить статус "резервация"';
    try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.detail || errorMessage;
    } catch (e) {
        errorMessage = responseText;
    }
    throw new Error(errorMessage);
}

// ========== getCharacteristicNamesAPI ==========
// Справочник названий характеристик для выбора при добавлении (GET /api/characteristics/names)
export async function getCharacteristicNamesAPI(shopOwnerId, botId = null) {
    let url = `${API_BASE}/api/characteristics/names?user_id=${shopOwnerId}`;
    if (botId != null && botId !== '') {
        url += `&bot_id=${botId}`;
    }
    const response = await fetch(url, { headers: getBaseHeaders() });
    const responseText = await response.text();
    if (!response.ok) {
        console.warn('Failed to fetch characteristic names:', responseText);
        return [];
    }
    try {
        return JSON.parse(responseText);
    } catch (e) {
        return [];
    }
}
// ========== END getCharacteristicNamesAPI ==========

// ========== updateProductCharacteristicsAPI ==========
// Обновление характеристик товара: замена списком (PATCH /api/products/{id}/characteristics)
export async function updateProductCharacteristicsAPI(productId, shopOwnerId, characteristics) {
    const url = `${API_BASE}/api/products/${productId}/characteristics?user_id=${shopOwnerId}`;
    console.log(`Updating product characteristics: productId=${productId}, count=${characteristics.length}`);
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({ characteristics })
    });
    
    const responseText = await response.text();
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить характеристики товара';
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
// ========== END updateProductCharacteristicsAPI ==========

// ========== updateProductDeliveryAPI ==========
// Обновление настроек доставки товара (PATCH /api/products/{id}/delivery)
export async function updateProductDeliveryAPI(productId, shopOwnerId, payload) {
    const url = `${API_BASE}/api/products/${productId}/delivery?user_id=${shopOwnerId}`;
    console.log('Updating product delivery:', { productId, shopOwnerId, payload });

    const response = await fetch(url, {
        method: 'PATCH',
        headers: getBaseHeaders(),
        body: JSON.stringify({
            is_delivery_enabled: !!payload.is_delivery_enabled,
            is_pickup_enabled: !!payload.is_pickup_enabled,
            delivery_price: payload.delivery_price != null && payload.delivery_price !== '' ? Number(payload.delivery_price) : null,
            pickup_address: (payload.pickup_address || '').trim() || null,
            delivery_time: (payload.delivery_time || '').trim() || null
        })
    });

    const responseText = await response.text();
    if (!response.ok) {
        let errorMessage = 'Не удалось обновить настройки доставки';
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
// ========== END updateProductDeliveryAPI ==========
