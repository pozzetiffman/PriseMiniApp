// ========== REFACTORING STEP 1.1: priceUtils.js ==========
// Модуль утилит для работы с ценами товаров
// Дата создания: 2024-12-19
// Обновлено: 2026-01-28 - Новая модель цен (price_card как базовая цена)

/**
 * Получает базовую цену товара
 * Приоритет: price_card > price (fallback для старых товаров)
 * @param {Object} product - Объект товара
 * @returns {number|null} Базовая цена или null если цена не указана
 */
export function getBasePrice(product) {
    if (!product || typeof product !== 'object') return null;
    const priceCard = product.price_card ?? product.priceCard;
    if (priceCard != null && priceCard !== '') {
        const n = Number(priceCard);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const price = product.price;
    if (price != null && price !== '') {
        const n = Number(price);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

/**
 * Проверяет наличие активной скидки
 * @param {Object} product - Объект товара
 * @returns {boolean} true если есть активная скидка
 */
export function hasDiscount(product) {
    return typeof product.discount === 'number' && product.discount > 0;
}

/**
 * Рассчитывает финальную цену по карте (с учетом скидки)
 * @param {Object} product - Объект товара
 * @returns {number|null} Финальная цена по карте или null
 */
export function getFinalCardPrice(product) {
    const basePrice = getBasePrice(product);
    if (basePrice === null) {
        return null;
    }
    
    if (hasDiscount(product)) {
        return Math.round(basePrice * (1 - product.discount / 100));
    }
    
    return basePrice;
}

/**
 * Рассчитывает финальную цену наличными
 * @param {Object} product - Объект товара
 * @returns {number|null} Финальная цена наличными или null
 */
export function getFinalCashPrice(product) {
    const basePrice = getBasePrice(product);
    if (basePrice === null) {
        return null;
    }
    
    const priceCash = product.price_cash ?? product.priceCash;
    if (priceCash != null && priceCash !== '') {
        const cashPrice = Number(priceCash);
        if (Number.isFinite(cashPrice) && cashPrice > 0) {
            // Если есть скидка, применяем её к цене наличными
            if (hasDiscount(product)) {
                // Вычисляем разницу между базовой ценой и ценой наличными
                const delta = basePrice - cashPrice;
                // Применяем скидку к базовой цене и вычитаем разницу
                const finalCardPrice = getFinalCardPrice(product);
                return finalCardPrice - delta;
            }
            return cashPrice;
        }
    }
    
    // Если price_cash не указан, но есть скидка, возвращаем null (не показываем цену наличными)
    return null;
}

/**
 * Получает старую цену для отображения (базовая цена до скидки)
 * Используется ТОЛЬКО для UI, когда есть скидка
 * @param {Object} product - Объект товара
 * @returns {number|null} Старая цена или null
 */
export function getOldPriceForDisplay(product) {
    // Старая цена показывается ТОЛЬКО если есть скидка
    if (!hasDiscount(product)) {
        return null;
    }
    
    // Старая цена = базовая цена (до скидки)
    return getBasePrice(product);
}

/**
 * Форматирует отображение цены товара с учетом типа цены (обычная/на продажу)
 * @param {Object} prod - Объект товара
 * @returns {string} Отформатированная строка цены
 */
export function getProductPriceDisplay(prod) {
    const isForSale = prod.is_for_sale === true || 
                     prod.is_for_sale === 1 || 
                     prod.is_for_sale === '1' ||
                     prod.is_for_sale === 'true' ||
                     String(prod.is_for_sale).toLowerCase() === 'true';
    
    // Для товаров "на покупку" используем старую логику (price_from, price_to, price_fixed)
    if (isForSale) {
        const priceType = prod.price_type || 'range';
        if (priceType === 'fixed') {
            // Проверяем фиксированную цену: должна быть указана и больше 0
            if (prod.price_fixed != null && prod.price_fixed !== '' && prod.price_fixed !== undefined) {
                const fixedPrice = Number(prod.price_fixed);
                if (!isNaN(fixedPrice) && isFinite(fixedPrice) && fixedPrice > 0) {
                    // Форматируем цену с пробелами между тысячами
                    return `${fixedPrice.toLocaleString('ru-RU')}₽`;
                }
            }
            // Если фиксированная цена не указана или равна 0, возвращаем "Цена по запросу"
            return 'Цена по запросу';
        } else if (priceType === 'range') {
            // Для диапазона цен показываем "от X до Y р"
            // Обрабатываем значения: могут быть числами, строками, null, undefined
            let priceFrom = null;
            let priceTo = null;
            
            // Обрабатываем price_from: конвертируем в число, если возможно
            if (prod.price_from != null && prod.price_from !== '') {
                const fromNum = Number(prod.price_from);
                if (!isNaN(fromNum) && isFinite(fromNum) && fromNum > 0) {
                    priceFrom = fromNum;
                }
            }
            
            // Обрабатываем price_to: конвертируем в число, если возможно
            if (prod.price_to != null && prod.price_to !== '') {
                const toNum = Number(prod.price_to);
                if (!isNaN(toNum) && isFinite(toNum) && toNum > 0) {
                    priceTo = toNum;
                }
            }
            
            // Если есть оба значения (включая 0), показываем диапазон "от X до Y р"
            if (priceFrom != null && priceTo != null) {
                return `от ${priceFrom.toLocaleString('ru-RU')} до ${priceTo.toLocaleString('ru-RU')} ₽`;
            } else if (priceFrom != null) {
                return `от ${priceFrom.toLocaleString('ru-RU')} ₽`;
            } else if (priceTo != null) {
                return `до ${priceTo.toLocaleString('ru-RU')} ₽`;
            }
            // Если нет цены в диапазоне, возвращаем "Цена по запросу"
            return 'Цена по запросу';
        }
        // Если нет цены, возвращаем "Цена по запросу"
        return 'Цена по запросу';
    } else {
        // Обычная цена - используем новую модель (price_card как базовая цена)
        const finalCardPrice = getFinalCardPrice(prod);
        
        if (finalCardPrice !== null) {
            // Форматируем цену с пробелами между тысячами
            return `${finalCardPrice.toLocaleString('ru-RU')}₽`;
        }
        
        // Если цена не указана, возвращаем "Цена по запросу"
        return 'Цена по запросу';
    }
}

// ——— Единый "price resolver" для карточки товара и детали операции ———

/** Привести значение к числу; не глотать 0 и строки типа "1500". Использовать Number.isFinite. */
function toNum(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0) ? n : null;
}

/** Прочитать число из объекта по snake_case и camelCase (для snapshot/API). */
function getNum(product, snakeKey) {
    if (!product || typeof product !== 'object') return null;
    const camelKey = snakeKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const v = product[snakeKey] ?? product[camelKey];
    return toNum(v);
}

/**
 * Витрина цен товара (обычный товар или snapshot). Один источник правды для отображения и расчётов.
 * @param {Object} product - Товар или snapshot
 * @param {Object} opts - Опции (пока не используются)
 * @returns {{ card: { current: number|null, old: number|null }, cash: { current: number|null, old: number|null }, displayText: string, shortDescription: string|null }}
 */
export function getProductPriceView(product, opts = {}) {
    const card = { current: null, old: null };
    const cash = { current: null, old: null };
    let displayText = 'Цена по запросу';
    const shortDescription = (product?.short_description ?? product?.description ?? '')
        ? String(product.short_description ?? product.description).trim() || null : null;

    if (!product || typeof product !== 'object') {
        return { card, cash, displayText, shortDescription };
    }

    const isForSale = product.is_for_sale === true || product.is_for_sale === 1 ||
        product.is_for_sale === '1' || String(product.is_for_sale || '').toLowerCase() === 'true';

    if (isForSale) {
        const priceType = product.price_type || 'range';
        if (priceType === 'fixed') {
            const fixed = toNum(product.price_fixed);
            if (fixed != null) {
                card.current = fixed;
                displayText = `${fixed.toLocaleString('ru-RU')} ₽`;
            }
        } else {
            const from = toNum(product.price_from);
            const to = toNum(product.price_to);
            if (from != null && to != null) displayText = `от ${from.toLocaleString('ru-RU')} до ${to.toLocaleString('ru-RU')} ₽`;
            else if (from != null) displayText = `от ${from.toLocaleString('ru-RU')} ₽`;
            else if (to != null) displayText = `до ${to.toLocaleString('ru-RU')} ₽`;
            if (from != null) card.current = from;
        }
        return { card, cash, displayText, shortDescription };
    }

    // Обычный товар: price_card / price / price_cash / price_old (snake и camelCase)
    const base = getBasePrice(product);
    const cardCurrent = getFinalCardPrice(product);
    const cashCurrent = getFinalCashPrice(product);
    card.current = cardCurrent ?? base ?? getNum(product, 'price');
    cash.current = cashCurrent ?? getNum(product, 'price_cash');
    const explicitOld = getNum(product, 'price_old');
    card.old = explicitOld ?? (hasDiscount(product) ? base : null);
    if (Number.isFinite(card.current)) displayText = `${card.current.toLocaleString('ru-RU')} ₽`;
    return { card, cash, displayText, shortDescription };
}

/**
 * Исходная цена за единицу (до скидки) для способа оплаты — для расчёта "без скидки" в корзине.
 * @param {Object} product - Товар или snapshot
 * @param {string|null} paymentMethod - 'cash' | null (по карте)
 * @returns {number|null}
 */
export function getOriginalUnitPrice(product, paymentMethod) {
    if (!product || typeof product !== 'object') return null;
    const base = getBasePrice(product);
    if (normalizePaymentMethod(paymentMethod) === 'cash') {
        const cash = getNum(product, 'price_cash');
        return cash ?? base;
    }
    return base;
}

/**
 * Цена за единицу с учётом способа оплаты (для расчёта итого в операции и корзине).
 * @param {Object} product - Товар или snapshot
 * @param {string|null} paymentMethod - 'cash' | 'online' | 'crypto' | 'bank_transfer' | null (дефолт "по карте")
 * @returns {number|null} Цена за единицу или null (цена по запросу)
 */
/** Нормализовать способ оплаты: наличные → 'cash', иначе null (по карте). */
export function normalizePaymentMethod(pm) {
    if (pm == null || pm === '') return null;
    const s = String(pm).toLowerCase().trim();
    if (s === 'cash' || s === 'nal' || s === 'наличные' || s === 'cash_on_delivery' || s === 'c') return 'cash';
    return null;
}

export function getEffectiveUnitPrice(product, paymentMethod) {
    if (!product || typeof product !== 'object') return null;
    const view = getProductPriceView(product);
    const isCash = normalizePaymentMethod(paymentMethod) === 'cash';
    if (isCash && view.cash.current != null) return view.cash.current;
    if (Number.isFinite(view.card.current)) return view.card.current;
    if (Number.isFinite(view.cash.current)) return view.cash.current;
    const isForSale = product.is_for_sale === true || product.is_for_sale === 1 ||
        product.is_for_sale === '1' || String(product.is_for_sale || '').toLowerCase() === 'true';
    if (isForSale) {
        const fixed = getNum(product, 'price_fixed');
        if (fixed != null) return fixed;
        const from = getNum(product, 'price_from');
        if (from != null) return from;
        return getNum(product, 'price_to');
    }
    return getNum(product, 'price');
}

