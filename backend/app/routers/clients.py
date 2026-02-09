"""
Роутер для работы с клиентами магазина
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, and_, desc
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel, validator
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.product_snapshot import get_product_display_info_from_snapshot
from ..utils.products_utils import make_full_url
from ..utils.order_number import generate_order_number_11
import os
import requests
import re
import json
import time
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
    active_deals_count: int = 0  # Количество активных сделок (резервации + заказы + покупки)
    orders_count: int = 0  # Общее количество заказов
    reservations_count: int = 0  # Общее количество резерваций
    purchases_count: int = 0  # Общее количество покупок
    favorites_count: int = 0  # Общее количество избранного
    # Контактная информация из заказов/покупок
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_number: Optional[str] = None
    phone_country_code: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    
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
    # Активные сделки (для управления)
    active_reservations: List[dict] = []
    active_orders: List[dict] = []
    active_purchases: List[dict] = []
    # История (завершенные сделки)
    history_reservations: List[dict] = []
    history_orders: List[dict] = []
    history_purchases: List[dict] = []
    # Самые популярные товары (топ-5 по просмотрам)
    most_viewed_products: List[dict] = []
    # Контактная информация
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_number: Optional[str] = None
    phone_country_code: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    
    class Config:
        from_attributes = True


def calculate_session_time(visits: list, session_timeout_minutes: int = 30) -> int:
    """
    Вычисляет общее время активных сессий клиента.
    
    Сессия - это группа посещений, между которыми прошло меньше session_timeout_minutes.
    Время сессии ограничено максимумом (например, 2 часа), чтобы не учитывать очень длинные сессии.
    
    Args:
        visits: Список посещений (может быть список объектов ShopVisit, кортежей (visitor_id, product_id, visited_at), или datetime)
        session_timeout_minutes: Максимальное время между посещениями для одной сессии (по умолчанию 30 минут)
    
    Returns:
        Общее время в секундах
    """
    if not visits or len(visits) == 0:
        return 0
    
    if len(visits) == 1:
        # Если только одно посещение, считаем минимальное время (например, 1 минута)
        return 60
    
    # Извлекаем datetime из разных форматов данных
    def get_visit_time(visit):
        if isinstance(visit, models.ShopVisit):
            return visit.visited_at
        elif isinstance(visit, tuple) and len(visit) >= 3:
            # Кортеж (visitor_id, product_id, visited_at)
            return visit[2]
        elif isinstance(visit, datetime):
            return visit
        else:
            # Пытаемся получить атрибут visited_at
            return getattr(visit, 'visited_at', visit)
    
    # Сортируем посещения по времени
    sorted_visits = sorted(visits, key=lambda x: get_visit_time(x))
    
    total_time = 0
    session_start = None
    session_last_visit = None
    max_session_duration = timedelta(hours=2)  # Максимальная длительность одной сессии
    
    for i, visit in enumerate(sorted_visits):
        visit_time = get_visit_time(visit)
        
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
    import time
    request_start = time.time()
    
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
    
    print(f"👥 [CLIENTS] Loading clients for shop_owner_id={shop_owner_id}")
    
    # Получаем всех уникальных посетителей магазина
    db_start = time.time()
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
    db_time = time.time() - db_start
    print(f"⏱️ [CLIENTS] Visitors query took {db_time:.3f}s, found {len(visitors)} clients")
    
    # Получаем токен бота для запросов username
    bot_token = get_bot_token_for_user(shop_owner_id, db)
    
    # ОПТИМИЗАЦИЯ: Предзагружаем все данные для всех клиентов одним запросом
    visitor_ids = [v[0] for v in visitors]
    if not visitor_ids:
        print(f"👥 [CLIENTS] No visitors found")
        return []
    
    # Предзагружаем все посещения для всех клиентов
    db_start = time.time()
    all_visits_data = db.query(
        models.ShopVisit.visitor_id,
        models.ShopVisit.product_id,
        models.ShopVisit.visited_at
    ).filter(
        models.ShopVisit.shop_owner_id == shop_owner_id,
        models.ShopVisit.visitor_id.in_(visitor_ids)
    ).order_by(models.ShopVisit.visited_at).all()
    db_time = time.time() - db_start
    print(f"⏱️ [CLIENTS] All visits query took {db_time:.3f}s, found {len(all_visits_data)} visits")
    
    # Группируем посещения по visitor_id
    visits_by_visitor = {}
    for visit in all_visits_data:
        visitor_id = visit[0]
        if visitor_id not in visits_by_visitor:
            visits_by_visitor[visitor_id] = []
        visits_by_visitor[visitor_id].append(visit)
    
    # Предзагружаем все счетчики для всех клиентов одним запросом
    now = datetime.utcnow()
    
    # Активные резервации для всех клиентов
    db_start = time.time()
    active_reservations = db.query(
        models.Reservation.reserved_by_user_id,
        func.count(models.Reservation.id).label('count')
    ).filter(
        and_(
            models.Reservation.user_id == shop_owner_id,
            models.Reservation.reserved_by_user_id.in_(visitor_ids),
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > now
        )
    ).group_by(models.Reservation.reserved_by_user_id).all()
    active_reservations_dict = {r[0]: r[1] for r in active_reservations}
    
    # Активные заказы для всех клиентов
    active_orders = db.query(
        models.Order.ordered_by_user_id,
        func.count(models.Order.id).label('count')
    ).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id.in_(visitor_ids),
            models.Order.is_completed == False,
            models.Order.is_cancelled == False
        )
    ).group_by(models.Order.ordered_by_user_id).all()
    active_orders_dict = {o[0]: o[1] for o in active_orders}
    
    # Активные покупки для всех клиентов
    active_purchases = db.query(
        models.Purchase.purchased_by_user_id,
        func.count(models.Purchase.id).label('count')
    ).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id.in_(visitor_ids),
            models.Purchase.is_completed == False,
            models.Purchase.is_cancelled == False
        )
    ).group_by(models.Purchase.purchased_by_user_id).all()
    active_purchases_dict = {p[0]: p[1] for p in active_purchases}
    
    # Общие счетчики для всех клиентов
    total_orders = db.query(
        models.Order.ordered_by_user_id,
        func.count(models.Order.id).label('count')
    ).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id.in_(visitor_ids)
        )
    ).group_by(models.Order.ordered_by_user_id).all()
    total_orders_dict = {o[0]: o[1] for o in total_orders}
    
    total_reservations = db.query(
        models.Reservation.reserved_by_user_id,
        func.count(models.Reservation.id).label('count')
    ).filter(
        and_(
            models.Reservation.user_id == shop_owner_id,
            models.Reservation.reserved_by_user_id.in_(visitor_ids)
        )
    ).group_by(models.Reservation.reserved_by_user_id).all()
    total_reservations_dict = {r[0]: r[1] for r in total_reservations}
    
    total_purchases = db.query(
        models.Purchase.purchased_by_user_id,
        func.count(models.Purchase.id).label('count')
    ).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id.in_(visitor_ids)
        )
    ).group_by(models.Purchase.purchased_by_user_id).all()
    total_purchases_dict = {p[0]: p[1] for p in total_purchases}
    
    total_favorites = db.query(
        models.Favorite.user_id,
        func.count(models.Favorite.id).label('count')
    ).filter(
        and_(
            models.Favorite.shop_owner_id == shop_owner_id,
            models.Favorite.user_id.in_(visitor_ids)
        )
    ).group_by(models.Favorite.user_id).all()
    total_favorites_dict = {f[0]: f[1] for f in total_favorites}
    
    # Последние заказы для всех клиентов
    # ОПТИМИЗАЦИЯ: Используем подзапрос для получения последнего заказа каждого клиента
    last_orders_dict = {}
    for visitor_id in visitor_ids:
        last_order = db.query(models.Order).filter(
            and_(
                models.Order.user_id == shop_owner_id,
                models.Order.ordered_by_user_id == visitor_id
            )
        ).order_by(desc(models.Order.created_at)).first()
        if last_order:
            last_orders_dict[visitor_id] = last_order
    
    # Последние покупки для всех клиентов (только для тех, у кого нет заказов)
    clients_without_orders = [vid for vid in visitor_ids if vid not in last_orders_dict]
    last_purchases_dict = {}
    for visitor_id in clients_without_orders:
        last_purchase = db.query(models.Purchase).filter(
            and_(
                models.Purchase.user_id == shop_owner_id,
                models.Purchase.purchased_by_user_id == visitor_id
            )
        ).order_by(desc(models.Purchase.created_at)).first()
        if last_purchase:
            last_purchases_dict[visitor_id] = last_purchase
    
    db_time = time.time() - db_start
    print(f"⏱️ [CLIENTS] Aggregated queries took {db_time:.3f}s")
    
    clients = []
    for visitor_id, total_visits, first_visit, last_visit in visitors:
        # ОПТИМИЗАЦИЯ: Используем предзагруженные данные вместо отдельных запросов
        # Подсчитываем просмотры товаров и посещения магазина из предзагруженных данных
        visitor_visits = visits_by_visitor.get(visitor_id, [])
        product_views = sum(1 for v in visitor_visits if v[1] is not None)
        shop_visits = sum(1 for v in visitor_visits if v[1] is None)
        
        # Вычисляем время активных сессий из предзагруженных данных
        total_time_seconds = calculate_session_time(visitor_visits) if visitor_visits else 0
        
        # Получаем username пользователя из Telegram
        username = get_user_username_from_telegram(visitor_id, bot_token) if bot_token else None
        
        # Используем предзагруженные счетчики
        active_reservations_count = active_reservations_dict.get(visitor_id, 0)
        active_orders_count = active_orders_dict.get(visitor_id, 0)
        active_purchases_count = active_purchases_dict.get(visitor_id, 0)
        active_deals_count = active_reservations_count + active_orders_count + active_purchases_count
        
        total_orders_count = total_orders_dict.get(visitor_id, 0)
        total_reservations_count = total_reservations_dict.get(visitor_id, 0)
        total_purchases_count = total_purchases_dict.get(visitor_id, 0)
        total_favorites_count = total_favorites_dict.get(visitor_id, 0)
        
        # Используем предзагруженные последние заказы/покупки
        last_order = last_orders_dict.get(visitor_id)
        last_purchase = last_purchases_dict.get(visitor_id) if not last_order else None
        
        # Извлекаем контактную информацию
        client_first_name = None
        client_last_name = None
        client_middle_name = None
        client_phone_number = None
        client_phone_country_code = None
        client_email = None
        client_city = None
        client_address = None
        
        if last_order:
            client_first_name = last_order.first_name
            client_last_name = last_order.last_name
            client_middle_name = last_order.middle_name
            client_phone_number = last_order.phone_number
            client_phone_country_code = last_order.phone_country_code
            client_email = last_order.email
        elif last_purchase:
            client_first_name = last_purchase.first_name
            client_last_name = last_purchase.last_name
            client_middle_name = last_purchase.middle_name
            client_phone_number = last_purchase.phone_number
            client_phone_country_code = None  # В покупках нет phone_country_code
            client_city = last_purchase.city
            client_address = last_purchase.address
        
        clients.append(ClientInfo(
            user_id=visitor_id,
            username=username,
            total_visits=total_visits,
            product_views=product_views,
            shop_visits=shop_visits,
            total_time_seconds=total_time_seconds,
            last_visit=last_visit,
            first_visit=first_visit,
            active_deals_count=active_deals_count,
            orders_count=total_orders_count,
            reservations_count=total_reservations_count,
            purchases_count=total_purchases_count,
            favorites_count=total_favorites_count,
            first_name=client_first_name,
            last_name=client_last_name,
            middle_name=client_middle_name,
            phone_number=client_phone_number,
            phone_country_code=client_phone_country_code,
            email=client_email,
            city=client_city,
            address=client_address
        ))
    
    # Сортируем по последнему посещению (новые сначала)
    clients.sort(key=lambda x: x.last_visit if x.last_visit else datetime.min, reverse=True)
    
    total_time = time.time() - request_start
    print(f"⏱️ [CLIENTS] Total request time: {total_time:.3f}s, returned {len(clients)} clients")
    if total_time > 2.0:
        print(f"⚠️ [CLIENTS] WARNING: Request took {total_time:.3f}s - this is slow!")
    
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
    active_reservations_data = []
    history_reservations_data = []
    now = datetime.utcnow()
    
    for res in reservations:
        product = None
        product_name = "Товар удален"
        is_deleted = False
        
        # Сначала пытаемся получить товар из БД
        if res.product_id:
            product = db.query(models.Product).filter(models.Product.id == res.product_id).first()
        
        # Если товар не найден, пытаемся получить из snapshot
        if not product and res.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == res.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info and product_info.get("name"):
                    product_name = product_info.get("name")
                    is_deleted = True
        elif product:
            product_name = product.name
        
        reservation_data = {
            "id": res.id,
            "product_id": res.product_id,
            "product_name": product_name,
            "is_deleted": is_deleted,
            "created_at": res.created_at.isoformat() if res.created_at else None,
            "reserved_until": res.reserved_until.isoformat() if res.reserved_until else None,
            "is_active": res.is_active
        }
        reservations_data.append(reservation_data)
        
        # Проверяем, активна ли резервация
        is_active = res.is_active and res.reserved_until and res.reserved_until > now
        if is_active:
            active_reservations_data.append(reservation_data)
        else:
            history_reservations_data.append(reservation_data)
    
    # Получаем заказы
    orders = db.query(models.Order).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id == client_id
        )
    ).order_by(desc(models.Order.created_at)).all()
    
    orders_data = []
    active_orders_data = []
    history_orders_data = []
    
    for order in orders:
        product = None
        product_name = "Товар удален"
        is_deleted = False
        
        # Сначала пытаемся получить товар из БД
        if order.product_id:
            product = db.query(models.Product).filter(models.Product.id == order.product_id).first()
        
        # Если товар не найден, пытаемся получить из snapshot
        if not product and order.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == order.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info and product_info.get("name"):
                    product_name = product_info.get("name")
                    is_deleted = True
        elif product:
            product_name = product.name
        
        order_data = {
            "id": order.id,
            "product_id": order.product_id,
            "product_name": product_name,
            "is_deleted": is_deleted,
            "quantity": order.quantity,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "status": order.status,
            "is_completed": order.is_completed,
            "is_cancelled": order.is_cancelled,
            "first_name": order.first_name,
            "last_name": order.last_name,
            "phone_number": order.phone_number,
            "phone_country_code": order.phone_country_code,
            "email": order.email,
            "delivery_method": order.delivery_method,
            "notes": order.notes,
            "promo_code": order.promo_code
        }
        orders_data.append(order_data)
        
        # Проверяем, активен ли заказ (не выполнен и не отменен)
        is_active = not order.is_completed and not order.is_cancelled
        if is_active:
            active_orders_data.append(order_data)
        else:
            history_orders_data.append(order_data)
    
    # Получаем продажи (purchases - заявки на покупку)
    purchases = db.query(models.Purchase).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id == client_id
        )
    ).order_by(desc(models.Purchase.created_at)).all()
    
    purchases_data = []
    active_purchases_data = []
    history_purchases_data = []
    
    for purchase in purchases:
        product = None
        product_name = "Товар удален"
        is_deleted = False
        
        # Сначала пытаемся получить товар из БД
        if purchase.product_id:
            product = db.query(models.Product).filter(models.Product.id == purchase.product_id).first()
        
        # Если товар не найден, пытаемся получить из snapshot
        if not product and purchase.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == purchase.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info and product_info.get("name"):
                    product_name = product_info.get("name")
                    is_deleted = True
        elif product:
            product_name = product.name
        
        purchase_data = {
            "id": purchase.id,
            "product_id": purchase.product_id,
            "product_name": product_name,
            "is_deleted": is_deleted,
            "created_at": purchase.created_at.isoformat() if purchase.created_at else None,
            "status": purchase.status,
            "is_completed": purchase.is_completed,
            "is_cancelled": purchase.is_cancelled,
            "first_name": purchase.first_name,
            "last_name": purchase.last_name,
            "middle_name": purchase.middle_name,
            "phone_number": purchase.phone_number,
            "city": purchase.city,
            "address": purchase.address,
            "payment_method": purchase.payment_method,
            "organization": purchase.organization,
            "notes": purchase.notes,
            "images_urls": purchase.images_urls,
            "video_url": purchase.video_url
        }
        purchases_data.append(purchase_data)
        
        # Проверяем, активна ли покупка (не выполнена и не отменена)
        is_active = not purchase.is_completed and not purchase.is_cancelled
        if is_active:
            active_purchases_data.append(purchase_data)
        else:
            history_purchases_data.append(purchase_data)
    
    # Получаем избранное
    favorites = db.query(models.Favorite).filter(
        and_(
            models.Favorite.shop_owner_id == shop_owner_id,
            models.Favorite.user_id == client_id
        )
    ).order_by(desc(models.Favorite.created_at)).all()
    
    favorites_data = []
    for fav in favorites:
        product = None
        product_name = "Товар удален"
        is_deleted = False
        
        # Сначала пытаемся получить товар из БД
        if fav.product_id:
            product = db.query(models.Product).filter(models.Product.id == fav.product_id).first()
        
        # Если товар не найден, показываем как удаленный
        if not product:
            is_deleted = True
        else:
            product_name = product.name
        
        favorites_data.append({
            "id": fav.id,
            "product_id": fav.product_id,
            "product_name": product_name,
            "is_deleted": is_deleted,
            "created_at": fav.created_at.isoformat() if fav.created_at else None
        })
    
    # Получаем контактную информацию из последнего заказа и покупки
    # Purchase имеет приоритет для адреса и города, Order - для email и phone_country_code
    last_order = db.query(models.Order).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id == client_id
        )
    ).order_by(desc(models.Order.created_at)).first()
    
    last_purchase = db.query(models.Purchase).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id == client_id
        )
    ).order_by(desc(models.Purchase.created_at)).first()
    
    # Извлекаем контактную информацию
    # Приоритет: Purchase для адреса/города, Order для email/phone_country_code
    contact_first_name = None
    contact_last_name = None
    contact_middle_name = None
    contact_phone_number = None
    contact_phone_country_code = None
    contact_email = None
    contact_city = None
    contact_address = None
    
    # Сначала берем из Purchase (там есть адрес и город)
    if last_purchase:
        contact_first_name = last_purchase.first_name
        contact_last_name = last_purchase.last_name
        contact_middle_name = last_purchase.middle_name
        contact_phone_number = last_purchase.phone_number
        contact_city = last_purchase.city
        contact_address = last_purchase.address
    
    # Затем дополняем из Order (там есть email и phone_country_code)
    if last_order:
        if not contact_first_name:
            contact_first_name = last_order.first_name
        if not contact_last_name:
            contact_last_name = last_order.last_name
        if not contact_middle_name:
            contact_middle_name = last_order.middle_name
        if not contact_phone_number:
            contact_phone_number = last_order.phone_number
        contact_phone_country_code = last_order.phone_country_code
        contact_email = last_order.email
    
    # Получаем самые популярные товары (топ-5 по просмотрам)
    most_viewed_products_query = db.query(
        models.ShopVisit.product_id,
        func.count(models.ShopVisit.id).label('view_count'),
        models.Product.name,
        models.Product.image_url,
        models.Product.price
    ).join(
        models.Product, models.ShopVisit.product_id == models.Product.id
    ).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id,
            models.ShopVisit.product_id.isnot(None)
        )
    ).group_by(
        models.ShopVisit.product_id,
        models.Product.name,
        models.Product.image_url,
        models.Product.price
    ).order_by(
        desc('view_count')
    ).limit(5).all()
    
    most_viewed_products_data = []
    for product_id, view_count, product_name, image_url, price in most_viewed_products_query:
        most_viewed_products_data.append({
            "product_id": product_id,
            "product_name": product_name,
            "view_count": view_count,
            "image_url": image_url,
            "price": float(price) if price else None
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
        favorites=favorites_data,
        active_reservations=active_reservations_data,
        active_orders=active_orders_data,
        active_purchases=active_purchases_data,
        history_reservations=history_reservations_data,
        history_orders=history_orders_data,
        history_purchases=history_purchases_data,
        most_viewed_products=most_viewed_products_data,
        first_name=contact_first_name,
        last_name=contact_last_name,
        middle_name=contact_middle_name,
        phone_number=contact_phone_number,
        phone_country_code=contact_phone_country_code,
        email=contact_email,
        city=contact_city,
        address=contact_address
    )


# Pydantic модель для получения контактных данных пользователя
class UserContactInfo(BaseModel):
    """Контактная информация пользователя из его заказов/покупок"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    
    class Config:
        from_attributes = True


# Pydantic модель для получения контактных данных пользователя
class UserContactInfo(BaseModel):
    """Контактная информация пользователя из его заказов/покупок"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    
    class Config:
        from_attributes = True


# Pydantic модель для обновления контактных данных
class ClientContactUpdate(BaseModel):
    """Модель для обновления контактных данных клиента"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    
    @validator('email')
    def validate_email(cls, v):
        if v is not None and v.strip():
            # Простая валидация email
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, v.strip()):
                raise ValueError('Некорректный формат email')
        return v.strip() if v else None
    
    @validator('phone_number')
    def validate_phone(cls, v, values):
        if v is not None and v.strip():
            # Удаляем все нецифровые символы
            phone_digits = re.sub(r'\D', '', v)
            if len(phone_digits) < 10:
                raise ValueError('Номер телефона должен содержать минимум 10 цифр')
        return v.strip() if v else None


@router.get("/me/contact", response_model=UserContactInfo)
async def get_my_contact_info(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Получить контактную информацию текущего пользователя из его заказов/покупок.
    Используется для отображения в личном кабинете пользователя.
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
    
    # Получаем последний заказ пользователя (как покупателя)
    last_order = db.query(models.Order).filter(
        models.Order.ordered_by_user_id == user_id
    ).order_by(desc(models.Order.created_at)).first()
    
    # Получаем последнюю покупку пользователя (как покупателя)
    last_purchase = db.query(models.Purchase).filter(
        models.Purchase.purchased_by_user_id == user_id
    ).order_by(desc(models.Purchase.created_at)).first()
    
    # Извлекаем контактную информацию
    # Приоритет: Purchase для адреса/города, Order для email/phone_country_code
    contact_first_name = None
    contact_last_name = None
    contact_middle_name = None
    contact_phone_number = None
    contact_phone_country_code = None
    contact_email = None
    contact_city = None
    contact_address = None
    
    # Сначала берем из Purchase (там есть адрес и город)
    if last_purchase:
        contact_first_name = last_purchase.first_name
        contact_last_name = last_purchase.last_name
        contact_middle_name = last_purchase.middle_name
        contact_phone_number = last_purchase.phone_number
        contact_city = last_purchase.city
        contact_address = last_purchase.address
    
    # Затем дополняем из Order (там есть email и phone_country_code)
    if last_order:
        if not contact_first_name:
            contact_first_name = last_order.first_name
        if not contact_last_name:
            contact_last_name = last_order.last_name
        if not contact_middle_name:
            contact_middle_name = last_order.middle_name
        if not contact_phone_number:
            contact_phone_number = last_order.phone_number
        contact_phone_country_code = last_order.phone_country_code
        contact_email = last_order.email
    
    return UserContactInfo(
        first_name=contact_first_name,
        last_name=contact_last_name,
        middle_name=contact_middle_name,
        phone_country_code=contact_phone_country_code,
        phone_number=contact_phone_number,
        email=contact_email,
        city=contact_city,
        address=contact_address
    )


@router.put("/me/contact", response_model=UserContactInfo)
async def update_my_contact_info(
    contact_data: ClientContactUpdate = Body(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Обновить контактные данные текущего пользователя.
    Обновляет данные во всех заказах и покупках пользователя.
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
    
    # Проверяем, переданы ли city или address в запросе (даже если они None или пустые)
    try:
        contact_dict = contact_data.dict(exclude_unset=True)  # Только переданные поля
    except AttributeError:
        # Для Pydantic v2 используем model_dump
        contact_dict = contact_data.model_dump(exclude_unset=True)
    has_city = 'city' in contact_dict
    has_address = 'address' in contact_dict
    needs_purchase = has_city or has_address
    
    # Получаем ВСЕ покупки пользователя
    all_purchases = db.query(models.Purchase).filter(
        models.Purchase.purchased_by_user_id == user_id
    ).all()
    
    # Если нужно сохранить адрес/город, но нет ни одной покупки - создаем Purchase
    if needs_purchase and not all_purchases:
        # Находим любой товар (берем первый попавшийся, так как это техническая запись)
        any_product = db.query(models.Product).first()
        
        if not any_product:
            raise HTTPException(status_code=400, detail="Невозможно сохранить адрес: нет товаров в системе")
        
        # Создаем Purchase для хранения контактных данных с адресом
        city_value = contact_data.city if hasattr(contact_data, 'city') else None
        address_value = contact_data.address if hasattr(contact_data, 'address') else None
        
        # Обрабатываем пустые строки как None
        if city_value and not city_value.strip():
            city_value = None
        if address_value and not address_value.strip():
            address_value = None
        
        new_purchase = models.Purchase(
            product_id=any_product.id,
            user_id=any_product.user_id,
            purchased_by_user_id=user_id,
            is_completed=True,
            status='completed',
            city=city_value,
            address=address_value,
            order_number=generate_order_number_11(),  # 11 цифр, единообразие с остальными Purchase
        )
        db.add(new_purchase)
        db.flush()
        all_purchases.append(new_purchase)
    
    # Получаем ВСЕ заказы пользователя
    all_orders = db.query(models.Order).filter(
        models.Order.ordered_by_user_id == user_id
    ).all()
    
    # Обновляем ВСЕ заказы пользователя
    for order in all_orders:
        if contact_data.first_name is not None:
            order.first_name = contact_data.first_name
        if contact_data.last_name is not None:
            order.last_name = contact_data.last_name
        if contact_data.middle_name is not None:
            order.middle_name = contact_data.middle_name
        if contact_data.phone_country_code is not None:
            order.phone_country_code = contact_data.phone_country_code
        if contact_data.phone_number is not None:
            order.phone_number = re.sub(r'\D', '', contact_data.phone_number) if contact_data.phone_number else None
        if contact_data.email is not None:
            order.email = contact_data.email
    
    # Обновляем ВСЕ покупки пользователя
    for purchase in all_purchases:
        if contact_data.first_name is not None:
            purchase.first_name = contact_data.first_name
        if contact_data.last_name is not None:
            purchase.last_name = contact_data.last_name
        if contact_data.middle_name is not None:
            purchase.middle_name = contact_data.middle_name
        if contact_data.phone_number is not None:
            purchase.phone_number = re.sub(r'\D', '', contact_data.phone_number) if contact_data.phone_number else None
        
        # Обновляем city и address, если они переданы
        if 'city' in contact_dict:
            city_value = contact_data.city
            purchase.city = city_value if city_value and city_value.strip() else None
        if 'address' in contact_dict:
            address_value = contact_data.address
            purchase.address = address_value if address_value and address_value.strip() else None
    
    db.commit()
    
    # Возвращаем обновленные данные
    return await get_my_contact_info(x_telegram_init_data, db)


@router.put("/{client_id}/contact", response_model=dict)
async def update_client_contact(
    client_id: int,
    contact_data: ClientContactUpdate = Body(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Обновить контактные данные клиента.
    Обновляет данные в последнем заказе или покупке клиента.
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
    
    # Проверяем, что клиент существует (имеет посещения)
    has_visits = db.query(models.ShopVisit).filter(
        and_(
            models.ShopVisit.shop_owner_id == shop_owner_id,
            models.ShopVisit.visitor_id == client_id
        )
    ).first()
    
    if not has_visits:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Получаем последний заказ клиента
    # Проверяем, переданы ли city или address в запросе (даже если они None или пустые)
    # contact_data - это Pydantic модель, поэтому используем hasattr или проверяем значения
    has_city = hasattr(contact_data, 'city') and contact_data.city is not None
    has_address = hasattr(contact_data, 'address') and contact_data.address is not None
    # Также проверяем, были ли поля переданы в запросе (даже если None)
    # Преобразуем в dict для проверки наличия ключей
    try:
        contact_dict = contact_data.dict(exclude_unset=True)  # Только переданные поля
    except AttributeError:
        # Для Pydantic v2 используем model_dump
        contact_dict = contact_data.model_dump(exclude_unset=True)
    needs_purchase = 'city' in contact_dict or 'address' in contact_dict
    print(f"DEBUG: contact_dict keys: {list(contact_dict.keys())}, needs_purchase={needs_purchase}")
    
    # Получаем ВСЕ покупки клиента
    all_purchases = db.query(models.Purchase).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id == client_id
        )
    ).all()
    
    # Если нужно сохранить адрес/город, но нет ни одной покупки - создаем Purchase
    if needs_purchase and not all_purchases:
        # Нужно создать Purchase для хранения адреса
        # Находим любой товар владельца магазина
        any_product = db.query(models.Product).filter(
            models.Product.user_id == shop_owner_id
        ).first()
        
        if not any_product:
            raise HTTPException(status_code=400, detail="Невозможно сохранить адрес: нет товаров в магазине")
        
        # Создаем Purchase для хранения контактных данных с адресом
        city_value = contact_data.city if hasattr(contact_data, 'city') else None
        address_value = contact_data.address if hasattr(contact_data, 'address') else None
        
        # Обрабатываем пустые строки как None
        if city_value and not city_value.strip():
            city_value = None
        if address_value and not address_value.strip():
            address_value = None
        
        new_purchase = models.Purchase(
            product_id=any_product.id,
            user_id=shop_owner_id,
            purchased_by_user_id=client_id,
            is_completed=True,  # Помечаем как выполненный, чтобы не мешал
            status='completed',
            city=city_value,
            address=address_value,
            order_number=generate_order_number_11(),  # 11 цифр, единообразие с остальными Purchase
        )
        db.add(new_purchase)
        db.flush()  # Получаем ID
        all_purchases.append(new_purchase)  # Добавляем в список для обновления
        print(f"DEBUG: Created new Purchase - city='{new_purchase.city}', address='{new_purchase.address}'")
    
    # Получаем последний Purchase для получения данных (для обратной совместимости)
    last_purchase = db.query(models.Purchase).filter(
        and_(
            models.Purchase.user_id == shop_owner_id,
            models.Purchase.purchased_by_user_id == client_id
        )
    ).order_by(desc(models.Purchase.created_at)).first()
    
    # Получаем последний Order
    last_order = db.query(models.Order).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id == client_id
        )
    ).order_by(desc(models.Order.created_at)).first()
    
    # Если нет ни заказа, ни покупки, и не нужно сохранять адрес/город - создаем Order для хранения контактов
    if not last_order and not last_purchase and not needs_purchase:
        # Создаем минимальный заказ для хранения контактных данных
        # Находим любой товар владельца магазина
        any_product = db.query(models.Product).filter(
            models.Product.user_id == shop_owner_id
        ).first()
        
        if not any_product:
            raise HTTPException(status_code=400, detail="Невозможно сохранить контакты: нет товаров в магазине")
        
        last_order = models.Order(
            product_id=any_product.id,
            user_id=shop_owner_id,
            ordered_by_user_id=client_id,
            quantity=1,
            is_completed=True,  # Помечаем как выполненный, чтобы не мешал
            status='completed'
        )
        db.add(last_order)
        db.flush()  # Получаем ID
    
    # Получаем ВСЕ заказы клиента
    all_orders = db.query(models.Order).filter(
        and_(
            models.Order.user_id == shop_owner_id,
            models.Order.ordered_by_user_id == client_id
        )
    ).all()
    
    # Обновляем ВСЕ заказы клиента (чтобы синхронизировать контактные данные)
    for order in all_orders:
        if contact_data.first_name is not None:
            order.first_name = contact_data.first_name
        if contact_data.last_name is not None:
            order.last_name = contact_data.last_name
        if contact_data.middle_name is not None:
            order.middle_name = contact_data.middle_name
        if contact_data.phone_country_code is not None:
            order.phone_country_code = contact_data.phone_country_code
        if contact_data.phone_number is not None:
            # Удаляем все нецифровые символы из номера
            order.phone_number = re.sub(r'\D', '', contact_data.phone_number) if contact_data.phone_number else None
        if contact_data.email is not None:
            order.email = contact_data.email
    
    # Обновляем ВСЕ покупки клиента (чтобы синхронизировать контактные данные)
    for purchase in all_purchases:
        if contact_data.first_name is not None:
            purchase.first_name = contact_data.first_name
        if contact_data.last_name is not None:
            purchase.last_name = contact_data.last_name
        if contact_data.middle_name is not None:
            purchase.middle_name = contact_data.middle_name
        if contact_data.phone_number is not None:
            # Удаляем все нецифровые символы из номера
            purchase.phone_number = re.sub(r'\D', '', contact_data.phone_number) if contact_data.phone_number else None
        
        # Всегда обновляем city и address, если они переданы в запросе
        # Это позволяет как сохранить значения, так и очистить их (если передано None или пустая строка)
        if 'city' in contact_dict:
            city_value = contact_data.city
            purchase.city = city_value if city_value and city_value.strip() else None
        if 'address' in contact_dict:
            address_value = contact_data.address
            purchase.address = address_value if address_value and address_value.strip() else None
        
        print(f"DEBUG: Updated Purchase id={purchase.id} - city='{purchase.city}', address='{purchase.address}'")
        # Также обновляем email в Purchase, если он есть
        if contact_data.email is not None and last_order is None:
            # Если нет Order, сохраняем email в Purchase (хотя в Purchase нет email, но можно использовать notes)
            pass  # Purchase не имеет поля email
    
    db.commit()
    
    return {
        "success": True,
        "message": "Контактные данные обновлены"
    }
