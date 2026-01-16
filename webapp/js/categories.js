// Модуль для работы с категориями
// Вынесено из app.js для рефакторинга

// Состояние категорий
export let currentCategoryId = null;
export let selectedCategoryIds = new Set(); // Множественный выбор категорий
export let allCategories = []; // Все категории для фильтра (плоский список)
export let categoriesHierarchy = []; // Структура категорий с подкатегориями (для отображения)
export let selectedMainCategoryId = null; // ID выбранной основной категории

// Зависимости, которые будут переданы из app.js
let applyFiltersCallback = null;
let updateProductFilterOptionsCallback = null;
let categoriesNavElement = null;

// Инициализация зависимостей
export function initCategoriesDependencies(dependencies) {
    applyFiltersCallback = dependencies.applyFilters;
    updateProductFilterOptionsCallback = dependencies.updateProductFilterOptions;
    categoriesNavElement = dependencies.categoriesNav;
}

// Рендеринг категорий
export function renderCategories(categories) {
    console.log('🔄 renderCategories called with:', categories);
    
    // Сохраняем структуру категорий
    categoriesHierarchy = Array.isArray(categories) ? categories : [];
    
    // === ИСПРАВЛЕНИЕ: Валидация и самоисцеление категорий ===
    // Проверяем валидность сохранённых выбранных категорий
    function validateAndHealCategoryState(categories) {
        // Создаём Set всех валидных ID категорий (основные + подкатегории)
        const validCategoryIds = new Set();
        
        if (Array.isArray(categories)) {
            categories.forEach(mainCat => {
                if (mainCat && typeof mainCat.id === 'number') {
                    validCategoryIds.add(mainCat.id);
                    
                    // Проверяем подкатегории (защита от undefined/null)
                    if (mainCat.subcategories && Array.isArray(mainCat.subcategories)) {
                        mainCat.subcategories.forEach(subCat => {
                            if (subCat && typeof subCat.id === 'number') {
                                validCategoryIds.add(subCat.id);
                            }
                        });
                    }
                }
            });
        }
        
        // Очищаем selectedCategoryIds от невалидных ID
        const validSelectedIds = new Set();
        selectedCategoryIds.forEach(id => {
            if (validCategoryIds.has(id)) {
                validSelectedIds.add(id);
            } else {
                console.warn(`⚠️ [CATEGORIES] Удалён невалидный selectedCategoryId: ${id}`);
            }
        });
        selectedCategoryIds.clear();
        validSelectedIds.forEach(id => selectedCategoryIds.add(id));
        
        // Проверяем selectedMainCategoryId
        if (selectedMainCategoryId !== null && !validCategoryIds.has(selectedMainCategoryId)) {
            console.warn(`⚠️ [CATEGORIES] Сброшен невалидный selectedMainCategoryId: ${selectedMainCategoryId}`);
            selectedMainCategoryId = null;
        }
        
        // Проверяем currentCategoryId
        if (currentCategoryId !== null && !validCategoryIds.has(currentCategoryId)) {
            console.warn(`⚠️ [CATEGORIES] Сброшен невалидный currentCategoryId: ${currentCategoryId}`);
            currentCategoryId = null;
        }
    }

    // Вызываем валидацию перед обработкой категорий
    validateAndHealCategoryState(categoriesHierarchy);
    
    // Преобразуем иерархию в плоский список для фильтрации
    const flatCategories = [];
    if (Array.isArray(categories)) {
        categories.forEach(mainCat => {
            flatCategories.push(mainCat);
            if (mainCat.subcategories && Array.isArray(mainCat.subcategories)) {
                mainCat.subcategories.forEach(subCat => {
                    flatCategories.push(subCat);
                });
            }
        });
    }
    allCategories = flatCategories;
    
    // Обновляем фильтр категорий
    updateCategoryFilter();
    
    // Очищаем контейнер категорий
    if (!categoriesNavElement) {
        console.error('❌ categoriesNav element not found!');
        return;
    }
    
    // Принудительно показываем контейнер категорий
    categoriesNavElement.style.display = 'block';
    categoriesNavElement.style.overflow = 'visible';
    categoriesNavElement.innerHTML = '';
    
    console.log('🔄 [RENDER] Creating dropdowns container...');
    console.log('🔄 [RENDER] categoriesNav display after fix:', window.getComputedStyle(categoriesNavElement).display);
    
    // Контейнер для выпадающих списков (горизонтальное расположение с фильтром справа)
    const dropdownsContainer = document.createElement('div');
    dropdownsContainer.className = 'category-dropdowns-container';
    dropdownsContainer.style.cssText = 'display: flex !important; flex-direction: row; gap: 8px; width: 100%; align-items: flex-start; justify-content: space-between;';
    console.log('🔄 [RENDER] Dropdowns container created (horizontal layout with space-between)');
    
    // Контейнер для левой части (категории)
    const leftContainer = document.createElement('div');
    leftContainer.className = 'category-dropdowns-left';
    leftContainer.style.cssText = 'display: flex !important; flex-direction: row; gap: 8px; align-items: flex-start; flex: 1;';
    
    // Первый выпадающий список - основные категории
    const mainCategoriesDropdown = document.createElement('div');
    mainCategoriesDropdown.className = 'category-dropdown';
    console.log('🔄 Creating main categories dropdown, selectedMainCategoryId:', selectedMainCategoryId);
    
    const mainCategoriesButton = document.createElement('button');
    mainCategoriesButton.className = 'category-dropdown-button';
    mainCategoriesButton.type = 'button'; // Предотвращаем submit формы, если есть
    // === ИСПРАВЛЕНИЕ: Безопасный поиск категории с проверкой ===
    const selectedMainCategory = selectedMainCategoryId !== null 
        ? (categoriesHierarchy.find(cat => cat && cat.id === selectedMainCategoryId) || null)
        : null;
    // === ИСПРАВЛЕНИЕ: Безопасное получение названия категории ===
    const buttonText = (selectedMainCategory && selectedMainCategory.name) 
        ? String(selectedMainCategory.name) 
        : 'Категории';
    mainCategoriesButton.innerHTML = `
        <span>${buttonText}</span>
        <span style="margin-left: auto;">▼</span>
    `;
    console.log('🔄 Main categories button created with text:', buttonText);
    
    const mainCategoriesList = document.createElement('div');
    mainCategoriesList.className = 'category-dropdown-list';
    mainCategoriesList.style.display = 'none';
    // Убеждаемся, что список не скрыт через CSS
    mainCategoriesList.setAttribute('data-visible', 'false');
    
    // Опция "Все"
    const allOption = document.createElement('div');
    allOption.className = 'category-dropdown-item' + (selectedMainCategoryId === null ? ' active' : '');
    allOption.innerText = 'Все категории';
    allOption.onclick = () => {
        selectedMainCategoryId = null;
        selectedCategoryIds.clear();
        currentCategoryId = null;
        mainCategoriesList.style.display = 'none';
        renderCategories(categoriesHierarchy);
        if (applyFiltersCallback) applyFiltersCallback();
    };
    mainCategoriesList.appendChild(allOption);
    
    // Основные категории
    if (Array.isArray(categories)) {
        categories.forEach(mainCat => {
            const option = document.createElement('div');
            option.className = 'category-dropdown-item' + (selectedMainCategoryId === mainCat.id ? ' active' : '');
            // === ИСПРАВЛЕНИЕ: Безопасное отображение названия категории ===
            option.innerText = (mainCat && mainCat.name) ? String(mainCat.name) : 'Без названия';
            option.onclick = () => {
                selectedMainCategoryId = mainCat.id;
                // === ИСПРАВЛЕНИЕ: При выборе основной категории показываем товары из неё И из всех подкатегорий ===
                selectedCategoryIds.clear();
                // Добавляем саму основную категорию
                selectedCategoryIds.add(mainCat.id);
                // Если есть подкатегории, добавляем их тоже
                if (mainCat && mainCat.subcategories && Array.isArray(mainCat.subcategories) && mainCat.subcategories.length > 0) {
                    mainCat.subcategories.forEach(subCat => {
                        selectedCategoryIds.add(subCat.id);
                    });
                }
                currentCategoryId = null;
                mainCategoriesList.style.display = 'none';
                renderCategories(categoriesHierarchy);
                if (applyFiltersCallback) applyFiltersCallback();
            };
            mainCategoriesList.appendChild(option);
        });
    }
    
    mainCategoriesButton.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isVisible = mainCategoriesList.style.display === 'block' || mainCategoriesList.style.display === '';
        const newDisplay = isVisible ? 'none' : 'block';
        
        // Закрываем все другие выпадающие списки
        if (newDisplay === 'block') {
            const allOtherLists = document.querySelectorAll('.category-dropdown-list');
            allOtherLists.forEach(list => {
                if (list !== mainCategoriesList) {
                    list.style.display = 'none';
                }
            });
            const allFilterDropdowns = document.querySelectorAll('.category-filter-dropdown');
            allFilterDropdowns.forEach(dropdown => {
                dropdown.style.display = 'none';
            });
            const allFilterButtons = document.querySelectorAll('.category-filter-button');
            allFilterButtons.forEach(btn => {
                btn.classList.remove('active');
            });
        }
        
        mainCategoriesList.style.display = newDisplay;
        console.log('🔄 Main categories dropdown toggled, display:', newDisplay, 'was visible:', isVisible);
    };
    
    mainCategoriesDropdown.appendChild(mainCategoriesButton);
    mainCategoriesDropdown.appendChild(mainCategoriesList);
    leftContainer.appendChild(mainCategoriesDropdown);
    
    // Второй выпадающий список - подкатегории (показывается только если выбрана основная категория с подкатегориями)
    // === ИСПРАВЛЕНИЕ: Безопасная проверка selectedMainCategory и подкатегорий ===
    if (selectedMainCategory && selectedMainCategory.subcategories && Array.isArray(selectedMainCategory.subcategories) && selectedMainCategory.subcategories.length > 0) {
        const subCategoriesDropdown = document.createElement('div');
        subCategoriesDropdown.className = 'category-dropdown';
        
        const subCategoriesButton = document.createElement('button');
        subCategoriesButton.className = 'category-dropdown-button';
        const selectedSubCount = Array.from(selectedCategoryIds).filter(id => 
            selectedMainCategory.subcategories.some(sub => sub.id === id)
        ).length;
        subCategoriesButton.innerHTML = `
            <span>Подкатегории</span>
            <span style="margin-left: auto;">▼</span>
        `;
        
        const subCategoriesList = document.createElement('div');
        subCategoriesList.className = 'category-dropdown-list';
        subCategoriesList.style.display = 'none';
        
        // Опция "Все подкатегории"
        const allSubOption = document.createElement('div');
        allSubOption.className = 'category-dropdown-item';
        allSubOption.innerText = 'Все подкатегории';
        allSubOption.onclick = () => {
            selectedCategoryIds.clear();
            // === ИСПРАВЛЕНИЕ: Безопасный перебор подкатегорий ===
            (selectedMainCategory.subcategories || []).forEach(subCat => {
                if (!subCat || typeof subCat.id !== 'number') {
                    console.warn(`⚠️ [CATEGORIES] Пропущена невалидная подкатегория:`, subCat);
                    return;
                }
                selectedCategoryIds.add(subCat.id);
            });
            subCategoriesList.style.display = 'none';
            renderCategories(categoriesHierarchy);
            if (applyFiltersCallback) applyFiltersCallback();
        };
        subCategoriesList.appendChild(allSubOption);
        
        // Подкатегории
        // === ИСПРАВЛЕНИЕ: Безопасный перебор подкатегорий ===
        (selectedMainCategory.subcategories || []).forEach(subCat => {
            if (!subCat || typeof subCat.id !== 'number') {
                console.warn(`⚠️ [CATEGORIES] Пропущена невалидная подкатегория:`, subCat);
                return;
            }
            const option = document.createElement('div');
            const isSelected = selectedCategoryIds.has(subCat.id);
            option.className = 'category-dropdown-item' + (isSelected ? ' active' : '');
            // === ИСПРАВЛЕНИЕ: Безопасное отображение названия подкатегории с экранированием ===
            const subCatName = (subCat && subCat.name) ? String(subCat.name).replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Без названия';
            option.innerHTML = `
                <span>${subCatName}</span>
                <input type="checkbox" ${isSelected ? 'checked' : ''} style="margin-left: auto;">
            `;
            option.onclick = () => {
                if (isSelected) {
                    selectedCategoryIds.delete(subCat.id);
                } else {
                    selectedCategoryIds.add(subCat.id);
                }
                // === ИСПРАВЛЕНИЕ: При выборе подкатегории удаляем ID основной категории ===
                // Чтобы показывались только товары из выбранных подкатегорий, а не из всей основной категории
                if (selectedMainCategoryId !== null && selectedCategoryIds.has(selectedMainCategoryId)) {
                    selectedCategoryIds.delete(selectedMainCategoryId);
                }
                renderCategories(categoriesHierarchy);
                if (applyFiltersCallback) applyFiltersCallback();
            };
            subCategoriesList.appendChild(option);
        });
        
        subCategoriesButton.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const isVisible = subCategoriesList.style.display === 'block' || subCategoriesList.style.display === '';
            const newDisplay = isVisible ? 'none' : 'block';
            
            // Закрываем все другие выпадающие списки
            if (newDisplay === 'block') {
                const allOtherLists = document.querySelectorAll('.category-dropdown-list');
                allOtherLists.forEach(list => {
                    if (list !== subCategoriesList) {
                        list.style.display = 'none';
                    }
                });
                const allFilterDropdowns = document.querySelectorAll('.category-filter-dropdown');
                allFilterDropdowns.forEach(dropdown => {
                    dropdown.style.display = 'none';
                });
                const allFilterButtons = document.querySelectorAll('.category-filter-button');
                allFilterButtons.forEach(btn => {
                    btn.classList.remove('active');
                });
            }
            
            subCategoriesList.style.display = newDisplay;
            console.log('🔄 Subcategories dropdown toggled, display:', newDisplay, 'was visible:', isVisible);
        };
        
        subCategoriesDropdown.appendChild(subCategoriesButton);
        subCategoriesDropdown.appendChild(subCategoriesList);
        leftContainer.appendChild(subCategoriesDropdown);
    }
    
    // Добавляем левый контейнер в основной контейнер
    dropdownsContainer.appendChild(leftContainer);
    
    // Добавляем кнопку фильтра со стрелками - ВСЕГДА показывается (независимо от подкатегорий)
    const filterButton = document.createElement('button');
    filterButton.className = 'category-filter-button';
    filterButton.type = 'button';
    filterButton.innerHTML = `↑↓`;
    filterButton.title = 'Фильтр';
    
    // Создаем выпадающий список фильтра
    const filterDropdown = document.createElement('div');
    filterDropdown.className = 'category-filter-dropdown';
    filterDropdown.style.display = 'none';
    filterDropdown.innerHTML = `
        <div class="filter-dropdown-content">
            <div class="filter-section">
                <div class="filter-section-title">Цена</div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="all" checked>
                        <span class="filter-radio-text">Все цены</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="low">
                        <span class="filter-radio-text">До 1000 ₽</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="medium">
                        <span class="filter-radio-text">1000 - 5000 ₽</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="price-filter" class="filter-radio" value="high">
                        <span class="filter-radio-text">От 5000 ₽</span>
                    </label>
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-section-title">Статусы</div>
                <div class="filter-option" data-filter-option="in-stock">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="in-stock">
                        <span class="filter-checkbox-text">В наличии</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="hot-offer">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="hot-offer">
                        <span class="filter-checkbox-text">🔥 Горящие предложения</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="with-discount">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="with-discount">
                        <span class="filter-checkbox-text">Со скидкой</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="made-to-order">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="made-to-order">
                        <span class="filter-checkbox-text">Под заказ</span>
                    </label>
                </div>
                <div class="filter-option" data-filter-option="new-items">
                    <label class="filter-checkbox-label">
                        <input type="checkbox" class="filter-checkbox" data-filter="new-items">
                        <span class="filter-checkbox-text">✨ Новинки</span>
                    </label>
                </div>
            </div>
            <div class="filter-section">
                <div class="filter-section-title">Сортировка</div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="sort-filter" class="filter-radio" value="none" checked>
                        <span class="filter-radio-text">Без сортировки</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="sort-filter" class="filter-radio" value="price-asc">
                        <span class="filter-radio-text">По возрастанию цены</span>
                    </label>
                </div>
                <div class="filter-option">
                    <label class="filter-radio-label">
                        <input type="radio" name="sort-filter" class="filter-radio" value="price-desc">
                        <span class="filter-radio-text">По убыванию цены</span>
                    </label>
                </div>
            </div>
            <div class="filter-actions">
                <button class="filter-reset-btn category-filter-reset">Сбросить</button>
            </div>
        </div>
    `;
    
    // Обработчик открытия/закрытия фильтра с автоматическим закрытием других выпадающих списков
    filterButton.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = filterDropdown.style.display === 'block';
        
        // Закрываем все другие выпадающие списки
        const allDropdownLists = document.querySelectorAll('.category-dropdown-list');
        allDropdownLists.forEach(list => {
            list.style.display = 'none';
        });
        const allDropdownButtons = document.querySelectorAll('.category-dropdown-button');
        allDropdownButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Обновляем опции фильтра при открытии
        if (!isOpen && updateProductFilterOptionsCallback) {
            updateProductFilterOptionsCallback();
        }
        
        if (!isOpen) {
            // Открываем фильтр и рассчитываем позицию для fixed позиционирования
            filterDropdown.style.display = 'block';
            
            // Получаем позицию кнопки фильтра относительно viewport
            const buttonRect = filterButton.getBoundingClientRect();
            const dropdownHeight = 400; // max-height фильтра
            const viewportHeight = window.innerHeight;
            
            // Рассчитываем позицию: справа от кнопки, снизу от кнопки
            let top = buttonRect.bottom + 4; // margin-top: 4px
            let right = window.innerWidth - buttonRect.right;
            
            // Если фильтр не помещается снизу, показываем сверху
            if (top + dropdownHeight > viewportHeight && buttonRect.top > dropdownHeight) {
                top = buttonRect.top - dropdownHeight - 4;
            }
            
            // Устанавливаем позицию
            filterDropdown.style.top = `${top}px`;
            filterDropdown.style.right = `${right}px`;
            filterDropdown.style.left = 'auto';
            filterDropdown.style.bottom = 'auto';
        } else {
            filterDropdown.style.display = 'none';
        }
        
        filterButton.classList.toggle('active', !isOpen);
    };
    
    // Обработчики для фильтра
    const filterContainer = document.createElement('div');
    filterContainer.className = 'category-filter-container';
    filterContainer.style.position = 'relative';
    filterContainer.style.flexShrink = '0'; // Зафиксированная ширина, не сжимается
    filterContainer.appendChild(filterButton);
    filterContainer.appendChild(filterDropdown);
    
    // Функция для обновления позиции фильтра при скролле или изменении размера
    const updateFilterPosition = () => {
        if (filterDropdown.style.display === 'block') {
            const buttonRect = filterButton.getBoundingClientRect();
            const dropdownHeight = 400;
            const viewportHeight = window.innerHeight;
            
            let top = buttonRect.bottom + 4;
            let right = window.innerWidth - buttonRect.right;
            
            if (top + dropdownHeight > viewportHeight && buttonRect.top > dropdownHeight) {
                top = buttonRect.top - dropdownHeight - 4;
            }
            
            filterDropdown.style.top = `${top}px`;
            filterDropdown.style.right = `${right}px`;
        }
    };
    
    // Добавляем обработчики для обновления позиции
    window.addEventListener('scroll', updateFilterPosition, true);
    window.addEventListener('resize', updateFilterPosition);
    
    // Инициализируем обработчики фильтра после добавления в DOM
    setTimeout(() => {
        initCategoryFilterHandlers(filterDropdown);
        // Обновляем опции фильтра при открытии, если товары уже загружены
        if (updateProductFilterOptionsCallback) {
            updateProductFilterOptionsCallback();
        }
    }, 0);
    
    // Добавляем фильтр в правую часть контейнера
    dropdownsContainer.appendChild(filterContainer);
    
    categoriesNavElement.appendChild(dropdownsContainer);
    console.log('✅ [RENDER] Categories rendered, dropdowns container added to DOM');
    console.log('✅ [RENDER] categoriesNav.innerHTML length:', categoriesNavElement.innerHTML.length);
    console.log('✅ [RENDER] categoriesNav children count:', categoriesNavElement.children.length);
    
    // Проверяем, что элементы действительно в DOM
    setTimeout(() => {
        const checkDropdowns = document.querySelectorAll('.category-dropdown');
        const checkButtons = document.querySelectorAll('.category-dropdown-button');
        const checkLists = document.querySelectorAll('.category-dropdown-list');
        console.log('✅ [RENDER CHECK] Found', checkDropdowns.length, 'dropdown elements in DOM');
        console.log('✅ [RENDER CHECK] Found', checkButtons.length, 'dropdown buttons in DOM');
        console.log('✅ [RENDER CHECK] Found', checkLists.length, 'dropdown lists in DOM');
        
        if (checkButtons.length > 0) {
            console.log('✅ [RENDER CHECK] First button text:', checkButtons[0].innerText);
            console.log('✅ [RENDER CHECK] First button onclick:', typeof checkButtons[0].onclick);
        }
    }, 100);
    
    // Закрываем выпадающие списки при клике вне их (только один раз)
    if (!window.categoryDropdownClickHandler) {
        window.categoryDropdownClickHandler = (e) => {
            const allDropdowns = document.querySelectorAll('.category-dropdown');
            allDropdowns.forEach(dropdown => {
                if (!dropdown.contains(e.target)) {
                    const list = dropdown.querySelector('.category-dropdown-list');
                    if (list) list.style.display = 'none';
                }
            });
            
            // Также закрываем фильтр при клике вне его
            const allFilterContainers = document.querySelectorAll('.category-filter-container');
            allFilterContainers.forEach(container => {
                if (!container.contains(e.target)) {
                    const filterDropdown = container.querySelector('.category-filter-dropdown');
                    const filterButton = container.querySelector('.category-filter-button');
                    if (filterDropdown) filterDropdown.style.display = 'none';
                    if (filterButton) filterButton.classList.remove('active');
                }
            });
        };
        document.addEventListener('click', window.categoryDropdownClickHandler);
        console.log('✅ [RENDER] Category dropdown click handler registered');
    }
}

// Инициализация обработчиков фильтра категорий
export function initCategoryFilterHandlers(filterDropdown) {
    if (!filterDropdown) return;
    
    // Получаем productFilters из глобального объекта или передаем через параметры
    // Пока используем глобальный доступ через window
    const productFilters = window.productFilters || {};
    
    // Обработчик для фильтра цены (радио-кнопки)
    const priceRadios = filterDropdown.querySelectorAll('input[name="price-filter"]');
    priceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            productFilters.price = e.target.value;
            if (applyFiltersCallback) applyFiltersCallback();
        });
    });
    
    // Обработчик для сортировки (радио-кнопки)
    const sortRadios = filterDropdown.querySelectorAll('input[name="sort-filter"]');
    sortRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            productFilters.sortBy = e.target.value;
            if (applyFiltersCallback) applyFiltersCallback();
        });
    });
    
    // Обработчики для чекбоксов фильтров
    const filterCheckboxes = filterDropdown.querySelectorAll('.filter-checkbox[data-filter]');
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const filterType = e.target.dataset.filter;
            const isChecked = e.target.checked;
            
            switch(filterType) {
                case 'in-stock':
                    productFilters.inStock = isChecked;
                    break;
                case 'hot-offer':
                    productFilters.hotOffer = isChecked;
                    break;
                case 'with-discount':
                    productFilters.withDiscount = isChecked;
                    break;
                case 'made-to-order':
                    productFilters.madeToOrder = isChecked;
                    break;
                case 'new-items':
                    productFilters.newItems = isChecked;
                    break;
            }
            
            if (applyFiltersCallback) applyFiltersCallback();
        });
    });
    
    // Обработчик для кнопки сброса
    const resetButton = filterDropdown.querySelector('.category-filter-reset');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            // Сбрасываем все фильтры
            productFilters.price = 'all';
            productFilters.inStock = false;
            productFilters.hotOffer = false;
            productFilters.withDiscount = false;
            productFilters.madeToOrder = false;
            productFilters.newItems = false;
            productFilters.sortBy = 'none';
            
            // Сбрасываем UI
            priceRadios.forEach(radio => {
                if (radio.value === 'all') {
                    radio.checked = true;
                } else {
                    radio.checked = false;
                }
            });
            
            sortRadios.forEach(radio => {
                if (radio.value === 'none') {
                    radio.checked = true;
                } else {
                    radio.checked = false;
                }
            });
            
            filterCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            
            if (applyFiltersCallback) applyFiltersCallback();
        });
    }
}

// Обновление фильтра категорий
export function updateCategoryFilter() {
    const categoryFilterOptions = document.getElementById('category-filter-options');
    if (!categoryFilterOptions) return;
    
    categoryFilterOptions.innerHTML = '';
    
    allCategories.forEach(cat => {
        const option = document.createElement('div');
        option.className = 'filter-option';
        
        const label = document.createElement('label');
        label.className = 'filter-checkbox-label';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'filter-checkbox';
        checkbox.dataset.categoryId = cat.id;
        checkbox.checked = selectedCategoryIds.has(cat.id);
        
        checkbox.addEventListener('change', (e) => {
            const allCheckbox = document.querySelector('[data-category-id="all"]');
            if (e.target.checked) {
                selectedCategoryIds.add(cat.id);
                // Снимаем "Все категории"
                if (allCheckbox) {
                    allCheckbox.checked = false;
                }
            } else {
                selectedCategoryIds.delete(cat.id);
                // Если ничего не выбрано, выбираем "Все категории"
                if (selectedCategoryIds.size === 0 && allCheckbox) {
                    allCheckbox.checked = true;
                }
            }
            updateCategoryFilterCount();
            if (applyFiltersCallback) applyFiltersCallback();
        });
        
        const text = document.createElement('span');
        text.className = 'filter-checkbox-text';
        // === ИСПРАВЛЕНИЕ: Безопасное отображение названия категории ===
        text.textContent = (cat && cat.name) ? String(cat.name) : 'Без названия';
        
        label.appendChild(checkbox);
        label.appendChild(text);
        option.appendChild(label);
        categoryFilterOptions.appendChild(option);
    });
    
    updateCategoryFilterCount();
}

// Обновление счетчика выбранных категорий
export function updateCategoryFilterCount() {
    const countElement = document.getElementById('category-filter-count');
    if (!countElement) return;
    
    const count = selectedCategoryIds.size;
    if (count > 0) {
        countElement.textContent = count;
        countElement.style.display = 'inline-block';
    } else {
        countElement.style.display = 'none';
    }
}




