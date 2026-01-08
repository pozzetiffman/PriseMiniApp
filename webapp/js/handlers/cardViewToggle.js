// Обработчик переключения вида карточек товаров
import { getCardViewMode, setCardViewMode, toggleCardViewMode, VIEW_MODES } from '../utils/cardViewToggle.js';

let productsGridElement = null;

/**
 * Инициализация обработчика переключения вида
 * @param {HTMLElement} button - Кнопка переключения
 * @param {HTMLElement} grid - Элемент сетки товаров
 */
export function initCardViewToggle(button, grid) {
    if (!button || !grid) {
        console.error('Card view toggle: button or grid element not found');
        return;
    }
    
    productsGridElement = grid;
    
    // Устанавливаем начальный вид
    applyViewMode(getCardViewMode());
    
    // Обработчик клика на кнопку
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        const newMode = toggleCardViewMode();
        applyViewMode(newMode);
    });
    
    // Обработчик события изменения режима (из других мест)
    window.addEventListener('cardViewModeChanged', (e) => {
        applyViewMode(e.detail);
    });
}

/**
 * Применить режим отображения к сетке товаров
 * @param {string} mode - 'grid' или 'list'
 */
function applyViewMode(mode) {
    if (!productsGridElement) return;
    
    if (mode === VIEW_MODES.LIST) {
        productsGridElement.classList.add('products-list-view');
        productsGridElement.classList.remove('products-grid-view');
    } else {
        productsGridElement.classList.add('products-grid-view');
        productsGridElement.classList.remove('products-list-view');
    }
    
    // Сохраняем класс для CSS
    productsGridElement.setAttribute('data-view-mode', mode);
}

