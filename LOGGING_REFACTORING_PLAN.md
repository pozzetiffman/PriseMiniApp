# ПЛАН РЕФАКТОРИНГА ЛОГИРОВАНИЯ

## A) СТРАТЕГИЯ (5–8 пунктов)

1. **Frontend:** Глобальный перехват `console.*` — в prod глушим `log`/`info`, оставляем `warn`/`error`. Включение verbose: `?debug=1` или `window.__LOG_LEVEL__='debug'`.

2. **RemoteLogger:** Включается ТОЛЬКО при `?remote_log=1`. Production по умолчанию ВЫКЛ. Батчинг 2 сек, 50KB, дедуп 10 сек, silent fail (при ошибке POST не логируем через себя).

3. **Backend:** `logging` вместо `print`, уровень из `LOG_LEVEL` (default WARNING). Маскирование initData, токенов, PII.

4. **Bot:** Уровень из `BOT_LOG_LEVEL` (default WARNING). `[BOT ADD PRODUCT DEBUG]` переведён в `logging.debug` — показывается только при `BOT_LOG_LEVEL=DEBUG`.

5. **Обязательные лог-точки:** AUTH (неуспешная валидация, отсутствие initData — rate-limited), CHECKOUT/ORDERS/PURCHASES/DEALS (создание/ошибка), RESERVATIONS/CART (только ошибки), PRODUCTS SYNC (ошибки + итог "sync done in Xs").

6. **Безопасность:** Нет циклов remoteLogger, нет спама, нет утечек initData/PII в логах.

7. **Откат:** `LOG_LEVEL=DEBUG`, `BOT_LOG_LEVEL=DEBUG`, `?debug=1`, `?remote_log=1`.

---

## B) FRONTEND — ЧТО СДЕЛАНО

### 1) Файл `webapp/js/utils/logger.js`

- Функции: `log`, `info`, `warn`, `error`, `debug`
- Уровень: `?debug=1` или `window.__LOG_LEVEL__` (debug|info|warn|error|silent)
- Маскирование: initData, query_id, hash, email, phone, обрезка длинных строк

### 2) Файл `webapp/js/utils/remoteLogger.js` (обновлён)

- **Включение:** только при `?remote_log=1` (или `remote_log=true`)
- Батчинг 2 сек, лимит 50KB, дедуп 10 сек
- Silent fail: при ошибке `/api/debug/logs` не логируем через console (защита от цикла)
- `debug_info.url` обрезается до `?***` (без query params)

### 3) Файл `webapp/js/utils/consoleProxy.js` (новый)

- Глобальный перехват `console.log/info/warn/error`
- В prod (уровень warn): `log`/`info` — noop, `warn`/`error` — показываются
- При `?debug=1` или `debug_user` — всё показывается

### 4) Подключение в `webapp/js/app.js`

```javascript
import { initConsoleProxy } from './utils/consoleProxy.js';
import { initRemoteLogger } from './utils/remoteLogger.js';
// ...
initConsoleProxy();
initRemoteLogger();
```

### 5) Механика замены console.*

**Вариант 1 (применён):** Глобальный перехват — `initConsoleProxy()` глушит `log`/`info` в prod. Ручная замена 450 мест не требуется.

**Вариант 2 (опционально):** Постепенная замена на `import { logger } from './utils/logger.js'` и `logger.info(...)` вместо `console.log(...)`.

**В режиме `?debug=1`:** `console.error` остаётся видимым в консоли.

---

## C) BACKEND — ЧТО СДЕЛАНО

### 1) `backend/app/utils/logging_config.py`

- `setup_logging()`: уровень из `LOG_LEVEL=INFO|WARNING|ERROR|DEBUG`
- Формат: `%(asctime)s %(levelname)s %(name)s %(message)s`
- `SensitiveFilter`: маскирует initData, query_id, hash, user, email, phone
- `get_logger(name)` для модулей

### 2) Middleware в `main.py`

- `request.state.request_id` — генерируется или берётся из `X-Request-Id`
- Логирование: при отсутствии initData — `log.warning`; при `LOG_LEVEL=DEBUG` — 1 строка на запрос; при ошибке/status>=400 — всегда
- Slow request (>2s) — `log.warning`

### 3) Замена print → logger (примеры)

**main.py:** применено — `print` заменён на `log.info`/`log.warning`/`log.error`.

**cart.py:** применено — все `[CART DEBUG]` удалены, оставлены только `log.warning` при No initData и Validation error.

**Универсальная техника для остальных файлов:**

```python
# В начале файла:
from ..utils.logging_config import get_logger
log = get_logger(__name__)

# Вместо:
print(f"[DEBUG] ...")
# Использовать:
log.debug("...")

# Вместо:
print(f"❌ [ERROR] ...")
# Использовать:
log.error("...")

# Удалить полностью: print(f"[XXX DEBUG] ...") — отладочный шум
# Оставить: log.warning при No initData, Validation error
# Оставить: log.error при сбоях
# Оставить: log.info для 1 итоговой строки (например, "sync completed in Xs")
```

**Файлы для последующей замены:** `routers/context.py`, `routers/reservations.py`, `routers/products.py`, `handlers/products_read.py`, `utils/products_sync.py`, `routers/favorites.py`, `routers/categories.py`, `routers/shop_visits.py`, `routers/shop_settings.py`, `utils/telegram_auth.py`, `routers/sale_orders.py`, `routers/orders.py`, `routers/purchases.py`.

---

## D) BOT — ЧТО СДЕЛАНО

### 1) `bot/bot.py`

- `BOT_LOG_LEVEL` из env (default WARNING)
- `logging.basicConfig(level=..., format=..., datefmt=...)`

### 2) `bot/handlers/products.py`

- Все `print(f"[BOT ADD PRODUCT DEBUG] ...")` заменены на `log.debug(f"...")`
- Показываются только при `BOT_LOG_LEVEL=DEBUG`

### 3) Оставить print только для

- `❌ ОШИБКА: TELEGRAM_BOT_TOKEN не найден` (критичный старт)
- `❌ КРИТИЧЕСКАЯ ОШИБКА`, `⚠️ Бот остановлен` (fatal)

---

## E) ЧЕК-ЛИСТ ВАЛИДАЦИИ

### Что должно исчезнуть

- В prod без `?debug=1`: `console.log`, `console.info` в браузере
- В prod без `?remote_log=1`: отправка логов на `/api/debug/logs`
- Backend: все `[CART DEBUG]`, `[PRODUCT* DEBUG]`, `[PRODUCTS DEBUG]`, `DEBUG: Product N...`
- Bot: `[BOT ADD PRODUCT DEBUG]` в stdout при `BOT_LOG_LEVEL=WARNING`

### Что должно остаться

- `console.warn`, `console.error` в браузере (в prod)
- Backend: `log.warning` при No initData, `log.error` при сбоях, `log.info` для APP START
- Bot: `logging.error`, `logging.warning`, `print` при отсутствии токена и fatal

### Проверка remoteLogger

1. Без `?remote_log=1`: в Network не должно быть POST на `/api/debug/logs`
2. С `?remote_log=1`: POST идут батчами раз в ~2 сек, размер <50KB
3. При 404/500 на `/api/debug/logs`: нет бесконечного цикла (silent fail)

---

## F) ПЛАН ОТКАТА

| Компонент | Флаг для подробных логов |
|-----------|--------------------------|
| Frontend console | `?debug=1` или `window.__LOG_LEVEL__='debug'` |
| Remote logging | `?remote_log=1` |
| Backend | `LOG_LEVEL=DEBUG` |
| Bot | `BOT_LOG_LEVEL=DEBUG` |

**Быстрый откат:** добавить в `.env` или env приложения:

```
LOG_LEVEL=DEBUG
BOT_LOG_LEVEL=DEBUG
```

И в URL WebApp: `?debug=1&remote_log=1`

---

## ЧТО УДАЛИТЬ ПОЛНОСТЬЮ / ОБЕРНУТЬ

### Удалить полностью (100%)

- Все `console.log` во frontend — глушатся proxy в prod (ручное удаление не обязательно)
- Backend: `print(f"[CART DEBUG] ...")` — удалено в cart.py
- Bot: `print(f"[BOT ADD PRODUCT DEBUG] ...")` — переведено в log.debug

### Обернуть / понизить уровень

- Backend: остальные `print` → `log.debug` или удалить; критические → `log.warning`/`log.error`
- Bot: `logging.info` для рутинных операций (channels, photos) → при желании перевести в `logging.debug`
