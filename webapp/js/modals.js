// Модуль для настройки модальных окон
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { resetOrderForm, showOrderStep } from './orders.js';
import { closeProductPage } from './handlers/products_modal.js';

// Зависимости, которые будут переданы из app.js
let modalElement = null; // DOM элемент модального окна товара
let modalCloseElement = null; // DOM элемент кнопки закрытия модального окна товара
let reservationModalElement = null; // DOM элемент модального окна резервации
let reservationCloseElement = null; // DOM элемент кнопки закрытия модального окна резервации
let orderModalElement = null; // DOM элемент модального окна заказа
let orderCloseElement = null; // DOM элемент кнопки закрытия модального окна заказа
let sellModalElement = null; // DOM элемент модального окна продажи
let sellCloseElement = null; // DOM элемент кнопки закрытия модального окна продажи

// Геттеры/сеттеры для переменных состояния модального окна товара
let currentImagesGetter = null;
let currentImagesSetter = null;
let currentImageIndexGetter = null;
let currentImageIndexSetter = null;
let currentProductGetter = null;
let currentProductSetter = null;
let currentImageLoadIdGetter = null;
let currentImageLoadIdSetter = null;

// Инициализация зависимостей
export function initModalsDependencies(dependencies) {
    modalElement = dependencies.modal;
    modalCloseElement = dependencies.modalClose;
    reservationModalElement = dependencies.reservationModal;
    reservationCloseElement = dependencies.reservationClose;
    orderModalElement = dependencies.orderModal;
    orderCloseElement = dependencies.orderClose;
    sellModalElement = dependencies.sellModal;
    sellCloseElement = dependencies.sellClose;
    
    // Геттеры/сеттеры для переменных состояния
    currentImagesGetter = dependencies.currentImagesGetter;
    currentImagesSetter = dependencies.currentImagesSetter;
    currentImageIndexGetter = dependencies.currentImageIndexGetter;
    currentImageIndexSetter = dependencies.currentImageIndexSetter;
    currentProductGetter = dependencies.currentProductGetter;
    currentProductSetter = dependencies.currentProductSetter;
    currentImageLoadIdGetter = dependencies.currentImageLoadIdGetter;
    currentImageLoadIdSetter = dependencies.currentImageLoadIdSetter;
}

// Настройка модальных окон
export function setupModals() {
    // Функция для очистки состояния модального окна товара
    const cleanupProductModal = () => {
        console.log('[MODAL] cleanupProductModal called');
        const modalImage = document.getElementById('modal-image');
        if (modalImage) {
            // Очищаем blob URL если был
            const oldBlobUrl = modalImage.dataset.blobUrl;
            if (oldBlobUrl) {
                URL.revokeObjectURL(oldBlobUrl);
                delete modalImage.dataset.blobUrl;
            }
            // Очищаем навигацию
            const oldNav = modalImage.querySelector('.image-navigation');
            if (oldNav) {
                oldNav.remove();
            }
            // Полностью очищаем содержимое
            modalImage.innerHTML = '';
        }
        // Сбрасываем состояние через сеттеры
        if (currentImagesSetter) currentImagesSetter([]);
        if (currentImageIndexSetter) currentImageIndexSetter(0);
        if (currentProductSetter) currentProductSetter(null);
        if (currentImageLoadIdSetter) currentImageLoadIdSetter(0); // Сбрасываем ID загрузки
        console.log('[MODAL] State cleared');
    };
    
    // Закрытие модального окна товара
    if (modalCloseElement) {
        modalCloseElement.onclick = () => {
            cleanupProductModal();
            if (modalElement) {
                modalElement.classList.remove('is-open');
                modalElement.style.display = 'none';
            }
            document.body.style.overflow = 'auto';
        };
    }
    
    if (modalElement) {
        modalElement.onclick = (e) => {
            if (e.target === modalElement) {
                cleanupProductModal();
                if (modalElement) modalElement.classList.remove('is-open');
                modalElement.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        };
    }
    
    // Закрытие модального окна резервации
    if (reservationCloseElement) {
        reservationCloseElement.onclick = () => {
            if (reservationModalElement) {
                reservationModalElement.classList.remove('is-open');
                reservationModalElement.style.display = 'none';
            }
        };
    }
    
    if (reservationModalElement) {
        reservationModalElement.onclick = (e) => {
            if (e.target === reservationModalElement) {
                reservationModalElement.classList.remove('is-open');
                reservationModalElement.style.display = 'none';
            }
        };
    }
    
    // Закрытие модального окна заказа
    if (orderCloseElement) {
        orderCloseElement.onclick = () => {
            if (orderModalElement) {
                orderModalElement.classList.remove('is-open');
                orderModalElement.style.display = 'none';
            }
            resetOrderForm();
            showOrderStep(1);
            if (orderModalElement) {
                orderModalElement.classList.remove('is-open');
                orderModalElement.style.display = 'none';
            }
        };
    }
    
    if (orderModalElement) {
        orderModalElement.onclick = (e) => {
            if (e.target === orderModalElement) {
                orderModalElement.classList.remove('is-open');
                orderModalElement.style.display = 'none';
                resetOrderForm();
                showOrderStep(1);
            }
        };
    }
    
    // Закрытие модального окна продажи (этап 4: снять .is-open)
    if (sellCloseElement) {
        sellCloseElement.onclick = () => {
            if (sellModalElement) {
                sellModalElement.classList.remove('is-open');
                sellModalElement.style.display = 'none';
            }
        };
    }
    
    if (sellModalElement) {
        sellModalElement.onclick = (e) => {
            if (e.target === sellModalElement) {
                sellModalElement.classList.remove('is-open');
                sellModalElement.style.display = 'none';
            }
        };
    }
    
    // Закрытие модального окна редактирования товара (этап 4: снять .is-open)
    const editProductModal = document.getElementById('edit-product-modal');
    const editProductClose = document.querySelector('.edit-product-close');
    if (editProductClose) {
        editProductClose.onclick = () => {
            if (editProductModal) {
                editProductModal.classList.remove('is-open');
                editProductModal.style.display = 'none';
            }
        };
    }
    
    if (editProductModal) {
        editProductModal.onclick = (e) => {
            if (e.target === editProductModal) {
                editProductModal.classList.remove('is-open');
                editProductModal.style.display = 'none';
            }
        };
    }
    
    // Обработчик кнопки "назад" на странице товара (state-класс is-active, без зависимости от style.display)
    const productPageBack = document.getElementById('product-page-back');
    if (productPageBack) {
        productPageBack.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeProductPage();
        });
    }
    
    // Закрытие по Escape — проверка по is-active, т.к. style.display может быть пустым после рефакторинга
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const productPage = document.getElementById('product-page');
            if (productPage && productPage.classList.contains('is-active')) {
                closeProductPage();
            }
            const adminPage = document.getElementById('admin-page');
            if (adminPage && adminPage.classList.contains('is-active')) {
                adminPage.classList.remove('is-active');
                adminPage.style.display = 'none';
            }
            
            if (modalElement && (modalElement.style.display === 'flex' || modalElement.style.display === 'block' || modalElement.classList.contains('is-open'))) {
                modalElement.classList.remove('is-open');
                modalElement.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            if (reservationModalElement && (reservationModalElement.style.display === 'flex' || reservationModalElement.style.display === 'block' || reservationModalElement.classList.contains('is-open'))) {
                reservationModalElement.classList.remove('is-open');
                reservationModalElement.style.display = 'none';
            }
            const cartModal = document.getElementById('cart-modal');
            if (cartModal && (cartModal.style.display === 'flex' || cartModal.style.display === 'block' || cartModal.classList.contains('is-open'))) {
                cartModal.classList.remove('is-open');
                cartModal.style.display = 'none';
            }
            if (editProductModal && (editProductModal.style.display === 'flex' || editProductModal.style.display === 'block' || editProductModal.classList.contains('is-open'))) {
                editProductModal.classList.remove('is-open');
                editProductModal.style.display = 'none';
            }
            if (sellModalElement && (sellModalElement.style.display === 'flex' || sellModalElement.style.display === 'block' || sellModalElement.classList.contains('is-open'))) {
                sellModalElement.style.display = 'none';
                sellModalElement.classList.remove('is-open');
            }
            if (orderModalElement && (orderModalElement.style.display === 'flex' || orderModalElement.style.display === 'block' || orderModalElement.classList.contains('is-open'))) {
                orderModalElement.classList.remove('is-open');
                orderModalElement.style.display = 'none';
            }
        }
    });
}

// Универсальная функция для показа модального окна (этап 4: state-класс .is-open)
export function showModal(modalElement) {
    if (modalElement) {
        modalElement.classList.add('is-open');
        modalElement.style.display = 'flex';
    }
}

// Универсальная функция для скрытия модального окна (этап 4: снять .is-open)
export function hideModal(modalElement) {
    if (modalElement) {
        modalElement.classList.remove('is-open');
        modalElement.style.display = 'none';
    }
}



