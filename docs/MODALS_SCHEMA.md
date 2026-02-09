# Модальные окна и слои приложения — полная схема

Документ описывает **все** модальные окна, bottom sheet'ы и полноэкранные «модальные» страницы: при каких условиях открываются, как закрываются и где живёт логика.

---

## 1. Классические модальные окна (overlay)

Все используют класс `.modal`: полупрозрачный фон, контент по центру, закрытие по крестику и клику вне контента. В `modals.js` при **Escape** закрываются: product-page, product-modal, reservation, order, sell, edit-product, cart-modal, admin-page.

| ID | Назначение | Когда открывается | Кто открывает | Закрытие | Файлы |
|----|------------|-------------------|----------------|----------|--------|
| **reservation-modal** | Выбор времени резервации (1/2/3 ч) и количества | Клик «Забронировать» на карточке товара (product-page) | `showReservationModal(productId)` | Крестик, клик по фону, Escape | `reservations.js`, `modals.js` |
| **order-modal** | Оформление заказа (промокод, кол-во → ФИО, телефон → доставка/самовывоз) | Клик «Заказать» / «Купить сейчас» на карточке товара | `showOrderModal(productId)` | Крестик, клик по фону, Escape; при отправке формы | `orders.js`, `modals.js` |
| **sale-order-modal** | *(Устаревший)* Оформление заказа на покупку (то же по смыслу, что sale-order-**page**) | Не используется — вместо него открывается **sale-order-page** | — | — | Только разметка в `index.html` |
| **sell-modal** | Пометка товара как проданного (кол-во, «продать все») | Владелец на product-page нажимает «Продать»; показывается только если у товара `quantity > 1` | `showSellModal(productId, product)` из `markAsSold()` | Крестик, клик по фону, Escape; после отправки | `product-edit.js`, `modals.js` |
| **purchase-modal** | Заявка на продажу товара магазину (ФИО, телефон, город, адрес, оплата, фото/видео) | Клик «Продать сейчас» на product-page (для товаров типа C2C / заявка на продажу) | `showPurchaseModal(prod)` | Крестик, клик по фону; после отправки | `purchases.js` (Escape не в modals.js, но можно добавить) |
| **cart-modal** | Резервации / Заказы / Продажи (вкладки) | **Сейчас не открывается** — кнопка корзины открывает страницу **cart-page-new** | — | Escape (в modals.js) | `cartInit.js`, `cartTabs.js` — контейнер для вкладок используется как fallback при поиске элементов |
| **edit-product-modal** | Редактирование товара (название, описание, цена, скидка, кол-во, «под заказ», «продажа» и т.д.) | Владелец на product-page нажимает «Редактировать» | `showEditProductModal(prod)` | Крестик, клик по фону, Escape | `product-edit.js`, `modals.js` |
| **settings-modal** | Настройки магазина (показ количества, резервации, «все под заказ») | Меню (бургер) → «Настройки» | `openSettings()` | Крестик, клик по фону | `handlers/admin_settings_modal.js`, `menu.js` |
| **admin-modal** | Админка (клиенты, проданные, статистика) — создаётся динамически | Меню → «Админка» (для владельца) | `createAdminModal()` + показ `admin-page` | Крестик, «Назад» скрывает `admin-page` | `handlers/admin_init.js` |

**Примечания:**

- **product-modal** (`#product-modal`) — в HTML есть, в коде не используется для показа; карточка товара реализована как полноэкранная **product-page**.
- **sale-order-modal** и **cart-modal** остались в разметке для обратной совместимости; фактически используются **sale-order-page** и **cart-page-new**.

---

## 2. Полноэкранные «страницы» (ведут себя как модальные)

Не класс `.modal`, а отдельные блоки-страницы. Показ/скрытие через `display: block/none` и `hideAllPages()`.

| ID | Назначение | Когда открывается | Кто открывает | Закрытие / возврат | Файлы |
|----|------------|-------------------|----------------|---------------------|--------|
| **product-page** | Карточка товара (фото, название, описание, цена, кнопки действий) | Клик по товару с главной, избранного, корзины, админки, деталей операции | `showProductModal(prod, ...)` | Кнопка «←», Escape; возврат по `navigationHistory` (main / favorites / cart / admin) | `handlers/products_modal.js`, `modals.js` |
| **cart-page-new** | Корзина (резервации, заказы, продажи) | Клик по кнопке корзины в хедере | `openCartPageNew()` | Кнопка «←» → main-content | `cart/cartNew.js`, `cart/cartInit.js` |
| **sale-order-page** | Оформление заказа на покупку (шаги: товар+кол-во → ФИО+телефон → доставка+оплата) | Клик «Купить» на product-page для товара с типом «продажа клиенту» | `showSaleOrderModal(product)` | Кнопка «←» → product-page или main | `sale_orders.js` |

---

## 3. Bottom Sheet'ы

Нижняя панель поверх контента (backdrop + контент с ручкой). Z-index 5000 (ниже меню).

| ID | Назначение | Когда открывается | Условие показа | Закрытие | Файлы |
|----|------------|-------------------|----------------|----------|--------|
| **cart-bottom-sheet** | Товар + количество + одна кнопка действия («Купить сейчас» / «Заказать» / «Забронировать» / «Продать сейчас») | Клик по кнопке корзины на карточке товара **на странице избранного**; при добавлении в корзину с product-page (нижняя кнопка) | **Только на странице избранного** (`favorites-page` видна) для вызова из сетки; на product-page — свой блок `product-page-bottom-sheet` | Свайп вниз, клик по backdrop (отключён в коде), после действия (открытие order/reservation/purchase/sale-order) | `cart/cartBottomSheet.js` |
| **product-page-bottom-sheet** | То же по смыслу: количество + одна основная кнопка на странице товара | Всегда показывается внизу product-page для товаров «на продажу» (если не скрыт по типу товара) | Включено для товара: `is_for_sale` или тип «заказ/покупка»; скрыт для владельца в админке и т.п. | Закрывается вместе с product-page | `handlers/products_modal.js` (`updateProductPageBottomSheet`) |

**Логика кнопки в bottom sheet:**

- Тип действия определяется `getProductActionType(product, appContext, shopSettings)` (`utils/productActionType.js`).
- Варианты: заявка на продажу → `showPurchaseModal`; покупка клиентом → `showSaleOrderModal`; заказ → `showOrderModal`; резерв → `showReservationModal`.

---

## 4. Цепочки «модальное → модальное»

1. **Product-page** → кнопка «Заказать» → **order-modal**.  
   Product-page → «Купить» (sale) → **sale-order-page**.  
   Product-page → «Забронировать» → **reservation-modal**.  
   Product-page → «Продать сейчас» (C2C) → **purchase-modal**.  
   Product-page → «Редактировать» (owner) → **edit-product-modal**.  
   Product-page → «Продать» (owner, quantity>1) → **sell-modal**.

2. **Favorites-page** → клик по кнопке корзины на карточке → товар добавляется в корзину, открывается **cart-bottom-sheet** (только на странице избранного).

3. **Cart-bottom-sheet** → «Купить сейчас» / «Заказать» и т.д. → закрывается sheet, открывается **order-modal** / **reservation-modal** / **purchase-modal** / **sale-order-page**.

4. **Меню** → «Настройки» → **settings-modal**; «Админка» → **admin-page** (в нём контент создаётся через **admin-modal**).

---

## 5. Где что инициализируется и вешается закрытие

| Действие | Файл | Функции / элементы |
|----------|------|--------------------|
| Закрытие по крестику и клику по фону для reservation, order, sell, edit-product; кнопка «назад» product-page; Escape для всех перечисленных + product-page, cart-modal, admin-page | `modals.js` | `setupModals()`, `initModalsDependencies()` |
| Открытие/закрытие reservation-modal | `reservations.js` | `showReservationModal(productId)` |
| Открытие/закрытие order-modal | `orders.js` | `showOrderModal(productId)`, сброс формы при закрытии |
| Открытие/закрытие purchase-modal | `purchases.js` | `showPurchaseModal(prod)` |
| Открытие sale-order-page (не modal) | `sale_orders.js` | `showSaleOrderModal(product)` |
| Открытие/закрытие sell-modal, edit-product-modal | `product-edit.js` | `showSellModal`, `showEditProductModal`; вызов из product-page по кнопкам |
| Открытие settings-modal | `handlers/admin_settings_modal.js` | `openSettings()`, `initSettingsModal()` |
| Открытие product-page, product-page-bottom-sheet | `handlers/products_modal.js` | `showProductModal()`, `closeProductPage()`, `updateProductPageBottomSheet()` |
| Открытие cart-page-new, настройка кнопки корзины и вкладок (в т.ч. для cart-modal) | `cart/cartInit.js`, `cart/cartNew.js` | `setupCartButton()`, `setupCartModal()`, `openCartPageNew()`, `closeCartPage()` |
| Открытие/закрытие cart-bottom-sheet | `cart/cartBottomSheet.js` | `showCartBottomSheet(product)`, `closeBottomSheet()`, `initCartBottomSheet()` |
| Создание и показ admin-page/admin-modal | `handlers/admin_init.js` | `createAdminModal()`, открытие по меню |

---

## 6. Упрощённая схема «кто поверх кого»

```
Меню (z-index выше) 
    ↓
Модальные окна (.modal) и страницы (product-page, cart-page-new, sale-order-page)
    ↓
Bottom sheet'ы (cart-bottom-sheet, product-page-bottom-sheet), z-index 5000
    ↓
Основной контент (main-content, favorites-page, profile, orders, …)
```

Escape обрабатывается в `modals.js` и закрывает по одному: product-page, затем по очереди все открытые модальные окна (reservation, order, sell, edit-product, cart-modal, admin-page).

---

*Документ: `docs/MODALS_SCHEMA.md`*
