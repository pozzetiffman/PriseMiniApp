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
    
    // Настраиваем видимость элементов меню
    const profileItem = document.getElementById('menu-item-profile');
    const settingsItem = document.getElementById('menu-item-settings');
    const adminItem = document.getElementById('menu-item-admin');
    
    if (profileItem) {
        profileItem.style.display = showProfile ? 'flex' : 'none';
    }
    
    if (settingsItem) {
        settingsItem.style.display = showSettings ? 'flex' : 'none';
    }
    
    if (adminItem) {
        adminItem.style.display = showAdmin ? 'flex' : 'none';
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
    menuDropdown.style.display = 'block';
    
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
 */
function closeMenu() {
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
