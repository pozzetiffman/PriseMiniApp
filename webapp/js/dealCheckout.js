/**
 * Оформление покупки (сделка из корзины): многошаговая форма.
 * Итог берётся с бэкенда (POST /api/pricing/quote) при открытии и при смене оплаты/доставки.
 * Flow: start -> openDealCheckoutPage -> fetch quote -> шаги 1–4 -> confirm -> итог из ответа backend.
 */
import { confirmDealCheckoutAPI } from './api/deals.js';
import { getPricingQuoteAPI } from './api/pricing.js';
import { clearOverlaysAndBodyClasses, hideAllPages, setupPageScrollHandler } from './operationsBase.js';

const PAGE_ID = 'deal-checkout-page';
let currentDealId = null;
let currentSummary = null;
/** Источник открытия: 'cart' — из корзины (после confirm чистим выбранные); 'single' — с карточки (корзину не трогаем). */
let currentCheckoutSource = 'cart';

function formatAmount(amount) {
    if (amount == null || amount === '') return '—';
    return `${Math.round(Number(amount)).toLocaleString('ru-RU')} ₽`;
}

/**
 * Показать шаг формы (1–4).
 */
function showStep(step) {
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`deal-checkout-step-${i}`);
        if (el) el.classList.toggle('active', i === step);
    }
    const page = document.getElementById(PAGE_ID);
    if (page && page.scrollTo) page.scrollTo(0, 0);
}

/**
 * Заполнить блок сводки из quote/backend (товары, доставка, итого).
 */
function renderSummary(summary) {
    const el = document.getElementById('deal-checkout-summary');
    if (!el) return;
    const count = summary.total_items_count != null ? summary.total_items_count : 0;
    const itemsAmount = summary.items_amount;
    const deliveryFee = summary.delivery_fee;
    const total = summary.total_amount;
    let html = `<p style="margin:0; font-size: 15px;">Товаров: <strong>${count}</strong>`;
    if (itemsAmount != null) html += `, товары: <strong>${formatAmount(itemsAmount)}</strong>`;
    if (deliveryFee != null && Number(deliveryFee) > 0) html += `, доставка: <strong>${formatAmount(deliveryFee)}</strong>`;
    if (total != null) html += `, итого: <strong>${formatAmount(total)}</strong>`;
    html += '</p>';
    el.innerHTML = html;
}

/**
 * Получить выбранные способ оплаты и доставки из формы.
 */
function getSelectedPaymentAndDelivery() {
    const paymentEl = document.querySelector('input[name="deal-payment-method"]:checked');
    const deliveryEl = document.querySelector('input[name="deal-delivery-method"]:checked');
    return {
        payment_method: paymentEl ? paymentEl.value : 'card',
        delivery_method: deliveryEl ? deliveryEl.value : 'pickup',
    };
}

/**
 * Запросить quote с бэкенда и обновить сводку (при открытии и при смене оплаты/доставки).
 */
async function refreshQuoteAndSummary() {
    if (!currentDealId) return;
    const { payment_method, delivery_method } = getSelectedPaymentAndDelivery();
    try {
        const quote = await getPricingQuoteAPI({
            deal_id: currentDealId,
            payment_method,
            delivery_method,
        });
        const count = currentSummary && currentSummary.total_items_count != null
            ? currentSummary.total_items_count
            : (quote.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
        renderSummary({
            total_items_count: count,
            items_amount: quote.items_amount,
            delivery_fee: quote.delivery_fee,
            total_amount: quote.total_amount,
            currency: quote.currency,
        });
    } catch (e) {
        console.error('Deal checkout quote error:', e);
        // Оставляем текущую сводку или показываем ошибку
        const el = document.getElementById('deal-checkout-summary');
        if (el) el.innerHTML += ` <span style="color:var(--error-color); font-size:12px;">Не удалось обновить сумму</span>`;
    }
}

/**
 * Показать/скрыть поле адреса при выборе «Курьером».
 */
function toggleAddressVisibility() {
    const wrap = document.getElementById('deal-checkout-address-wrap');
    const radio = document.querySelector('input[name="deal-delivery-method"]:checked');
    if (wrap) wrap.style.display = (radio && radio.value === 'courier') ? 'block' : 'none';
}

/**
 * Открыть страницу оформления сделки (после checkout/start).
 * Запрашивает quote с бэкенда (card + pickup по умолчанию) и показывает итог.
 * @param {number} dealId - ID черновой сделки
 * @param {Object} summary - { total_items_count, total_amount, currency } от start (предварительно)
 * @param {{ source?: 'cart'|'single' }} options - source: 'cart' при открытии из корзины, 'single' при покупке одного товара с карточки
 */
export function openDealCheckoutPage(dealId, summary, options = {}) {
    currentDealId = dealId;
    currentSummary = summary || {};
    currentCheckoutSource = options.source === 'single' ? 'single' : 'cart';
    const page = document.getElementById(PAGE_ID);
    if (!page) return;

    hideAllPages();
    page.style.display = 'block';
    if (page.scrollTo) page.scrollTo(0, 0);
    setupPageScrollHandler(page);

    // Сначала показываем предварительную сводку от start, затем подставляем quote с бэкенда
    renderSummary({ ...currentSummary, total_amount: currentSummary.total_amount });
    showStep(1);
    refreshQuoteAndSummary();

    // Сброс формы
    const nameEl = document.getElementById('deal-checkout-name');
    const phoneEl = document.getElementById('deal-checkout-phone');
    const addressEl = document.getElementById('deal-checkout-address');
    const commentEl = document.getElementById('deal-checkout-comment');
    if (nameEl) nameEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (addressEl) addressEl.value = '';
    if (commentEl) commentEl.value = '';

    const backBtn = document.getElementById('deal-checkout-page-back');
    if (backBtn) backBtn.onclick = () => closeDealCheckoutPage();
}

/**
 * Закрыть страницу оформления: при source 'cart' — возврат в корзину, при 'single' — главная/избранное.
 */
export function closeDealCheckoutPage() {
    clearOverlaysAndBodyClasses();
    const page = document.getElementById(PAGE_ID);
    if (page) page.style.display = 'none';
    const source = currentCheckoutSource;
    currentDealId = null;
    currentSummary = null;
    currentCheckoutSource = 'cart';
    if (source === 'single') {
        const mainContent = document.getElementById('main-content');
        const favoritesPage = document.getElementById('favorites-page');
        if (favoritesPage) favoritesPage.style.display = 'block';
        else if (mainContent) mainContent.style.display = 'block';
    } else {
        const cartPage = document.getElementById('cart-page-new');
        if (cartPage) cartPage.style.display = 'block';
    }
}

/**
 * Инициализация обработчиков шагов (вызывается один раз при загрузке приложения).
 */
export function initDealCheckoutPage() {
    const page = document.getElementById(PAGE_ID);
    if (!page) return;

    // Шаг 1: способ оплаты -> при смене пересчитываем quote
    const step1Next = document.getElementById('deal-checkout-step-1-next');
    if (step1Next) step1Next.onclick = () => showStep(2);
    page.querySelectorAll('input[name="deal-payment-method"]').forEach((radio) => {
        radio.addEventListener('change', () => refreshQuoteAndSummary());
    });

    // Шаг 2: доставка (+ адрес при courier), при смене пересчитываем quote
    const step2Back = document.getElementById('deal-checkout-step-2-back');
    const step2Next = document.getElementById('deal-checkout-step-2-next');
    if (step2Back) step2Back.onclick = () => showStep(1);
    if (step2Next) step2Next.onclick = () => showStep(3);
    page.querySelectorAll('input[name="deal-delivery-method"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            toggleAddressVisibility();
            refreshQuoteAndSummary();
        });
    });
    toggleAddressVisibility();

    // Шаг 3: контакты
    const step3Back = document.getElementById('deal-checkout-step-3-back');
    const step3Next = document.getElementById('deal-checkout-step-3-next');
    if (step3Back) step3Back.onclick = () => showStep(2);
    if (step3Next) step3Next.onclick = () => {
        const name = document.getElementById('deal-checkout-name').value.trim();
        const phone = document.getElementById('deal-checkout-phone').value.trim();
        if (!name) {
            const alertFn = window.Telegram?.WebApp?.showAlert || ((m) => alert(m));
            alertFn('Введите имя');
            return;
        }
        if (!phone) {
            const alertFn = window.Telegram?.WebApp?.showAlert || ((m) => alert(m));
            alertFn('Введите телефон');
            return;
        }
        showStep(4);
    };

    // Шаг 4: комментарий + подтвердить
    const step4Back = document.getElementById('deal-checkout-step-4-back');
    const step4Submit = document.getElementById('deal-checkout-step-4-submit');
    if (step4Back) step4Back.onclick = () => showStep(3);
    if (step4Submit) {
        step4Submit.onclick = async () => {
            if (!currentDealId) return;
            const paymentEl = document.querySelector('input[name="deal-payment-method"]:checked');
            const deliveryEl = document.querySelector('input[name="deal-delivery-method"]:checked');
            const name = document.getElementById('deal-checkout-name').value.trim();
            const phone = document.getElementById('deal-checkout-phone').value.trim();
            const addressEl = document.getElementById('deal-checkout-address');
            const commentEl = document.getElementById('deal-checkout-comment');
            const address = (addressEl && addressEl.value) ? addressEl.value.trim() : null;
            const comment = (commentEl && commentEl.value) ? commentEl.value.trim() : null;

            const payload = {
                deal_id: currentDealId,
                payment_method: paymentEl ? paymentEl.value : 'card',
                delivery_method: deliveryEl ? deliveryEl.value : 'pickup',
                customer_name: name || 'Клиент',
                customer_phone: phone || '—',
                delivery_address: address || null,
                customer_comment: comment || null,
            };

            try {
                step4Submit.disabled = true;
                const deal = await confirmDealCheckoutAPI(payload);
                const source = currentCheckoutSource;
                currentDealId = null;
                // Чистим корзину только если оформляли из корзины; при покупке с карточки не трогаем
                if (source === 'cart') {
                    const { removeSelectedCartItems } = await import('./cart/cartStore.js');
                    await removeSelectedCartItems();
                }
                const { showNotification } = await import('./utils/admin_utils.js').catch(() => ({ showNotification: (m) => alert(m) }));
                showNotification(`Сделка №${deal.deal_number || deal.id} оформлена`, 'success');
                const { updateActivityCounts } = await import('./activityIndicators.js');
                await updateActivityCounts();
                closeDealCheckoutPage();
                if (source === 'cart') {
                    const { closeCartPageNew } = await import('./cart/cartNew.js').catch(() => ({}));
                    if (typeof closeCartPageNew === 'function') closeCartPageNew();
                }
                const { showOnlyPage } = await import('./operationsBase.js');
                const { openSaleOrdersPage } = await import('./operationsSaleOrders.js');
                const { openDealDetailPage } = await import('./operationsDetail.js');
                const { getDealDetailAPI } = await import('./api/deals.js');
                showOnlyPage('profile-page');
                openSaleOrdersPage();
                const fullDeal = await getDealDetailAPI(deal.id);
                openDealDetailPage(fullDeal);
            } catch (e) {
                console.error('Deal confirm error:', e);
                const alertFn = window.Telegram?.WebApp?.showAlert || ((m) => alert(m));
                alertFn('Ошибка: ' + (e.message || 'не удалось подтвердить сделку'));
            } finally {
                step4Submit.disabled = false;
            }
        };
    }
}
