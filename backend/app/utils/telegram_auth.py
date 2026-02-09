"""
Утилиты для валидации Telegram WebApp initData.
Кэширование: initDataHash -> (user_id, bot_token, bot_id) на 5 мин; список ботов на 60 сек.
"""
import hmac
import hashlib
import json
import os
import time
import logging
from contextvars import ContextVar
from urllib.parse import parse_qs, unquote
from typing import Optional, Dict, Any, List, Tuple
from fastapi import HTTPException

log = logging.getLogger(__name__)
DEBUG = os.getenv("DEBUG", "0") == "1"
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="?")

# Кэш: hash(init_data) -> (user_id, bot_token, bot_id, expires_at)
_auth_cache: Dict[str, Tuple[int, str, Optional[int], float]] = {}
_AUTH_CACHE_TTL = 300  # 5 минут

# Кэш: список активных ботов (list of (id, bot_token))
_active_bots_cache: Optional[List[tuple]] = None
_active_bots_cache_time: float = 0
_ACTIVE_BOTS_TTL = 60  # 60 секунд


def _get_init_data_hash(init_data: str) -> str:
    return hashlib.sha256(init_data.encode()).hexdigest()


def _get_cached_auth(init_data: str) -> Optional[Tuple[int, str, Optional[int]]]:
    h = _get_init_data_hash(init_data)
    if h not in _auth_cache:
        return None
    user_id, bot_token, bot_id, expires = _auth_cache[h]
    if time.time() > expires:
        del _auth_cache[h]
        return None
    return (user_id, bot_token, bot_id)


def _set_cached_auth(init_data: str, user_id: int, bot_token: str, bot_id: Optional[int]) -> None:
    h = _get_init_data_hash(init_data)
    _auth_cache[h] = (user_id, bot_token, bot_id, time.time() + _AUTH_CACHE_TTL)


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
    Кэш: initDataHash -> (user_id, bot_token, bot_id) на 5 мин.
    Кэш списка активных ботов на 60 сек.
    """
    from ..db import models

    start_time = time.time()
    request_id = request_id_ctx.get()

    # 1. Проверка кэша — без DB lookup
    cached = _get_cached_auth(init_data)
    if cached:
        user_id, bot_token, bot_id = cached
        if DEBUG:
            log.debug("[AUTH] Cache hit request_id=%s user_id=%s bot_id=%s", request_id, user_id, bot_id)
        return cached

    # 2. Валидация с главным ботом (самый быстрый путь)
    if default_bot_token:
        try:
            validated_data = validate_telegram_init_data(init_data, default_bot_token)
            user_id = validated_data["user"]["id"]
            result = (user_id, default_bot_token, None)
            _set_cached_auth(init_data, *result)
            if DEBUG:
                log.debug("[AUTH] Main bot OK request_id=%s user_id=%s", request_id, user_id)
            return result
        except HTTPException as e:
            if DEBUG:
                log.warning("[AUTH] Main bot failed: %s", e.detail)
            pass
        except Exception as e:
            if DEBUG:
                log.error("[AUTH] Main bot error: %s", str(e))
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
        
        # 3. Кэш списка активных ботов (TTL 60 сек)
        global _active_bots_cache, _active_bots_cache_time
        now = time.time()
        if _active_bots_cache is None or (now - _active_bots_cache_time) > _ACTIVE_BOTS_TTL:
            _active_bots_cache = [
                (b.id, b.bot_token, b.owner_user_id)
                for b in db.query(models.Bot).filter(models.Bot.is_active == True).all()
            ]
            _active_bots_cache_time = now
            if DEBUG:
                print(f"🔍 [AUTH] Loaded {len(_active_bots_cache)} active bots (cache refresh)")

        # 4. Сначала пробуем бота владельца
        owner_bot_entry = next((b for b in _active_bots_cache if b[2] == user_id), None)
        if owner_bot_entry:
            bot_id_val, bot_token_val, _ = owner_bot_entry
            try:
                validate_telegram_init_data(init_data, bot_token_val)
                result = (user_id, bot_token_val, bot_id_val)
                _set_cached_auth(init_data, *result)
                if DEBUG:
                    log.debug("[AUTH] Owner bot OK request_id=%s user_id=%s bot_id=%s", request_id, user_id, bot_id_val)
                return result
            except HTTPException:
                pass

        # 5. Перебираем все активные боты из кэша
        owner_bot_id = owner_bot_entry[0] if owner_bot_entry else None
        for bot_id_val, bot_token_val, _ in _active_bots_cache:
            if owner_bot_id is not None and bot_id_val == owner_bot_id:
                continue
            try:
                validate_telegram_init_data(init_data, bot_token_val)
                result = (user_id, bot_token_val, bot_id_val)
                _set_cached_auth(init_data, *result)
                if DEBUG:
                    print(f"✅ [AUTH] Multi-bot OK request_id={request_id} user_id={user_id} bot_id={bot_id_val}")
                return result
            except HTTPException:
                continue

        # 6. Fallback главный бот
        if default_bot_token:
            try:
                validate_telegram_init_data(init_data, default_bot_token)
                result = (user_id, default_bot_token, None)
                _set_cached_auth(init_data, *result)
                return result
            except HTTPException:
                pass

        if DEBUG:
            log.warning("[AUTH] Failed validate request_id=%s", request_id)
        raise HTTPException(
            status_code=401,
            detail="Bot not found. Please register your bot first or use the main bot."
        )
        
    except Exception as e:
        total_time = time.time() - start_time
        log.error("[AUTH] Exception after %.3fs: %s", total_time, str(e), exc_info=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


