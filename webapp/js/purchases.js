// Модуль для работы с продажами/покупками
// Вынесено из app.js для рефакторинга

// Импорты API
// ========== REFACTORING STEP 9.1: createPurchaseAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { createPurchaseAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.1 ==========
// ========== REFACTORING STEP 9.3: cancelPurchaseAPI() ==========
// НОВЫЙ ИМПОРТ из модуля api/purchases.js
import { cancelPurchaseAPI } from './api/purchases.js';
// ========== END REFACTORING STEP 9.3 ==========
import { hideAllPages } from './operationsBase.js';
import { setupPageScrollHandler } from './operationsBase.js';

// Зависимости, которые будут переданы из app.js
let appContextGetter = null; // Функция-геттер для получения appContext
let modalElement = null; // DOM элемент модального окна товара
let loadDataCallback = null; // Функция для загрузки данных
let updateCartUICallback = null; // Функция для обновления корзины
let loadPurchasesCallback = null; // Функция для загрузки продаж

// Инициализация зависимостей
export function initPurchasesDependencies(dependencies) {
    appContextGetter = dependencies.appContextGetter;
    modalElement = dependencies.modal; // Модальное окно товара
    loadDataCallback = dependencies.loadData; // Функция загрузки данных
    updateCartUICallback = dependencies.updateCartUI; // Функция обновления корзины
    loadPurchasesCallback = dependencies.loadPurchases; // Функция загрузки продаж
    
    // Инициализируем глобальные функции для использования в HTML
    setupGlobalFunctions();
}

// Настройка глобальных функций для использования в HTML
function setupGlobalFunctions() {
    // Глобальная функция для отмены продажи из корзины
    window.cancelPurchaseFromCart = async function(purchaseId) {
        await cancelPurchase(purchaseId);
        // Перезагружаем продажи в корзине
        if (loadPurchasesCallback) {
            await loadPurchasesCallback();
        }
        if (updateCartUICallback) {
            await updateCartUICallback();
        }
    };
    
    // Глобальная функция для очистки истории продаж
    window.clearPurchasesHistory = async function() {
        const { safeConfirm, safeAlert } = await import('./telegram.js');
        
        const confirmed = await safeConfirm('Вы уверены, что хотите очистить всю историю продаж? Это действие нельзя отменить.');
        if (!confirmed) {
            return;
        }
        
        try {
            // ========== REFACTORING STEP 9.7: clearPurchasesHistoryAPI() ==========
            // НОВЫЙ ИМПОРТ из модуля api/purchases.js
            const { clearPurchasesHistoryAPI } = await import('./api/purchases.js');
            // ========== END REFACTORING STEP 9.7 ==========
            const result = await clearPurchasesHistoryAPI();
            await safeAlert(`✅ История продаж очищена (удалено ${result.deleted_count || 0} записей)`);
            
            // Перезагружаем историю
            const { loadPurchasesHistory } = await import('./cart/cartHistory.js');
            await loadPurchasesHistory();
        } catch (e) {
            console.error('Clear purchases history error:', e);
            await safeAlert(`❌ Ошибка: ${e.message}`);
        }
    };
}

/**
 * Закрытие страницы заявки на продажу. Возврат на страницу из dataset.returnTo (по умолчанию product-page).
 * После этапа 4: сначала снимаем is-active и скрываем, затем hideAllPages() и показываем только целевую страницу.
 */
export function closePurchasePage() {
    const purchasePage = document.getElementById('purchase-page');
    if (purchasePage) {
        purchasePage.classList.remove('is-active');
        purchasePage.style.display = 'none';
    }
    const returnToId = (purchasePage && purchasePage.dataset.returnTo) || 'product-page';
    hideAllPages();
    const target = document.getElementById(returnToId);
    if (target) {
        target.classList.add('is-active');
        target.style.display = 'block';
    }
}

/**
 * Показ страницы заявки на продажу (вместо модального окна)
 */
export function showPurchasePage(prod) {
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    const purchasePage = document.getElementById('purchase-page');
    if (!purchasePage) {
        alert('❌ Страница заявки на продажу не найдена');
        return;
    }
    // Куда вернуться по «Назад»: с карточки товара — в product-page (state-класс, этап 4)
    purchasePage.dataset.returnTo = 'product-page';
    hideAllPages();
    purchasePage.classList.add('is-active');
    purchasePage.style.display = 'block';
    purchasePage.scrollTop = 0;
    const backBtn = document.getElementById('purchase-page-back');
    if (backBtn) backBtn.onclick = closePurchasePage;
    setupPageScrollHandler(purchasePage);
    setupPurchaseForm(prod);
}

function setupPurchaseForm(prod) {
    // Очищаем форму
    document.getElementById('purchase-last-name').value = '';
    document.getElementById('purchase-first-name').value = '';
    document.getElementById('purchase-middle-name').value = '';
    document.getElementById('purchase-phone').value = '';
    document.getElementById('purchase-city').value = '';
    document.getElementById('purchase-address').value = '';
    document.getElementById('purchase-notes').value = '';
    document.getElementById('purchase-organization').value = '';
    document.getElementById('purchase-images').value = '';
    document.getElementById('purchase-video').value = '';
    document.getElementById('purchase-images-preview').innerHTML = '';
    document.getElementById('purchase-video-preview').innerHTML = '';
    
    // Сбрасываем radio кнопки оплаты
    const paymentRadios = document.querySelectorAll('input[name="purchase-payment"]');
    paymentRadios.forEach(radio => radio.checked = false);
    
    // Обработчик предпросмотра изображений
    const imagesInput = document.getElementById('purchase-images');
    const imagesPreview = document.getElementById('purchase-images-preview');
    imagesInput.onchange = (e) => {
        imagesPreview.innerHTML = '';
        const files = Array.from(e.target.files).slice(0, 5); // Ограничиваем до 5
        files.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                img.style.width = '80px';
                img.style.height = '80px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.margin = '4px';
                imagesPreview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    };
    
    // Обработчик предпросмотра видео
    const videoInput = document.getElementById('purchase-video');
    const videoPreview = document.getElementById('purchase-video-preview');
    videoInput.onchange = (e) => {
        videoPreview.innerHTML = '';
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const video = document.createElement('video');
                video.src = event.target.result;
                video.style.width = '100%';
                video.style.maxWidth = '300px';
                video.style.borderRadius = '8px';
                video.controls = true;
                videoPreview.appendChild(video);
            };
            reader.readAsDataURL(file);
        }
    };
    
    // Обработчик отправки формы
    const submitBtn = document.getElementById('purchase-submit');
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    newSubmitBtn.onclick = async () => {
        await submitPurchaseForm(prod.id);
    };
}

// Показ модального окна продажи (устарело: используется showPurchasePage)
export function showPurchaseModal(prod) {
    const appContext = appContextGetter ? appContextGetter() : null;
    if (!appContext) {
        alert('❌ Ошибка: контекст не загружен');
        return;
    }
    const purchaseModal = document.getElementById('purchase-modal');
    if (!purchaseModal) {
        alert('❌ Модальное окно покупки не найдено');
        return;
    }
    setupPurchaseForm(prod);
    const closeBtn = document.querySelector('.purchase-close');
    if (closeBtn) closeBtn.onclick = () => { purchaseModal.classList.remove('is-open'); purchaseModal.style.display = 'none'; };
    purchaseModal.onclick = (e) => {
        if (e.target === purchaseModal) { purchaseModal.classList.remove('is-open'); purchaseModal.style.display = 'none'; }
    };
    purchaseModal.classList.add('is-open');
    purchaseModal.style.display = 'flex';
}

// Отправка формы продажи
export async function submitPurchaseForm(productId) {
    const lastName = document.getElementById('purchase-last-name').value.trim();
    const firstName = document.getElementById('purchase-first-name').value.trim();
    const middleName = document.getElementById('purchase-middle-name').value.trim();
    const phone = document.getElementById('purchase-phone').value.trim();
    const city = document.getElementById('purchase-city').value.trim();
    const address = document.getElementById('purchase-address').value.trim();
    const notes = document.getElementById('purchase-notes').value.trim();
    const organization = document.getElementById('purchase-organization').value.trim();
    const paymentMethod = document.querySelector('input[name="purchase-payment"]:checked')?.value;
    
    // Валидация
    if (!lastName || !firstName || !phone || !city || !address || !paymentMethod) {
        alert('❌ Заполните все обязательные поля (отмечены *)');
        return;
    }
    
    // Создаем FormData
    const formData = new FormData();
    formData.append('product_id', productId);
    formData.append('last_name', lastName);
    formData.append('first_name', firstName);
    if (middleName) formData.append('middle_name', middleName);
    formData.append('phone_number', phone);
    formData.append('city', city);
    formData.append('address', address);
    if (notes) formData.append('notes', notes);
    formData.append('payment_method', paymentMethod);
    if (organization) formData.append('organization', organization);
    
    // Добавляем изображения (до 5 шт)
    const imagesInput = document.getElementById('purchase-images');
    const images = Array.from(imagesInput.files).slice(0, 5);
    images.forEach(image => {
        formData.append('images', image);
    });
    
    // Добавляем видео (1 шт)
    const videoInput = document.getElementById('purchase-video');
    if (videoInput.files[0]) {
        formData.append('video', videoInput.files[0]);
    }
    
    try {
        const submitBtn = document.getElementById('purchase-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Отправка...';
        
        await createPurchaseAPI(productId, formData);
        
        const { safeAlert } = await import('./telegram.js');
        await safeAlert('✅ Заявка на продажу успешно отправлена!');
        
        // Закрываем страницу или модальное окно заявки на продажу (проверка по is-active)
        const purchasePage = document.getElementById('purchase-page');
        if (purchasePage && purchasePage.classList.contains('is-active')) {
            closePurchasePage();
        } else {
            const purchaseModal = document.getElementById('purchase-modal');
            if (purchaseModal) purchaseModal.style.display = 'none';
        }
        if (modalElement) {
            modalElement.style.display = 'none';
        }
        document.body.style.overflow = 'auto';
        
        // Обновляем данные и корзину по тому же принципу, как для резерваций и заказов
        setTimeout(async () => {
            if (loadDataCallback) {
                await loadDataCallback();
            }
            if (updateCartUICallback) {
                await updateCartUICallback();
            }
            // Обновляем индикаторы активности
            const { updateActivityCounts } = await import('./activityIndicators.js');
            await updateActivityCounts();
            
            // Если корзина открыта и пользователь находится на вкладке продаж, обновляем продажи
            const cartModal = document.getElementById('cart-modal');
            if (cartModal && cartModal.style.display === 'block') {
                const purchasesSection = document.getElementById('purchases-section');
                if (purchasesSection && purchasesSection.style.display !== 'none') {
                    const { loadPurchases } = await import('./cart.js');
                    await loadPurchases();
                }
            }
        }, 500);
    } catch (error) {
        console.error('Error creating purchase:', error);
        const { safeAlert } = await import('./telegram.js');
        await safeAlert(`❌ Ошибка: ${error.message}`);
    } finally {
        const submitBtn = document.getElementById('purchase-submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '✅ Отправить заявку';
        }
    }
}

// Отмена продажи
export async function cancelPurchase(purchaseId) {
    const { safeConfirm, safeAlert } = await import('./telegram.js');
    
    const confirmed = await safeConfirm('Вы уверены, что хотите отменить эту продажу?');
    if (!confirmed) {
        return;
    }
    
    try {
        const appContext = appContextGetter ? appContextGetter() : null;
        if (!appContext) {
            await safeAlert('❌ Ошибка: контекст не загружен');
            return;
        }
        
        // user_id определяется на backend из initData
        await cancelPurchaseAPI(purchaseId);
        await safeAlert('✅ Продажа отменена');
        
        setTimeout(async () => {
            if (loadDataCallback) {
                await loadDataCallback();
            }
            if (updateCartUICallback) {
                await updateCartUICallback();
            }
            // Обновляем индикаторы активности
            const { updateActivityCounts } = await import('./activityIndicators.js');
            await updateActivityCounts();
        }, 500);
    } catch (e) {
        console.error('Cancel purchase error:', e);
        await safeAlert(`❌ Ошибка: ${e.message}`);
    }
}

