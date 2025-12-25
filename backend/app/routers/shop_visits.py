"""
Роутер для отслеживания посещений магазина и просмотров товаров
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, distinct, and_, desc
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
from dotenv import load_dotenv
from ..db import models, database
from ..utils.telegram_auth import get_user_id_from_init_data, validate_init_data_multi_bot

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/shop-visits", tags=["shop-visits"])


# Pydantic модели для ответов
class VisitInfo(BaseModel):
    id: int
    visitor_id: int
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    visited_at: datetime
    
    class Config:
        from_attributes = True


class VisitStats(BaseModel):
    total_visits: int
    unique_visitors: int
    shop_visits: int  # Общие посещения магазина (без товара)
    product_views: int  # Просмотры конкретных товаров


class ProductViewStats(BaseModel):
    product_id: int
    product_name: str
    view_count: int


@router.post("/track")
async def track_visit(
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
    
    try:
        visitor_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
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


@router.get("/stats", response_model=VisitStats)
async def get_visit_stats(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить статистику посещений магазина для владельца.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем статистику посещений
    total_visits = db.query(func.count(models.ShopVisit.id)).filter(
        models.ShopVisit.shop_owner_id == user_id
    ).scalar() or 0
    
    unique_visitors = db.query(func.count(distinct(models.ShopVisit.visitor_id))).filter(
        models.ShopVisit.shop_owner_id == user_id
    ).scalar() or 0
    
    shop_visits = db.query(func.count(models.ShopVisit.id)).filter(
        and_(
            models.ShopVisit.shop_owner_id == user_id,
            models.ShopVisit.product_id.is_(None)
        )
    ).scalar() or 0
    
    product_views = db.query(func.count(models.ShopVisit.id)).filter(
        and_(
            models.ShopVisit.shop_owner_id == user_id,
            models.ShopVisit.product_id.isnot(None)
        )
    ).scalar() or 0
    
    return VisitStats(
        total_visits=total_visits,
        unique_visitors=unique_visitors,
        shop_visits=shop_visits,
        product_views=product_views
    )


@router.get("/list", response_model=List[VisitInfo])
async def get_visits_list(
    limit: int = Query(50, ge=1, le=200, description="Количество записей"),
    offset: int = Query(0, ge=0, description="Смещение для пагинации"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить список посещений магазина для владельца.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем список посещений с информацией о товарах
    visits = db.query(models.ShopVisit).options(
        joinedload(models.ShopVisit.product)
    ).filter(
        models.ShopVisit.shop_owner_id == user_id
    ).order_by(desc(models.ShopVisit.visited_at)).offset(offset).limit(limit).all()
    
    result = []
    for visit in visits:
        product_name = None
        if visit.product:
            product_name = visit.product.name
        
        result.append(VisitInfo(
            id=visit.id,
            visitor_id=visit.visitor_id,
            product_id=visit.product_id,
            product_name=product_name,
            visited_at=visit.visited_at
        ))
    
    return result


@router.get("/product-stats", response_model=List[ProductViewStats])
async def get_product_view_stats(
    limit: int = Query(20, ge=1, le=100, description="Количество товаров"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить статистику просмотров товаров (топ товаров по просмотрам).
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем статистику по товарам
    product_stats = db.query(
        models.ShopVisit.product_id,
        func.count(models.ShopVisit.id).label('view_count')
    ).filter(
        and_(
            models.ShopVisit.shop_owner_id == user_id,
            models.ShopVisit.product_id.isnot(None)
        )
    ).group_by(models.ShopVisit.product_id).order_by(desc('view_count')).limit(limit).all()
    
    result = []
    for stat in product_stats:
        # Получаем название товара
        product = db.query(models.Product).filter(models.Product.id == stat.product_id).first()
        product_name = product.name if product else f"Товар #{stat.product_id}"
        
        result.append(ProductViewStats(
            product_id=stat.product_id,
            product_name=product_name,
            view_count=stat.view_count
        ))
    
    return result

