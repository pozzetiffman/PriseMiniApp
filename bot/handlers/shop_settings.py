"""
Обработчики для управления настройками магазина
"""
import os
import logging
import tempfile
import aiohttp
from aiogram.types import Message
from aiogram.fsm.context import FSMContext

# Lazy imports для утилит
try:
    from ..utils import clear_state_if_needed, is_command, is_menu_button
except ImportError:
    from utils import clear_state_if_needed, is_command, is_menu_button

# Импорт состояний FSM
try:
    from ..states import SetShopName, SetWelcomeImage, SetWelcomeDescription
except ImportError:
    from states import SetShopName, SetWelcomeImage, SetWelcomeDescription

# Lazy import для _cmd_manage_impl из commands
def get_cmd_manage_impl():
    """Получить функцию _cmd_manage_impl из handlers.commands"""
    try:
        from ..handlers.commands import _cmd_manage_impl
    except ImportError:
        from handlers.commands import _cmd_manage_impl
    return _cmd_manage_impl

# Lazy import для получения API_URL из bot.py
def get_api_url():
    """Получить API_URL из bot.py"""
    try:
        import __main__
        return __main__.API_URL
    except:
        return "http://localhost:8000/api"

# Lazy import для получения bot из bot.py
def get_bot():
    """Получить bot из bot.py"""
    try:
        import __main__
        return __main__.bot
    except:
        # Fallback: пытаемся импортировать напрямую
        try:
            from ..bot import bot
            return bot
        except:
            from bot import bot
            return bot


async def manage_shop_name(message: Message, state: FSMContext):
    """Управление названием магазина"""
    # Получаем API_URL через lazy import
    API_URL = get_api_url()
    
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


async def process_shop_name(message: Message, state: FSMContext):
    """Обработка названия магазина"""
    # Получаем API_URL и _cmd_manage_impl через lazy imports
    API_URL = get_api_url()
    _cmd_manage_impl = get_cmd_manage_impl()
    
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


async def manage_welcome_image(message: Message, state: FSMContext):
    """Управление логотипом магазина"""
    # Получаем API_URL через lazy import
    API_URL = get_api_url()
    
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


async def process_welcome_image(message: Message, state: FSMContext):
    """Обработка логотипа (фото)"""
    # Получаем bot, API_URL и _cmd_manage_impl через lazy imports
    bot = get_bot()
    API_URL = get_api_url()
    _cmd_manage_impl = get_cmd_manage_impl()
    
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


async def process_welcome_image_text(message: Message, state: FSMContext):
    """Обработка логотипа (текст)"""
    # Получаем API_URL и _cmd_manage_impl через lazy imports
    API_URL = get_api_url()
    _cmd_manage_impl = get_cmd_manage_impl()
    
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


async def manage_welcome_description(message: Message, state: FSMContext):
    """Управление описанием магазина"""
    # Получаем API_URL через lazy import
    API_URL = get_api_url()
    
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


async def process_welcome_description(message: Message, state: FSMContext):
    """Обработка описания магазина"""
    # Получаем API_URL и _cmd_manage_impl через lazy imports
    API_URL = get_api_url()
    _cmd_manage_impl = get_cmd_manage_impl()
    
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

