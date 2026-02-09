// Общий рендер инфо-блока карточки товара (название, описание, цены + иконки).
// Используется на витрине (products_render.js) и в деталях операции (operationsDetail.js).

import {
    getBasePrice,
    getFinalCardPrice,
    getFinalCashPrice,
    getOldPriceForDisplay,
    getProductPriceDisplay,
    hasDiscount
} from './priceUtils.js';

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

/** Убрать HTML-теги из строки (для описания из snapshot). */
function stripHtml(s) {
    if (s == null || typeof s !== 'string') return '';
    return s.replace(/<[^>]*>/g, '').trim();
}

/**
 * Первое непустое значение из списка после очистки (stripHtml + trim).
 * @param {...*} candidates - значения (short_description, description и т.д.)
 * @returns {string}
 */
function pickFirstNonEmptyText(...candidates) {
    for (const v of candidates) {
        const cleaned = stripHtml(String(v ?? '')).trim();
        if (cleaned.length > 0) return cleaned;
    }
    return '';
}

/**
 * Нормализуем описание: убираем HTML, лишние пробелы, zero-width и мусорные значения.
 * Строка считается пустой только после этой нормализации.
 */
function normalizeDescription(raw) {
    if (raw === null || raw === undefined) return '';
    let s = typeof raw === 'string' ? raw : String(raw);
    // Zero-width символы (визуально пусто, но строка не пустая)
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    // HTML-теги — заменяем на пробел, чтобы не склеить слова
    s = s.replace(/<[^>]*>/g, ' ');
    // Схлопываем пробелы/переводы строк в один пробел и обрезаем края
    s = s.replace(/\s+/g, ' ').trim();
    if (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
    return s;
}

const FALLBACK_NO_DESCRIPTION = 'Описание отсутствует';

/**
 * Текст описания для отображения в карточке.
 * В operation_detail при пустом snapshot показываем фоллбек "Описание отсутствует".
 * На витрине (grid) при пустом — пустая строка (блок не рендерим).
 * Используется нормализация: HTML, zero-width, "null"/"undefined", пробелы.
 */
function getDisplayDescription(prod, opts = {}) {
    const mode = opts.mode || 'grid';
    // Приоритет: description (снапшот/API), затем запасные варианты
    const raw =
        prod?.description ??
        prod?.desc ??
        prod?.short_description ??
        prod?.shortDescription ??
        prod?.description_short ??
        '';
    const normalized = normalizeDescription(raw);
    if (!normalized) {
        return mode === 'operation_detail' ? FALLBACK_NO_DESCRIPTION : '';
    }
    // В operation_detail обрезаем до 50 символов; многоточие только если резали
    if (mode === 'operation_detail') {
        return normalized.length > 50 ? normalized.slice(0, 50) + '…' : normalized;
    }
    return normalized.length > 50 ? normalized.slice(0, 50) + '…' : normalized;
}

/** SVG иконка карты; stroke=currentColor — цвет задаётся CSS (.prices--has-cash → красный, .prices--no-cash → зелёный) */
const CARD_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/>
<path d="M2 10H22" stroke="currentColor" stroke-width="2"/>
<path d="M6 15H10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/** SVG иконка наличных (как на витрине) */
const CASH_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="2" y="5" width="20" height="14" rx="2" stroke="#00A82E" stroke-width="2"/>
<circle cx="12" cy="12" r="3" stroke="#00A82E" stroke-width="2"/>
</svg>`;

/**
 * Рендер только блока цен по ТЗ: порядок — наличные (если есть), затем карта; цвета по hasCash/hasCard.
 * Используется на витрине, странице товара (#product-page) и в деталях операции.
 * @param {Object} prod - Товар (snake_case/camelCase поддерживаются в priceUtils)
 * @param {Object} opts - Опции: quantity (число) — множитель для отображения суммы (используется в корзине)
 * @returns {string} HTML строка: обёртка .prices-wrap .prices--has-cash | .prices--no-cash, внутри блоки cash (первым при наличии), затем card с old price в блоке карты
 */
export function renderProductPricesBlock(prod, opts = {}) {
    if (!prod || typeof prod !== 'object') return '';
    const quantity = opts.quantity != null && Number.isFinite(Number(opts.quantity)) && Number(opts.quantity) > 0 ? Number(opts.quantity) : 1;
    const priceDisplay = getProductPriceDisplay(prod);
    const isForSale = prod.is_for_sale === true || prod.is_for_sale === 1 ||
        prod.is_for_sale === '1' || String(prod.is_for_sale || '').toLowerCase() === 'true';

    if (isForSale) {
        const fixed = prod.price_fixed != null ? Number(prod.price_fixed) : null;
        const from = prod.price_from != null ? Number(prod.price_from) : null;
        const to = prod.price_to != null ? Number(prod.price_to) : null;
        let display = priceDisplay;
        if (quantity > 1 && (fixed != null || from != null || to != null)) {
            const num = fixed ?? from ?? to;
            if (Number.isFinite(num) && num > 0) {
                display = `${(num * quantity).toLocaleString('ru-RU')}₽`;
            }
        }
        return `<div class="prices-wrap prices--no-cash"><div class="product-price-container"><span class="product-price">${escapeHtml(display)}</span></div></div>`;
    }

    const basePrice = getBasePrice(prod);
    const hasCard = basePrice != null && Number.isFinite(basePrice) && basePrice > 0;
    const cashNum = Number(prod.price_cash ?? prod.priceCash);
    const hasCash = Number.isFinite(cashNum) && cashNum > 0;
    const finalCashPrice = getFinalCashPrice(prod);
    const finalCardPrice = getFinalCardPrice(prod);
    const hasActiveDiscount = hasDiscount(prod);
    const oldPrice = getOldPriceForDisplay(prod);

    const wrapClass = hasCash && hasCard ? 'prices-wrap prices--has-cash' : 'prices-wrap prices--no-cash';
    const parts = [];

    const fmt = (n) => (n != null && Number.isFinite(n) ? (n * quantity).toLocaleString('ru-RU') : '');

    if (hasCash && finalCashPrice != null) {
        parts.push(`<div class="product-cash-price-container"><span class="product-cash-price">${fmt(finalCashPrice)}₽</span><span class="product-cash-icon">${CASH_ICON_SVG}</span></div>`);
    }
    if (hasCard) {
        const cardTotal = finalCardPrice != null && Number.isFinite(finalCardPrice) ? finalCardPrice * quantity : null;
        const afterCard = hasActiveDiscount && oldPrice != null && Number.isFinite(oldPrice)
            ? `<span class="old-price">${fmt(oldPrice)}₽</span>`
            : '';
        const mainDisplay = cardTotal != null ? `${cardTotal.toLocaleString('ru-RU')}₽` : escapeHtml(priceDisplay);
        parts.push(`<div class="product-price-container"><span class="product-price">${mainDisplay}</span><span class="product-card-icon">${CARD_ICON_SVG}</span>${afterCard}</div>`);
    }

    if (parts.length === 0) {
        return `<div class="${wrapClass}"><div class="product-price-container"><span class="product-price">${escapeHtml(priceDisplay)}</span></div></div>`;
    }
    return `<div class="${wrapClass}">${parts.join('')}</div>`;
}

/**
 * Рендер блока цен только для страницы товара (#product-page): подпись слева, цена справа (в одной строке).
 * Логика цен та же: hasCash/hasCard, is_for_sale, скидка, старая цена. Дополнительно: строка «Экономия при оплате наличными».
 * @param {Object} prod - Товар (snake_case/camelCase поддерживаются в priceUtils)
 * @returns {string} HTML строка с классами pp-price-row, pp-price-label, pp-price-value
 */
export function renderProductPagePricesBlock(prod) {
    if (!prod || typeof prod !== 'object') return '';
    const priceDisplay = getProductPriceDisplay(prod);
    const isForSale = prod.is_for_sale === true || prod.is_for_sale === 1 ||
        prod.is_for_sale === '1' || String(prod.is_for_sale || '').toLowerCase() === 'true';

    if (isForSale) {
        return `<div class="prices-wrap prices--no-cash"><div class="pp-price-row"><div class="pp-price-label">Цена</div><div class="pp-price-value">${escapeHtml(priceDisplay)}</div></div></div>`;
    }

    const basePrice = getBasePrice(prod);
    const hasCard = basePrice != null && Number.isFinite(basePrice) && basePrice > 0;
    const cashNum = Number(prod.price_cash ?? prod.priceCash);
    const hasCash = Number.isFinite(cashNum) && cashNum > 0;
    const finalCashPrice = getFinalCashPrice(prod);
    const finalCardPrice = getFinalCardPrice(prod);
    const hasActiveDiscount = hasDiscount(prod);
    const oldPrice = getOldPriceForDisplay(prod);
    const discountPercent = prod.discount != null && Number.isFinite(Number(prod.discount)) ? Number(prod.discount) : 0;
    const wrapClass = hasCash && hasCard ? 'prices-wrap prices--has-cash' : 'prices-wrap prices--no-cash';

    const rows = [];

    if (hasCash && finalCashPrice != null) {
        const valueHtml = `<span class="product-cash-price">${finalCashPrice.toLocaleString('ru-RU')}₽</span><span class="product-cash-icon">${CASH_ICON_SVG}</span>`;
        rows.push(`<div class="pp-price-row"><div class="pp-price-label">Оплата наличными</div><div class="pp-price-value">${valueHtml}</div></div>`);
    }
    if (hasCard) {
        const mainValue = `<span class="product-price">${escapeHtml(priceDisplay)}</span><span class="product-card-icon">${CARD_ICON_SVG}</span>`;
        rows.push(`<div class="pp-price-row"><div class="pp-price-label">Оплата картой</div><div class="pp-price-value"><div class="pp-price-value-main">${mainValue}</div></div></div>`);
        if (hasActiveDiscount && oldPrice != null) {
            const secondaryParts = [`<span class="old-price">${oldPrice.toLocaleString('ru-RU')}₽</span>`];
            if (discountPercent > 0) {
                secondaryParts.push(`<span class="pp-discount-badge">Скидка −${discountPercent}%</span>`);
            }
            rows.push(`<div class="pp-price-row"><div class="pp-price-label">Старая цена</div><div class="pp-price-value">${secondaryParts.join('')}</div></div>`);
        }
    }

    if (rows.length === 0) {
        return `<div class="prices-wrap prices--no-cash"><div class="pp-price-row"><div class="pp-price-label">Цена</div><div class="pp-price-value">${escapeHtml(priceDisplay)}</div></div></div>`;
    }

    const savings = (hasCash && hasCard && finalCardPrice != null && finalCashPrice != null)
        ? (finalCardPrice - finalCashPrice)
        : 0;
    if (savings > 0) {
        rows.push(`<div class="pp-price-row pp-savings-row"><div class="pp-price-label">Экономия при оплате наличными</div><div class="pp-price-value">${savings.toLocaleString('ru-RU')}₽</div></div>`);
    }

    return `<div class="${wrapClass}">${rows.join('')}</div>`;
}

/**
 * Рендер инфо-блока карточки: название, описание (до 50 символов), старая цена, цена по карте + иконка, цена наличными + иконка.
 * Условия как на витрине: hasDiscount, getOldPriceForDisplay, getFinalCardPrice, getFinalCashPrice, getProductPriceDisplay.
 * @param {Object} prod - Товар или snapshot (snake_case/camelCase поддерживаются в priceUtils)
 * @param {{ mode?: 'grid' | 'operation_detail' }} opts - mode: 'grid' = .product-name, 'operation_detail' = .operation-detail-product-card-name (опционально)
 * @returns {string} HTML строка
 */
export function renderProductInfoBlock(prod, opts = {}) {
    const mode = opts.mode || 'grid';
    if (!prod || typeof prod !== 'object') return '';

    const nameClass = mode === 'operation_detail' ? 'operation-detail-product-card-name' : 'product-name';
    const name = escapeHtml(prod.name || 'Товар');

    const displayDescription = getDisplayDescription(prod, opts);
    if (mode === 'operation_detail') {
        const desc = prod?.description;
        const descStr = desc != null ? String(desc) : '';
        console.debug('[productCardParts] operation_detail description:', {
            typeof: typeof desc,
            length: descStr.length,
            first120: descStr.slice(0, 120),
            displayDescription: displayDescription ? displayDescription.slice(0, 60) + (displayDescription.length > 60 ? '…' : '') : '(empty/fallback)'
        });
    }
    const descriptionHtml = displayDescription
        ? `<div class="product-description">${escapeHtml(displayDescription)}</div>`
        : '';

    const pricesHtml = renderProductPricesBlock(prod);

    return `<div class="${nameClass}">${name}</div>${descriptionHtml}${pricesHtml}`;
}
