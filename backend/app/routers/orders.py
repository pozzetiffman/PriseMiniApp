import os
import json
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime
from dotenv import load_dotenv
from ..db import models, database
from ..models import order as schemas
from ..utils.telegram_auth import get_user_id_from_init_data

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token для отправки уведомлений
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

print(f"DEBUG: Order router initialized - TELEGRAM_BOT_TOKEN={'SET' if TELEGRAM_BOT_TOKEN else 'NOT SET'}, WEBAPP_URL={WEBAPP_URL}")

router = APIRouter(prefix="/api/orders", tags=["orders"])

@router.post("/", response_model=schemas.Order)
def create_order(
    product_id: int = Query(...),
    quantity: int = Query(..., ge=1),  # Минимум 1
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать заказ товара (ordered_by_user_id определяется из валидированного Telegram initData)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        ordered_by_user_id = get_user_id_from_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
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
    
    # Создаем заказ
    order = models.Order(
        product_id=product_id,
        user_id=product.user_id,  # Владелец магазина
        ordered_by_user_id=ordered_by_user_id,
        quantity=quantity,
        is_completed=False,
        is_cancelled=False
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
    if TELEGRAM_BOT_TOKEN and WEBAPP_URL and TELEGRAM_API_URL:
        try:
            print(f"DEBUG: Getting user info for ordered_by_user_id={ordered_by_user_id}, product owner={product.user_id}")
            
            # Получаем информацию о пользователе, который заказал
            user_info_url = f"{TELEGRAM_API_URL}/getChat"
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
        print(f"WARNING: Cannot send notification - TELEGRAM_BOT_TOKEN={bool(TELEGRAM_BOT_TOKEN)}, WEBAPP_URL={bool(WEBAPP_URL)}, TELEGRAM_API_URL={bool(TELEGRAM_API_URL)}")
    
    return order

@router.get("/shop", response_model=List[schemas.Order])
def get_shop_orders(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все заказы для магазина текущего пользователя (только для владельца магазина)"""
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
    
    # Получаем заказы, где пользователь - владелец магазина, и заказ не отменен
    orders = db.query(models.Order).options(
        joinedload(models.Order.product)
    ).filter(
        and_(
            models.Order.user_id == user_id,
            models.Order.is_cancelled == False
        )
    ).order_by(models.Order.created_at.desc()).all()
    
    # Преобразуем images_urls из JSON строки в список для каждого заказа
    for order in orders:
        if order.product and order.product.images_urls:
            if isinstance(order.product.images_urls, str):
                try:
                    order.product.images_urls = json.loads(order.product.images_urls)
                except (json.JSONDecodeError, TypeError):
                    order.product.images_urls = []
    
    return orders

@router.get("/my", response_model=List[schemas.Order])
def get_my_orders(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все заказы текущего пользователя (где он заказчик)"""
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
    
    # Получаем заказы, где пользователь - заказчик, и заказ не отменен
    orders = db.query(models.Order).options(
        joinedload(models.Order.product)
    ).filter(
        and_(
            models.Order.ordered_by_user_id == user_id,
            models.Order.is_cancelled == False
        )
    ).order_by(models.Order.created_at.desc()).all()
    
    # Преобразуем images_urls из JSON строки в список для каждого заказа
    for order in orders:
        if order.product and order.product.images_urls:
            if isinstance(order.product.images_urls, str):
                try:
                    order.product.images_urls = json.loads(order.product.images_urls)
                except (json.JSONDecodeError, TypeError):
                    order.product.images_urls = []
    
    return orders

@router.patch("/{order_id}/complete")
def complete_order(
    order_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Выполнить заказ (только владелец магазина)"""
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
def cancel_order(
    order_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Отменить заказ (владелец магазина или заказчик)"""
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

