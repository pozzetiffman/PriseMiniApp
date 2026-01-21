// Модуль личного кабинета пользователя
import { getMyContactInfoAPI, updateMyContactInfoAPI } from './api/clients.js';
import { getTelegramInstance, isTelegramAvailable } from './telegram.js';

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
    
    // Кнопка админки удалена - теперь есть отдельные кнопки в header
    
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
export async function openProfile() {
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
    
    // Загружаем контактную информацию из заказов/покупок
    try {
        const contactInfo = await getMyContactInfoAPI();
        displayContactInfo(contactInfo);
    } catch (error) {
        console.error('Error loading contact info:', error);
        displayContactInfo(null);
    }
    
    // Настраиваем редактирование контактных данных
    setupContactEditing();
    
    // Кнопка админки удалена - теперь есть отдельные кнопки в header
    
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
