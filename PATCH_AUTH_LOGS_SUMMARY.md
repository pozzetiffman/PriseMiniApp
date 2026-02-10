# Патч: стабилизация auth, логов и таймаутов

## Кратко: что сделано

- **FRONT**: Единый apiClient — initData, X-Request-Id, таймаут 15/30s, retry; все запросы через него
- **FRONT**: getBaseHeadersNoAuth теперь тоже добавляет initData (categories/products больше не без заголовка)
- **FRONT**: remoteLogger — батчинг, rate limit, дедуп, лимит 50KB, graceful fail
- **BACK**: Кэш initDataHash→(user_id, bot_token, bot_id) 5 мин; кэш списка ботов 60 сек
- **BACK**: DEBUG=0/1 — при DEBUG=0 почти нет логов, при DEBUG=1 — подробные
- **BACK**: Middleware логирует has_initdata, request_id; устанавливает request_id_ctx для auth

---

## Файлы изменений

### FRONT
- `webapp/js/api/apiClient.js` — **новый** единый fetch wrapper
- `webapp/js/api/client.js` — реэкспорт apiClient + config
- `webapp/js/api/config.js` — getBaseHeadersNoAuth добавляет initData
- `webapp/js/api/context.js` — использует apiRequest
- `webapp/js/api/purchases.js` — использует apiFetch/apiRequest
- `webapp/js/utils/remoteLogger.js` — батчинг, rate limit, дедуп

### BACK
- `backend/app/utils/telegram_auth.py` — кэш auth, кэш ботов, request_id_ctx, DEBUG
- `backend/app/main.py` — DEBUG_MODE, компактный middleware, request_id_ctx
- `backend/app/routers/context.py` — убраны лишние логи
- `env.example` — добавлен DEBUG=0

---

## Чек-лист проверки

1. Открыть WebApp в Telegram, убедиться что загружаются товары и категории
2. Проверить логи backend:
   - **Исчезло**: `Has X-Telegram-Init-Data: False` (при DEBUG=0)
   - **Исчезло/редко**: `Main bot validation failed… Invalid Telegram initData signature`
   - **Появляется при DEBUG=1**: `Validated initData request_id=... user_id=... bot_id=...`
   - **Исчезли**: спам-ошибки remoteLogger (`Failed to send logs to server`)
3. Проверить фронт: нет `getMyPurchasesAPI timeout after 10000 ms` (таймаут 30s + retry)
4. Повторные запросы идут через кэш — меньше логов `Loading active bots from DB`

---

## План отката

| Фича | Как отключить |
|------|----------------|
| Кэш auth | `AUTH_CACHE_DISABLED=1` — добавить проверку в `telegram_auth.py` и пропускать `_get_cached_auth` |
| Кэш ботов | `BOTS_CACHE_TTL=0` — считать TTL=0 и всегда обновлять |
| DEBUG логи | `DEBUG=0` (уже по умолчанию) |
| remoteLogger | `?debug_user=1` в URL — remoteLogger не инициализируется |
| apiClient retry | В `apiClient.js`: `opts.retries ?? 0` вместо 1 |

---

## Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DEBUG` | 1 — подробные логи AUTH и REQUEST | 0 |
| `TELEGRAM_BOT_TOKEN` | Токен главного бота | — |
