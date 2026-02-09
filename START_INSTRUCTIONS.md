# Инструкция по запуску PriseMiniApp

## Порядок запуска компонентов

### Терминал 1 — Бекенд (запустить первым)

```bash
cd /Users/admin/Desktop/PriseMiniApp/backend && source ../.venv/bin/activate && python run.py
```

**Альтернатива (uvicorn напрямую):**
```bash
cd /Users/admin/Desktop/PriseMiniApp/backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Env для логов:**
- `UVICORN_ACCESS_LOG=1` — включить access log (GET ... 200 OK). По умолчанию выключен.
- `LOG_LEVEL=WARNING` — минимум логов. `LOG_LEVEL=DEBUG` — подробности.
- `DISABLE_PY_PRINT=0` — разрешить print(). По умолчанию print глушится.

**Что должно появиться:**
- `INFO: Application startup complete.`
- Сервер работает на `http://0.0.0.0:8000`

**Проверка:** Откройте `http://localhost:8000/api/health` — должно вернуть `{"status":"ok"}`

---

### Терминал 2 — Ngrok (запустить вторым)

```bash
ngrok http 8000
```

**Что должно появиться:**
```
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:8000
```

**Важно:** Скопируйте HTTPS URL (например: `https://xxxx-xx-xx-xx-xx.ngrok-free.app`)

**Если ngrok не настроен:**
1. Зарегистрируйтесь на https://dashboard.ngrok.com/get-started/your-authtoken
2. Получите authtoken
3. Выполните: `ngrok config add-authtoken YOUR_AUTHTOKEN_HERE`
4. Затем запустите: `ngrok http 8000`

---

### Терминал 3 — Telegram бот (запустить третьим)

```bash
cd /Users/admin/Desktop/PriseMiniApp/bot && source ../.venv/bin/activate && python bot.py
```

**Что должно появиться:**
- `Бот запущен. Все пользователи могут управлять своими витринами.`
- `INFO:aiogram.dispatcher:Start polling`
- `INFO:aiogram.dispatcher:Run polling for bot @setting_prices_bot`

---

### Терминал 4 — Фронтенд на Vercel (запустить последним)

**Шаг 1:** Если ngrok URL изменился, обновите его в `webapp/js/api.js`:

Откройте файл `webapp/js/api.js` и измените строку:
```javascript
export const API_BASE = "https://ВАШ_NGROK_URL.ngrok-free.app".trim();
```

**Шаг 2:** Задеплойте фронтенд:

```bash
cd /Users/admin/Desktop/PriseMiniApp/webapp && vercel --prod
```

**Что должно появиться:**
- `✅ Production: https://webapp-xxxxx.vercel.app`
- `🔗 Aliased: https://webapp-eight-vert.vercel.app`

---

## Важные замечания

1. **Порядок важен:** Сначала бекенд, потом ngrok, затем бот и фронтенд
2. **Если ngrok URL изменился:** Обновите его в `webapp/js/api.js` перед деплоем на Vercel
3. **Бекенд должен работать:** На `localhost:8000` до запуска ngrok
4. **Ngrok должен проксировать:** Порт 8000 (где работает бекенд)

---

## Проверка работоспособности

### Бекенд
```bash
curl http://localhost:8000/api/health
```
Должно вернуть: `{"status":"ok"}`

### Ngrok
- В терминале ngrok должен быть виден HTTPS URL
- Откройте этот URL в браузере — должен открыться бекенд

### Бот
- В терминале бота должны появляться логи обработки сообщений
- Отправьте `/start` боту в Telegram — должен ответить

### Фронтенд
- После деплоя на Vercel будет доступен по URL из вывода команды
- Откройте URL в браузере — должен загрузиться фронтенд

---

## Остановка всех компонентов

Нажмите `Ctrl+C` в каждом терминале в обратном порядке:

1. **Терминал 4** (Фронтенд) — остановить деплой (если запущен)
2. **Терминал 3** (Бот) — `Ctrl+C`
3. **Терминал 2** (Ngrok) — `Ctrl+C`
4. **Терминал 1** (Бекенд) — `Ctrl+C`

---

---

## 🔄 Обновление кода после изменений

### Обновление бекенда (автоматически)

**Бекенд обновляется автоматически!** 

Благодаря флагу `--reload` в команде запуска, uvicorn автоматически перезагружает сервер при изменении файлов в папке `backend/`.

**Что происходит:**
- Вы редактируете файлы в `backend/`
- Uvicorn автоматически обнаруживает изменения
- Сервер перезагружается (вы увидите сообщение `INFO: Detected file change`)
- Изменения применяются без остановки сервера

**Ничего делать не нужно!** Просто сохраните файл и изменения применятся автоматически.

---

### Обновление бота (нужно перезапустить)

**Бот НЕ обновляется автоматически.** После изменения файлов в `bot/` нужно перезапустить:

**В терминале бота:**
1. Нажмите `Ctrl+C` для остановки
2. Запустите снова:
   ```bash
   cd /Users/admin/Desktop/PriseMiniApp/bot && source ../.venv/bin/activate && python bot.py
   ```

**Альтернатива:** Можно использовать `nodemon` или другой файловый вотчер для автоматической перезагрузки, но это требует дополнительной настройки.

---

### Обновление фронтенда (нужно задеплоить на Vercel)

**После изменения файлов в `webapp/`:**

**Шаг 1:** Убедитесь, что ngrok URL актуален в `webapp/js/api.js`:
```javascript
export const API_BASE = "https://ВАШ_ТЕКУЩИЙ_NGROK_URL.ngrok-free.app".trim();
```

**Шаг 2:** Задеплойте на Vercel:

```bash
cd /Users/admin/Desktop/PriseMiniApp/webapp && vercel --prod
```

Или для автоматического деплоя без подтверждений:

```bash
cd /Users/admin/Desktop/PriseMiniApp/webapp && vercel --prod --yes
```

**Что происходит:**
- Vercel собирает проект
- Загружает файлы на сервер
- Обновляет production URL
- Изменения доступны через несколько секунд

---

### Обновление ngrok (обычно не нужно)

**Ngrok обычно не нужно перезапускать**, если:
- Бекенд работает на том же порту (8000)
- URL ngrok не изменился

**Если ngrok URL изменился:**
1. Скопируйте новый HTTPS URL из терминала ngrok
2. Обновите его в `webapp/js/api.js`:
   ```javascript
   export const API_BASE = "https://НОВЫЙ_NGROK_URL.ngrok-free.app".trim();
   ```
3. Перезадеплойте фронтенд на Vercel

---

## 📋 Чеклист обновления после изменений

### Если изменили код в `backend/`:
- ✅ **Ничего не делать** — бекенд обновится автоматически
- ✅ Проверить логи в терминале бекенда (должно появиться сообщение о перезагрузке)

### Если изменили код в `bot/`:
- ✅ Остановить бота (`Ctrl+C` в терминале бота)
- ✅ Запустить бота заново
- ✅ Проверить, что бот работает (отправить `/start`)

### Если изменили код в `webapp/`:
- ✅ Проверить/обновить ngrok URL в `webapp/js/api.js` (если нужно)
- ✅ Задеплоить на Vercel: `cd webapp && vercel --prod`
- ✅ Проверить, что изменения применились (открыть URL Vercel)

### Если изменили зависимости:
- ✅ Установить новые зависимости:
  ```bash
  source .venv/bin/activate
  pip install -r backend/requirements.txt
  ```
- ✅ Перезапустить бекенд (если нужно)
- ✅ Перезапустить бота (если нужно)

---

## 🚀 Быстрое обновление (краткая версия)

| Что изменили | Что делать |
|-------------|------------|
| `backend/` файлы | **Ничего** — обновится автоматически |
| `bot/` файлы | Перезапустить бота (`Ctrl+C` → запустить снова) |
| `webapp/` файлы | `cd webapp && vercel --prod` |
| Зависимости | `pip install -r backend/requirements.txt` → перезапустить компоненты |
| Ngrok URL изменился | Обновить в `webapp/js/api.js` → `cd webapp && vercel --prod` |

---

## Установка зависимостей (если нужно)

Если зависимости не установлены:

```bash
cd /Users/admin/Desktop/PriseMiniApp
source .venv/bin/activate
pip install -r backend/requirements.txt aiogram python-dotenv
```

---

## Структура проекта

- `backend/` — FastAPI бекенд
- `bot/` — Telegram бот на aiogram
- `webapp/` — Фронтенд (HTML/JS/CSS) для Telegram WebApp

---

## Полезные команды

### Проверить запущенные процессы
```bash
ps aux | grep -E "(uvicorn|bot.py|ngrok)" | grep -v grep
```

### Проверить доступность бекенда
```bash
curl http://localhost:8000/api/health
```

### Посмотреть логи ngrok
Откройте в браузере: `http://localhost:4040` (веб-интерфейс ngrok)

---

## Решение проблем

### Бекенд не запускается
- Убедитесь, что виртуальное окружение активировано: `source ../.venv/bin/activate`
- Проверьте, что порт 8000 свободен: `lsof -i :8000`

### Ngrok не запускается
- Проверьте, что authtoken настроен: `ngrok config check`
- Убедитесь, что бекенд запущен на порту 8000

### Бот не запускается
- Проверьте наличие файла `.env` в корне проекта
- Убедитесь, что `TELEGRAM_BOT_TOKEN` указан в `.env`
- Проверьте, что бекенд доступен на `localhost:8000`

### Фронтенд не работает
- Проверьте, что ngrok URL обновлен в `webapp/js/api.js`
- Убедитесь, что бекенд доступен через ngrok URL
- Проверьте логи в консоли браузера (F12)

