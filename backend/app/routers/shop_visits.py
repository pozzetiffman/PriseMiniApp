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


class ShopStats(BaseModel):
    """Статистика магазина - ВСЕ данные за всё время"""
    total_orders: int  # Все заказы включая отмененные
    total_reservations: int  # Все резервации включая старые/неактивные
    total_sold_products: int  # Все проданные товары
    total_products: int  # Все товары магазина
    total_favorites: int  # Все избранное включая проданные/скрытые товары


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
    date_from: Optional[str] = Query(None, description="Начальная дата в формате YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Конечная дата в формате YYYY-MM-DD"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить статистику посещений магазина для владельца.
    Поддерживает фильтрацию по дате через параметры date_from и date_to.
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
    
    # Формируем базовый фильтр
    base_filter = models.ShopVisit.shop_owner_id == user_id
    
    # Добавляем фильтр по дате, если указан
    if date_from or date_to:
        date_filters = []
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, "%Y-%m-%d")
                date_filters.append(models.ShopVisit.visited_at >= date_from_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_from format. Use YYYY-MM-DD")
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, "%Y-%m-%d")
                # Добавляем 23:59:59 к конечной дате, чтобы включить весь день
                date_to_obj = date_to_obj.replace(hour=23, minute=59, second=59)
                date_filters.append(models.ShopVisit.visited_at <= date_to_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_to format. Use YYYY-MM-DD")
        
        if date_filters:
            base_filter = and_(base_filter, *date_filters)
    
    # Получаем статистику посещений с учетом фильтра по дате
    total_visits = db.query(func.count(models.ShopVisit.id)).filter(
        base_filter
    ).scalar() or 0
    
    unique_visitors = db.query(func.count(distinct(models.ShopVisit.visitor_id))).filter(
        base_filter
    ).scalar() or 0
    
    shop_visits = db.query(func.count(models.ShopVisit.id)).filter(
        and_(
            base_filter,
            models.ShopVisit.product_id.is_(None)
        )
    ).scalar() or 0
    
    product_views = db.query(func.count(models.ShopVisit.id)).filter(
        and_(
            base_filter,
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
    date_from: Optional[str] = Query(None, description="Начальная дата в формате YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Конечная дата в формате YYYY-MM-DD"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить список посещений магазина для владельца.
    Поддерживает фильтрацию по дате через параметры date_from и date_to.
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
    
    # Базовый фильтр
    visit_filters = [models.ShopVisit.shop_owner_id == user_id]
    
    # Добавляем фильтры по дате, если они есть
    if date_from or date_to:
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, "%Y-%m-%d")
                visit_filters.append(models.ShopVisit.visited_at >= date_from_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_from format. Use YYYY-MM-DD")
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, "%Y-%m-%d")
                date_to_obj = date_to_obj.replace(hour=23, minute=59, second=59)
                visit_filters.append(models.ShopVisit.visited_at <= date_to_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_to format. Use YYYY-MM-DD")
    
    # Получаем список посещений с информацией о товарах
    visits = db.query(models.ShopVisit).options(
        joinedload(models.ShopVisit.product)
    ).filter(
        *visit_filters
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
    date_from: Optional[str] = Query(None, description="Начальная дата в формате YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Конечная дата в формате YYYY-MM-DD"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить статистику просмотров товаров (топ товаров по просмотрам).
    Поддерживает фильтрацию по дате через параметры date_from и date_to.
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
    
    # Базовый фильтр
    product_filters = [
        models.ShopVisit.shop_owner_id == user_id,
        models.ShopVisit.product_id.isnot(None)
    ]
    
    # Добавляем фильтры по дате, если они есть
    if date_from or date_to:
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, "%Y-%m-%d")
                product_filters.append(models.ShopVisit.visited_at >= date_from_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_from format. Use YYYY-MM-DD")
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, "%Y-%m-%d")
                date_to_obj = date_to_obj.replace(hour=23, minute=59, second=59)
                product_filters.append(models.ShopVisit.visited_at <= date_to_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_to format. Use YYYY-MM-DD")
    
    # Получаем статистику по товарам
    product_stats = db.query(
        models.ShopVisit.product_id,
        func.count(models.ShopVisit.id).label('view_count')
    ).filter(
        and_(*product_filters)
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


@router.get("/shop-stats", response_model=ShopStats)
async def get_shop_stats(
    date_from: Optional[str] = Query(None, description="Начальная дата в формате YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="Конечная дата в формате YYYY-MM-DD"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить полную статистику магазина за выбранный период.
    Поддерживает фильтрацию по дате через параметры date_from и date_to.
    Возвращает:
    - total_orders: все заказы включая отмененные (за период)
    - total_reservations: все резервации включая старые/неактивные (за период)
    - total_sold_products: все проданные товары (за период)
    - total_products: все товары магазина (без фильтра по дате)
    - total_favorites: все избранное включая проданные/скрытые товары (за период)
    """
    print(f"📊 [STATS] get_shop_stats called")
    
    if not x_telegram_init_data:
        print(f"❌ [STATS] No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"📊 [STATS] Authenticated user_id: {user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [STATS] Auth error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Формируем фильтры по дате для заказов, резерваций, продаж и избранного
    order_date_filter = models.Order.user_id == user_id
    reservation_date_filter = models.Reservation.user_id == user_id
    sold_product_date_filter = models.SoldProduct.user_id == user_id
    favorite_date_filter = models.Favorite.shop_owner_id == user_id
    
    if date_from or date_to:
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, "%Y-%m-%d")
                order_date_filter = and_(order_date_filter, models.Order.created_at >= date_from_obj)
                reservation_date_filter = and_(reservation_date_filter, models.Reservation.created_at >= date_from_obj)
                sold_product_date_filter = and_(sold_product_date_filter, models.SoldProduct.sold_at >= date_from_obj)
                favorite_date_filter = and_(favorite_date_filter, models.Favorite.created_at >= date_from_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_from format. Use YYYY-MM-DD")
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, "%Y-%m-%d")
                date_to_obj = date_to_obj.replace(hour=23, minute=59, second=59)
                order_date_filter = and_(order_date_filter, models.Order.created_at <= date_to_obj)
                reservation_date_filter = and_(reservation_date_filter, models.Reservation.created_at <= date_to_obj)
                sold_product_date_filter = and_(sold_product_date_filter, models.SoldProduct.sold_at <= date_to_obj)
                favorite_date_filter = and_(favorite_date_filter, models.Favorite.created_at <= date_to_obj)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_to format. Use YYYY-MM-DD")
    
    # 1. ВСЕ заказы магазина (включая отмененные) за период
    print(f"📊 [STATS] Loading orders for shop_owner_id={user_id}, date_from={date_from}, date_to={date_to}")
    total_orders = db.query(models.Order).filter(
        order_date_filter
        # НЕ фильтруем по is_cancelled - считаем ВСЕ заказы
    ).count()
    print(f"📊 [STATS] Total orders: {total_orders}")
    
    # 2. ВСЕ резервации товаров магазина (включая старые/неактивные) за период
    print(f"📊 [STATS] Loading reservations for shop_owner_id={user_id}, date_from={date_from}, date_to={date_to}")
    total_reservations = db.query(models.Reservation).filter(
        reservation_date_filter
        # НЕ фильтруем по is_active и reserved_until - считаем ВСЕ резервации
    ).count()
    print(f"📊 [STATS] Total reservations: {total_reservations}")
    
    # 3. ВСЕ проданные товары за период
    print(f"📊 [STATS] Loading sold products for shop_owner_id={user_id}, date_from={date_from}, date_to={date_to}")
    total_sold_products = db.query(models.SoldProduct).filter(
        sold_product_date_filter
    ).count()
    print(f"📊 [STATS] Total sold products: {total_sold_products}")
    
    # 4. ВСЕ товары магазина
    print(f"📊 [STATS] Loading all products for shop_owner_id={user_id}")
    total_products = db.query(models.Product).filter(
        models.Product.user_id == user_id
        # НЕ фильтруем по is_hidden или is_sold - считаем ВСЕ товары
    ).count()
    print(f"📊 [STATS] Total products: {total_products}")
    
    # 5. ВСЕ избранное для товаров магазина (включая проданные/скрытые) за период
    print(f"📊 [STATS] Loading favorites for shop_owner_id={user_id}, date_from={date_from}, date_to={date_to}")
    
    # Проверяем записи с shop_owner_id == user_id с учетом фильтра по дате
    favorites_by_shop_owner = db.query(models.Favorite).filter(
        favorite_date_filter
    ).all()
    print(f"📊 [STATS] Записей с shop_owner_id={user_id} (с учетом фильтра по дате): {len(favorites_by_shop_owner)}")
    
    # Детальная информация о каждой записи избранного
    for fav in favorites_by_shop_owner:
        product = db.query(models.Product).filter(models.Product.id == fav.product_id).first()
        if product:
            print(f"📊 [STATS]   - Favorite ID={fav.id}, product_id={fav.product_id}, product_name='{product.name}', "
                  f"is_sold={product.is_sold}, is_hidden={product.is_hidden}, user_id={fav.user_id}")
        else:
            print(f"📊 [STATS]   - Favorite ID={fav.id}, product_id={fav.product_id}, product НЕ НАЙДЕН (удален?)")
    
    # Считаем по shop_owner_id (основной способ) - ВСЕ избранное за период
    total_favorites = len(favorites_by_shop_owner)
    print(f"📊 [STATS] Total favorites (по shop_owner_id, ВСЕ включая проданные/скрытые, за период): {total_favorites}")
    
    stats = ShopStats(
        total_orders=total_orders,
        total_reservations=total_reservations,
        total_sold_products=total_sold_products,
        total_products=total_products,
        total_favorites=total_favorites
    )
    
    print(f"📊 [STATS] Final stats: orders={stats.total_orders}, reservations={stats.total_reservations}, "
          f"sold={stats.total_sold_products}, products={stats.total_products}, favorites={stats.total_favorites}")
    
    return stats

