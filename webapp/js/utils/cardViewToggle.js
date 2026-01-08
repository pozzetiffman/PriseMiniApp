// Модуль для переключения вида карточек товаров (grid/list)
// Хранит предпочтение в localStorage

const STORAGE_KEY = 'productCardViewMode';
const VIEW_MODES = {
    GRID: 'grid',
    LIST: 'list'
};

/**
 * Получить текущий режим отображения
 * @returns {string} 'grid' или 'list'
 */
export function getCardViewMode() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === VIEW_MODES.LIST || stored === VIEW_MODES.GRID) {
            return stored;
        }
    } catch (e) {
        console.error('Error loading card view mode:', e);
    }
    return VIEW_MODES.GRID; // По умолчанию сетка
}

/**
 * Установить режим отображения
 * @param {string} mode - 'grid' или 'list'
 */
export function setCardViewMode(mode) {
    if (mode !== VIEW_MODES.GRID && mode !== VIEW_MODES.LIST) {
        console.error('Invalid view mode:', mode);
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEY, mode);
        // Вызываем событие для обновления вида
        window.dispatchEvent(new CustomEvent('cardViewModeChanged', { detail: mode }));
    } catch (e) {
        console.error('Error saving card view mode:', e);
    }
}

/**
 * Переключить режим отображения
 * @returns {string} Новый режим
 */
export function toggleCardViewMode() {
    const currentMode = getCardViewMode();
    const newMode = currentMode === VIEW_MODES.GRID ? VIEW_MODES.LIST : VIEW_MODES.GRID;
    setCardViewMode(newMode);
    return newMode;
}

export { VIEW_MODES };

