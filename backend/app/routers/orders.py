import os
import json
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime
from dotenv import load_dotenv
from ..db import models, database
from ..models import order as schemas
from ..utils.telegram_auth import get_user_id_from_init_data, validate_init_data_multi_bot
from ..utils.product_snapshot import create_product_snapshot, get_product_display_info_from_snapshot
from ..utils.products_utils import make_full_url

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
        # Обычная цена со скидкой
        # ВАЖНО: price должна быть оригинальной ценой БЕЗ скидки
        price = product_dict.get("price")
        if price is None:
            return None  # Цена по запросу
        discount = product_dict.get("discount", 0)
        
        if discount and discount > 0:
            # Вычисляем цену со скидкой: оригинальная_цена * (1 - скидка%)
            final_price = round(price * (1 - discount / 100), 2)
            print(f"   💰 Price calculation from snapshot: original={price}, discount={discount}%, final={final_price}")
            return final_price
        return price

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token для отправки уведомлений
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

router = APIRouter(prefix="/api/orders", tags=["orders"])

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

@router.post("/", response_model=schemas.Order)
async def create_order(
    order_data: Optional[schemas.OrderCreate] = Body(None),
    product_id: Optional[int] = Query(None),
    quantity: Optional[int] = Query(None, ge=1),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать заказ товара (ordered_by_user_id определяется из валидированного Telegram initData)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        ordered_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Поддерживаем старый формат (query параметры) и новый формат (body)
    if order_data and order_data.product_id:
        # Новый формат: данные из формы
        product_id = order_data.product_id
        quantity = order_data.quantity
        promo_code = order_data.promo_code
        first_name = order_data.first_name
        last_name = order_data.last_name
        middle_name = order_data.middle_name
        phone_country_code = order_data.phone_country_code
        phone_number = order_data.phone_number
        email = order_data.email
        notes = order_data.notes
        delivery_method = order_data.delivery_method
    else:
        # Старый формат: query параметры
        if not product_id or not quantity:
            raise HTTPException(status_code=400, detail="product_id and quantity are required")
        promo_code = None
        first_name = None
        last_name = None
        middle_name = None
        phone_country_code = None
        phone_number = None
        email = None
        notes = None
        delivery_method = None
    
    print(f"DEBUG: create_order called - product_id={product_id}, ordered_by_user_id={ordered_by_user_id}, quantity={quantity}")
    
    # Получаем товар
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"ERROR: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, что товар под заказ
    if not getattr(product, 'is_made_to_order', False):
        print(f"WARNING: Product {product_id} is not made-to-order")
        raise HTTPException(
            status_code=400,
            detail="Этот товар не под заказ"
        )
    
    # Проверяем, что пользователь не пытается заказать свой собственный товар
    if ordered_by_user_id == product.user_id:
        print(f"WARNING: User {ordered_by_user_id} tried to order their own product {product_id}")
        raise HTTPException(
            status_code=400, 
            detail="Вы не можете заказать свой собственный товар"
        )
    
    # Создаем snapshot товара на момент операции
    snapshot_id = create_product_snapshot(
        db=db,
        product=product,
        user_id=ordered_by_user_id,
        operation_type='order'
    )
    
    # Создаем заказ
    order = models.Order(
        product_id=product_id,
        snapshot_id=snapshot_id,
        user_id=product.user_id,  # Владелец магазина
        ordered_by_user_id=ordered_by_user_id,
        quantity=quantity,
        is_completed=False,
        is_cancelled=False,
        promo_code=promo_code,
        first_name=first_name,
        last_name=last_name,
        middle_name=middle_name,
        phone_country_code=phone_country_code,
        phone_number=phone_number,
        email=email,
        notes=notes,
        delivery_method=delivery_method,
        status='pending'
    )
    
    db.add(order)
    db.commit()
    db.refresh(order)
    
    # Загружаем product для возврата в ответе
    db.refresh(order, ['product'])
    
    # Преобразуем images_urls из JSON строки в список, если product загружен
    if order.product and order.product.images_urls:
        if isinstance(order.product.images_urls, str):
            try:
                order.product.images_urls = json.loads(order.product.images_urls)
            except (json.JSONDecodeError, TypeError):
                order.product.images_urls = []
    
    print(f"DEBUG: Order created successfully - id={order.id}, product_id={order.product_id}")
    
    # Отправляем уведомление владельцу магазина через Telegram Bot API
    # Используем токен подключенного бота админа, если он есть
    bot_token_for_notifications = get_bot_token_for_notifications(product.user_id, db)
    bot_api_url = f"https://api.telegram.org/bot{bot_token_for_notifications}"
    
    if bot_token_for_notifications and WEBAPP_URL:
        try:
            print(f"DEBUG: Getting user info for ordered_by_user_id={ordered_by_user_id}, product owner={product.user_id}")
            
            # Получаем информацию о пользователе, который заказал
            user_info_url = f"{bot_api_url}/getChat"
            ordered_by_name = "Пользователь"
            
            try:
                resp = requests.post(user_info_url, json={"chat_id": ordered_by_user_id}, timeout=5)
                print(f"DEBUG: getChat response: status={resp.status_code}, body={resp.text[:200]}")
                
                if resp.status_code == 200:
                    user_data = resp.json()
                    print(f"DEBUG: getChat result: {user_data}")
                    
                    if user_data.get("ok"):
                        user = user_data.get("result", {})
                        print(f"DEBUG: User data: {user}")
                        
                        user_id_from_response = user.get("id")
                        if user_id_from_response and user_id_from_response == ordered_by_user_id:
                            ordered_by_name = user.get("first_name", "Пользователь")
                            if user.get("last_name"):
                                ordered_by_name += f" {user.get('last_name')}"
                            if user.get("username"):
                                ordered_by_name += f" (@{user.get('username')})"
                            print(f"DEBUG: Ordered by name: {ordered_by_name}")
                        else:
                            print(f"WARNING: User ID mismatch! Expected {ordered_by_user_id}, got {user_id_from_response}")
                            ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
                    else:
                        print(f"WARNING: getChat returned not ok: {user_data.get('description', 'Unknown error')}")
                        ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
                else:
                    print(f"WARNING: getChat failed with status {resp.status_code}")
                    ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
            except Exception as e:
                print(f"ERROR: Exception getting user info: {e}")
                import traceback
                traceback.print_exc()
                ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
            
            # Формируем имя пользователя со ссылкой на профиль
            if ordered_by_user_id:
                user_link = f"[{ordered_by_name}](tg://user?id={ordered_by_user_id})"
            else:
                user_link = ordered_by_name
            
            # Формируем сообщение
            message = f"🛒 **Новый заказ товара**\n\n"
            message += f"📦 Товар: {product.name}\n"
            message += f"👤 Заказал: {user_link}\n"
            message += f"🔢 Количество: {quantity} шт.\n"
            
            # Добавляем информацию из формы, если она есть
            if first_name or last_name:
                full_name = f"{first_name or ''} {last_name or ''}".strip()
                if middle_name:
                    full_name += f" {middle_name}"
                message += f"👤 Имя: {full_name}\n"
            
            if phone_number:
                phone_display = f"{phone_country_code or ''}{phone_number}".strip()
                message += f"📱 Телефон: {phone_display}\n"
            
            if email:
                message += f"📧 Email: {email}\n"
            
            if delivery_method:
                delivery_text = "🚚 Доставка" if delivery_method == "delivery" else "🏪 Самовывоз"
                message += f"📦 Способ получения: {delivery_text}\n"
            
            if notes:
                message += f"📝 Примечание: {notes}\n"
            
            if promo_code:
                message += f"🎟️ Промокод: {promo_code}\n"
            
            # Создаем кнопку для просмотра заказов
            orders_url = f"{WEBAPP_URL}?user_id={product.user_id}"
            
            keyboard = {
                "inline_keyboard": [[
                    {
                        "text": "📋 Посмотреть заказы",
                        "web_app": {"url": orders_url}
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
                        print(f"✅ Order notification sent successfully to user {product.user_id}")
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
    
    return order

@router.get("/user/{user_id}/username")
async def get_user_username(
    user_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить username пользователя по его ID (для создания ссылки на чат)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        current_user_id, _, bot_id = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем токен бота для запроса
    bot_token_for_request = get_bot_token_for_notifications(current_user_id, db)
    bot_api_url = f"https://api.telegram.org/bot{bot_token_for_request}"
    
    if not bot_token_for_request:
        return {"username": None, "user_id": user_id}
    
    try:
        # Получаем информацию о пользователе
        user_info_url = f"{bot_api_url}/getChat"
        resp = requests.post(user_info_url, json={"chat_id": user_id}, timeout=5)
        
        if resp.status_code == 200:
            user_data = resp.json()
            if user_data.get("ok"):
                user = user_data.get("result", {})
                username = user.get("username")
                return {"username": username, "user_id": user_id}
        
        return {"username": None, "user_id": user_id}
    except Exception as e:
        print(f"ERROR: Exception getting user username: {e}")
        return {"username": None, "user_id": user_id}

@router.get("/shop", response_model=List[schemas.Order])
async def get_shop_orders(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все заказы для магазина текущего пользователя (только для владельца магазина)"""
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
    
    # Получаем заказы, где пользователь - владелец магазина, и заказ не отменен
    orders = db.query(models.Order).options(
        joinedload(models.Order.product)
    ).filter(
        and_(
            models.Order.user_id == user_id,
            models.Order.is_cancelled == False
        )
    ).order_by(models.Order.created_at.desc()).all()
    
    # Формируем ответ с информацией о товаре из snapshot или из продукта
    # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент заказа
    result = []
    for order in orders:
        order_dict = schemas.Order.model_validate(order).model_dump(mode='json')
        
        # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент заказа
        if order.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == order.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info:
                    # Вычисляем правильную цену используя ту же логику, что и для существующих товаров
                    calculated_price = get_product_price_from_dict(product_info)
                    product_info["price"] = calculated_price
                    # ВАЖНО: Обнуляем discount, так как цена уже вычислена со скидкой
                    product_info["discount"] = 0
                    # ВАЖНО: Для заказов товар доступен (он был заказан, когда был доступен)
                    product_info["is_unavailable"] = False
                    # Преобразуем images_urls в полные URL
                    if product_info.get("images_urls"):
                        product_info["images_urls"] = [make_full_url(img_url) for img_url in product_info["images_urls"]]
                    if product_info.get("image_url"):
                        product_info["image_url"] = make_full_url(product_info["image_url"])
                    order_dict['product'] = product_info
                else:
                    order_dict['product'] = {
                        "id": order.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
            else:
                # Snapshot не найден - fallback к актуальному товару
                if order.product:
                    images_urls_list = None
                    if order.product.images_urls:
                        try:
                            images_urls_list = json.loads(order.product.images_urls) if isinstance(order.product.images_urls, str) else order.product.images_urls
                        except (json.JSONDecodeError, TypeError):
                            images_urls_list = []
                    # Вычисляем правильную цену используя ту же логику, что и для snapshot
                    calculated_price = get_product_price_from_dict({
                        "price": order.product.price,
                        "discount": order.product.discount or 0,
                        "is_for_sale": order.product.is_for_sale or False,
                        "price_type": order.product.price_type or 'range',
                        "price_fixed": order.product.price_fixed,
                        "price_from": order.product.price_from,
                        "price_to": order.product.price_to
                    })
                    
                    order_dict['product'] = {
                        "id": order.product.id,
                        "name": order.product.name,
                        "price": calculated_price,
                        "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                        "image_url": make_full_url(order.product.image_url) if order.product.image_url else None,
                        "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                        "is_unavailable": False
                    }
                else:
                    order_dict['product'] = {
                        "id": order.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
        elif order.product:
            # Нет snapshot - используем актуальный товар (для старых заказов без snapshot)
            images_urls_list = None
            if order.product.images_urls:
                try:
                    images_urls_list = json.loads(order.product.images_urls) if isinstance(order.product.images_urls, str) else order.product.images_urls
                except (json.JSONDecodeError, TypeError):
                    images_urls_list = []
            
            # Вычисляем правильную цену используя ту же логику, что и для snapshot
            calculated_price = get_product_price_from_dict({
                "price": order.product.price,
                "discount": order.product.discount or 0,
                "is_for_sale": order.product.is_for_sale or False,
                "price_type": order.product.price_type or 'range',
                "price_fixed": order.product.price_fixed,
                "price_from": order.product.price_from,
                "price_to": order.product.price_to
            })
            
            order_dict['product'] = {
                "id": order.product.id,
                "name": order.product.name,
                "price": calculated_price,
                "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                "image_url": make_full_url(order.product.image_url) if order.product.image_url else None,
                "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                "is_unavailable": False
            }
        else:
            # Товар удален и нет snapshot - показываем заглушку
            order_dict['product'] = {
                "id": order.product_id or 0,
                "name": "Товар недоступен",
                "price": None,
                "discount": 0,
                "image_url": None,
                "images_urls": [],
                "is_unavailable": True
            }
        
        result.append(order_dict)
    
    return result

@router.get("/my")
async def get_my_orders(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все заказы текущего пользователя (где он заказчик)"""
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
    
    # Получаем заказы, где пользователь - заказчик, заказ не отменен и не завершен
    # В корзине показываем только активные заказы (не завершенные и не отмененные)
    orders = db.query(models.Order).options(
        joinedload(models.Order.product)
    ).filter(
        and_(
            models.Order.ordered_by_user_id == user_id,
            models.Order.is_cancelled == False,
            models.Order.is_completed == False  # Не показываем завершенные заказы в корзине
        )
    ).order_by(models.Order.created_at.desc()).all()
    
    # Фильтруем заказы, у которых нет product_id и нет валидного snapshot (такие заказы не должны попадать в корзину)
    valid_orders = []
    for order in orders:
        has_snapshot = order.snapshot_id is not None
        has_product_id = order.product_id is not None
        
        # Если нет ни product_id, ни snapshot - пропускаем
        if not has_snapshot and not has_product_id:
            continue
        
        # ВАЖНО: Если есть snapshot, заказ должен отображаться, даже если товар был удален
        # Snapshot как раз и нужен для сохранения информации о товаре на момент заказа
        if has_snapshot:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == order.snapshot_id
            ).first()
            if not snapshot:
                continue
            
            # Проверяем, что из snapshot можно получить валидную информацию о товаре
            product_info = get_product_display_info_from_snapshot(snapshot)
            if not product_info or not product_info.get("name"):
                continue
            
            # Если есть snapshot с валидными данными, заказ отображается независимо от наличия товара в БД
            valid_orders.append(order)
        # Если нет snapshot, но есть product_id, проверяем, существует ли товар
        elif has_product_id:
            product = db.query(models.Product).filter(models.Product.id == order.product_id).first()
            if product:
                valid_orders.append(order)
    
    # Формируем ответ с информацией о товаре из snapshot или из продукта
    result = []
    for order in valid_orders:
        order_dict = schemas.Order.model_validate(order).model_dump(mode='json')
        
        # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент заказа
        if order.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == order.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info:
                    # Вычисляем правильную цену используя ту же логику, что и для существующих товаров
                    calculated_price = get_product_price_from_dict(product_info)
                    product_info["price"] = calculated_price
                    # ВАЖНО: Обнуляем discount, так как цена уже вычислена со скидкой
                    product_info["discount"] = 0
                    # ВАЖНО: Для заказов товар доступен (он был заказан, когда был доступен)
                    product_info["is_unavailable"] = False
                    # Преобразуем images_urls в полные URL
                    if product_info.get("images_urls"):
                        product_info["images_urls"] = [make_full_url(img_url) for img_url in product_info["images_urls"]]
                    if product_info.get("image_url"):
                        product_info["image_url"] = make_full_url(product_info["image_url"])
                    order_dict['product'] = product_info
                else:
                    order_dict['product'] = {
                        "id": order.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
            else:
                # Snapshot не найден - fallback к актуальному товару
                if order.product:
                    images_urls_list = None
                    if order.product.images_urls:
                        try:
                            images_urls_list = json.loads(order.product.images_urls) if isinstance(order.product.images_urls, str) else order.product.images_urls
                        except (json.JSONDecodeError, TypeError):
                            images_urls_list = []
                    # Вычисляем правильную цену используя ту же логику, что и для snapshot
                    calculated_price = get_product_price_from_dict({
                        "price": order.product.price,
                        "discount": order.product.discount or 0,
                        "is_for_sale": order.product.is_for_sale or False,
                        "price_type": order.product.price_type or 'range',
                        "price_fixed": order.product.price_fixed,
                        "price_from": order.product.price_from,
                        "price_to": order.product.price_to
                    })
                    
                    order_dict['product'] = {
                        "id": order.product.id,
                        "name": order.product.name,
                        "price": calculated_price,
                        "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                        "image_url": make_full_url(order.product.image_url) if order.product.image_url else None,
                        "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                        "is_unavailable": False
                    }
                else:
                    order_dict['product'] = {
                        "id": order.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
        elif order.product:
            # Нет snapshot - используем актуальный товар (для старых заказов без snapshot)
            images_urls_list = None
            if order.product.images_urls:
                try:
                    images_urls_list = json.loads(order.product.images_urls) if isinstance(order.product.images_urls, str) else order.product.images_urls
                except (json.JSONDecodeError, TypeError):
                    images_urls_list = []
            
            # Вычисляем правильную цену используя ту же логику, что и для snapshot
            calculated_price = get_product_price_from_dict({
                "price": order.product.price,
                "discount": order.product.discount or 0,
                "is_for_sale": order.product.is_for_sale or False,
                "price_type": order.product.price_type or 'range',
                "price_fixed": order.product.price_fixed,
                "price_from": order.product.price_from,
                "price_to": order.product.price_to
            })
            
            order_dict['product'] = {
                "id": order.product.id,
                "name": order.product.name,
                "price": calculated_price,
                "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                "image_url": make_full_url(order.product.image_url) if order.product.image_url else None,
                "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                "is_unavailable": False
            }
        else:
            # Товар удален и нет snapshot - показываем заглушку
            order_dict['product'] = {
                "id": order.product_id or 0,
                "name": "Товар недоступен",
                "price": None,
                "discount": 0,
                "image_url": None,
                "images_urls": [],
                "is_unavailable": True
            }
        
        result.append(order_dict)
    
    return result

@router.get("/history", response_model=List[schemas.Order])
async def get_orders_history(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить историю заказов пользователя (только завершенные и отмененные, неактивные)"""
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
    
    # Получаем только завершенные или отмененные заказы (история = неактивные)
    # Активные заказы показываются в разделе "Активные", а не в истории
    orders = db.query(models.Order).options(
        joinedload(models.Order.product)
    ).filter(
        and_(
            models.Order.ordered_by_user_id == user_id,
            or_(
                models.Order.is_completed == True,
                models.Order.is_cancelled == True
            )
        )
    ).order_by(models.Order.created_at.desc()).all()
    
    # Формируем ответ с информацией о товаре из snapshot или из продукта
    # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент заказа
    result = []
    for order in orders:
        order_dict = schemas.Order.model_validate(order).model_dump(mode='json')
        
        # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент заказа
        if order.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == order.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info:
                    # Вычисляем правильную цену используя ту же логику, что и для существующих товаров
                    calculated_price = get_product_price_from_dict(product_info)
                    product_info["price"] = calculated_price
                    # ВАЖНО: Обнуляем discount, так как цена уже вычислена со скидкой
                    product_info["discount"] = 0
                    # ВАЖНО: Для заказов товар доступен (он был заказан, когда был доступен)
                    product_info["is_unavailable"] = False
                    # Преобразуем images_urls в полные URL
                    if product_info.get("images_urls"):
                        product_info["images_urls"] = [make_full_url(img_url) for img_url in product_info["images_urls"]]
                    if product_info.get("image_url"):
                        product_info["image_url"] = make_full_url(product_info["image_url"])
                    order_dict['product'] = product_info
                else:
                    order_dict['product'] = {
                        "id": order.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
            else:
                # Snapshot не найден - fallback к актуальному товару
                if order.product:
                    images_urls_list = None
                    if order.product.images_urls:
                        try:
                            images_urls_list = json.loads(order.product.images_urls) if isinstance(order.product.images_urls, str) else order.product.images_urls
                        except (json.JSONDecodeError, TypeError):
                            images_urls_list = []
                    # Вычисляем правильную цену используя ту же логику, что и для snapshot
                    calculated_price = get_product_price_from_dict({
                        "price": order.product.price,
                        "discount": order.product.discount or 0,
                        "is_for_sale": order.product.is_for_sale or False,
                        "price_type": order.product.price_type or 'range',
                        "price_fixed": order.product.price_fixed,
                        "price_from": order.product.price_from,
                        "price_to": order.product.price_to
                    })
                    
                    order_dict['product'] = {
                        "id": order.product.id,
                        "name": order.product.name,
                        "price": calculated_price,
                        "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                        "image_url": make_full_url(order.product.image_url) if order.product.image_url else None,
                        "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                        "is_unavailable": False
                    }
                else:
                    order_dict['product'] = {
                        "id": order.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
        elif order.product:
            # Нет snapshot - используем актуальный товар (для старых заказов без snapshot)
            images_urls_list = None
            if order.product.images_urls:
                try:
                    images_urls_list = json.loads(order.product.images_urls) if isinstance(order.product.images_urls, str) else order.product.images_urls
                except (json.JSONDecodeError, TypeError):
                    images_urls_list = []
            
            # Вычисляем правильную цену используя ту же логику, что и для snapshot
            calculated_price = get_product_price_from_dict({
                "price": order.product.price,
                "discount": order.product.discount or 0,
                "is_for_sale": order.product.is_for_sale or False,
                "price_type": order.product.price_type or 'range',
                "price_fixed": order.product.price_fixed,
                "price_from": order.product.price_from,
                "price_to": order.product.price_to
            })
            
            order_dict['product'] = {
                "id": order.product.id,
                "name": order.product.name,
                "price": calculated_price,
                "discount": 0,  # Обнуляем discount, так как цена уже вычислена со скидкой
                "image_url": make_full_url(order.product.image_url) if order.product.image_url else None,
                "images_urls": [make_full_url(img_url) for img_url in images_urls_list] if images_urls_list else [],
                "is_unavailable": False
            }
        else:
            # Товар удален и нет snapshot - показываем заглушку
            order_dict['product'] = {
                "id": order.product_id or 0,
                "name": "Товар недоступен",
                "price": None,
                "discount": 0,
                "image_url": None,
                "images_urls": [],
                "is_unavailable": True
            }
        
        result.append(order_dict)
    
    return result

@router.delete("/history/clear")
async def clear_orders_history(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Очистить всю историю заказов пользователя (удалить все завершенные и отмененные заказы)"""
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
    
    # Удаляем все завершенные и отмененные заказы пользователя (история)
    deleted_count = db.query(models.Order).filter(
        and_(
            models.Order.ordered_by_user_id == user_id,
            or_(
                models.Order.is_completed == True,
                models.Order.is_cancelled == True
            )
        )
    ).delete(synchronize_session=False)
    
    db.commit()
    
    return {"message": f"Удалено {deleted_count} записей из истории заказов", "deleted_count": deleted_count}

@router.patch("/{order_id}/complete")
async def complete_order(
    order_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Выполнить заказ (только владелец магазина)"""
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
    
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Проверяем, что пользователь - владелец магазина
    if order.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Только владелец магазина может выполнить заказ"
        )
    
    # Проверяем, что заказ не отменен
    if order.is_cancelled:
        raise HTTPException(
            status_code=400,
            detail="Нельзя выполнить отмененный заказ"
        )
    
    # Проверяем, что заказ еще не выполнен
    if order.is_completed:
        raise HTTPException(
            status_code=400,
            detail="Заказ уже выполнен"
        )
    
    order.is_completed = True
    db.commit()
    
    return {"message": "Order completed", "order": order}

@router.delete("/{order_id}")
async def cancel_order(
    order_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Отменить заказ (владелец магазина или заказчик)"""
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
    
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Проверяем права: владелец магазина или заказчик
    is_shop_owner = order.user_id == user_id
    is_orderer = order.ordered_by_user_id == user_id
    
    if not is_shop_owner and not is_orderer:
        raise HTTPException(
            status_code=403,
            detail="У вас нет прав для отмены этого заказа"
        )
    
    # Проверяем, что заказ еще не выполнен
    if order.is_completed:
        raise HTTPException(
            status_code=400,
            detail="Нельзя отменить выполненный заказ"
        )
    
    # Помечаем заказ как отмененный
    order.is_cancelled = True
    db.commit()
    
    return {"message": "Order cancelled"}

@router.delete("/{order_id}/delete")
async def delete_order(
    order_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить заказ из базы данных (только владелец магазина)"""
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
    
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Проверяем, что пользователь - владелец магазина
    if order.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Только владелец магазина может удалить заказ"
        )
    
    # Удаляем заказ из базы данных
    db.delete(order)
    db.commit()
    
    return {"message": "Order deleted", "deleted_id": order_id}

@router.post("/batch-delete")
async def delete_orders(
    order_ids: List[int],
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить несколько заказов из базы данных (только владелец магазина)"""
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
    
    if not order_ids:
        raise HTTPException(status_code=400, detail="Order IDs list is required")
    
    # Получаем заказы, которые принадлежат владельцу магазина
    orders = db.query(models.Order).filter(
        and_(
            models.Order.id.in_(order_ids),
            models.Order.user_id == user_id
        )
    ).all()
    
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found or you don't have permission to delete these orders")
    
    # Проверяем, что все заказы принадлежат владельцу
    if len(orders) != len(order_ids):
        raise HTTPException(status_code=403, detail="You don't have permission to delete some of these orders")
    
    deleted_count = len(orders)
    deleted_ids = [order.id for order in orders]
    
    # Удаляем заказы
    for order in orders:
        db.delete(order)
    
    db.commit()
    
    return {
        "message": f"Deleted {deleted_count} order(s)",
        "deleted_count": deleted_count,
        "deleted_ids": deleted_ids
    }

