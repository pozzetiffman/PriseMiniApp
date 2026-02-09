# Единый расчёт цен (pricing): flow и чек-лист

## Краткое описание

Итоговая сумма везде считается на **бэкенде** с учётом:
- **payment_method** (card / cash / transfer / other): для cash используется `price_cash` при наличии, иначе fallback на price_card;
- **delivery_method** (pickup / courier / none): при courier добавляется **delivery_fee** (из ProductDelivery или Product.delivery_price);
- скидка по товару применяется в едином модуле.

**Формула:** `items_amount = Σ(unit_price × quantity)`, `total_amount = items_amount + delivery_fee`.

---

## Изменённые файлы

### Backend
| Файл | Изменения |
|------|-----------|
| `backend/app/services/__init__.py` | Новый пакет services |
| `backend/app/services/pricing.py` | **Новый**: get_unit_price, calc_delivery_fee, build_quote, build_quote_for_deal |
| `backend/app/db/models.py` | Deal: delivery_fee, items_amount; SaleOrder: delivery_fee, items_amount, total_amount |
| `backend/app/models/deal.py` | DealDetailResponse, DealCheckoutResponse: items_amount, delivery_fee |
| `backend/app/models/sale_order.py` | SaleOrder: delivery_fee, items_amount, total_amount |
| `backend/app/routers/pricing.py` | **Новый**: POST /api/pricing/quote |
| `backend/app/routers/deals.py` | confirm использует build_quote_for_deal; обновляет DealItem.price_per_unit/line_total, Deal.items_amount, delivery_fee, total_amount |
| `backend/app/routers/sale_orders.py` | create_sale_order вызывает build_quote, сохраняет delivery_fee, items_amount, total_amount |
| `backend/app/main.py` | Подключён pricing.router |
| `backend/migrate_pricing_fields.py` | **Новый**: миграция колонок deals (delivery_fee, items_amount), sale_orders (delivery_fee, items_amount, total_amount) |

### Frontend
| Файл | Изменения |
|------|-----------|
| `webapp/js/api/pricing.js` | **Новый**: getPricingQuoteAPI(payload) |
| `webapp/js/dealCheckout.js` | При открытии и при смене оплаты/доставки — refreshQuoteAndSummary() через getPricingQuoteAPI(deal_id, ...); renderSummary показывает items_amount, delivery_fee, total_amount |
| `webapp/js/operationsDetail.js` | Сделка: строки Товары, Доставка, Итого (items_amount, delivery_fee, total_amount). Sale-orders: при наличии item.items_amount/total_amount — те же поля |
| `webapp/js/sale_orders.js` | updateSaleOrderTotal() через getPricingQuoteAPI(items, payment_method, delivery_method); слушатели на способ оплаты и доставки |

---

## Новый расчёт и flow

1. **Корзина (UI)**  
   По-прежнему считает итог локально через `getEffectiveUnitPrice` для переключателя «по карте / наличными». Финальная сумма при оформлении берётся с бэкенда (quote → confirm).

2. **Deal (сделка из корзины)**  
   - **checkout/start**: создаётся draft, позиции с предварительными price_per_unit/line_total (по карте).  
   - На форме оформления при открытии и при смене оплаты/доставки вызывается **POST /api/pricing/quote** с `deal_id`, `payment_method`, `delivery_method`; UI показывает items_amount, delivery_fee, total_amount из ответа.  
   - **checkout/confirm**: бэкенд заново считает quote, обновляет в Deal и DealItem: payment_method, delivery_method, delivery_fee, items_amount, total_amount, unit_price и line_total по позициям; списывает остатки.  
   - В детали сделки в ЛК выводятся items_amount, delivery_fee, total_amount из API.

3. **Sale Order (покупка одного товара)**  
   - В форме при смене количества, способа оплаты или доставки вызывается **POST /api/pricing/quote** с `items: [{ product_id, quantity }]`, `payment_method`, `delivery_method`; отображаются товары, доставка, итого.  
   - При отправке бэкенд в create_sale_order считает quote и сохраняет delivery_fee, items_amount, total_amount.  
   - В детали покупки в ЛК при наличии в item полей items_amount/delivery_fee/total_amount показываются они.

4. **API quote**  
   - **POST /api/pricing/quote**  
     body: `{ deal_id?: number, items?: [{ product_id, quantity }], payment_method, delivery_method }`.  
     Либо `deal_id` (позиции черновика), либо `items`.  
     Ответ: `{ items, items_amount, delivery_fee, total_amount, currency }`.

---

## Проверочный чек-лист (ручные тесты)

- [ ] **Корзина**  
  - Переключение «По карте» / «Наличными» меняет итог (для товаров с price_cash).  
  - Кнопка «К оформлению» открывает страницу оформления сделки.

- [ ] **Deal checkout**  
  - После start отображается предварительный итог (товары, при courier — доставка, итого).  
  - Смена способа оплаты (карта/наличные) меняет сумму.  
  - Смена доставки (самовывоз/курьер) при наличии delivery_price у товара добавляет доставку в итог.  
  - После confirm в ЛК в детали сделки: Товары, Доставка (если > 0), Итого совпадают с последним показом на форме.  
  - Старые сделки (без items_amount/delivery_fee) по-прежнему показывают одну строку «Сумма» / «Итого».

- [ ] **Sale Order (один товар)**  
  - В форме при смене количества, оплаты или доставки пересчитывается итог (товары, доставка, итого).  
  - После оформления в ЛК в детали покупки при наличии items_amount/total_amount отображаются они и при необходимости delivery_fee.  
  - cash без price_cash: итог как по карте (fallback).

- [ ] **Доставка**  
  - pickup/none: delivery_fee = 0.  
  - courier: delivery_fee из ProductDelivery.delivery_price или Product.delivery_price; в сделке из нескольких товаров берётся максимум по позициям.  
  - В детали сделки/покупки строка «Доставка» показывается только если delivery_fee > 0.

- [ ] **Итог в ЛК**  
  - Деталь сделки и деталь покупки (sale-order) показывают те же суммы, что зафиксированы на бэкенде при confirm/create.

- [ ] **Миграция**  
  - Выполнить `python3 backend/migrate_pricing_fields.py` один раз; старые записи не ломаются (новые поля nullable или с default).
