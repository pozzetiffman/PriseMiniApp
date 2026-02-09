/**
 * ПРИМЕР: Как создать C2C товар (клиентом другим клиентам)
 * 
 * Этот файл показывает, как клиент может создать товар для продажи
 * другим клиентам через API.
 */

// ============================================
// ВАРИАНТ 1: Простой пример (минимальный)
// ============================================

async function createC2CProductSimple(name, price, categoryId) {
    const formData = new FormData();
    
    // Обязательные поля
    formData.append('name', name);
    formData.append('price', price.toString());
    formData.append('category_id', categoryId.toString());
    formData.append('user_id', '0'); // Будет заменен автоматически на shop_owner_id
    
    // ⚠️ ВАЖНО: Флаг C2C товара
    formData.append('is_client_sale', 'true');
    
    // Опциональные поля
    formData.append('description', 'Описание товара');
    formData.append('quantity', '1');
    
    try {
        const response = await fetch(`${window.API_BASE || ''}/api/products/`, {
            method: 'POST',
            headers: {
                'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
        }
        
        const product = await response.json();
        console.log('✅ Товар создан:', product);
        return product;
    } catch (error) {
        console.error('❌ Ошибка создания товара:', error);
        throw error;
    }
}

// Использование:
// createC2CProductSimple('Мой товар', 1000, 1);


// ============================================
// ВАРИАНТ 2: Полный пример (с фото)
// ============================================

async function createC2CProductFull(productData) {
    const {
        name,
        price,
        categoryId,
        description = '',
        quantity = 1,
        images = [] // Массив File объектов
    } = productData;
    
    const formData = new FormData();
    
    // Обязательные поля
    formData.append('name', name);
    formData.append('price', price.toString());
    formData.append('category_id', categoryId.toString());
    formData.append('user_id', '0'); // Заменится автоматически
    
    // ⚠️ ВАЖНО: Флаг C2C товара
    formData.append('is_client_sale', 'true');
    
    // Опциональные поля
    if (description) {
        formData.append('description', description);
    }
    if (quantity) {
        formData.append('quantity', quantity.toString());
    }
    
    // Добавляем фото (до 5 штук)
    images.slice(0, 5).forEach((imageFile, index) => {
        formData.append('images', imageFile);
    });
    
    try {
        const response = await fetch(`${window.API_BASE || ''}/api/products/`, {
            method: 'POST',
            headers: {
                'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка ${response.status}: ${errorText}`);
        }
        
        const product = await response.json();
        console.log('✅ C2C товар создан:', product);
        return product;
    } catch (error) {
        console.error('❌ Ошибка создания C2C товара:', error);
        throw error;
    }
}

// Использование:
// const imageFiles = [file1, file2]; // File объекты из input[type="file"]
// createC2CProductFull({
//     name: 'Мой товар',
//     price: 1000,
//     categoryId: 1,
//     description: 'Описание',
//     quantity: 5,
//     images: imageFiles
// });


// ============================================
// ВАРИАНТ 3: С получением категорий
// ============================================

async function getCategories(shopOwnerId) {
    try {
        const response = await fetch(
            `${window.API_BASE || ''}/api/categories/?shop_owner_id=${shopOwnerId}`,
            {
                headers: {
                    'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
        }
        
        const categories = await response.json();
        return categories;
    } catch (error) {
        console.error('❌ Ошибка получения категорий:', error);
        throw error;
    }
}

async function createC2CProductWithCategorySelection(name, price, shopOwnerId) {
    // 1. Получаем список категорий
    const categories = await getCategories(shopOwnerId);
    
    if (categories.length === 0) {
        throw new Error('Нет доступных категорий');
    }
    
    // 2. Используем первую категорию (или можно выбрать другую)
    const categoryId = categories[0].id;
    
    // 3. Создаем товар
    return await createC2CProductSimple(name, price, categoryId);
}

// Использование:
// createC2CProductWithCategorySelection('Мой товар', 1000, 123);


// ============================================
// ВАРИАНТ 4: С обработкой ошибок и уведомлениями
// ============================================

async function createC2CProductWithNotifications(productData) {
    try {
        // Показываем индикатор загрузки
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.MainButton.showProgress();
        }
        
        const product = await createC2CProductFull(productData);
        
        // Успех
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.MainButton.hideProgress();
            window.Telegram.WebApp.showAlert('✅ Товар успешно создан!');
        } else {
            alert('✅ Товар успешно создан!');
        }
        
        return product;
    } catch (error) {
        // Ошибка
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.MainButton.hideProgress();
            window.Telegram.WebApp.showAlert(`❌ Ошибка: ${error.message}`);
        } else {
            alert(`❌ Ошибка: ${error.message}`);
        }
        
        throw error;
    }
}


// ============================================
// ВАРИАНТ 5: Полный пример с формой
// ============================================

/**
 * Пример использования в HTML форме:
 * 
 * <form id="create-product-form">
 *   <input type="text" name="name" placeholder="Название" required>
 *   <input type="number" name="price" placeholder="Цена" required>
 *   <select name="category_id" required>
 *     <option value="">Выберите категорию</option>
 *   </select>
 *   <textarea name="description" placeholder="Описание"></textarea>
 *   <input type="number" name="quantity" placeholder="Количество" value="1">
 *   <input type="file" name="images" multiple accept="image/*">
 *   <button type="submit">Создать товар</button>
 * </form>
 */

function setupProductForm() {
    const form = document.getElementById('create-product-form');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        
        // Добавляем обязательные параметры для C2C
        formData.append('user_id', '0');
        formData.append('is_client_sale', 'true');
        
        // Получаем файлы изображений
        const imageInput = form.querySelector('input[name="images"]');
        const imageFiles = imageInput?.files || [];
        
        // Удаляем старые images из formData и добавляем файлы
        formData.delete('images');
        Array.from(imageFiles).slice(0, 5).forEach(file => {
            formData.append('images', file);
        });
        
        try {
            const product = await createC2CProductWithNotifications({
                name: formData.get('name'),
                price: parseFloat(formData.get('price')),
                categoryId: parseInt(formData.get('category_id')),
                description: formData.get('description') || '',
                quantity: parseInt(formData.get('quantity') || '1'),
                images: Array.from(imageFiles)
            });
            
            // Очищаем форму
            form.reset();
            
            // Обновляем список товаров (если есть функция)
            if (window.loadData) {
                window.loadData();
            }
            
        } catch (error) {
            console.error('Ошибка создания товара:', error);
        }
    });
}

// Инициализация при загрузке страницы
// setupProductForm();


// ============================================
// ЭКСПОРТ для использования в модулях
// ============================================

export {
    createC2CProductSimple,
    createC2CProductFull,
    createC2CProductWithCategorySelection,
    createC2CProductWithNotifications,
    getCategories,
    setupProductForm
};
