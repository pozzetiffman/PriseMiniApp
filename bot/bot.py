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
from aiogram.types import Message, CallbackQuery, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.exceptions import TelegramNetworkError, TelegramAPIError, TelegramServerError

# Загружаем .env
load_dotenv(dotenv_path="../.env")

BOT_LOG_LEVEL = os.getenv("BOT_LOG_LEVEL", "WARNING").upper()
if BOT_LOG_LEVEL not in ("DEBUG", "INFO", "WARNING", "ERROR"):
    BOT_LOG_LEVEL = "WARNING"
logging.basicConfig(
    level=getattr(logging, BOT_LOG_LEVEL, logging.WARNING),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")
API_URL = "http://localhost:8000/api"

# Проверка наличия токена
if not TOKEN:
    print("❌ ОШИБКА: TELEGRAM_BOT_TOKEN не найден в переменных окружения!")
    print("Проверьте файл .env в корне проекта.")
    print("Убедитесь, что файл .env содержит строку: TELEGRAM_BOT_TOKEN=ваш_токен")
    exit(1)

bot = Bot(token=TOKEN)
dp = Dispatcher()

# ========== REFACTORING STEP 2.1: get_bot_username ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import get_bot_username
except ImportError:
    from utils import get_bot_username

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Кэш для username бота
_bot_username = None

async def get_bot_username():
    \"\"\"Получить username бота\"\"\"
    global _bot_username
    if _bot_username is None:
        bot_info = await bot.get_me()
        _bot_username = bot_info.username
    return _bot_username
"""
# ========== END REFACTORING STEP 2.1 ==========

# ========== REFACTORING STEP 2.2: get_bot_deeplink ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import get_bot_deeplink
except ImportError:
    from utils import get_bot_deeplink

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def get_bot_deeplink(user_id: int):
    \"\"\"Получить deep link на бота с параметром для открытия витрины\"\"\"
    username = await get_bot_username()
    return f"https://t.me/{username}?start=store_{user_id}"
"""
# ========== END REFACTORING STEP 2.2 ==========

# ========== REFACTORING STEP 2.3: get_shop_name ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import get_shop_name
except ImportError:
    from utils import get_shop_name

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def get_shop_name(user_id: int) -> str:
    \"\"\"Получить название магазина для пользователя\"\"\"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
                if resp.status == 200:
                    settings = await resp.json()
                    return settings.get('shop_name', 'магазин')
                else:
                    return 'магазин'
    except:
        return 'магазин'
"""
# ========== END REFACTORING STEP 2.3 ==========

# ========== REFACTORING STEP 2.4: get_shop_settings ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import get_shop_settings
except ImportError:
    from utils import get_shop_settings

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def get_shop_settings(user_id: int) -> dict:
    \"\"\"Получить настройки магазина для пользователя\"\"\"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    return {}
    except:
        return {}
"""
# ========== END REFACTORING STEP 2.4 ==========

# ========== REFACTORING STEP 2.5: send_shop_message ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import send_shop_message
except ImportError:
    from utils import send_shop_message

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def send_shop_message(bot_or_message, chat_id_or_message, msg: str, reply_markup, shop_owner_id: int):
    \"\"\"
    Отправить сообщение о магазине с фото, если оно есть.
    bot_or_message - объект bot или message
    chat_id_or_message - chat_id (для bot.send_message) или message (для message.answer)
    \"\"\"
    shop_settings = await get_shop_settings(shop_owner_id)
    welcome_image_url = shop_settings.get('welcome_image_url')
    
    # Определяем, используем ли bot.send_message или message.answer
    is_bot_send = hasattr(bot_or_message, 'send_message') and isinstance(chat_id_or_message, int)
    
    if welcome_image_url:
        if is_bot_send:
            return await bot_or_message.send_photo(
                chat_id=chat_id_or_message,
                photo=welcome_image_url,
                caption=msg,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
        else:
            return await chat_id_or_message.answer_photo(
                photo=welcome_image_url,
                caption=msg,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
    else:
        if is_bot_send:
            return await bot_or_message.send_message(
                chat_id=chat_id_or_message,
                text=msg,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
        else:
            return await chat_id_or_message.answer(
                text=msg,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
"""
# ========== END REFACTORING STEP 2.5 ==========

# ========== REFACTORING STEP 1.1: AddCategory ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import AddCategory
except ImportError:
    from states import AddCategory

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class AddCategory(StatesGroup):
    name = State()
    parent_choice = State()  # Выбор родительской категории (для подкатегорий)
"""
# ========== END REFACTORING STEP 1.1 ==========

# ========== REFACTORING STEP 1.2: AddProduct ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import AddProduct
except ImportError:
    from states import AddProduct

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class AddProduct(StatesGroup):
    name = State()
    product_type = State()  # Тип товара: обычный, под заказ, для покупки
    price = State()
    price_from = State()  # Цена от (для товаров для покупки)
    price_to = State()  # Цена до (для товаров для покупки)
    price_fixed = State()  # Фиксированная цена (для товаров для покупки)
    price_type = State()  # Тип цены: range или fixed (для товаров для покупки)
    quantity_from = State()  # Количество от (для товаров для покупки)
    quantity_unit = State()  # Единица измерения (шт или кг)
    category = State()
    discount = State()
    description = State()
    quantity = State()  # Количество товара
    is_hot_offer = State()  # Горящее предложение
    quantity_show_enabled = State()  # Показ количества товара
    photos = State()  # Состояние для загрузки нескольких фото
"""
# ========== END REFACTORING STEP 1.2 ==========

# ========== REFACTORING STEP 1.3: AddChannel ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import AddChannel
except ImportError:
    from states import AddChannel

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class AddChannel(StatesGroup):
    waiting_for_channel = State()
"""
# ========== END REFACTORING STEP 1.3 ==========

# ========== REFACTORING STEP 1.4: SetShopName ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import SetShopName
except ImportError:
    from states import SetShopName

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class SetShopName(StatesGroup):
    name = State()
"""
# ========== END REFACTORING STEP 1.4 ==========

# ========== REFACTORING STEP 1.5: SetWelcomeImage ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import SetWelcomeImage
except ImportError:
    from states import SetWelcomeImage

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class SetWelcomeImage(StatesGroup):
    image = State()
"""
# ========== END REFACTORING STEP 1.5 ==========

# ========== REFACTORING STEP 1.6: SetWelcomeDescription ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import SetWelcomeDescription
except ImportError:
    from states import SetWelcomeDescription

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class SetWelcomeDescription(StatesGroup):
    description = State()
"""
# ========== END REFACTORING STEP 1.6 ==========

# ========== REFACTORING STEP 1.7: ConnectBot ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .states import ConnectBot
except ImportError:
    from states import ConnectBot

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
class ConnectBot(StatesGroup):
    token = State()
    web_app_name = State()  # Название Web App (создается через /newapp в BotFather)
"""
# ========== END REFACTORING STEP 1.7 ==========

# Состояния для категорий и товаров

# ========== REFACTORING STEP 2.6: is_command ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import is_command
except ImportError:
    from utils import is_command

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
def is_command(text: str) -> bool:
    \"\"\"Проверяет, является ли текст командой\"\"\"
    if not text:
        return False
    return text.startswith('/') or text in ['/cancel', '/start', '/manage', '/post', '/mylink', '/getlink', '/connect']
"""
# ========== END REFACTORING STEP 2.6 ==========

# ========== REFACTORING STEP 2.7: is_menu_button ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import is_menu_button
except ImportError:
    from utils import is_menu_button

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
def is_menu_button(text: str) -> bool:
    \"\"\"Проверяет, является ли текст кнопкой меню\"\"\"
    if not text:
        return False
    menu_buttons = [
        "➕ Добавить товар",
        "🗑️ Удалить товар",
        "📁 Добавить категорию",
        "📋 Список категорий",
        "🏷️ Название магазина",
        "🖼️ Логотип магазина",
        "📝 Описание магазина",
        "📢 Управление каналами",
        "📤 Поделиться витриной",
        "🤖 Подключить бота",
        "🔗 Мои ссылки"
    ]
    return text in menu_buttons
"""
# ========== END REFACTORING STEP 2.7 ==========

# ========== REFACTORING STEP 2.8: clear_state_if_needed ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .utils import clear_state_if_needed
except ImportError:
    from utils import clear_state_if_needed

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def clear_state_if_needed(message: Message, state: FSMContext, current_state=None):
    \"\"\"
    Проверяет и очищает состояние FSM, если пользователь использует другую команду.
    Возвращает True, если состояние было очищено.
    \"\"\"
    current_fsm_state = await state.get_state()
    
    # Если есть активное состояние и это не текущее состояние команды
    if current_fsm_state and current_fsm_state != current_state:
        # Определяем тип состояния для информативного сообщения
        state_str = str(current_fsm_state)
        
        # Формируем сообщение в зависимости от типа состояния
        if "ConnectBot" in state_str:
            await state.clear()
            await message.answer(
                "ℹ️ Процесс подключения бота отменен.\\n\\n"
                "Вы можете начать заново, используя команду <code>/connect</code> или кнопку <b>🤖 Подключить бота</b>.",
                parse_mode="HTML"
            )
            return True
        elif "AddProduct" in state_str:
            # Удаляем временные файлы фото, если они есть (ПЕРЕД очисткой состояния)
            try:
                data = await state.get_data()
                photos_list = data.get('photos', [])
                for photo_data in photos_list:
                    try:
                        if 'tmp_path' in photo_data and os.path.exists(photo_data['tmp_path']):
                            os.unlink(photo_data['tmp_path'])
                    except:
                        pass
            except:
                pass
            await state.clear()
            return True
        elif "AddCategory" in state_str:
            await state.clear()
            return True
        elif "SetShopName" in state_str:
            await state.clear()
            return True
        elif "SetWelcomeImage" in state_str:
            await state.clear()
            return True
        elif "SetWelcomeDescription" in state_str:
            await state.clear()
            return True
        elif "AddChannel" in state_str:
            await state.clear()
            return True
        else:
            # Для любых других состояний просто очищаем
            await state.clear()
            return True
    
    return False
"""
# ========== END REFACTORING STEP 2.8 ==========

# ========== REFACTORING STEP 3.1: cmd_cancel ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_cancel
except ImportError:
    from handlers.commands import cmd_cancel

@dp.message(Command("cancel"))
async def cmd_cancel_handler(message: Message, state: FSMContext):
    """Обработчик команды /cancel"""
    await cmd_cancel(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext):
    \"\"\"Отменить текущую операцию и очистить состояние FSM\"\"\"
    current_fsm_state = await state.get_state()
    if current_fsm_state:
        # Удаляем временные файлы, если они есть (для AddProduct) - ПЕРЕД очисткой состояния
        try:
            data = await state.get_data()
            photos_list = data.get('photos', [])
            for photo_data in photos_list:
                try:
                    if 'tmp_path' in photo_data and os.path.exists(photo_data['tmp_path']):
                        os.unlink(photo_data['tmp_path'])
                except:
                    pass
        except:
            pass
        
        await state.clear()
        await message.answer("✅ Операция отменена. Используйте /manage для управления витриной.")
    else:
        await message.answer("ℹ️ Нет активных операций для отмены.")
"""
# ========== END REFACTORING STEP 3.1 ==========

# ========== REFACTORING STEP 3.2: cmd_start ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_start
except ImportError:
    from handlers.commands import cmd_start

@dp.message(Command("start"))
async def cmd_start_handler(message: Message, command: CommandObject, state: FSMContext):
    """Обработчик команды /start"""
    await cmd_start(message, command, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject, state: FSMContext):
    # Сбрасываем состояние FSM при использовании команды /start
    await clear_state_if_needed(message, state)
    # Проверяем, есть ли параметр в команде (например, /start store_123456)
    param = command.args if command.args else None
    
    if param and param.startswith("store_"):
        # Пользователь перешел по ссылке на витрину
        try:
            store_owner_id = int(param.replace("store_", ""))
            share_url = f"{WEBAPP_URL}?user_id={store_owner_id}"
            
            # Получаем настройки магазина
            shop_settings = await get_shop_settings(store_owner_id)
            shop_name = shop_settings.get('shop_name', 'магазин')
            shop_name_display = shop_name if shop_name != 'магазин' else 'Магазин'
            button_text = f"Открыть {shop_name_display}" if shop_name != 'магазин' else "🛍️ Открыть магазин"
            welcome_image_url = shop_settings.get('welcome_image_url')
            
            builder = InlineKeyboardBuilder()
            builder.row(types.InlineKeyboardButton(
                text=button_text, 
                web_app=WebAppInfo(url=share_url)
            ))
            
            welcome_description = shop_settings.get('welcome_description')
            
            msg = f"**{shop_name_display}**\n\n"
            if welcome_description:
                msg += f"{welcome_description}\n\n"
            msg += "Нажмите кнопку ниже, чтобы открыть витрину с товарами."
            
            # Отправляем сообщение с фото, если оно есть
            if welcome_image_url:
                await message.answer_photo(
                    photo=welcome_image_url,
                    caption=msg,
                    reply_markup=builder.as_markup(),
                    parse_mode="Markdown"
                )
            else:
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
"""
# ========== END REFACTORING STEP 3.2 ==========

# ========== REFACTORING STEP 3.3: cmd_getlink ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_getlink
except ImportError:
    from handlers.commands import cmd_getlink

@dp.message(Command("getlink"))
async def cmd_getlink_handler(message: Message, command: CommandObject, state: FSMContext):
    """Обработчик команды /getlink"""
    await cmd_getlink(message, command, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(Command("getlink"))
async def cmd_getlink(message: Message, command: CommandObject, state: FSMContext):
    # Сбрасываем состояние FSM при использовании команды /getlink
    await clear_state_if_needed(message, state)
    \"\"\"
    Получить Web App ссылку для бота.
    Если бот зарегистрирован - показывает ссылку автоматически.
    Если нет - можно указать токен и название Web App.
    Формат: /getlink [bot_token] [web_app_name]
    \"\"\"
    user_id = message.from_user.id
    args = command.args if command.args else ""
    
    # Если параметры не указаны, пытаемся получить ссылки для всех зарегистрированных ботов
    if not args:
        try:
            async with aiohttp.ClientSession() as session:
                # Получаем список подключенных ботов пользователя
                async with session.get(
                    f"{API_URL}/bots/my",
                    params={"owner_user_id": user_id}
                ) as resp:
                    if resp.status != 200:
                        return await message.answer(
                            "❌ <b>Использование:</b>\\n\\n"
                            "<code>/getlink</code> - показать ссылки для всех зарегистрированных ботов\\n"
                            "<code>/getlink &lt;bot_token&gt; &lt;web_app_name&gt;</code> - получить ссылку для нового бота\\n\\n"
                            "<b>Примеры:</b>\\n"
                            "• <code>/getlink</code> (для зарегистрированных ботов)\\n"
                            "• <code>/getlink 8026360824:AAEI9RAEODgwcKHmkJ0MAFkQPXkNzGcW46c shop1</code>",
                            parse_mode="HTML"
                        )
                    
                    bots = await resp.json()
                    
                    if not bots:
                        return await message.answer(
                            "🤖 <b>У вас нет подключенных ботов</b>\\n\\n"
                            "Используйте команду <code>/connect</code> для подключения бота.\\n\\n"
                            "Или используйте формат:\\n"
                            "<code>/getlink &lt;bot_token&gt; &lt;web_app_name&gt;</code>",
                            parse_mode="HTML"
                        )
                    
                    # Формируем сообщение со ссылками
                    msg = "🔗 <b>Web App ссылки на ваши магазины:</b>\\n\\n"
                    
                    for bot in bots:
                        bot_username = bot.get("bot_username", "unknown")
                        is_active = bot.get("is_active", True)
                        web_app_name = bot.get("direct_link_name") or "shop"
                        
                        if is_active:
                            web_app_link = f"t.me/{bot_username}/{web_app_name}"
                            bot_username_escaped = bot_username.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                            web_app_name_escaped = web_app_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                            msg += f"🤖 <b>@{bot_username_escaped}</b>\\n"
                            msg += f"🔗 <code>{web_app_link}</code>\\n"
                            msg += f"📱 Web App: <code>{web_app_name_escaped}</code>\\n\\n"
                    
                    msg += "💡 <b>Как использовать:</b>\\n"
                    msg += "• Скопируйте ссылку и поделитесь ею\\n"
                    msg += "• Ссылка откроет Mini App <b>поверх чата</b> без перехода в бота\\n"
                    msg += "• Работает в группах и каналах"
                    
                    await message.answer(msg, parse_mode="HTML")
                    return
        except Exception as e:
            logging.error(f"Exception getting registered bots: {e}")
            return await message.answer(
                f"❌ Ошибка при получении списка ботов: {str(e)}",
                parse_mode="HTML"
            )
    
    # Если указаны параметры, получаем ссылку по токену
    parts = args.strip().split(maxsplit=1)
    if len(parts) < 2:
        return await message.answer(
            "❌ Не указано название Web App.\\n\\n"
            "<b>Формат:</b> <code>/getlink &lt;bot_token&gt; &lt;web_app_name&gt;</code>\\n\\n"
            "<b>Пример:</b> <code>/getlink 8026360824:AAEI9RAEODgwcKHmkJ0MAFkQPXkNzGcW46c shop1</code>\\n\\n"
            "💡 Или просто <code>/getlink</code> для зарегистрированных ботов.",
            parse_mode="HTML"
        )
    
    bot_token = parts[0]
    web_app_name = parts[1]
    
    # Проверяем формат токена
    if ':' not in bot_token:
        return await message.answer(
            "❌ Неверный формат токена.\\n\\n"
            "Токен должен быть в формате: <code>123456:ABC-DEF...</code>",
            parse_mode="HTML"
        )
    
    try:
        # Получаем информацию о боте через Telegram API
        async with aiohttp.ClientSession() as session:
            url = f"https://api.telegram.org/bot{bot_token}/getMe"
            async with session.get(url) as resp:
                if resp.status != 200:
                    return await message.answer(
                        "❌ Ошибка при получении информации о боте.\\n\\n"
                        "Проверьте правильность токена.",
                        parse_mode="HTML"
                    )
                
                data = await resp.json()
                if not data.get("ok"):
                    return await message.answer(
                        f"❌ Ошибка Telegram API: {data.get('description', 'Unknown error')}",
                        parse_mode="HTML"
                    )
                
                bot_info = data.get("result", {})
                bot_username = bot_info.get("username")
                
                if not bot_username:
                    return await message.answer(
                        "❌ Бот не имеет username.\\n\\n"
                        "Убедитесь, что бот имеет username в @BotFather.",
                        parse_mode="HTML"
                    )
                
                # Формируем Web App ссылку
                web_app_link = f"t.me/{bot_username}/{web_app_name}"
                
                await message.answer(
                    f"✅ <b>Web App ссылка для бота:</b>\\n\\n"
                    f"🤖 Бот: <b>@{bot_username}</b>\\n"
                    f"📱 Название Web App: <code>{web_app_name}</code>\\n"
                    f"🔗 Ссылка: <code>{web_app_link}</code>\\n\\n"
                    f"💡 <b>Как использовать:</b>\\n"
                    f"• Скопируйте ссылку и поделитесь ею\\n"
                    f"• Ссылка откроет Mini App <b>поверх чата</b> без перехода в бота\\n"
                    f"• Работает в группах и каналах\\n\\n"
                    f"⚠️ <b>Важно:</b> Убедитесь, что Web App с названием <code>{web_app_name}</code> создан через <code>/newapp</code> в @BotFather для этого бота.",
                    parse_mode="HTML"
                )
                
    except Exception as e:
        logging.error(f"Exception getting bot link: {e}")
        await message.answer(
            f"❌ Произошла ошибка: {str(e)}",
            parse_mode="HTML"
        )
"""
# ========== END REFACTORING STEP 3.3 ==========

# ========== REFACTORING STEP 3.4: cmd_connect ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_connect
except ImportError:
    from handlers.commands import cmd_connect

@dp.message(Command("connect"))
async def cmd_connect_handler(message: Message, state: FSMContext):
    """Обработчик команды /connect"""
    await cmd_connect(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(Command("connect"))
async def cmd_connect(message: Message, state: FSMContext):
    # Сбрасываем предыдущее состояние перед началом новой операции
    await clear_state_if_needed(message, state, ConnectBot.token)
    \"\"\"
    Подключить нового бота к системе.
    Пользователь создает бота в @BotFather и подключает его через эту команду.
    \"\"\"
    user_id = message.from_user.id
    
    await message.answer(
        "🤖 <b>Подключение бота к системе</b>\\n\\n"
        "Чтобы подключить своего бота:\\n\\n"
        "1️⃣ Создайте бота в @BotFather:\\n"
        "   • Откройте @BotFather\\n"
        "   • Отправьте <code>/newbot</code>\\n"
        "   • Следуйте инструкциям\\n"
        "   • Скопируйте токен бота\\n\\n"
        "2️⃣ Отправьте токен бота сюда\\n\\n"
        "3️⃣ Укажите название Web App\\n\\n"
        "4️⃣ Создайте Web App в @BotFather:\\n"
        "   • Откройте @BotFather\\n"
        "   • Отправьте <code>/newapp</code>\\n"
        "   • Выберите вашего бота\\n"
        "   • Введите название Web App (то же, что в шаге 3)\\n"
        "   • Введите описание\\n"
        "   • Загрузите фото (640x360)\\n"
        "   • URL: <code>https://webapp-eight-vert.vercel.app</code>\\n\\n"
        "💡 <b>Отправьте токен бота сейчас:</b>",
        parse_mode="HTML"
    )
    
    await state.set_state(ConnectBot.token)
"""
# ========== END REFACTORING STEP 3.4 ==========

# ========== REFACTORING STEP 8.1: process_bot_token ==========
# TODO: REFACTORING STEP 8.1 - process_bot_token
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.bots import process_bot_token
except ImportError:
    from handlers.bots import process_bot_token

@dp.message(ConnectBot.token)
async def process_bot_token_handler(message: Message, state: FSMContext):
    """Обработчик токена бота"""
    await process_bot_token(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(ConnectBot.token)
async def process_bot_token(message: Message, state: FSMContext):
    \"\"\"
    Обработать токен бота и сохранить его, затем запросить название Web App.
    \"\"\"
    # Если пользователь отправил команду или кнопку меню, сбрасываем состояние и передаем управление соответствующему обработчику
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        # Сбрасываем состояние перед передачей управления
        await clear_state_if_needed(message, state)
        # Возвращаем управление, чтобы сообщение было обработано соответствующим обработчиком
        return
    
    user_id = message.from_user.id
    bot_token = message.text.strip()
    
    # Проверяем формат токена (примерно: 123456:ABC-DEF...)
    if not bot_token or ':' not in bot_token:
        await message.answer(
            "❌ Неверный формат токена.\\n\\n"
            "Токен должен быть в формате: <code>123456:ABC-DEF...</code>\\n\\n"
            "Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
            parse_mode="HTML"
        )
        return
    
    # Сохраняем токен в состоянии
    await state.update_data(bot_token=bot_token)
    
    # Запрашиваем название Web App
    await message.answer(
        "✅ Токен принят!\\n\\n"
        "📝 <b>Теперь укажите название Web App</b>\\n\\n"
        "Это название, которое вы указали при создании Web App через <code>/newapp</code> в @BotFather.\\n"
        "Например: <code>shop1</code>, <code>TGshowcase</code>, <code>my_shop</code> и т.д.\\n\\n"
        "💡 Если вы еще не создали Web App, укажите любое название (например: <code>shop</code>).\\n"
        "Затем создайте Web App через <code>/newapp</code> в @BotFather с этим же названием.\\n\\n"
        "<b>Отправьте название Web App:</b>",
        parse_mode="HTML"
    )
    
    await state.set_state(ConnectBot.web_app_name)
"""
# ========== END REFACTORING STEP 8.1 ==========

# ========== REFACTORING STEP 8.2: process_web_app_name ==========
# TODO: REFACTORING STEP 8.2 - process_web_app_name
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.bots import process_web_app_name
except ImportError:
    from handlers.bots import process_web_app_name

@dp.message(ConnectBot.web_app_name)
async def process_web_app_name_handler(message: Message, state: FSMContext):
    """Обработчик названия Web App"""
    await process_web_app_name(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(ConnectBot.web_app_name)
async def process_web_app_name(message: Message, state: FSMContext):
    \"\"\"
    Обработать название Web App и зарегистрировать бота.
    \"\"\"
    # Если пользователь отправил команду или кнопку меню, сбрасываем состояние и передаем управление соответствующему обработчику
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        # Сбрасываем состояние перед передачей управления
        await clear_state_if_needed(message, state)
        # Возвращаем управление, чтобы сообщение было обработано соответствующим обработчиком
        return
    
    user_id = message.from_user.id
    web_app_name = message.text.strip()
    
    # Получаем токен из состояния
    data = await state.get_data()
    bot_token = data.get("bot_token")
    
    if not bot_token:
        await message.answer("❌ Ошибка: токен бота не найден. Начните заново с команды <code>/connect</code>.", parse_mode="HTML")
        await state.clear()
        return
    
    # Валидация названия Web App (только буквы, цифры, подчеркивания, дефисы)
    if not web_app_name or not web_app_name.replace("_", "").replace("-", "").isalnum():
        await message.answer(
            "❌ Неверный формат названия Web App.\\n\\n"
            "Название может содержать только буквы, цифры, подчеркивания (_) и дефисы (-).\\n\\n"
            "Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
            parse_mode="HTML"
        )
        return
    
    # Отправляем запрос в backend для регистрации
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/bots/register",
                json={
                    "bot_token": bot_token,
                    "owner_user_id": user_id,
                    "direct_link_name": web_app_name  # Используем то же поле в БД для Web App названия
                }
            ) as resp:
                if resp.status == 200:
                    bot_data = await resp.json()
                    bot_username = bot_data.get("bot_username", "unknown")
                    saved_web_app_name = bot_data.get("direct_link_name")
                    
                    # Если direct_link_name не вернулся, используем переданное значение
                    if not saved_web_app_name:
                        saved_web_app_name = web_app_name
                        logging.warning(f"direct_link_name not returned from API, using provided value: {web_app_name}")
                    
                    # Формируем Web App ссылку
                    web_app_link = f"t.me/{bot_username}/{saved_web_app_name}"
                    
                    await message.answer(
                        f"✅ <b>Бот успешно подключен!</b>\\n\\n"
                        f"🤖 Бот: @{bot_username}\\n"
                        f"📱 Web App: <code>{saved_web_app_name}</code>\\n"
                        f"🔗 Ссылка: <code>{web_app_link}</code>\\n\\n"
                        f"📋 <b>Следующие шаги:</b>\\n\\n"
                        f"1️⃣ Откройте @BotFather\\n"
                        f"2️⃣ Отправьте <code>/newapp</code>\\n"
                        f"3️⃣ Выберите вашего бота: @{bot_username}\\n"
                        f"4️⃣ Введите название: <code>{saved_web_app_name}</code>\\n"
                        f"5️⃣ Введите описание\\n"
                        f"6️⃣ Загрузите фото (640x360)\\n"
                        f"7️⃣ URL: <code>https://webapp-eight-vert.vercel.app</code>\\n\\n"
                        f"✅ После настройки используйте команду <code>/mylink</code> для получения ссылки!",
                        parse_mode="HTML"
                    )
                elif resp.status == 409:
                    error_text = await resp.text()
                    await message.answer(
                        "⚠️ Этот бот уже зарегистрирован.\\n\\n"
                        "Если это ваш бот, он уже подключен к системе.\\n\\n"
                        "Используйте команду <code>/mylink</code> для получения ссылки.",
                        parse_mode="HTML"
                    )
                else:
                    error_text = await resp.text()
                    logging.error(f"Error registering bot: status={resp.status}, error={error_text}")
                    await message.answer(
                        f"❌ Ошибка при регистрации бота.\\n\\n"
                        f"Проверьте:\\n"
                        f"• Правильность токена\\n"
                        f"• Что бот создан в @BotFather\\n"
                        f"• Что бот имеет username\\n\\n"
                        f"Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
                        parse_mode="HTML"
                    )
    except Exception as e:
        logging.error(f"Exception registering bot: {e}")
        await message.answer(
            f"❌ Произошла ошибка: {str(e)}\\n\\n"
            f"Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
            parse_mode="HTML"
        )
    
    await state.clear()
"""
# ========== END REFACTORING STEP 8.2 ==========

# ========== REFACTORING STEP 8.3: get_my_links_button ==========
# TODO: REFACTORING STEP 8.3 - get_my_links_button
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.bots import get_my_links_button
except ImportError:
    from handlers.bots import get_my_links_button

@dp.message(F.text == "🔗 Мои ссылки")
async def get_my_links_button_handler(message: Message, state: FSMContext):
    """Обработчик кнопки для получения ссылок на Mini App"""
    await get_my_links_button(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(F.text == "🔗 Мои ссылки")
async def get_my_links_button(message: Message, state: FSMContext):
    \"\"\"Обработчик кнопки для получения ссылок на Mini App\"\"\"
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    await _cmd_mylink_impl(message)
"""
# ========== END REFACTORING STEP 8.3 ==========

# ========== REFACTORING STEP 8.4: connect_bot_button ==========
# TODO: REFACTORING STEP 8.4 - connect_bot_button
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.bots import connect_bot_button
except ImportError:
    from handlers.bots import connect_bot_button

@dp.message(F.text == "🤖 Подключить бота")
async def connect_bot_button_handler(message: Message, state: FSMContext):
    """Обработчик кнопки для подключения нового бота"""
    await connect_bot_button(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(F.text == "🤖 Подключить бота")
async def connect_bot_button(message: Message, state: FSMContext):
    \"\"\"Обработчик кнопки для подключения нового бота\"\"\"
    # Сбрасываем предыдущее состояние перед началом новой операции
    await clear_state_if_needed(message, state, ConnectBot.token)
    await cmd_connect(message, state)
"""
# ========== END REFACTORING STEP 8.4 ==========

# ========== REFACTORING STEP 6.1: share_store ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.channels import share_store
except ImportError:
    from handlers.channels import share_store

@dp.message(F.text == "📤 Поделиться витриной")
async def share_store_handler(message: Message, state: FSMContext):
    """Обработчик кнопки 'Поделиться витриной'"""
    await share_store(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(F.text == "📤 Поделиться витриной")
async def share_store(message: Message, state: FSMContext):
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    \"\"\"Показать список каналов для отправки витрины\"\"\"
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
"""
# ========== END REFACTORING STEP 6.1 ==========

# ========== REFACTORING STEP 3.5: cmd_post ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_post
except ImportError:
    from handlers.commands import cmd_post

@dp.message(Command("post"))
@dp.message(F.text == "/post")
async def cmd_post_handler(message: Message, state: FSMContext):
    """Обработчик команды /post"""
    await cmd_post(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(Command("post"))
@dp.message(F.text == "/post")
async def cmd_post(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM при использовании команды /post
    await clear_state_if_needed(message, state)
    chat_type = message.chat.type
    chat_id = message.chat.id
    logging.info(f"/post command received - chat_type: {chat_type}, chat_id: {chat_id}, user_id: {message.from_user.id}")
    
    user_id = message.from_user.id
    share_url = f"{WEBAPP_URL}?user_id={user_id}"
    
    # Получаем настройки магазина
    shop_settings = await get_shop_settings(user_id)
    shop_name = shop_settings.get('shop_name', 'магазин')
    shop_name_display = shop_name if shop_name != 'магазин' else 'Магазин'
    button_text = f"Открыть {shop_name_display}" if shop_name != 'магазин' else "🛍️ Открыть магазин"
    welcome_description = shop_settings.get('welcome_description')
    
    msg = f"**{shop_name_display}**\\n\\n"
    if welcome_description:
        msg += f"{welcome_description}\\n\\n"
    
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
            text=button_text, 
            url=bot_link
        ))
        if chat_type == "channel":
            msg += "💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!"
        else:
            msg += "💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!\\n"
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
                f"❌ Ошибка: URL витрины должен начинаться с https://\\n"
                f"Текущий URL: {share_url}"
            )
            return
        
        logging.info(f"Using WebApp URL for supergroup: {share_url}")
        
        # Проверяем, что URL правильный и доступен
        if not share_url.startswith("https://"):
            await message.answer(f"❌ Ошибка: URL должен начинаться с https://\\nТекущий URL: {share_url}")
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
            text=button_text, 
            url=bot_link
        ))
        
        msg += "\\n\\n💡 Нажмите кнопку - откроется бот, и магазин запустится внутри Telegram!"
        
        try:
            sent = await send_shop_message(message, message, msg, builder.as_markup(), user_id)
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
        text=button_text, 
        url=share_url
    ))
    
    try:
        sent = await send_shop_message(message, message, msg, builder_url.as_markup(), user_id)
        logging.info(f"Successfully posted store message with URL, message_id: {sent.message_id}, chat_id: {chat_id}")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Error in /post: {error_msg}, chat_type: {chat_type}, chat_id: {chat_id}")
        await message.answer(f"❌ Ошибка: {error_msg}")
"""
# ========== END REFACTORING STEP 3.5 ==========

# ========== REFACTORING STEP 3.7: _cmd_mylink_impl ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import _cmd_mylink_impl
except ImportError:
    from handlers.commands import _cmd_mylink_impl

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def _cmd_mylink_impl(message: Message):
    \"\"\"
    Внутренняя реализация команды /mylink (без state для использования из callback handlers)
    \"\"\"
    user_id = message.from_user.id
    
    try:
        async with aiohttp.ClientSession() as session:
            # Получаем список подключенных ботов пользователя
            async with session.get(
                f"{API_URL}/bots/my",
                params={"owner_user_id": user_id}
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    logging.error(f"Error getting bots: status={resp.status}, error={error_text}")
                    return await message.answer(
                        f"❌ Ошибка при получении списка ботов.\\n\\n"
                        f"Убедитесь, что вы подключили бота через команду <code>/connect</code>.",
                        parse_mode="HTML"
                    )
                
                bots = await resp.json()
                
                if not bots:
                    return await message.answer(
                        "🤖 <b>У вас нет подключенных ботов</b>\\n\\n"
                        "Чтобы получить ссылку на Mini App:\\n\\n"
                        "1️⃣ Используйте команду <code>/connect</code> для подключения бота\\n"
                        "2️⃣ Создайте Web App через <code>/newapp</code> в @BotFather\\n"
                        "3️⃣ Затем используйте <code>/mylink</code> для получения ссылки",
                        parse_mode="HTML"
                    )
                
                # Формируем сообщение со ссылками с инлайн-кнопками для удаления
                # Используем HTML для более надежного форматирования
                msg = "🔗 <b>Web App ссылки на ваши магазины:</b>\\n\\n"
                
                builder = InlineKeyboardBuilder()
                
                for bot in bots:
                    bot_username = bot.get("bot_username", "unknown")
                    bot_id = bot.get("id")
                    is_active = bot.get("is_active", True)
                    # Используем direct_link_name из базы (хранит название Web App) или "shop" по умолчанию
                    direct_link_name_from_db = bot.get("direct_link_name")
                    web_app_name = direct_link_name_from_db if direct_link_name_from_db else "shop"
                    logging.info(f"Bot {bot_username}: direct_link_name from DB = {direct_link_name_from_db}, using = {web_app_name}")
                    
                    if is_active:
                        # Формируем Web App ссылку в формате t.me/{bot_username}/{web_app_name}
                        web_app_link = f"t.me/{bot_username}/{web_app_name}"
                        # Экранируем специальные символы для HTML
                        bot_username_escaped = bot_username.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        web_app_name_escaped = web_app_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        msg += f"🤖 <b>@{bot_username_escaped}</b>\\n"
                        msg += f"🔗 Ссылка: <code>{web_app_link}</code>\\n"
                        msg += f"📱 Web App: <code>{web_app_name_escaped}</code>\\n\\n"
                        
                        # Добавляем кнопку удаления для каждого бота
                        builder.button(
                            text=f"🗑️ Удалить @{bot_username_escaped}",
                            callback_data=f"delete_bot_{bot_id}"
                        )
                    else:
                        bot_username_escaped = bot_username.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        msg += f"🤖 <b>@{bot_username_escaped}</b> (неактивен)\\n\\n"
                
                builder.adjust(1)  # По одной кнопке в ряд
                
                msg += "💡 <b>Как использовать:</b>\\n"
                msg += "• Скопируйте ссылку и поделитесь ею\\n"
                msg += "• Ссылка откроет ваш магазин <b>поверх чата</b> без перехода в бота\\n"
                msg += "• Работает в личных чатах, группах и каналах\\n"
                msg += "• Web App создается через <code>/newapp</code> в @BotFather"
                
                await message.answer(msg, parse_mode="HTML", reply_markup=builder.as_markup())
                
    except Exception as e:
        logging.error(f"Exception getting bot links: {e}")
        await message.answer(
            f"❌ Произошла ошибка: {str(e)}\\n\\n"
            f"Попробуйте позже или обратитесь в поддержку."
        )
"""
# ========== END REFACTORING STEP 3.7 ==========

# ========== REFACTORING STEP 3.6: cmd_mylink ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_mylink
except ImportError:
    from handlers.commands import cmd_mylink

@dp.message(Command("mylink"))
async def cmd_mylink_handler(message: Message, state: FSMContext):
    """Обработчик команды /mylink"""
    await cmd_mylink(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(Command("mylink"))
async def cmd_mylink(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM при использовании команды /mylink
    await clear_state_if_needed(message, state)
    await _cmd_mylink_impl(message)
"""
# ========== END REFACTORING STEP 3.6 ==========

# ========== REFACTORING STEP 3.8: cmd_manage и _cmd_manage_impl ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.commands import cmd_manage, _cmd_manage_impl
except ImportError:
    from handlers.commands import cmd_manage, _cmd_manage_impl

@dp.message(Command("manage"))
async def cmd_manage_handler(message: Message, state: FSMContext):
    """Обработчик команды /manage"""
    await cmd_manage(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def _cmd_manage_impl(message: Message):
    \"\"\"
    Внутренняя реализация команды /manage (без state для использования из callback handlers)
    \"\"\"
    kb = [
        [KeyboardButton(text="➕ Добавить товар")],
        [KeyboardButton(text="🗑️ Удалить товар")],
        [KeyboardButton(text="📁 Добавить категорию")],
        [KeyboardButton(text="📋 Список категорий")],
        [KeyboardButton(text="🏷️ Название магазина")],
        [KeyboardButton(text="🖼️ Логотип магазина")],
        [KeyboardButton(text="📝 Описание магазина")],
        [KeyboardButton(text="📢 Управление каналами")],
        [KeyboardButton(text="📤 Поделиться витриной")],
        [KeyboardButton(text="🤖 Подключить бота"), KeyboardButton(text="🔗 Мои ссылки")]
    ]
    keyboard = ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)
    await message.answer("Управление витриной:", reply_markup=keyboard)

@dp.message(Command("manage"))
async def cmd_manage(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM при использовании команды /manage
    await clear_state_if_needed(message, state)
    await _cmd_manage_impl(message)
"""
# ========== END REFACTORING STEP 3.8 ==========

# ========== REFACTORING STEP 4.1: start_add_category ==========
# TODO: REFACTORING STEP 4.1 - start_add_category
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import start_add_category
except ImportError:
    from handlers.categories import start_add_category

@dp.message(F.text == "📁 Добавить категорию")
async def start_add_category_handler(message: Message, state: FSMContext):
    """Обработчик начала добавления категории"""
    await start_add_category(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Добавление категории
@dp.message(F.text == "📁 Добавить категорию")
async def start_add_category(message: Message, state: FSMContext):
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    await state.update_data(user_id=message.from_user.id)
    await state.set_state(AddCategory.name)
    await message.answer("Введите название новой категории:", reply_markup=types.ReplyKeyboardRemove())
"""
# ========== END REFACTORING STEP 4.1 ==========

# ========== REFACTORING STEP 4.2: process_category_name ==========
# TODO: REFACTORING STEP 4.2 - process_category_name
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import process_category_name
except ImportError:
    from handlers.categories import process_category_name

@dp.message(AddCategory.name)
async def process_category_name_handler(message: Message, state: FSMContext):
    """Обработчик названия категории"""
    await process_category_name(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddCategory.name)
async def process_category_name(message: Message, state: FSMContext):
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    data = await state.get_data()
    user_id = data.get('user_id', message.from_user.id)
    category_name = message.text.strip()
    
    # Сохраняем название категории
    await state.update_data(category_name=category_name)
    
    # Получаем список основных категорий для выбора родительской
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        # Нет категорий - создаем основную категорию
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/categories/",
                json={"name": category_name, "parent_id": None},
                params={"user_id": user_id}
            ) as resp:
                if resp.status == 200:
                    await message.answer(f"✅ Категория '{category_name}' создана!")
                else:
                    await message.answer(f"❌ Ошибка: {await resp.text()}")
        await state.clear()
        await _cmd_manage_impl(message)
        return
    
    # Есть категории - спрашиваем, основная это категория или подкатегория
    builder = InlineKeyboardBuilder()
    builder.button(text="📁 Основная категория", callback_data="cat_main")
    builder.button(text="📂 Подкатегория", callback_data="cat_sub")
    builder.adjust(1)
    
    await state.set_state(AddCategory.parent_choice)
    await message.answer(
        f"Категория '{category_name}'\n\n"
        "Выберите тип категории:",
        reply_markup=builder.as_markup()
    )
"""
# ========== END REFACTORING STEP 4.2 ==========

# ========== REFACTORING STEP 4.3: create_main_category ==========
# TODO: REFACTORING STEP 4.3 - create_main_category
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import create_main_category
except ImportError:
    from handlers.categories import create_main_category

@dp.callback_query(StateFilter(AddCategory.parent_choice), F.data == "cat_main")
async def create_main_category_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик создания основной категории"""
    await create_main_category(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddCategory.parent_choice), F.data == "cat_main")
async def create_main_category(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    user_id = data.get('user_id', callback.from_user.id)
    category_name = data.get('category_name')
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{API_URL}/categories/",
            json={"name": category_name, "parent_id": None},
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.message.answer(f"✅ Основная категория '{category_name}' создана!")
            else:
                error_text = await resp.text()
                await callback.message.answer(f"❌ Ошибка: {error_text}")
    
    await callback.answer()
    await state.clear()
    await _cmd_manage_impl(callback.message)
"""
# ========== END REFACTORING STEP 4.3 ==========

# ========== REFACTORING STEP 4.4: choose_parent_category ==========
# TODO: REFACTORING STEP 4.4 - choose_parent_category
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import choose_parent_category
except ImportError:
    from handlers.categories import choose_parent_category

@dp.callback_query(StateFilter(AddCategory.parent_choice), F.data == "cat_sub")
async def choose_parent_category_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик выбора родительской категории"""
    await choose_parent_category(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddCategory.parent_choice), F.data == "cat_sub")
async def choose_parent_category(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    user_id = data.get('user_id', callback.from_user.id)
    
    # Получаем список основных категорий
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                return await callback.message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        await callback.answer("❌ Сначала создайте основную категорию!", show_alert=True)
        await state.clear()
        await _cmd_manage_impl(callback.message)
        return
    
    # Показываем список основных категорий для выбора родительской
    builder = InlineKeyboardBuilder()
    for cat in main_categories:
        builder.button(text=cat['name'], callback_data=f"parent_{cat['id']}")
    builder.adjust(1)
    
    await callback.message.answer(
        "Выберите основную категорию, к которой будет относиться подкатегория:",
        reply_markup=builder.as_markup()
    )
    await callback.answer()
"""
# ========== END REFACTORING STEP 4.4 ==========

# ========== REFACTORING STEP 4.5: create_subcategory ==========
# TODO: REFACTORING STEP 4.5 - create_subcategory
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import create_subcategory
except ImportError:
    from handlers.categories import create_subcategory

@dp.callback_query(StateFilter(AddCategory.parent_choice), F.data.startswith("parent_"))
async def create_subcategory_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик создания подкатегории"""
    await create_subcategory(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddCategory.parent_choice), F.data.startswith("parent_"))
async def create_subcategory(callback: types.CallbackQuery, state: FSMContext):
    parent_id = int(callback.data.split("_")[1])
    data = await state.get_data()
    user_id = data.get('user_id', callback.from_user.id)
    category_name = data.get('category_name')
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{API_URL}/categories/",
            json={"name": category_name, "parent_id": parent_id},
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.message.answer(f"✅ Подкатегория '{category_name}' создана!")
            else:
                error_text = await resp.text()
                await callback.message.answer(f"❌ Ошибка: {error_text}")
    
    await callback.answer()
    await state.clear()
    await _cmd_manage_impl(callback.message)
"""
# ========== END REFACTORING STEP 4.5 ==========

# ========== REFACTORING STEP 4.6: list_categories ==========
# TODO: REFACTORING STEP 4.6 - list_categories
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import list_categories
except ImportError:
    from handlers.categories import list_categories

@dp.message(F.text == "📋 Список категорий")
async def list_categories_handler(message: Message, state: FSMContext):
    """Обработчик списка категорий"""
    await list_categories(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(F.text == "📋 Список категорий")
async def list_categories(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM при использовании этой кнопки
    await clear_state_if_needed(message, state)
    user_id = message.from_user.id
    
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        return await message.answer("Список категорий пуст. Создайте первую категорию!")
    
    # Получаем все категории в плоском виде для подсчета товаров
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "true"}) as resp:
            all_categories_flat = await resp.json() if resp.status == 200 else []
    
    # Получаем количество товаров в каждой категории для предупреждения
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/products/", params={"user_id": user_id}) as resp:
            products = await resp.json() if resp.status == 200 else []
    
    # Подсчитываем товары по категориям
    from collections import defaultdict
    products_by_category = defaultdict(int)
    for prod in products:
        products_by_category[prod.get('category_id')] += 1
    
    text = "📁 Ваши категории:\n\n"
    builder = InlineKeyboardBuilder()
    
    for main_cat in main_categories:
        products_count = products_by_category.get(main_cat['id'], 0)
        text += f"📁 {main_cat['name']}"
        if products_count > 0:
            text += f" ({products_count} товар{'ов' if products_count > 1 else ''})"
        text += "\n"
        
        # Показываем подкатегории
        if main_cat.get('subcategories'):
            for subcat in main_cat['subcategories']:
                sub_products_count = products_by_category.get(subcat['id'], 0)
                text += f"  └─ 📂 {subcat['name']}"
                if sub_products_count > 0:
                    text += f" ({sub_products_count} товар{'ов' if sub_products_count > 1 else ''})"
                text += "\n"
        
        # Кнопка для удаления основной категории
        builder.button(
            text=f"❌ Удалить: {main_cat['name']}",
            callback_data=f"del_category_{main_cat['id']}"
        )
        
        # Кнопки для удаления подкатегорий
        if main_cat.get('subcategories'):
            for subcat in main_cat['subcategories']:
                builder.button(
                    text=f"❌ Удалить: {subcat['name']}",
                    callback_data=f"del_category_{subcat['id']}"
                )
    
    text += "\n⚠️ **Внимание:** При удалении категории все товары в ней также будут удалены!"
    text += "\n\nДля удаления используйте кнопки ниже:"
    
    builder.adjust(1)
    await message.answer(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
"""
# ========== END REFACTORING STEP 4.6 ==========

# ========== REFACTORING STEP 4.7: delete_category_confirm ==========
# TODO: REFACTORING STEP 4.7 - delete_category_confirm
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import delete_category_confirm
except ImportError:
    from handlers.categories import delete_category_confirm

@dp.callback_query(F.data.startswith("del_category_"))
async def delete_category_confirm_handler(callback: types.CallbackQuery):
    """Обработчик подтверждения удаления категории"""
    await delete_category_confirm(callback)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(F.data.startswith("del_category_"))
async def delete_category_confirm(callback: types.CallbackQuery):
    category_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    
    # Удаляем категорию через API
    async with aiohttp.ClientSession() as session:
        async with session.delete(
            f"{API_URL}/categories/{category_id}",
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                await callback.answer("✅ Категория удалена!", show_alert=True)
                await callback.message.delete()
                await _cmd_manage_impl(callback.message)
            elif resp.status == 404:
                await callback.answer("❌ Категория не найдена", show_alert=True)
            else:
                error_text = await resp.text()
                await callback.answer(f"❌ Ошибка: {error_text}", show_alert=True)
"""
# ========== END REFACTORING STEP 4.7 ==========

# ========== REFACTORING STEP 5.1: manage_shop_name ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import manage_shop_name
except ImportError:
    from handlers.shop_settings import manage_shop_name

@dp.message(F.text == "🏷️ Название магазина")
async def manage_shop_name_handler(message: Message, state: FSMContext):
    """Обработчик управления названием магазина"""
    await manage_shop_name(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Управление названием магазина
@dp.message(F.text == "🏷️ Название магазина")
async def manage_shop_name(message: Message, state: FSMContext):
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    user_id = message.from_user.id
    
    # Получаем текущее название магазина
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении настроек магазина")
            settings = await resp.json()
    
    current_name = settings.get('shop_name', None)
    
    if current_name:
        text = f"🏷️ **Текущее название магазина:** {current_name}\n\n"
        text += "Отправьте новое название магазина, чтобы изменить его.\n"
        text += "Или отправьте /clear чтобы удалить название (будет использоваться 'Магазин')."
    else:
        text = "🏷️ **Название магазина не установлено**\n\n"
        text += "Отправьте название магазина, чтобы установить его.\n"
        text += "Или отправьте /cancel чтобы отменить."
    
    await message.answer(text, parse_mode="Markdown")
    # Устанавливаем состояние для получения нового названия
    await state.set_state(SetShopName.name)
"""
# ========== END REFACTORING STEP 5.1 ==========

# ========== REFACTORING STEP 5.2: process_shop_name ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import process_shop_name
except ImportError:
    from handlers.shop_settings import process_shop_name

@dp.message(SetShopName.name)
async def process_shop_name_handler(message: Message, state: FSMContext):
    """Обработчик обработки названия магазина"""
    await process_shop_name(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(SetShopName.name)
async def process_shop_name(message: Message, state: FSMContext):
    # Если пользователь отправил команду (кроме /clear и /cancel) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text not in ["/clear", "/cancel"]) or is_menu_button(message.text or ""):
        return
    
    user_id = message.from_user.id
    
    if message.text == "/clear":
        shop_name = None
    elif message.text == "/cancel":
        await state.clear()
        await _cmd_manage_impl(message)
        return
    else:
        shop_name = message.text.strip()
        if len(shop_name) > 100:
            return await message.answer("❌ Название магазина слишком длинное (максимум 100 символов). Попробуйте снова:")
    
    # Обновляем название магазина через API
    async with aiohttp.ClientSession() as session:
        # Сначала получаем текущие настройки
        async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении настроек магазина")
            current_settings = await resp.json()
        
        # Обновляем настройки с новым названием
        update_data = {
            "reservations_enabled": current_settings.get("reservations_enabled", True),
            "shop_name": shop_name
        }
        
        async with session.put(
            f"{API_URL}/shop-settings/",
            json=update_data,
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                if shop_name:
                    await message.answer(f"✅ Название магазина установлено: **{shop_name}**", parse_mode="Markdown")
                else:
                    await message.answer("✅ Название магазина удалено. Будет использоваться 'Магазин'.")
            else:
                error_text = await resp.text()
                await message.answer(f"❌ Ошибка: {error_text}")
    
    await state.clear()
    await _cmd_manage_impl(message)
"""
# ========== END REFACTORING STEP 5.2 ==========

# ========== REFACTORING STEP 5.3: manage_welcome_image ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import manage_welcome_image
except ImportError:
    from handlers.shop_settings import manage_welcome_image

@dp.message(F.text == "🖼️ Логотип магазина")
async def manage_welcome_image_handler(message: Message, state: FSMContext):
    """Обработчик управления логотипом магазина"""
    await manage_welcome_image(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Управление логотипом магазина
@dp.message(F.text == "🖼️ Логотип магазина")
async def manage_welcome_image(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM перед началом новой операции
    await clear_state_if_needed(message, state, SetWelcomeImage.image)
    user_id = message.from_user.id
    
    # Получаем текущие настройки
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении настроек магазина")
            settings = await resp.json()
    
    current_image = settings.get('welcome_image_url', None)
    
    if current_image:
        text = "🖼️ **Текущий логотип магазина установлен**\n\n"
        text += "Отправьте новое фото, чтобы изменить логотип.\n"
        text += "Или отправьте /clear чтобы удалить логотип.\n"
        text += "Или отправьте /cancel чтобы отменить."
    else:
        text = "🖼️ **Логотип магазина не установлен**\n\n"
        text += "Отправьте фото, чтобы установить логотип магазина.\n"
        text += "Это фото будет отображаться в приветственных сообщениях при шаринге магазина.\n"
        text += "Или отправьте /cancel чтобы отменить."
    
    await message.answer(text, parse_mode="Markdown")
    await state.set_state(SetWelcomeImage.image)
"""
# ========== END REFACTORING STEP 5.3 ==========

# ========== REFACTORING STEP 5.4: process_welcome_image ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import process_welcome_image
except ImportError:
    from handlers.shop_settings import process_welcome_image

@dp.message(SetWelcomeImage.image, F.photo)
async def process_welcome_image_handler(message: Message, state: FSMContext):
    """Обработчик обработки логотипа (фото)"""
    await process_welcome_image(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(SetWelcomeImage.image, F.photo)
async def process_welcome_image(message: Message, state: FSMContext):
    user_id = message.from_user.id
    
    # Получаем фото
    photo = message.photo[-1]  # Берем фото наибольшего размера
    
    try:
        # Скачиваем фото во временный файл
        file_info = await bot.get_file(photo.file_id)
        file_ext = os.path.splitext(file_info.file_path)[1] or '.jpg'
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            tmp_path = tmp_file.name
            await bot.download_file(file_info.file_path, tmp_path)
        
        # Отправляем фото на backend
        async with aiohttp.ClientSession() as session:
            with open(tmp_path, 'rb') as f:
                form_data = aiohttp.FormData()
                form_data.add_field('image', f, filename=f"welcome_{photo.file_id}{file_ext}", content_type='image/jpeg')
                
                async with session.post(
                    f"{API_URL}/shop-settings/welcome-image",
                    data=form_data,
                    params={"user_id": user_id}
                ) as resp:
                    if resp.status == 200:
                        await message.answer("✅ Логотип магазина установлен!")
                    else:
                        error_text = await resp.text()
                        await message.answer(f"❌ Ошибка: {error_text}")
        
        # Удаляем временный файл
        try:
            os.unlink(tmp_path)
        except:
            pass
            
    except Exception as e:
        logging.error(f"Error processing welcome image: {e}", exc_info=True)
        await message.answer(f"❌ Ошибка при обработке фото: {str(e)}")
    
    await state.clear()
    await _cmd_manage_impl(message)
"""
# ========== END REFACTORING STEP 5.4 ==========

# ========== REFACTORING STEP 5.5: process_welcome_image_text ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import process_welcome_image_text
except ImportError:
    from handlers.shop_settings import process_welcome_image_text

@dp.message(SetWelcomeImage.image)
async def process_welcome_image_text_handler(message: Message, state: FSMContext):
    """Обработчик обработки логотипа (текст)"""
    await process_welcome_image_text(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(SetWelcomeImage.image)
async def process_welcome_image_text(message: Message, state: FSMContext):
    # Если пользователь отправил команду (кроме /clear и /cancel) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text not in ["/clear", "/cancel"]) or is_menu_button(message.text or ""):
        return
    
    user_id = message.from_user.id
    
    if message.text == "/clear":
        # Удаляем логотип
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{API_URL}/shop-settings/welcome-image",
                params={"user_id": user_id}
            ) as resp:
                if resp.status == 200:
                    await message.answer("✅ Логотип магазина удален.")
                else:
                    error_text = await resp.text()
                    await message.answer(f"❌ Ошибка: {error_text}")
    elif message.text == "/cancel":
        await state.clear()
        await _cmd_manage_impl(message)
        return
    else:
        await message.answer("❌ Пожалуйста, отправьте фото или используйте команды /clear или /cancel")
        return
    
    await state.clear()
    await _cmd_manage_impl(message)
"""
# ========== END REFACTORING STEP 5.5 ==========

# ========== REFACTORING STEP 5.6: manage_welcome_description ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import manage_welcome_description
except ImportError:
    from handlers.shop_settings import manage_welcome_description

@dp.message(F.text == "📝 Описание магазина")
async def manage_welcome_description_handler(message: Message, state: FSMContext):
    """Обработчик управления описанием магазина"""
    await manage_welcome_description(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Управление описанием магазина
@dp.message(F.text == "📝 Описание магазина")
async def manage_welcome_description(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM перед началом новой операции
    await clear_state_if_needed(message, state, SetWelcomeDescription.description)
    user_id = message.from_user.id
    
    # Получаем текущие настройки
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении настроек магазина")
            settings = await resp.json()
    
    current_description = settings.get('welcome_description', None)
    
    if current_description:
        text = "📝 **Текущее описание магазина:**\n\n"
        text += f"{current_description}\n\n"
        text += "Отправьте новое описание, чтобы изменить его.\n"
        text += "Или отправьте /clear чтобы удалить описание.\n"
        text += "Или отправьте /cancel чтобы отменить."
    else:
        text = "📝 **Описание магазина не установлено**\n\n"
        text += "Отправьте описание магазина, чтобы установить его.\n"
        text += "Это описание будет отображаться в приветственных сообщениях при шаринге магазина.\n"
        text += "Или отправьте /cancel чтобы отменить."
    
    await message.answer(text, parse_mode="Markdown")
    await state.set_state(SetWelcomeDescription.description)
"""
# ========== END REFACTORING STEP 5.6 ==========

# ========== REFACTORING STEP 5.7: process_welcome_description ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.shop_settings import process_welcome_description
except ImportError:
    from handlers.shop_settings import process_welcome_description

@dp.message(SetWelcomeDescription.description)
async def process_welcome_description_handler(message: Message, state: FSMContext):
    """Обработчик обработки описания магазина"""
    await process_welcome_description(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(SetWelcomeDescription.description)
async def process_welcome_description(message: Message, state: FSMContext):
    # Если пользователь отправил команду (кроме /clear и /cancel) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text not in ["/clear", "/cancel"]) or is_menu_button(message.text or ""):
        return
    
    user_id = message.from_user.id
    
    if message.text == "/clear":
        welcome_description = None
    elif message.text == "/cancel":
        await state.clear()
        await _cmd_manage_impl(message)
        return
    else:
        welcome_description = message.text.strip()
        if len(welcome_description) > 500:
            return await message.answer("❌ Описание магазина слишком длинное (максимум 500 символов). Попробуйте снова:")
    
    # Обновляем описание магазина через API
    async with aiohttp.ClientSession() as session:
        # Сначала получаем текущие настройки
        async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении настроек магазина")
            current_settings = await resp.json()
        
        # Обновляем настройки с новым описанием
        update_data = {
            "reservations_enabled": current_settings.get("reservations_enabled", True),
            "shop_name": current_settings.get("shop_name", None),
            "welcome_image_url": current_settings.get("welcome_image_url", None),
            "welcome_description": welcome_description
        }
        
        async with session.put(
            f"{API_URL}/shop-settings/",
            json=update_data,
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                if welcome_description:
                    await message.answer(f"✅ Описание магазина установлено:\n\n**{welcome_description}**", parse_mode="Markdown")
                else:
                    await message.answer("✅ Описание магазина удалено.")
            else:
                error_text = await resp.text()
                await message.answer(f"❌ Ошибка: {error_text}")
    
    await state.clear()
    await _cmd_manage_impl(message)
"""
# ========== END REFACTORING STEP 5.7 ==========

# ========== REFACTORING STEP 6.2: manage_channels ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.channels import manage_channels
except ImportError:
    from handlers.channels import manage_channels

# Управление каналами
@dp.message(F.text == "📢 Управление каналами")
async def manage_channels_handler(message: Message, state: FSMContext):
    """Обработчик кнопки 'Управление каналами'"""
    await manage_channels(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(F.text == "📢 Управление каналами")
async def manage_channels(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM при использовании этой кнопки
    await clear_state_if_needed(message, state)
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
"""
# ========== END REFACTORING STEP 6.2 ==========

# ========== REFACTORING STEP 5.19: delete_product_start ==========
# TODO: REFACTORING STEP 5.19 - delete_product_start
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import delete_product_start
except ImportError:
    from handlers.products import delete_product_start

# Удаление товара
@dp.message(F.text == "🗑️ Удалить товар")
async def delete_product_start_handler(message: Message, state: FSMContext):
    """Обработчик начала удаления товара - вызывает функцию из handlers/products.py"""
    await delete_product_start(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Удаление товара
@dp.message(F.text == "🗑️ Удалить товар")
async def delete_product_start(message: Message, state: FSMContext):
    # Сбрасываем состояние FSM при использовании этой кнопки
    await clear_state_if_needed(message, state)
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
"""
# ========== END REFACTORING STEP 5.19 ==========

# ========== REFACTORING STEP 5.20: delete_product_confirm ==========
# TODO: REFACTORING STEP 5.20 - delete_product_confirm
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import delete_product_confirm
except ImportError:
    from handlers.products import delete_product_confirm

@dp.callback_query(F.data.startswith("del_product_"))
async def delete_product_confirm_handler(callback: types.CallbackQuery):
    """Обработчик подтверждения удаления товара - вызывает функцию из handlers/products.py"""
    await delete_product_confirm(callback)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
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
                await _cmd_manage_impl(callback.message)
            elif resp.status == 404:
                await callback.answer("❌ Товар не найден", show_alert=True)
            else:
                error_text = await resp.text()
                await callback.answer(f"❌ Ошибка: {error_text}", show_alert=True)
"""
# ========== END REFACTORING STEP 5.20 ==========

# ========== REFACTORING STEP 6.3: add_channel_by_username ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.channels import add_channel_by_username
except ImportError:
    from handlers.channels import add_channel_by_username

# Обработка добавления канала через @username
@dp.message(F.text.startswith("@"))
async def add_channel_by_username_handler(message: Message):
    """Обработчик добавления канала по username"""
    await add_channel_by_username(message)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
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
"""
# ========== END REFACTORING STEP 6.3 ==========

# ========== REFACTORING STEP 6.4: add_channel_by_forward ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.channels import add_channel_by_forward
except ImportError:
    from handlers.channels import add_channel_by_forward

# Обработка добавления канала через пересылку
@dp.message(F.forward_from_chat)
async def add_channel_by_forward_handler(message: Message):
    """Обработчик добавления канала через пересылку"""
    await add_channel_by_forward(message)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
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
"""
# ========== END REFACTORING STEP 6.4 ==========



# ========== REFACTORING STEP 6.5: send_store_to_channel ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.channels import send_store_to_channel
except ImportError:
    from handlers.channels import send_store_to_channel

# Обработчик callback для отправки витрины в канал
@dp.callback_query(F.data.startswith("share_"))
async def send_store_to_channel_handler(callback: types.CallbackQuery):
    """Обработчик отправки витрины в канал"""
    await send_store_to_channel(callback)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
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
    
    # Получаем настройки магазина
    shop_settings = await get_shop_settings(user_id)
    shop_name = shop_settings.get('shop_name', 'магазин')
    shop_name_display = shop_name if shop_name != 'магазин' else 'Магазин'
    welcome_description = shop_settings.get('welcome_description')
    
    # Проверяем реальный тип чата (делаем это ДО формирования сообщения)
    chat_type = channel.get('chat_type', 'unknown')  # Инициализируем значением по умолчанию
    try:
        chat_info = await bot.get_chat(channel['chat_id'])
        chat_type = chat_info.type
        logging.info(f"📤 Sending store to {chat_type} {channel['chat_id']}")
    except Exception as e:
        logging.warning(f"Could not get chat info for {channel['chat_id']}: {e}")
        # Используем значение из базы данных или 'unknown'
        chat_type = channel.get('chat_type', 'unknown')
        logging.info(f"📤 Sending store to {chat_type} {channel['chat_id']} (from DB)")
    
    msg = f"**{shop_name_display}**\n\n"
    if welcome_description:
        msg += f"{welcome_description}\n\n"
    
    if chat_type == 'private':
        msg += "💡 Нажмите кнопку - магазин откроется прямо здесь!"
    else:
        msg += "💡 Нажмите кнопку - откроется бот, и магазин запустится внутри Telegram!"
    
    # Вариант 1: Поделиться через главного бота (WebApp кнопка внутри бота)
    # Используем WebApp кнопку для личных чатов и deep link для групп/каналов
    builder = InlineKeyboardBuilder()
    button_text = f"🛍 Открыть {shop_name_display}" if shop_name != 'магазин' else "🛍 Открыть магазин"
    share_url = f"{WEBAPP_URL}?user_id={user_id}"
    
    if chat_type == 'private':
        # В личных чатах используем WebApp кнопку напрямую (открывает магазин внутри бота)
        builder.row(types.InlineKeyboardButton(
            text=button_text,
            web_app=WebAppInfo(url=share_url)
        ))
        logging.info(f"✅ Using WebApp button for private chat (opens inside bot)")
    else:
        # В группах и каналах WebApp кнопки не работают
        # Используем deep link на бота, который откроет магазин внутри бота
        bot_link = await get_bot_deeplink(user_id)
        builder.row(types.InlineKeyboardButton(
            text=button_text,
            url=bot_link
        ))
        logging.info(f"✅ Using deep link for {chat_type} (opens bot, then store inside)")
    
    builder_markup = builder.as_markup()
    
    try:
        # Если есть фото, отправляем его отдельным сообщением ПЕРЕД текстовым
        welcome_image_url = shop_settings.get('welcome_image_url')
        if welcome_image_url:
            try:
                await bot.send_photo(
                    chat_id=channel['chat_id'],
                    photo=welcome_image_url,
                    parse_mode="Markdown"
                )
                logging.info(f"📷 Sent welcome image to {chat_type or 'unknown'} {channel['chat_id']}")
            except Exception as photo_err:
                logging.warning(f"⚠️ Could not send welcome image: {photo_err}")
        
        # Отправляем текстовое сообщение с кнопкой
        sent_msg = await bot.send_message(
            chat_id=channel['chat_id'],
            text=msg,
            reply_markup=builder_markup,
            parse_mode="Markdown"
        )
        logging.info(f"✅ Successfully sent store to {chat_type or 'unknown'} {channel['chat_id']}, message_id: {sent_msg.message_id}")
        await callback.answer(f"✅ Витрина отправлена в '{channel['title']}'!")
    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ Error sending to {chat_type or 'unknown'} {channel['chat_id']}: {error_msg}")
        
        if "chat not found" in error_msg.lower() or "not a member" in error_msg.lower():
            error_text = "❌ Бот не является участником или не имеет прав на отправку сообщений"
        else:
            error_text = f"❌ Ошибка: {error_msg}"
        
        await callback.answer(error_text, show_alert=True)
"""
# ========== END REFACTORING STEP 6.5 ==========



# ========== REFACTORING STEP 8.5: delete_bot_callback ==========
# TODO: REFACTORING STEP 8.5 - delete_bot_callback
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.bots import delete_bot_callback
except ImportError:
    from handlers.bots import delete_bot_callback

# Обработчик callback для удаления бота
@dp.callback_query(F.data.startswith("delete_bot_"))
async def delete_bot_callback_handler(callback: types.CallbackQuery):
    """Обработчик callback для удаления бота"""
    await delete_bot_callback(callback)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
# Обработчик callback для удаления бота
@dp.callback_query(F.data.startswith("delete_bot_"))
async def delete_bot_callback(callback: types.CallbackQuery):
    bot_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    
    # Запрашиваем подтверждение
    # Сначала получаем информацию о боте
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{API_URL}/bots/my",
                params={"owner_user_id": user_id}
            ) as resp:
                if resp.status != 200:
                    return await callback.answer("❌ Ошибка при получении информации о боте", show_alert=True)
                
                bots = await resp.json()
                bot = next((b for b in bots if b.get("id") == bot_id), None)
                
                if not bot:
                    return await callback.answer("❌ Бот не найден", show_alert=True)
                
                bot_username = bot.get("bot_username", "unknown")
                
                # Удаляем бота
                async with session.delete(
                    f"{API_URL}/bots/{bot_id}",
                    params={"owner_user_id": user_id}
                ) as delete_resp:
                    if delete_resp.status == 200:
                        await callback.answer(f"✅ Бот @{bot_username} удален!")
                        # Обновляем сообщение - показываем обновленный список
                        await _cmd_mylink_impl(callback.message)
                    elif delete_resp.status == 404:
                        await callback.answer("❌ Бот не найден", show_alert=True)
                    else:
                        error_text = await delete_resp.text()
                        logging.error(f"Error deleting bot: status={delete_resp.status}, error={error_text}")
                        await callback.answer("❌ Ошибка при удалении бота", show_alert=True)
    except Exception as e:
        logging.error(f"Exception deleting bot: {e}")
        await callback.answer(f"❌ Произошла ошибка: {str(e)}", show_alert=True)
"""
# ========== END REFACTORING STEP 8.5 ==========

# ========== REFACTORING STEP 6.6: delete_channel ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.channels import delete_channel
except ImportError:
    from handlers.channels import delete_channel

# Обработчик callback для удаления канала
@dp.callback_query(F.data.startswith("del_channel_"))
async def delete_channel_handler(callback: types.CallbackQuery):
    """Обработчик удаления канала"""
    await delete_channel(callback)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
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
"""
# ========== END REFACTORING STEP 6.6 ==========

# ========== REFACTORING STEP 5.1: start_add_product ==========
# TODO: REFACTORING STEP 5.1 - start_add_product
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import start_add_product
except ImportError:
    from handlers.products import start_add_product

@dp.message(F.text == "➕ Добавить товар")
async def start_add_product_handler(message: Message, state: FSMContext):
    """Обработчик для начала добавления товара - вызывает функцию из handlers/products.py"""
    await start_add_product(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(F.text == "➕ Добавить товар")
async def start_add_product(message: Message, state: FSMContext):
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    await state.update_data(user_id=message.from_user.id)
    await state.set_state(AddProduct.name)
    await message.answer("Введите название товара:", reply_markup=types.ReplyKeyboardRemove())
"""
# ========== END REFACTORING STEP 5.1 ==========

# ========== REFACTORING STEP 5.2: process_name ==========
# TODO: REFACTORING STEP 5.2 - process_name
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_name
except ImportError:
    from handlers.products import process_name

@dp.message(AddProduct.name)
async def process_name_handler(message: Message, state: FSMContext):
    """Обработчик названия товара - вызывает функцию из handlers/products.py"""
    await process_name(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.name)
async def process_name(message: Message, state: FSMContext):
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    await state.update_data(name=message.text)
    await state.set_state(AddProduct.product_type)
    
    # Создаем кнопки для выбора типа товара
    builder = InlineKeyboardBuilder()
    builder.button(text="📦 Обычный товар", callback_data="product_type_regular")
    builder.button(text="📝 Под заказ", callback_data="product_type_made_to_order")
    builder.button(text="💰 Для покупки", callback_data="product_type_for_sale")
    builder.adjust(1)
    
    await message.answer(
        "Выберите тип товара:\n\n"
        "📦 <b>Обычный товар</b> - товар с фиксированной ценой\n"
        "📝 <b>Под заказ</b> - товар, который изготавливается по заказу\n"
        "💰 <b>Для покупки</b> - товар, который вы хотите купить (с диапазоном цен)",
        reply_markup=builder.as_markup(),
        parse_mode="HTML"
    )
"""
# ========== END REFACTORING STEP 5.2 ==========

# ========== REFACTORING STEP 5.3: process_product_type ==========
# TODO: REFACTORING STEP 5.3 - process_product_type
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_product_type
except ImportError:
    from handlers.products import process_product_type

@dp.callback_query(StateFilter(AddProduct.product_type), F.data.startswith("product_type_"))
async def process_product_type_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик типа товара - вызывает функцию из handlers/products.py"""
    await process_product_type(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddProduct.product_type), F.data.startswith("product_type_"))
async def process_product_type(callback: types.CallbackQuery, state: FSMContext):
    product_type = callback.data.replace("product_type_", "")
    
    if product_type == "regular":
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=False
        )
        await state.set_state(AddProduct.price)
        await callback.message.answer("Введите цену товара (число):")
    elif product_type == "made_to_order":
        await state.update_data(
            is_made_to_order=True,
            is_for_sale=False
        )
        await state.set_state(AddProduct.price)
        await callback.message.answer("Введите цену товара (число):")
    elif product_type == "for_sale":
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=True
        )
        await state.set_state(AddProduct.price_type)
        
        # Создаем кнопки для выбора типа цены
        builder = InlineKeyboardBuilder()
        builder.button(text="📊 Диапазон цен (от-до)", callback_data="price_type_range")
        builder.button(text="💰 Фиксированная цена", callback_data="price_type_fixed")
        builder.adjust(1)
        
        await callback.message.answer(
            "Выберите тип цены для товара:\n\n"
            "📊 <b>Диапазон цен</b> - укажите цену от и до\n"
            "💰 <b>Фиксированная цена</b> - укажите одну цену",
            reply_markup=builder.as_markup(),
            parse_mode="HTML"
        )
    
    await callback.answer()
"""
# ========== END REFACTORING STEP 5.3 ==========

# ========== REFACTORING STEP 5.4: process_price_type ==========
# TODO: REFACTORING STEP 5.4 - process_price_type
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_type, resend_price_type_on_product_type_click
except ImportError:
    from handlers.products import process_price_type, resend_price_type_on_product_type_click

@dp.callback_query(StateFilter(AddProduct.price_type), F.data.startswith("price_type_"))
async def process_price_type_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик типа цены - вызывает функцию из handlers/products.py"""
    await process_price_type(callback, state)

@dp.callback_query(StateFilter(AddProduct.price_type), F.data.startswith("product_type_"))
async def resend_price_type_handler(callback: types.CallbackQuery, state: FSMContext):
    """Повторное нажатие типа товара в price_type — показываем клавиатуру выбора типа цены."""
    await resend_price_type_on_product_type_click(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddProduct.price_type), F.data.startswith("price_type_"))
async def process_price_type(callback: types.CallbackQuery, state: FSMContext):
    price_type = callback.data.replace("price_type_", "")
    await state.update_data(price_type=price_type)
    
    if price_type == "range":
        await state.set_state(AddProduct.price_from)
        await callback.message.answer("Введите цену ОТ (число):")
    elif price_type == "fixed":
        await state.set_state(AddProduct.price_fixed)
        await callback.message.answer("Введите фиксированную цену (число):")
    
    await callback.answer()
"""
# ========== END REFACTORING STEP 5.4 ==========

# ========== REFACTORING STEP 5.5: process_price_from ==========
# TODO: REFACTORING STEP 5.5 - process_price_from
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_from
except ImportError:
    from handlers.products import process_price_from

@dp.message(AddProduct.price_from)
async def process_price_from_handler(message: Message, state: FSMContext):
    """Обработчик цены 'от' - вызывает функцию из handlers/products.py"""
    await process_price_from(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.price_from)
async def process_price_from(message: Message, state: FSMContext):
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_from = float(message.text)
        await state.update_data(price_from=price_from)
        await state.set_state(AddProduct.price_to)
        await message.answer("Введите цену ДО (число):")
    except ValueError:
        await message.answer("Пожалуйста, введите число.")
"""
# ========== END REFACTORING STEP 5.5 ==========

# ========== REFACTORING STEP 5.6: process_price_to ==========
# TODO: REFACTORING STEP 5.6 - process_price_to
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_to
except ImportError:
    from handlers.products import process_price_to

@dp.message(AddProduct.price_to)
async def process_price_to_handler(message: Message, state: FSMContext):
    """Обработчик цены 'до' - вызывает функцию из handlers/products.py"""
    await process_price_to(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.price_to)
async def process_price_to(message: Message, state: FSMContext):
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_to = float(message.text)
        data = await state.get_data()
        price_from = data.get('price_from')
        
        if price_to <= price_from:
            await message.answer("Цена ДО должна быть больше цены ОТ. Попробуйте снова:")
            return
        
        await state.update_data(price_to=price_to)
        await state.set_state(AddProduct.quantity_unit)
        
        # Создаем кнопки для выбора единицы измерения (все доступные единицы)
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_pcs")
        builder.button(text="кг", callback_data="unit_kg")
        builder.button(text="г", callback_data="unit_g")
        builder.button(text="л", callback_data="unit_l")
        builder.button(text="мл", callback_data="unit_ml")
        builder.button(text="м", callback_data="unit_m")
        builder.button(text="см", callback_data="unit_cm")
        builder.button(text="м²", callback_data="unit_m2")
        builder.button(text="м³", callback_data="unit_m3")
        builder.button(text="упак", callback_data="unit_pack")
        builder.button(text="набор", callback_data="unit_set")
        builder.button(text="пара", callback_data="unit_pair")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("Выберите единицу измерения:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")
"""
# ========== END REFACTORING STEP 5.6 ==========

# ========== REFACTORING STEP 5.7: process_price_fixed ==========
# TODO: REFACTORING STEP 5.7 - process_price_fixed
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_fixed
except ImportError:
    from handlers.products import process_price_fixed

@dp.message(AddProduct.price_fixed)
async def process_price_fixed_handler(message: Message, state: FSMContext):
    """Обработчик фиксированной цены - вызывает функцию из handlers/products.py"""
    await process_price_fixed(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.price_fixed)
async def process_price_fixed(message: Message, state: FSMContext):
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_fixed = float(message.text)
        await state.update_data(price_fixed=price_fixed)
        await state.set_state(AddProduct.quantity_unit)
        
        # Создаем кнопки для выбора единицы измерения (все доступные единицы)
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_pcs")
        builder.button(text="кг", callback_data="unit_kg")
        builder.button(text="г", callback_data="unit_g")
        builder.button(text="л", callback_data="unit_l")
        builder.button(text="мл", callback_data="unit_ml")
        builder.button(text="м", callback_data="unit_m")
        builder.button(text="см", callback_data="unit_cm")
        builder.button(text="м²", callback_data="unit_m2")
        builder.button(text="м³", callback_data="unit_m3")
        builder.button(text="упак", callback_data="unit_pack")
        builder.button(text="набор", callback_data="unit_set")
        builder.button(text="пара", callback_data="unit_pair")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("Выберите единицу измерения:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")
"""
# ========== END REFACTORING STEP 5.7 ==========

# ========== REFACTORING STEP 5.8: process_quantity_from ==========
# TODO: REFACTORING STEP 5.8 - process_quantity_from
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_quantity_from
except ImportError:
    from handlers.products import process_quantity_from

@dp.message(AddProduct.quantity_from)
async def process_quantity_from_handler(message: Message, state: FSMContext):
    """Обработчик количества 'от' - вызывает функцию из handlers/products.py"""
    await process_quantity_from(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.quantity_from)
async def process_quantity_from(message: Message, state: FSMContext):
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        quantity_from = int(message.text)
        if quantity_from < 1:
            await message.answer("Количество должно быть больше 0. Попробуйте снова:")
            return
        
        await state.update_data(quantity_from=quantity_from)
        
        # Для товара для покупки спрашиваем о показе количества
        await state.set_state(AddProduct.quantity_show_enabled)
        
        # Создаем кнопки для выбора показа количества
        builder = InlineKeyboardBuilder()
        builder.button(text="✅ Показывать", callback_data="quantity_show_yes")
        builder.button(text="❌ Не показывать", callback_data="quantity_show_no")
        builder.button(text="⚙️ Использовать настройку магазина", callback_data="quantity_show_default")
        builder.adjust(1)
        
        await message.answer(
            "Показывать количество товара на витрине?\n\n"
            "• <b>Показывать</b> - всегда показывать количество\n"
            "• <b>Не показывать</b> - скрыть количество\n"
            "• <b>Использовать настройку магазина</b> - использовать общую настройку",
            reply_markup=builder.as_markup(),
            parse_mode="HTML"
        )
    except ValueError:
        await message.answer("Пожалуйста, введите целое число.")
"""
# ========== END REFACTORING STEP 5.8 ==========

# ========== REFACTORING STEP 5.9: process_quantity_unit ==========
# TODO: REFACTORING STEP 5.9 - process_quantity_unit
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_quantity_unit
except ImportError:
    from handlers.products import process_quantity_unit

@dp.callback_query(StateFilter(AddProduct.quantity_unit), F.data.startswith("unit_"))
async def process_quantity_unit_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик единицы измерения - вызывает функцию из handlers/products.py"""
    await process_quantity_unit(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddProduct.quantity_unit), F.data.startswith("unit_"))
async def process_quantity_unit(callback: types.CallbackQuery, state: FSMContext):
    unit = callback.data.replace("unit_", "")
    
    # Маппинг единиц измерения
    unit_map = {
        "pcs": "шт",
        "kg": "кг",
        "g": "г",
        "l": "л",
        "ml": "мл",
        "m": "м",
        "cm": "см",
        "m2": "м²",
        "m3": "м³",
        "pack": "упак",
        "set": "набор",
        "pair": "пара"
    }
    
    quantity_unit = unit_map.get(unit, "шт")  # По умолчанию "шт"
    await state.update_data(quantity_unit=quantity_unit)
    
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товара для покупки переходим к вводу количества ОТ
        await state.set_state(AddProduct.quantity_from)
        await callback.message.answer("Введите количество ОТ (число, например: 1):")
    else:
        # Для обычного товара переходим к вводу количества на складе
        await state.set_state(AddProduct.quantity)
        await callback.message.answer("Введите количество товара на складе:")
    
    await callback.answer()
"""
# ========== END REFACTORING STEP 5.9 ==========

# ========== REFACTORING STEP 4.8: show_category_selection ==========
# TODO: REFACTORING STEP 4.8 - show_category_selection
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.categories import show_category_selection
except ImportError:
    from handlers.categories import show_category_selection

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def show_category_selection(callback_or_message, state: FSMContext):
    \"\"\"Вспомогательная функция для показа выбора категории\"\"\"
    data = await state.get_data()
    user_id = data.get('user_id', callback_or_message.from_user.id)
    
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "true"}) as resp:
            if resp.status != 200:
                if hasattr(callback_or_message, 'message'):
                    return await callback_or_message.message.answer("❌ Ошибка при получении списка категорий")
                else:
                    return await callback_or_message.answer("❌ Ошибка при получении списка категорий")
            all_categories = await resp.json()
    
    if not all_categories:
        if hasattr(callback_or_message, 'message'):
            return await callback_or_message.message.answer("❌ Нет категорий. Сначала создайте категорию!")
        else:
            return await callback_or_message.answer("❌ Нет категорий. Сначала создайте категорию!")
    
    # Получаем иерархию для отображения
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                if hasattr(callback_or_message, 'message'):
                    return await callback_or_message.message.answer("❌ Ошибка при получении списка категорий")
                else:
                    return await callback_or_message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    # Создаем словарь для быстрого поиска родительских категорий
    parent_map = {}
    for main_cat in main_categories:
        if main_cat.get('subcategories'):
            for subcat in main_cat['subcategories']:
                parent_map[subcat['id']] = main_cat['name']
    
    builder = InlineKeyboardBuilder()
    for cat in all_categories:
        # Если это подкатегория, показываем с указанием родительской
        if cat.get('parent_id'):
            parent_name = parent_map.get(cat['id'], '')
            display_name = f"{parent_name} → {cat['name']}"
        else:
            display_name = cat['name']
        builder.button(text=display_name, callback_data=f"cat_{cat['id']}")
    builder.adjust(1)
    
    await state.set_state(AddProduct.category)
    if hasattr(callback_or_message, 'message'):
        await callback_or_message.message.answer("Выберите категорию или подкатегорию:", reply_markup=builder.as_markup())
    else:
        await callback_or_message.answer("Выберите категорию или подкатегорию:", reply_markup=builder.as_markup())
"""
# ========== END REFACTORING STEP 4.8 ==========

# ========== REFACTORING STEP 5.10: process_quantity_show_enabled ==========
# TODO: REFACTORING STEP 5.10 - process_quantity_show_enabled
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_quantity_show_enabled
except ImportError:
    from handlers.products import process_quantity_show_enabled

@dp.callback_query(StateFilter(AddProduct.quantity_show_enabled), F.data.startswith("quantity_show_"))
async def process_quantity_show_enabled_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик показа количества - вызывает функцию из handlers/products.py"""
    await process_quantity_show_enabled(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddProduct.quantity_show_enabled), F.data.startswith("quantity_show_"))
async def process_quantity_show_enabled(callback: types.CallbackQuery, state: FSMContext):
    show_type = callback.data.replace("quantity_show_", "")
    
    if show_type == "yes":
        quantity_show_enabled = True
    elif show_type == "no":
        quantity_show_enabled = False
    else:  # default
        quantity_show_enabled = None
    
    await state.update_data(quantity_show_enabled=quantity_show_enabled)
    
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товара для покупки переходим к выбору категории
        await show_category_selection(callback, state)
    else:
        # Для обычного товара переходим к загрузке фото
        await state.update_data(photos=[])
        await state.set_state(AddProduct.photos)
        await callback.message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    
    await callback.answer()
"""
# ========== END REFACTORING STEP 5.10 ==========

# ========== REFACTORING STEP 5.11: process_price ==========
# TODO: REFACTORING STEP 5.11 - process_price
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price
except ImportError:
    from handlers.products import process_price

@dp.message(AddProduct.price)
async def process_price_handler(message: Message, state: FSMContext):
    """Обработчик цены - вызывает функцию из handlers/products.py"""
    await process_price(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.price)
async def process_price(message: Message, state: FSMContext):
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
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
            
        # Получаем все категории в плоском виде (включая подкатегории)
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "true"}) as resp:
                if resp.status != 200:
                    return await message.answer("❌ Ошибка при получении списка категорий")
                all_categories = await resp.json()
        
        if not all_categories:
            return await message.answer("❌ Нет категорий. Сначала создайте категорию!")
        
        # Получаем иерархию для отображения
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
                if resp.status != 200:
                    return await message.answer("❌ Ошибка при получении списка категорий")
                main_categories = await resp.json()
        
        # Создаем словарь для быстрого поиска родительских категорий
        parent_map = {}
        for main_cat in main_categories:
            if main_cat.get('subcategories'):
                for subcat in main_cat['subcategories']:
                    parent_map[subcat['id']] = main_cat['name']
        
        builder = InlineKeyboardBuilder()
        for cat in all_categories:
            # Если это подкатегория, показываем с указанием родительской
            if cat.get('parent_id'):
                parent_name = parent_map.get(cat['id'], '')
                display_name = f"{parent_name} → {cat['name']}"
            else:
                display_name = cat['name']
            builder.button(text=display_name, callback_data=f"cat_{cat['id']}")
        builder.adjust(1)
        
        await state.set_state(AddProduct.category)
        await message.answer("Выберите категорию или подкатегорию:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")
"""
# ========== END REFACTORING STEP 5.11 ==========

# ========== REFACTORING STEP 5.12: process_category ==========
# TODO: REFACTORING STEP 5.12 - process_category
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_category
except ImportError:
    from handlers.products import process_category

@dp.callback_query(StateFilter(AddProduct.category))
async def process_category_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик категории - вызывает функцию из handlers/products.py"""
    await process_category(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddProduct.category))
async def process_category(callback: types.CallbackQuery, state: FSMContext):
    cat_id = int(callback.data.split("_")[1])
    await state.update_data(category_id=cat_id)
    await state.set_state(AddProduct.is_hot_offer)
    
    # Создаем кнопки для выбора горящего предложения
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Да", callback_data="hot_offer_yes")
    builder.button(text="❌ Нет", callback_data="hot_offer_no")
    builder.adjust(2)
    
    await callback.message.answer(
        "🔥 Это горящее предложение?",
        reply_markup=builder.as_markup()
    )
    await callback.answer()
"""
# ========== END REFACTORING STEP 5.12 ==========

# ========== REFACTORING STEP 5.13: process_hot_offer ==========
# TODO: REFACTORING STEP 5.13 - process_hot_offer
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_hot_offer
except ImportError:
    from handlers.products import process_hot_offer

@dp.callback_query(StateFilter(AddProduct.is_hot_offer), F.data.startswith("hot_offer_"))
async def process_hot_offer_handler(callback: types.CallbackQuery, state: FSMContext):
    """Обработчик горящего предложения - вызывает функцию из handlers/products.py"""
    await process_hot_offer(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.callback_query(StateFilter(AddProduct.is_hot_offer), F.data.startswith("hot_offer_"))
async def process_hot_offer(callback: types.CallbackQuery, state: FSMContext):
    is_hot_offer = callback.data == "hot_offer_yes"
    await state.update_data(is_hot_offer=is_hot_offer)
    
    # Проверяем, является ли товар для покупки
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товаров для покупки пропускаем вопрос о скидке
        await state.update_data(discount=0.0)  # Устанавливаем 0 по умолчанию
        await state.set_state(AddProduct.description)
        await callback.message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    else:
        # Для обычных товаров и товаров под заказ спрашиваем скидку
        await state.set_state(AddProduct.discount)
        await callback.message.answer("Введите скидку на товар в % (если нет, введите 0):")
    
    await callback.answer()
"""
# ========== END REFACTORING STEP 5.13 ==========

# ========== REFACTORING STEP 5.14: process_discount ==========
# TODO: REFACTORING STEP 5.14 - process_discount
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_discount
except ImportError:
    from handlers.products import process_discount

# ========== REFACTORING STEP: process_price_card ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_card
except ImportError:
    from handlers.products import process_price_card

@dp.message(AddProduct.price_card)
async def process_price_card_handler(message: Message, state: FSMContext):
    """Обработчик цены по карте - вызывает функцию из handlers/products.py"""
    await process_price_card(message, state)

# ========== REFACTORING STEP: process_price_cash ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_cash
except ImportError:
    from handlers.products import process_price_cash

@dp.message(AddProduct.price_cash)
async def process_price_cash_handler(message: Message, state: FSMContext):
    """Обработчик цены наличными - вызывает функцию из handlers/products.py"""
    await process_price_cash(message, state)

# ========== REFACTORING STEP: process_price_old ==========
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_price_old
except ImportError:
    from handlers.products import process_price_old

@dp.message(AddProduct.price_old)
async def process_price_old_handler(message: Message, state: FSMContext):
    """Обработчик старой цены - вызывает функцию из handlers/products.py"""
    await process_price_old(message, state)

@dp.message(AddProduct.discount)
async def process_discount_handler(message: Message, state: FSMContext):
    """Обработчик скидки - вызывает функцию из handlers/products.py"""
    await process_discount(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.discount)
async def process_discount(message: Message, state: FSMContext):
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        discount = float(message.text)
        await state.update_data(discount=discount)
        await state.set_state(AddProduct.description)
        await message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    except ValueError:
        await message.answer("Пожалуйста, введите число (например, 10 или 0).")
"""
# ========== END REFACTORING STEP 5.14 ==========

# ========== REFACTORING STEP 5.15: process_description ==========
# TODO: REFACTORING STEP 5.15 - process_description
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_description
except ImportError:
    from handlers.products import process_description

@dp.message(AddProduct.description)
async def process_description_handler(message: Message, state: FSMContext):
    """Обработчик описания - вызывает функцию из handlers/products.py"""
    await process_description(message, state)

# ========== Обработчики доставки (после описания, перед характеристиками) ==========
try:
    from .handlers.products import (
        process_ask_delivery,
        process_delivery_time,
        process_delivery_price,
    )
except ImportError:
    from handlers.products import (
        process_ask_delivery,
        process_delivery_time,
        process_delivery_price,
    )

@dp.callback_query(AddProduct.ask_delivery, F.data.in_(["delivery_yes", "delivery_skip"]))
async def process_ask_delivery_handler(callback: CallbackQuery, state: FSMContext):
    """Обработка: указать доставку или пропустить"""
    await process_ask_delivery(callback, state)

@dp.message(AddProduct.delivery_time_input)
async def process_delivery_time_handler(message: Message, state: FSMContext):
    """Обработка ввода срока доставки"""
    await process_delivery_time(message, state)

@dp.message(AddProduct.delivery_price_input)
async def process_delivery_price_handler(message: Message, state: FSMContext):
    """Обработка ввода стоимости доставки"""
    await process_delivery_price(message, state)

# ========== Обработчики характеристик (после описания/доставки, перед фото) ==========
try:
    from .handlers.products import (
        process_ask_features,
        process_feature_name_choose,
        process_feature_name_manual,
        process_feature_value,
        process_ask_more_features,
    )
except ImportError:
    from handlers.products import (
        process_ask_features,
        process_feature_name_choose,
        process_feature_name_manual,
        process_feature_value,
        process_ask_more_features,
    )

@dp.callback_query(AddProduct.ask_features, F.data.in_(["features_yes", "features_skip"]))
async def process_ask_features_handler(callback: CallbackQuery, state: FSMContext):
    """Обработка: добавить характеристики или пропустить"""
    await process_ask_features(callback, state)

@dp.callback_query(AddProduct.feature_name_choose)
async def process_feature_name_choose_handler(callback: CallbackQuery, state: FSMContext):
    """Обработка выбора названия характеристики из списка или ввод нового"""
    await process_feature_name_choose(callback, state)

@dp.message(AddProduct.feature_name_manual)
async def process_feature_name_manual_handler(message: Message, state: FSMContext):
    """Обработка ввода нового названия характеристики вручную"""
    await process_feature_name_manual(message, state)

@dp.message(AddProduct.feature_value)
async def process_feature_value_handler(message: Message, state: FSMContext):
    """Обработка ввода значения характеристики"""
    await process_feature_value(message, state)

@dp.callback_query(AddProduct.ask_more_features, F.data.in_(["features_add_more", "features_continue"]))
async def process_ask_more_features_handler(callback: CallbackQuery, state: FSMContext):
    """Обработка: добавить ещё характеристику или продолжить"""
    await process_ask_more_features(callback, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.description)
async def process_description(message: Message, state: FSMContext):
    # Если пользователь отправил команду (кроме /skip) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text != "/skip") or is_menu_button(message.text or ""):
        return
    
    description = message.text if message.text != "/skip" else None
    await state.update_data(description=description)
    
    # Проверяем, является ли товар для покупки
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товаров для покупки пропускаем вопрос о количестве на складе
        await state.update_data(quantity=0)  # Устанавливаем 0 по умолчанию
        await state.set_state(AddProduct.photos)
        await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    else:
        # Для обычных товаров и товаров под заказ
        data = await state.get_data()
        is_made_to_order = data.get('is_made_to_order', False)
        
        if is_made_to_order:
            # Для товара под заказ пропускаем вопрос о количестве на складе
            await state.update_data(quantity=0, quantity_unit="шт")  # Устанавливаем 0 и "шт" по умолчанию
            await state.set_state(AddProduct.photos)
            await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
        else:
            # Для обычного товара сначала выбираем единицу измерения
            await state.set_state(AddProduct.quantity_unit)
            
            # Создаем кнопки для выбора единицы измерения (все доступные единицы)
            builder = InlineKeyboardBuilder()
            builder.button(text="шт", callback_data="unit_pcs")
            builder.button(text="кг", callback_data="unit_kg")
            builder.button(text="г", callback_data="unit_g")
            builder.button(text="л", callback_data="unit_l")
            builder.button(text="мл", callback_data="unit_ml")
            builder.button(text="м", callback_data="unit_m")
            builder.button(text="см", callback_data="unit_cm")
            builder.button(text="м²", callback_data="unit_m2")
            builder.button(text="м³", callback_data="unit_m3")
            builder.button(text="упак", callback_data="unit_pack")
            builder.button(text="набор", callback_data="unit_set")
            builder.button(text="пара", callback_data="unit_pair")
            builder.adjust(3)  # По 3 кнопки в ряд
            
            await message.answer("Выберите единицу измерения:", reply_markup=builder.as_markup())
"""
# ========== END REFACTORING STEP 5.15 ==========

# ========== REFACTORING STEP 5.16: process_quantity ==========
# TODO: REFACTORING STEP 5.16 - process_quantity
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_quantity
except ImportError:
    from handlers.products import process_quantity

@dp.message(AddProduct.quantity)
async def process_quantity_handler(message: Message, state: FSMContext):
    """Обработчик количества - вызывает функцию из handlers/products.py"""
    await process_quantity(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.quantity)
async def process_quantity(message: Message, state: FSMContext):
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        quantity = int(message.text)
        if quantity < 0:
            await message.answer("Количество не может быть отрицательным. Введите число (0 или больше):")
            return
        
        # Проверяем, есть ли уже единица измерения (для обычного товара)
        data = await state.get_data()
        if not data.get('quantity_unit'):
            # Если единица измерения не установлена (для товара под заказ), устанавливаем по умолчанию
            await state.update_data(quantity_unit="шт")
        
        await state.update_data(quantity=quantity)
        
        # Для обычного товара спрашиваем о показе количества
        is_made_to_order = data.get('is_made_to_order', False)
        if not is_made_to_order:
            await state.set_state(AddProduct.quantity_show_enabled)
            
            # Создаем кнопки для выбора показа количества
            builder = InlineKeyboardBuilder()
            builder.button(text="✅ Показывать", callback_data="quantity_show_yes")
            builder.button(text="❌ Не показывать", callback_data="quantity_show_no")
            builder.button(text="⚙️ Использовать настройку магазина", callback_data="quantity_show_default")
            builder.adjust(1)
            
            await message.answer(
                "Показывать количество товара на витрине?\n\n"
                "• <b>Показывать</b> - всегда показывать количество\n"
                "• <b>Не показывать</b> - скрыть количество\n"
                "• <b>Использовать настройку магазина</b> - использовать общую настройку",
                reply_markup=builder.as_markup(),
                parse_mode="HTML"
            )
        else:
            # Для товара под заказ пропускаем вопрос о показе количества
            await state.update_data(quantity_show_enabled=None, photos=[])
            await state.set_state(AddProduct.photos)
            await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    except ValueError:
        await message.answer("Пожалуйста, введите целое число (например, 10 или 0).")
"""
# ========== END REFACTORING STEP 5.16 ==========

# ========== REFACTORING STEP 5.17: process_photos ==========
# TODO: REFACTORING STEP 5.17 - process_photos
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_photos
except ImportError:
    from handlers.products import process_photos

@dp.message(AddProduct.photos, F.photo)
async def process_photos_handler(message: Message, state: FSMContext):
    """Обработчик фото - вызывает функцию из handlers/products.py"""
    await process_photos(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.photos, F.photo)
async def process_photos(message: Message, state: FSMContext):
    data = await state.get_data()
    photos_list = data.get('photos', [])
    
    logging.info(f"[PHOTOS] Received photo, current photos_list length: {len(photos_list)}")
    
    # Проверяем лимит (до 5 фото)
    if len(photos_list) >= 5:
        await message.answer("⚠️ Максимум 5 фото. Отправьте /done чтобы закончить добавление товара.")
        return
    
    photo = message.photo[-1]
    logging.info(f"[PHOTOS] Processing photo with file_id: {photo.file_id}")
    
    # Сохраняем file_id и путь к файлу во временное хранилище
    # Добавляем повторные попытки при ошибках сети
    max_retries = 3
    retry_delay = 2  # секунды
    
    for attempt in range(max_retries):
        try:
            file_info = await bot.get_file(photo.file_id)
            file_ext = os.path.splitext(file_info.file_path)[1] or '.jpg'
            
            # Скачиваем во временный файл
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                tmp_path = tmp_file.name
                await bot.download_file(file_info.file_path, tmp_path)
            
            # ВАЖНО: снова получаем актуальное состояние, так как оно могло измениться
            data = await state.get_data()
            photos_list = data.get('photos', [])
            
            # Проверяем, не добавлено ли уже это фото (по file_id)
            if any(p.get('file_id') == photo.file_id for p in photos_list):
                logging.warning(f"[PHOTOS] Photo {photo.file_id} already in list, skipping")
                await message.answer(f"⚠️ Это фото уже добавлено. Отправьте другое фото или /done чтобы закончить.")
                return
            
            # Сохраняем путь к временному файлу
            photos_list.append({
                'file_id': photo.file_id,
                'tmp_path': tmp_path,
                'file_ext': file_ext
            })
            
            logging.info(f"[PHOTOS] Successfully added photo {len(photos_list)}/5, file_id: {photo.file_id}, tmp_path: {tmp_path}")
            
            await state.update_data(photos=photos_list)
            
            # Проверяем, что фото действительно добавлено в состояние
            verify_data = await state.get_data()
            verify_photos = verify_data.get('photos', [])
            logging.info(f"[PHOTOS] Verified: photos in state after update: {len(verify_photos)}")
            
            remaining = 5 - len(photos_list)
            if remaining > 0:
                await message.answer(f"✅ Фото {len(photos_list)}/5 добавлено. Отправьте еще фото или /done чтобы закончить.")
            else:
                await message.answer("✅ Добавлено максимальное количество фото (5). Отправьте /done чтобы закончить.")
            break  # Успешно обработано, выходим из цикла
        except (TelegramNetworkError, aiohttp.client_exceptions.ClientConnectorError) as e:
            if attempt < max_retries - 1:
                logging.warning(f"Network error on attempt {attempt + 1}/{max_retries} for photo {len(photos_list)+1}, retrying in {retry_delay}s: {e}")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Увеличиваем задержку при каждой попытке
            else:
                logging.error(f"Exception in process_photos after {max_retries} attempts for photo {len(photos_list)+1}: {e}", exc_info=True)
                await message.answer(f"❌ Ошибка при обработке фото {len(photos_list)+1} после {max_retries} попыток. Попробуйте отправить фото еще раз.")
                # НЕ выходим из функции - пользователь может попробовать отправить фото снова
                return
        except Exception as e:
            logging.error(f"Exception in process_photos: {e}", exc_info=True)
            await message.answer(f"❌ Ошибка при обработке фото: {str(e)}")
            break  # Для других ошибок не повторяем
"""
# ========== END REFACTORING STEP 5.17 ==========

# ========== REFACTORING STEP 5.18: process_photos_done ==========
# TODO: REFACTORING STEP 5.18 - process_photos_done
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.products import process_photos_done
except ImportError:
    from handlers.products import process_photos_done

@dp.message(AddProduct.photos)
async def process_photos_done_handler(message: Message, state: FSMContext):
    """Обработчик завершения обработки фото - вызывает функцию из handlers/products.py"""
    await process_photos_done(message, state)

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
@dp.message(AddProduct.photos)
async def process_photos_done(message: Message, state: FSMContext):
    # Если пользователь отправил команду (кроме /done и /skip) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text not in ["/done", "/skip"]) or is_menu_button(message.text or ""):
        return
    
    if message.text == "/done" or message.text == "/skip":
        data = await state.get_data()
        user_id = data.get('user_id', message.from_user.id)
        photos_list = data.get('photos', [])
        
        logging.info(f"Processing photos_done: photos_list length={len(photos_list)}")
        for idx, photo_data in enumerate(photos_list):
            logging.info(f"Photo {idx+1}: file_id={photo_data.get('file_id')}, tmp_path={photo_data.get('tmp_path')}, exists={os.path.exists(photo_data.get('tmp_path', ''))}")
        
        try:
            # Отправляем данные на бэкенд
            # Используем FormData для правильной отправки множественных файлов
            logging.info(f"Sending product data to {API_URL}/products/ with {len(photos_list)} photos")
            try:
                async with aiohttp.ClientSession() as session:
                    # Создаем FormData для правильной отправки множественных файлов
                    # FormData правильно обрабатывает множественные файлы с одним именем поля для FastAPI
                    form_data = aiohttp.FormData()
                    
                    # Добавляем все текстовые поля
                    form_data.add_field('name', data['name'])
                    
                    # Для товаров для покупки price может быть не установлен
                    # Используем price_from или price_fixed как базовую цену для отображения
                    if data.get('is_for_sale'):
                        if data.get('price_type') == 'fixed' and data.get('price_fixed'):
                            form_data.add_field('price', str(data['price_fixed']))
                        elif data.get('price_from'):
                            form_data.add_field('price', str(data['price_from']))
                        else:
                            form_data.add_field('price', '0')
                    else:
                        form_data.add_field('price', str(data.get('price', 0)))
                    
                    form_data.add_field('category_id', str(data['category_id']))
                    form_data.add_field('user_id', str(user_id))
                    form_data.add_field('discount', str(data.get('discount', 0)))
                    form_data.add_field('quantity', str(data.get('quantity', 0)))
                    form_data.add_field('is_hot_offer', str(data.get('is_hot_offer', False)).lower())
                    form_data.add_field('is_made_to_order', str(data.get('is_made_to_order', False)).lower())
                    form_data.add_field('is_for_sale', str(data.get('is_for_sale', False)).lower())
                    
                    # Поле для показа количества (может быть None, True или False)
                    quantity_show_enabled = data.get('quantity_show_enabled')
                    if quantity_show_enabled is not None:
                        form_data.add_field('quantity_show_enabled', str(quantity_show_enabled).lower())
                    
                    if data.get('description'):
                        form_data.add_field('description', data['description'])
                    
                    # Поля для товаров для покупки
                    if data.get('is_for_sale'):
                        if data.get('price_type'):
                            form_data.add_field('price_type', data['price_type'])
                        
                        if data.get('price_from') is not None:
                            form_data.add_field('price_from', str(data['price_from']))
                        if data.get('price_to') is not None:
                            form_data.add_field('price_to', str(data['price_to']))
                        if data.get('price_fixed') is not None:
                            form_data.add_field('price_fixed', str(data['price_fixed']))
                        if data.get('quantity_from') is not None:
                            form_data.add_field('quantity_from', str(data['quantity_from']))
                        if data.get('quantity_unit'):
                            form_data.add_field('quantity_unit', data['quantity_unit'])
                    
                    # Добавляем все файлы с одним именем поля 'images'
                    # ВАЖНО: FormData позволяет добавлять несколько файлов с одним именем поля
                    # FastAPI соберет их в список при использовании List[UploadFile]
                    file_handles = []
                    try:
                        for idx, photo_data in enumerate(photos_list):
                            tmp_path = photo_data['tmp_path']
                            file_ext = photo_data['file_ext']
                            
                            # Открываем файл для чтения (остается открытым до отправки)
                            file_handle = open(tmp_path, 'rb')
                            file_handles.append(file_handle)
                            
                            # Добавляем файл в FormData с одним именем поля 'images'
                            # Все файлы с именем 'images' будут собраны FastAPI в список
                            form_data.add_field(
                                'images',
                                file_handle,
                                filename=f"product_{photo_data['file_id']}{file_ext}",
                                content_type='image/jpeg'
                            )
                            logging.info(f"Added image {idx+1} to FormData: {tmp_path}")
                        
                        logging.info(f"Total images added to FormData: {len(photos_list)}")
                        
                        async with session.post(f"{API_URL}/products/", data=form_data) as resp:
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
                    finally:
                        # Закрываем все открытые файлы после отправки
                        for fh in file_handles:
                            try:
                                fh.close()
                            except:
                                pass
            except Exception as req_e:
                logging.error(f"Exception during request: {req_e}", exc_info=True)
                await message.answer(f"❌ Ошибка при отправке запроса: {str(req_e)}")
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
            await cmd_manage(message, state)
    else:
        await message.answer("Отправьте фото товара, /done чтобы закончить, или /skip чтобы пропустить фото:")
"""
# ========== END REFACTORING STEP 5.18 ==========

# ========== REFACTORING STEP 9.1: send_reservation_notification ==========
# Дата начала: 2024-12-19
# Статус: В процессе
# НОВЫЙ КОД (используется сейчас)
try:
    from .handlers.notifications import send_reservation_notification
except ImportError:
    from handlers.notifications import send_reservation_notification

# СТАРЫЙ КОД (закомментирован, будет удален после проверки)
"""
async def send_reservation_notification(product_owner_id: int, product_id: int, reserved_by_user_id: int, reserved_until: str, product_name: str):
    \"\"\"Отправляет уведомление владельцу магазина о резервации товара\"\"\"
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
"""
# ========== END REFACTORING STEP 9.1 ==========

# ========== DEBUG: Fallback для необработанных callback-ов ==========
# ВРЕМЕННЫЙ обработчик для отладки - показывает все необработанные callback-и
# УДАЛИТЬ после фикса проблемы с quantity_unit
@dp.callback_query()
async def debug_unhandled_callbacks(callback: types.CallbackQuery, state: FSMContext):
    """Временный обработчик для отладки необработанных callback-ов"""
    st = await state.get_state()
    logging.debug("UNHANDLED CALLBACK: callback_data=%s, state=%s", callback.data, st)
    try:
        await callback.answer("⚠️ Необработанная кнопка (см. лог)", show_alert=False)
    except (TelegramNetworkError, TelegramAPIError, TelegramServerError) as e:
        logging.warning("debug_unhandled_callbacks: не удалось ответить на callback (сеть/API): %s", e)
    except Exception as e:
        logging.warning("debug_unhandled_callbacks: ошибка при answer: %s", e, exc_info=True)
# ========== END DEBUG ==========

async def main():
    # Проверка токена
    if not TOKEN:
        print("❌ ОШИБКА: TELEGRAM_BOT_TOKEN не найден в переменных окружения!")
        print("Проверьте файл .env в корне проекта.")
        return
    
    print("Бот запущен. Все пользователи могут управлять своими витринами.")
    
    # Проверка подключения к Telegram API с повторными попытками
    max_retries = 5
    retry_delay = 5  # секунд
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Попытка подключения к Telegram API ({attempt}/{max_retries})...")
            # Проверяем подключение через get_me
            bot_info = await bot.get_me()
            print(f"✅ Подключение успешно! Бот: @{bot_info.username} (ID: {bot_info.id})")
            break
        except TelegramNetworkError as e:
            error_msg = str(e)
            if attempt < max_retries:
                print(f"⚠️ Ошибка сети (попытка {attempt}/{max_retries}): {error_msg}")
                print(f"Повторная попытка через {retry_delay} секунд...")
                await asyncio.sleep(retry_delay)
            else:
                print(f"❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось подключиться к Telegram API после {max_retries} попыток")
                print(f"Последняя ошибка: {error_msg}")
                print("\nВозможные причины:")
                print("1. Проблемы с интернет-соединением")
                print("2. Telegram API временно недоступен")
                print("3. Блокировка Telegram API (проверьте прокси/файрвол)")
                print("4. Проблемы с SSL/TLS соединением")
                return
        except TelegramAPIError as e:
            error_msg = str(e)
            print(f"❌ Ошибка Telegram API: {error_msg}")
            print("\nВозможные причины:")
            print("1. Неверный токен бота")
            print("2. Бот был удален или заблокирован")
            print("3. Проблемы с правами доступа")
            return
        except Exception as e:
            error_msg = str(e)
            if attempt < max_retries:
                print(f"⚠️ Неожиданная ошибка (попытка {attempt}/{max_retries}): {error_msg}")
                print(f"Повторная попытка через {retry_delay} секунд...")
                await asyncio.sleep(retry_delay)
            else:
                print(f"❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось подключиться к Telegram API после {max_retries} попыток")
                print(f"Последняя ошибка: {error_msg}")
                logging.error(f"Connection error: {e}", exc_info=True)
                return
    
    # Запускаем polling
    try:
        await dp.start_polling(bot)
    except KeyboardInterrupt:
        print("\n⚠️ Получен сигнал остановки (Ctrl+C)")
    except TelegramServerError as e:
        print(f"⚠️ Ошибка Telegram сервера (Bad Gateway/временная проблема): {e}")
        print("💡 Это временная проблема Telegram API. Бот будет перезапущен через несколько секунд.")
        logging.warning(f"Telegram server error (temporary): {e}")
        # Не выводим полный traceback для временных ошибок сервера
    except TelegramNetworkError as e:
        print(f"⚠️ Ошибка сети Telegram: {e}")
        print("💡 Проблема с подключением к Telegram API. Проверьте интернет-соединение.")
        logging.warning(f"Telegram network error: {e}")
    except TelegramAPIError as e:
        print(f"❌ Ошибка Telegram API: {e}")
        logging.error(f"Telegram API error: {e}", exc_info=True)
    except Exception as e:
        print(f"❌ Неожиданная ошибка во время работы бота: {e}")
        logging.error(f"Bot error: {e}", exc_info=True)
    finally:
        await bot.session.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⚠️ Бот остановлен пользователем")
    except Exception as e:
        print(f"❌ Критическая ошибка: {e}")
        logging.error(f"Critical error: {e}", exc_info=True)
