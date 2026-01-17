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
let applyFiltersCallback = null;

// Адаптивные диапазоны цен (вычисляются на основе товаров)
let priceRanges = {
    low: { max: 1000 },
    medium: { min: 1000, max: 5000 },
    high: { min: 5000 }
};

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
    applyFiltersCallback = dependencies.applyFiltersCallback;
}

// Инициализация фильтров
export function initFilters() {
    // Старые фильтры удалены, функционал перенесен в кнопку со стрелками
    // Обработчики инициализируются в initCategoryFilterHandlers() из categories.js
    
    // Инициализация поисковой строки
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        // Обработчик ввода текста с задержкой (debounce)
        let searchTimeout = null;
        searchInput.addEventListener('input', (e) => {
            const productFilters = productFiltersGetter ? productFiltersGetter() : {};
            const query = e.target.value.trim();
            
            // Очищаем предыдущий таймер
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Устанавливаем новый таймер для задержки поиска (300ms)
            searchTimeout = setTimeout(() => {
                productFilters.searchQuery = query;
                if (applyFiltersCallback) {
                    applyFiltersCallback();
                }
            }, 300);
        });
        
        // Обработчик очистки поиска
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                const productFilters = productFiltersGetter ? productFiltersGetter() : {};
                productFilters.searchQuery = '';
                if (applyFiltersCallback) {
                    applyFiltersCallback();
                }
            }
        });
    }
}

// Вычисление адаптивных диапазонов цен на основе товаров
function calculatePriceRanges(products) {
    if (!products || products.length === 0) {
        // Возвращаем значения по умолчанию
        return {
            low: { max: 1000 },
            medium: { min: 1000, max: 5000 },
            high: { min: 5000 }
        };
    }
    
    // Собираем все цены товаров (с учетом скидок)
    const prices = products
        .map(prod => {
            // Пропускаем товары без цены или с ценой "по запросу"
            if (prod.price === null || prod.price === undefined || prod.price === 0) {
                return null;
            }
            // Учитываем скидку
            const finalPrice = prod.discount > 0 
                ? Math.round(prod.price * (1 - prod.discount / 100)) 
                : prod.price;
            return finalPrice;
        })
        .filter(price => price !== null && price > 0);
    
    if (prices.length === 0) {
        // Если нет товаров с ценами, возвращаем значения по умолчанию
        return {
            low: { max: 1000 },
            medium: { min: 1000, max: 5000 },
            high: { min: 5000 }
        };
    }
    
    // Находим минимальную и максимальную цены
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Если все цены одинаковые или очень близкие, используем простые диапазоны
    if (maxPrice - minPrice < 100) {
        const avgPrice = (minPrice + maxPrice) / 2;
        return {
            low: { max: avgPrice },
            medium: { min: avgPrice, max: avgPrice },
            high: { min: avgPrice }
        };
    }
    
    // Вычисляем диапазоны: делим на 3 равные части (33%, 33%, 34%)
    const range = maxPrice - minPrice;
    const lowMax = Math.round(minPrice + range * 0.33);
    const mediumMin = lowMax;
    const mediumMax = Math.round(minPrice + range * 0.67);
    const highMin = mediumMax;
    
    // Округляем до красивых чисел (кратных 10, 50, 100, 500, 1000 в зависимости от масштаба)
    function roundToNiceNumber(num, isMax = false) {
        if (num < 10) return Math.ceil(num / 10) * 10;
        if (num < 50) return Math.ceil(num / 10) * 10;
        if (num < 100) return Math.ceil(num / 50) * 50;
        if (num < 500) return Math.ceil(num / 100) * 100;
        if (num < 1000) return Math.ceil(num / 500) * 500;
        if (num < 5000) return Math.ceil(num / 1000) * 1000;
        if (num < 10000) return Math.ceil(num / 5000) * 5000;
        return Math.ceil(num / 10000) * 10000;
    }
    
    function roundToNiceNumberMin(num) {
        if (num < 10) return Math.floor(num / 10) * 10;
        if (num < 50) return Math.floor(num / 10) * 10;
        if (num < 100) return Math.floor(num / 50) * 50;
        if (num < 500) return Math.floor(num / 100) * 100;
        if (num < 1000) return Math.floor(num / 500) * 500;
        if (num < 5000) return Math.floor(num / 1000) * 1000;
        if (num < 10000) return Math.floor(num / 5000) * 5000;
        return Math.floor(num / 10000) * 10000;
    }
    
    return {
        low: { max: roundToNiceNumber(lowMax, true) },
        medium: { 
            min: roundToNiceNumberMin(mediumMin), 
            max: roundToNiceNumber(mediumMax, true) 
        },
        high: { min: roundToNiceNumberMin(highMin) }
    };
}

// Обновление диапазонов цен и UI фильтра
export function updatePriceRanges() {
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const oldRanges = { ...priceRanges };
    priceRanges = calculatePriceRanges(allProducts);
    
    // Сохраняем диапазоны в глобальном объекте для использования в других модулях
    if (window.priceRanges === undefined) {
        window.priceRanges = priceRanges;
    } else {
        Object.assign(window.priceRanges, priceRanges);
    }
    
    // Обновляем UI фильтра, если он уже создан и диапазоны изменились
    const rangesChanged = JSON.stringify(oldRanges) !== JSON.stringify(priceRanges);
    if (rangesChanged) {
        updatePriceFilterUI();
    }
}

// Обновление UI фильтра цен
export function updatePriceFilterUI() {
    const lowOption = document.querySelector('input[name="price-filter"][value="low"]');
    const mediumOption = document.querySelector('input[name="price-filter"][value="medium"]');
    const highOption = document.querySelector('input[name="price-filter"][value="high"]');
    
    if (lowOption) {
        const label = lowOption.closest('label');
        if (label) {
            const textSpan = label.querySelector('.filter-radio-text');
            if (textSpan) {
                textSpan.textContent = `До ${priceRanges.low.max.toLocaleString('ru-RU')} ₽`;
            }
        }
    }
    
    if (mediumOption) {
        const label = mediumOption.closest('label');
        if (label) {
            const textSpan = label.querySelector('.filter-radio-text');
            if (textSpan) {
                textSpan.textContent = `${priceRanges.medium.min.toLocaleString('ru-RU')} - ${priceRanges.medium.max.toLocaleString('ru-RU')} ₽`;
            }
        }
    }
    
    if (highOption) {
        const label = highOption.closest('label');
        if (label) {
            const textSpan = label.querySelector('.filter-radio-text');
            if (textSpan) {
                textSpan.textContent = `От ${priceRanges.high.min.toLocaleString('ru-RU')} ₽`;
            }
        }
    }
}

// Делаем функцию доступной глобально для использования в categories.js
window.updatePriceFilterUI = updatePriceFilterUI;

// Получение текущих диапазонов цен
export function getPriceRanges() {
    return priceRanges;
}

// Обновление опций фильтра
export function updateProductFilterOptions() {
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const productFilters = productFiltersGetter ? productFiltersGetter() : {};
    
    // Обновляем диапазоны цен при обновлении опций
    updatePriceRanges();
    
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
export async function applyFilters() {
    const allProducts = allProductsGetter ? allProductsGetter() : [];
    const productFilters = productFiltersGetter ? productFiltersGetter() : {};
    const selectedCategoryIds = selectedCategoryIdsGetter ? selectedCategoryIdsGetter() : new Set();
    const selectedMainCategoryId = selectedMainCategoryIdGetter ? selectedMainCategoryIdGetter() : null;
    const categoriesHierarchy = categoriesHierarchyGetter ? categoriesHierarchyGetter() : [];
    const currentCategoryId = currentCategoryIdGetter ? currentCategoryIdGetter() : null;
    const productsGrid = productsGridElement;
    
    let filteredProducts = [...allProducts];
    
    // Фильтр по категориям
    // === ИСПРАВЛЕНИЕ: Логика фильтрации категорий ===
    // 1. Если выбраны категории через selectedCategoryIds - фильтруем по ним
    // 2. Если выбрана основная категория (selectedMainCategoryId) - показываем товары из неё И из всех подкатегорий
    // 3. Если выбран currentCategoryId (старый способ) - фильтруем по нему
    if (selectedCategoryIds.size > 0) {
        // Выбраны конкретные категории (основная + подкатегории или только подкатегории)
        filteredProducts = filteredProducts.filter(prod => {
            return selectedCategoryIds.has(prod.category_id);
        });
    } else if (selectedMainCategoryId !== null) {
        // Выбрана основная категория, но selectedCategoryIds пуст (не должно происходить после исправления выше)
        // На всякий случай оставляем fallback логику
        const selectedMainCategory = categoriesHierarchy.find(cat => cat && cat.id === selectedMainCategoryId) || null;
        if (selectedMainCategory) {
            const categoryIds = new Set([selectedMainCategoryId]);
            // Добавляем все подкатегории
            if (selectedMainCategory.subcategories && Array.isArray(selectedMainCategory.subcategories)) {
                selectedMainCategory.subcategories.forEach(sub => {
                    categoryIds.add(sub.id);
                });
            }
            filteredProducts = filteredProducts.filter(prod => {
                return categoryIds.has(prod.category_id);
            });
        }
    } else if (currentCategoryId !== null) {
        // Старый способ выбора категории (для обратной совместимости)
        filteredProducts = filteredProducts.filter(prod => {
            return prod.category_id === currentCategoryId;
        });
    }
    
    // Фильтр по цене (используем адаптивные диапазоны)
    if (productFilters.price !== 'all') {
        // Получаем актуальные диапазоны цен
        const ranges = getPriceRanges();
        
        filteredProducts = filteredProducts.filter(prod => {
            // Пропускаем товары без цены
            if (prod.price === null || prod.price === undefined || prod.price === 0) {
                return false;
            }
            
            const finalPrice = prod.discount > 0 
                ? Math.round(prod.price * (1 - prod.discount / 100)) 
                : prod.price;
            
            switch (productFilters.price) {
                case 'low':
                    return finalPrice <= ranges.low.max;
                case 'medium':
                    return finalPrice >= ranges.medium.min && finalPrice <= ranges.medium.max;
                case 'high':
                    return finalPrice >= ranges.high.min;
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
    
    // Фильтр по поисковому запросу
    if (productFilters.searchQuery && productFilters.searchQuery.trim() !== '') {
        const searchQuery = productFilters.searchQuery.toLowerCase().trim();
        filteredProducts = filteredProducts.filter(prod => {
            // Ищем в названии товара
            const nameMatch = prod.name && prod.name.toLowerCase().includes(searchQuery);
            // Ищем в описании товара
            const descriptionMatch = prod.description && prod.description.toLowerCase().includes(searchQuery);
            return nameMatch || descriptionMatch;
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
        await renderProductsCallback(filteredProducts);
    }
}

