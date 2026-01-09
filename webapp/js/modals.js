// Модуль для настройки модальных окон
// Вынесено из app.js для рефакторинга

// Импорты зависимостей
import { resetOrderForm, showOrderStep } from './orders.js';

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
                modalElement.style.display = 'none';
            }
            document.body.style.overflow = 'auto';
        };
    }
    
    if (modalElement) {
        modalElement.onclick = (e) => {
            if (e.target === modalElement) {
                cleanupProductModal();
                modalElement.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        };
    }
    
    // Закрытие модального окна резервации
    if (reservationCloseElement) {
        reservationCloseElement.onclick = () => {
            if (reservationModalElement) {
                reservationModalElement.style.display = 'none';
            }
        };
    }
    
    if (reservationModalElement) {
        reservationModalElement.onclick = (e) => {
            if (e.target === reservationModalElement) {
                reservationModalElement.style.display = 'none';
            }
        };
    }
    
    // Закрытие модального окна заказа
    if (orderCloseElement) {
        orderCloseElement.onclick = () => {
            if (orderModalElement) {
                orderModalElement.style.display = 'none';
            }
            resetOrderForm();
            showOrderStep(1);
            if (orderModalElement) {
                orderModalElement.style.display = 'none';
            }
        };
    }
    
    if (orderModalElement) {
        orderModalElement.onclick = (e) => {
            if (e.target === orderModalElement) {
                orderModalElement.style.display = 'none';
                resetOrderForm();
                showOrderStep(1);
            }
        };
    }
    
    // Закрытие модального окна продажи
    if (sellCloseElement) {
        sellCloseElement.onclick = () => {
            if (sellModalElement) {
                sellModalElement.style.display = 'none';
            }
        };
    }
    
    if (sellModalElement) {
        sellModalElement.onclick = (e) => {
            if (e.target === sellModalElement) {
                sellModalElement.style.display = 'none';
            }
        };
    }
    
    // Закрытие модального окна редактирования товара
    const editProductModal = document.getElementById('edit-product-modal');
    const editProductClose = document.querySelector('.edit-product-close');
    if (editProductClose) {
        editProductClose.onclick = () => {
            if (editProductModal) {
                editProductModal.style.display = 'none';
            }
        };
    }
    
    if (editProductModal) {
        editProductModal.onclick = (e) => {
            if (e.target === editProductModal) {
                editProductModal.style.display = 'none';
            }
        };
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalElement && (modalElement.style.display === 'flex' || modalElement.style.display === 'block')) {
                modalElement.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
            if (reservationModalElement && (reservationModalElement.style.display === 'flex' || reservationModalElement.style.display === 'block')) {
                reservationModalElement.style.display = 'none';
            }
            const cartModal = document.getElementById('cart-modal');
            if (cartModal && (cartModal.style.display === 'flex' || cartModal.style.display === 'block')) {
                cartModal.style.display = 'none';
            }
            const adminModal = document.getElementById('admin-modal');
            if (adminModal && (adminModal.style.display === 'flex' || adminModal.style.display === 'block')) {
                adminModal.style.display = 'none';
            }
            if (editProductModal && (editProductModal.style.display === 'flex' || editProductModal.style.display === 'block')) {
                editProductModal.style.display = 'none';
            }
            if (sellModalElement && (sellModalElement.style.display === 'flex' || sellModalElement.style.display === 'block')) {
                sellModalElement.style.display = 'none';
            }
            if (orderModalElement && (orderModalElement.style.display === 'flex' || orderModalElement.style.display === 'block')) {
                orderModalElement.style.display = 'none';
            }
        }
    });
}

// Универсальная функция для показа модального окна
export function showModal(modalElement) {
    if (modalElement) {
        modalElement.style.display = 'flex';
    }
}

// Универсальная функция для скрытия модального окна
export function hideModal(modalElement) {
    if (modalElement) {
        modalElement.style.display = 'none';
    }
}



