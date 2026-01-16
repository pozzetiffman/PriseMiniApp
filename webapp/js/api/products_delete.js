// ========== REFACTORING STEP 6.1: deleteProductAPI() ==========
// Модуль для удаления товаров
// Дата начала: 2024-12-19
// Статус: В процессе

import { API_BASE, getBaseHeaders } from './config.js';

// Удаление товара
export async function deleteProductAPI(productId, shopOwnerId) {
    const url = `${API_BASE}/api/products/${productId}?user_id=${shopOwnerId}`;
    console.log(`Deleting product: productId=${productId}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Delete product response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить товар';
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


// ========== END REFACTORING STEP 6.1 ==========

// ========== REFACTORING STEP 6.2: markProductSoldAPI() ==========
// Пометить товар как проданный
export async function markProductSoldAPI(productId, shopOwnerId, quantity = 1) {
    const url = `${API_BASE}/api/products/${productId}/mark-sold?user_id=${shopOwnerId}&quantity=${quantity}`;
    console.log(`Marking product as sold: productId=${productId}, quantity=${quantity}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Mark sold response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось пометить товар как проданный';
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


// ========== END REFACTORING STEP 6.2 ==========

// ========== REFACTORING STEP 6.3: deleteSoldProductAPI() ==========
// Удалить запись о проданном товаре
export async function deleteSoldProductAPI(soldId, shopOwnerId) {
    const url = `${API_BASE}/api/products/sold/${soldId}?user_id=${shopOwnerId}`;
    console.log(`Deleting sold product: soldId=${soldId}, shopOwnerId=${shopOwnerId}`);
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getBaseHeaders()
    });
    
    const responseText = await response.text();
    console.log(`Delete sold product response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить запись о проданном товаре';
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


// ========== END REFACTORING STEP 6.3 ==========

// ========== REFACTORING STEP 6.4: deleteSoldProductsAPI() ==========
// Удалить несколько записей о проданных товарах
export async function deleteSoldProductsAPI(soldIds, shopOwnerId) {
    const url = `${API_BASE}/api/products/sold/batch-delete?user_id=${shopOwnerId}`;
    console.log(`Deleting sold products: soldIds=${soldIds}, shopOwnerId=${shopOwnerId}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            ...getBaseHeaders(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(soldIds)
    });
    
    const responseText = await response.text();
    console.log(`Delete sold products response: status=${response.status}, body=${responseText}`);
    
    if (!response.ok) {
        let errorMessage = 'Не удалось удалить записи о проданных товарах';
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


// ========== END REFACTORING STEP 6.4 ==========

