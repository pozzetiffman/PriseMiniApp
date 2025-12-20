import os
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Header, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv
from ..db import models, database
from ..models import reservation as schemas
from ..utils.telegram_auth import get_user_id_from_init_data

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token для отправки уведомлений
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

print(f"DEBUG: Reservation router initialized - TELEGRAM_BOT_TOKEN={'SET' if TELEGRAM_BOT_TOKEN else 'NOT SET'}, WEBAPP_URL={WEBAPP_URL}, TELEGRAM_API_URL={TELEGRAM_API_URL[:50] if TELEGRAM_API_URL else 'NOT SET'}")

router = APIRouter(prefix="/api/reservations", tags=["reservations"])

@router.post("/", response_model=schemas.Reservation)
def create_reservation(
    product_id: int = Query(...),
    hours: int = Query(..., ge=1, le=3),  # От 1 до 3 часов
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать резервацию товара (reserved_by_user_id определяется из валидированного Telegram initData)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        reserved_by_user_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    print(f"DEBUG: create_reservation called - product_id={product_id}, reserved_by_user_id={reserved_by_user_id} (from initData), hours={hours}")
    
    # Получаем товар
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"ERROR: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
    print(f"DEBUG: Product found - name={product.name}, owner_id={product.user_id}")
    
    # Проверяем, что пользователь не пытается зарезервировать свой собственный товар
    if reserved_by_user_id == product.user_id:
        print(f"WARNING: User {reserved_by_user_id} tried to reserve their own product {product_id}")
        raise HTTPException(
            status_code=400, 
            detail="Вы не можете зарезервировать свой собственный товар"
        )
    
    # Вычисляем время окончания резервации
    reserved_until = datetime.utcnow() + timedelta(hours=hours)
    print(f"DEBUG: Reservation will be until {reserved_until}")
    
    # Сначала деактивируем истекшие резервации
    expired_reservations = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until <= datetime.utcnow()
        )
    ).all()
    
    for exp_res in expired_reservations:
        exp_res.is_active = False
        print(f"DEBUG: Deactivated expired reservation {exp_res.id}")
    
    db.commit()
    
    # Проверяем, не зарезервирован ли уже товар
    active_reservation = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).first()
    
    if active_reservation:
        # Проверяем, не пытается ли тот же пользователь зарезервировать снова
        if active_reservation.reserved_by_user_id == reserved_by_user_id:
            # Пользователь уже зарезервировал этот товар - обновляем время
            print(f"DEBUG: User {reserved_by_user_id} already reserved product {product_id}, updating time")
            active_reservation.reserved_until = reserved_until
            db.commit()
            db.refresh(active_reservation)
            
            # Отправляем уведомление об обновлении резервации
            if TELEGRAM_BOT_TOKEN and WEBAPP_URL and TELEGRAM_API_URL:
                try:
                    hours = (reserved_until - datetime.utcnow()).total_seconds() / 3600
                    hours_text = f"{int(hours)} ч."
                    if hours < 1:
                        minutes = int((reserved_until - datetime.utcnow()).total_seconds() / 60)
                        hours_text = f"{minutes} мин."
                    
                    message = f"🔄 **Резервация обновлена**\n\n"
                    message += f"📦 Товар: {product.name}\n"
                    message += f"⏰ Новая резервация до: {hours_text}"
                    
                    product_url = f"{WEBAPP_URL}?user_id={product.user_id}&product_id={product_id}"
                    keyboard = {
                        "inline_keyboard": [[
                            {
                                "text": "📦 Посмотреть товар",
                                "web_app": {"url": product_url}
                            }
                        ]]
                    }
                    
                    send_message_url = f"{TELEGRAM_API_URL}/sendMessage"
                    resp = requests.post(send_message_url, json={
                        "chat_id": product.user_id,
                        "text": message,
                        "reply_markup": keyboard,
                        "parse_mode": "Markdown"
                    }, timeout=10)
                    print(f"DEBUG: Update notification sent: status={resp.status_code}")
                except Exception as e:
                    print(f"ERROR: Exception sending update notification: {e}")
            
            return active_reservation
        else:
            # Другой пользователь уже зарезервировал
            time_left = (active_reservation.reserved_until - datetime.utcnow()).total_seconds() / 3600
            hours_left = int(time_left)
            minutes_left = int((time_left - hours_left) * 60)
            if hours_left > 0:
                time_text = f"{hours_left} ч. {minutes_left} мин."
            else:
                time_text = f"{minutes_left} мин."
            
            print(f"ERROR: Product {product_id} is already reserved by user {active_reservation.reserved_by_user_id} until {active_reservation.reserved_until}")
            raise HTTPException(
                status_code=400, 
                detail=f"Товар уже зарезервирован другим пользователем. Резервация истекает через {time_text}"
            )
    
    # Создаем резервацию
    
    print(f"DEBUG: Creating reservation - reserved_until={reserved_until}")
    
    reservation = models.Reservation(
        product_id=product_id,
        user_id=product.user_id,  # Владелец магазина
        reserved_by_user_id=reserved_by_user_id,
        reserved_until=reserved_until,
        is_active=True
    )
    
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    
    print(f"DEBUG: Reservation created successfully - id={reservation.id}, product_id={reservation.product_id}, reserved_until={reservation.reserved_until}")
    print(f"DEBUG: Notification check - TELEGRAM_BOT_TOKEN={'SET' if TELEGRAM_BOT_TOKEN else 'NOT SET'}, WEBAPP_URL={WEBAPP_URL}, TELEGRAM_API_URL={'SET' if TELEGRAM_API_URL else 'NOT SET'}")
    
    # Отправляем уведомление владельцу магазина через Telegram Bot API (в фоне)
    if TELEGRAM_BOT_TOKEN and WEBAPP_URL and TELEGRAM_API_URL:
        try:
            print(f"DEBUG: Getting user info for reserved_by_user_id={reserved_by_user_id}, product owner={product.user_id}")
            
            # Получаем информацию о пользователе, который зарезервировал
            # Используем getUserProfilePhotos или просто формируем имя из ID
            user_info_url = f"{TELEGRAM_API_URL}/getChat"
            reserved_by_name = "Пользователь"
            
            try:
                resp = requests.post(user_info_url, json={"chat_id": reserved_by_user_id}, timeout=5)
                print(f"DEBUG: getChat response: status={resp.status_code}, body={resp.text[:200]}")
                
                if resp.status_code == 200:
                    user_data = resp.json()
                    print(f"DEBUG: getChat result: {user_data}")
                    
                    if user_data.get("ok"):
                        user = user_data.get("result", {})
                        print(f"DEBUG: User data: {user}")
                        
                        # Проверяем, что это действительно тот пользователь, который зарезервировал
                        user_id_from_response = user.get("id")
                        if user_id_from_response and user_id_from_response == reserved_by_user_id:
                            reserved_by_name = user.get("first_name", "Пользователь")
                            if user.get("last_name"):
                                reserved_by_name += f" {user.get('last_name')}"
                            if user.get("username"):
                                reserved_by_name += f" (@{user.get('username')})"
                            print(f"DEBUG: Reserved by name: {reserved_by_name}")
                        else:
                            print(f"WARNING: User ID mismatch! Expected {reserved_by_user_id}, got {user_id_from_response}")
                            reserved_by_name = f"Пользователь (ID: {reserved_by_user_id})"
                    else:
                        print(f"WARNING: getChat returned not ok: {user_data.get('description', 'Unknown error')}")
                        reserved_by_name = f"Пользователь (ID: {reserved_by_user_id})"
                else:
                    print(f"WARNING: getChat failed with status {resp.status_code}")
                    reserved_by_name = f"Пользователь (ID: {reserved_by_user_id})"
            except Exception as e:
                print(f"ERROR: Exception getting user info: {e}")
                import traceback
                traceback.print_exc()
                reserved_by_name = f"Пользователь (ID: {reserved_by_user_id})"
            
            # Формируем время резервации
            hours = (reserved_until - datetime.utcnow()).total_seconds() / 3600
            hours_text = f"{int(hours)} ч."
            if hours < 1:
                minutes = int((reserved_until - datetime.utcnow()).total_seconds() / 60)
                hours_text = f"{minutes} мин."
            
            # Формируем имя пользователя со ссылкой на профиль
            # Используем формат Markdown: [текст](tg://user?id=USER_ID)
            if reserved_by_user_id:
                user_link = f"[{reserved_by_name}](tg://user?id={reserved_by_user_id})"
            else:
                user_link = reserved_by_name
            
            # Формируем сообщение
            message = f"🔔 **Новая резервация товара**\n\n"
            message += f"📦 Товар: {product.name}\n"
            message += f"👤 Зарезервировал: {user_link}\n"
            message += f"⏰ Резервация до: {hours_text}\n\n"
            message += f"💡 Товар временно недоступен для других покупателей."
            
            # Создаем кнопку для просмотра товара
            product_url = f"{WEBAPP_URL}?user_id={product.user_id}&product_id={product_id}"
            
            keyboard = {
                "inline_keyboard": [[
                    {
                        "text": "📦 Посмотреть товар",
                        "web_app": {"url": product_url}
                    }
                ]]
            }
            
            # Отправляем уведомление
            send_message_url = f"{TELEGRAM_API_URL}/sendMessage"
            print(f"DEBUG: Sending notification to user {product.user_id}, URL: {send_message_url}")
            print(f"DEBUG: Message: {message[:100]}...")
            print(f"DEBUG: Keyboard: {keyboard}")
            
            try:
                resp = requests.post(send_message_url, json={
                    "chat_id": product.user_id,
                    "text": message,
                    "reply_markup": keyboard,
                    "parse_mode": "Markdown"
                }, timeout=10)
                
                print(f"DEBUG: Notification response: status={resp.status_code}, body={resp.text[:500]}")
                
                if resp.status_code == 200:
                    result = resp.json()
                    if result.get("ok"):
                        print(f"✅ Reservation notification sent successfully to user {product.user_id}")
                    else:
                        print(f"❌ Telegram API error: {result.get('description', 'Unknown error')}")
                        print(f"Full response: {result}")
                else:
                    error_text = resp.text
                    print(f"❌ Failed to send notification (status {resp.status_code}): {error_text}")
            except Exception as e:
                print(f"❌ Exception while sending notification: {e}")
                import traceback
                traceback.print_exc()
        except Exception as e:
            print(f"ERROR: Exception sending notification: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"WARNING: Cannot send notification - TELEGRAM_BOT_TOKEN={bool(TELEGRAM_BOT_TOKEN)}, WEBAPP_URL={bool(WEBAPP_URL)}, TELEGRAM_API_URL={bool(TELEGRAM_API_URL)}")
    
    # Возвращаем резервацию (Pydantic автоматически сериализует)
    return reservation

@router.get("/product/{product_id}", response_model=Optional[schemas.Reservation])
def get_product_reservation(
    product_id: int,
    db: Session = Depends(database.get_db)
):
    """Получить активную резервацию товара"""
    reservation = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).first()
    
    return reservation

@router.delete("/{reservation_id}")
def cancel_reservation(
    reservation_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Отменить резервацию (user_id определяется из валидированного Telegram initData)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        user_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    reservation = db.query(models.Reservation).filter(
        and_(
            models.Reservation.id == reservation_id,
            models.Reservation.is_active == True
        )
    ).first()
    
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    # Проверяем, что пользователь имеет право отменить резервацию
    # 1. Владелец магазина (user_id) - может снять резервацию только со СВОИХ товаров
    # 2. Тот, кто зарезервировал (reserved_by_user_id) - может снять только СВОЮ резервацию
    
    # Получаем товар для проверки владельца
    product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    is_product_owner = product.user_id == user_id  # Владелец товара
    is_reserver = reservation.reserved_by_user_id == user_id  # Тот, кто зарезервировал
    
    print(f"DEBUG: Permission check for cancel reservation:")
    print(f"  - Reservation ID: {reservation_id}")
    print(f"  - Product ID: {reservation.product_id}")
    print(f"  - Product owner (user_id): {product.user_id}")
    print(f"  - Reservation owner (reservation.user_id): {reservation.user_id}")
    print(f"  - Reserved by (reserved_by_user_id): {reservation.reserved_by_user_id}")
    print(f"  - Current user (user_id): {user_id}")
    print(f"  - Is product owner: {is_product_owner}")
    print(f"  - Is reserver: {is_reserver}")
    
    if not is_product_owner and not is_reserver:
        print(f"ERROR: User {user_id} tried to cancel reservation {reservation_id} without permission")
        raise HTTPException(
            status_code=403, 
            detail="У вас нет прав для отмены этой резервации. Только владелец магазина может снять резервацию со своих товаров, или тот, кто зарезервировал товар, может снять свою резервацию."
        )
    
    print(f"DEBUG: Canceling reservation {reservation_id} by user {user_id} (owner={reservation.user_id}, reserved_by={reservation.reserved_by_user_id})")
    
    reservation.is_active = False
    db.commit()
    
    print(f"DEBUG: Reservation {reservation_id} cancelled successfully")
    
    return {"message": "Reservation cancelled"}

@router.get("/user/me", response_model=List[schemas.Reservation])
def get_user_reservations(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все резервации текущего пользователя (user_id определяется из валидированного Telegram initData)
    
    Возвращает резервации где пользователь:
    - владелец магазина (user_id) - для уведомлений
    - резервирующий (reserved_by_user_id) - для корзины
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        user_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    print(f"🛒 ========== get_user_reservations START ==========")
    print(f"🛒 Requested user_id: {user_id} (type: {type(user_id)})")
    
    # Получаем резервации, где пользователь - владелец магазина (уведомления)
    # ИЛИ пользователь - тот, кто зарезервировал (корзина)
    # Backend уже фильтрует по is_active и reserved_until
    reservations = db.query(models.Reservation).filter(
        and_(
            or_(
                models.Reservation.user_id == user_id,  # Владелец магазина
                models.Reservation.reserved_by_user_id == user_id  # Тот, кто зарезервировал
            ),
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).order_by(models.Reservation.created_at.desc()).all()
    
    print(f"🛒 Found {len(reservations)} total active reservations")
    print(f"🛒 ========== get_user_reservations END ==========")
    
    return reservations

@router.get("/cart", response_model=List[schemas.Reservation])
def get_cart_reservations(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить резервации для корзины (только те, где текущий пользователь - резервирующий)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        user_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем только резервации, где текущий пользователь - резервирующий
    # Backend уже фильтрует по is_active и reserved_until
    reservations = db.query(models.Reservation).filter(
        and_(
            models.Reservation.reserved_by_user_id == user_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).order_by(models.Reservation.created_at.desc()).all()
    
    return reservations

# Временная поддержка старого endpoint для обратной совместимости
@router.get("/user/{user_id}", response_model=List[schemas.Reservation])
def get_user_reservations_legacy(
    user_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """LEGACY: Получить резервации пользователя (используйте /user/me или /cart вместо этого)"""
    print(f"⚠️ LEGACY endpoint /user/{user_id} called - рекомендуется использовать /user/me или /cart")
    
    # Если есть initData, используем его для валидации
    if x_telegram_init_data and TELEGRAM_BOT_TOKEN:
        try:
            validated_user_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
            # Проверяем, что запрашиваемый user_id совпадает с валидированным
            if validated_user_id != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only access your own reservations"
                )
        except HTTPException:
            raise
        except Exception:
            # Если валидация не прошла, продолжаем без проверки (для обратной совместимости)
            pass
    
    # Возвращаем резервации как раньше
    reservations = db.query(models.Reservation).filter(
        and_(
            or_(
                models.Reservation.user_id == user_id,
                models.Reservation.reserved_by_user_id == user_id
            ),
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).order_by(models.Reservation.created_at.desc()).all()
    
    return reservations

