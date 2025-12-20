import asyncio
import os
import logging
import tempfile
import aiohttp
from io import BytesIO
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command, StateFilter
from aiogram.filters.command import CommandObject
from aiogram.types import Message, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

# Загружаем .env
load_dotenv(dotenv_path="../.env")

logging.basicConfig(level=logging.INFO)

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
API_URL = "http://localhost:8000/api"

bot = Bot(token=TOKEN)
dp = Dispatcher()

# Кэш для username бота
_bot_username = None

async def get_bot_username():
    """Получить username бота"""
    global _bot_username
    if _bot_username is None:
        bot_info = await bot.get_me()
        _bot_username = bot_info.username
    return _bot_username

async def get_bot_deeplink(user_id: int):
    """Получить deep link на бота с параметром для открытия витрины"""
    username = await get_bot_username()
    return f"https://t.me/{username}?start=store_{user_id}"

# Состояния для категорий и товаров
class AddCategory(StatesGroup):
    name = State()

class AddProduct(StatesGroup):
    name = State()
    price = State()
    category = State()
    discount = State()
    description = State()
    photos = State()  # Состояние для загрузки нескольких фото

class AddChannel(StatesGroup):
    waiting_for_channel = State()

@dp.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject):
    # Проверяем, есть ли параметр в команде (например, /start store_123456)
    param = command.args if command.args else None
    
    if param and param.startswith("store_"):
        # Пользователь перешел по ссылке на витрину
        try:
            store_owner_id = int(param.replace("store_", ""))
            share_url = f"{WEBAPP_URL}?user_id={store_owner_id}"
            
            builder = InlineKeyboardBuilder()
            builder.row(types.InlineKeyboardButton(
                text="🛍️ Открыть магазин", 
                web_app=WebAppInfo(url=share_url)
            ))
            
            msg = "🛍️ **Добро пожаловать в магазин!**\n\n"
            msg += "Нажмите кнопку ниже, чтобы открыть витрину с товарами."
            
            await message.answer(msg, reply_markup=builder.as_markup(), parse_mode="Markdown")
            return
        except ValueError:
            # Неправильный формат параметра
            pass
    
    # Обычный /start - открываем свою витрину
    # ВАЖНО: Добавляем user_id в URL, чтобы корзина могла определить пользователя
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

@dp.message(F.text == "📤 Поделиться витриной")
async def share_store(message: Message):
    """Показать список каналов для отправки витрины"""
    user_id = message.from_user.id
    
    # Получаем список каналов пользователя
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_URL}/channels/"
            logging.info(f"Requesting channels from {url} with user_id={user_id}")
            async with session.get(url, params={"user_id": user_id}) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    logging.error(f"Error getting channels: status={resp.status}, error={error_text}")
                    return await message.answer(f"❌ Ошибка при получении списка каналов (статус: {resp.status})")
                channels = await resp.json()
                logging.info(f"Successfully got {len(channels)} channels")
    except Exception as e:
        logging.error(f"Exception getting channels: {e}")
        return await message.answer(f"❌ Ошибка подключения к серверу: {str(e)}")
    
    if not channels:
        return await message.answer(
            "📢 У вас пока нет добавленных каналов.\n\n"
            "Используйте кнопку '📢 Управление каналами' чтобы добавить канал или группу.\n\n"
            "💡 **Как добавить канал:**\n"
            "1. Добавьте бота в канал/группу как администратора\n"
            "2. Отправьте боту @username канала или перешлите сообщение из канала"
        )
    
    # Создаем инлайн-кнопки для выбора канала
    builder = InlineKeyboardBuilder()
    for channel in channels:
        channel_name = channel.get('username', f"ID: {channel['chat_id']}")
        builder.button(
            text=f"📢 {channel['title']} (@{channel_name})" if channel.get('username') else f"📢 {channel['title']}",
            callback_data=f"share_{channel['id']}"
        )
    builder.adjust(1)
    
    await message.answer(
        "📤 Выберите канал или группу для отправки витрины:",
        reply_markup=builder.as_markup()
    )

@dp.message(Command("post"))
@dp.message(F.text == "/post")
async def cmd_post(message: Message):
    chat_type = message.chat.type
    chat_id = message.chat.id
    logging.info(f"/post command received - chat_type: {chat_type}, chat_id: {chat_id}, user_id: {message.from_user.id}")
    
    user_id = message.from_user.id
    share_url = f"{WEBAPP_URL}?user_id={user_id}"
    
    msg = "🛍️ **Магазин**\n\n"
    msg += "Нажмите кнопку ниже, чтобы открыть витрину с товарами!"
    
    # Удаляем команду пользователя (если есть права)
    try:
        await message.delete()
    except Exception as del_err:
        logging.warning(f"Could not delete message: {del_err}")
    
    # Для каналов и обычных групп используем deep link на бота
    if chat_type == "channel" or chat_type == "group":
        bot_link = await get_bot_deeplink(user_id)
        builder = InlineKeyboardBuilder()
        builder.row(types.InlineKeyboardButton(
            text="🛍️ Открыть магазин", 
            url=bot_link
        ))
        if chat_type == "channel":
            msg += "\n\n💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!"
        else:
            msg += "\n\n💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!\n"
            msg += "💡 **Совет:** Конвертируйте группу в супергруппу, чтобы магазин открывался сразу внутри Telegram"
        try:
            sent = await message.answer(msg, reply_markup=builder.as_markup(), parse_mode="Markdown")
            logging.info(f"Successfully posted store message to {chat_type}, message_id: {sent.message_id}")
            return
        except Exception as e:
            error_msg = str(e)
            logging.error(f"Error in /post for {chat_type}: {error_msg}")
            await message.answer(f"❌ Ошибка: {error_msg}")
            return
    
    # Для супергрупп используем WebApp (откроется внутри Telegram, без браузера)
    if chat_type == "supergroup":
        # Проверяем реальный тип чата
        try:
            chat_info = await bot.get_chat(chat_id)
            real_chat_type = chat_info.type
            logging.info(f"Chat {chat_id} - message type: {chat_type}, real type: {real_chat_type}")
        except Exception as e:
            logging.warning(f"Could not get chat info: {e}")
            real_chat_type = chat_type
        
        # Проверяем, что URL правильный (должен начинаться с https://)
        if not share_url.startswith("https://"):
            logging.error(f"Invalid WebApp URL (must start with https://): {share_url}")
            await message.answer(
                f"❌ Ошибка: URL витрины должен начинаться с https://\n"
                f"Текущий URL: {share_url}"
            )
            return
        
        logging.info(f"Using WebApp URL for supergroup: {share_url}")
        
        # Проверяем, что URL правильный и доступен
        if not share_url.startswith("https://"):
            await message.answer(f"❌ Ошибка: URL должен начинаться с https://\nТекущий URL: {share_url}")
            return
        
        # Проверяем, что WebApp настроен в BotFather
        # Если URL не проходит валидацию, это может быть причиной BUTTON_TYPE_INVALID
        logging.info(f"WebApp URL validation: {share_url}")
        
        # ВАЖНО: WebApp кнопки работают ТОЛЬКО в личных чатах, НЕ в группах/каналах
        # Это ограничение Telegram API, а не баг
        # Для групп используем deep link на бота, который автоматически откроет витрину
        
        bot_link = await get_bot_deeplink(user_id)
        builder = InlineKeyboardBuilder()
        builder.row(types.InlineKeyboardButton(
            text="🛍️ Открыть магазин", 
            url=bot_link
        ))
        
        msg += "\n\n💡 Нажмите кнопку - откроется бот, и магазин запустится внутри Telegram!"
        
        try:
            sent = await message.answer(msg, reply_markup=builder.as_markup(), parse_mode="Markdown")
            logging.info(f"✅ Successfully posted store message to supergroup with deep link, message_id: {sent.message_id}")
            return
        except Exception as e:
            error_msg = str(e)
            logging.error(f"❌ Error posting to supergroup: {error_msg}")
            await message.answer(f"❌ Ошибка: {error_msg}")
            return
    
    
    # Fallback: используем URL кнопку
    builder_url = InlineKeyboardBuilder()
    builder_url.row(types.InlineKeyboardButton(
        text="🛍️ Открыть магазин", 
        url=share_url
    ))
    
    try:
        sent = await message.answer(msg, reply_markup=builder_url.as_markup(), parse_mode="Markdown")
        logging.info(f"Successfully posted store message with URL, message_id: {sent.message_id}, chat_id: {chat_id}")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error in /post: {error_msg}, chat_type: {chat_type}, chat_id: {chat_id}")
        await message.answer(f"❌ Ошибка: {error_msg}")

@dp.message(Command("manage"))
async def cmd_manage(message: Message):
    kb = [
        [KeyboardButton(text="➕ Добавить товар")],
        [KeyboardButton(text="🗑️ Удалить товар")],
        [KeyboardButton(text="📁 Добавить категорию")],
        [KeyboardButton(text="📋 Список категорий")],
        [KeyboardButton(text="📢 Управление каналами")],
        [KeyboardButton(text="📤 Поделиться витриной")]
    ]
    keyboard = ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)
    await message.answer("Управление витриной:", reply_markup=keyboard)

# Добавление категории
@dp.message(F.text == "📁 Добавить категорию")
async def start_add_category(message: Message, state: FSMContext):
    await state.update_data(user_id=message.from_user.id)
    await state.set_state(AddCategory.name)
    await message.answer("Введите название новой категории:", reply_markup=types.ReplyKeyboardRemove())

@dp.message(AddCategory.name)
async def process_category_name(message: Message, state: FSMContext):
    data = await state.get_data()
    user_id = data.get('user_id', message.from_user.id)
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{API_URL}/categories/",
            json={"name": message.text},
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await message.answer(f"✅ Категория '{message.text}' создана!")
            else:
                await message.answer(f"❌ Ошибка: {await resp.text()}")
    await state.clear()
    await cmd_manage(message)

@dp.message(F.text == "📋 Список категорий")
async def list_categories(message: Message):
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": message.from_user.id}) as resp:
            categories = await resp.json()
    
    if not categories:
        return await message.answer("Список категорий пуст. Создайте первую категорию!")
    
    text = "📁 Ваши категории:\n\n"
    for cat in categories:
        text += f"• {cat['name']} (ID: {cat['id']})\n"
    await message.answer(text)

# Управление каналами
@dp.message(F.text == "📢 Управление каналами")
async def manage_channels(message: Message):
    user_id = message.from_user.id
    
    # Получаем список каналов
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{API_URL}/channels/"
            logging.info(f"Requesting channels from {url} with user_id={user_id}")
            async with session.get(url, params={"user_id": user_id}) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    logging.error(f"Error getting channels: status={resp.status}, error={error_text}")
                    return await message.answer(f"❌ Ошибка при получении списка каналов (статус: {resp.status})")
                channels = await resp.json()
                logging.info(f"Successfully got {len(channels)} channels")
    except Exception as e:
        logging.error(f"Exception getting channels: {e}")
        return await message.answer(f"❌ Ошибка подключения к серверу: {str(e)}")
    
    if not channels:
        text = "📢 У вас пока нет добавленных каналов.\n\n"
        text += "**Как добавить канал:**\n"
        text += "1. Добавьте бота в канал/группу как администратора с правом публикации сообщений\n"
        text += "2. Отправьте боту @username канала (например: @mychannel)\n"
        text += "Или перешлите любое сообщение из канала/группы"
    else:
        text = "📢 Ваши каналы и группы:\n\n"
        for ch in channels:
            username_text = f"@{ch['username']}" if ch.get('username') else "без username"
            text += f"• {ch['title']} ({username_text})\n"
        text += "\n**Для добавления:** отправьте @username или перешлите сообщение из канала"
        text += "\n**Для удаления:** используйте кнопки ниже"
        
        # Кнопки для удаления
        builder = InlineKeyboardBuilder()
        for ch in channels:
            builder.button(
                text=f"❌ Удалить: {ch['title']}",
                callback_data=f"del_channel_{ch['id']}"
            )
        builder.adjust(1)
        await message.answer(text, reply_markup=builder.as_markup())
        return
    
    await message.answer(text)
    await message.answer("Отправьте @username канала или перешлите сообщение из канала/группы:")

# Удаление товара
@dp.message(F.text == "🗑️ Удалить товар")
async def delete_product_start(message: Message):
    user_id = message.from_user.id
    
    # Получаем список товаров пользователя
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/products/", params={"user_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении списка товаров")
            products = await resp.json()
    
    if not products:
        return await message.answer("У вас пока нет товаров для удаления.")
    
    # Показываем список товаров с кнопками для удаления
    text = "🗑️ Выберите товар для удаления:\n\n"
    builder = InlineKeyboardBuilder()
    
    for prod in products:
        price_text = f"{prod['price']} ₽"
        if prod.get('discount', 0) > 0:
            final_price = prod['price'] * (1 - prod['discount'] / 100)
            price_text = f"{prod['price']} ₽ → {final_price:.0f} ₽ (-{prod['discount']}%)"
        
        builder.button(
            text=f"❌ {prod['name']} ({price_text})",
            callback_data=f"del_product_{prod['id']}"
        )
    
    builder.adjust(1)
    await message.answer(text, reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("del_product_"))
async def delete_product_confirm(callback: types.CallbackQuery):
    product_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    
    # Удаляем товар через API
    async with aiohttp.ClientSession() as session:
        async with session.delete(
            f"{API_URL}/products/{product_id}",
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.answer("✅ Товар удален!", show_alert=True)
                await callback.message.delete()
                await cmd_manage(callback.message)
            elif resp.status == 404:
                await callback.answer("❌ Товар не найден", show_alert=True)
            else:
                error_text = await resp.text()
                await callback.answer(f"❌ Ошибка: {error_text}", show_alert=True)

# Обработка добавления канала через @username
@dp.message(F.text.startswith("@"))
async def add_channel_by_username(message: Message):
    username = message.text.strip("@").lower()
    user_id = message.from_user.id
    
    try:
        # Получаем информацию о чате через Bot API
        chat = await bot.get_chat(f"@{username}")
        
        channel_data = {
            "chat_id": chat.id,
            "username": username,
            "title": chat.title,
            "chat_type": chat.type,
            "user_id": user_id
        }
        
        # Сохраняем в БД
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/channels/",
                json=channel_data
            ) as resp:
                if resp.status == 200:
                    await message.answer(f"✅ Канал '{chat.title}' (@{username}) добавлен!")
                elif resp.status == 400:
                    await message.answer("⚠️ Этот канал уже добавлен")
                else:
                    error_text = await resp.text()
                    await message.answer(f"❌ Ошибка: {error_text}")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error adding channel by username: {error_msg}")
        if "chat not found" in error_msg.lower():
            await message.answer(
                "❌ Канал не найден.\n\n"
                "Убедитесь, что:\n"
                "1. Канал существует и публичный\n"
                "2. Бот добавлен в канал как администратор\n"
                "3. Username указан правильно (без @)"
            )
        else:
            await message.answer(f"❌ Ошибка: {error_msg}")

# Обработка добавления канала через пересылку
@dp.message(F.forward_from_chat)
async def add_channel_by_forward(message: Message):
    user_id = message.from_user.id
    forwarded_chat = message.forward_from_chat
    
    if not forwarded_chat:
        return
    
    try:
        chat_id = forwarded_chat.id
        chat_title = forwarded_chat.title
        chat_type = forwarded_chat.type
        username = forwarded_chat.username if hasattr(forwarded_chat, 'username') and forwarded_chat.username else None
        
        channel_data = {
            "chat_id": chat_id,
            "username": username,
            "title": chat_title,
            "chat_type": chat_type,
            "user_id": user_id
        }
        
        # Сохраняем в БД
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/channels/",
                json=channel_data
            ) as resp:
                if resp.status == 200:
                    await message.answer(f"✅ Канал '{chat_title}' добавлен!")
                elif resp.status == 400:
                    await message.answer("⚠️ Этот канал уже добавлен")
                else:
                    error_text = await resp.text()
                    await message.answer(f"❌ Ошибка: {error_text}")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error adding channel by forward: {error_msg}")
        await message.answer(f"❌ Ошибка при добавлении канала: {error_msg}")

# Обработчик callback для отправки витрины в канал
@dp.callback_query(F.data.startswith("share_"))
async def send_store_to_channel(callback: types.CallbackQuery):
    channel_id = int(callback.data.split("_")[1])
    user_id = callback.from_user.id
    
    # Получаем информацию о канале
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/channels/", params={"user_id": user_id}) as resp:
            if resp.status != 200:
                return await callback.answer("❌ Ошибка при получении информации о канале", show_alert=True)
            channels = await resp.json()
    
    channel = next((ch for ch in channels if ch['id'] == channel_id), None)
    if not channel:
        return await callback.answer("❌ Канал не найден", show_alert=True)
    
    share_url = f"{WEBAPP_URL}?user_id={user_id}"
    
    msg = "🛍️ **Магазин**\n\n"
    msg += "Нажмите кнопку ниже, чтобы открыть витрину с товарами!"
    
    chat_type = channel.get('chat_type', '').lower()
    
    # Проверяем реальный тип чата через API (на случай, если в БД сохранен неправильный тип)
    try:
        chat_info = await bot.get_chat(channel['chat_id'])
        real_chat_type = chat_info.type
        logging.info(f"Channel {channel['chat_id']} - stored type: {chat_type}, real type: {real_chat_type}")
        
        # Используем реальный тип чата
        # ВАЖНО: WebApp кнопки не работают при удаленной отправке (через bot.send_message)
        # даже в супергруппах. Используем deep link для всех случаев удаленной отправки
        if real_chat_type == 'supergroup':
            # Для удаленной отправки используем deep link на бота
            # Пользователь перейдет в бота, и там откроется WebApp кнопка
            bot_link = await get_bot_deeplink(user_id)
            builder = InlineKeyboardBuilder()
            builder.row(types.InlineKeyboardButton(
                text="🛍️ Открыть магазин", 
                url=bot_link
            ))
            
            msg += "\n\n💡 Нажмите кнопку - откроется бот, и магазин запустится внутри Telegram!"
            
            try:
                sent_msg = await bot.send_message(
                    chat_id=channel['chat_id'],
                    text=msg,
                    reply_markup=builder.as_markup(),
                    parse_mode="Markdown"
                )
                logging.info(f"✅ Successfully sent store to supergroup {channel['chat_id']} with deep link, message_id: {sent_msg.message_id}")
                await callback.answer(f"✅ Витрина отправлена в '{channel['title']}'!")
                return
            except Exception as e:
                error_msg = str(e)
                logging.error(f"❌ Error sending to supergroup {channel['chat_id']}: {error_msg}")
                
                if "chat not found" in error_msg.lower() or "not a member" in error_msg.lower():
                    error_text = "❌ Бот не является участником или не имеет прав на отправку сообщений"
                else:
                    error_text = f"❌ Ошибка: {error_msg}"
                await callback.answer(error_text, show_alert=True)
                return
        else:
            # Не супергруппа - используем deep link
            chat_type = real_chat_type
    except Exception as e:
        logging.warning(f"Could not get chat info for {channel['chat_id']}: {e}, using stored type: {chat_type}")
        # Если не удалось получить информацию, используем сохраненный тип
        if chat_type == 'supergroup':
            # Для удаленной отправки используем deep link (WebApp не работает при удаленной отправке)
            bot_link = await get_bot_deeplink(user_id)
            builder = InlineKeyboardBuilder()
            builder.row(types.InlineKeyboardButton(
                text="🛍️ Открыть магазин", 
                url=bot_link
            ))
            
            msg += "\n\n💡 Нажмите кнопку - откроется бот, и магазин запустится внутри Telegram!"
            
            try:
                sent_msg = await bot.send_message(
                    chat_id=channel['chat_id'],
                    text=msg,
                    reply_markup=builder.as_markup(),
                    parse_mode="Markdown"
                )
                logging.info(f"Successfully sent store to {chat_type} {channel['chat_id']} with deep link, message_id: {sent_msg.message_id}")
                await callback.answer(f"✅ Витрина отправлена в '{channel['title']}'!")
                return
            except Exception as send_err:
                error_msg = str(send_err)
                logging.error(f"Error sending to {chat_type}: {error_msg}")
                error_text = f"❌ Ошибка: {error_msg}"
                await callback.answer(error_text, show_alert=True)
                return
    
    # Для каналов и обычных групп используем deep link на бота
    if chat_type == 'channel':
        msg += "\n\n💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!"
    elif chat_type == 'group':
        msg += "\n\n💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!\n"
        msg += "💡 **Совет:** Конвертируйте группу в супергруппу, чтобы магазин открывался сразу внутри Telegram"
    
    bot_link = await get_bot_deeplink(user_id)
    builder_url = InlineKeyboardBuilder()
    builder_url.row(types.InlineKeyboardButton(
        text="🛍️ Открыть магазин", 
        url=bot_link
    ))
    
    try:
        sent_msg = await bot.send_message(
            chat_id=channel['chat_id'],
            text=msg,
            reply_markup=builder_url.as_markup(),
            parse_mode="Markdown"
        )
        logging.info(f"Successfully sent store to {chat_type} {channel['chat_id']} with URL, message_id: {sent_msg.message_id}")
        await callback.answer(f"✅ Витрина отправлена в '{channel['title']}'!")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error sending store to {chat_type} {channel['chat_id']}: {error_msg}")
        
        if "chat not found" in error_msg.lower() or "not a member" in error_msg.lower():
            error_text = "❌ Бот не является участником или не имеет прав на отправку сообщений"
        else:
            error_text = f"❌ Ошибка: {error_msg}"
        
        await callback.answer(error_text, show_alert=True)

# Обработчик callback для удаления канала
@dp.callback_query(F.data.startswith("del_channel_"))
async def delete_channel(callback: types.CallbackQuery):
    channel_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    
    async with aiohttp.ClientSession() as session:
        async with session.delete(
            f"{API_URL}/channels/{channel_id}",
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.answer("✅ Канал удален!")
                # Обновляем сообщение
                await manage_channels(callback.message)
            else:
                error_text = await resp.text()
                await callback.answer(f"❌ Ошибка: {error_text}", show_alert=True)

@dp.message(F.text == "➕ Добавить товар")
async def start_add_product(message: Message, state: FSMContext):
    await state.update_data(user_id=message.from_user.id)
    await state.set_state(AddProduct.name)
    await message.answer("Введите название товара:", reply_markup=types.ReplyKeyboardRemove())

@dp.message(AddProduct.name)
async def process_name(message: Message, state: FSMContext):
    await state.update_data(name=message.text)
    await state.set_state(AddProduct.price)
    await message.answer("Введите цену товара (число):")

@dp.message(AddProduct.price)
async def process_price(message: Message, state: FSMContext):
    try:
        price = float(message.text)
        await state.update_data(price=price)
        
        # Получаем категории пользователя
        data = await state.get_data()
        user_id = data.get('user_id', message.from_user.id)
        
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/categories/", params={"user_id": user_id}) as resp:
                categories = await resp.json()
        
        if not categories:
            await message.answer("Сначала создайте категорию! Используйте /manage")
            return await state.clear()
            
        builder = InlineKeyboardBuilder()
        for cat in categories:
            builder.button(text=cat['name'], callback_data=f"cat_{cat['id']}")
        builder.adjust(2)
        
        await state.set_state(AddProduct.category)
        await message.answer("Выберите категорию:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")

@dp.callback_query(StateFilter(AddProduct.category))
async def process_category(callback: types.CallbackQuery, state: FSMContext):
    cat_id = int(callback.data.split("_")[1])
    await state.update_data(category_id=cat_id)
    await state.set_state(AddProduct.discount)
    await callback.message.answer("Введите скидку на товар в % (если нет, введите 0):")
    await callback.answer()

@dp.message(AddProduct.discount)
async def process_discount(message: Message, state: FSMContext):
    try:
        discount = float(message.text)
        await state.update_data(discount=discount)
        await state.set_state(AddProduct.description)
        await message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    except ValueError:
        await message.answer("Пожалуйста, введите число (например, 10 или 0).")

@dp.message(AddProduct.description)
async def process_description(message: Message, state: FSMContext):
    description = message.text if message.text != "/skip" else None
    await state.update_data(description=description, photos=[])  # Инициализируем массив фото
    await state.set_state(AddProduct.photos)
    await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")

@dp.message(AddProduct.photos, F.photo)
async def process_photos(message: Message, state: FSMContext):
    data = await state.get_data()
    photos_list = data.get('photos', [])
    
    # Проверяем лимит (до 5 фото)
    if len(photos_list) >= 5:
        await message.answer("⚠️ Максимум 5 фото. Отправьте /done чтобы закончить добавление товара.")
        return
    
    photo = message.photo[-1]
    
    # Сохраняем file_id и путь к файлу во временное хранилище
    try:
        file_info = await bot.get_file(photo.file_id)
        file_ext = os.path.splitext(file_info.file_path)[1] or '.jpg'
        
        # Скачиваем во временный файл
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            tmp_path = tmp_file.name
            await bot.download_file(file_info.file_path, tmp_path)
        
        # Сохраняем путь к временному файлу
        photos_list.append({
            'file_id': photo.file_id,
            'tmp_path': tmp_path,
            'file_ext': file_ext
        })
        
        await state.update_data(photos=photos_list)
        
        remaining = 5 - len(photos_list)
        if remaining > 0:
            await message.answer(f"✅ Фото {len(photos_list)}/5 добавлено. Отправьте еще фото или /done чтобы закончить.")
        else:
            await message.answer("✅ Добавлено максимальное количество фото (5). Отправьте /done чтобы закончить.")
    except Exception as e:
        logging.error(f"Exception in process_photos: {e}", exc_info=True)
        await message.answer(f"❌ Ошибка при обработке фото: {str(e)}")

@dp.message(AddProduct.photos)
async def process_photos_done(message: Message, state: FSMContext):
    if message.text == "/done" or message.text == "/skip":
        data = await state.get_data()
        user_id = data.get('user_id', message.from_user.id)
        photos_list = data.get('photos', [])
        
        try:
            # Отправляем данные на бэкенд
            payload = aiohttp.FormData()
            payload.add_field('name', data['name'])
            payload.add_field('price', str(data['price']))
            payload.add_field('category_id', str(data['category_id']))
            payload.add_field('user_id', str(user_id))
            payload.add_field('discount', str(data.get('discount', 0)))
            if data.get('description'):
                payload.add_field('description', data['description'])
            
            # Добавляем все фото (FastAPI ожидает список файлов с одним именем поля)
            # ВАЖНО: для нескольких файлов нужно использовать одно имя поля 'images'
            # Открываем все файлы и сохраняем их в список, чтобы они оставались открытыми
            file_handles = []
            try:
                for idx, photo_data in enumerate(photos_list):
                    tmp_path = photo_data['tmp_path']
                    file_ext = photo_data['file_ext']
                    
                    # Открываем файл для чтения (остается открытым до отправки)
                    file_handle = open(tmp_path, 'rb')
                    file_handles.append(file_handle)
                    
                    # Используем одно и то же имя поля 'images' для всех файлов
                    # FastAPI соберет их в список
                    payload.add_field('images', 
                                     file_handle, 
                                     filename=f"product_{photo_data['file_id']}{file_ext}",
                                     content_type='image/jpeg')
                    
                    logging.info(f"Added image {idx+1} to payload: {tmp_path}")
            except Exception as e:
                # Закрываем все открытые файлы в случае ошибки
                for fh in file_handles:
                    try:
                        fh.close()
                    except:
                        pass
                raise e
            
            logging.info(f"Sending product data to {API_URL}/products/ with {len(photos_list)} photos")
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(f"{API_URL}/products/", data=payload) as resp:
                        response_text = await resp.text()
                        logging.info(f"Backend response: status={resp.status}, body={response_text[:500]}")
                        
                        if resp.status == 200:
                            result = await resp.json()
                            images_count = len(result.get('images_urls', []))
                            logging.info(f"Product created successfully: id={result.get('id')}, images_count={images_count}")
                            await message.answer(f"✅ Товар успешно добавлен!\n\n📷 Фото: {images_count} шт.")
                        else:
                            logging.error(f"Error creating product: status={resp.status}, error={response_text}")
                            await message.answer(f"❌ Ошибка при сохранении (статус {resp.status}): {response_text[:200]}")
            except Exception as req_e:
                logging.error(f"Exception during request: {req_e}", exc_info=True)
                await message.answer(f"❌ Ошибка при отправке запроса: {str(req_e)}")
            finally:
                # Закрываем все открытые файлы после отправки
                for fh in file_handles:
                    try:
                        fh.close()
                    except:
                        pass
        except Exception as e:
            logging.error(f"Exception in process_photos_done: {e}", exc_info=True)
            await message.answer(f"❌ Ошибка при сохранении товара: {str(e)}")
        finally:
            # Удаляем временные файлы
            for photo_data in photos_list:
                try:
                    if os.path.exists(photo_data['tmp_path']):
                        os.unlink(photo_data['tmp_path'])
                except:
                    pass
            
            await state.clear()
            await cmd_manage(message)
    else:
        await message.answer("Отправьте фото товара, /done чтобы закончить, или /skip чтобы пропустить фото:")

async def send_reservation_notification(product_owner_id: int, product_id: int, reserved_by_user_id: int, reserved_until: str, product_name: str):
    """Отправляет уведомление владельцу магазина о резервации товара"""
    try:
        # Получаем информацию о пользователе, который зарезервировал
        try:
            reserved_by_user = await bot.get_chat(reserved_by_user_id)
            reserved_by_name = reserved_by_user.first_name or "Пользователь"
            if reserved_by_user.last_name:
                reserved_by_name += f" {reserved_by_user.last_name}"
            if reserved_by_user.username:
                reserved_by_name += f" (@{reserved_by_user.username})"
        except:
            reserved_by_name = "Пользователь"
        
        # Формируем ссылку на товар
        product_url = f"{WEBAPP_URL}?user_id={product_owner_id}&product_id={product_id}"
        
        # Формируем сообщение
        from datetime import datetime
        reserved_until_dt = datetime.fromisoformat(reserved_until.replace('Z', '+00:00'))
        hours = (reserved_until_dt - datetime.utcnow()).total_seconds() / 3600
        hours_text = f"{int(hours)} ч."
        if hours < 1:
            minutes = int((reserved_until_dt - datetime.utcnow()).total_seconds() / 60)
            hours_text = f"{minutes} мин."
        
        message = f"🔔 **Новая резервация товара**\n\n"
        message += f"📦 Товар: {product_name}\n"
        message += f"👤 Зарезервировал: {reserved_by_name}\n"
        message += f"⏰ Резервация до: {hours_text}\n\n"
        message += f"💡 Товар временно недоступен для других покупателей."
        
        # Создаем кнопку для просмотра товара
        builder = InlineKeyboardBuilder()
        builder.row(types.InlineKeyboardButton(
            text="📦 Посмотреть товар",
            web_app=WebAppInfo(url=product_url)
        ))
        
        # Отправляем уведомление
        await bot.send_message(
            chat_id=product_owner_id,
            text=message,
            reply_markup=builder.as_markup(),
            parse_mode="Markdown"
        )
        
        logging.info(f"Reservation notification sent to user {product_owner_id} for product {product_id}")
    except Exception as e:
        logging.error(f"Error sending reservation notification: {e}", exc_info=True)

async def main():
    print("Бот запущен. Все пользователи могут управлять своими витринами.")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
