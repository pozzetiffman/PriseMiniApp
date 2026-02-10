// Модуль главного меню с выпадающим списком
import { openProfile } from './profile.js';
import { openSettingsPage } from './handlers/admin_settings_modal.js';
import { openAdmin } from './admin.js';

let menuOpen = false;
let menuButton = null;
let menuDropdown = null;
let menuBackdrop = null;
let menuContent = null;
let line1 = null;
let line2 = null;

/**
 * Инициализация главного меню
 */
export function initMainMenu() {
    console.log('🍔 Initializing main menu...');
    
    menuButton = document.getElementById('main-menu-button');
    menuDropdown = document.getElementById('main-menu-dropdown');
    
    if (!menuButton || !menuDropdown) {
        console.error('❌ Main menu elements not found');
        return;
    }
    
    menuBackdrop = menuDropdown.querySelector('.main-menu-dropdown-backdrop');
    menuContent = menuDropdown.querySelector('.main-menu-dropdown-content');
    line1 = document.getElementById('menu-line-1');
    line2 = document.getElementById('menu-line-2');
    
    // Обработчик клика на кнопку меню
    menuButton.addEventListener('click', toggleMenu);
    
    // Закрытие меню при клике на backdrop или вне меню
    if (menuBackdrop) {
        menuBackdrop.addEventListener('click', closeMenu);
    }
    
    // Закрытие меню при клике на сам dropdown (но не на content)
    menuDropdown.addEventListener('click', (e) => {
        if (e.target === menuDropdown || e.target === menuBackdrop) {
            closeMenu();
        }
    });
    
    // Обработчики для элементов меню
    const profileItem = document.getElementById('menu-item-profile');
    const settingsItem = document.getElementById('menu-item-settings');
    const adminItem = document.getElementById('menu-item-admin');
    
    if (profileItem) {
        profileItem.addEventListener('click', () => {
            closeMenu();
            openProfile();
        });
    }
    
    if (settingsItem) {
        settingsItem.addEventListener('click', () => {
            closeMenu();
            openSettingsPage();
        });
    }
    
    if (adminItem) {
        adminItem.addEventListener('click', () => {
            closeMenu();
            openAdmin();
        });
    }
    
    console.log('✅ Main menu initialized');
}

/**
 * Показать кнопку меню и настроить видимость элементов
 */
export function setupMainMenuButton(showProfile = false, showSettings = false, showAdmin = false) {
    if (!menuButton) return;
    
    // Показываем кнопку меню, если есть хотя бы один элемент
    if (showProfile || showSettings || showAdmin) {
        menuButton.style.display = 'grid';
    } else {
        menuButton.style.display = 'none';
    }
    
    // Настраиваем видимость элементов меню (класс .is-hidden вместо только inline style)
    const profileItem = document.getElementById('menu-item-profile');
    const settingsItem = document.getElementById('menu-item-settings');
    const adminItem = document.getElementById('menu-item-admin');
    
    if (profileItem) {
        if (showProfile) {
            profileItem.classList.remove('is-hidden');
            profileItem.style.display = 'flex';
        } else {
            profileItem.classList.add('is-hidden');
            profileItem.style.display = 'none';
        }
    }
    
    if (settingsItem) {
        if (showSettings) {
            settingsItem.classList.remove('is-hidden');
            settingsItem.style.display = 'flex';
        } else {
            settingsItem.classList.add('is-hidden');
            settingsItem.style.display = 'none';
        }
    }
    
    if (adminItem) {
        if (showAdmin) {
            adminItem.classList.remove('is-hidden');
            adminItem.style.display = 'flex';
        } else {
            adminItem.classList.add('is-hidden');
            adminItem.style.display = 'none';
        }
    }
}

/**
 * Переключение состояния меню
 */
function toggleMenu() {
    if (menuOpen) {
        closeMenu();
    } else {
        openMenu();
    }
}

/**
 * Открытие меню
 */
function openMenu() {
    if (!menuDropdown || !line1 || !line2) return;
    
    menuOpen = true;
    // Устанавливаем display: block и гарантируем правильный z-index через inline стили
    // (CSS селектор [style*="display: block"] должен сработать, но на всякий случай явно задаем z-index)
    menuDropdown.style.display = 'block';
    // НЕ задаем z-index через inline стили - пусть CSS правило с !important работает
    // Это гарантирует, что меню всегда будет выше страниц (z-index: 1000)
    
    // КРИТИЧНО: Убеждаемся, что backdrop имеет правильные стили
    // Удаляем все inline стили с backdrop, чтобы CSS правила с !important работали правильно
    if (menuBackdrop) {
        // Удаляем все inline стили, которые могли быть установлены где-то еще
        menuBackdrop.style.pointerEvents = '';
        menuBackdrop.style.opacity = '';
        menuBackdrop.style.display = '';
        // CSS правила с !important должны установить правильные значения:
        // - opacity: 1 !important (из правила для открытого меню)
        // - pointer-events: auto !important (из правила для открытого меню)
    }
    
    // Обновляем индикаторы активности при открытии меню
    // (чтобы всегда показывать актуальное состояние)
    import('./activityIndicators.js').then(({ updateActivityCounts }) => {
        updateActivityCounts().catch(err => {
            console.error('❌ Error updating activity counts on menu open:', err);
        });
    });
    
    // Анимация линий в крестик
    animateLine(line1,
        {x1: 5, y1: 9, x2: 19, y2: 9},
        {x1: 6, y1: 6, x2: 18, y2: 18},
        280
    );
    animateLine(line2,
        {x1: 5, y1: 15, x2: 19, y2: 15},
        {x1: 18, y1: 6, x2: 6, y2: 18},
        280
    );
}

/**
 * Закрытие меню
 * Экспортируется для использования в других модулях (например, при открытии страниц)
 */
export function closeMenu() {
    if (!menuDropdown || !line1 || !line2) return;
    
    menuOpen = false;
    menuDropdown.style.display = 'none';
    
    // Анимация линий обратно в гамбургер
    animateLine(line1,
        {x1: 6, y1: 6, x2: 18, y2: 18},
        {x1: 5, y1: 9, x2: 19, y2: 9},
        280
    );
    animateLine(line2,
        {x1: 18, y1: 6, x2: 6, y2: 18},
        {x1: 5, y1: 15, x2: 19, y2: 15},
        280
    );
}

/**
 * Анимация линии SVG
 */
function animateLine(line, from, to, duration = 280) {
    const start = performance.now();

    function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = t * (2 - t); // easeOut

        ['x1', 'y1', 'x2', 'y2'].forEach(k => {
            line.setAttribute(
                k,
                from[k] + (to[k] - from[k]) * ease
            );
        });

        if (t < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}
