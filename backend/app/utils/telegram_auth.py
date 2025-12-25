"""
Утилиты для валидации Telegram WebApp initData
"""
import hmac
import hashlib
import json
from urllib.parse import parse_qs, unquote
from typing import Optional, Dict, Any
from fastapi import HTTPException


def validate_telegram_init_data(init_data: str, bot_token: str) -> Dict[str, Any]:
    """
    Валидирует Telegram WebApp initData и возвращает распарсенные данные.
    
    Args:
        init_data: Строка initData из Telegram.WebApp.initData
        bot_token: Токен Telegram бота
        
    Returns:
        Словарь с валидированными данными пользователя
        
    Raises:
        HTTPException: Если валидация не прошла
    """
    if not init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        # Парсим query string
        parsed = parse_qs(init_data)
        
        # Извлекаем hash и остальные данные
        received_hash = parsed.get('hash', [None])[0]
        if not received_hash:
            raise HTTPException(status_code=401, detail="Hash not found in initData")
        
        # Удаляем hash из данных для проверки
        data_check_string = []
        for key in sorted(parsed.keys()):
            if key != 'hash':
                value = parsed[key][0]
                data_check_string.append(f"{key}={value}")
        
        data_check_string = '\n'.join(data_check_string)
        
        # Вычисляем секретный ключ
        secret_key = hmac.new(
            key=b"WebAppData",
            msg=bot_token.encode(),
            digestmod=hashlib.sha256
        ).digest()
        
        # Вычисляем ожидаемый hash
        expected_hash = hmac.new(
            key=secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        
        # Сравниваем hash
        if received_hash != expected_hash:
            raise HTTPException(status_code=401, detail="Invalid Telegram initData signature")
        
        # Извлекаем данные пользователя
        user_str = parsed.get('user', [None])[0]
        if not user_str:
            raise HTTPException(status_code=401, detail="User data not found in initData")
        
        user_data = json.loads(unquote(user_str))
        
        # Проверяем, что есть user.id
        if 'id' not in user_data:
            raise HTTPException(status_code=401, detail="User ID not found in initData")
        
        return {
            "user": user_data,
            "auth_date": parsed.get('auth_date', [None])[0],
            "query_id": parsed.get('query_id', [None])[0],
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Invalid JSON in initData")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


def get_user_id_from_init_data(init_data: str, bot_token: str) -> int:
    """
    Извлекает user_id из валидированного initData.
    
    Args:
        init_data: Строка initData из Telegram.WebApp.initData
        bot_token: Токен Telegram бота
    
    Returns:
        user_id пользователя
        
    Raises:
        HTTPException: Если валидация не прошла
    """
    validated_data = validate_telegram_init_data(init_data, bot_token)
    return validated_data["user"]["id"]


async def validate_init_data_multi_bot(
    init_data: str,
    db,
    default_bot_token: Optional[str] = None
) -> tuple[int, Optional[str], Optional[int]]:
    """
    Валидирует initData с любым токеном бота.
    Сначала пытается валидировать с default_bot_token (главный бот),
    затем ищет бота в БД по user_id и валидирует с его токеном.
    
    Args:
        init_data: Строка initData из Telegram.WebApp.initData
        db: Сессия базы данных
        default_bot_token: Токен главного бота (опционально)
        
    Returns:
        tuple: (user_id, bot_token, bot_id) - ID пользователя, токен бота и ID бота в БД
        
    Raises:
        HTTPException: Если валидация не прошла
    """
    from ..db import models
    
    # Сначала пытаемся валидировать с главным ботом
    if default_bot_token:
        try:
            validated_data = validate_telegram_init_data(init_data, default_bot_token)
            user_id = validated_data["user"]["id"]
            # Главный бот не имеет bot_id в БД (используем None)
            return (user_id, default_bot_token, None)
        except HTTPException:
            # Если не получилось, продолжаем поиск
            pass
    
    # Парсим initData без валидации, чтобы получить user_id
    try:
        from urllib.parse import parse_qs, unquote
        import json
        
        parsed = parse_qs(init_data)
        user_str = parsed.get('user', [None])[0]
        if not user_str:
            raise HTTPException(status_code=401, detail="User data not found in initData")
        
        user_data = json.loads(unquote(user_str))
        user_id = user_data.get('id')
        
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in initData")
        
        # Пробуем валидировать со всеми зарегистрированными ботами
        # Это нужно, потому что клиент может открыть WebApp через любого бота
        all_bots = db.query(models.Bot).filter(
            models.Bot.is_active == True
        ).all()
        
        # Сначала пробуем бота владельца (если пользователь - владелец)
        owner_bot = db.query(models.Bot).filter(
            models.Bot.owner_user_id == user_id,
            models.Bot.is_active == True
        ).first()
        
        if owner_bot:
            try:
                validated_data = validate_telegram_init_data(init_data, owner_bot.bot_token)
                return (user_id, owner_bot.bot_token, owner_bot.id)
            except HTTPException:
                pass  # Продолжаем поиск
        
        # Пробуем все остальные боты
        for bot in all_bots:
            if owner_bot and bot.id == owner_bot.id:
                continue  # Уже пробовали
            try:
                validated_data = validate_telegram_init_data(init_data, bot.bot_token)
                # Если валидация прошла, значит это правильный бот
                return (user_id, bot.bot_token, bot.id)
            except HTTPException:
                continue  # Пробуем следующий бот
        
        # Если ни один бот не подошел, пробуем главный бот
        if default_bot_token:
            try:
                validated_data = validate_telegram_init_data(init_data, default_bot_token)
                return (user_id, default_bot_token, None)
            except HTTPException:
                pass
        
        raise HTTPException(
            status_code=401,
            detail="Bot not found. Please register your bot first or use the main bot."
        )
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


