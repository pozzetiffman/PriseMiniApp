"""
Роутер для отслеживания посещений магазина и просмотров товаров
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv
from ..db import models, database
from ..utils.telegram_auth import get_user_id_from_init_data

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/shop-visits", tags=["shop-visits"])


@router.post("/track")
def track_visit(
    shop_owner_id: int = Query(..., description="ID владельца магазина"),
    product_id: Optional[int] = Query(None, description="ID товара (если null - общее посещение магазина)"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Отслеживание посещения магазина или просмотра конкретного товара.
    Если product_id указан - это просмотр конкретного товара (модальное окно).
    Если product_id не указан - это общее посещение магазина (просмотр списка товаров).
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        visitor_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Не отслеживаем посещения владельца своего магазина
    if visitor_id == shop_owner_id:
        print(f"📊 Shop visit: Owner {visitor_id} visiting own shop {shop_owner_id} - not tracked")
        return {"message": "Owner visit not tracked", "tracked": False}
    
    print(f"📊 Shop visit: Visitor {visitor_id} visiting shop {shop_owner_id}, product_id={product_id}")
    
    # Проверяем, существует ли магазин (есть ли товары или категории)
    has_products = db.query(models.Product).filter(
        models.Product.user_id == shop_owner_id
    ).first()
    has_categories = db.query(models.Category).filter(
        models.Category.user_id == shop_owner_id
    ).first()
    
    if not has_products and not has_categories:
        raise HTTPException(status_code=404, detail="Shop not found")
    
    # Если указан product_id, проверяем что товар существует и принадлежит магазину
    if product_id is not None:
        product = db.query(models.Product).filter(
            models.Product.id == product_id,
            models.Product.user_id == shop_owner_id
        ).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, не было ли уже недавнего посещения (в течение последних 5 минут)
    # чтобы не создавать слишком много записей
    from sqlalchemy import and_
    recent_visit = db.query(models.ShopVisit).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == visitor_id,
            models.ShopVisit.product_id == (product_id if product_id is not None else None),
            models.ShopVisit.visited_at >= datetime.utcnow().replace(second=0, microsecond=0) - timedelta(minutes=5)
        )
    ).first()
    
    if recent_visit:
        # Обновляем время последнего посещения
        recent_visit.visited_at = datetime.utcnow()
        db.commit()
        print(f"✅ Shop visit: Updated existing visit for visitor {visitor_id}, shop {shop_owner_id}, product_id={product_id}")
        return {"message": "Visit updated", "tracked": True}
    
    # Создаем новую запись о посещении
    visit = models.ShopVisit(
        shop_owner_id=shop_owner_id,
        visitor_id=visitor_id,
        product_id=product_id,
        visited_at=datetime.utcnow()
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)
    
    print(f"✅ Shop visit: Created new visit record: id={visit.id}, visitor {visitor_id}, shop {shop_owner_id}, product_id={product_id}")
    return {"message": "Visit tracked", "tracked": True, "visit_id": visit.id}

