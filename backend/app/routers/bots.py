"""
Роутер для регистрации и управления ботами
"""
import os
import aiohttp
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from dotenv import load_dotenv
from ..db import database
from ..utils.telegram_auth import validate_telegram_init_data

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = os.getenv("TELEGRAM_API_URL", "https://api.telegram.org/bot")

router = APIRouter(prefix="/api", tags=["bots"])


# Pydantic модели
class BotRegisterRequest(BaseModel):
    bot_token: str
    owner_user_id: int  # ID владельца (из initData главного бота)
    direct_link_name: Optional[str] = None  # Название Direct Link (например, "shop", "TGshowcase_bot")


class BotResponse(BaseModel):
    id: int
    bot_username: str
    owner_user_id: int
    is_active: bool
    direct_link_name: Optional[str] = None
    created_at: str


async def get_validated_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
):
    """
    Dependency для валидации Telegram initData и извлечения user_id
    """
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram initData is required. Open the app through Telegram bot."
        )
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="Bot token is not configured"
        )
    
    try:
        validated_data = validate_telegram_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
        return validated_data["user"]["id"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")


async def get_optional_validated_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
) -> Optional[int]:
    """
    Опциональная dependency для валидации Telegram initData.
    Возвращает None, если initData не предоставлен.
    """
    if not x_telegram_init_data:
        return None
    
    if not TELEGRAM_BOT_TOKEN:
        return None
    
    try:
        validated_data = validate_telegram_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
        return validated_data["user"]["id"]
    except:
        return None


async def verify_bot_token(bot_token: str) -> dict:
    """
    Проверить токен бота через Telegram API и получить информацию о боте.
    
    Returns:
        dict с информацией о боте: {id, username, first_name, ...}
    """
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{TELEGRAM_API_URL}{bot_token}/getMe"
            async with session.get(url) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid bot token: {error_text}"
                    )
                data = await resp.json()
                if not data.get("ok"):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Telegram API error: {data.get('description', 'Unknown error')}"
                    )
                return data.get("result", {})
    except aiohttp.ClientError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to verify bot token: {str(e)}"
        )


@router.post("/bots/register", response_model=BotResponse)
async def register_bot(
    request: BotRegisterRequest,
    owner_user_id: Optional[int] = Depends(get_optional_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Зарегистрировать нового бота в системе.
    
    Args:
        request: Данные для регистрации (bot_token, owner_user_id)
        owner_user_id: ID владельца (из валидированного initData, опционально)
        db: Сессия базы данных
        
    Returns:
        Информация о зарегистрированном боте
    """
    from ..db import models
    
    # Если owner_user_id передан через initData, используем его
    # Иначе используем owner_user_id из запроса (для регистрации через бота)
    final_owner_user_id = owner_user_id if owner_user_id else request.owner_user_id
    
    if not final_owner_user_id:
        raise HTTPException(
            status_code=400,
            detail="Owner user_id is required"
        )
    
    # Проверяем токен бота через Telegram API
    bot_info = await verify_bot_token(request.bot_token)
    bot_username = bot_info.get("username")
    bot_id = bot_info.get("id")
    
    if not bot_username:
        raise HTTPException(
            status_code=400,
            detail="Bot must have a username"
        )
    
    # Убираем @ из username, если есть
    bot_username = bot_username.lstrip("@")
    
    # Проверяем, не зарегистрирован ли уже этот бот
    existing_bot = db.query(models.Bot).filter(
        (models.Bot.bot_token == request.bot_token) |
        (models.Bot.bot_username == bot_username)
    ).first()
    
    if existing_bot:
        if existing_bot.owner_user_id != final_owner_user_id:
            raise HTTPException(
                status_code=409,
                detail="Bot is already registered by another user"
            )
        # Бот уже зарегистрирован этим пользователем
        # Если передан новый direct_link_name, обновляем его (даже если текущий None или пустой)
        if request.direct_link_name:
            # Обновляем если значение отличается или если текущее значение None/пустое
            if (not existing_bot.direct_link_name or 
                existing_bot.direct_link_name != request.direct_link_name):
                existing_bot.direct_link_name = request.direct_link_name
                existing_bot.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(existing_bot)
                print(f"✅ Updated direct_link_name for bot {existing_bot.id} (@{existing_bot.bot_username}) to '{request.direct_link_name}'")
        
        return BotResponse(
            id=existing_bot.id,
            bot_username=existing_bot.bot_username,
            owner_user_id=existing_bot.owner_user_id,
            is_active=existing_bot.is_active,
            direct_link_name=existing_bot.direct_link_name,
            created_at=existing_bot.created_at.isoformat()
        )
    
    # Создаем новую запись
    # Если direct_link_name не указан, используем стандартное название "shop"
    direct_link_name = request.direct_link_name if request.direct_link_name else "shop"
    
    new_bot = models.Bot(
        bot_token=request.bot_token,
        bot_username=bot_username,
        owner_user_id=final_owner_user_id,
        is_active=True,
        direct_link_name=direct_link_name
    )
    
    db.add(new_bot)
    db.commit()
    db.refresh(new_bot)
    
    # КОПИРУЕМ ВСЕ ДАННЫЕ МАГАЗИНА ИЗ ОСНОВНОГО БОТА В НОВЫЙ БОТ
    # Создаем независимый магазин для нового бота с копированными данными
    from ..db import models
    import json
    
    print(f"📦 Copying shop data from main bot to bot {new_bot.id} (user {final_owner_user_id})...")
    
    # 1. Копируем настройки магазина
    main_bot_settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == final_owner_user_id,
        models.ShopSettings.bot_id == None
    ).first()
    
    if not main_bot_settings:
        print(f"⚠️ Main bot settings not found for user {final_owner_user_id}, creating default settings")
        main_bot_settings = models.ShopSettings(
            user_id=final_owner_user_id,
            bot_id=None,
            reservations_enabled=True,
            quantity_enabled=True,
            shop_name=None,
            welcome_image_url=None,
            welcome_description=None
        )
        db.add(main_bot_settings)
        db.commit()
        db.refresh(main_bot_settings)
    
    # Создаем настройки для нового бота
    existing_bot_settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.bot_id == new_bot.id
    ).first()
    
    if not existing_bot_settings:
        new_settings = models.ShopSettings(
            user_id=final_owner_user_id,
            bot_id=new_bot.id,
            reservations_enabled=main_bot_settings.reservations_enabled,
            quantity_enabled=main_bot_settings.quantity_enabled,
            shop_name=main_bot_settings.shop_name,
            welcome_image_url=main_bot_settings.welcome_image_url,
            welcome_description=main_bot_settings.welcome_description
        )
        db.add(new_settings)
        print(f"✅ Copied shop settings to bot {new_bot.id}")
    
    # 2. Копируем категории из основного бота (bot_id = None) в новый бот
    main_categories = db.query(models.Category).filter(
        models.Category.user_id == final_owner_user_id,
        models.Category.bot_id == None
    ).all()
    
    # Создаем маппинг старых category_id -> новых category_id
    category_mapping = {}  # old_id -> new_id
    
    for main_category in main_categories:
        # Проверяем, не скопирована ли уже категория
        existing_category = db.query(models.Category).filter(
            models.Category.user_id == final_owner_user_id,
            models.Category.bot_id == new_bot.id,
            models.Category.name == main_category.name
        ).first()
        
        if not existing_category:
            new_category = models.Category(
                name=main_category.name,
                user_id=final_owner_user_id,
                bot_id=new_bot.id  # Индивидуальная категория для нового бота
            )
            db.add(new_category)
            db.flush()  # Получаем ID новой категории
            category_mapping[main_category.id] = new_category.id
            print(f"✅ Copied category '{main_category.name}' (old_id={main_category.id} -> new_id={new_category.id})")
        else:
            category_mapping[main_category.id] = existing_category.id
    
    db.commit()
    
    # 3. Копируем товары из основного бота в новый бот
    main_products = db.query(models.Product).filter(
        models.Product.user_id == final_owner_user_id,
        models.Product.bot_id == None
    ).all()
    
    copied_products = 0
    for main_product in main_products:
        # Проверяем, не скопирован ли уже товар
        existing_product = db.query(models.Product).filter(
            models.Product.user_id == final_owner_user_id,
            models.Product.bot_id == new_bot.id,
            models.Product.name == main_product.name,
            models.Product.price == main_product.price
        ).first()
        
        if not existing_product:
            # Получаем новый category_id из маппинга
            new_category_id = category_mapping.get(main_product.category_id)
            
            new_product = models.Product(
                name=main_product.name,
                description=main_product.description,
                price=main_product.price,
                image_url=main_product.image_url,
                images_urls=main_product.images_urls,  # Копируем JSON строку
                discount=main_product.discount,
                user_id=final_owner_user_id,
                bot_id=new_bot.id,  # Индивидуальный товар для нового бота
                is_hot_offer=main_product.is_hot_offer,
                quantity=main_product.quantity,
                is_sold=False,  # Новый товар не продан
                is_made_to_order=main_product.is_made_to_order,
                category_id=new_category_id
            )
            db.add(new_product)
            copied_products += 1
            print(f"✅ Copied product '{main_product.name}' to bot {new_bot.id}")
    
    db.commit()
    
    print(f"✅ Bot {new_bot.id} ready: {len(main_categories)} categories, {copied_products} products copied (independent shop)")
    
    print(f"✅ Bot registered: {bot_username} (owner: {final_owner_user_id})")
    
    return BotResponse(
        id=new_bot.id,
        bot_username=new_bot.bot_username,
        owner_user_id=new_bot.owner_user_id,
        is_active=new_bot.is_active,
        direct_link_name=new_bot.direct_link_name,
        created_at=new_bot.created_at.isoformat()
    )


@router.get("/bots/my", response_model=list[BotResponse])
async def get_my_bots(
    owner_user_id: Optional[int] = Query(None, description="User ID для запросов от бота (localhost)"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить список ботов текущего пользователя.
    Поддерживает запросы от бота (user_id в query) и от WebApp (initData).
    """
    from ..db import models
    
    # Если user_id передан в query (запрос от бота), используем его
    # Иначе используем валидацию через initData
    if owner_user_id is not None:
        # Запрос от бота - используем user_id напрямую
        final_user_id = owner_user_id
    else:
        # Запрос от WebApp - валидируем через initData
        if not x_telegram_init_data:
            raise HTTPException(
                status_code=401,
                detail="Telegram initData is required or user_id must be provided"
            )
        final_user_id = await get_validated_user(x_telegram_init_data)
    
    bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == final_user_id,
        models.Bot.is_active == True
    ).all()
    
    result = [
        BotResponse(
            id=bot.id,
            bot_username=bot.bot_username,
            owner_user_id=bot.owner_user_id,
            is_active=bot.is_active,
            direct_link_name=bot.direct_link_name,  # Может быть None, это нормально
            created_at=bot.created_at.isoformat()
        )
        for bot in bots
    ]
    
    # Логируем для отладки
    for bot_resp in result:
        print(f"DEBUG: Bot {bot_resp.bot_username} - direct_link_name: {bot_resp.direct_link_name}")
    
    return result


@router.patch("/bots/{bot_id}/direct-link-name")
async def update_direct_link_name(
    bot_id: int,
    direct_link_name: str = Query(..., description="Новое название Direct Link"),
    owner_user_id: Optional[int] = Query(None, description="User ID для запросов от бота (localhost)"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Обновить название Direct Link для бота.
    Поддерживает запросы от бота (user_id в query) и от WebApp (initData).
    """
    from ..db import models
    
    # Если user_id передан в query (запрос от бота), используем его
    # Иначе используем валидацию через initData
    if owner_user_id is not None:
        final_user_id = owner_user_id
    else:
        if not x_telegram_init_data:
            raise HTTPException(
                status_code=401,
                detail="Telegram initData is required or user_id must be provided"
            )
        final_user_id = await get_validated_user(x_telegram_init_data)
    
    # Находим бота
    bot = db.query(models.Bot).filter(
        models.Bot.id == bot_id,
        models.Bot.owner_user_id == final_user_id
    ).first()
    
    if not bot:
        raise HTTPException(
            status_code=404,
            detail="Bot not found"
        )
    
    # Обновляем название Direct Link
    bot.direct_link_name = direct_link_name
    bot.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(bot)
    
    return BotResponse(
        id=bot.id,
        bot_username=bot.bot_username,
        owner_user_id=bot.owner_user_id,
        is_active=bot.is_active,
        direct_link_name=bot.direct_link_name,
        created_at=bot.created_at.isoformat()
    )

@router.delete("/bots/{bot_id}")
async def delete_bot(
    bot_id: int,
    owner_user_id: Optional[int] = Query(None, description="User ID для запросов от бота (localhost)"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Удалить бота.
    Поддерживает запросы от бота (user_id в query) и от WebApp (initData).
    """
    from ..db import models
    
    # Если user_id передан в query (запрос от бота), используем его
    # Иначе используем валидацию через initData
    if owner_user_id is not None:
        final_user_id = owner_user_id
    else:
        if not x_telegram_init_data:
            raise HTTPException(
                status_code=401,
                detail="Telegram initData is required or user_id must be provided"
            )
        final_user_id = await get_validated_user(x_telegram_init_data)
    
    # Находим бота
    bot = db.query(models.Bot).filter(
        models.Bot.id == bot_id,
        models.Bot.owner_user_id == final_user_id
    ).first()
    
    if not bot:
        raise HTTPException(
            status_code=404,
            detail="Bot not found"
        )
    
    bot_username = bot.bot_username
    
    # Удаляем бота (мягкое удаление - устанавливаем is_active = False)
    # Или полное удаление - удаляем запись из базы
    # Используем мягкое удаление для возможности восстановления
    bot.is_active = False
    db.commit()
    
    return {
        "message": f"Bot @{bot_username} has been deactivated",
        "bot_id": bot_id,
        "bot_username": bot_username
    }

@router.get("/bots/{bot_token}/token")
async def get_bot_by_token(
    bot_token: str,
    db: Session = Depends(database.get_db)
):
    """
    Получить информацию о боте по токену.
    Используется для валидации initData с любым токеном.
    """
    from ..db import models
    
    bot = db.query(models.Bot).filter(
        models.Bot.bot_token == bot_token
    ).first()
    
    if not bot:
        raise HTTPException(
            status_code=404,
            detail="Bot not found"
        )
    
    if not bot.is_active:
        raise HTTPException(
            status_code=403,
            detail="Bot is not active"
        )
    
    return {
        "id": bot.id,
        "bot_token": bot.bot_token,
        "bot_username": bot.bot_username,
        "owner_user_id": bot.owner_user_id,
        "is_active": bot.is_active
    }

