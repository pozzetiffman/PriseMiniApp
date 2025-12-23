"""
Роутер для управления настройками магазина
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv
from ..db import database, models
from ..models import shop_settings as schemas
from ..utils.telegram_auth import validate_telegram_init_data

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/shop-settings", tags=["shop-settings"])


async def get_validated_user(
    request: Request,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    user_id: Optional[int] = Query(None, description="User ID для внутренних запросов от бота (только localhost)")
):
    """
    Dependency для валидации Telegram initData и извлечения user_id.
    Также поддерживает авторизацию через user_id в query для внутренних запросов от бота (localhost).
    """
    # Если есть initData - используем его (основной способ для WebApp)
    if x_telegram_init_data:
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
    
    # Если нет initData, но есть user_id в query - проверяем, что запрос с localhost (для бота)
    if user_id is not None:
        client_host = request.client.host if request.client else None
        # Разрешаем только localhost/127.0.0.1 для безопасности
        if client_host in ("127.0.0.1", "localhost", "::1") or client_host.startswith("127."):
            return user_id
        else:
            raise HTTPException(
                status_code=403,
                detail="Direct user_id authentication is only allowed from localhost (for bot requests)"
            )
    
    # Нет ни initData, ни user_id
    raise HTTPException(
        status_code=401,
        detail="Telegram initData is required. Open the app through Telegram bot."
    )

async def get_optional_validated_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
) -> Optional[int]:
    """
    Dependency для опциональной валидации Telegram initData и извлечения user_id
    Возвращает None, если initData не предоставлен
    """
    if not x_telegram_init_data:
        return None
    
    if not TELEGRAM_BOT_TOKEN:
        return None
    
    try:
        validated_data = validate_telegram_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
        return validated_data["user"]["id"]
    except:
        # Игнорируем ошибки валидации, возвращаем None
        return None


@router.get("", response_model=schemas.ShopSettings)
async def get_shop_settings(
    shop_owner_id: Optional[int] = Query(None, description="ID владельца магазина (для клиентов, просмотр чужих настроек)"),
    user_id: Optional[int] = Depends(get_optional_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Получить настройки магазина.
    Если shop_owner_id указан - возвращает настройки владельца магазина (публичные данные для клиентов).
    Если shop_owner_id не указан, но пользователь авторизован - возвращает настройки текущего пользователя (свои настройки).
    Если настройки не существуют, создаются с дефолтными значениями.
    """
    # Определяем, чьи настройки нужно получить
    # ВАЖНО: Приоритет shop_owner_id - если он указан, всегда используем его (клиент смотрит чужой магазин)
    # Иначе используем user_id если пользователь авторизован (свой магазин)
    if shop_owner_id is not None:
        # shop_owner_id указан - клиент смотрит чужой магазин, используем shop_owner_id
        target_user_id = shop_owner_id
    elif user_id is not None:
        # shop_owner_id не указан, но пользователь авторизован - используем его настройки (свой магазин)
        target_user_id = user_id
    else:
        # Нет ни shop_owner_id, ни авторизации
        raise HTTPException(
            status_code=401,
            detail="Authentication required or shop_owner_id must be provided"
        )
    
    print(f"📋 GET /api/shop-settings - user_id={user_id}, shop_owner_id={shop_owner_id}, target_user_id={target_user_id}")
    
    # Ищем существующие настройки
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == target_user_id
    ).first()
    
    # Если настройки не существуют, создаем с дефолтными значениями
    if not settings:
        print(f"📋 Creating default settings for user {target_user_id}")
        settings = models.ShopSettings(
            user_id=target_user_id,
            reservations_enabled=True,
            shop_name=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings


@router.put("", response_model=schemas.ShopSettings)
async def update_shop_settings(
    settings_update: schemas.ShopSettingsUpdate,
    user_id: int = Depends(get_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Обновить настройки магазина текущего пользователя.
    """
    # Используем model_dump(exclude_unset=True) чтобы получить только переданные поля
    update_data = settings_update.model_dump(exclude_unset=True)
    print(f"📋 PUT /api/shop-settings - user_id={user_id}, update_data={update_data}")
    
    # Ищем существующие настройки
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == user_id
    ).first()
    
    # Если настройки не существуют, создаем
    if not settings:
        print(f"📋 Creating settings for user {user_id}")
        # Используем значения из update_data или значения по умолчанию
        settings = models.ShopSettings(
            user_id=user_id,
            reservations_enabled=update_data.get('reservations_enabled', True),
            shop_name=update_data.get('shop_name', None),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(settings)
    else:
        # Обновляем только переданные поля
        if 'reservations_enabled' in update_data:
            settings.reservations_enabled = update_data['reservations_enabled']
        if 'shop_name' in update_data:
            settings.shop_name = update_data['shop_name']
        settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    print(f"✅ Settings updated - reservations_enabled={settings.reservations_enabled}, shop_name={settings.shop_name}")
    return settings

