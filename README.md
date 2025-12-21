# PriseMiniApp - Telegram Web Mini App

Проект для управления прайс-листом (категории, товары, скидки) через Telegram Web Mini App.

## Структура
- `backend/`: API на FastAPI + SQLite/PostgreSQL.
- `webapp/`: Фронтенд (HTML/JS) для Mini App.
- `bot/`: Telegram бот для запуска Mini App.

## 📖 Инструкция по запуску

**Подробная инструкция:** См. [START_INSTRUCTIONS.md](./START_INSTRUCTIONS.md)

### Быстрый старт

1. **Терминал 1 - Бекенд:**
   ```bash
   cd backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Терминал 2 - Ngrok:**
   ```bash
   ngrok http 8000
   ```

3. **Терминал 3 - Бот:**
   ```bash
   cd bot && source ../.venv/bin/activate && python bot.py
   ```

4. **Терминал 4 - Фронтенд:**
   ```bash
   cd webapp && vercel --prod
   ```

## Как запустить (разработка)
1. Настройте `.env` файл.
2. Запустите backend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`
3. Запустите бота: `cd bot && python bot.py`
