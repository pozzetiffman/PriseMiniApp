"""
Обработчики для управления каналами
"""
import logging
import aiohttp
from aiogram import types
from aiogram.types import Message, WebAppInfo
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder

# Lazy imports для утилит
try:
    from ..utils import clear_state_if_needed, get_shop_settings, get_bot_deeplink
except ImportError:
    from utils import clear_state_if_needed, get_shop_settings, get_bot_deeplink

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

# Lazy import для получения WEBAPP_URL из bot.py
def get_webapp_url():
    """Получить WEBAPP_URL из bot.py"""
    try:
        import __main__
        return __main__.WEBAPP_URL
    except:
        return None


async def share_store(message: Message, state: FSMContext):
    """Показать список каналов для отправки витрины"""
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    
    user_id = message.from_user.id
    API_URL = get_api_url()
    
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


async def manage_channels(message: Message, state: FSMContext = None):
    """Управление каналами - показать список каналов и кнопки для удаления"""
    # Сбрасываем состояние FSM при использовании этой кнопки (если state передан)
    if state is not None:
        await clear_state_if_needed(message, state)
    
    user_id = message.from_user.id
    API_URL = get_api_url()
    
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


async def add_channel_by_username(message: Message):
    """Добавление канала по username"""
    username = message.text.strip("@").lower()
    user_id = message.from_user.id
    
    bot = get_bot()
    API_URL = get_api_url()
    
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


async def add_channel_by_forward(message: Message):
    """Добавление канала через пересылку сообщения"""
    user_id = message.from_user.id
    forwarded_chat = message.forward_from_chat
    
    if not forwarded_chat:
        return
    
    API_URL = get_api_url()
    
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


async def send_store_to_channel(callback: types.CallbackQuery):
    """Отправка витрины в канал"""
    channel_id = int(callback.data.split("_")[1])
    user_id = callback.from_user.id
    
    bot = get_bot()
    API_URL = get_api_url()
    WEBAPP_URL = get_webapp_url()
    
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


async def delete_channel(callback: types.CallbackQuery):
    """Удаление канала"""
    channel_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    
    API_URL = get_api_url()
    
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

