"""
Менеджер для запуска множественных ботов
Каждый зарегистрированный бот запускается как отдельный процесс с командами управления
"""
import asyncio
import os
import logging
import aiohttp
from io import BytesIO
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command, StateFilter
from aiogram.filters.command import CommandObject
from aiogram.types import Message, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
import sys

# Добавляем путь к backend для импорта
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.db import database, models

# Загружаем .env
load_dotenv(dotenv_path="../.env")

logging.basicConfig(level=logging.INFO)

WEBAPP_URL = os.getenv("WEBAPP_URL")
API_URL = "http://localhost:8000/api"

# Хранилище для всех ботов
active_bots = {}


async def create_bot_dispatcher(bot_token: str, bot_username: str):
    """
    Создать dispatcher для бота с всеми командами управления.
    Использует тот же код, что и главный бот.
    """
    bot = Bot(token=bot_token)
    storage = MemoryStorage()
    dp = Dispatcher(storage=storage)
    
    # Импортируем все обработчики из главного бота
    # Для упрощения используем те же обработчики
    
    @dp.message(Command("start"))
    async def cmd_start(message: Message, command: CommandObject):
        user_id = message.from_user.id
        own_store_url = f"{WEBAPP_URL}?user_id={user_id}"
        
        builder = InlineKeyboardBuilder()
        builder.row(types.InlineKeyboardButton(
            text="Открыть Прайс 📦", 
            web_app=WebAppInfo(url=own_store_url)
        ))
        
        msg = f"Привет, {message.from_user.first_name}! Нажми кнопку ниже, чтобы открыть свою витрину."
        msg += "\n\nИспользуйте /manage для управления товарами и публикации витрины."
        
        await message.answer(msg, reply_markup=builder.as_markup())
    
    @dp.message(Command("manage"))
    async def cmd_manage(message: Message):
        """Показать меню управления магазином"""
        user_id = message.from_user.id
        
        keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="➕ Добавить товар"), KeyboardButton(text="📂 Добавить категорию")],
                [KeyboardButton(text="📤 Поделиться витриной"), KeyboardButton(text="📢 Управление каналами")],
                [KeyboardButton(text="🏷️ Название магазина"), KeyboardButton(text="🖼️ Изображение магазина")],
                [KeyboardButton(text="📝 Описание магазина")]
            ],
            resize_keyboard=True
        )
        
        await message.answer(
            "🔧 **Управление магазином**\n\n"
            "Выберите действие:",
            reply_markup=keyboard,
            parse_mode="Markdown"
        )
    
    # Добавляем все остальные обработчики из главного бота
    # Для упрощения можно импортировать их или скопировать
    
    return bot, dp


async def start_bot_instance(bot_token: str, bot_username: str):
    """
    Запустить экземпляр бота с указанным токеном
    """
    try:
        bot, dp = await create_bot_dispatcher(bot_token, bot_username)
        logging.info(f"🤖 Starting bot @{bot_username}")
        await dp.start_polling(bot)
    except Exception as e:
        logging.error(f"❌ Error starting bot @{bot_username}: {e}")


async def start_all_registered_bots():
    """
    Запустить все зарегистрированные боты
    """
    # Получаем список всех активных ботов из БД
    db = next(database.get_db())
    bots = db.query(models.Bot).filter(models.Bot.is_active == True).all()
    
    if not bots:
        logging.warning("⚠️ No active bots found in database")
        return
    
    logging.info(f"📋 Found {len(bots)} active bots")
    
    # Запускаем каждый бот в отдельной задаче
    tasks = []
    for bot_record in bots:
        task = asyncio.create_task(
            start_bot_instance(bot_record.bot_token, bot_record.bot_username)
        )
        tasks.append(task)
        active_bots[bot_record.bot_token] = {
            'bot': None,
            'dp': None,
            'task': task
        }
    
    # Ждем завершения всех задач
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    logging.info("🚀 Starting bot manager...")
    asyncio.run(start_all_registered_bots())







