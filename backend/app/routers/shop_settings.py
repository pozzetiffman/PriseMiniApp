"""
Роутер для управления настройками магазина
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
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


@router.get("", response_model=schemas.ShopSettings)
async def get_shop_settings(
    shop_owner_id: Optional[int] = Query(None, description="ID владельца магазина (для клиентов)"),
    user_id: int = Depends(get_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Получить настройки магазина.
    Если shop_owner_id указан - возвращает настройки владельца магазина (для клиентов).
    Если не указан - возвращает настройки текущего пользователя (для владельцев).
    Если настройки не существуют, создаются с дефолтными значениями.
    """
    # Определяем, чьи настройки нужно получить
    target_user_id = shop_owner_id if shop_owner_id is not None else user_id
    
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
    print(f"📋 PUT /api/shop-settings - user_id={user_id}, reservations_enabled={settings_update.reservations_enabled}")
    
    # Ищем существующие настройки
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == user_id
    ).first()
    
    # Если настройки не существуют, создаем
    if not settings:
        print(f"📋 Creating settings for user {user_id}")
        settings = models.ShopSettings(
            user_id=user_id,
            reservations_enabled=settings_update.reservations_enabled,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(settings)
    else:
        # Обновляем существующие настройки
        settings.reservations_enabled = settings_update.reservations_enabled
        settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    print(f"✅ Settings updated - reservations_enabled={settings.reservations_enabled}")
    return settings

