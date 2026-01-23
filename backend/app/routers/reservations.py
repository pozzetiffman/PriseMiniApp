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
from ..utils.telegram_auth import get_user_id_from_init_data, validate_init_data_multi_bot
from ..utils.product_snapshot import create_product_snapshot, get_product_display_info_from_snapshot
from ..utils.products_utils import make_full_url
import json

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token для отправки уведомлений
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

router = APIRouter(prefix="/api/reservations", tags=["reservations"])

def get_product_price_from_dict(product_dict: dict) -> Optional[float]:
    """
    Получить правильную цену товара из словаря (например, из snapshot).
    Использует ту же логику, что и для обычных товаров.
    
    ВАЖНО: product_dict["price"] должна быть ОРИГИНАЛЬНОЙ ценой БЕЗ скидки.
    Скидка применяется только здесь один раз.
    """
    is_for_sale = product_dict.get("is_for_sale", False)
    
    if is_for_sale:
        price_type = product_dict.get("price_type", "range")
        if price_type == 'fixed' and product_dict.get("price_fixed") is not None:
            return product_dict.get("price_fixed")
        elif price_type == 'range' and product_dict.get("price_from") is not None:
            return product_dict.get("price_from")
        elif price_type == 'range' and product_dict.get("price_to") is not None:
            return product_dict.get("price_to")
        # Если нет цены для продажи, возвращаем обычную цену (может быть None)
        price = product_dict.get("price")
        if price is None:
            return None
        # Для товаров "на продажу" без указания цены для продажи, применяем скидку к обычной цене
        discount = product_dict.get("discount", 0)
        if discount and discount > 0:
            return round(price * (1 - discount / 100), 2)
        return price
    else:
        # Обычный товар - применяем скидку к цене
        price = product_dict.get("price")
        if price is None:
            return None
        discount = product_dict.get("discount", 0)
        if discount and discount > 0:
            return round(price * (1 - discount / 100), 2)
        return price

def get_bot_token_for_notifications(shop_owner_id: int, db: Session) -> str:
    """
    Получает токен бота для отправки уведомлений.
    Если у владельца магазина есть подключенный бот, использует его токен.
    Иначе использует токен основного бота.
    
    Args:
        shop_owner_id: ID владельца магазина
        db: Сессия базы данных
        
    Returns:
        Токен бота для отправки уведомлений
    """
    # Ищем подключенного бота для этого владельца магазина
    connected_bot = db.query(models.Bot).filter(
        models.Bot.owner_user_id == shop_owner_id,
        models.Bot.is_active == True
    ).first()
    
    if connected_bot and connected_bot.bot_token:
        print(f"✅ Using connected bot token for user {shop_owner_id} (bot_id={connected_bot.id})")
        return connected_bot.bot_token
    
    # Если подключенного бота нет, используем основной токен
    print(f"ℹ️ No connected bot found for user {shop_owner_id}, using main bot token")
    return TELEGRAM_BOT_TOKEN

@router.post("/", response_model=schemas.Reservation)
async def create_reservation(
    product_id: int = Query(...),
    hours: int = Query(..., ge=1, le=3),  # От 1 до 3 часов
    quantity: int = Query(1, ge=1),  # Количество для резервации (по умолчанию 1)
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать резервацию товара (reserved_by_user_id определяется из валидированного Telegram initData)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        # Используем функцию для валидации с любым ботом
        reserved_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    print(f"DEBUG: create_reservation called - product_id={product_id}, reserved_by_user_id={reserved_by_user_id} (from initData), hours={hours}, quantity={quantity}")
    
    # Получаем товар
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"ERROR: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
    print(f"DEBUG: Product found - name={product.name}, owner_id={product.user_id}, quantity={product.quantity}")
    
    # Проверяем настройки магазина - включена ли резервация
    shop_settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == product.user_id
    ).first()
    
    # Если настройки не существуют, создаем с дефолтными значениями (резервация включена)
    if not shop_settings:
        shop_settings = models.ShopSettings(
            user_id=product.user_id,
            reservations_enabled=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(shop_settings)
        db.commit()
    
    # Проверяем, включена ли резервация для этого магазина
    if not shop_settings.reservations_enabled:
        print(f"WARNING: Reservations are disabled for shop owner {product.user_id}")
        raise HTTPException(
            status_code=400,
            detail="Резервация товаров отключена владельцем магазина"
        )
    
    # Проверяем, не является ли товар под заказ (товары под заказ нельзя резервировать)
    if getattr(product, 'is_made_to_order', False):
        print(f"WARNING: Product {product_id} is made-to-order, cannot be reserved")
        raise HTTPException(
            status_code=400,
            detail="Товары под заказ нельзя резервировать"
        )
    
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
    
    # Проверяем, не резервировал ли этот пользователь этот товар в последние 3 часа
    # Но только если у него есть активная резервация ИЛИ если прошло меньше 3 часов с момента создания последней резервации
    three_hours_ago = datetime.utcnow() - timedelta(hours=3)
    print(f"DEBUG: Checking 3-hour restriction for user {reserved_by_user_id}, product {product_id}")
    
    # Сначала проверяем, есть ли активная резервация от этого пользователя
    active_user_reservation = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product_id,
            models.Reservation.reserved_by_user_id == reserved_by_user_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).first()
    
    print(f"DEBUG: Active user reservation check: {active_user_reservation is not None}")
    
    if active_user_reservation:
        # Пользователь уже имеет активную резервацию этого товара
        time_left = (active_user_reservation.reserved_until - datetime.utcnow()).total_seconds() / 3600
        hours_left = int(time_left)
        minutes_left = int((time_left - hours_left) * 60)
        if hours_left > 0:
            time_text = f"{hours_left} ч. {minutes_left} мин."
        else:
            time_text = f"{minutes_left} мин."
        
        print(f"ERROR: User {reserved_by_user_id} already has active reservation for product {product_id}")
        raise HTTPException(
            status_code=400,
            detail=f"Вы уже зарезервировали этот товар. Резервация истекает через {time_text}. Повторная резервация доступна через 3 часа после создания предыдущей."
        )
    
    # Проверяем, не создавал ли этот пользователь резервацию этого товара в последние 3 часа
    recent_reservation = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product_id,
            models.Reservation.reserved_by_user_id == reserved_by_user_id,
            models.Reservation.created_at >= three_hours_ago
        )
    ).order_by(models.Reservation.created_at.desc()).first()
    
    print(f"DEBUG: Recent reservation check (3h): {recent_reservation is not None}")
    if recent_reservation:
        print(f"DEBUG: Recent reservation found - created_at: {recent_reservation.created_at}, is_active: {recent_reservation.is_active}, reserved_until: {recent_reservation.reserved_until}")
    
    if recent_reservation:
        # Резервация была создана менее 3 часов назад
        time_since_creation = (datetime.utcnow() - recent_reservation.created_at).total_seconds() / 3600
        hours_remaining = 3 - time_since_creation
        if hours_remaining > 0:
            hours_text = f"{int(hours_remaining)} ч."
            minutes_remaining = int((hours_remaining - int(hours_remaining)) * 60)
            if minutes_remaining > 0:
                hours_text = f"{int(hours_remaining)} ч. {minutes_remaining} мин."
            
            print(f"ERROR: User {reserved_by_user_id} reserved product {product_id} less than 3 hours ago (created at {recent_reservation.created_at})")
            raise HTTPException(
                status_code=400,
                detail=f"Вы не можете зарезервировать этот товар повторно. Подождите еще {hours_text}."
            )
    
    # Подсчитываем количество активных резерваций для этого товара (от всех пользователей)
    print(f"DEBUG: Checking active reservations for product {product_id} (all users)")
    active_reservations = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).all()
    
    active_reservations_count = len(active_reservations)
    
    # Логируем информацию о резервациях
    print(f"DEBUG: Active reservations count: {active_reservations_count}, Product quantity: {product.quantity}")
    if active_reservations:
        reserved_by_users = [r.reserved_by_user_id for r in active_reservations]
        print(f"DEBUG: Active reservations by users: {reserved_by_users}")
        print(f"DEBUG: Current user {reserved_by_user_id} trying to reserve - will be allowed if count < quantity")
    else:
        print(f"DEBUG: No active reservations found, allowing reservation")
    
    # Проверяем, не превышает ли количество активных резерваций quantity товара
    # Если quantity = 0, то резервация недоступна (товар закончился)
    if product.quantity <= 0:
        print(f"ERROR: Product {product_id} has quantity 0 or less")
        raise HTTPException(
            status_code=400,
            detail="Товар закончился. Резервация недоступна."
        )
    
    # Проверяем, что запрашиваемое количество не превышает доступное
    available_quantity = product.quantity - active_reservations_count
    if available_quantity <= 0:
        print(f"ERROR: Product {product_id} is fully reserved. Active: {active_reservations_count}, Quantity: {product.quantity}")
        raise HTTPException(
            status_code=400,
            detail=f"Все товары ({product.quantity} шт.) уже зарезервированы. Резервация недоступна."
        )
    
    # Проверяем, что запрашиваемое количество не превышает доступное
    if quantity > available_quantity:
        print(f"ERROR: Requested quantity {quantity} exceeds available {available_quantity} for product {product_id}")
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно товара для резервации. Доступно: {available_quantity} шт., запрошено: {quantity} шт."
        )
    
    # Все проверки пройдены, создаем резервацию
    print(f"DEBUG: All checks passed! Creating reservation for user {reserved_by_user_id}, product {product_id}, quantity={quantity}")
    print(f"DEBUG: Creating reservation - reserved_until={reserved_until}, quantity={quantity}")
    
    # КРИТИЧНО: Создаем snapshot товара на момент резервации для изоляции данных
    # Это гарантирует, что товар останется доступным в корзине даже если админ удалит или изменит его
    snapshot_id = create_product_snapshot(
        db=db,
        product=product,
        user_id=reserved_by_user_id,
        operation_type='reservation'
    )
    print(f"📸 Created snapshot {snapshot_id} for reservation of product {product.id}")
    
    # Создаем резервации
    # ВСЕГДА создаем резервации только для выбранного товара (product_id) в количестве quantity
    # Не создаем резервации для всех синхронизированных продуктов, так как пользователь выбрал конкретный товар
    created_reservations = []
    
    # Создаем quantity резерваций только для выбранного товара
    for i in range(quantity):
        reservation = models.Reservation(
            product_id=product.id,  # Используем выбранный товар
            user_id=product.user_id,
            reserved_by_user_id=reserved_by_user_id,
            reserved_until=reserved_until,
            is_active=True,
            snapshot_id=snapshot_id  # Связываем с snapshot для изоляции данных товара
        )
        db.add(reservation)
        created_reservations.append(reservation)
        print(f"DEBUG: Created reservation {i+1}/{quantity} for product_id={product.id} (bot_id={product.bot_id}) with snapshot_id={snapshot_id}")
    
    db.commit()
    for res in created_reservations:
        db.refresh(res)
    
    # Используем первую резервацию для возврата (оригинальный товар)
    reservation = created_reservations[0] if created_reservations else None
    
    print(f"DEBUG: Reservation created successfully - {len(created_reservations)} reservations for product_id={product.id}, main reservation_id={reservation.id if reservation else None}, reserved_until={reserved_until}")
    print(f"DEBUG: Notification check - TELEGRAM_BOT_TOKEN={'SET' if TELEGRAM_BOT_TOKEN else 'NOT SET'}, WEBAPP_URL={WEBAPP_URL}")
    
    # Отправляем уведомление владельцу магазина через Telegram Bot API (в фоне)
    # Используем токен подключенного бота админа, если он есть
    bot_token_for_notifications = get_bot_token_for_notifications(product.user_id, db)
    bot_api_url = f"https://api.telegram.org/bot{bot_token_for_notifications}"
    
    if bot_token_for_notifications and WEBAPP_URL:
        try:
            print(f"DEBUG: Getting user info for reserved_by_user_id={reserved_by_user_id}, product owner={product.user_id}")
            
            # Получаем информацию о пользователе, который зарезервировал
            # Используем getUserProfilePhotos или просто формируем имя из ID
            user_info_url = f"{bot_api_url}/getChat"
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
            except requests.exceptions.Timeout:
                print(f"⚠️ Timeout getting user info for user {reserved_by_user_id} (Telegram API timeout)")
                reserved_by_name = f"Пользователь (ID: {reserved_by_user_id})"
            except requests.exceptions.ConnectionError as e:
                print(f"⚠️ Connection error getting user info for user {reserved_by_user_id}: {str(e)[:100]}")
                reserved_by_name = f"Пользователь (ID: {reserved_by_user_id})"
            except Exception as e:
                print(f"⚠️ Error getting user info for user {reserved_by_user_id}: {type(e).__name__}: {str(e)[:100]}")
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
            quantity_text = f" ({quantity} шт.)" if quantity > 1 else ""
            message = f"🔔 **Новая резервация товара**\n\n"
            message += f"📦 Товар: {product.name}{quantity_text}\n"
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
            send_message_url = f"{bot_api_url}/sendMessage"
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
        print(f"WARNING: Cannot send notification - bot_token={bool(bot_token_for_notifications)}, WEBAPP_URL={bool(WEBAPP_URL)}")
    
    # Возвращаем резервацию (Pydantic автоматически сериализует)
    return reservation

@router.get("/product/{product_id}", response_model=Optional[schemas.Reservation])
def get_product_reservation(
    product_id: int,
    db: Session = Depends(database.get_db)
):
    """Получить активную резервацию товара (проверяет все синхронизированные копии)"""
    # Получаем товар
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        return None
    
    # Проверяем резервацию для этого товара И для всех синхронизированных копий (по имени и цене)
    reservation = db.query(models.Reservation).join(
        models.Product, models.Reservation.product_id == models.Product.id
    ).filter(
        and_(
            models.Product.user_id == product.user_id,
            models.Product.name == product.name,
            models.Product.price == product.price,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).first()
    
    return reservation

@router.delete("/{reservation_id}")
async def cancel_reservation(
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
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
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
    
    # Отменяем резервацию для всех синхронизированных копий товара
    # Находим товар, для которого создана резервация
    original_product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()
    if original_product:
        # Находим все синхронизированные копии товара (по имени и цене)
        synced_products = db.query(models.Product).filter(
            models.Product.user_id == original_product.user_id,
            models.Product.name == original_product.name,
            models.Product.price == original_product.price
        ).all()
        
        # Отменяем все резервации для всех синхронизированных копий товара
        # с тем же reserved_by_user_id и reserved_until
        canceled_count = db.query(models.Reservation).filter(
            and_(
                models.Reservation.product_id.in_([p.id for p in synced_products]),
                models.Reservation.reserved_by_user_id == reservation.reserved_by_user_id,
                models.Reservation.reserved_until == reservation.reserved_until,
                models.Reservation.is_active == True
            )
        ).update({"is_active": False}, synchronize_session=False)
        
        print(f"DEBUG: Canceled {canceled_count} reservations for synced products (name='{original_product.name}', price={original_product.price})")
    else:
        # Если товар не найден, отменяем только эту резервацию
        reservation.is_active = False
        canceled_count = 1
        print(f"DEBUG: Original product not found, canceling only reservation {reservation_id}")
    
    db.commit()
    
    print(f"DEBUG: Reservation {reservation_id} canceled successfully (total: {canceled_count} reservations)")
    
    return {"message": "Reservation cancelled"}

@router.get("/user/me", response_model=List[schemas.Reservation])
async def get_user_reservations(
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
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
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
    
    print(f"🛒 Found {len(reservations)} reservations before product validation")
    for res in reservations:
        product = db.query(models.Product).filter(models.Product.id == res.product_id).first()
        product_owner = product.user_id if product else None
        print(f"🛒 Reservation {res.id}: user_id={res.user_id}, reserved_by_user_id={res.reserved_by_user_id}, product_id={res.product_id}, product_owner={product_owner}")
    
    # Фильтруем резервации, у которых товар существует (товар мог быть удален)
    valid_reservations = []
    for reservation in reservations:
        product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()
        if product:
            valid_reservations.append(reservation)
        else:
            # Товар был удален, деактивируем резервацию
            reservation.is_active = False
            db.commit()
            print(f"⚠️ Deactivated reservation {reservation.id} - product {reservation.product_id} not found")
    
    print(f"🛒 Found {len(valid_reservations)} valid active reservations (filtered {len(reservations) - len(valid_reservations)} with deleted products)")
    
    # Логируем детали каждой резервации для отладки
    for res in valid_reservations:
        print(f"🛒 Reservation {res.id}: user_id={res.user_id} (type: {type(res.user_id)}), product_id={res.product_id}, reserved_by_user_id={res.reserved_by_user_id}, is_active={res.is_active}, reserved_until={res.reserved_until}")
        print(f"🛒 Reservation {res.id}: reserved_until type={type(res.reserved_until)}, value={res.reserved_until}, now={datetime.utcnow()}, is_future={res.reserved_until > datetime.utcnow() if res.reserved_until else False}")
    
    print(f"🛒 ========== get_user_reservations END ==========")
    
    # Логируем сериализованные данные для отладки (что именно отправляется на фронтенд)
    import json
    try:
        serialized = [schemas.Reservation.model_validate(res).model_dump(mode='json') for res in valid_reservations]
        print(f"🛒 [BACKEND] Serialized reservations count: {len(serialized)}")
        for idx, ser_res in enumerate(serialized):
            print(f"🛒 [BACKEND] Reservation {idx+1}: id={ser_res.get('id')}, user_id={ser_res.get('user_id')} (type: {type(ser_res.get('user_id'))}), is_active={ser_res.get('is_active')} (type: {type(ser_res.get('is_active'))}), reserved_until={ser_res.get('reserved_until')} (type: {type(ser_res.get('reserved_until'))})")
        print(f"🛒 [BACKEND] Full JSON response: {json.dumps(serialized, default=str, indent=2)}")
    except Exception as e:
        print(f"⚠️ Error serializing reservations: {e}")
        import traceback
        traceback.print_exc()
    
    return valid_reservations

@router.get("/cart")
async def get_cart_reservations(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить резервации для корзины (только те, где текущий пользователь - резервирующий)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
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
    
    # Получаем только резервации, где текущий пользователь - резервирующий
    # Backend уже фильтрует по is_active и reserved_until
    reservations = db.query(models.Reservation).filter(
        and_(
            models.Reservation.reserved_by_user_id == user_id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).order_by(models.Reservation.created_at.desc()).all()
    
    print(f"🔍 [CART DEBUG] After filtering (is_active=True, reserved_until > now): {len(reservations)} reservations")
    
    # Фильтруем резервации и используем snapshot для изоляции данных товара
    # Группируем по sync_product_id, чтобы не показывать дубликаты синхронизированных товаров
    valid_reservations = []
    seen_sync_ids = set()  # Для отслеживания уже добавленных товаров по sync_product_id
    
    for reservation in reservations:
        # КРИТИЧНО: Используем snapshot если он есть - для изоляции данных товара на момент резервации
        # Это гарантирует, что товар останется доступным в корзине даже если админ удалит или изменит его
        has_valid_product = False
        product_info = None
        
        if reservation.snapshot_id:
            # Используем snapshot для изоляции данных товара
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == reservation.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info:
                    # Вычисляем правильную цену используя ту же логику, что и для существующих товаров
                    calculated_price = get_product_price_from_dict(product_info)
                    product_info["price"] = calculated_price
                    # ВАЖНО: Обнуляем discount, так как цена уже вычислена со скидкой
                    product_info["discount"] = 0
                    # ВАЖНО: Для резерваций товар доступен (он был зарезервирован, когда был доступен)
                    product_info["is_unavailable"] = False
                    # Преобразуем images_urls в полные URL
                    if product_info.get("images_urls"):
                        product_info["images_urls"] = [make_full_url(img_url) for img_url in product_info["images_urls"]]
                    if product_info.get("image_url"):
                        product_info["image_url"] = make_full_url(product_info["image_url"])
                    has_valid_product = True
                    # Используем product_id из snapshot для группировки
                    sync_id = product_info.get("id") or reservation.product_id
        else:
            # Fallback: используем актуальный товар (для обратной совместимости со старыми резервациями)
            # Проверяем, что product_id не None
            if reservation.product_id is None:
                has_valid_product = False
            else:
                product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()
                if product:
                    sync_id = product.sync_product_id or product.id
                    has_valid_product = True
                    # Формируем product_info из актуального товара для frontend
                    images_urls_list = None
                    if product.images_urls:
                        try:
                            images_urls_list = json.loads(product.images_urls) if isinstance(product.images_urls, str) else product.images_urls
                        except (json.JSONDecodeError, TypeError):
                            images_urls_list = []
                    
                    calculated_price = get_product_price_from_dict({
                        "price": product.price,
                        "discount": product.discount or 0,
                        "is_for_sale": product.is_for_sale or False,
                        "price_type": product.price_type or 'range',
                        "price_fixed": product.price_fixed,
                        "price_from": product.price_from,
                        "price_to": product.price_to
                    })
                    
                    product_info = {
                        "id": product.id,
                        "name": product.name,
                        "description": product.description,
                        "price": calculated_price,
                        "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                        "image_url": make_full_url(product.image_url) if product.image_url else None,
                        "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                        "is_unavailable": False
                    }
        
        if has_valid_product:
            # Если это первый раз, когда мы видим этот sync_product_id, добавляем резервацию
            if sync_id not in seen_sync_ids:
                # Добавляем данные товара из snapshot в резервацию (для frontend)
                reservation_dict = schemas.Reservation.model_validate(reservation).model_dump(mode='json')
                if product_info:
                    reservation_dict['product'] = product_info
                    print(f"✅ Added reservation {reservation.id} with snapshot_id={reservation.snapshot_id}, product_name={product_info.get('name')} to cart")
                else:
                    print(f"⚠️ Added reservation {reservation.id} but product_info is None")
                valid_reservations.append(reservation_dict)
                seen_sync_ids.add(sync_id)
            else:
                # Это дубликат синхронизированного товара - пропускаем
                print(f"⏭️ Skipped duplicate reservation {reservation.id} (sync_id={sync_id} already in cart)")
        else:
            # Товар был удален и snapshot недоступен, деактивируем резервацию
            reservation.is_active = False
            db.commit()
            print(f"⚠️ Deactivated reservation {reservation.id} - product {reservation.product_id} not found and snapshot unavailable")
    
    print(f"📦 Cart: {len(valid_reservations)} unique products (from {len(reservations)} total reservations)")
    
    return valid_reservations

@router.get("/history", response_model=List[schemas.Reservation])
async def get_reservations_history(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить историю резерваций пользователя (только завершенные и отмененные, неактивные)"""
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
    
    # Получаем только неактивные резервации пользователя (история = завершенные и отмененные)
    # Активные резервации показываются в разделе "Активные", а не в истории
    reservations = db.query(models.Reservation).filter(
        and_(
            models.Reservation.reserved_by_user_id == user_id,
            models.Reservation.is_active == False  # Только неактивные (история)
        )
    ).order_by(models.Reservation.created_at.desc()).all()
    
    # Фильтруем резервации, у которых товар существует
    valid_reservations = []
    for reservation in reservations:
        product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()
        if product:
            valid_reservations.append(reservation)
    
    return valid_reservations

@router.delete("/history/clear")
async def clear_reservations_history(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Очистить всю историю резерваций пользователя (удалить все неактивные резервации)"""
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
    
    # Удаляем все неактивные резервации пользователя (история)
    deleted_count = db.query(models.Reservation).filter(
        and_(
            models.Reservation.reserved_by_user_id == user_id,
            models.Reservation.is_active == False
        )
    ).delete(synchronize_session=False)
    
    db.commit()
    
    return {"message": f"Удалено {deleted_count} записей из истории резерваций", "deleted_count": deleted_count}

# Временная поддержка старого endpoint для обратной совместимости
@router.get("/user/{user_id}", response_model=List[schemas.Reservation])
async def get_user_reservations_legacy(
    user_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """LEGACY: Получить резервации пользователя (используйте /user/me или /cart вместо этого)"""
    print(f"⚠️ LEGACY endpoint /user/{user_id} called - рекомендуется использовать /user/me или /cart")
    
    # Если есть initData, используем его для валидации
    if x_telegram_init_data and TELEGRAM_BOT_TOKEN:
        try:
            validated_user_id, _, _ = await validate_init_data_multi_bot(
                x_telegram_init_data,
                db,
                default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
            )
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
    
    # Фильтруем резервации, у которых товар существует (товар мог быть удален)
    valid_reservations = []
    for reservation in reservations:
        product = db.query(models.Product).filter(models.Product.id == reservation.product_id).first()
        if product:
            valid_reservations.append(reservation)
        else:
            # Товар был удален, деактивируем резервацию
            reservation.is_active = False
            db.commit()
            print(f"⚠️ Deactivated reservation {reservation.id} - product {reservation.product_id} not found")
    
    return valid_reservations

