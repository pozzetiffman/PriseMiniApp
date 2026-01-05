// Модуль для работы с фильтрами товаров
// Вынесено из app.js для рефакторинга

// Зависимости, которые будут переданы из app.js
let allProductsGetter = null;
let productFiltersGetter = null;
let selectedCategoryIdsGetter = null;
let selectedMainCategoryIdGetter = null;
let categoriesHierarchyGetter = null;
let currentCategoryIdGetter = null;
let productsGridElement = null;
let renderProductsCallback = null;

// Инициализация зависимостей
export function initFiltersDependencies(dependencies) {
    allProductsGetter = dependencies.allProductsGetter;
    productFiltersGetter = dependencies.productFiltersGetter;
    selectedCategoryIdsGetter = dependencies.selectedCategoryIdsGetter;
    selectedMainCategoryIdGetter = dependencies.selectedMainCategoryIdGetter;
    categoriesHierarchyGetter = dependencies.categoriesHierarchyGetter;
    currentCategoryIdGetter = dependencies.currentCategoryIdGetter;
    productsGridElement = dependencies.productsGridElement;
    renderProductsCallback = dependencies.renderProductsCallback;
}

// Инициализация фильтров
export function initFilters() {
    // Старые фильтры удалены, функционал перенесен в кнопку со стрелками
    // Обработчики инициализируются в initCategoryFilterHandlers() из categories.js
}

// Обновление опций фильтра
export function updateProductFilterOptions() {
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const productFilters = productFiltersGetter ? productFiltersGetter() : {};
    
    if (allProducts.length === 0) {
        // Если товаров нет, скрываем все опции фильтра
        document.querySelectorAll('[data-filter-option]').forEach(option => {
            option.style.display = 'none';
        });
        return;
    }
    
    // Проверяем наличие товаров для каждого типа фильтра
    const hasInStock = allProducts.some(prod => {
        const isMadeToOrder = prod.is_made_to_order === true || 
                              prod.is_made_to_order === 1 || 
                              prod.is_made_to_order === '1' ||
                              prod.is_made_to_order === 'true' ||
                              String(prod.is_made_to_order).toLowerCase() === 'true';
        if (isMadeToOrder) return false;
        return prod.quantity !== undefined && prod.quantity !== null && prod.quantity > 0;
    });
    
    const hasHotOffer = allProducts.some(prod => prod.is_hot_offer === true);
    
    const hasDiscount = allProducts.some(prod => prod.discount > 0);
    
    const hasMadeToOrder = allProducts.some(prod => {
        return prod.is_made_to_order === true || 
               prod.is_made_to_order === 1 || 
               prod.is_made_to_order === '1' ||
               prod.is_made_to_order === 'true' ||
               String(prod.is_made_to_order).toLowerCase() === 'true';
    });
    
    // Проверяем наличие новинок (товары, созданные за последние 30 дней или с большим ID)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hasNewItems = allProducts.some(prod => {
        // Если есть created_at, используем его
        if (prod.created_at) {
            const createdDate = new Date(prod.created_at);
            return createdDate >= thirtyDaysAgo;
        }
        // Иначе используем ID как индикатор новизны (больший ID = новее)
        // Берем последние 20% товаров по ID как новинки
        if (allProducts.length > 0) {
            const sortedById = [...allProducts].sort((a, b) => (b.id || 0) - (a.id || 0));
            const top20Percent = Math.max(1, Math.floor(sortedById.length * 0.2));
            const newestIds = sortedById.slice(0, top20Percent).map(p => p.id);
            return newestIds.includes(prod.id);
        }
        return false;
    });
    
    // Показываем/скрываем опции фильтра через data-filter-option
    const updateFilterOption = (filterType, hasItems) => {
        const filterOption = document.querySelector(`[data-filter-option="${filterType}"]`);
        if (filterOption) {
            filterOption.style.display = hasItems ? 'block' : 'none';
        }
    };
    
    updateFilterOption('in-stock', hasInStock);
    updateFilterOption('hot-offer', hasHotOffer);
    updateFilterOption('with-discount', hasDiscount);
    updateFilterOption('made-to-order', hasMadeToOrder);
    updateFilterOption('new-items', hasNewItems);
    
    // Сбрасываем фильтры, которые больше не доступны
    if (!hasInStock && productFilters.inStock) {
        productFilters.inStock = false;
        const checkbox = document.querySelector('[data-filter="in-stock"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasHotOffer && productFilters.hotOffer) {
        productFilters.hotOffer = false;
        const checkbox = document.querySelector('[data-filter="hot-offer"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasDiscount && productFilters.withDiscount) {
        productFilters.withDiscount = false;
        const checkbox = document.querySelector('[data-filter="with-discount"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasMadeToOrder && productFilters.madeToOrder) {
        productFilters.madeToOrder = false;
        const checkbox = document.querySelector('[data-filter="made-to-order"]');
        if (checkbox) checkbox.checked = false;
    }
    if (!hasNewItems && productFilters.newItems) {
        productFilters.newItems = false;
        const checkbox = document.querySelector('[data-filter="new-items"]');
        if (checkbox) checkbox.checked = false;
    }
}

// Применение фильтров к товарам
export function applyFilters() {
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const productFilters = productFiltersGetter ? productFiltersGetter() : {};
    const selectedCategoryIds = selectedCategoryIdsGetter ? selectedCategoryIdsGetter() : new Set();
    const selectedMainCategoryId = selectedMainCategoryIdGetter ? selectedMainCategoryIdGetter() : null;
    const categoriesHierarchy = categoriesHierarchyGetter ? categoriesHierarchyGetter() : [];
    const currentCategoryId = currentCategoryIdGetter ? currentCategoryIdGetter() : null;
    const productsGrid = productsGridElement;
    
    if (allProducts.length === 0) {
        // Если товары еще не загружены, просто рендерим пустой список
        if (productsGrid) {
            productsGrid.innerHTML = '<p class="loading">Загрузка товаров...</p>';
        }
        return;
    }
    
    let filteredProducts = [...allProducts];
    
    // Фильтр по категориям
    // Если выбраны подкатегории через выпадающие списки, применяем их
    if (selectedCategoryIds.size > 0) {
        filteredProducts = filteredProducts.filter(prod => {
            return selectedCategoryIds.has(prod.category_id);
        });
    } else if (selectedMainCategoryId !== null) {
        // Если выбрана основная категория, но не выбраны подкатегории
        // Показываем товары из всех её подкатегорий (если они есть)
        const selectedMainCategory = categoriesHierarchy.find(cat => cat.id === selectedMainCategoryId);
        if (selectedMainCategory && selectedMainCategory.subcategories && selectedMainCategory.subcategories.length > 0) {
            // Основная категория с подкатегориями - показываем товары из всех подкатегорий
            const subcategoryIds = new Set(selectedMainCategory.subcategories.map(sub => sub.id));
            filteredProducts = filteredProducts.filter(prod => {
                return subcategoryIds.has(prod.category_id);
            });
        } else if (selectedMainCategory && (!selectedMainCategory.subcategories || selectedMainCategory.subcategories.length === 0)) {
            // Основная категория без подкатегорий - показываем товары из самой категории
            filteredProducts = filteredProducts.filter(prod => {
                return prod.category_id === selectedMainCategoryId;
            });
        }
    } else if (currentCategoryId !== null) {
        // Старый способ выбора категории (для обратной совместимости)
        filteredProducts = filteredProducts.filter(prod => {
            return prod.category_id === currentCategoryId;
        });
    }
    
    // Фильтр по цене
    if (productFilters.price !== 'all') {
        filteredProducts = filteredProducts.filter(prod => {
            const finalPrice = prod.discount > 0 ? Math.round(prod.price * (1 - prod.discount / 100)) : prod.price;
            switch (productFilters.price) {
                case 'low':
                    return finalPrice < 1000;
                case 'medium':
                    return finalPrice >= 1000 && finalPrice <= 5000;
                case 'high':
                    return finalPrice > 5000;
                default:
                    return true;
            }
        });
    }
    
    // Фильтр "В наличии"
    if (productFilters.inStock) {
        filteredProducts = filteredProducts.filter(prod => {
            const isMadeToOrder = prod.is_made_to_order === true || 
                                  prod.is_made_to_order === 1 || 
                                  prod.is_made_to_order === '1' ||
                                  prod.is_made_to_order === 'true' ||
                                  String(prod.is_made_to_order).toLowerCase() === 'true';
            if (isMadeToOrder) return false;
            return prod.quantity !== undefined && prod.quantity !== null && prod.quantity > 0;
        });
    }
    
    // Фильтр "Горящие предложения"
    if (productFilters.hotOffer) {
        filteredProducts = filteredProducts.filter(prod => prod.is_hot_offer === true);
    }
    
    // Фильтр "Со скидкой"
    if (productFilters.withDiscount) {
        filteredProducts = filteredProducts.filter(prod => prod.discount > 0);
    }
    
    // Фильтр "Под заказ"
    if (productFilters.madeToOrder) {
        filteredProducts = filteredProducts.filter(prod => {
            return prod.is_made_to_order === true || 
                   prod.is_made_to_order === 1 || 
                   prod.is_made_to_order === '1' ||
                   prod.is_made_to_order === 'true' ||
                   String(prod.is_made_to_order).toLowerCase() === 'true';
        });
    }
    
    // Фильтр "Новинки"
    if (productFilters.newItems) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredProducts = filteredProducts.filter(prod => {
            // Если есть created_at, используем его
            if (prod.created_at) {
                const createdDate = new Date(prod.created_at);
                return createdDate >= thirtyDaysAgo;
            }
            // Иначе используем ID как индикатор новизны
            // Берем последние 20% товаров по ID как новинки
            if (allProducts.length > 0) {
                const sortedById = [...allProducts].sort((a, b) => (b.id || 0) - (a.id || 0));
                const top20Percent = Math.max(1, Math.floor(sortedById.length * 0.2));
                const newestIds = sortedById.slice(0, top20Percent).map(p => p.id);
                return newestIds.includes(prod.id);
            }
            return false;
        });
    }
    
    // Сортировка
    if (productFilters.sortBy !== 'none') {
        filteredProducts.sort((a, b) => {
            const priceA = a.discount > 0 ? Math.round(a.price * (1 - a.discount / 100)) : a.price;
            const priceB = b.discount > 0 ? Math.round(b.price * (1 - b.discount / 100)) : b.price;
            
            if (productFilters.sortBy === 'price-asc') {
                return priceA - priceB;
            } else if (productFilters.sortBy === 'price-desc') {
                return priceB - priceA;
            }
            return 0;
        });
    }
    
    // Рендерим отфильтрованные товары
    if (renderProductsCallback) {
        renderProductsCallback(filteredProducts);
    }
}

