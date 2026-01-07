"""
Обработчики для управления ботами
"""
import logging
import aiohttp
from aiogram import types
from aiogram.types import Message
from aiogram.fsm.context import FSMContext

# Lazy imports для утилит
try:
    from ..utils import clear_state_if_needed, is_command, is_menu_button
except ImportError:
    from utils import clear_state_if_needed, is_command, is_menu_button

# Импорт состояний FSM
try:
    from ..states import ConnectBot
except ImportError:
    from states import ConnectBot

# Lazy import для получения API_URL из bot.py
def get_api_url():
    """Получить API_URL из bot.py"""
    try:
        import __main__
        return __main__.API_URL
    except:
        return "http://localhost:8000/api"

# Lazy import для _cmd_mylink_impl из commands
def get_cmd_mylink_impl():
    """Получить функцию _cmd_mylink_impl из handlers.commands"""
    try:
        from ..handlers.commands import _cmd_mylink_impl
    except ImportError:
        from handlers.commands import _cmd_mylink_impl
    return _cmd_mylink_impl

# Lazy import для cmd_connect из commands
def get_cmd_connect():
    """Получить функцию cmd_connect из handlers.commands"""
    try:
        from ..handlers.commands import cmd_connect
    except ImportError:
        from handlers.commands import cmd_connect
    return cmd_connect


async def process_bot_token(message: Message, state: FSMContext):
    """
    Обработать токен бота и сохранить его, затем запросить название Web App.
    """
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
            "❌ Неверный формат токена.\n\n"
            "Токен должен быть в формате: <code>123456:ABC-DEF...</code>\n\n"
            "Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
            parse_mode="HTML"
        )
        return
    
    # Сохраняем токен в состоянии
    await state.update_data(bot_token=bot_token)
    
    # Запрашиваем название Web App
    await message.answer(
        "✅ Токен принят!\n\n"
        "📝 <b>Теперь укажите название Web App</b>\n\n"
        "Это название, которое вы указали при создании Web App через <code>/newapp</code> в @BotFather.\n"
        "Например: <code>shop1</code>, <code>TGshowcase</code>, <code>my_shop</code> и т.д.\n\n"
        "💡 Если вы еще не создали Web App, укажите любое название (например: <code>shop</code>).\n"
        "Затем создайте Web App через <code>/newapp</code> в @BotFather с этим же названием.\n\n"
        "<b>Отправьте название Web App:</b>",
        parse_mode="HTML"
    )
    
    await state.set_state(ConnectBot.web_app_name)


async def process_web_app_name(message: Message, state: FSMContext):
    """
    Обработать название Web App и зарегистрировать бота.
    """
    # Получаем API_URL через lazy import
    API_URL = get_api_url()
    
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
            "❌ Неверный формат названия Web App.\n\n"
            "Название может содержать только буквы, цифры, подчеркивания (_) и дефисы (-).\n\n"
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
                        f"✅ <b>Бот успешно подключен!</b>\n\n"
                        f"🤖 Бот: @{bot_username}\n"
                        f"📱 Web App: <code>{saved_web_app_name}</code>\n"
                        f"🔗 Ссылка: <code>{web_app_link}</code>\n\n"
                        f"📋 <b>Следующие шаги:</b>\n\n"
                        f"1️⃣ Откройте @BotFather\n"
                        f"2️⃣ Отправьте <code>/newapp</code>\n"
                        f"3️⃣ Выберите вашего бота: @{bot_username}\n"
                        f"4️⃣ Введите название: <code>{saved_web_app_name}</code>\n"
                        f"5️⃣ Введите описание\n"
                        f"6️⃣ Загрузите фото (640x360)\n"
                        f"7️⃣ URL: <code>https://webapp-eight-vert.vercel.app</code>\n\n"
                        f"✅ После настройки используйте команду <code>/mylink</code> для получения ссылки!",
                        parse_mode="HTML"
                    )
                elif resp.status == 409:
                    error_text = await resp.text()
                    await message.answer(
                        "⚠️ Этот бот уже зарегистрирован.\n\n"
                        "Если это ваш бот, он уже подключен к системе.\n\n"
                        "Используйте команду <code>/mylink</code> для получения ссылки.",
                        parse_mode="HTML"
                    )
                else:
                    error_text = await resp.text()
                    logging.error(f"Error registering bot: status={resp.status}, error={error_text}")
                    await message.answer(
                        f"❌ Ошибка при регистрации бота.\n\n"
                        f"Проверьте:\n"
                        f"• Правильность токена\n"
                        f"• Что бот создан в @BotFather\n"
                        f"• Что бот имеет username\n\n"
                        f"Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
                        parse_mode="HTML"
                    )
    except Exception as e:
        logging.error(f"Exception registering bot: {e}")
        await message.answer(
            f"❌ Произошла ошибка: {str(e)}\n\n"
            f"Попробуйте еще раз или отправьте <code>/cancel</code> для отмены.",
            parse_mode="HTML"
        )
    
    await state.clear()


async def get_my_links_button(message: Message, state: FSMContext):
    """Обработчик кнопки для получения ссылок на Mini App"""
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    # Получаем функцию _cmd_mylink_impl через lazy import
    _cmd_mylink_impl = get_cmd_mylink_impl()
    await _cmd_mylink_impl(message)


async def connect_bot_button(message: Message, state: FSMContext):
    """Обработчик кнопки для подключения нового бота"""
    # Сбрасываем предыдущее состояние перед началом новой операции
    await clear_state_if_needed(message, state, ConnectBot.token)
    # Получаем функцию cmd_connect через lazy import
    cmd_connect = get_cmd_connect()
    await cmd_connect(message, state)


async def delete_bot_callback(callback: types.CallbackQuery):
    """Обработчик callback для удаления бота"""
    # Получаем API_URL через lazy import
    API_URL = get_api_url()
    
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
                        _cmd_mylink_impl = get_cmd_mylink_impl()
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

