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

load_dotenv()

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
    print(f"🔐 [AUTH DEPENDENCY] Starting validation...")
    
    # КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Логируем, что зависимость вызвана
    print(f"🔐 [AUTH DEPENDENCY] Dependency called at {time.time():.3f}")
    
    if not x_telegram_init_data:
        print(f"❌ [AUTH DEPENDENCY] No initData provided")
        raise HTTPException(
            status_code=401,
            detail="Telegram initData is required. Open the app through Telegram bot."
        )
    
    print(f"🔐 [AUTH DEPENDENCY] InitData received, length: {len(x_telegram_init_data)}")
    
    try:
        # Добавляем таймаут для валидации (максимум 8 секунд)
        try:
            # КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Логируем перед вызовом validate_init_data_multi_bot
            print(f"🔐 [AUTH DEPENDENCY] About to call validate_init_data_multi_bot, elapsed: {time.time() - validation_start:.3f}s")
            
            user_id, bot_token, bot_id = await asyncio.wait_for(
                validate_init_data_multi_bot(
                    x_telegram_init_data,
                    db,
                    default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
                ),
                timeout=8.0
            )
            validation_time = time.time() - validation_start
            print(f"✅ [AUTH DEPENDENCY] Validated in {validation_time:.3f}s - user_id={user_id}, bot_token={'***' + bot_token[-10:] if bot_token else 'None'}, bot_id={bot_id}")
            return user_id
        except asyncio.TimeoutError:
            validation_time = time.time() - validation_start
            print(f"❌ [AUTH DEPENDENCY] Validation timeout after {validation_time:.3f}s")
            raise HTTPException(
                status_code=504,
                detail="Validation timeout. Please try again."
            )
    except HTTPException:
        raise
    except Exception as e:
        validation_time = time.time() - validation_start
        print(f"❌ [AUTH DEPENDENCY] Error after {validation_time:.3f}s: {str(e)}")
        import traceback
        print(f"❌ [AUTH DEPENDENCY] Traceback: {traceback.format_exc()}")
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
        print(f"✅ Validated initData - user_id={user_id}, bot_id={bot_id}")
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
    
    print(f"💾 POST /api/context - viewer_id={context_data.viewer_id}, shop_owner_id={context_data.shop_owner_id}")
    
    # Проверяем, что магазин существует
    has_products = db.query(models.Product).filter(
        models.Product.user_id == context_data.shop_owner_id
    ).first()
    has_categories = db.query(models.Category).filter(
        models.Category.user_id == context_data.shop_owner_id
    ).first()
    
    if not has_products and not has_categories:
        print(f"❌ Shop not found - shop_owner_id={context_data.shop_owner_id}")
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
        print(f"🔄 Updated existing context for viewer_id={context_data.viewer_id}")
    else:
        # Создаем новый контекст
        new_context = models.WebAppContext(
            viewer_id=context_data.viewer_id,
            shop_owner_id=context_data.shop_owner_id,
            chat_id=context_data.chat_id,
            created_at=datetime.utcnow()
        )
        db.add(new_context)
        print(f"✅ Created new context for viewer_id={context_data.viewer_id}")
    
    db.commit()
    
    return {
        "viewer_id": context_data.viewer_id,
        "shop_owner_id": context_data.shop_owner_id,
        "chat_id": context_data.chat_id
    }


@router.options("/context")
async def options_context():
    """Обработка preflight запросов для CORS"""
    print(f"✅ [CONTEXT] OPTIONS /api/context - CORS preflight")
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
    print(f"📡 [CONTEXT] GET /api/context - viewer_id={viewer_id}, shop_owner_id={shop_owner_id}")
    
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
            print(f"⏱️ [CONTEXT] Bot validation took {bot_time:.3f}s")
            
            if bot_id:
                # Получаем владельца бота
                db_start = time.time()
                bot = db.query(models.Bot).filter(models.Bot.id == bot_id).first()
                db_time = time.time() - db_start
                print(f"⏱️ [CONTEXT] Bot query took {db_time:.3f}s")
                
                if bot:
                    bot_owner_user_id = bot.owner_user_id
                    print(f"🤖 Bot {bot_id} owner: {bot_owner_user_id}, viewer: {viewer_id}")
        except Exception as e:
            print(f"⚠️ [CONTEXT] Error getting bot info: {str(e)}")
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
        print(f"⏱️ [CONTEXT] Shop check query took {db_time:.3f}s")
        
        print(f"🔍 Checking shop from URL - has_products={bool(has_products)}, has_categories={bool(has_categories)}")
        
        if not has_products and not has_categories:
            print(f"❌ Shop not found - shop_owner_id={shop_owner_id}")
            raise HTTPException(
                status_code=404,
                detail="Shop not found"
            )
        
        role = "client" if shop_owner_id != viewer_id else "owner"
        print(f"✅ Using shop from URL - shop_owner_id={shop_owner_id}, role={role}")
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
        print(f"⏱️ [CONTEXT] Saved context query took {db_time:.3f}s")
        
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
                print(f"✅ Using saved context - shop_owner_id={shop_owner_id}, role={role}")
            else:
                # Магазин не найден, удаляем контекст и показываем свой магазин
                db.delete(saved_context)
                db.commit()
                shop_owner_id = viewer_id
                role = "owner"
                print(f"⚠️ Saved context shop not found, using own shop - shop_owner_id={shop_owner_id}")
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
                            print(f"✅ Bot owner opened their shop - shop_owner_id={shop_owner_id}, bot_id={bot_id}, role={role} (bot shop is empty, will show empty shop)")
                        else:
                            print(f"✅ Bot owner opened their shop - shop_owner_id={shop_owner_id}, bot_id={bot_id}, role={role} (shop is empty)")
                    else:
                        print(f"✅ Bot owner opened their shop - shop_owner_id={shop_owner_id}, bot_id={bot_id}, role={role} (bot shop has data)")
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
                        print(f"⏱️ [CONTEXT] Main bot check query took {db_time:.3f}s")
                        
                        if has_main_products or has_main_categories:
                            # Есть товары в главном боте - используем их
                            shop_owner_id = bot_owner_user_id
                            role = "client"
                            context_bot_id = None  # Используем главный бот вместо клиентского
                            print(f"✅ Client opened bot owner's shop (fallback to main bot) - shop_owner_id={shop_owner_id}, bot_id=None, role={role}")
                        else:
                            # Нет товаров ни в клиентском, ни в главном боте - показываем свой магазин
                            shop_owner_id = viewer_id
                            role = "owner"
                            print(f"⚠️ Bot owner's shop not found (neither bot {bot_id} nor main bot), using own shop - shop_owner_id={shop_owner_id}, role={role}")
                    else:
                        role = "client"
                        print(f"✅ Client opened bot owner's shop - shop_owner_id={shop_owner_id}, bot_id={bot_id}, role={role}")
            else:
                # Приоритет 4: Свой магазин (fallback для главного бота)
                shop_owner_id = viewer_id
                role = "owner"
                
                # ОПТИМИЗАЦИЯ: Если bot_id=None (главный бот), используем context_bot_id=None
                # Если bot_id указан, но пользователь - владелец, используем bot_id его бота
                if bot_id is None:
                    context_bot_id = None
                    print(f"✅ No saved context, using own shop (main bot) - shop_owner_id={shop_owner_id}, role={role}, bot_id=None")
                elif bot_id and bot_owner_user_id and viewer_id == bot_owner_user_id:
                    context_bot_id = bot_id
                    print(f"✅ No saved context, using own shop (client bot {bot_id}) - shop_owner_id={shop_owner_id}, role={role}, bot_id={bot_id}")
                else:
                    context_bot_id = None
                    print(f"✅ No saved context, using own shop - shop_owner_id={shop_owner_id}, role={role}")
    
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
            print(f"✅ Context bot_id set to {context_bot_id} (bot owner's shop)")
        elif shop_owner_id == bot_owner_user_id:
            # Клиент открывает магазин владельца бота
            # Если context_bot_id уже установлен (fallback на главный бот), не перезаписываем
            if context_bot_id is None:
                context_bot_id = bot_id
                print(f"✅ Context bot_id set to {context_bot_id} (client viewing bot owner's shop)")
            else:
                print(f"✅ Context bot_id already set to {context_bot_id} (fallback to main bot)")
        else:
            print(f"⚠️ Context bot_id not set: bot_id={bot_id}, bot_owner={bot_owner_user_id}, viewer={viewer_id}, shop_owner={shop_owner_id}")
    else:
        print(f"ℹ️ Context bot_id not set: bot_id={bot_id}, bot_owner_user_id={bot_owner_user_id}")
    
    total_time = time.time() - request_start
    print(f"✅ [CONTEXT] Returning context: viewer_id={viewer_id}, shop_owner_id={shop_owner_id}, role={role}, bot_id={context_bot_id}")
    print(f"⏱️ [CONTEXT] Total request time: {total_time:.3f}s")
    
    # Предупреждение, если запрос занял слишком много времени
    if total_time > 3.0:
        print(f"⚠️ [CONTEXT] WARNING: Request took {total_time:.3f}s - this is slow!")
    
    return {
        "viewer_id": viewer_id,
        "shop_owner_id": shop_owner_id,
        "role": role,
        "permissions": permissions,
        "bot_id": context_bot_id  # Добавляем bot_id в контекст
    }

