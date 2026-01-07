import os
from sqlalchemy.orm import Session
from ..db import models

# Telegram Bot Token для отправки уведомлений (основной бот)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

# Получаем публичный URL из переменной окружения или используем ngrok по умолчанию
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev")


def get_bot_token_for_notifications(shop_owner_id: int, db: Session) -> str:
    """
    Получает токен бота для отправки уведомлений.
    Если у владельца магазина есть подключенный бот, использует его токен.
    Иначе использует токен основного бота.
    
    Args:
        shop_owner_id: ID владельца магазина
        db: Сессия базы данных
        
    Returns:
        Токен бота для отправки уведомлений
    """
    # Ищем подключенного бота для этого владельца магазина
    connected_bot = db.query(models.Bot).filter(
        models.Bot.owner_user_id == shop_owner_id,
        models.Bot.is_active == True
    ).first()
    
    if connected_bot and connected_bot.bot_token:
        print(f"✅ Using connected bot token for user {shop_owner_id} (bot_id={connected_bot.id})")
        return connected_bot.bot_token
    
    # Если подключенного бота нет, используем основной токен
    print(f"ℹ️ No connected bot found for user {shop_owner_id}, using main bot token")
    return TELEGRAM_BOT_TOKEN


def make_full_url(path: str) -> str:
    """
    Преобразует относительный путь в полный HTTPS URL.
    Использует /api/images/ вместо /static/uploads/ для обхода блокировки Telegram WebView.
    
    Args:
        path: Относительный или абсолютный путь к файлу
        
    Returns:
        Полный HTTPS URL
    """
    if not path:
        return ""
    
    # Если уже полный URL, проверяем, содержит ли он /static/uploads/
    if path.startswith('http://') or path.startswith('https://'):
        # Если это полный URL с /static/uploads/, заменяем на /api/images/
        if '/static/uploads/' in path:
            filename = path.split('/static/uploads/')[-1]
            return f"{API_PUBLIC_URL}/api/images/{filename}"
        return path
    
    # Если относительный путь начинается с /static/uploads/, заменяем на /api/images/
    if path.startswith('/static/uploads/'):
        filename = path.replace('/static/uploads/', '')
        return f"{API_PUBLIC_URL}/api/images/{filename}"
    
    # Если путь не начинается с /, добавляем его
    if not path.startswith('/'):
        return API_PUBLIC_URL + '/' + path
    
    return API_PUBLIC_URL + path


def str_to_bool(value: str) -> bool:
    """
    Конвертирует строку в boolean.
    
    Args:
        value: Строка для конвертации (может быть также bool)
        
    Returns:
        Boolean значение
    """
    if isinstance(value, bool):
        return value
    return value.lower() in ('true', '1', 'yes', 'on')

