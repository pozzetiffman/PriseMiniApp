"""
Утилиты для бота
"""
import os
import aiohttp
from aiogram.types import Message
from aiogram.fsm.context import FSMContext

# Кэш для username бота
_bot_username = None


async def get_bot_username():
    """Получить username бота"""
    # Lazy import для избежания циклических зависимостей
    import sys
    
    # Определяем, как получить bot в зависимости от контекста
    if __package__:
        # Запущено как модуль пакета
        from .bot import bot
    else:
        # Запущено как скрипт - получаем bot из __main__ модуля
        import __main__
        bot = __main__.bot
    
    global _bot_username
    if _bot_username is None:
        bot_info = await bot.get_me()
        _bot_username = bot_info.username
    return _bot_username


async def get_bot_deeplink(user_id: int):
    """Получить deep link на бота с параметром для открытия витрины"""
    username = await get_bot_username()
    return f"https://t.me/{username}?start=store_{user_id}"


async def get_shop_name(user_id: int) -> str:
    """Получить название магазина для пользователя"""
    # Lazy import для получения API_URL из bot.py
    import sys
    if __package__:
        from .bot import API_URL
    else:
        import __main__
        API_URL = __main__.API_URL
    
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


async def get_shop_settings(user_id: int) -> dict:
    """Получить настройки магазина для пользователя"""
    # Lazy import для получения API_URL из bot.py
    import sys
    if __package__:
        from .bot import API_URL
    else:
        import __main__
        API_URL = __main__.API_URL
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/shop-settings/", params={"shop_owner_id": user_id}) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    return {}
    except:
        return {}


async def send_shop_message(bot_or_message, chat_id_or_message, msg: str, reply_markup, shop_owner_id: int):
    """
    Отправить сообщение о магазине с фото, если оно есть.
    bot_or_message - объект bot или message
    chat_id_or_message - chat_id (для bot.send_message) или message (для message.answer)
    """
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


def is_command(text: str) -> bool:
    """Проверяет, является ли текст командой"""
    if not text:
        return False
    return text.startswith('/') or text in ['/cancel', '/start', '/manage', '/post', '/mylink', '/getlink', '/connect']


def is_menu_button(text: str) -> bool:
    """Проверяет, является ли текст кнопкой меню"""
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


async def clear_state_if_needed(message: Message, state: FSMContext, current_state=None):
    """
    Проверяет и очищает состояние FSM, если пользователь использует другую команду.
    Возвращает True, если состояние было очищено.
    """
    current_fsm_state = await state.get_state()
    
    # Если есть активное состояние и это не текущее состояние команды
    if current_fsm_state and current_fsm_state != current_state:
        # Определяем тип состояния для информативного сообщения
        state_str = str(current_fsm_state)
        
        # Формируем сообщение в зависимости от типа состояния
        if "ConnectBot" in state_str:
            await state.clear()
            await message.answer(
                "ℹ️ Процесс подключения бота отменен.\n\n"
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

