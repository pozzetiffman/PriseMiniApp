"""
Обработчики для уведомлений
"""
import logging
from datetime import datetime
from aiogram import types
from aiogram.types import WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

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


async def send_reservation_notification(product_owner_id: int, product_id: int, reserved_by_user_id: int, reserved_until: str, product_name: str):
    """Отправляет уведомление владельцу магазина о резервации товара"""
    try:
        bot = get_bot()
        WEBAPP_URL = get_webapp_url()
        
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

