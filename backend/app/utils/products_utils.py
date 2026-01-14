import os
from typing import Optional
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


def normalize_category_id(category_id: Optional[int], target_bot_id: Optional[int], user_id: int, db: Session) -> Optional[int]:
    """
    Нормализует category_id для гарантии инварианта product.bot_id === category.bot_id.
    
    Гарантирует, что category_id (если указан) принадлежит целевому боту (target_bot_id).
    Если категория не принадлежит целевому боту, ищет категорию с тем же именем в целевом боте.
    
    Args:
        category_id: ID категории для нормализации (может быть None)
        target_bot_id: ID целевого бота (None для основного бота)
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Правильный category_id для целевого бота, или None если категория не найдена
    """
    # Если category_id не указан, возвращаем None
    if category_id is None:
        return None
    
    # Нормализуем типы: приводим к int
    category_id = int(category_id)
    if target_bot_id is not None:
        target_bot_id = int(target_bot_id)
    
    # Проверяем, что категория существует и принадлежит целевому боту
    category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == user_id
    ).first()
    
    if not category:
        # Категория не найдена - возвращаем None
        print(f"⚠️ WARNING: Category with id={category_id} not found for user_id={user_id}, returning None")
        return None
    
    # Проверяем соответствие bot_id
    if category.bot_id == target_bot_id:
        # Категория принадлежит целевому боту - всё правильно
        return category_id
    else:
        # Категория не принадлежит целевому боту - ищем категорию с тем же именем в целевом боте
        print(f"⚠️ WARNING: Category id={category_id} (bot_id={category.bot_id}) does not match target_bot_id={target_bot_id}, searching by name")
        
        matching_category = db.query(models.Category).filter(
            models.Category.user_id == user_id,
            models.Category.bot_id == target_bot_id,
            models.Category.name == category.name
        ).first()
        
        if matching_category:
            print(f"✅ Found matching category id={matching_category.id} (name='{category.name}') for target_bot_id={target_bot_id}")
            return matching_category.id
        else:
            # Категория с таким именем не найдена в целевом боте
            print(f"⚠️ WARNING: Category with name='{category.name}' not found in target_bot_id={target_bot_id}, returning None")
            return None

