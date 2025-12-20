# PriseMiniApp - Telegram Web Mini App

Проект для управления прайс-листом (категории, товары, скидки) через Telegram Web Mini App.

## Структура
- `backend/`: API на FastAPI + SQLite/PostgreSQL.
- `webapp/`: Фронтенд (HTML/JS) для Mini App.
- `bot/`: Telegram бот для запуска Mini App.

## Как запустить (разработка)
1. Настройте `.env` файл.
2. Запустите backend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`
3. Запустите бота: `cd bot && python bot.py`
