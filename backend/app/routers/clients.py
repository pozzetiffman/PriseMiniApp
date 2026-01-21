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
import os
import requests
import re
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
        
        # Подсчитываем активные сделки
        now = datetime.utcnow()
        
        # Активные резервации
        active_reservations_count = db.query(func.count(models.Reservation.id)).filter(
            and_(
                models.Reservation.user_id == shop_owner_id,
                models.Reservation.reserved_by_user_id == visitor_id,
                models.Reservation.is_active == True,
                models.Reservation.reserved_until > now
            )
        ).scalar() or 0
        
        # Активные заказы
        active_orders_count = db.query(func.count(models.Order.id)).filter(
            and_(
                models.Order.user_id == shop_owner_id,
                models.Order.ordered_by_user_id == visitor_id,
                models.Order.is_completed == False,
                models.Order.is_cancelled == False
            )
        ).scalar() or 0
        
        # Активные покупки
        active_purchases_count = db.query(func.count(models.Purchase.id)).filter(
            and_(
                models.Purchase.user_id == shop_owner_id,
                models.Purchase.purchased_by_user_id == visitor_id,
                models.Purchase.is_completed == False,
                models.Purchase.is_cancelled == False
            )
        ).scalar() or 0
        
        active_deals_count = active_reservations_count + active_orders_count + active_purchases_count
        
        # Получаем контактную информацию из последнего заказа или покупки
        # Сначала проверяем заказы (более приоритетны)
        last_order = db.query(models.Order).filter(
            and_(
                models.Order.user_id == shop_owner_id,
                models.Order.ordered_by_user_id == visitor_id
            )
        ).order_by(desc(models.Order.created_at)).first()
        
        # Если нет заказа, проверяем покупки
        last_purchase = None
        if not last_order:
            last_purchase = db.query(models.Purchase).filter(
                and_(
                    models.Purchase.user_id == shop_owner_id,
                    models.Purchase.purchased_by_user_id == visitor_id
                )
            ).order_by(desc(models.Purchase.created_at)).first()
        
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
        product = db.query(models.Product).filter(models.Product.id == res.product_id).first()
        reservation_data = {
            "id": res.id,
            "product_id": res.product_id,
            "product_name": product.name if product else "Товар удален",
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
        product = db.query(models.Product).filter(models.Product.id == order.product_id).first()
        order_data = {
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
        product = db.query(models.Product).filter(models.Product.id == purchase.product_id).first()
        purchase_data = {
            "id": purchase.id,
            "product_id": purchase.product_id,
            "product_name": product.name if product else "Товар удален",
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
        product = db.query(models.Product).filter(models.Product.id == fav.product_id).first()
        if product:  # Показываем только если товар еще существует
            favorites_data.append({
                "id": fav.id,
                "product_id": fav.product_id,
                "product_name": product.name,
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
            address=address_value
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
            address=address_value
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
