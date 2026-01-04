// API для работы с товарами
import { API_BASE, apiRequest, getBaseHeaders, getBaseHeadersNoAuth } from './client.js';

// Загрузка товаров (не требует авторизации - только просмотр)
export async function fetchProducts(shopOwnerId, categoryId = null, botId = null) {
    let url = `${API_BASE}/api/products/?user_id=${shopOwnerId}`;
    if (categoryId !== null) {
        url += `&category_id=${categoryId}`;
    }
    if (botId !== null && botId !== undefined) {
        url += `&bot_id=${botId}`;
    }
    console.log("📦 Fetching products from:", url, "botId:", botId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/products.js:5',message:'fetchProducts entry',data:{shopOwnerId,categoryId,botId,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeadersNoAuth()
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/products.js:19',message:'fetchProducts success',data:{count:data?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.log("✅ Products fetched:", data.length);
        return data;
    } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/products.js:22',message:'fetchProducts error',data:{error:e.message,stack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.error("❌ Error fetching products:", e);
        throw e;
    }
}

// Переключение статуса "горящее предложение"
export async function toggleHotOffer(productId, shopOwnerId, isHotOffer) {
    const url = `${API_BASE}/api/products/${productId}/hot-offer?user_id=${shopOwnerId}`;
    console.log(`Toggling hot offer: productId=${productId}, isHotOffer=${isHotOffer}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                is_hot_offer: isHotOffer
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error toggling hot offer:", e);
        throw e;
    }
}

// Обновление цены и скидки товара
export async function updateProductAPI(productId, shopOwnerId, price, discount) {
    const url = `${API_BASE}/api/products/${productId}/update-price-discount?user_id=${shopOwnerId}`;
    console.log(`Updating product: productId=${productId}, price=${price}, discount=${discount}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                price: price,
                discount: discount
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating product:", e);
        throw e;
    }
}

// Обновление названия и описания товара (без уведомлений)
export async function updateProductNameDescriptionAPI(productId, shopOwnerId, name, description) {
    const url = `${API_BASE}/api/products/${productId}/update-name-description?user_id=${shopOwnerId}`;
    console.log(`Updating product name/description: productId=${productId}, name=${name}, description=${description}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                name: name,
                description: description || null
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating product name/description:", e);
        throw e;
    }
}

// Обновление количества товара
export async function updateProductQuantityAPI(productId, shopOwnerId, quantity, quantityUnit = null) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity: productId=${productId}, quantity=${quantity}, quantityUnit=${quantityUnit}`);
    
    const body = { quantity: quantity };
    if (quantityUnit !== null) {
        body.quantity_unit = quantityUnit;
    }
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify(body)
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating product quantity:", e);
        throw e;
    }
}

// Обновление статуса "под заказ"
export async function updateProductMadeToOrderAPI(productId, shopOwnerId, isMadeToOrder) {
    const url = `${API_BASE}/api/products/${productId}/update-made-to-order?user_id=${shopOwnerId}`;
    console.log(`Updating product made-to-order: productId=${productId}, isMadeToOrder=${isMadeToOrder}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                is_made_to_order: isMadeToOrder
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating product made-to-order:", e);
        throw e;
    }
}

// Обновление настройки показа количества
export async function updateProductQuantityShowEnabledAPI(productId, shopOwnerId, quantityShowEnabled) {
    const url = `${API_BASE}/api/products/${productId}/update-quantity-show-enabled?user_id=${shopOwnerId}`;
    console.log(`Updating product quantity-show-enabled: productId=${productId}, quantityShowEnabled=${quantityShowEnabled}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                quantity_show_enabled: quantityShowEnabled
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating product quantity-show-enabled:", e);
        throw e;
    }
}

// Обновление функции "покупка"
export async function updateProductForSaleAPI(productId, shopOwnerId, forSaleData) {
    const url = `${API_BASE}/api/products/${productId}/update-for-sale?user_id=${shopOwnerId}`;
    console.log(`Updating product for-sale: productId=${productId}, forSaleData=${JSON.stringify(forSaleData)}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                is_for_sale: forSaleData.is_for_sale,
                price_from: forSaleData.price_from,
                price_to: forSaleData.price_to,
                price_fixed: forSaleData.price_fixed,
                price_type: forSaleData.price_type || 'range',
                quantity_from: forSaleData.quantity_from,
                quantity_unit: forSaleData.quantity_unit
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error updating product for-sale:", e);
        throw e;
    }
}

// Массовое обновление статуса "под заказ" для всех товаров
export async function bulkUpdateAllProductsMadeToOrderAPI(isMadeToOrder) {
    const url = `${API_BASE}/api/products/bulk-update-made-to-order`;
    console.log(`Bulk updating products made-to-order: isMadeToOrder=${isMadeToOrder}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'PATCH',
            headers: getBaseHeaders(),
            body: JSON.stringify({
                is_made_to_order: isMadeToOrder
            })
        });
        return data;
    } catch (e) {
        console.error("❌ Error bulk updating products made-to-order:", e);
        throw e;
    }
}

// Удаление товара
export async function deleteProductAPI(productId, shopOwnerId) {
    const url = `${API_BASE}/api/products/${productId}?user_id=${shopOwnerId}`;
    console.log(`Deleting product: productId=${productId}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'DELETE',
            headers: getBaseHeaders()
        });
        return data;
    } catch (e) {
        console.error("❌ Error deleting product:", e);
        throw e;
    }
}

// Пометить товар как проданный
export async function markProductSoldAPI(productId, shopOwnerId, quantity = 1) {
    const url = `${API_BASE}/api/products/${productId}/mark-sold?user_id=${shopOwnerId}&quantity=${quantity}`;
    console.log(`Marking product as sold: productId=${productId}, quantity=${quantity}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'POST',
            headers: getBaseHeaders()
        });
        return data;
    } catch (e) {
        console.error("❌ Error marking product as sold:", e);
        throw e;
    }
}

// Получить список проданных товаров
export async function getSoldProductsAPI(shopOwnerId) {
    const url = `${API_BASE}/api/products/sold?user_id=${shopOwnerId}`;
    console.log(`Fetching sold products: shopOwnerId=${shopOwnerId}`);
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeaders()
        });
        return data;
    } catch (e) {
        console.error("❌ Error fetching sold products:", e);
        throw e;
    }
}

// Удалить запись о проданном товаре
export async function deleteSoldProductAPI(soldId, shopOwnerId) {
    const url = `${API_BASE}/api/products/sold/${soldId}?user_id=${shopOwnerId}`;
    console.log(`Deleting sold product: soldId=${soldId}, shopOwnerId=${shopOwnerId}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'DELETE',
            headers: getBaseHeaders()
        });
        return data;
    } catch (e) {
        console.error("❌ Error deleting sold product:", e);
        throw e;
    }
}

// Удалить несколько записей о проданных товарах
export async function deleteSoldProductsAPI(soldIds, shopOwnerId) {
    const url = `${API_BASE}/api/products/sold/batch-delete?user_id=${shopOwnerId}`;
    console.log(`Deleting sold products: soldIds=${soldIds}, shopOwnerId=${shopOwnerId}`);
    
    try {
        const data = await apiRequest(url, {
            method: 'POST',
            headers: {
                ...getBaseHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(soldIds)
        });
        return data;
    } catch (e) {
        console.error("❌ Error deleting sold products:", e);
        throw e;
    }
}

