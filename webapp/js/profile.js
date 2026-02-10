// Модуль личного кабинета пользователя
import { updateActivityCounts } from './activityIndicators.js';
import { getMyContactInfoAPI, updateMyContactInfoAPI } from './api/clients.js';
import { clearOverlaysAndBodyClasses, goToMainContent, hideAllPages } from './operationsBase.js';
import { openOrdersPage } from './operationsOrders.js';
import { openPurchasesPage } from './operationsPurchases.js';
import { openReservationsPage } from './operationsReservations.js';
import { openSaleOrdersPage } from './operationsSaleOrders.js';
import { getTelegramInstance, isTelegramAvailable } from './telegram.js';

let profilePage = null;
let profileDetailsPage = null;

/**
 * Инициализация личного кабинета
 */
export function initProfile() {
    console.log('👤 Initializing profile page...');
    
    profilePage = document.getElementById('profile-page');
    profileDetailsPage = document.getElementById('profile-details-page');
    
    if (!profilePage) {
        console.error('❌ Profile page not found');
        return;
    }
    
    // Кнопка закрытия профиля — вешаем один раз при init (data-bound защита от повторной навески)
    const profilePageClose = document.getElementById('profile-page-close');
    if (profilePageClose && !profilePageClose.dataset.bound) {
        profilePageClose.dataset.bound = '1';
        profilePageClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeProfilePage();
        });
    }
    
    // Кнопка перехода к контактной информации
    const profileContactInfoBtn = document.getElementById('profile-contact-info-btn');
    if (profileContactInfoBtn) {
        profileContactInfoBtn.onclick = () => openProfileDetailsPage();
    }
    
    // Кнопка «Назад» на странице контактной информации
    const profileDetailsClose = document.getElementById('profile-details-page-close');
    if (profileDetailsClose && profileDetailsPage) {
        profileDetailsClose.onclick = (e) => {
            e.preventDefault();
            closeProfileDetailsPage();
        };
    }
    
    // Редактирование контактных данных (поля на profile-details-page) — один раз при загрузке
    setupContactEditing();
    
    // Один обработчик на контейнер профиля: делегирование для «Мои операции» (кнопки остаются рабочими после возврата со сделки)
    if (profilePage) {
        profilePage.addEventListener('click', handleProfileOperationClick);
    }
    
    console.log('✅ Profile page initialized');
}

/**
 * Обработчик клика по кнопкам «Мои операции» (event delegation).
 * Срабатывает по data-type у .profile-operation-card, не зависит от перерисовки DOM.
 */
function handleProfileOperationClick(e) {
    const btn = e.target.closest('.profile-operation-card[data-type]');
    if (!btn) return;
    const type = btn.dataset.type;
    if (!type) return;
    switch (type) {
        case 'orders':
            openOrdersPage();
            break;
        case 'reservations':
            openReservationsPage();
            break;
        case 'purchases':
            openPurchasesPage();
            break;
        case 'sale-orders':
            openSaleOrdersPage();
            break;
        default:
            break;
    }
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
export async function openProfile() {
    if (!profilePage) {
        console.error('❌ Profile page not initialized');
        return;
    }
    
    // Единый способ: скрыть все страницы, затем показать профиль
    hideAllPages();
    clearOverlaysAndBodyClasses();
    profilePage.classList.add('is-active');
    profilePage.style.display = 'block';
    
    // Сбрасываем позицию скролла
    profilePage.scrollTop = 0;
    if (profilePage.scrollTo) {
        profilePage.scrollTo(0, 0);
    }
    
    // Получаем данные пользователя из Telegram
    const userData = getUserDataFromTelegram();
    
    if (userData) {
        displayUserData(userData);
    } else {
        console.warn('⚠️ User data not available');
        displayUserData(null);
    }
    
    // Обновляем индикаторы активности
    await updateActivityCounts();
    
    // Обработчик скролла для появления фона меню
    const profileTopMenu = document.querySelector('.profile-new-top-menu');
    let scrollHandler = null;
    
    if (profileTopMenu) {
        scrollHandler = () => {
            const scrollTop = profilePage.scrollTop || 0;
            if (scrollTop > 20) {
                profileTopMenu.classList.add('scrolled');
            } else {
                profileTopMenu.classList.remove('scrolled');
            }
        };
        
        profilePage.addEventListener('scroll', scrollHandler, { passive: true });
        setTimeout(() => {
            scrollHandler();
        }, 0);
    }
    
    // Сохраняем обработчик для удаления при закрытии
    window.profilePageScrollHandler = scrollHandler;
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
    const greetingEl = document.getElementById('profile-greeting');
    const avatarImg = document.getElementById('profile-avatar');
    const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
    const firstNameEl = document.getElementById('profile-first-name');
    const lastNameEl = document.getElementById('profile-last-name');
    const usernameEl = document.getElementById('profile-username');
    const userIdEl = document.getElementById('profile-user-id');
    const languageEl = document.getElementById('profile-language');
    
    if (!userData) {
        if (greetingEl) greetingEl.textContent = '—';
        if (firstNameEl) firstNameEl.textContent = '—';
        if (lastNameEl) lastNameEl.textContent = '—';
        if (usernameEl) usernameEl.textContent = '—';
        if (userIdEl) userIdEl.textContent = '—';
        if (languageEl) languageEl.textContent = '—';
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
        return;
    }
    
    const firstName = userData.first_name || '—';
    const lastName = userData.last_name || '—';
    const username = userData.username ? `@${userData.username}` : '—';
    const userId = userData.id ? userData.id.toString() : '—';
    const language = userData.language_code || '—';
    
    if (greetingEl) greetingEl.textContent = `Привет, ${userData.first_name || 'Пользователь'}!`;
    if (firstNameEl) firstNameEl.textContent = firstName;
    if (lastNameEl) lastNameEl.textContent = lastName;
    if (usernameEl) usernameEl.textContent = username;
    if (userIdEl) userIdEl.textContent = userId;
    if (languageEl) languageEl.textContent = language;
    
    if (userData.photo_url && avatarImg) {
        avatarImg.src = userData.photo_url;
        avatarImg.style.display = 'block';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
    } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
    }
}

/**
 * Отображение контактной информации пользователя
 * @param {Object|null} contactInfo - Контактная информация из заказов/покупок
 */
function displayContactInfo(contactInfo) {
    if (!contactInfo) {
        // Если данных нет, очищаем поля
        const lastNameEl = document.getElementById('profile-contact-last-name');
        const firstNameEl = document.getElementById('profile-contact-first-name');
        const middleNameEl = document.getElementById('profile-contact-middle-name');
        const phoneCountryCodeEl = document.getElementById('profile-contact-phone-country-code');
        const phoneNumberEl = document.getElementById('profile-contact-phone-number');
        const emailEl = document.getElementById('profile-contact-email');
        const cityEl = document.getElementById('profile-contact-city');
        const addressEl = document.getElementById('profile-contact-address');
        
        if (lastNameEl) lastNameEl.value = '';
        if (firstNameEl) firstNameEl.value = '';
        if (middleNameEl) middleNameEl.value = '';
        if (phoneCountryCodeEl) phoneCountryCodeEl.value = '+7';
        if (phoneNumberEl) phoneNumberEl.value = '';
        if (emailEl) emailEl.value = '';
        if (cityEl) cityEl.value = '';
        if (addressEl) addressEl.value = '';
        return;
    }
    
    // Заполняем поля
    const lastNameEl = document.getElementById('profile-contact-last-name');
    const firstNameEl = document.getElementById('profile-contact-first-name');
    const middleNameEl = document.getElementById('profile-contact-middle-name');
    const phoneCountryCodeEl = document.getElementById('profile-contact-phone-country-code');
    const phoneNumberEl = document.getElementById('profile-contact-phone-number');
    const emailEl = document.getElementById('profile-contact-email');
    const cityEl = document.getElementById('profile-contact-city');
    const addressEl = document.getElementById('profile-contact-address');
    
    if (lastNameEl) lastNameEl.value = contactInfo.last_name || '';
    if (firstNameEl) firstNameEl.value = contactInfo.first_name || '';
    if (middleNameEl) middleNameEl.value = contactInfo.middle_name || '';
    if (phoneCountryCodeEl) phoneCountryCodeEl.value = contactInfo.phone_country_code || '+7';
    if (phoneNumberEl) phoneNumberEl.value = contactInfo.phone_number || '';
    if (emailEl) emailEl.value = contactInfo.email || '';
    if (cityEl) cityEl.value = contactInfo.city || '';
    if (addressEl) addressEl.value = contactInfo.address || '';
}

/**
 * Заполнение профильного блока на странице «Контактная информация»:
 * аватар слева, имя, @username, ссылка «Открыть профиль».
 * @param {Object|null} userData - Данные пользователя из Telegram
 */
function displayProfileBlock(userData) {
    const avatarImg = document.getElementById('profile-details-avatar');
    const avatarPlaceholder = document.getElementById('profile-details-avatar-placeholder');
    const displayNameEl = document.getElementById('profile-details-display-name');
    const usernameEl = document.getElementById('profile-details-username');
    const openProfileLink = document.getElementById('profile-details-open-profile-link');
    
    if (!userData) {
        if (displayNameEl) displayNameEl.textContent = '—';
        if (usernameEl) usernameEl.textContent = '—';
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
        if (openProfileLink) {
            openProfileLink.href = '#';
            openProfileLink.style.display = 'none';
        }
        return;
    }
    
    const displayName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || '—';
    const username = userData.username ? `@${userData.username}` : '—';
    
    if (displayNameEl) displayNameEl.textContent = displayName;
    if (usernameEl) usernameEl.textContent = username;
    
    if (userData.photo_url && avatarImg) {
        avatarImg.src = userData.photo_url;
        avatarImg.alt = displayName;
        avatarImg.style.display = 'block';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
    } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
    }
    
    if (openProfileLink && userData.username) {
        const telegramUrl = `https://t.me/${userData.username}`;
        openProfileLink.href = telegramUrl;
        openProfileLink.style.display = 'inline-block';
        openProfileLink.onclick = (e) => {
            e.preventDefault();
            const webApp = getTelegramInstance();
            if (webApp && typeof webApp.openTelegramLink === 'function') {
                webApp.openTelegramLink(telegramUrl);
            } else if (webApp && typeof webApp.openLink === 'function') {
                webApp.openLink(telegramUrl);
            } else {
                window.open(telegramUrl, '_blank');
            }
        };
    } else if (openProfileLink) {
        openProfileLink.href = '#';
        openProfileLink.style.display = 'none';
    }
}

/**
 * Открытие страницы «Контактная информация».
 * Не использует history браузера.
 */
export async function openProfileDetailsPage() {
    if (!profileDetailsPage) {
        profileDetailsPage = document.getElementById('profile-details-page');
    }
    if (!profileDetailsPage) {
        console.error('❌ Profile details page not found');
        return;
    }
    
    hideAllPages();
    profileDetailsPage.classList.add('is-active');
    profileDetailsPage.style.display = 'block';
    profileDetailsPage.scrollTop = 0;
    if (profileDetailsPage.scrollTo) {
        profileDetailsPage.scrollTo(0, 0);
    }
    
    const userData = getUserDataFromTelegram();
    displayProfileBlock(userData);
    displayUserData(userData);
    
    try {
        const contactInfo = await getMyContactInfoAPI();
        displayContactInfo(contactInfo);
    } catch (error) {
        console.error('Error loading contact info:', error);
        displayContactInfo(null);
    }
    
    const topMenu = profileDetailsPage.querySelector('.operation-top-menu');
    let scrollHandler = null;
    if (topMenu) {
        scrollHandler = () => {
            const scrollTop = profileDetailsPage.scrollTop || 0;
            if (scrollTop > 20) {
                topMenu.classList.add('scrolled');
            } else {
                topMenu.classList.remove('scrolled');
            }
        };
        profileDetailsPage.addEventListener('scroll', scrollHandler, { passive: true });
        setTimeout(scrollHandler, 0);
    }
    window.profileDetailsPageScrollHandler = scrollHandler;
}

/**
 * Закрытие страницы «Контактная информация», возврат в личный кабинет.
 * Сначала снимаем is-active и скрываем (state-класс после батча #2), затем показываем profile-page.
 */
export function closeProfileDetailsPage() {
    if (!profileDetailsPage) {
        profileDetailsPage = document.getElementById('profile-details-page');
    }
    if (!profileDetailsPage) return;
    
    profileDetailsPage.classList.remove('is-active');
    profileDetailsPage.style.display = 'none';
    const topMenu = profileDetailsPage.querySelector('.operation-top-menu');
    if (topMenu && window.profileDetailsPageScrollHandler) {
        profileDetailsPage.removeEventListener('scroll', window.profileDetailsPageScrollHandler);
        topMenu.classList.remove('scrolled');
        window.profileDetailsPageScrollHandler = null;
    }
    if (profilePage) {
        profilePage.classList.add('is-active');
        profilePage.style.display = 'block';
    }
}

/**
 * Настройка навигации к страницам операций (оставлено для совместимости).
 * Обработчики «Мои операции» вешаются через делегирование в initProfile (handleProfileOperationClick).
 */
function setupOperationsNavigation() {
    // Пусто: клики обрабатываются через делегирование на profilePage
}

/**
 * Настройка обработчиков для редактирования контактных данных
 */
function setupContactEditing() {
    const saveBtn = document.getElementById('profile-contact-save-btn');
    const editableFields = document.querySelectorAll('.profile-value-editable');
    
    // Показываем кнопку сохранения при изменении любого поля
    editableFields.forEach(field => {
        field.addEventListener('input', () => {
            if (saveBtn) {
                saveBtn.style.display = 'block';
            }
        });
    });
    
    // Обработчик сохранения
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            await saveContactInfo();
        });
    }
}

/**
 * Сохранение контактной информации
 */
async function saveContactInfo() {
    const saveBtn = document.getElementById('profile-contact-save-btn');
    
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '💾 Сохранение...';
    }
    
    try {
        // Собираем данные из полей
        const phoneNumber = document.getElementById('profile-contact-phone-number').value.trim();
        const phone = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;
        
        const contactData = {
            first_name: document.getElementById('profile-contact-first-name').value.trim() || null,
            last_name: document.getElementById('profile-contact-last-name').value.trim() || null,
            middle_name: document.getElementById('profile-contact-middle-name').value.trim() || null,
            phone_country_code: document.getElementById('profile-contact-phone-country-code').value || null,
            phone_number: phone || null,
            email: document.getElementById('profile-contact-email').value.trim() || null,
            city: document.getElementById('profile-contact-city').value.trim() || null,
            address: document.getElementById('profile-contact-address').value.trim() || null
        };
        
        // Преобразуем пустые строки в null
        if (contactData.city === '') contactData.city = null;
        if (contactData.address === '') contactData.address = null;
        
        // Удаляем пустые поля, но оставляем city и address
        Object.keys(contactData).forEach(key => {
            if (key !== 'city' && key !== 'address' && (contactData[key] === null || contactData[key] === '')) {
                delete contactData[key];
            }
        });
        
        // Валидация email
        if (contactData.email) {
            const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailPattern.test(contactData.email)) {
                alert('Некорректный формат email');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = '💾 Сохранить';
                }
                return;
            }
        }
        
        // Валидация телефона
        if (phone && phone.length < 10) {
            alert('Номер телефона должен содержать минимум 10 цифр');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Сохранить';
            }
            return;
        }
        
        // Отправляем данные
        await updateMyContactInfoAPI(contactData);
        
        // Скрываем кнопку сохранения
        if (saveBtn) {
            saveBtn.style.display = 'none';
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Сохранить';
        }
        
        // Показываем уведомление об успехе
        showNotification('Контактные данные сохранены', 'success');
        
    } catch (error) {
        console.error('Error saving contact info:', error);
        alert('Ошибка при сохранении: ' + error.message);
        
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Сохранить';
        }
    }
}

/**
 * Показать уведомление (используем существующую функцию или создаем простую)
 */
function showNotification(message, type) {
    // Ищем существующую функцию showNotification или создаем простую
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        // Простое уведомление через alert
        alert(message);
    }
}

/**
 * Закрытие страницы профиля. Сначала снимаем is-active (чтобы не оставался пустой экран), затем goToMainContent().
 */
export function closeProfilePage() {
    console.log('[PROFILE PAGE] Closing profile page');
    if (!profilePage) return;

    profilePage.classList.remove('is-active');
    profilePage.style.display = 'none';
    const profileTopMenu = document.querySelector('.profile-new-top-menu');
    if (profileTopMenu && window.profilePageScrollHandler) {
        profilePage.removeEventListener('scroll', window.profilePageScrollHandler);
        profileTopMenu.classList.remove('scrolled');
        window.profilePageScrollHandler = null;
    }
    goToMainContent();

    // Обновляем индикаторы активности при закрытии профиля
    // (чтобы отразить возможные изменения после просмотра операций)
    updateActivityCounts().catch(err => {
        console.error('❌ Error updating activity counts on profile close:', err);
    });
}
