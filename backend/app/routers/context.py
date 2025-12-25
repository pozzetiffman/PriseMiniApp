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
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram initData is required. Open the app through Telegram bot."
        )
    
    try:
        # Используем функцию для валидации с любым ботом
        user_id, bot_token, bot_id = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"✅ Validated initData - user_id={user_id}, bot_token={'***' + bot_token[-10:] if bot_token else 'None'}, bot_id={bot_id}")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
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
    
    print(f"📡 GET /api/context - viewer_id={viewer_id}, shop_owner_id={shop_owner_id}")
    
    # Получаем bot_id из initData
    bot_id = None
    bot_owner_user_id = None
    if x_telegram_init_data:
        try:
            _, bot_id = await get_validated_user_and_bot(x_telegram_init_data, db)
            if bot_id:
                # Получаем владельца бота
                bot = db.query(models.Bot).filter(models.Bot.id == bot_id).first()
                if bot:
                    bot_owner_user_id = bot.owner_user_id
                    print(f"🤖 Bot {bot_id} owner: {bot_owner_user_id}, viewer: {viewer_id}")
        except:
            pass
    
    # Приоритет 1: shop_owner_id из URL параметра (обратная совместимость)
    if shop_owner_id is not None:
        # Проверяем, что shop_owner_id существует
        has_products = db.query(models.Product).filter(
            models.Product.user_id == shop_owner_id
        ).first()
        has_categories = db.query(models.Category).filter(
            models.Category.user_id == shop_owner_id
        ).first()
        
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
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        saved_context = db.query(models.WebAppContext).filter(
            models.WebAppContext.viewer_id == viewer_id,
            models.WebAppContext.created_at > one_hour_ago
        ).first()
        
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
                        # Магазин владельца бота для этого бота не найден, показываем свой магазин
                        shop_owner_id = viewer_id
                        role = "owner"
                        print(f"⚠️ Bot owner's shop not found for bot {bot_id}, using own shop - shop_owner_id={shop_owner_id}, role={role}")
                    else:
                        role = "client"
                        print(f"✅ Client opened bot owner's shop - shop_owner_id={shop_owner_id}, bot_id={bot_id}, role={role}")
            else:
                # Приоритет 4: Свой магазин (fallback для главного бота)
                shop_owner_id = viewer_id
                role = "owner"
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
    context_bot_id = None
    if bot_id and bot_owner_user_id:
        if viewer_id == bot_owner_user_id:
            # Владелец бота открывает свой магазин - используем bot_id его бота
            context_bot_id = bot_id
            print(f"✅ Context bot_id set to {context_bot_id} (bot owner's shop)")
        elif shop_owner_id == bot_owner_user_id:
            # Клиент открывает магазин владельца бота - используем bot_id бота владельца
            context_bot_id = bot_id
            print(f"✅ Context bot_id set to {context_bot_id} (client viewing bot owner's shop)")
        else:
            print(f"⚠️ Context bot_id not set: bot_id={bot_id}, bot_owner={bot_owner_user_id}, viewer={viewer_id}, shop_owner={shop_owner_id}")
    else:
        print(f"ℹ️ Context bot_id not set: bot_id={bot_id}, bot_owner_user_id={bot_owner_user_id}")
    
    print(f"📦 Returning context: viewer_id={viewer_id}, shop_owner_id={shop_owner_id}, role={role}, bot_id={context_bot_id}")
    
    return {
        "viewer_id": viewer_id,
        "shop_owner_id": shop_owner_id,
        "role": role,
        "permissions": permissions,
        "bot_id": context_bot_id  # Добавляем bot_id в контекст
    }

