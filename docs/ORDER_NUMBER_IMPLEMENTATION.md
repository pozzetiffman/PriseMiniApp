# Внедрение order_number (уникальный номер операции)

## Текущий поток операций (до изменений)

- **Order (заказы)**: создаются в `POST /api/orders/` (orders.py, create_order). Один заказ = один товар, snapshot, запись Order.
- **Purchase (продажи)**: создаются в `POST /api/purchases/` (purchases.py, create_purchase) при заявке на покупку товара; также в clients.py при сохранении контактов с адресом (две точки создания).
- **SaleOrder (покупки C2C)**: создаются в `POST /api/sale-orders/` (sale_orders.py, create_sale_order). Одна запись на сделку.
- Пар «покупка/продажа» с общим номером в текущей архитектуре нет: Purchase и SaleOrder — отдельные сущности, создаются в разных местах. Реализован единый формат номера и уникальность внутри каждой таблицы.

## Что сделано

1. **БД и модели**  
   В таблицы `orders`, `purchases`, `sale_orders` добавлено поле `order_number` (VARCHAR(64), unique, nullable). Миграция: `backend/migrate_add_order_number.py`.

2. **Генерация номера**  
   `backend/app/utils/order_number.py`: `generate_order_number(prefix)` → строка формата `PREFIX-YYYYMMDD-HHMM-XXXX` (4 hex-символа). Префиксы: ORD, PUR, SLO.

3. **Создание операций**  
   - В `create_order` (orders.py): после `db.add(order)` в цикле до 5 попыток задаётся `order.order_number = generate_order_number("ORD")`, затем `db.commit()`; при `IntegrityError` — rollback и повтор.
   - В `create_purchase` (purchases.py): то же с префиксом `"PUR"`.
   - В `create_sale_order` (sale_orders.py): то же с префиксом `"SLO"`.
   - В clients.py при создании Purchase для контактов задаётся `order_number=generate_order_number("PUR")`.

4. **API**  
   В Pydantic-схемы Order, Purchase, SaleOrder добавлено поле `order_number: Optional[str] = None`. Ответы GET /api/orders/my, /api/orders/history, /api/orders/shop, /api/purchases/my, /api/sale-orders/ и т.д. возвращают `order_number` в элементах списка и в деталях.

5. **Фронт**  
   В `webapp/js/operationsDetail.js` в `renderOperationDetail` для типов orders, purchases, sale-orders в блок деталей заказа добавлена строка «Номер заказа: …» (при отсутствии — «—»). Данные берутся из уже приходящего в списках поля `order_number`, отдельный запрос не нужен.

## Обратная совместимость

- Старые записи без `order_number` остаются с NULL; в API и на фронте отображается «—».
- Ошибок по `undefined` нет: везде проверка/optional.

## Критерии приёмки

1. Создание заказа через «Купить сейчас» → в БД у Order заполнен order_number, в ответе API он есть.
2. В «🛒 Заказы» в деталях отображается «Номер заказа: …».
3. В «💰 Продажи» и «🛍️ Покупки» в деталях тоже отображается номер.
4. Уникальность: при создании многих операций дублей нет (unique index + retry при коллизии).
5. Старые операции открываются без ошибок, номер при отсутствии — «—».
