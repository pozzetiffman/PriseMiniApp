"""
Обработчики команд бота
"""
import os
import logging
import aiohttp
from aiogram import types
from aiogram.types import Message, WebAppInfo, KeyboardButton, ReplyKeyboardMarkup
from aiogram.filters.command import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder

# Lazy imports для утилит
try:
    from ..utils import clear_state_if_needed, get_shop_settings, get_bot_deeplink, send_shop_message
except ImportError:
    from utils import clear_state_if_needed, get_shop_settings, get_bot_deeplink, send_shop_message

# Импорт состояний FSM
try:
    from ..states import ConnectBot
except ImportError:
    from states import ConnectBot


async def cmd_cancel(message: Message, state: FSMContext):
    """Отменить текущую операцию и очистить состояние FSM"""
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


async def cmd_start(message: Message, command: CommandObject, state: FSMContext):
    """Команда /start - открытие витрины"""
    # Lazy import для получения WEBAPP_URL из bot.py
    # bot.py всегда запускается как скрипт, поэтому используем __main__
    import __main__
    WEBAPP_URL = __main__.WEBAPP_URL
    
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


async def cmd_getlink(message: Message, command: CommandObject, state: FSMContext):
    """
    Получить Web App ссылку для бота.
    Если бот зарегистрирован - показывает ссылку автоматически.
    Если нет - можно указать токен и название Web App.
    Формат: /getlink [bot_token] [web_app_name]
    """
    # Lazy import для получения API_URL из bot.py
    # bot.py всегда запускается как скрипт, поэтому используем __main__
    import __main__
    API_URL = __main__.API_URL
    
    # Сбрасываем состояние FSM при использовании команды /getlink
    await clear_state_if_needed(message, state)
    
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
                            "❌ <b>Использование:</b>\n\n"
                            "<code>/getlink</code> - показать ссылки для всех зарегистрированных ботов\n"
                            "<code>/getlink &lt;bot_token&gt; &lt;web_app_name&gt;</code> - получить ссылку для нового бота\n\n"
                            "<b>Примеры:</b>\n"
                            "• <code>/getlink</code> (для зарегистрированных ботов)\n"
                            "• <code>/getlink 8026360824:AAEI9RAEODgwcKHmkJ0MAFkQPXkNzGcW46c shop1</code>",
                            parse_mode="HTML"
                        )
                    
                    bots = await resp.json()
                    
                    if not bots:
                        return await message.answer(
                            "🤖 <b>У вас нет подключенных ботов</b>\n\n"
                            "Используйте команду <code>/connect</code> для подключения бота.\n\n"
                            "Или используйте формат:\n"
                            "<code>/getlink &lt;bot_token&gt; &lt;web_app_name&gt;</code>",
                            parse_mode="HTML"
                        )
                    
                    # Формируем сообщение со ссылками
                    msg = "🔗 <b>Web App ссылки на ваши магазины:</b>\n\n"
                    
                    for bot in bots:
                        bot_username = bot.get("bot_username", "unknown")
                        is_active = bot.get("is_active", True)
                        web_app_name = bot.get("direct_link_name") or "shop"
                        
                        if is_active:
                            web_app_link = f"t.me/{bot_username}/{web_app_name}"
                            bot_username_escaped = bot_username.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                            web_app_name_escaped = web_app_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                            msg += f"🤖 <b>@{bot_username_escaped}</b>\n"
                            msg += f"🔗 <code>{web_app_link}</code>\n"
                            msg += f"📱 Web App: <code>{web_app_name_escaped}</code>\n\n"
                    
                    msg += "💡 <b>Как использовать:</b>\n"
                    msg += "• Скопируйте ссылку и поделитесь ею\n"
                    msg += "• Ссылка откроет Mini App <b>поверх чата</b> без перехода в бота\n"
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
            "❌ Не указано название Web App.\n\n"
            "<b>Формат:</b> <code>/getlink &lt;bot_token&gt; &lt;web_app_name&gt;</code>\n\n"
            "<b>Пример:</b> <code>/getlink 8026360824:AAEI9RAEODgwcKHmkJ0MAFkQPXkNzGcW46c shop1</code>\n\n"
            "💡 Или просто <code>/getlink</code> для зарегистрированных ботов.",
            parse_mode="HTML"
        )
    
    bot_token = parts[0]
    web_app_name = parts[1]
    
    # Проверяем формат токена
    if ':' not in bot_token:
        return await message.answer(
            "❌ Неверный формат токена.\n\n"
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
                        "❌ Ошибка при получении информации о боте.\n\n"
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
                        "❌ Бот не имеет username.\n\n"
                        "Убедитесь, что бот имеет username в @BotFather.",
                        parse_mode="HTML"
                    )
                
                # Формируем Web App ссылку
                web_app_link = f"t.me/{bot_username}/{web_app_name}"
                
                await message.answer(
                    f"✅ <b>Web App ссылка для бота:</b>\n\n"
                    f"🤖 Бот: <b>@{bot_username}</b>\n"
                    f"📱 Название Web App: <code>{web_app_name}</code>\n"
                    f"🔗 Ссылка: <code>{web_app_link}</code>\n\n"
                    f"💡 <b>Как использовать:</b>\n"
                    f"• Скопируйте ссылку и поделитесь ею\n"
                    f"• Ссылка откроет Mini App <b>поверх чата</b> без перехода в бота\n"
                    f"• Работает в группах и каналах\n\n"
                    f"⚠️ <b>Важно:</b> Убедитесь, что Web App с названием <code>{web_app_name}</code> создан через <code>/newapp</code> в @BotFather для этого бота.",
                    parse_mode="HTML"
                )
                
    except Exception as e:
        logging.error(f"Exception getting bot link: {e}")
        await message.answer(
            f"❌ Произошла ошибка: {str(e)}",
            parse_mode="HTML"
        )


async def cmd_connect(message: Message, state: FSMContext):
    """
    Подключить нового бота к системе.
    Пользователь создает бота в @BotFather и подключает его через эту команду.
    """
    # Сбрасываем предыдущее состояние перед началом новой операции
    await clear_state_if_needed(message, state, ConnectBot.token)
    
    user_id = message.from_user.id
    
    await message.answer(
        "🤖 <b>Подключение бота к системе</b>\n\n"
        "Чтобы подключить своего бота:\n\n"
        "1️⃣ Создайте бота в @BotFather:\n"
        "   • Откройте @BotFather\n"
        "   • Отправьте <code>/newbot</code>\n"
        "   • Следуйте инструкциям\n"
        "   • Скопируйте токен бота\n\n"
        "2️⃣ Отправьте токен бота сюда\n\n"
        "3️⃣ Укажите название Web App\n\n"
        "4️⃣ Создайте Web App в @BotFather:\n"
        "   • Откройте @BotFather\n"
        "   • Отправьте <code>/newapp</code>\n"
        "   • Выберите вашего бота\n"
        "   • Введите название Web App (то же, что в шаге 3)\n"
        "   • Введите описание\n"
        "   • Загрузите фото (640x360)\n"
        "   • URL: <code>https://webapp-eight-vert.vercel.app</code>\n\n"
        "💡 <b>Отправьте токен бота сейчас:</b>",
        parse_mode="HTML"
    )
    
    await state.set_state(ConnectBot.token)


async def cmd_post(message: Message, state: FSMContext):
    """Команда /post - публикация витрины в канал/группу"""
    # Lazy import для получения WEBAPP_URL и bot из bot.py
    # bot.py всегда запускается как скрипт, поэтому используем __main__
    import __main__
    WEBAPP_URL = __main__.WEBAPP_URL
    bot = __main__.bot
    
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
    
    msg = f"**{shop_name_display}**\n\n"
    if welcome_description:
        msg += f"{welcome_description}\n\n"
    
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
            msg += "💡 Нажмите кнопку, чтобы перейти в бота и открыть магазин!\n"
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
            text=button_text, 
            url=bot_link
        ))
        
        msg += "\n\n💡 Нажмите кнопку - откроется бот, и магазин запустится внутри Telegram!"
        
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


async def _cmd_mylink_impl(message: Message):
    """
    Внутренняя реализация команды /mylink (без state для использования из callback handlers)
    """
    # Lazy import для получения API_URL из bot.py
    # bot.py всегда запускается как скрипт, поэтому используем __main__
    import __main__
    API_URL = __main__.API_URL
    
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
                        f"❌ Ошибка при получении списка ботов.\n\n"
                        f"Убедитесь, что вы подключили бота через команду <code>/connect</code>.",
                        parse_mode="HTML"
                    )
                
                bots = await resp.json()
                
                if not bots:
                    return await message.answer(
                        "🤖 <b>У вас нет подключенных ботов</b>\n\n"
                        "Чтобы получить ссылку на Mini App:\n\n"
                        "1️⃣ Используйте команду <code>/connect</code> для подключения бота\n"
                        "2️⃣ Создайте Web App через <code>/newapp</code> в @BotFather\n"
                        "3️⃣ Затем используйте <code>/mylink</code> для получения ссылки",
                        parse_mode="HTML"
                    )
                
                # Формируем сообщение со ссылками с инлайн-кнопками для удаления
                # Используем HTML для более надежного форматирования
                msg = "🔗 <b>Web App ссылки на ваши магазины:</b>\n\n"
                
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
                        msg += f"🤖 <b>@{bot_username_escaped}</b>\n"
                        msg += f"🔗 Ссылка: <code>{web_app_link}</code>\n"
                        msg += f"📱 Web App: <code>{web_app_name_escaped}</code>\n\n"
                        
                        # Добавляем кнопку удаления для каждого бота
                        builder.button(
                            text=f"🗑️ Удалить @{bot_username_escaped}",
                            callback_data=f"delete_bot_{bot_id}"
                        )
                    else:
                        bot_username_escaped = bot_username.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        msg += f"🤖 <b>@{bot_username_escaped}</b> (неактивен)\n\n"
                
                builder.adjust(1)  # По одной кнопке в ряд
                
                msg += "💡 <b>Как использовать:</b>\n"
                msg += "• Скопируйте ссылку и поделитесь ею\n"
                msg += "• Ссылка откроет ваш магазин <b>поверх чата</b> без перехода в бота\n"
                msg += "• Работает в личных чатах, группах и каналах\n"
                msg += "• Web App создается через <code>/newapp</code> в @BotFather"
                
                await message.answer(msg, parse_mode="HTML", reply_markup=builder.as_markup())
                
    except Exception as e:
        logging.error(f"Exception getting bot links: {e}")
        await message.answer(
            f"❌ Произошла ошибка: {str(e)}\n\n"
            f"Попробуйте позже или обратитесь в поддержку."
        )


async def cmd_mylink(message: Message, state: FSMContext):
    """Команда /mylink - показать ссылки на подключенные боты"""
    # Сбрасываем состояние FSM при использовании команды /mylink
    await clear_state_if_needed(message, state)
    
    # Используем локальную реализацию
    await _cmd_mylink_impl(message)


async def _cmd_manage_impl(message: Message):
    """
    Внутренняя реализация команды /manage (без state для использования из callback handlers)
    """
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


async def cmd_manage(message: Message, state: FSMContext):
    """Команда /manage - показать меню управления витриной"""
    # Сбрасываем состояние FSM при использовании команды /manage
    await clear_state_if_needed(message, state)
    
    # Используем локальную реализацию
    await _cmd_manage_impl(message)

