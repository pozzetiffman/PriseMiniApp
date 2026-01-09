// Модуль личного кабинета пользователя
import { getTelegramInstance, isTelegramAvailable } from './telegram.js';
import { openAdmin } from './admin.js';

let profileModal = null;

/**
 * Инициализация личного кабинета
 */
export function initProfile() {
    console.log('👤 Initializing profile panel...');
    
    profileModal = document.getElementById('profile-modal');
    
    if (!profileModal) {
        console.error('❌ Profile modal not found');
        return;
    }
    
    // Настройка закрытия модального окна
    const profileClose = document.querySelector('.profile-close');
    if (profileClose) {
        profileClose.onclick = () => {
            profileModal.style.display = 'none';
        };
    }
    
    // Закрытие при клике вне модального окна
    profileModal.onclick = (e) => {
        if (e.target === profileModal) {
            profileModal.style.display = 'none';
        }
    };
    
    // Обработчик кнопки админки для владельцев магазинов
    const adminButton = document.getElementById('profile-admin-button');
    if (adminButton) {
        adminButton.onclick = () => {
            profileModal.style.display = 'none';
            openAdmin();
        };
    }
    
    console.log('✅ Profile panel initialized');
}

/**
 * Настройка кнопки профиля
 */
export function setupProfileButton() {
    const profileButton = document.getElementById('profile-button');
    if (profileButton) {
        profileButton.style.display = 'block';
        profileButton.onclick = () => {
            openProfile();
        };
        console.log('✅ Profile button set up');
    } else {
        console.error('❌ Profile button not found');
    }
}

/**
 * Открытие личного кабинета
 */
export function openProfile() {
    if (!profileModal) {
        console.error('❌ Profile modal not initialized');
        return;
    }
    
    // Получаем данные пользователя из Telegram
    const userData = getUserDataFromTelegram();
    
    if (userData) {
        displayUserData(userData);
    } else {
        console.warn('⚠️ User data not available');
        displayUserData(null);
    }
    
    // Проверяем, является ли пользователь владельцем магазина
    const appContext = window.getAppContext ? window.getAppContext() : null;
    const isOwner = appContext && appContext.role === 'owner';
    
    // Показываем/скрываем кнопку админки для владельцев
    const adminButton = document.getElementById('profile-admin-button');
    if (adminButton) {
        adminButton.style.display = isOwner ? 'block' : 'none';
    }
    
    profileModal.style.display = 'flex';
}

/**
 * Получение данных пользователя из Telegram WebApp API
 * @returns {Object|null} Данные пользователя или null
 */
function getUserDataFromTelegram() {
    if (!isTelegramAvailable()) {
        console.warn('⚠️ Telegram WebApp not available');
        return null;
    }
    
    const tg = getTelegramInstance();
    
    // Получаем данные пользователя из initDataUnsafe
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        return tg.initDataUnsafe.user;
    }
    
    console.warn('⚠️ User data not found in Telegram WebApp');
    return null;
}

/**
 * Отображение данных пользователя в модальном окне
 * @param {Object|null} userData - Данные пользователя
 */
function displayUserData(userData) {
    if (!userData) {
        // Если данных нет, показываем заглушку
        document.getElementById('profile-first-name').textContent = '—';
        document.getElementById('profile-last-name').textContent = '—';
        document.getElementById('profile-username').textContent = '—';
        document.getElementById('profile-user-id').textContent = '—';
        document.getElementById('profile-language').textContent = '—';
        
        const avatarImg = document.getElementById('profile-avatar');
        const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
        return;
    }
    
    // Отображаем имя
    const firstName = userData.first_name || '—';
    document.getElementById('profile-first-name').textContent = firstName;
    
    // Отображаем фамилию
    const lastName = userData.last_name || '—';
    document.getElementById('profile-last-name').textContent = lastName;
    
    // Отображаем username
    const username = userData.username ? `@${userData.username}` : '—';
    document.getElementById('profile-username').textContent = username;
    
    // Отображаем ID пользователя
    const userId = userData.id ? userData.id.toString() : '—';
    document.getElementById('profile-user-id').textContent = userId;
    
    // Отображаем язык
    const language = userData.language_code || '—';
    document.getElementById('profile-language').textContent = language;
    
    // Отображаем аватар, если доступен
    const avatarImg = document.getElementById('profile-avatar');
    const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
    
    if (userData.photo_url && avatarImg) {
        avatarImg.src = userData.photo_url;
        avatarImg.style.display = 'block';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
    } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
    }
}

