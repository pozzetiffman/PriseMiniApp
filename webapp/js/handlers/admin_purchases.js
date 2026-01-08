// ========== REFACTORING STEP 7.1: loadPurchases ==========
// Модуль обработчиков покупок админки
// Дата начала: 2024-12-19
// Статус: В процессе

import { API_BASE, getAllPurchasesAPI, updatePurchaseStatusAPI } from '../api.js';
import { showNotification } from '../utils/admin_utils.js';

/**
 * Загрузка и отображение заявок на покупку
 * @param {Object} dependencies - Объект с зависимостями
 * @param {Function} dependencies.loadPurchases - Функция для рекурсивного вызова (сама себя)
 */
export async function loadPurchases(dependencies = {}) {
    const { loadPurchases: loadPurchasesRecursive } = dependencies;
    
    // Используем переданную функцию или саму себя для рекурсивных вызовов
    const loadPurchasesFn = loadPurchasesRecursive || loadPurchases;
    
    const purchasesList = document.getElementById('purchases-list');
    if (!purchasesList) return;
    
    purchasesList.innerHTML = '<p class="loading">Загрузка заявок на покупку...</p>';
    
    try {
        // Получаем shop_owner_id из глобального appContext
        let shopOwnerId = null;
        
        if (typeof window.getAppContext === 'function') {
            const context = window.getAppContext();
            if (context && context.shop_owner_id) {
                shopOwnerId = context.shop_owner_id;
            }
        }
        
        if (!shopOwnerId) {
            purchasesList.innerHTML = '<p class="loading">Ошибка: не удалось определить владельца магазина</p>';
            return;
        }
        
        const purchases = await getAllPurchasesAPI(shopOwnerId);
        
        console.log('[ADMIN PURCHASES] Loaded purchases:', purchases);
        
        if (!purchases || purchases.length === 0) {
            purchasesList.innerHTML = '<p class="loading">Заявок на покупку пока нет</p>';
            return;
        }
        
        // Рендерим список покупок
        purchasesList.innerHTML = '';
        
        purchases.forEach((purchase, purchaseIndex) => {
            console.log(`[ADMIN PURCHASES] Processing purchase ${purchaseIndex}:`, {
                id: purchase.id,
                images_urls: purchase.images_urls,
                video_url: purchase.video_url
            });
            const product = purchase.product;
            if (!product) {
                console.warn('⚠️ Purchase missing product:', purchase.id);
                return;
            }
            
            const purchaseItem = document.createElement('div');
            purchaseItem.className = 'order-item';
            purchaseItem.style.cssText = `
                background: var(--bg-glass, rgba(28, 28, 30, 0.8));
                backdrop-filter: blur(20px);
                border-radius: 12px;
                padding: 14px 16px;
                margin-bottom: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            // Заголовок с названием товара
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
            
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--tg-theme-text-color); flex: 1;';
            nameDiv.textContent = product.name || `Товар #${purchase.product_id}`;
            
            headerDiv.appendChild(nameDiv);
            
            // Информация о покупке
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
            
            // Статус
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'font-size: 14px; font-weight: 600;';
            if (purchase.is_completed) {
                statusDiv.textContent = '✅ Выполнена';
                statusDiv.style.color = '#4CAF50';
            } else if (purchase.is_cancelled) {
                statusDiv.textContent = '❌ Отменена';
                statusDiv.style.color = '#F44336';
            } else {
                statusDiv.textContent = '⏳ Ожидание';
                statusDiv.style.color = '#FFA500';
            }
            
            // Дата создания
            const dateDiv = document.createElement('div');
            dateDiv.style.cssText = 'font-size: 13px; color: var(--tg-theme-hint-color);';
            if (purchase.created_at) {
                const purchaseDate = new Date(purchase.created_at);
                dateDiv.textContent = `Дата заявки: ${purchaseDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;
            }
            
            infoDiv.appendChild(statusDiv);
            infoDiv.appendChild(dateDiv);
            
            // Детали заявки
            const detailsList = [];
            
            const createDetailItem = (label, value) => {
                const div = document.createElement('div');
                div.style.cssText = 'margin-bottom: 6px;';
                const strong = document.createElement('strong');
                strong.textContent = label + ' ';
                div.appendChild(strong);
                div.appendChild(document.createTextNode(value));
                return div;
            };
            
            if (purchase.last_name || purchase.first_name || purchase.middle_name) {
                const fullName = `${purchase.last_name || ''} ${purchase.first_name || ''} ${purchase.middle_name || ''}`.trim();
                if (fullName) {
                    detailsList.push(createDetailItem('👤 Имя:', fullName));
                }
            }
            
            if (purchase.phone_number) {
                detailsList.push(createDetailItem('📱 Телефон:', purchase.phone_number));
            }
            
            if (purchase.city) {
                detailsList.push(createDetailItem('📍 Город:', purchase.city));
            }
            
            if (purchase.address) {
                detailsList.push(createDetailItem('🏠 Адрес:', purchase.address));
            }
            
            if (purchase.payment_method) {
                const paymentText = purchase.payment_method === 'cash' ? '💵 Наличные' : '🏦 Банковский перевод';
                detailsList.push(createDetailItem('💰 Форма оплаты:', paymentText));
            }
            
            if (purchase.organization) {
                detailsList.push(createDetailItem('🏢 Организация:', purchase.organization));
            }
            
            if (purchase.notes) {
                detailsList.push(createDetailItem('📝 Примечание:', purchase.notes));
            }
            
            // Превью фото
            if (purchase.images_urls && purchase.images_urls.length > 0) {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has ${purchase.images_urls.length} images:`, purchase.images_urls);
                
                const imagesContainer = document.createElement('div');
                imagesContainer.style.cssText = 'margin-bottom: 6px;';
                
                const imagesLabel = document.createElement('strong');
                imagesLabel.textContent = '📷 Фото:';
                imagesLabel.style.cssText = 'display: block; margin-bottom: 4px;';
                imagesContainer.appendChild(imagesLabel);
                
                const imagesWrapper = document.createElement('div');
                imagesWrapper.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;';
                
                purchase.images_urls.forEach((imgUrl, index) => {
                    // Backend возвращает относительные URL (/api/images/...)
                    // Нужно добавить API_BASE для получения полного URL
                    let fullUrl = imgUrl;
                    if (imgUrl && imgUrl.startsWith('/')) {
                        // Относительный URL - добавляем API_BASE
                        fullUrl = `${API_BASE}${imgUrl}`;
                    } else if (imgUrl && !imgUrl.startsWith('http')) {
                        // URL без протокола - добавляем API_BASE
                        fullUrl = `${API_BASE}/${imgUrl}`;
                    }
                    
                    console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Loading image from: ${fullUrl} (original: ${imgUrl})`);
                    
                    const imgContainer = document.createElement('div');
                    imgContainer.style.cssText = 'width: 60px; height: 60px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; position: relative;';
                    
                    const placeholder = document.createElement('div');
                    placeholder.textContent = '⏳';
                    placeholder.style.cssText = 'font-size: 20px; color: var(--text-hint);';
                    imgContainer.appendChild(placeholder);
                    
                    // Загружаем изображение через fetch для обхода блокировки Telegram WebView (как в карточке товара)
                    fetch(fullUrl, {
                        headers: {
                            'ngrok-skip-browser-warning': '69420'
                        }
                    })
                    .then(response => {
                        console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Response status: ${response.status}, headers:`, response.headers);
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Blob created, size: ${blob.size} bytes, type: ${blob.type}`);
                        const blobUrl = URL.createObjectURL(blob);
                        const img = document.createElement('img');
                        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                        img.alt = `Фото товара ${index + 1}`;
                        
                        img.onload = () => {
                            console.log(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Image loaded successfully, dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                            // Удаляем placeholder только после успешной загрузки
                            if (placeholder.parentNode) {
                                placeholder.remove();
                            }
                        };
                        
                        img.onerror = (e) => {
                            console.error(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Image load error:`, e);
                            URL.revokeObjectURL(blobUrl);
                            placeholder.textContent = '📷';
                            placeholder.style.display = 'flex';
                            if (img.parentNode) {
                                img.remove();
                            }
                        };
                        
                        // Сначала добавляем img в контейнер, потом устанавливаем src (как в рабочем коде карточки товара)
                        imgContainer.appendChild(img);
                        // Устанавливаем src ПОСЛЕ добавления в DOM
                        img.src = blobUrl;
                    })
                    .catch(error => {
                        console.error(`[ADMIN PURCHASE ${purchase.id} IMG ${index}] Fetch error:`, error, 'URL:', fullUrl);
                        placeholder.textContent = '📷';
                        placeholder.style.display = 'flex';
                    });
                    
                    imagesWrapper.appendChild(imgContainer);
                });
                
                imagesContainer.appendChild(imagesWrapper);
                detailsList.push(imagesContainer);
            } else {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has no images_urls or empty array`);
            }
            
            // Превью видео
            if (purchase.video_url) {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has video:`, purchase.video_url);
                
                const videoContainer = document.createElement('div');
                videoContainer.style.cssText = 'margin-bottom: 6px;';
                
                const videoLabel = document.createElement('strong');
                videoLabel.textContent = '🎥 Видео:';
                videoLabel.style.cssText = 'display: block; margin-bottom: 4px;';
                videoContainer.appendChild(videoLabel);
                
                // Backend возвращает относительные URL (/api/images/...)
                // Нужно добавить API_BASE для получения полного URL
                let videoUrl = purchase.video_url;
                if (videoUrl && videoUrl.startsWith('/')) {
                    // Относительный URL - добавляем API_BASE
                    videoUrl = `${API_BASE}${videoUrl}`;
                } else if (videoUrl && !videoUrl.startsWith('http')) {
                    // URL без протокола - добавляем API_BASE
                    videoUrl = `${API_BASE}/${videoUrl}`;
                }
                
                console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Loading video from: ${videoUrl} (original: ${purchase.video_url})`);
                
                const videoWrapper = document.createElement('div');
                videoWrapper.style.cssText = 'margin-top: 4px;';
                
                const placeholder = document.createElement('div');
                placeholder.textContent = '⏳ Загрузка видео...';
                placeholder.style.cssText = 'padding: 20px; text-align: center; color: var(--text-hint); background: var(--bg-secondary); border-radius: 8px;';
                videoWrapper.appendChild(placeholder);
                
                // Загружаем видео через fetch для обхода блокировки Telegram WebView
                fetch(videoUrl, {
                    headers: {
                        'ngrok-skip-browser-warning': '69420'
                    }
                })
                .then(response => {
                    console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Response status: ${response.status}, headers:`, response.headers);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Blob created, size: ${blob.size} bytes, type: ${blob.type}`);
                    const blobUrl = URL.createObjectURL(blob);
                    const video = document.createElement('video');
                    video.controls = true;
                    video.style.cssText = 'max-width: 200px; max-height: 150px; border-radius: 8px; width: 100%;';
                    
                    video.onloadeddata = () => {
                        console.log(`[ADMIN PURCHASE ${purchase.id} VIDEO] Video loaded successfully, duration: ${video.duration}s`);
                        // Удаляем placeholder только после успешной загрузки
                        if (placeholder.parentNode) {
                            placeholder.remove();
                        }
                    };
                    
                    video.onerror = (e) => {
                        console.error(`[ADMIN PURCHASE ${purchase.id} VIDEO] Video load error:`, e);
                        URL.revokeObjectURL(blobUrl);
                        placeholder.textContent = '❌ Ошибка загрузки видео';
                        placeholder.style.display = 'block';
                        if (video.parentNode) {
                            video.remove();
                        }
                    };
                    
                    // Сначала добавляем video в контейнер, потом устанавливаем src (как в рабочем коде)
                    videoWrapper.appendChild(video);
                    // Устанавливаем src ПОСЛЕ добавления в DOM
                    video.src = blobUrl;
                })
                .catch(error => {
                    console.error(`[ADMIN PURCHASE ${purchase.id} VIDEO] Fetch error:`, error, 'URL:', videoUrl);
                    placeholder.textContent = '❌ Ошибка загрузки видео';
                    placeholder.style.display = 'block';
                });
                
                videoContainer.appendChild(videoWrapper);
                detailsList.push(videoContainer);
            } else {
                console.log(`[ADMIN PURCHASES] Purchase ${purchase.id} has no video_url`);
            }
            
            if (detailsList.length > 0) {
                const detailsDiv = document.createElement('div');
                detailsDiv.style.cssText = 'margin-top: 12px; padding: 12px; background: rgba(90, 200, 250, 0.1); border-radius: 8px; font-size: 13px; color: var(--tg-theme-text-color); border: 1px solid rgba(90, 200, 250, 0.2);';
                
                const detailsTitle = document.createElement('div');
                detailsTitle.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--tg-theme-button-color, #5ac8fa);';
                detailsTitle.textContent = '📋 Детали заявки:';
                detailsDiv.appendChild(detailsTitle);
                
                // Добавляем все элементы из detailsList
                detailsList.forEach(item => {
                    if (item instanceof HTMLElement) {
                        detailsDiv.appendChild(item);
                    }
                });
                
                infoDiv.appendChild(detailsDiv);
            }
            
            // Кнопки действий (только для невыполненных покупок)
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display: flex; gap: 6px; margin-top: 6px; justify-content: flex-start; flex-wrap: wrap; max-width: 100%;';
            
            if (!purchase.is_completed && !purchase.is_cancelled) {
                // Кнопка "Выполнить"
                const completeBtn = document.createElement('button');
                completeBtn.className = 'reserve-btn';
                completeBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(76, 175, 80, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                completeBtn.textContent = '✅ Выполнить';
                completeBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(76, 175, 80, 0.3)';
                };
                completeBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(76, 175, 80, 0.2)';
                };
                completeBtn.onclick = async () => {
                    if (confirm('Выполнить эту заявку на покупку?')) {
                        try {
                            await updatePurchaseStatusAPI(purchase.id, shopOwnerId, {
                                is_completed: true,
                                status: 'completed'
                            });
                            showNotification('Заявка на покупку выполнена');
                            loadPurchasesFn(); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                // Кнопка "Отменить"
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'reserve-btn';
                cancelBtn.style.cssText = `
                    background: linear-gradient(135deg, rgba(244, 67, 54, 0.2) 0%, rgba(244, 67, 54, 0.1) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 5px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 8px;
                    white-space: nowrap;
                    flex: none;
                    line-height: 1.2;
                    max-width: fit-content;
                    box-sizing: border-box;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 
                                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                                0 2px 8px rgba(244, 67, 54, 0.2);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                `;
                cancelBtn.textContent = '❌ Отменить';
                cancelBtn.onmouseenter = function() {
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 3px 10px rgba(244, 67, 54, 0.3)';
                };
                cancelBtn.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset, 0 2px 8px rgba(244, 67, 54, 0.2)';
                };
                cancelBtn.onclick = async () => {
                    if (confirm('Отменить эту заявку на покупку?')) {
                        try {
                            await updatePurchaseStatusAPI(purchase.id, shopOwnerId, {
                                is_cancelled: true,
                                status: 'cancelled'
                            });
                            showNotification('Заявка на покупку отменена');
                            loadPurchasesFn(); // Перезагружаем список
                        } catch (error) {
                            alert('Ошибка: ' + error.message);
                        }
                    }
                };
                
                actionsDiv.appendChild(completeBtn);
                actionsDiv.appendChild(cancelBtn);
            }
            
            purchaseItem.appendChild(headerDiv);
            purchaseItem.appendChild(infoDiv);
            if (actionsDiv.children.length > 0) {
                purchaseItem.appendChild(actionsDiv);
            }
            
            purchasesList.appendChild(purchaseItem);
        });
    } catch (error) {
        console.error('❌ Error loading purchases:', error);
        let errorMessage = 'Ошибка загрузки заявок на покупку';
        if (error.message) {
            errorMessage = error.message;
        }
        purchasesList.innerHTML = `<p class="loading">Ошибка загрузки: ${errorMessage}</p>`;
    }
}
// ========== END REFACTORING STEP 7.1 ==========

