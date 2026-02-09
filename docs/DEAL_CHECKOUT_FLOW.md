# Полноценный checkout для сделок (покупок)

## Новый flow (start → UI → confirm → stock decrement → detail)

1. **Корзина → «К оформлению»**  
   Фронт собирает выбранные позиции `getSelectedCartItemsForCheckout()` и вызывает **POST /api/deals/checkout/start** с `{ items: [{ product_id, quantity }] }`.

2. **Backend: checkout/start**  
   Создаётся сделка в статусе **draft** (без номера): проверки товаров (существует, is_for_sale/is_sale_enabled, не свой, quantity ≤ доступного), создаются snapshots и DealItem, считается total. Возврат: `{ deal_id, status: "draft", total_items_count, total_amount, currency }`.

3. **Фронт: экран оформления**  
   Открывается страница **#deal-checkout-page** с шагами:
   - **Шаг 1:** способ оплаты (card / cash / transfer / other).
   - **Шаг 2:** способ получения (pickup / courier / none); при «Курьер» — поле адреса.
   - **Шаг 3:** имя и телефон (обязательно).
   - **Шаг 4:** комментарий (необязательно) и кнопка «Подтвердить покупку».

4. **Подтверждение**  
   По кнопке вызывается **POST /api/deals/checkout/confirm** с `deal_id` и полями оформления (payment_method, delivery_method, customer_name, customer_phone, delivery_address, customer_comment).

5. **Backend: confirm**  
   Сделка должна быть в статусе draft и принадлежать пользователю. Обновляются поля оформления, присваивается `deal_number`, статус → **active**. В одной транзакции для каждого DealItem: проверка доступного количества (с учётом резерваций), уменьшение `product.quantity`. При нехватке — rollback и понятная ошибка.

6. **После успешного confirm**  
   Удаляются выбранные позиции из корзины, показ уведомления, обновление счётчиков, закрытие корзины и страницы оформления, переход в профиль → «Покупки» → открытие **детали созданной сделки** (по полному объекту с сервера, без лишнего запроса при переходе из checkout).

7. **Деталка сделки**  
   Отображаются: номер, дата, статус, итоги (товаров/сумма), способ оплаты и доставки, контакты (имя, телефон), адрес и комментарий. Список позиций — кликабельные мини-карточки; клик открывает карточку товара (getProductByIdAPI + showProductModal с данными из snapshot), как в заказах.

---

## Список изменённых и добавленных файлов

### Backend
- **backend/app/db/models.py** — в модель Deal добавлены поля: `updated_at`, `status` (draft/active/completed/cancelled), `payment_method`, `delivery_method`, `customer_name`, `customer_phone`, `delivery_address`, `customer_comment`, `seller_comment`.
- **backend/migrate_deal_checkout_fields.py** — миграция: добавление новых колонок в таблицу `deals`.
- **backend/app/models/deal.py** — схемы: `DealConfirmRequest`, `DealCheckoutStartResponse`; в `DealDetailResponse` добавлены поля оформления и `updated_at`.
- **backend/app/routers/deals.py** — добавлены `_create_draft_deal`, `_confirm_deal_and_decrement_stock`; эндпоинты **POST /api/deals/checkout/start** и **POST /api/deals/checkout/confirm**; старый **POST /api/deals/checkout** оставлен как deprecated (внутри вызывает start + confirm с дефолтами); в **GET /api/deals/{id}** в ответ добавлены все новые поля.

### Frontend
- **webapp/js/operationsBase.js** — в `ALL_PAGE_IDS` добавлен `deal-checkout-page`.
- **webapp/index.html** — добавлена страница **#deal-checkout-page** с 4 шагами (оплата, доставка+адрес, контакты, комментарий).
- **webapp/js/api/deals.js** — добавлены `startDealCheckoutAPI` и `confirmDealCheckoutAPI`; `createDealCheckoutAPI` помечен deprecated.
- **webapp/js/dealCheckout.js** — новый модуль: `openDealCheckoutPage(dealId, summary)`, `closeDealCheckoutPage()`, `initDealCheckoutPage()` (обработчики шагов и отправка confirm).
- **webapp/js/cart/cartNew.js** — кнопка «К оформлению» вызывает `startDealCheckoutAPI` и открывает `openDealCheckoutPage` вместо прямого createDealCheckoutAPI.
- **webapp/js/app.js** — импорт и вызов `initDealCheckoutPage()` при старте.
- **webapp/js/operationsDetail.js** — `openDealDetailPage` принимает полный объект сделки (с `items`) и при его наличии не делает лишний запрос; в `renderDealDetail` добавлен вывод оплаты, доставки, контактов, адреса и комментария; `createDealItemMiniCard` сделана кликабельной с вызовом `openProductFromDealItem` (getProductByIdAPI + showProductModal по snapshot).

---

## Запуск миграции

```bash
cd backend && python3 migrate_deal_checkout_fields.py
```

После этого приложение использует новые колонки; старые записи в `deals` остаются с `NULL` в новых полях и отображаются с «—» в деталке.
