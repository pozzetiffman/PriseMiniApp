# Схема навигации веб-приложения Прайс

## 1. Блоки-страницы (экраны)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  main-content          Главная: каталог, категории, сетка товаров           │
├─────────────────────────────────────────────────────────────────────────────┤
│  product-page          Карточка товара (полноэкранная)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  favorites-page        Избранное                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  cart-page-new         Корзина (новая)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  profile-page          Личный кабинет                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  orders-page           Заказы (из профиля)                                  │
│  reservations-page    Резервации                                            │
│  purchases-page        Продажи (заявки на продажу)                           │
│  sale-orders-page      Покупки                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  operation-detail-page Детали одной операции (заказ/покупка/продажа)        │
├─────────────────────────────────────────────────────────────────────────────┤
│  admin-page            Админка                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

В каждый момент видна только одна страница (остальные `display: none`).

---

## 2. Точки входа и переходы (граф)

```mermaid
flowchart TB
    subgraph header [" Хедер (всегда виден) "]
        MENU[🍔 Меню]
        CART_BTN[🛒 Корзина]
        FAV_BTN[❤️ Избранное]
    end

    subgraph main [" Главная "]
        MAIN[main-content<br/>Каталог товаров]
    end

    subgraph secondary [" Второй уровень "]
        PRODUCT[product-page<br/>Карточка товара]
        FAV[favorites-page<br/>Избранное]
        CART[cart-page-new<br/>Корзина]
        PROFILE[profile-page<br/>Личный кабинет]
        ADMIN[admin-page<br/>Админка]
    end

    subgraph from_profile [" Из профиля "]
        ORDERS[orders-page<br/>Заказы]
        RESERV[reservations-page<br/>Резервации]
        PURCH[purchases-page<br/>Продажи]
        SALE_ORD[sale-orders-page<br/>Покупки]
    end

    subgraph detail [" Детали "]
        OP_DETAIL[operation-detail-page<br/>Детали операции]
    end

    MENU --> PROFILE
    MENU --> SETTINGS[settings-modal]
    MENU --> ADMIN
    CART_BTN --> CART
    FAV_BTN --> FAV

    MAIN -->|клик по товару| PRODUCT
    FAV -->|клик по товару| PRODUCT
    CART -->|клик по товару| PRODUCT
    ADMIN -->|клик по товару| PRODUCT

    PROFILE --> ORDERS
    PROFILE --> RESERV
    PROFILE --> PURCH
    PROFILE --> SALE_ORD

    ORDERS -->|клик по карточке| OP_DETAIL
    RESERV -->|клик по карточке| OP_DETAIL
    PURCH -->|клик по карточке| OP_DETAIL
    SALE_ORD -->|клик по карточке| OP_DETAIL

    OP_DETAIL -->|клик по товару| PRODUCT
```

---

## 3. Куда ведёт «Назад» (закрытие)

```mermaid
flowchart LR
    subgraph back [" Кнопка ← / Закрыть → куда возвращаемся "]
        P[product-page] -->|navigationHistory| P1[main / favorites / cart / admin]
        F[favorites-page] --> F1[main-content]
        C[cart-page-new] --> C1[main-content]
        PR[profile-page] --> PR1[main-content]
        O[orders / reserv / purch / sale-orders] --> O1[profile-page]
        D[operation-detail-page] --> D1[orders / purch / sale-orders]
        A[admin-page] --> A1[main-content]
    end
```

| Страница | Кнопка закрытия | Возврат |
|----------|-----------------|---------|
| **product-page** | ← | По `navigationHistory`: main / favorites / cart / admin |
| **favorites-page** | ← | main-content |
| **cart-page-new** | ← | main-content |
| **profile-page** | ← | main-content |
| **orders-page**, **reservations-page**, **purchases-page**, **sale-orders-page** | ← | profile-page |
| **operation-detail-page** | ← | Та же страница списка (orders / purchases / sale-orders) |
| **admin-page** | ← Назад | main-content |

---

## 4. Блок-схема «кто откуда открывается»

```
                    ┌──────────────┐
                    │   HEADER     │
                    │  🍔 🛒 ❤️    │
                    └──┬─────┬──┬──┘
                       │     │  │
         ┌─────────────┼─────┼──┼─────────────┐
         │             │     │  │             │
         ▼             ▼     ▼  ▼             ▼
    ┌─────────┐   ┌──────────────┐     ┌──────────┐
    │ Profile │   │ cart-page-   │     │ favorites │
    │ Admin   │   │    new       │     │  -page    │
    │ Settings│   └──────┬───────┘     └─────┬─────┘
    └────┬────┘          │                   │
         │               │                   │
         │          ┌────┴────┐         ┌────┴────┐
         │          │  main-   │◄────────│  main-  │
         │          │ content  │  close  │ content │
         │          └────┬────┘         └─────────┘
         │               │
         │               │ click product
         │               ▼
         │          ┌─────────────┐
         │          │ product-    │
         │          │   page      │
         │          └──────┬──────┘
         │                 │ close → navigationHistory
         │                 │ (main | favorites | cart | admin)
         │                 │
         ▼                 │
    ┌─────────────┐        │
    │ profile-    │        │
    │   page      │        │
    └──────┬──────┘        │
           │               │
           │  [Заказы]     │
           │  [Резервации] │
           │  [Продажи]    │
           │  [Покупки]    │
           ▼               │
    ┌─────────────────────┴──────┐
    │ orders / reservations /    │
    │ purchases / sale-orders     │
    └──────┬─────────────────────┘
           │ click card
           ▼
    ┌──────────────────┐
    │ operation-detail- │──────► product-page (click product in deal)
    │      page         │
    └──────┬────────────┘
           │ back
           ▼
    (соответствующая страница списка)
```

---

## 5. Единое правило открытия страниц

**Любая функция, открывающая страницу, ОБЯЗАНА сначала вызвать `hideAllPages()` из `operationsBase.js`, затем показать свою страницу.**

- `hideAllPages()` — скрывает ВСЕ контейнеры из `ALL_PAGE_IDS` (main-content, product-page, favorites-page, cart-page, cart-page-new, profile-page, orders/reservations/purchases/sale-orders-page, sale-order-page, operation-detail-page, admin-page).
- Используют: `openFavoritesPage`, `openProfile`, `openCartPageNew`, `openOperationPage`, `openOperationDetailPage`, `openAdmin`, `showProductModal`, `showSaleOrderModal`.

Так устраняются наложения экранов и «избранное не открывается с первого клика».

---

## 6. Файлы, где живёт логика

| Действие | Файл | Функции |
|----------|------|---------|
| Список страниц, hideAllPages, открыть/закрыть страницу операций | `js/operationsBase.js` | `ALL_PAGE_IDS`, `hideAllPages()`, `showOnlyPage()`, `openOperationPage`, `closeOperationPage` |
| Страница товара, «назад» по истории | `js/handlers/products_modal.js` | `showProductModal`, `closeProductPage`, `navigationHistory` |
| Профиль | `js/profile.js` | `openProfile`, `closeProfilePage` |
| Избранное | `js/favorites.js` | `openFavoritesPage`, `closeFavoritesPage` |
| Корзина | `js/cart/cartNew.js` | `openCartPageNew`, `closeCartPageNew` |
| Детали операции | `js/operationsDetail.js` | `openOperationDetailPage`, `closeOperationDetailPage`, `currentListPageId` |
| Меню, админка | `js/menu.js`, `js/admin.js`, `js/handlers/admin_init.js` | `openAdmin`, `closeAdminPage` |

---

## 7. Модель в одну картинку (Mermaid)

```mermaid
flowchart TB
    MAIN["🏠 main-content"]
    PRODUCT["📦 product-page"]
    FAV["❤️ favorites-page"]
    CART["🛒 cart-page-new"]
    PROFILE["👤 profile-page"]
    ORDERS["🛒 orders-page"]
    RESERV["🔒 reservations-page"]
    PURCH["💰 purchases-page"]
    SALE["🛍️ sale-orders-page"]
    DETAIL["📄 operation-detail"]
    ADMIN["⚙️ admin-page"]

    MAIN -->|товар| PRODUCT
    FAV -->|товар| PRODUCT
    CART -->|товар| PRODUCT
    ADMIN -->|товар| PRODUCT
    PRODUCT -->|← main/fav/cart/admin| MAIN
    PRODUCT -->|← main/fav/cart/admin| FAV
    PRODUCT -->|← main/fav/cart/admin| CART
    PRODUCT -->|← main/fav/cart/admin| ADMIN

    MAIN -.->|кнопки хедера| FAV
    MAIN -.->|кнопки хедера| CART
    MAIN -.->|меню| PROFILE
    MAIN -.->|меню| ADMIN

    FAV -->|←| MAIN
    CART -->|←| MAIN
    PROFILE -->|←| MAIN
    ADMIN -->|←| MAIN

    PROFILE --> ORDERS
    PROFILE --> RESERV
    PROFILE --> PURCH
    PROFILE --> SALE

    ORDERS -->|←| PROFILE
    RESERV -->|←| PROFILE
    PURCH -->|←| PROFILE
    SALE -->|←| PROFILE

    ORDERS -->|карточка| DETAIL
    PURCH -->|карточка| DETAIL
    SALE -->|карточка| DETAIL
    DETAIL -->|←| ORDERS
    DETAIL -->|←| PURCH
    DETAIL -->|←| SALE
    DETAIL -->|товар| PRODUCT
```

---

*Документ: `docs/NAVIGATION_SCHEMA.md`*
