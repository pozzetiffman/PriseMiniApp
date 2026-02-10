// Модуль страницы детали операции (заказ / покупка / продажа / сделка)
// Данные из сохранённой сделки (snapshot). Резервации не затрагиваются.

import { API_BASE, getProductByIdAPI } from './api.js';
import { getDealDetailAPI } from './api/deals.js';
import { clearOverlaysAndBodyClasses, hideAllPages } from './operationsBase.js';
import { formatDateToMoscow } from './utils/dateUtils.js';
import { createImageContainer, getProductImageUrl } from './utils/imageUtils.js';
import { getEffectiveUnitPrice, getProductPriceView, normalizePaymentMethod } from './utils/priceUtils.js';
import { renderProductInfoBlock } from './utils/productCardParts.js';

const DETAIL_PAGE_ID = 'operation-detail-page';

const LIST_PAGE_IDS = {
    'orders': 'orders-page',
    'purchases': 'purchases-page',
    'sale-orders': 'sale-orders-page'
};

let currentListPageId = null;

const UNAVAILABLE_MESSAGE = 'Товар больше недоступен';

/** Форматирование числа как цены (только для отображения в детали операции), безопасно для null/undefined. */
function formatPrice(num) {
    if (num == null || num === '') return null;
    const n = Number(num);
    if (isNaN(n) || !isFinite(n) || n < 0) return null;
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

/**
 * Копирует текст в буфер обмена. Сначала clipboard API, fallback — textarea + execCommand.
 * Работает в Telegram WebApp и обычном браузере.
 */
function copyToClipboard(text) {
    if (!text || typeof text !== 'string') return Promise.resolve(false);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return Promise.resolve(ok);
    } catch (e) {
        return Promise.resolve(false);
    }
}

/** Показать уведомление об успешном копировании (Telegram WebApp или alert). */
function showCopyNotification() {
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && typeof window.Telegram.WebApp.showPopup === 'function') {
        window.Telegram.WebApp.showPopup({ title: '', message: 'Скопировано' });
        return;
    }
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && typeof window.Telegram.WebApp.showAlert === 'function') {
        window.Telegram.WebApp.showAlert('Скопировано');
        return;
    }
    if (typeof alert !== 'undefined') alert('Скопировано');
}

export function openOperationDetailPage(type, item) {
    if (!LIST_PAGE_IDS[type]) return;
    currentListPageId = LIST_PAGE_IDS[type];
    const page = document.getElementById(DETAIL_PAGE_ID);
    const listPage = document.getElementById(currentListPageId);
    if (!page || !listPage) return;

    const titles = {
        'orders': '🛒 Детали заказа',
        'purchases': '💰 Детали продажи',
        'sale-orders': '🛍️ Детали покупки'
    };
    const titleEl = document.getElementById('operation-detail-title');
    if (titleEl) titleEl.textContent = titles[type] || 'Детали';

    // Единый способ: скрыть все страницы, затем показать деталь
    hideAllPages();
    page.classList.add('is-active');
    page.style.display = 'block';
    if (page.scrollTo) page.scrollTo(0, 0);

    renderOperationDetail(type, item);

    /* Скролл только у контейнера страницы (как в profile/operationsBase), не window — чтобы на мобилке фон меню появлялся */
    if (!page.dataset.scrollSetup) {
        page.dataset.scrollSetup = '1';
        const topMenu = page.querySelector('.operation-top-menu');
        if (topMenu) {
            const updateTopBarScrolled = () => {
                if (!page.classList.contains('is-active')) return;
                const scrollTop = page.scrollTop || 0;
                if (scrollTop > 20) topMenu.classList.add('scrolled');
                else topMenu.classList.remove('scrolled');
            };
            page.addEventListener('scroll', updateTopBarScrolled, { passive: true });
            page.addEventListener('touchmove', updateTopBarScrolled, { passive: true });
            setTimeout(updateTopBarScrolled, 0);
            setTimeout(updateTopBarScrolled, 150);
        }
    } else {
        const topMenu = page.querySelector('.operation-top-menu');
        if (topMenu) {
            const scrollTop = page.scrollTop || 0;
            if (scrollTop > 20) topMenu.classList.add('scrolled');
            else topMenu.classList.remove('scrolled');
        }
    }

    const backBtn = document.getElementById('operation-detail-back');
    if (backBtn) {
        backBtn.onclick = () => closeOperationDetailPage();
    }
}

export function closeOperationDetailPage() {
    clearOverlaysAndBodyClasses();
    const page = document.getElementById(DETAIL_PAGE_ID);
    if (!page) return;
    page.classList.remove('is-active');
    page.style.display = 'none';
    if (currentListPageId) {
        const listPage = document.getElementById(currentListPageId);
        if (listPage) {
            listPage.classList.add('is-active');
            listPage.style.display = 'block';
        }
        currentListPageId = null;
    }
}

/**
 * Открыть страницу детали сделки (покупки из корзины).
 * @param {Object} dealSummaryOrFull - Сделка из списка (id, deal_number, ...) или полный объект с items (чтобы не делать лишний запрос)
 */
export async function openDealDetailPage(dealSummaryOrFull) {
    currentListPageId = 'sale-orders-page';
    const page = document.getElementById(DETAIL_PAGE_ID);
    const listPage = document.getElementById(currentListPageId);
    if (!page || !listPage) return;

    const titleEl = document.getElementById('operation-detail-title');
    if (titleEl) titleEl.textContent = '🛍️ Детали сделки';

    hideAllPages();
    page.classList.add('is-active');
    page.style.display = 'block';
    if (page.scrollTo) page.scrollTo(0, 0);

    const orderNumberWrap = document.getElementById('operation-detail-order-number-wrap');
    const statusRow = document.getElementById('operation-detail-status-row');
    const productCardWrap = document.getElementById('operation-detail-product-card');
    const orderBlock = document.getElementById('operation-detail-order-block');
    const contactBlock = document.getElementById('operation-detail-contact-block');
    if (orderNumberWrap) orderNumberWrap.innerHTML = '<p class="loading">Загрузка...</p>';
    if (statusRow) statusRow.innerHTML = '';
    if (productCardWrap) productCardWrap.innerHTML = '';
    if (orderBlock) orderBlock.innerHTML = '';
    if (contactBlock) contactBlock.innerHTML = '';

    try {
        const deal = (dealSummaryOrFull && Array.isArray(dealSummaryOrFull.items))
            ? dealSummaryOrFull
            : await getDealDetailAPI(dealSummaryOrFull.id);
        renderDealDetail(deal, orderNumberWrap, statusRow, productCardWrap, orderBlock, contactBlock);
    } catch (e) {
        console.error('Deal detail load error:', e);
        if (orderNumberWrap) orderNumberWrap.innerHTML = '';
        if (statusRow) statusRow.innerHTML = `<p class="loading">Ошибка загрузки</p>`;
    }

    const backBtn = document.getElementById('operation-detail-back');
    if (backBtn) {
        backBtn.onclick = () => closeOperationDetailPage();
    }

    if (!page.dataset.scrollSetup) {
        page.dataset.scrollSetup = '1';
        const topMenu = page.querySelector('.operation-top-menu');
        if (topMenu) {
            const updateTopBarScrolled = () => {
                if (!page.classList.contains('is-active')) return;
                const scrollTop = page.scrollTop || 0;
                if (scrollTop > 20) topMenu.classList.add('scrolled');
                else topMenu.classList.remove('scrolled');
            };
            page.addEventListener('scroll', updateTopBarScrolled, { passive: true });
            page.addEventListener('touchmove', updateTopBarScrolled, { passive: true });
            setTimeout(updateTopBarScrolled, 0);
        }
    }
}

function renderDealDetail(deal, orderNumberWrap, statusRow, productCardWrap, orderBlock, contactBlock) {
    const num = deal.deal_number != null ? String(deal.deal_number).trim() : '';
    const dateText = deal.created_at ? formatDateToMoscow(deal.created_at) : '';
    let statusBadge = '';
    if (deal.status === 'completed') statusBadge = '<span class="operation-badge operation-badge-completed">✅ Завершена</span>';
    else if (deal.status === 'cancelled') statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменена</span>';
    else statusBadge = '<span class="operation-badge operation-badge-active">⏳ В обработке</span>';

    if (orderNumberWrap && num) {
        orderNumberWrap.innerHTML = `
            <div class="operation-order-number-block" data-order-number="${escapeHtml(num)}">
                <span class="operation-order-number-label">Номер сделки</span>
                <span class="operation-order-number-value">${escapeHtml(num)}</span>
            </div>
        `;
        const block = orderNumberWrap.querySelector('.operation-order-number-block');
        if (block) {
            block.addEventListener('click', () => {
                copyToClipboard(num).then((ok) => { if (ok) showCopyNotification(); });
            });
        }
    } else if (orderNumberWrap) {
        orderNumberWrap.innerHTML = '';
    }

    if (statusRow) {
        statusRow.innerHTML = `
            <div class="operation-detail-date">${dateText ? `📅 ${dateText}` : ''}</div>
            <div class="operation-detail-status-badge">${statusBadge}</div>
        `;
    }

    if (productCardWrap && deal.items && deal.items.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'operation-detail-deal-items';
        deal.items.forEach(item => {
            const card = createDealItemMiniCard(item, (productFromSnapshot) => openProductFromDealItem(item, productFromSnapshot));
            wrap.appendChild(card);
        });
        productCardWrap.innerHTML = '';
        productCardWrap.appendChild(wrap);
    } else if (productCardWrap) {
        productCardWrap.innerHTML = '<p class="loading">Нет товаров</p>';
    }

    const formatSum = (v) => (v != null && !isNaN(Number(v))) ? `${Math.round(Number(v)).toLocaleString('ru-RU')} ₽` : '—';
    const paymentLabels = { card: 'Картой', cash: 'Наличными', transfer: 'Перевод', other: 'Другое' };
    const deliveryLabels = { pickup: 'Самовывоз', courier: 'Курьером', none: '—' };
    const rows = [];
    rows.push(`<div class="operation-detail-order-row"><span class="operation-detail-order-label">Товаров</span><span class="operation-detail-order-value">${deal.total_items_count != null ? deal.total_items_count : '—'}</span></div>`);
    if (deal.items_amount != null) rows.push(`<div class="operation-detail-order-row"><span class="operation-detail-order-label">Товары</span><span class="operation-detail-order-value">${formatSum(deal.items_amount)}</span></div>`);
    if (deal.delivery_fee != null && Number(deal.delivery_fee) > 0) rows.push(`<div class="operation-detail-order-row"><span class="operation-detail-order-label">Доставка</span><span class="operation-detail-order-value">${formatSum(deal.delivery_fee)}</span></div>`);
    rows.push(`<div class="operation-detail-order-row operation-detail-order-row-total"><span class="operation-detail-order-label">Итого</span><span class="operation-detail-order-value">${formatSum(deal.total_amount)}</span></div>`);
    if (deal.payment_method) rows.push(`<div class="operation-detail-order-row"><span class="operation-detail-order-label">Оплата</span><span class="operation-detail-order-value">${paymentLabels[deal.payment_method] || deal.payment_method}</span></div>`);
    if (deal.delivery_method) rows.push(`<div class="operation-detail-order-row"><span class="operation-detail-order-label">Способ получения</span><span class="operation-detail-order-value">${deliveryLabels[deal.delivery_method] || deal.delivery_method}</span></div>`);
    if (orderBlock) orderBlock.innerHTML = rows.join('');

    // Контакты и адрес: имя, телефон, адрес, комментарий
    const contactLines = [];
    if (deal.customer_name) contactLines.push(deal.customer_name);
    if (deal.customer_phone) contactLines.push(deal.customer_phone);
    if (deal.delivery_address) contactLines.push(deal.delivery_address);
    if (deal.customer_comment) contactLines.push('Комментарий: ' + deal.customer_comment);
    if (contactBlock) {
        contactBlock.innerHTML = contactLines.length
            ? contactLines.map(s => `<div class="operation-detail-line">${escapeHtml(s)}</div>`).join('')
            : '<div class="operation-detail-line">—</div>';
    }
}

/**
 * Открыть карточку товара по клику на позицию в сделке (как в заказах: snapshot + модалка).
 */
/**
 * Открыть карточку товара по клику на позицию в сделке.
 * Если товар доступен — модалка с актуальными данными; если удалён/скрыт — read-only из snapshot.
 */
async function openProductFromDealItem(item, productFromSnapshot) {
    const productId = item.product_id || (productFromSnapshot && productFromSnapshot.id);
    const snapshotProduct = productFromSnapshot || item.product || {};
    if (!productId && !snapshotProduct.name) {
        if (typeof alert !== 'undefined') alert(UNAVAILABLE_MESSAGE);
        return;
    }
    try {
        const realProduct = productId ? await getProductByIdAPI(productId) : null;
        const { showProductModal } = await import('./handlers/products_modal.js');
        if (!realProduct) {
            // Товар удалён или скрыт — показываем read-only карточку из snapshot
            const imgs = (snapshotProduct.images_urls && snapshotProduct.images_urls.length)
                ? snapshotProduct.images_urls
                : (snapshotProduct.image_url ? [snapshotProduct.image_url] : null);
            const modalProduct = {
                ...snapshotProduct,
                id: productId || snapshotProduct.id,
                name: snapshotProduct.name || 'Товар',
                is_unavailable: true,
                images_urls: imgs,
                image_url: snapshotProduct.image_url || (imgs && imgs[0]) || null,
            };
            const basePrice = modalProduct.price_card ?? modalProduct.price;
            showProductModal(modalProduct, basePrice, imgs, false, null);
            return;
        }
        const product = snapshotProduct;
        const fullImages = (realProduct.images_urls && realProduct.images_urls.length)
            ? realProduct.images_urls
            : (realProduct.image_url ? [realProduct.image_url] : null);
        const modalProduct = {
            ...realProduct,
            price: product.price ?? realProduct.price,
            price_card: product.price_card ?? realProduct.price_card,
            price_cash: product.price_cash ?? realProduct.price_cash,
            discount: product.discount ?? realProduct.discount,
            price_old: product.price_old ?? realProduct.price_old,
            images_urls: fullImages ?? realProduct.images_urls ?? null,
            image_url: realProduct.image_url ?? product.image_url ?? null,
        };
        const basePriceForModal = modalProduct.price_card ?? modalProduct.price;
        showProductModal(modalProduct, basePriceForModal, fullImages, false, null);
    } catch (err) {
        console.error('Open product from deal item:', err);
        if (typeof alert !== 'undefined') alert(UNAVAILABLE_MESSAGE);
    }
}

function createDealItemMiniCard(item, onOpenProduct) {
    const product = item.product || {};
    const name = product.name || 'Товар';
    const imageUrl = (product.images_urls && product.images_urls[0]) ? product.images_urls[0] : product.image_url;
    const priceText = item.price_per_unit != null ? `${Math.round(item.price_per_unit).toLocaleString('ru-RU')} ₽` : '—';
    const lineTotalText = item.line_total != null ? `${Math.round(item.line_total).toLocaleString('ru-RU')} ₽` : '—';
    const qty = item.quantity != null ? item.quantity : 1;

    const card = document.createElement('div');
    card.className = 'operation-detail-deal-item-card';
    const imgEl = createImageContainer(imageUrl, name, '[DEAL]');
    if (imgEl) {
        imgEl.style.width = '64px';
        imgEl.style.height = '64px';
        imgEl.style.borderRadius = '8px';
        imgEl.style.flexShrink = '0';
    }
    card.innerHTML = `
        <div class="operation-detail-deal-item-info">
            <h4 class="operation-detail-deal-item-name">${escapeHtml(name)}</h4>
            <p class="operation-detail-deal-item-price">${priceText} × ${qty} = ${lineTotalText}</p>
        </div>
    `;
    if (imgEl) card.insertBefore(imgEl, card.firstChild);

    if (typeof onOpenProduct === 'function' && (item.product_id || product.id)) {
        card.classList.add('operation-detail-product-card-link');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Товар: ${name}`);
        card.addEventListener('click', () => onOpenProduct(product));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenProduct(product);
            }
        });
    }
    return card;
}

function renderOperationDetail(type, item) {
    const orderNumberWrap = document.getElementById('operation-detail-order-number-wrap');
    const statusRow = document.getElementById('operation-detail-status-row');
    const productCardWrap = document.getElementById('operation-detail-product-card');
    const orderBlock = document.getElementById('operation-detail-order-block');
    const contactBlock = document.getElementById('operation-detail-contact-block');
    if (!statusRow || !productCardWrap || !orderBlock || !contactBlock) return;

    const product = item.product || {};
    const productExists = product.id && !product.is_unavailable;
    const dateText = item.created_at ? formatDateToMoscow(item.created_at) : '';

    // Диагностика: что реально пришло в item (для отладки обрезания полей на бэке)
    if (typeof console !== 'undefined' && console.log) {
        console.log('[DETAIL] type=', type);
        console.log('[DETAIL] item.payment_method=', item.payment_method, 'item.paymentMethod=', item.paymentMethod);
        console.log('[DETAIL] item.product keys=', product ? Object.keys(product) : []);
        console.log('[DETAIL] item.product snapshot fields=', product ? {
            price_card: product.price_card,
            price_cash: product.price_cash,
            price_old: product.price_old,
            description: product.description ? '(present)' : '(absent)'
        } : null);
    }

    // Блок номера заказа под заголовком: одна строка «Номер заказа» + номер; копирование по клику на блок
    if (orderNumberWrap) {
        const num = item.order_number != null ? String(item.order_number).trim() : '';
        if (num && (type === 'orders' || type === 'purchases' || type === 'sale-orders')) {
            orderNumberWrap.innerHTML = `
                <div class="operation-order-number-block" data-order-number="${escapeHtml(num)}">
                    <span class="operation-order-number-label">Номер заказа</span>
                    <span class="operation-order-number-value">${escapeHtml(num)}</span>
                </div>
            `;
            const block = orderNumberWrap.querySelector('.operation-order-number-block');
            const doCopy = () => {
                copyToClipboard(num).then((ok) => {
                    if (ok) showCopyNotification();
                });
            };
            if (block) block.addEventListener('click', (e) => { e.preventDefault(); doCopy(); });
        } else {
            orderNumberWrap.innerHTML = '';
        }
    }

    // Статус и дата
    let statusBadge = '';
    if (type === 'orders') {
        if (item.is_completed) statusBadge = '<span class="operation-badge operation-badge-completed">✅ Выполнен</span>';
        else if (item.is_cancelled) statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменён</span>';
        else statusBadge = '<span class="operation-badge operation-badge-active">⏳ В обработке</span>';
    } else if (type === 'purchases') {
        if (item.is_completed) statusBadge = '<span class="operation-badge operation-badge-completed">✅ Выполнена</span>';
        else if (item.is_cancelled) statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменена</span>';
        else statusBadge = '<span class="operation-badge operation-badge-active">⏳ Ожидание</span>';
    } else if (type === 'sale-orders') {
        if (item.is_completed) statusBadge = '<span class="operation-badge operation-badge-completed">✅ Выполнен</span>';
        else if (item.is_cancelled) statusBadge = '<span class="operation-badge operation-badge-cancelled">❌ Отменён</span>';
        else statusBadge = '<span class="operation-badge operation-badge-active">⏳ В обработке</span>';
    }
    // Дата слева, статус справа — одна линия, flex выравнивание в CSS
    statusRow.innerHTML = `
        <div class="operation-detail-date">${dateText ? `📅 ${dateText}` : ''}</div>
        <div class="operation-detail-status-badge">${statusBadge}</div>
    `;

    // Блок 1: Карточка товара (всегда из снапшота)
    const cardEl = createOperationProductCard(product, productExists);
    productCardWrap.innerHTML = '';
    productCardWrap.appendChild(cardEl);

    // Блок 2: Детали заказа (Итого) — один блок
    const paymentLabelSale = (v) => {
        if (!v) return '';
        const map = { 'online': 'Онлайн', 'crypto': 'Крипто', 'cash': 'Наличные' };
        return map[v] || v;
    };
    const paymentLabelPurchase = (v) => {
        if (!v) return '';
        const map = { 'cash': 'Наличные', 'bank_transfer': 'Банковский перевод' };
        return map[v] || v;
    };
    const deliveryLabel = (v) => (v === 'delivery' ? 'Доставка' : v === 'pickup' ? 'Самовывоз' : v || '');

    // Блок 2: Итого — единый расчёт: unitPrice по getEffectiveUnitPrice(product, paymentMethod)
    const orderRow = (label, value, opts = {}) => {
        if (value == null || value === '') return '';
        const cls = opts.total ? ' operation-detail-order-row-total' : opts.savings ? ' operation-detail-order-row-savings' : '';
        return `<div class="operation-detail-order-row${cls}"><span class="operation-detail-order-label">${escapeHtml(label)}</span><span class="operation-detail-order-value">${escapeHtml(String(value))}</span></div>`;
    };
    const paymentMethodRaw = item.payment_method ?? item.paymentMethod ?? null;
    const paymentMethod = normalizePaymentMethod(paymentMethodRaw) ?? paymentMethodRaw;
    const unitPrice = getEffectiveUnitPrice(product, paymentMethod);
    const unitPriceValid = unitPrice != null && !isNaN(unitPrice) && unitPrice > 0;
    const qty = item.quantity != null ? item.quantity : 1;
    const subtotal = unitPriceValid ? unitPrice * qty : null;
    const view = getProductPriceView(product);
    const isCashPayment = normalizePaymentMethod(paymentMethodRaw) === 'cash';
    const oldUnit = isCashPayment ? view.cash.old : view.card.old;
    let savingsAmount = null;
    if (item.discount_amount != null && !isNaN(Number(item.discount_amount))) savingsAmount = Number(item.discount_amount);
    else if (item.total_discount != null && !isNaN(Number(item.total_discount))) savingsAmount = Number(item.total_discount);
    else if (oldUnit != null && unitPriceValid && oldUnit > unitPrice) savingsAmount = (oldUnit - unitPrice) * qty;
    const discountPct = typeof product.discount === 'number' && product.discount > 0 ? product.discount : null;
    let orderRows = [];

    if (type === 'orders') {
        orderRows.push(orderRow('Количество', qty));
        if (unitPriceValid) {
            orderRows.push(orderRow('Цена за ед.', formatPrice(unitPrice)));
            orderRows.push(orderRow('Сумма', formatPrice(subtotal)));
        } else orderRows.push(orderRow('Цена за ед.', 'Цена по запросу'));
        if (discountPct != null) orderRows.push(orderRow('Скидка', `${discountPct}%`));
        if (subtotal != null) orderRows.push(orderRow('Итого к оплате', formatPrice(subtotal), { total: true }));
        else orderRows.push(orderRow('Итого к оплате', '—', { total: true }));
        if (savingsAmount != null && savingsAmount > 0) orderRows.push(orderRow('Экономия', formatPrice(savingsAmount), { savings: true }));
        if (paymentMethodRaw == null) orderRows.push(orderRow('Оплата', 'По карте (по умолчанию)'));
        orderRows.push(orderRow('Способ доставки', deliveryLabel(item.delivery_method) || '—'));
    } else if (type === 'purchases') {
        orderRows.push(orderRow('Форма оплаты', paymentLabelPurchase(item.payment_method) || '—'));
        if (dateText) orderRows.push(orderRow('Дата', dateText));
        orderRows.push(orderRow('Количество', qty));
        if (unitPriceValid) {
            orderRows.push(orderRow('Цена за ед.', formatPrice(unitPrice)));
            orderRows.push(orderRow('Итого', formatPrice(subtotal), { total: true }));
            if (savingsAmount != null && savingsAmount > 0) orderRows.push(orderRow('Экономия', formatPrice(savingsAmount), { savings: true }));
        } else {
            orderRows.push(orderRow('Цена за ед.', 'Цена по запросу'));
            orderRows.push(orderRow('Итого', '—', { total: true }));
        }
    } else if (type === 'sale-orders') {
        orderRows.push(orderRow('Количество', qty));
        if (item.items_amount != null || item.total_amount != null) {
            if (item.items_amount != null) orderRows.push(orderRow('Товары', formatPrice(item.items_amount)));
            if (item.delivery_fee != null && Number(item.delivery_fee) > 0) orderRows.push(orderRow('Доставка', formatPrice(item.delivery_fee)));
            if (item.total_amount != null) orderRows.push(orderRow('Итого к оплате', formatPrice(item.total_amount), { total: true }));
        } else {
            if (unitPriceValid) {
                orderRows.push(orderRow('Цена за ед.', formatPrice(unitPrice)));
                orderRows.push(orderRow('Сумма', formatPrice(subtotal)));
            } else orderRows.push(orderRow('Цена за ед.', 'Цена по запросу'));
            if (discountPct != null) orderRows.push(orderRow('Скидка', `${discountPct}%`));
            if (subtotal != null) orderRows.push(orderRow('Итого к оплате', formatPrice(subtotal), { total: true }));
            else orderRows.push(orderRow('Итого к оплате', '—', { total: true }));
            if (savingsAmount != null && savingsAmount > 0) orderRows.push(orderRow('Экономия', formatPrice(savingsAmount), { savings: true }));
        }
        orderRows.push(orderRow('Способ оплаты', paymentLabelSale(paymentMethodRaw ?? item.payment_method) || '—'));
        orderRows.push(orderRow('Способ доставки', deliveryLabel(item.delivery_method) || '—'));
    }
    orderBlock.innerHTML = orderRows.length ? orderRows.join('') : '<div class="operation-detail-order-row"><span class="operation-detail-order-value">—</span></div>';

    // Блок 3: Контактная информация — один блок; адрес нормализуем из разных полей API
    const fullName = [item.first_name, item.last_name, item.middle_name].filter(Boolean).join(' ').trim();
    const phone = [item.phone_country_code, item.phone_number].filter(Boolean).join(' ').trim();
    const contactLines = [fullName, phone, item.email].filter(Boolean);
    const city = item.city ?? item.delivery_city ?? item.contact?.city ?? '';
    const address = item.address ?? item.delivery_address ?? item.shipping_address ?? item.contact?.address ?? '';
    const addressLine = [city, address].filter(Boolean).join(', ').trim();
    if (addressLine) contactLines.push(addressLine);
    contactBlock.innerHTML = contactLines.length
        ? contactLines.map(s => `<div class="operation-detail-line">${escapeHtml(s)}</div>`).join('')
        : '<div class="operation-detail-line">—</div>';
}

/**
 * Мини-карточка товара в деталях операции (read-only из snapshot).
 * Инфо-блок 1-в-1 как на витрине: название, описание, старая цена, цена по карте + иконка, наличными + иконка (общий helper).
 */
export function createOperationProductCard(product, productExists) {
    const wrap = document.createElement('div');
    wrap.className = 'operation-detail-product-card';
    const imageUrl = getProductImageUrl(product, API_BASE);
    const imageContainer = createImageContainer(imageUrl, product.name || 'Товар', '[Сделка]');
    if (imageContainer) {
        imageContainer.classList.add('operation-detail-product-card-image');
    }

    const infoBlockHtml = renderProductInfoBlock(product, { mode: 'operation_detail' });
    const unavailableHtml = !productExists
        ? `<div class="operation-detail-product-unavailable"><span class="operation-badge operation-badge-cancelled">⚠️ Товар недоступен</span> ${UNAVAILABLE_MESSAGE}</div>`
        : '';

    wrap.innerHTML = '';
    if (imageContainer) wrap.appendChild(imageContainer);
    const info = document.createElement('div');
    info.className = 'operation-detail-product-card-info';
    info.innerHTML = infoBlockHtml + unavailableHtml;
    wrap.appendChild(info);

    if (productExists && product.id) {
        wrap.classList.add('operation-detail-product-card-link');
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('aria-label', `Перейти к товару: ${product.name || 'Товар'}`);
        wrap.addEventListener('click', async () => {
            try {
                const realProduct = await getProductByIdAPI(product.id);
                if (!realProduct) {
                    if (typeof alert !== 'undefined') alert(UNAVAILABLE_MESSAGE);
                    return;
                }
                const { showProductModal } = await import('./handlers/products_modal.js');
                // Картинки из realProduct (актуальные), если есть
                const fullImages = (realProduct.images_urls && realProduct.images_urls.length)
                    ? realProduct.images_urls
                    : (realProduct.image_url ? [realProduct.image_url] : null);
                // Объект для модалки: основа — realProduct, цены — строго из snapshot (product)
                const modalProduct = {
                    ...realProduct,
                    price: product.price ?? product.priceCard ?? product.price_card ?? realProduct.price,
                    price_card: product.price_card ?? product.priceCard ?? realProduct.price_card ?? realProduct.priceCard,
                    price_cash: product.price_cash ?? product.priceCash ?? realProduct.price_cash ?? realProduct.priceCash,
                    discount: product.discount ?? realProduct.discount,
                    price_old: product.price_old ?? product.priceOld ?? realProduct.price_old ?? realProduct.priceOld,
                    is_for_sale: product.is_for_sale ?? product.isForSale ?? realProduct.is_for_sale ?? realProduct.isForSale,
                    price_type: product.price_type ?? product.priceType ?? realProduct.price_type ?? realProduct.priceType,
                    price_fixed: product.price_fixed ?? product.priceFixed ?? realProduct.price_fixed ?? realProduct.priceFixed,
                    price_from: product.price_from ?? product.priceFrom ?? realProduct.price_from ?? realProduct.priceFrom,
                    price_to: product.price_to ?? product.priceTo ?? realProduct.price_to ?? realProduct.priceTo,
                    images_urls: fullImages ?? realProduct.images_urls ?? null,
                    image_url: realProduct.image_url ?? product.image_url ?? null
                };
                const basePriceForModal = modalProduct.price_card ?? modalProduct.priceCard ?? modalProduct.price;
                showProductModal(modalProduct, basePriceForModal, fullImages, false, null);
            } catch (err) {
                console.error('Open product from operation:', err);
                if (typeof alert !== 'undefined') alert(UNAVAILABLE_MESSAGE);
            }
        });
        wrap.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                wrap.click();
            }
        });
    } else {
        wrap.setAttribute('aria-label', 'Товар недоступен');
        wrap.addEventListener('click', () => {
            if (typeof alert !== 'undefined') {
                alert(UNAVAILABLE_MESSAGE);
            }
        });
    }

    return wrap;
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
