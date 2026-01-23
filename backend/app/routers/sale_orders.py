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
from ..models import sale_order as schemas
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

router = APIRouter(prefix="/api/sale-orders", tags=["sale_orders"])

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

@router.post("/", response_model=schemas.SaleOrder)
async def create_sale_order(
    order_data: schemas.SaleOrderCreate,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать заказ на покупку (когда мы продаем товар клиенту)"""
    print(f"📦 [SALE ORDER] Creating sale order: product_id={order_data.product_id}, quantity={order_data.quantity}")
    
    if not x_telegram_init_data:
        print("❌ [SALE ORDER] Telegram initData is required")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        ordered_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"✅ [SALE ORDER] Validated user: ordered_by_user_id={ordered_by_user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [SALE ORDER] Invalid Telegram initData: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    product_id = order_data.product_id
    quantity = order_data.quantity
    
    if not product_id or not quantity:
        print(f"❌ [SALE ORDER] product_id and quantity are required")
        raise HTTPException(status_code=400, detail="product_id and quantity are required")
    
    # Получаем товар
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"❌ [SALE ORDER] Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, что товар доступен для продажи (is_sale_enabled)
    is_sale_enabled = getattr(product, 'is_sale_enabled', False)
    if not is_sale_enabled:
        print(f"❌ [SALE ORDER] Product {product_id} is not available for sale (is_sale_enabled=False)")
        raise HTTPException(
            status_code=400,
            detail="Этот товар недоступен для покупки"
        )
    
    # Проверяем, что пользователь не пытается купить свой собственный товар
    if ordered_by_user_id == product.user_id:
        print(f"❌ [SALE ORDER] User {ordered_by_user_id} tried to buy their own product {product_id}")
        raise HTTPException(
            status_code=400, 
            detail="Вы не можете купить свой собственный товар"
        )
    
    # Создаем snapshot товара на момент операции
    snapshot_id = create_product_snapshot(
        db=db,
        product=product,
        user_id=ordered_by_user_id,
        operation_type='sale_order'
    )
    print(f"✅ [SALE ORDER] Created snapshot: snapshot_id={snapshot_id}")
    
    # Создаем заказ на покупку
    sale_order = models.SaleOrder(
        product_id=product_id,
        snapshot_id=snapshot_id,
        user_id=product.user_id,  # Владелец магазина
        ordered_by_user_id=ordered_by_user_id,
        quantity=quantity,
        is_completed=False,
        is_cancelled=False,
        promo_code=order_data.promo_code,
        first_name=order_data.first_name,
        last_name=order_data.last_name,
        phone_country_code=order_data.phone_country_code,
        phone_number=order_data.phone_number,
        email=order_data.email,
        notes=order_data.notes,
        delivery_method=order_data.delivery_method,
        payment_method=order_data.payment_method,
        status='pending'
    )
    
    db.add(sale_order)
    db.commit()
    db.refresh(sale_order)
    
    # Загружаем product для возврата в ответе
    db.refresh(sale_order, ['product'])
    
    # Преобразуем images_urls из JSON строки в список, если product загружен
    if sale_order.product and sale_order.product.images_urls:
        if isinstance(sale_order.product.images_urls, str):
            try:
                sale_order.product.images_urls = json.loads(sale_order.product.images_urls)
            except (json.JSONDecodeError, TypeError):
                sale_order.product.images_urls = []
    
    print(f"✅ [SALE ORDER] Sale order created successfully - id={sale_order.id}, product_id={sale_order.product_id}")
    
    # Отправляем уведомление владельцу магазина через Telegram Bot API
    bot_token_for_notifications = get_bot_token_for_notifications(product.user_id, db)
    bot_api_url = f"https://api.telegram.org/bot{bot_token_for_notifications}"
    
    if bot_token_for_notifications and WEBAPP_URL:
        try:
            print(f"📨 [SALE ORDER] Sending notification to shop owner {product.user_id}")
            
            # Получаем информацию о пользователе, который заказал
            user_info_url = f"{bot_api_url}/getChat"
            ordered_by_name = "Пользователь"
            
            try:
                resp = requests.post(user_info_url, json={"chat_id": ordered_by_user_id}, timeout=5)
                
                if resp.status_code == 200:
                    user_data = resp.json()
                    if user_data.get("ok"):
                        user = user_data.get("result", {})
                        user_id_from_response = user.get("id")
                        if user_id_from_response and user_id_from_response == ordered_by_user_id:
                            ordered_by_name = user.get("first_name", "Пользователь")
                            if user.get("last_name"):
                                ordered_by_name += f" {user.get('last_name')}"
                            if user.get("username"):
                                ordered_by_name += f" (@{user.get('username')})"
                        else:
                            ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
                    else:
                        ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
                else:
                    ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
            except Exception as e:
                print(f"⚠️ [SALE ORDER] Exception getting user info: {e}")
                ordered_by_name = f"Пользователь (ID: {ordered_by_user_id})"
            
            # Формируем имя пользователя со ссылкой на профиль
            if ordered_by_user_id:
                user_link = f"[{ordered_by_name}](tg://user?id={ordered_by_user_id})"
            else:
                user_link = ordered_by_name
            
            # Формируем сообщение
            message = f"🛍️ **Новый заказ на покупку**\n\n"
            message += f"📦 Товар: {product.name}\n"
            message += f"👤 Заказал: {user_link}\n"
            message += f"🔢 Количество: {quantity} шт.\n"
            
            # Добавляем информацию из формы, если она есть
            if order_data.first_name or order_data.last_name:
                full_name = f"{order_data.first_name or ''} {order_data.last_name or ''}".strip()
                message += f"👤 Имя: {full_name}\n"
            
            if order_data.phone_number:
                phone_display = f"{order_data.phone_country_code or ''}{order_data.phone_number}".strip()
                message += f"📱 Телефон: {phone_display}\n"
            
            if order_data.email:
                message += f"📧 Email: {order_data.email}\n"
            
            if order_data.delivery_method:
                delivery_text = "🚚 Доставка" if order_data.delivery_method == "delivery" else "🏪 Самовывоз"
                message += f"📦 Способ получения: {delivery_text}\n"
            
            if order_data.payment_method:
                payment_text = {
                    "online": "💳 Онлайн оплата",
                    "crypto": "₿ Криптовалюта",
                    "cash": "💵 Наличные при получении"
                }.get(order_data.payment_method, order_data.payment_method)
                message += f"💳 Способ оплаты: {payment_text}\n"
            
            if order_data.notes:
                message += f"📝 Примечание: {order_data.notes}\n"
            
            message += f"\n🔗 [Открыть магазин]({WEBAPP_URL})"
            
            # Отправляем уведомление
            send_message_url = f"{bot_api_url}/sendMessage"
            send_data = {
                "chat_id": product.user_id,
                "text": message,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True
            }
            
            resp = requests.post(send_message_url, json=send_data, timeout=10)
            if resp.status_code == 200:
                result = resp.json()
                if result.get("ok"):
                    print(f"✅ [SALE ORDER] Notification sent successfully to user {product.user_id}")
                else:
                    print(f"❌ [SALE ORDER] Telegram API error: {result.get('description', 'Unknown error')}")
            else:
                print(f"❌ [SALE ORDER] Failed to send notification (status {resp.status_code})")
        except Exception as e:
            print(f"❌ [SALE ORDER] Exception sending notification: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"⚠️ [SALE ORDER] Cannot send notification - bot_token={bool(bot_token_for_notifications)}, WEBAPP_URL={bool(WEBAPP_URL)}")
    
    return sale_order

@router.get("/", response_model=List[schemas.SaleOrder])
async def get_my_sale_orders(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все заказы на покупку текущего пользователя (как покупателя)"""
    print(f"📦 [SALE ORDER] Getting sale orders for current user")
    
    if not x_telegram_init_data:
        print("❌ [SALE ORDER] Telegram initData is required")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        ordered_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"✅ [SALE ORDER] Validated user: ordered_by_user_id={ordered_by_user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [SALE ORDER] Invalid Telegram initData: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем все заказы на покупку текущего пользователя
    sale_orders = db.query(models.SaleOrder).filter(
        models.SaleOrder.ordered_by_user_id == ordered_by_user_id
    ).order_by(models.SaleOrder.created_at.desc()).all()
    
    print(f"✅ [SALE ORDER] Found {len(sale_orders)} sale orders for user {ordered_by_user_id}")
    
    # Загружаем информацию о товарах
    for sale_order in sale_orders:
        if sale_order.product:
            # Преобразуем images_urls из JSON строки в список
            if sale_order.product.images_urls:
                if isinstance(sale_order.product.images_urls, str):
                    try:
                        sale_order.product.images_urls = json.loads(sale_order.product.images_urls)
                    except (json.JSONDecodeError, TypeError):
                        sale_order.product.images_urls = []
    
    return sale_orders

@router.get("/history", response_model=List[schemas.SaleOrder])
async def get_sale_orders_history(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить историю заказов на покупку (завершенные и отмененные)"""
    print(f"📦 [SALE ORDER] Getting sale orders history for current user")
    
    if not x_telegram_init_data:
        print("❌ [SALE ORDER] Telegram initData is required")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        ordered_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"✅ [SALE ORDER] Validated user: ordered_by_user_id={ordered_by_user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [SALE ORDER] Invalid Telegram initData: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем завершенные и отмененные заказы на покупку
    sale_orders = db.query(models.SaleOrder).filter(
        models.SaleOrder.ordered_by_user_id == ordered_by_user_id,
        or_(
            models.SaleOrder.is_completed == True,
            models.SaleOrder.is_cancelled == True
        )
    ).order_by(models.SaleOrder.created_at.desc()).all()
    
    print(f"✅ [SALE ORDER] Found {len(sale_orders)} sale orders in history for user {ordered_by_user_id}")
    
    # Загружаем информацию о товарах
    for sale_order in sale_orders:
        if sale_order.product:
            # Преобразуем images_urls из JSON строки в список
            if sale_order.product.images_urls:
                if isinstance(sale_order.product.images_urls, str):
                    try:
                        sale_order.product.images_urls = json.loads(sale_order.product.images_urls)
                    except (json.JSONDecodeError, TypeError):
                        sale_order.product.images_urls = []
    
    return sale_orders

@router.patch("/{sale_order_id}/cancel")
async def cancel_sale_order(
    sale_order_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Отменить заказ на покупку"""
    print(f"📦 [SALE ORDER] Cancelling sale order {sale_order_id}")
    
    if not x_telegram_init_data:
        print("❌ [SALE ORDER] Telegram initData is required")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        ordered_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"✅ [SALE ORDER] Validated user: ordered_by_user_id={ordered_by_user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [SALE ORDER] Invalid Telegram initData: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем заказ на покупку
    sale_order = db.query(models.SaleOrder).filter(
        models.SaleOrder.id == sale_order_id,
        models.SaleOrder.ordered_by_user_id == ordered_by_user_id
    ).first()
    
    if not sale_order:
        print(f"❌ [SALE ORDER] Sale order {sale_order_id} not found")
        raise HTTPException(status_code=404, detail="Sale order not found")
    
    if sale_order.is_cancelled:
        print(f"⚠️ [SALE ORDER] Sale order {sale_order_id} is already cancelled")
        raise HTTPException(status_code=400, detail="Заказ уже отменен")
    
    if sale_order.is_completed:
        print(f"⚠️ [SALE ORDER] Sale order {sale_order_id} is already completed")
        raise HTTPException(status_code=400, detail="Нельзя отменить выполненный заказ")
    
    # Отменяем заказ
    sale_order.is_cancelled = True
    sale_order.status = 'cancelled'
    db.commit()
    db.refresh(sale_order)
    
    print(f"✅ [SALE ORDER] Sale order {sale_order_id} cancelled successfully")
    
    return sale_order
