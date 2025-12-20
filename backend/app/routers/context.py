"""
Роутер для получения контекста магазина и ролей пользователя
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import Optional
from dotenv import load_dotenv
from ..db import database
from ..utils.telegram_auth import validate_telegram_init_data

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api", tags=["context"])


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


@router.get("/context")
async def get_context(
    viewer_id: int = Depends(get_validated_user),
    shop_owner_id: Optional[int] = Query(None, description="ID владельца магазина (если смотрим чужой магазин)"),
    db: Session = Depends(database.get_db)
):
    """
    Получить контекст магазина и роли пользователя.
    
    Args:
        viewer_id: ID текущего пользователя (из валидированного Telegram initData)
        shop_owner_id: ID владельца магазина (опционально, если не указан - свой магазин)
        db: Сессия базы данных
        
    Returns:
        Контекст с viewer_id, shop_owner_id, role и permissions
    """
    print(f"📡 GET /api/context - viewer_id={viewer_id}, shop_owner_id={shop_owner_id}")
    
    # Если shop_owner_id не указан, значит смотрим свой магазин
    if shop_owner_id is None:
        shop_owner_id = viewer_id
        role = "owner"
        print(f"✅ Using own shop - shop_owner_id={shop_owner_id}, role={role}")
    else:
        # Проверяем, что shop_owner_id существует (есть хотя бы одна категория или товар)
        from ..db import models
        has_products = db.query(models.Product).filter(
            models.Product.user_id == shop_owner_id
        ).first()
        has_categories = db.query(models.Category).filter(
            models.Category.user_id == shop_owner_id
        ).first()
        
        print(f"🔍 Checking shop - has_products={bool(has_products)}, has_categories={bool(has_categories)}")
        
        if not has_products and not has_categories:
            print(f"❌ Shop not found - shop_owner_id={shop_owner_id}")
            raise HTTPException(
                status_code=404,
                detail="Shop not found"
            )
        
        role = "client" if shop_owner_id != viewer_id else "owner"
        print(f"✅ Using other shop - shop_owner_id={shop_owner_id}, role={role}")
    
    # Определяем права доступа
    permissions = {
        "can_create_products": role == "owner",
        "can_reserve": role == "client",
        "can_cancel_reservation": True,  # Может отменить свою резервацию или резервацию на своем товаре
        "can_view_products": True,
        "can_view_categories": True
    }
    
    return {
        "viewer_id": viewer_id,
        "shop_owner_id": shop_owner_id,
        "role": role,
        "permissions": permissions
    }

