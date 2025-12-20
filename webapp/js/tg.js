// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Элементы DOM
const userNameElement = document.getElementById('user-name');
const categoriesNav = document.getElementById('categories-nav');
const productsGrid = document.getElementById('products-grid');

// Состояние
let currentCategoryId = null;

// Приветствие
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userNameElement.innerText = `Привет, ${tg.initDataUnsafe.user.first_name}!`;
} else {
    userNameElement.innerText = "Прайс";
}

// Функции рендеринга
async function renderCategories() {
    try {
        const categories = await fetchCategories();
        categoriesNav.innerHTML = '';
        
        // Кнопка "Все"
        const allBadge = document.createElement('div');
        allBadge.className = `category-badge ${currentCategoryId === null ? 'active' : ''}`;
        allBadge.innerText = 'Все';
        allBadge.onclick = () => filterByCategory(null);
        categoriesNav.appendChild(allBadge);

        if (Array.isArray(categories)) {
            categories.forEach(cat => {
                const badge = document.createElement('div');
                badge.className = `category-badge ${currentCategoryId === cat.id ? 'active' : ''}`;
                badge.innerText = cat.name;
                badge.onclick = () => filterByCategory(cat.id);
                categoriesNav.appendChild(badge);
            });
        }
    } catch (e) {
        console.error("Categories render error", e);
    }
}

async function renderProducts() {
    productsGrid.innerHTML = '<p class="loading">Загрузка...</p>';
    try {
        const products = await fetchProducts(currentCategoryId);
        productsGrid.innerHTML = '';

        if (!products || products.length === 0) {
            productsGrid.innerHTML = '<p class="loading">Товаров пока нет</p>';
            return;
        }

        products.forEach(prod => {
            const card = document.createElement('div');
            card.className = 'product-card';
            
            const imagePath = prod.image_url || '';
            const baseUrl = window.BASE_URL || '';
            const fullImageUrl = imagePath.startsWith('http') 
                ? imagePath 
                : (baseUrl + imagePath);

            // Расчет цены со скидкой
            const hasDiscount = prod.discount > 0;
            const finalPrice = hasDiscount ? Math.round(prod.price * (1 - prod.discount / 100)) : prod.price;

            card.innerHTML = `
                <div class="product-image" style="background-image: url('${fullImageUrl}'); background-size: cover;">
                    ${hasDiscount ? `<div class="discount-badge">-${prod.discount}%</div>` : ''}
                </div>
                <div class="product-name">${prod.name}</div>
                <div class="product-price-container">
                    <span class="product-price">${finalPrice} ₽</span>
                    ${hasDiscount ? `<span class="old-price">${prod.price} ₽</span>` : ''}
                </div>
                <button class="delete-btn" onclick="handleDelete(${prod.id})">❌ Удалить</button>
            `;
            productsGrid.appendChild(card);
        });
    } catch (e) {
        console.error("Products render error", e);
        productsGrid.innerHTML = `<p class="loading">Ошибка: ${e.message}</p>`;
    }
}

async function handleDelete(id) {
    if (confirm("Удалить этот товар?")) {
        await deleteProduct(id);
        renderProducts();
    }
}

function filterByCategory(id) {
    currentCategoryId = id;
    renderCategories();
    renderProducts();
}

async function init() {
    console.log("WebApp Init...");
    await renderCategories();
    await renderProducts();
}

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', init);
