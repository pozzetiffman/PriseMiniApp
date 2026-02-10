// ========== REFACTORING STEP 2.1: initAdmin ==========
// Модуль инициализации админки
// Дата начала: 2024-12-19
// Статус: В процессе

import { goToMainContent, hideAllPages } from '../operationsBase.js';

/**
 * Инициализация админки
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.createAdminModal - Функция создания модального окна админки
 * @param {Function} dependencies.handleQuantityEnabledToggle - Обработчик переключателя количества товаров
 * @param {Function} dependencies.handleReservationsToggle - Обработчик переключателя резервации
 * @param {Function} dependencies.handleAllProductsMadeToOrderToggle - Обработчик переключателя "Все товары под заказ"
 * @param {Function} dependencies.switchAdminTab - Функция переключения вкладок админки
 * @param {Function} dependencies.setAdminModal - Сеттер для adminModal
 * @param {Function} dependencies.setReservationsToggle - Сеттер для reservationsToggle
 * @param {Function} dependencies.setQuantityEnabledToggle - Сеттер для quantityEnabledToggle
 * @param {Function} dependencies.setAllProductsMadeToOrderToggle - Сеттер для allProductsMadeToOrderToggle
 */
export function initAdmin(dependencies) {
    const {
        createAdminModal,
        handleQuantityEnabledToggle,
        handleReservationsToggle,
        handleAllProductsMadeToOrderToggle,
        switchAdminTab,
        setAdminModal,
        setReservationsToggle,
        setQuantityEnabledToggle,
        setAllProductsMadeToOrderToggle
    } = dependencies;
    
    console.log('🔧 Initializing admin panel...');
    
    // Проверяем, что страница админки существует в HTML
    const adminPage = document.getElementById('admin-page');
    if (!adminPage) {
        console.warn('⚠️ Admin page not found in HTML');
    }
    
    // Получаем переключатели из settings-modal (они там находятся, не в admin-page)
    const reservationsToggle = document.getElementById('reservations-toggle');
    const quantityEnabledToggle = document.getElementById('quantity-enabled-toggle');
    const allProductsMadeToOrderToggle = document.getElementById('all-products-made-to-order-toggle');
    
    // Сохраняем ссылки на элементы в глобальные переменные через сеттеры
    if (setReservationsToggle) setReservationsToggle(reservationsToggle);
    if (setQuantityEnabledToggle) setQuantityEnabledToggle(quantityEnabledToggle);
    if (setAllProductsMadeToOrderToggle) setAllProductsMadeToOrderToggle(allProductsMadeToOrderToggle);
    
    // Обработчик переключателя количества товаров
    if (quantityEnabledToggle) {
        quantityEnabledToggle.onchange = async (e) => {
            const enabled = e.target.checked;
            await handleQuantityEnabledToggle(enabled);
        };
    }
    
    // Обработчик переключателя резервации
    if (reservationsToggle) {
        reservationsToggle.onchange = async (e) => {
            const enabled = e.target.checked;
            await handleReservationsToggle(enabled);
        };
    }
    
    // Обработчик переключателя "Все товары под заказ"
    if (allProductsMadeToOrderToggle) {
        allProductsMadeToOrderToggle.onchange = async (e) => {
            const enabled = e.target.checked;
            await handleAllProductsMadeToOrderToggle(enabled);
        };
    }
    
    // Настройка вкладок будет выполнена в openAdmin
    
    console.log('✅ Admin panel initialized');
}
// ========== END REFACTORING STEP 2.1 ==========

// ========== REFACTORING STEP 2.2: createAdminModal ==========
/**
 * Создание модального окна админки
 */
export function createAdminModal() {
    const modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.className = 'admin-modal';
    modal.style.display = 'none';
    
    // Проверяем, скрыл ли пользователь информационное сообщение
    const tabsInfoHidden = localStorage.getItem('admin-tabs-info-hidden') === 'true';
    
    modal.innerHTML = `
        <div class="admin-modal-content">
            <div class="admin-modal-header">
                <h2>📊 Админка</h2>
                <span class="admin-close">&times;</span>
            </div>
            ${!tabsInfoHidden ? `
            <div class="admin-tabs-info" id="admin-tabs-info" style="position: relative; padding: 10px 40px 10px 16px; font-size: 12px; color: var(--tg-theme-hint-color, #999); text-align: center; background: rgba(90, 200, 250, 0.1); border-radius: 8px; margin: 12px 16px 12px 16px; border: 1px solid rgba(90, 200, 250, 0.2); line-height: 1.4;">
                <button class="admin-tabs-info-close" style="position: absolute; top: 50%; right: 8px; transform: translateY(-50%); background: transparent; border: none; color: var(--tg-theme-hint-color, #999); font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1; opacity: 0.7; transition: opacity 0.2s;" title="Скрыть">×</button>
                💡 <strong style="color: var(--tg-theme-text-color, #fff);">Адаптивные вкладки:</strong> показываются только при наличии данных. Пустая вкладка (Проданные) скрывается автоматически.
            </div>
            ` : ''}
            <div class="admin-tabs">
                <button class="admin-tab active" data-tab="orders">
                    <span style="font-size: 18px;">🛒</span>
                    <span>Заказы</span>
                </button>
                <button class="admin-tab" data-tab="reservations">
                    <span style="font-size: 18px;">🔒</span>
                    <span>Резервации</span>
                </button>
                <button class="admin-tab" data-tab="sold">
                    <span style="font-size: 18px;">✅</span>
                    <span>Проданные</span>
                </button>
                <button class="admin-tab" data-tab="stats">
                    <span style="font-size: 18px;">📊</span>
                    <span>Статистика</span>
                </button>
                <button class="admin-tab" data-tab="purchases">
                    <span style="font-size: 18px;">💰</span>
                    <span>Покупки</span>
                </button>
            </div>
            <div class="admin-modal-body">
                <div id="admin-tab-orders" class="admin-tab-content active">
                    <div id="orders-list" class="orders-list">
                        <p class="loading">Загрузка заказов...</p>
                    </div>
                </div>
                <div id="admin-tab-reservations" class="admin-tab-content">
                    <div id="reservations-list" class="reservations-list">
                        <p class="loading">Загрузка резерваций...</p>
                    </div>
                </div>
                <div id="admin-tab-sold" class="admin-tab-content">
                    <div id="sold-products-list" class="sold-products-list">
                        <p class="loading">Загрузка истории продаж...</p>
                    </div>
                </div>
                <div id="admin-tab-stats" class="admin-tab-content">
                    <div id="stats-content" class="stats-content">
                        <p class="loading">Загрузка статистики...</p>
                    </div>
                </div>
                <div id="admin-tab-purchases" class="admin-tab-content">
                    <div id="purchases-list" class="purchases-list">
                        <p class="loading">Загрузка заявок на покупку...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Добавляем обработчик для кнопки закрытия информационного сообщения
    const tabsInfoClose = modal.querySelector('.admin-tabs-info-close');
    if (tabsInfoClose) {
        tabsInfoClose.addEventListener('click', () => {
            const tabsInfo = modal.querySelector('#admin-tabs-info');
            if (tabsInfo) {
                tabsInfo.style.display = 'none';
                localStorage.setItem('admin-tabs-info-hidden', 'true');
            }
        });
        
        // Добавляем hover эффект для кнопки закрытия
        tabsInfoClose.addEventListener('mouseenter', () => {
            tabsInfoClose.style.opacity = '1';
        });
        tabsInfoClose.addEventListener('mouseleave', () => {
            tabsInfoClose.style.opacity = '0.7';
        });
    }
}
// ========== END REFACTORING STEP 2.2 ==========

// ========== REFACTORING STEP 2.5: updateAdminTabsVisibility ==========
/**
 * Проверка наличия данных и обновление видимости вкладок админки
 * Проверяет наличие проданных товаров и обновляет видимость соответствующей вкладки
 * @returns {Promise<{hasSold: boolean}>} Объект с информацией о наличии данных
 */
export async function updateAdminTabsVisibility() {
    console.log('📊 updateAdminTabsVisibility: Checking data availability...');
    
    try {
        // Проверяем, что элементы вкладок существуют в DOM
        const tabs = document.querySelectorAll('.admin-tab');
        if (!tabs || tabs.length === 0) {
            console.warn('⚠️ Admin tabs not found in DOM yet, skipping visibility update');
            return { hasSold: true };
        }
        
        // Получаем shop_owner_id из глобального appContext
        let shopOwnerId = null;
        
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
            }
        }
        
        if (!shopOwnerId) {
            console.warn('⚠️ Cannot determine shop_owner_id, showing all tabs');
            return { hasSold: true };
        }
        
        // Проверяем проданные товары (это уже история)
        let hasSold = false;
        try {
            const { getSoldProductsAPI } = await import('../api/products_read.js');
            const soldProducts = await getSoldProductsAPI(shopOwnerId);
            hasSold = (soldProducts || []).length > 0;
            console.log(`📊 Sold: ${(soldProducts || []).length} items, hasData: ${hasSold}`);
        } catch (e) {
            console.warn('⚠️ Failed to check sold products:', e);
        }
        
        // Обновляем видимость вкладок (tabs уже получены выше)
        const soldTab = Array.from(tabs).find(tab => tab.dataset.tab === 'sold');
        // Статистика всегда показывается
        const statsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'stats');
        // Клиенты всегда показываются
        const clientsTab = Array.from(tabs).find(tab => tab.dataset.tab === 'clients');
        
        if (soldTab) {
            if (hasSold) {
                soldTab.style.display = '';
                soldTab.classList.remove('hidden');
            } else {
                soldTab.style.display = 'none';
                soldTab.classList.add('hidden');
            }
        }
        
        // Статистика всегда видима
        if (statsTab) {
            statsTab.style.display = '';
            statsTab.classList.remove('hidden');
        }
        
        // Клиенты всегда видимы
        if (clientsTab) {
            clientsTab.style.display = '';
            clientsTab.classList.remove('hidden');
        }
        
        // Если текущая активная вкладка скрыта, переключаемся на первую доступную
        const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
        if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
            const firstVisibleTab = Array.from(tabs).find(tab => 
                tab.style.display !== 'none' && !tab.classList.contains('hidden')
            );
            if (firstVisibleTab) {
                console.log(`📊 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
                // Переключаемся на первую видимую вкладку через switchAdminTab
                // Но нам нужны зависимости, поэтому просто активируем вкладку
                const tabName = firstVisibleTab.dataset.tab;
                const tabContents = document.querySelectorAll('.admin-tab-content');
                
                tabs.forEach(tab => {
                    if (tab.dataset.tab === tabName) {
                        tab.classList.add('active');
                    } else {
                        tab.classList.remove('active');
                    }
                });
                
                tabContents.forEach(content => {
                    if (content.id === `admin-tab-${tabName}`) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
            }
        }
        
        console.log(`📊 Tabs visibility updated: Sold=${hasSold}`);
        
        return { hasSold };
    } catch (error) {
        console.error('❌ Error updating admin tabs visibility:', error);
        return { hasSold: true }; // По умолчанию показываем все
    }
}
// ========== END REFACTORING STEP 2.5 ==========

// ========== REFACTORING STEP 2.3: openAdmin ==========
/**
 * Открытие админки
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.initAdmin - Функция инициализации админки
 * @param {Function} dependencies.getShopSettings - Функция API для получения настроек магазина
 * @param {Function} dependencies.checkAllProductsMadeToOrder - Функция проверки состояния товаров
 * @param {Function} dependencies.switchAdminTab - Функция переключения вкладок админки
 * @param {Function} dependencies.getAdminModal - Геттер для adminModal
 * @param {Function} dependencies.setAdminModal - Сеттер для adminModal
 * @param {Function} dependencies.getReservationsToggle - Геттер для reservationsToggle
 * @param {Function} dependencies.setReservationsToggle - Сеттер для reservationsToggle
 * @param {Function} dependencies.getQuantityEnabledToggle - Геттер для quantityEnabledToggle
 * @param {Function} dependencies.setQuantityEnabledToggle - Сеттер для quantityEnabledToggle
 * @param {Function} dependencies.getAllProductsMadeToOrderToggle - Геттер для allProductsMadeToOrderToggle
 * @param {Function} dependencies.setAllProductsMadeToOrderToggle - Сеттер для allProductsMadeToOrderToggle
 * @param {Function} dependencies.setShopSettings - Сеттер для shopSettings
 */
export async function openAdmin(dependencies) {
    const {
        initAdmin,
        getShopSettings,
        checkAllProductsMadeToOrder,
        switchAdminTab,
        loadSoldProducts,
        loadStats,
        loadClients,
        getAdminModal,
        setAdminModal,
        getReservationsToggle,
        setReservationsToggle,
        getQuantityEnabledToggle,
        setQuantityEnabledToggle,
        getAllProductsMadeToOrderToggle,
        setAllProductsMadeToOrderToggle,
        setShopSettings
    } = dependencies;
    
    console.log('🔧 Opening admin panel...');
    
    const adminPage = document.getElementById('admin-page');
    if (!adminPage) {
        console.error('❌ Admin page not found');
        return;
    }
    
    // Инициализируем админку если еще не была инициализирована
    initAdmin();
    
    try {
        // Загружаем текущие настройки
        const shopSettings = await getShopSettings();
        console.log('✅ Shop settings loaded:', shopSettings);
        
        if (setShopSettings) setShopSettings(shopSettings);
        
        // Получаем ссылки на тумблеры (они находятся в settings-modal, а не в admin-page)
        const quantityEnabledToggle = getQuantityEnabledToggle ? getQuantityEnabledToggle() : null;
        const reservationsToggle = getReservationsToggle ? getReservationsToggle() : null;
        const allProductsMadeToOrderToggle = getAllProductsMadeToOrderToggle ? getAllProductsMadeToOrderToggle() : null;
        
        // Устанавливаем значение переключателей
        if (quantityEnabledToggle) {
            quantityEnabledToggle.checked = shopSettings.quantity_enabled !== false;
        }
        if (reservationsToggle) {
            reservationsToggle.checked = shopSettings.reservations_enabled === true;
            reservationsToggle.disabled = false;
        }
        
        if (allProductsMadeToOrderToggle) {
            try {
                const allMadeToOrder = await checkAllProductsMadeToOrder();
                allProductsMadeToOrderToggle.checked = allMadeToOrder;
                console.log(`✅ All products made-to-order toggle set to: ${allMadeToOrder}`);
            } catch (error) {
                console.error('❌ Error checking products state:', error);
                allProductsMadeToOrderToggle.checked = false;
            }
        }
        
        // Единый способ: скрыть все страницы, затем показать админку
        hideAllPages();
        adminPage.classList.add('is-active');
        adminPage.style.display = 'block';
        
        // Кнопка «Назад» админки — вешаем один раз (data-bound)
        const adminPageBack = document.getElementById('admin-page-back');
        if (adminPageBack && !adminPageBack.dataset.bound) {
            adminPageBack.dataset.bound = '1';
            adminPageBack.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeAdminPage();
            });
        }
        
        // Настройка вкладок
        const tabs = adminPage.querySelectorAll('.admin-tab');
        const adminTabsContainer = adminPage.querySelector('.admin-tabs');
        
        // Добавляем поддержку прокрутки колесом мыши
        if (adminTabsContainer) {
            adminTabsContainer.addEventListener('wheel', (e) => {
                // Прокручиваем горизонтально при вертикальном прокручивании колесом с Shift
                // Или при горизонтальном прокручивании колесом
                if (e.deltaY !== 0 || e.deltaX !== 0) {
                    e.preventDefault();
                    adminTabsContainer.scrollLeft += (e.deltaY || e.deltaX);
                }
            }, { passive: false });
        }
        
        tabs.forEach(tab => {
            tab.onclick = () => {
                switchAdminTab(tab.dataset.tab, {
                    loadSoldProducts,
                    loadStats,
                    loadClients
                });
            };
        });
        
        // Сначала переключаемся на вкладку по умолчанию, чтобы админка открылась сразу
        switchAdminTab('clients', {
            loadSoldProducts,
            loadStats,
            loadClients
        });
        
        // Затем обновляем видимость вкладок асинхронно (не блокируя открытие админки)
        // Оборачиваем в try-catch, чтобы ошибки не блокировали работу
        updateAdminTabsVisibility().then(() => {
            // После обновления видимости переключаемся на первую видимую вкладку
            const tabs = adminPage.querySelectorAll('.admin-tab');
            const activeTab = Array.from(tabs).find(tab => tab.classList.contains('active'));
            
            // Если текущая активная вкладка скрыта, переключаемся на первую видимую
            if (activeTab && (activeTab.style.display === 'none' || activeTab.classList.contains('hidden'))) {
                const firstVisibleTab = Array.from(tabs).find(tab => 
                    tab.style.display !== 'none' && !tab.classList.contains('hidden')
                );
                if (firstVisibleTab) {
                switchAdminTab(firstVisibleTab.dataset.tab, {
                    loadSoldProducts,
                    loadStats,
                    loadClients
                });
                }
            }
        }).catch(error => {
            console.error('❌ Error updating admin tabs visibility:', error);
            // Продолжаем работу даже если обновление видимости не удалось
        });
    } catch (error) {
        console.error('❌ Error loading shop settings:', error);
        alert('Не удалось загрузить настройки магазина: ' + error.message);
    }
}

/**
 * Закрытие страницы админки. Сначала снимаем is-active и скрываем, затем goToMainContent().
 * body:has(#admin-page.is-active) в CSS сбрасывается автоматически при снятии is-active.
 */
export function closeAdminPage() {
    console.log('[ADMIN PAGE] Closing admin page');
    const adminPage = document.getElementById('admin-page');
    if (adminPage) {
        adminPage.classList.remove('is-active');
        adminPage.style.display = 'none';
    }
    goToMainContent();
}
// ========== END REFACTORING STEP 2.3 ==========

// ========== REFACTORING STEP 2.4: switchAdminTab ==========
/**
 * Переключение вкладок админки
 * @param {string} tabName - Название вкладки ('sold', 'stats', 'clients')
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadSoldProducts - Функция загрузки проданных товаров
 * @param {Function} dependencies.loadStats - Функция загрузки статистики
 * @param {Function} dependencies.loadClients - Функция загрузки клиентов
 */
export function switchAdminTab(tabName, dependencies) {
    const {
        loadSoldProducts,
        loadStats,
        loadClients
    } = dependencies;
    
    const tabs = document.querySelectorAll('.admin-tab');
    const tabContents = document.querySelectorAll('.admin-tab-content');
    
    // Проверяем, что вкладка видима перед переключением
    const targetTab = Array.from(tabs).find(tab => tab.dataset.tab === tabName);
    if (targetTab && (targetTab.style.display === 'none' || targetTab.classList.contains('hidden'))) {
        console.warn(`⚠️ Cannot switch to hidden tab: ${tabName}`);
        // Переключаемся на первую видимую вкладку
        const firstVisibleTab = Array.from(tabs).find(tab => 
            tab.style.display !== 'none' && !tab.classList.contains('hidden')
        );
        if (firstVisibleTab) {
            console.log(`📊 Switching to first visible tab: ${firstVisibleTab.dataset.tab}`);
            switchAdminTab(firstVisibleTab.dataset.tab, dependencies);
        }
        return;
    }
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    tabContents.forEach(content => {
        if (content.id === `admin-tab-${tabName}`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Прокручиваем контейнер вкладок, чтобы выбранная вкладка была полностью видна
    if (targetTab) {
        const adminTabsContainer = targetTab.closest('.admin-tabs');
        if (adminTabsContainer) {
            // Используем requestAnimationFrame для более точного расчета после обновления DOM
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const currentScrollLeft = adminTabsContainer.scrollLeft;
                    const containerWidth = adminTabsContainer.clientWidth;
                    const containerScrollWidth = adminTabsContainer.scrollWidth;
                    const tabOffsetLeft = targetTab.offsetLeft;
                    const tabWidth = targetTab.offsetWidth;
                    
                    // Вычисляем позиции вкладки относительно прокручиваемого контента
                    const tabLeft = tabOffsetLeft;
                    const tabRight = tabOffsetLeft + tabWidth;
                    
                    // Видимая область контейнера
                    const visibleLeft = currentScrollLeft;
                    const visibleRight = currentScrollLeft + containerWidth;
                    
                    // Максимальная прокрутка
                    const maxScrollLeft = Math.max(0, containerScrollWidth - containerWidth);
                    
                    // Проверяем, является ли это последней (крайней правой) вкладкой
                    const allTabs = Array.from(adminTabsContainer.querySelectorAll('.admin-tab'));
                    const isLastTab = allTabs[allTabs.length - 1] === targetTab;
                    
                    // Проверяем, полностью ли видна вкладка
                    const tolerance = 2;
                    const isFullyVisible = tabLeft >= visibleLeft - tolerance && 
                                          tabRight <= visibleRight + tolerance;
                    
                    // Для крайней правой вкладки: если она уже видна (даже частично), не прокручиваем
                    if (isLastTab) {
                        // Если правая часть вкладки уже видна или почти видна, не прокручиваем
                        if (tabRight <= visibleRight + tolerance && tabLeft >= visibleLeft - tolerance) {
                            return; // Вкладка видна, не прокручиваем
                        }
                        // Только если вкладка полностью скрыта справа, прокручиваем
                        if (tabRight > visibleRight + tolerance) {
                            // Прокручиваем так, чтобы правая часть вкладки была видна справа
                            const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, tabRight - containerWidth));
                            
                            // Прокручиваем только если нужно (больше чем на 3px)
                            if (Math.abs(targetScrollLeft - currentScrollLeft) > 3) {
                                adminTabsContainer.scrollTo({
                                    left: targetScrollLeft,
                                    behavior: 'smooth'
                                });
                            }
                        }
                        return; // Для крайней правой вкладки выходим
                    }
                    
                    // Для остальных вкладок: если вкладка не полностью видна, прокручиваем
                    if (!isFullyVisible) {
                        let targetScrollLeft;
                        
                        // Если вкладка скрыта справа - прокручиваем так, чтобы она была слева
                        if (tabRight > visibleRight) {
                            targetScrollLeft = tabLeft;
                        } 
                        // Если вкладка скрыта слева - прокручиваем так, чтобы она была слева
                        else if (tabLeft < visibleLeft) {
                            targetScrollLeft = tabLeft;
                        }
                        
                        // Ограничиваем прокрутку границами
                        if (targetScrollLeft !== undefined) {
                            targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetScrollLeft));
                            
                            // Прокручиваем только если нужно (больше чем на 3px)
                            if (Math.abs(targetScrollLeft - currentScrollLeft) > 3) {
                                adminTabsContainer.scrollTo({
                                    left: targetScrollLeft,
                                    behavior: 'smooth'
                                });
                            }
                        }
                    }
                });
            });
        }
    }
    
    // Если переключились на вкладку "Проданные", загружаем данные
    if (tabName === 'sold') {
        loadSoldProducts();
    }
    
    // Если переключились на вкладку "Статистика", загружаем данные
    if (tabName === 'stats') {
        // Загружаем статистику (по умолчанию "Все время")
        loadStats();
    }
    
    // Если переключились на вкладку "Клиенты", загружаем данные
    if (tabName === 'clients') {
        if (loadClients) {
            loadClients();
        }
    }
}
// ========== END REFACTORING STEP 2.4 ==========

