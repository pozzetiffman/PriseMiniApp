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
    import time
    
    start_time = time.time()
    
    # Сначала пытаемся валидировать с главным ботом (самый быстрый вариант)
    if default_bot_token:
        try:
            main_bot_start = time.time()
            validated_data = validate_telegram_init_data(init_data, default_bot_token)
            user_id = validated_data["user"]["id"]
            main_bot_time = time.time() - main_bot_start
            print(f"✅ [AUTH] Validated with main bot in {main_bot_time:.3f}s (total: {time.time() - start_time:.3f}s)")
            # Главный бот не имеет bot_id в БД (используем None)
            return (user_id, default_bot_token, None)
        except HTTPException as e:
            # Если не получилось, логируем причину и продолжаем поиск
            main_bot_time = time.time() - start_time
            print(f"⚠️ [AUTH] Main bot validation failed after {main_bot_time:.3f}s: {e.detail}")
            pass
        except Exception as e:
            # Логируем любые другие ошибки
            main_bot_time = time.time() - start_time
            print(f"❌ [AUTH] Main bot validation error after {main_bot_time:.3f}s: {str(e)}")
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
        
        print(f"🔍 [AUTH] Parsed user_id={user_id}, searching for bot...")
        
        # ОПТИМИЗАЦИЯ: Сначала пробуем бота владельца (если пользователь - владелец)
        # Это самый вероятный случай и не требует загрузки всех ботов
        owner_bot = db.query(models.Bot).filter(
            models.Bot.owner_user_id == user_id,
            models.Bot.is_active == True
        ).first()
        
        if owner_bot:
            try:
                validated_data = validate_telegram_init_data(init_data, owner_bot.bot_token)
                print(f"✅ [AUTH] Validated with owner bot (id={owner_bot.id}) in {time.time() - start_time:.3f}s")
                return (user_id, owner_bot.bot_token, owner_bot.id)
            except HTTPException:
                pass  # Продолжаем поиск
        
        # ОПТИМИЗАЦИЯ: Загружаем активные боты с умным ограничением
        # Сначала пробуем недавно использованные боты (если есть такая информация)
        # Затем пробуем все остальные активные боты, но с ограничением по времени
        print(f"🔍 [AUTH] Loading active bots from DB...")
        db_start = time.time()
        
        # Получаем общее количество активных ботов для информации
        total_bots_count = db.query(models.Bot).filter(
            models.Bot.is_active == True
        ).count()
        
        # Загружаем ботов порциями (батчами) для предотвращения зависаний
        # Начинаем с разумного лимита, но можем увеличить при необходимости
        BATCH_SIZE = 20  # Проверяем по 20 ботов за раз
        MAX_BOTS_TO_CHECK = 50  # Максимум ботов для проверки (защита от зависаний)
        
        print(f"🔍 [AUTH] Total active bots in DB: {total_bots_count}")
        
        # Загружаем первую порцию ботов
        all_bots = db.query(models.Bot).filter(
            models.Bot.is_active == True
        ).limit(BATCH_SIZE).all()
        
        db_time = time.time() - db_start
        print(f"⏱️ [AUTH] DB query took {db_time:.3f}s, loaded {len(all_bots)} bots (batch 1)")
        
        # Если запрос к БД занял больше 2 секунд, это проблема
        if db_time > 2.0:
            print(f"⚠️ [AUTH] WARNING: DB query took {db_time:.3f}s - database may be slow!")
        
        # Если запрос к БД занял больше 5 секунд, это критическая проблема
        if db_time > 5.0:
            print(f"❌ [AUTH] CRITICAL: DB query took {db_time:.3f}s - database is very slow!")
            raise HTTPException(
                status_code=504,
                detail="Database query timeout. Please try again."
            )
        
        # Пробуем все загруженные боты (кроме уже проверенного owner_bot)
        checked_count = 0
        for bot in all_bots:
            if owner_bot and bot.id == owner_bot.id:
                continue  # Уже пробовали
            
            checked_count += 1
            if checked_count > MAX_BOTS_TO_CHECK:
                print(f"⚠️ [AUTH] Reached max bots check limit ({MAX_BOTS_TO_CHECK}), stopping")
                break
            
            try:
                validated_data = validate_telegram_init_data(init_data, bot.bot_token)
                # Если валидация прошла, значит это правильный бот
                print(f"✅ [AUTH] Validated with bot (id={bot.id}) in {time.time() - start_time:.3f}s")
                return (user_id, bot.bot_token, bot.id)
            except HTTPException:
                continue  # Пробуем следующий бот
        
        # Если в первой порции не нашли, и ботов больше чем загрузили
        # Загружаем следующую порцию (если есть еще боты)
        if len(all_bots) == BATCH_SIZE and total_bots_count > BATCH_SIZE:
            print(f"🔍 [AUTH] First batch didn't match, loading next batch...")
            db_start = time.time()
            next_bots = db.query(models.Bot).filter(
                models.Bot.is_active == True
            ).offset(BATCH_SIZE).limit(BATCH_SIZE).all()
            db_time = time.time() - db_start
            print(f"⏱️ [AUTH] Loaded {len(next_bots)} more bots in {db_time:.3f}s")
            
            for bot in next_bots:
                if checked_count >= MAX_BOTS_TO_CHECK:
                    break
                checked_count += 1
                try:
                    validated_data = validate_telegram_init_data(init_data, bot.bot_token)
                    print(f"✅ [AUTH] Validated with bot (id={bot.id}) in {time.time() - start_time:.3f}s")
                    return (user_id, bot.bot_token, bot.id)
                except HTTPException:
                    continue
        
        # Если ни один бот не подошел, пробуем главный бот еще раз (на случай, если он не был указан)
        if default_bot_token:
            try:
                validated_data = validate_telegram_init_data(init_data, default_bot_token)
                print(f"✅ [AUTH] Validated with main bot (fallback) in {time.time() - start_time:.3f}s")
                return (user_id, default_bot_token, None)
            except HTTPException:
                pass
        
        total_time = time.time() - start_time
        print(f"❌ [AUTH] Failed to validate after {total_time:.3f}s")
        raise HTTPException(
            status_code=401,
            detail="Bot not found. Please register your bot first or use the main bot."
        )
        
    except Exception as e:
        total_time = time.time() - start_time
        print(f"❌ [AUTH] Exception after {total_time:.3f}s: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


