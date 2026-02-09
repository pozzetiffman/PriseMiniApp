"""
Роутер для получения контекста магазина и ролей пользователя
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Body
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from dotenv import load_dotenv
from ..db import database
from ..utils.telegram_auth import validate_telegram_init_data, validate_init_data_multi_bot
from ..utils.logging_config import get_logger

load_dotenv()

log = get_logger(__name__)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api", tags=["context"])


# Pydantic модели для POST запросов
class WebAppContextCreate(BaseModel):
    viewer_id: int
    shop_owner_id: int
    chat_id: Optional[int] = None


async def get_validated_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Dependency для валидации Telegram initData и извлечения user_id.
    Поддерживает множественные боты - валидирует с главным ботом или с любым зарегистрированным ботом.
    """
    import time
    import asyncio
    
    validation_start = time.time()
    
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram initData is required. Open the app through Telegram bot."
        )
    
    try:
        try:
            user_id, bot_token, bot_id = await asyncio.wait_for(
                validate_init_data_multi_bot(
                    x_telegram_init_data,
                    db,
                    default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
                ),
                timeout=8.0
            )
            from ..utils.telegram_auth import request_id_ctx
            log.debug("[AUTH] Validated initData request_id=%s user_id=%s bot_id=%s", request_id_ctx.get(), user_id, bot_id)
            return user_id
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Validation timeout. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        validation_time = time.time() - validation_start
        import traceback
        log.error("[AUTH DEPENDENCY] Error after %.3fs: %s\n%s", validation_time, str(e), traceback.format_exc())
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


async def get_validated_user_and_bot(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
) -> tuple[int, Optional[int]]:
    """
    Dependency для валидации Telegram initData и извлечения user_id и bot_id.
    Возвращает tuple (user_id, bot_id) для использования в endpoints, которым нужен bot_id.
    """
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram initData is required. Open the app through Telegram bot."
        )
    
    try:
        user_id, bot_token, bot_id = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        return (user_id, bot_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


@router.post("/context")
async def set_context(
    context_data: WebAppContextCreate,
    db: Session = Depends(database.get_db)
):
    """
    Сохранить контекст для WebApp.
    Вызывается ботом после обработки callback кнопки.
    
    Args:
        context_data: Данные контекста (viewer_id, shop_owner_id, chat_id)
        db: Сессия базы данных
        
    Returns:
        Сохраненный контекст
    """
    from ..db import models
    
    log.debug("POST /api/context viewer_id=%s shop_owner_id=%s", context_data.viewer_id, context_data.shop_owner_id)
    
    # Проверяем, что магазин существует
    has_products = db.query(models.Product).filter(
        models.Product.user_id == context_data.shop_owner_id
    ).first()
    has_categories = db.query(models.Category).filter(
        models.Category.user_id == context_data.shop_owner_id
    ).first()
    
    if not has_products and not has_categories:
        log.debug("Shop not found shop_owner_id=%s", context_data.shop_owner_id)
        raise HTTPException(
            status_code=404,
            detail="Shop not found"
        )
    
    # UPSERT: обновить существующий контекст или создать новый
    existing_context = db.query(models.WebAppContext).filter(
        models.WebAppContext.viewer_id == context_data.viewer_id
    ).first()
    
    if existing_context:
        # Обновляем существующий контекст
        existing_context.shop_owner_id = context_data.shop_owner_id
        existing_context.chat_id = context_data.chat_id
        existing_context.created_at = datetime.utcnow()
        log.debug("Updated existing context viewer_id=%s", context_data.viewer_id)
    else:
        # Создаем новый контекст
        new_context = models.WebAppContext(
            viewer_id=context_data.viewer_id,
            shop_owner_id=context_data.shop_owner_id,
            chat_id=context_data.chat_id,
            created_at=datetime.utcnow()
        )
        db.add(new_context)
        log.debug("Created new context viewer_id=%s", context_data.viewer_id)
    
    db.commit()
    
    return {
        "viewer_id": context_data.viewer_id,
        "shop_owner_id": context_data.shop_owner_id,
        "chat_id": context_data.chat_id
    }


@router.options("/context")
async def options_context():
    """Обработка preflight запросов для CORS"""
    log.debug("[CONTEXT] OPTIONS /api/context CORS preflight")
    return {"status": "ok"}

@router.get("/context")
async def get_context(
    viewer_id: int = Depends(get_validated_user),
    shop_owner_id: Optional[int] = Query(None, description="ID владельца магазина (если смотрим чужой магазин)"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить контекст магазина и роли пользователя.
    
    Приоритет:
    1. shop_owner_id из query параметра (для обратной совместимости с URL)
    2. shop_owner_id из сохраненного контекста (для callback кнопок)
    3. Если открыт через нового бота (bot_id != None) - магазин владельца бота
    4. viewer_id (свой магазин)
    
    Args:
        viewer_id: ID текущего пользователя (из валидированного Telegram initData)
        shop_owner_id: ID владельца магазина (опционально, если не указан - свой магазин)
        x_telegram_init_data: initData для определения bot_id
        db: Сессия базы данных
        
    Returns:
        Контекст с viewer_id, shop_owner_id, role и permissions
    """
    from ..db import models
    import time
    
    request_start = time.time()
    log.debug("[CONTEXT] GET /api/context viewer_id=%s shop_owner_id=%s", viewer_id, shop_owner_id)
    
    # Инициализируем context_bot_id заранее для использования в fallback логике
    context_bot_id = None
    
    # Получаем bot_id из initData
    bot_id = None
    bot_owner_user_id = None
    if x_telegram_init_data:
        try:
            bot_start = time.time()
            _, bot_id = await get_validated_user_and_bot(x_telegram_init_data, db)
            bot_time = time.time() - bot_start
            log.debug("[CONTEXT] Bot validation took %.3fs", bot_time)
            
            if bot_id:
                # Получаем владельца бота
                db_start = time.time()
                bot = db.query(models.Bot).filter(models.Bot.id == bot_id).first()
                db_time = time.time() - db_start
                log.debug("[CONTEXT] Bot query took %.3fs", db_time)
                
                if bot:
                    bot_owner_user_id = bot.owner_user_id
                    log.debug("Bot %s owner: %s, viewer: %s", bot_id, bot_owner_user_id, viewer_id)
        except Exception as e:
            log.warning("[CONTEXT] Error getting bot info: %s", str(e))
            pass
    
    # Приоритет 1: shop_owner_id из URL параметра (обратная совместимость)
    if shop_owner_id is not None:
        # Проверяем, что shop_owner_id существует
        db_start = time.time()
        has_products = db.query(models.Product).filter(
            models.Product.user_id == shop_owner_id
        ).first()
        has_categories = db.query(models.Category).filter(
            models.Category.user_id == shop_owner_id
        ).first()
        db_time = time.time() - db_start
        log.debug("[CONTEXT] Shop check query took %.3fs", db_time)
        
        log.debug("Checking shop from URL has_products=%s has_categories=%s", bool(has_products), bool(has_categories))
        
        if not has_products and not has_categories:
            log.debug("Shop not found shop_owner_id=%s", shop_owner_id)
            raise HTTPException(
                status_code=404,
                detail="Shop not found"
            )
        
        role = "client" if shop_owner_id != viewer_id else "owner"
        log.debug("Using shop from URL shop_owner_id=%s role=%s", shop_owner_id, role)
    else:
        # Приоритет 2: Искать сохраненный контекст (для callback кнопок)
        # Контекст живет 1 час (3600 секунд)
        db_start = time.time()
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        saved_context = db.query(models.WebAppContext).filter(
            models.WebAppContext.viewer_id == viewer_id,
            models.WebAppContext.created_at > one_hour_ago
        ).first()
        db_time = time.time() - db_start
        log.debug("[CONTEXT] Saved context query took %.3fs", db_time)
        
        if saved_context:
            shop_owner_id = saved_context.shop_owner_id
            
            # Проверяем, что магазин все еще существует
            has_products = db.query(models.Product).filter(
                models.Product.user_id == shop_owner_id
            ).first()
            has_categories = db.query(models.Category).filter(
                models.Category.user_id == shop_owner_id
            ).first()
            
            if has_products or has_categories:
                # Удаляем использованный контекст (одноразовый)
                db.delete(saved_context)
                db.commit()
                
                role = "client" if shop_owner_id != viewer_id else "owner"
                log.debug("Using saved context shop_owner_id=%s role=%s", shop_owner_id, role)
            else:
                # Магазин не найден, удаляем контекст и показываем свой магазин
                db.delete(saved_context)
                db.commit()
                shop_owner_id = viewer_id
                role = "owner"
                log.debug("Saved context shop not found, using own shop shop_owner_id=%s", shop_owner_id)
        else:
            # Приоритет 3: Если открыт через нового бота - магазин владельца бота
            if bot_id and bot_owner_user_id:
                # Если пользователь является владельцем бота - показываем его магазин для этого бота
                if viewer_id == bot_owner_user_id:
                    shop_owner_id = viewer_id
                    role = "owner"
                    # Проверяем, что магазин для этого бота существует (с учетом bot_id)
                    has_products = db.query(models.Product).filter(
                        models.Product.user_id == shop_owner_id,
                        models.Product.bot_id == bot_id
                    ).first()
                    has_categories = db.query(models.Category).filter(
                        models.Category.user_id == shop_owner_id,
                        models.Category.bot_id == bot_id
                    ).first()
                    
                    if not has_products and not has_categories:
                        # Магазин для этого бота не найден, проверяем основной магазин
                        has_main_products = db.query(models.Product).filter(
                            models.Product.user_id == shop_owner_id,
                            models.Product.bot_id == None
                        ).first()
                        has_main_categories = db.query(models.Category).filter(
                            models.Category.user_id == shop_owner_id,
                            models.Category.bot_id == None
                        ).first()
                        
                        if has_main_products or has_main_categories:
                            # Есть основной магазин, но нет магазина для этого бота
                            # Это нормально - новый бот может не иметь товаров еще
                            log.debug("Bot owner opened shop shop_owner_id=%s bot_id=%s (empty)", shop_owner_id, bot_id)
                        else:
                            log.debug("Bot owner opened shop shop_owner_id=%s bot_id=%s (shop empty)", shop_owner_id, bot_id)
                    else:
                        log.debug("Bot owner opened shop shop_owner_id=%s bot_id=%s", shop_owner_id, bot_id)
                else:
                    # Если пользователь НЕ является владельцем бота - показываем магазин владельца бота
                    shop_owner_id = bot_owner_user_id
                    # Проверяем, что магазин владельца бота для этого бота существует (с учетом bot_id)
                    has_products = db.query(models.Product).filter(
                        models.Product.user_id == shop_owner_id,
                        models.Product.bot_id == bot_id
                    ).first()
                    has_categories = db.query(models.Category).filter(
                        models.Category.user_id == shop_owner_id,
                        models.Category.bot_id == bot_id
                    ).first()
                    
                    if not has_products and not has_categories:
                        # Магазин владельца бота для этого бота не найден
                        # ИСПРАВЛЕНИЕ: Проверяем товары из главного бота владельца (fallback)
                        db_start = time.time()
                        has_main_products = db.query(models.Product).filter(
                            models.Product.user_id == shop_owner_id,
                            models.Product.bot_id == None
                        ).first()
                        has_main_categories = db.query(models.Category).filter(
                            models.Category.user_id == shop_owner_id,
                            models.Category.bot_id == None
                        ).first()
                        db_time = time.time() - db_start
                        log.debug("[CONTEXT] Main bot check took %.3fs", db_time)
                        
                        if has_main_products or has_main_categories:
                            # Есть товары в главном боте - используем их
                            shop_owner_id = bot_owner_user_id
                            role = "client"
                            context_bot_id = None  # Используем главный бот вместо клиентского
                            log.debug("Client opened bot owner shop fallback main bot shop_owner_id=%s", shop_owner_id)
                        else:
                            # Нет товаров ни в клиентском, ни в главном боте - показываем свой магазин
                            shop_owner_id = viewer_id
                            role = "owner"
                            log.warning("Bot owner shop not found bot_id=%s using own shop shop_owner_id=%s", bot_id, shop_owner_id)
                    else:
                        role = "client"
                        log.debug("Client opened bot owner shop shop_owner_id=%s bot_id=%s", shop_owner_id, bot_id)
            else:
                # Приоритет 4: Свой магазин (fallback для главного бота)
                shop_owner_id = viewer_id
                role = "owner"
                
                # ОПТИМИЗАЦИЯ: Если bot_id=None (главный бот), используем context_bot_id=None
                # Если bot_id указан, но пользователь - владелец, используем bot_id его бота
                if bot_id is None:
                    context_bot_id = None
                    log.debug("No saved context using own shop main bot shop_owner_id=%s", shop_owner_id)
                elif bot_id and bot_owner_user_id and viewer_id == bot_owner_user_id:
                    context_bot_id = bot_id
                    log.debug("No saved context using own shop client bot shop_owner_id=%s bot_id=%s", shop_owner_id, bot_id)
                else:
                    context_bot_id = None
                    log.debug("No saved context using own shop shop_owner_id=%s", shop_owner_id)
    
    # Определяем права доступа
    permissions = {
        "can_create_products": role == "owner",
        "can_reserve": role == "client",
        "can_cancel_reservation": True,  # Может отменить свою резервацию или резервацию на своем товаре
        "can_view_products": True,
        "can_view_categories": True
    }
    
    # Определяем bot_id для использования в запросах товаров и категорий
    # ИСПРАВЛЕНИЕ: context_bot_id уже инициализирован выше, может быть установлен при fallback
    if bot_id and bot_owner_user_id:
        if viewer_id == bot_owner_user_id:
            # Владелец бота открывает свой магазин - используем bot_id его бота
            context_bot_id = bot_id
            log.debug("Context bot_id set to %s (bot owner shop)", context_bot_id)
        elif shop_owner_id == bot_owner_user_id:
            # Клиент открывает магазин владельца бота
            # Если context_bot_id уже установлен (fallback на главный бот), не перезаписываем
            if context_bot_id is None:
                context_bot_id = bot_id
                log.debug("Context bot_id set to %s (client viewing bot owner)", context_bot_id)
            else:
                log.debug("Context bot_id already set to %s (fallback main bot)", context_bot_id)
        else:
            log.warning("Context bot_id not set bot_id=%s bot_owner=%s viewer=%s shop_owner=%s", bot_id, bot_owner_user_id, viewer_id, shop_owner_id)
    else:
        log.debug("Context bot_id not set bot_id=%s bot_owner_user_id=%s", bot_id, bot_owner_user_id)
    
    total_time = time.time() - request_start
    log.debug("[CONTEXT] Returning context viewer_id=%s shop_owner_id=%s role=%s bot_id=%s", viewer_id, shop_owner_id, role, context_bot_id)
    log.debug("[CONTEXT] Total request time: %.3fs", total_time)
    if total_time > 3.0:
        log.warning("[CONTEXT] Slow request: %.3fs", total_time)
    
    return {
        "viewer_id": viewer_id,
        "shop_owner_id": shop_owner_id,
        "role": role,
        "permissions": permissions,
        "bot_id": context_bot_id  # Добавляем bot_id в контекст
    }

