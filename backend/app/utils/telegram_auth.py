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


