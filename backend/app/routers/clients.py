"""
Роутер для работы с клиентами магазина
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, and_, desc
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
import os
import requests
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/clients", tags=["clients"])


# Pydantic модели для ответов
class ClientInfo(BaseModel):
    """Базовая информация о клиенте"""
    user_id: int
    username: Optional[str] = None  # Username пользователя из Telegram
    total_visits: int
    product_views: int
    shop_visits: int
    total_time_seconds: Optional[int] = None  # Время проведенное в магазине (приблизительно)
    last_visit: Optional[datetime] = None
    first_visit: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ClientDetail(BaseModel):
    """Детальная информация о клиенте"""
    user_id: int
    username: Optional[str] = None  # Username пользователя из Telegram
    stats: ClientInfo
    reservations_count: int
    orders_count: int
    purchases_count: int
    favorites_count: int
    reservations: List[dict]
    orders: List[dict]
    purchases: List[dict]
    favorites: List[dict]
    
    class Config:
        from_attributes = True


def calculate_session_time(visits: list, session_timeout_minutes: int = 30) -> int:
    """
    Вычисляет общее время активных сессий клиента.
    
    Сессия - это группа посещений, между которыми прошло меньше session_timeout_minutes.
    Время сессии ограничено максимумом (например, 2 часа), чтобы не учитывать очень длинные сессии.
    
    Args:
        visits: Список посещений, отсортированный по времени
        session_timeout_minutes: Максимальное время между посещениями для одной сессии (по умолчанию 30 минут)
    
    Returns:
        Общее время в секундах
    """
    if not visits or len(visits) == 0:
        return 0
    
    if len(visits) == 1:
        # Если только одно посещение, считаем минимальное время (например, 1 минута)
        return 60
    
    # Сортируем посещения по времени
    sorted_visits = sorted(visits, key=lambda x: x.visited_at if isinstance(x, models.ShopVisit) else x)
    
    total_time = 0
    session_start = None
    session_last_visit = None
    max_session_duration = timedelta(hours=2)  # Максимальная длительность одной сессии
    
    for i, visit in enumerate(sorted_visits):
        visit_time = visit.visited_at if isinstance(visit, models.ShopVisit) else visit
        
        if session_start is None:
            # Начало новой сессии
            session_start = visit_time
            session_last_visit = visit_time
        else:
            # Проверяем, является ли это продолжением текущей сессии
            time_since_last_visit = visit_time - session_last_visit
            
            if time_since_last_visit <= timedelta(minutes=session_timeout_minutes):
                # Продолжение текущей сессии
                session_last_visit = visit_time
            else:
                # Завершаем предыдущую сессию и начинаем новую
                session_duration = session_last_visit - session_start
                # Ограничиваем максимальную длительность сессии
                if session_duration > max_session_duration:
                    session_duration = max_session_duration
                total_time += int(session_duration.total_seconds())
                
                # Начинаем новую сессию
                session_start = visit_time
                session_last_visit = visit_time
    
    # Завершаем последнюю сессию
    if session_start and session_last_visit:
        session_duration = session_last_visit - session_start
        # Ограничиваем максимальную длительность сессии
        if session_duration > max_session_duration:
            session_duration = max_session_duration
        total_time += int(session_duration.total_seconds())
    
    return total_time


def get_user_username_from_telegram(user_id: int, bot_token: str) -> Optional[str]:
    """
    Получить username пользователя из Telegram API.
    
    Args:
        user_id: ID пользователя Telegram
        bot_token: Токен бота для запроса
    
    Returns:
        Username пользователя или None, если не удалось получить
    """
    if not bot_token:
        return None
    
    try:
        bot_api_url = f"https://api.telegram.org/bot{bot_token}"
        user_info_url = f"{bot_api_url}/getChat"
        resp = requests.post(user_info_url, json={"chat_id": user_id}, timeout=3)
        
        if resp.status_code == 200:
            user_data = resp.json()
            if user_data.get("ok"):
                user = user_data.get("result", {})
                return user.get("username")
        
        return None
    except Exception as e:
        print(f"WARNING: Failed to get username for user {user_id}: {e}")
        return None


def get_bot_token_for_user(shop_owner_id: int, db: Session) -> str:
    """
    Получает токен бота для запросов к Telegram API.
    Если у владельца магазина есть подключенный бот, использует его токен.
    Иначе использует токен основного бота.
    """
    # Ищем подключенного бота для этого владельца магазина
    connected_bot = db.query(models.Bot).filter(
        models.Bot.owner_user_id == shop_owner_id,
        models.Bot.is_active == True
    ).first()
    
    if connected_bot and connected_bot.bot_token:
        return connected_bot.bot_token
    
    # Если подключенного бота нет, используем основной токен
    return TELEGRAM_BOT_TOKEN


@router.get("/list", response_model=List[ClientInfo])
async def get_clients_list(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить список всех клиентов (уникальных посетителей) магазина.
    Только для владельца магазина.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        shop_owner_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем всех уникальных посетителей магазина
    visitors = db.query(
        models.ShopVisit.visitor_id,
        func.count(models.ShopVisit.id).label('total_visits'),
        func.min(models.ShopVisit.visited_at).label('first_visit'),
        func.max(models.ShopVisit.visited_at).label('last_visit')
    ).filter(
        models.ShopVisit.shop_owner_id == shop_owner_id
    ).group_by(
        models.ShopVisit.visitor_id
    ).all()
    
    # Получаем токен бота для запросов username
    bot_token = get_bot_token_for_user(shop_owner_id, db)
    
    clients = []
    for visitor_id, total_visits, first_visit, last_visit in visitors:
        # Подсчитываем просмотры товаров и посещения магазина
        product_views = db.query(func.count(models.ShopVisit.id)).filter(
            and_(
                models.ShopVisit.shop_owner_id == shop_owner_id,
                models.ShopVisit.visitor_id == visitor_id,
                models.ShopVisit.product_id.isnot(None)
            )
        ).scalar() or 0
        
        shop_visits = db.query(func.count(models.ShopVisit.id)).filter(
            and_(
                models.ShopVisit.shop_owner_id == shop_owner_id,
                models.ShopVisit.visitor_id == visitor_id,
                models.ShopVisit.product_id.is_(None)
            )
        ).scalar() or 0
        
        # Вычисляем время активных сессий
        # Получаем все посещения клиента для вычисления времени сессий
        all_visits = db.query(models.ShopVisit).filter(
            and_(
                models.ShopVisit.shop_owner_id == shop_owner_id,
                models.ShopVisit.visitor_id == visitor_id
            )
        ).order_by(models.ShopVisit.visited_at).all()
        
        total_time_seconds = calculate_session_time(all_visits) if all_visits else 0
        
        # Получаем username пользователя из Telegram
        username = get_user_username_from_telegram(visitor_id, bot_token) if bot_token else None
        
        clients.append(ClientInfo(
            user_id=visitor_id,
            username=username,
            total_visits=total_visits,
            product_views=product_views,
            shop_visits=shop_visits,
            total_time_seconds=total_time_seconds,
            last_visit=last_visit,
            first_visit=first_visit
        ))
    
    # Сортируем по последнему посещению (новые сначала)
    clients.sort(key=lambda x: x.last_visit if x.last_visit else datetime.min, reverse=True)
    
    return clients


@router.get("/{client_id}", response_model=ClientDetail)
async def get_client_detail(
    client_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить детальную информацию о клиенте.
    Включает статистику, резервации, заказы, продажи, избранное.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        shop_owner_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что клиент действительно посещал магазин
    has_visits = db.query(models.ShopVisit).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id
        )
    ).first()
    
    if not has_visits:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Получаем токен бота для запросов username
    bot_token = get_bot_token_for_user(shop_owner_id, db)
    
    # Получаем username пользователя из Telegram
    username = get_user_username_from_telegram(client_id, bot_token) if bot_token else None
    
    # Получаем статистику посещений
    visits_stats = db.query(
        func.count(models.ShopVisit.id).label('total_visits'),
        func.min(models.ShopVisit.visited_at).label('first_visit'),
        func.max(models.ShopVisit.visited_at).label('last_visit')
    ).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id
        )
    ).first()
    
    product_views = db.query(func.count(models.ShopVisit.id)).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id,
            models.ShopVisit.product_id.isnot(None)
        )
    ).scalar() or 0
    
    shop_visits = db.query(func.count(models.ShopVisit.id)).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id,
            models.ShopVisit.product_id.is_(None)
        )
    ).scalar() or 0
    
    # Вычисляем время активных сессий
    # Получаем все посещения клиента для вычисления времени сессий
    all_visits = db.query(models.ShopVisit).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id
        )
    ).order_by(models.ShopVisit.visited_at).all()
    
    total_time_seconds = calculate_session_time(all_visits) if all_visits else 0
    
    stats = ClientInfo(
        user_id=client_id,
        username=username,
        total_visits=visits_stats.total_visits,
        product_views=product_views,
        shop_visits=shop_visits,
        total_time_seconds=total_time_seconds,
        last_visit=visits_stats.last_visit,
        first_visit=visits_stats.first_visit
    )
    
    # Получаем резервации
    reservations = db.query(models.Reservation).filter(
        and_(
            models.Reservation.user_id == shop_owner_id,
            models.Reservation.reserved_by_user_id == client_id
        )
    ).order_by(desc(models.Reservation.created_at)).all()
    
    reservations_data = []
    for res in reservations:
        product = db.query(models.Product).filter(models.Product.id == res.product_id).first()
        reservations_data.append({
            "id": res.id,
            "product_id": res.product_id,
            "product_name": product.name if product else "Товар удален",
            "created_at": res.created_at.isoformat() if res.created_at else None,
            "reserved_until": res.reserved_until.isoformat() if res.reserved_until else None,
            "is_active": res.is_active
        })
    
    # Получаем заказы
    orders = db.query(models.Order).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id == client_id
        )
    ).order_by(desc(models.Order.created_at)).all()
    
    orders_data = []
    for order in orders:
        product = db.query(models.Product).filter(models.Product.id == order.product_id).first()
        orders_data.append({
            "id": order.id,
            "product_id": order.product_id,
            "product_name": product.name if product else "Товар удален",
            "quantity": order.quantity,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "status": order.status,
            "is_completed": order.is_completed,
            "is_cancelled": order.is_cancelled,
            "first_name": order.first_name,
            "last_name": order.last_name,
            "phone_number": order.phone_number
        })
    
    # Получаем продажи (purchases - заявки на покупку)
    purchases = db.query(models.Purchase).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id == client_id
        )
    ).order_by(desc(models.Purchase.created_at)).all()
    
    purchases_data = []
    for purchase in purchases:
        product = db.query(models.Product).filter(models.Product.id == purchase.product_id).first()
        purchases_data.append({
            "id": purchase.id,
            "product_id": purchase.product_id,
            "product_name": product.name if product else "Товар удален",
            "created_at": purchase.created_at.isoformat() if purchase.created_at else None,
            "status": purchase.status,
            "is_completed": purchase.is_completed,
            "is_cancelled": purchase.is_cancelled,
            "first_name": purchase.first_name,
            "last_name": purchase.last_name,
            "phone_number": purchase.phone_number,
            "city": purchase.city,
            "address": purchase.address
        })
    
    # Получаем избранное
    favorites = db.query(models.Favorite).filter(
        and_(
            models.Favorite.shop_owner_id == shop_owner_id,
            models.Favorite.user_id == client_id
        )
    ).order_by(desc(models.Favorite.created_at)).all()
    
    favorites_data = []
    for fav in favorites:
        product = db.query(models.Product).filter(models.Product.id == fav.product_id).first()
        if product:  # Показываем только если товар еще существует
            favorites_data.append({
                "id": fav.id,
                "product_id": fav.product_id,
                "product_name": product.name,
                "created_at": fav.created_at.isoformat() if fav.created_at else None
            })
    
    return ClientDetail(
        user_id=client_id,
        username=username,
        stats=stats,
        reservations_count=len(reservations_data),
        orders_count=len(orders_data),
        purchases_count=len(purchases_data),
        favorites_count=len(favorites_data),
        reservations=reservations_data,
        orders=orders_data,
        purchases=purchases_data,
        favorites=favorites_data
    )
