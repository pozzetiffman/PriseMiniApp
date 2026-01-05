// ========== REFACTORING STEP 1.1: priceUtils.js ==========
// Модуль утилит для работы с ценами товаров
// Дата создания: 2024-12-19
// Статус: В процессе

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
    
    if (isForSale) {
        const priceType = prod.price_type || 'range';
        if (priceType === 'fixed') {
            // Проверяем фиксированную цену: должна быть указана и больше 0
            if (prod.price_fixed != null && prod.price_fixed !== '' && prod.price_fixed !== undefined) {
                const fixedPrice = Number(prod.price_fixed);
                if (!isNaN(fixedPrice) && isFinite(fixedPrice) && fixedPrice > 0) {
                    return `${fixedPrice}р`;
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
                return `от ${priceFrom} до ${priceTo} р`;
            } else if (priceFrom != null) {
                return `от ${priceFrom} р`;
            } else if (priceTo != null) {
                return `до ${priceTo} р`;
            }
            // Если нет цены в диапазоне, возвращаем "Цена по запросу"
            return 'Цена по запросу';
        }
        // Если нет цены, возвращаем "Цена по запросу"
        return 'Цена по запросу';
    } else {
        // Обычная цена со скидкой
        // Проверяем что цена указана и больше 0
        if (prod.price != null && prod.price !== '' && prod.price !== undefined) {
            const basePrice = Number(prod.price);
            if (!isNaN(basePrice) && isFinite(basePrice) && basePrice > 0) {
                const finalPrice = prod.discount > 0 
                    ? Math.round(basePrice * (1 - prod.discount / 100)) 
                    : basePrice;
                return `${finalPrice} ₽`;
            }
        }
        // Если обычная цена не указана или равна 0, возвращаем "Цена по запросу"
        return 'Цена по запросу';
    }
}

