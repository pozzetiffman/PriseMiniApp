import os
import json
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime
from dotenv import load_dotenv
from ..db import models, database
from ..models import sale as schemas
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.product_snapshot import create_product_snapshot, get_product_display_info_from_snapshot
from ..utils.products_utils import make_full_url
from sqlalchemy.orm import joinedload

def _minimal_product_no_snapshot(product_id: Optional[int], product_exists: bool) -> dict:
    """Минимальный объект товара для операции без snapshot. НЕ использует данные живого Product."""
    return {
        "id": product_id or 0,
        "name": "Товар недоступен" if not product_exists else "Товар",
        "price": None,
        "price_card": None,
        "price_cash": None,
        "discount": 0,
        "image_url": None,
        "images_urls": [],
        "is_unavailable": not product_exists,
    }


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

router = APIRouter(prefix="/api/sales", tags=["sales"])

def get_bot_token_for_notifications(shop_owner_id: int, db: Session) -> str:
    """
    Получает токен бота для отправки уведомлений.
    Если у владельца магазина есть подключенный бот, использует его токен.
    Иначе использует токен основного бота.
    """
    connected_bot = db.query(models.Bot).filter(
        models.Bot.owner_user_id == shop_owner_id,
        models.Bot.is_active == True
    ).first()
    
    if connected_bot and connected_bot.bot_token:
        return connected_bot.bot_token
    
    return TELEGRAM_BOT_TOKEN

@router.post("/", response_model=schemas.Sale)
async def create_sale(
    sale_data: Optional[schemas.SaleCreate] = Body(None),
    product_id: Optional[int] = Query(None),
    quantity: Optional[int] = Query(None, ge=1),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать продажу товара (sold_by_user_id определяется из валидированного Telegram initData)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        sold_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Поддерживаем старый формат (query параметры) и новый формат (body)
    if sale_data and sale_data.product_id:
        product_id = sale_data.product_id
        quantity = sale_data.quantity
        promo_code = sale_data.promo_code
        first_name = sale_data.first_name
        last_name = sale_data.last_name
        middle_name = sale_data.middle_name
        phone_country_code = sale_data.phone_country_code
        phone_number = sale_data.phone_number
        email = sale_data.email
        notes = sale_data.notes
        delivery_method = sale_data.delivery_method
    else:
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
    
    # Получаем товар
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, что товар доступен для продажи от клиента
    if not getattr(product, 'is_buy_from_client', False):
        raise HTTPException(
            status_code=400,
            detail="Этот товар не принимается на продажу от клиентов"
        )
    
    # Проверяем глобальную настройку магазина
    shop_settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == product.user_id,
        models.ShopSettings.bot_id == product.bot_id
    ).first()
    
    if shop_settings and not getattr(shop_settings, 'buy_from_client_enabled', False):
        raise HTTPException(
            status_code=400,
            detail="Покупка от клиентов отключена в настройках магазина"
        )
    
    # Проверяем, что пользователь не пытается продать свой собственный товар
    if sold_by_user_id == product.user_id:
        raise HTTPException(
            status_code=400, 
            detail="Вы не можете продать свой собственный товар"
        )
    
    # Создаем snapshot товара на момент операции
    snapshot_id = create_product_snapshot(
        db=db,
        product=product,
        user_id=sold_by_user_id,
        operation_type='sell'
    )
    
    # Создаем продажу
    sale = models.Sale(
        product_id=product_id,
        snapshot_id=snapshot_id,
        user_id=product.user_id,  # Владелец магазина
        sold_by_user_id=sold_by_user_id,
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
    
    db.add(sale)
    db.commit()
    db.refresh(sale)
    
    # Загружаем product для возврата в ответе
    db.refresh(sale, ['product'])
    
    # Преобразуем images_urls из JSON строки в список, если product загружен
    if sale.product and sale.product.images_urls:
        if isinstance(sale.product.images_urls, str):
            try:
                sale.product.images_urls = json.loads(sale.product.images_urls)
            except (json.JSONDecodeError, TypeError):
                sale.product.images_urls = []
    
    # Отправляем уведомление владельцу магазина через Telegram Bot API
    bot_token_for_notifications = get_bot_token_for_notifications(product.user_id, db)
    bot_api_url = f"https://api.telegram.org/bot{bot_token_for_notifications}"
    
    if bot_token_for_notifications and WEBAPP_URL:
        try:
            # Получаем информацию о пользователе, который продал
            user_info_url = f"{bot_api_url}/getChat"
            sold_by_name = "Пользователь"
            
            try:
                resp = requests.post(user_info_url, json={"chat_id": sold_by_user_id}, timeout=5)
                if resp.status_code == 200:
                    user_data = resp.json()
                    if user_data.get("ok"):
                        user = user_data.get("result", {})
                        user_id_from_response = user.get("id")
                        if user_id_from_response and user_id_from_response == sold_by_user_id:
                            sold_by_name = user.get("first_name", "Пользователь")
                            if user.get("last_name"):
                                sold_by_name += f" {user.get('last_name')}"
                            if user.get("username"):
                                sold_by_name += f" (@{user.get('username')})"
                        else:
                            sold_by_name = f"Пользователь (ID: {sold_by_user_id})"
                    else:
                        sold_by_name = f"Пользователь (ID: {sold_by_user_id})"
                else:
                    sold_by_name = f"Пользователь (ID: {sold_by_user_id})"
            except Exception as e:
                print(f"ERROR: Exception getting user info: {e}")
                sold_by_name = f"Пользователь (ID: {sold_by_user_id})"
            
            # Формируем имя пользователя со ссылкой на профиль
            if sold_by_user_id:
                user_link = f"[{sold_by_name}](tg://user?id={sold_by_user_id})"
            else:
                user_link = sold_by_name
            
            # Формируем сообщение
            message = f"💰 **Новая продажа товара**\n\n"
            message += f"📦 Товар: {product.name}\n"
            message += f"👤 Продал: {user_link}\n"
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
            
            # Создаем кнопку для просмотра продаж
            sales_url = f"{WEBAPP_URL}?user_id={product.user_id}"
            
            keyboard = {
                "inline_keyboard": [[
                    {
                        "text": "💰 Посмотреть продажи",
                        "web_app": {"url": sales_url}
                    }
                ]]
            }
            
            # Отправляем уведомление
            send_message_url = f"{bot_api_url}/sendMessage"
            try:
                resp = requests.post(send_message_url, json={
                    "chat_id": product.user_id,
                    "text": message,
                    "reply_markup": keyboard,
                    "parse_mode": "Markdown"
                }, timeout=10)
                
                if resp.status_code == 200:
                    result = resp.json()
                    if result.get("ok"):
                        print(f"✅ Sale notification sent successfully to user {product.user_id}")
                    else:
                        print(f"❌ Telegram API error: {result.get('description', 'Unknown error')}")
                else:
                    print(f"❌ Failed to send notification (status {resp.status_code})")
            except Exception as e:
                print(f"❌ Exception while sending notification: {e}")
        except Exception as e:
            print(f"ERROR: Exception sending notification: {e}")
    
    return sale

@router.get("/shop", response_model=List[schemas.Sale])
async def get_shop_sales(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все продажи для магазина текущего пользователя (только для владельца магазина)"""
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
    
    # Получаем продажи, где пользователь - владелец магазина, и продажа не отменена
    sales = db.query(models.Sale).options(
        joinedload(models.Sale.product)
    ).filter(
        and_(
            models.Sale.user_id == user_id,
            models.Sale.is_cancelled == False
        )
    ).order_by(models.Sale.created_at.desc()).all()
    
    # Формируем ответ с информацией о товаре из snapshot или из продукта
    # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент продажи
    result = []
    for sale in sales:
        sale_dict = schemas.Sale.model_validate(sale).model_dump(mode='json')
        
        # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент продажи
        if sale.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == sale.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info:
                    # Вычисляем правильную цену используя ту же логику, что и для существующих товаров
                    calculated_price = get_product_price_from_dict(product_info)
                    product_info["price"] = calculated_price
                    # ВАЖНО: Обнуляем discount, так как цена уже вычислена со скидкой
                    product_info["discount"] = 0
                    # ВАЖНО: Для продаж товар доступен (он был продан, когда был доступен)
                    product_info["is_unavailable"] = False
                    # Преобразуем images_urls в полные URL
                    if product_info.get("images_urls"):
                        product_info["images_urls"] = [make_full_url(img_url) for img_url in product_info["images_urls"]]
                    if product_info.get("image_url"):
                        product_info["image_url"] = make_full_url(product_info["image_url"])
                    sale_dict['product'] = product_info
                    if product_info.get("price_card") is not None:
                        print(f"   📸 [SALES] item.product.price_card from snapshot_json (sale_id={sale.id})")
                else:
                    sale_dict['product'] = {
                        "id": sale.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
            else:
                sale_dict['product'] = _minimal_product_no_snapshot(sale.product_id, sale.product is not None)
        elif sale.product:
            sale_dict['product'] = _minimal_product_no_snapshot(sale.product_id, True)
        else:
            sale_dict['product'] = _minimal_product_no_snapshot(sale.product_id, False)
        
        result.append(sale_dict)
    
    return result

@router.get("/my", response_model=List[schemas.Sale])
async def get_my_sales(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все продажи текущего пользователя (где он продавец)"""
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
    
    # Получаем продажи, где пользователь - продавец, продажа не отменена и не завершена
    sales = db.query(models.Sale).options(
        joinedload(models.Sale.product)
    ).filter(
        and_(
            models.Sale.sold_by_user_id == user_id,
            models.Sale.is_cancelled == False,
            models.Sale.is_completed == False  # Не показываем завершенные продажи в корзине
        )
    ).order_by(models.Sale.created_at.desc()).all()
    
    # Формируем ответ с информацией о товаре из snapshot или из продукта
    # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент продажи
    result = []
    for sale in sales:
        sale_dict = schemas.Sale.model_validate(sale).model_dump(mode='json')
        
        # ВСЕГДА используем snapshot если он есть - для изоляции данных товара на момент продажи
        if sale.snapshot_id:
            snapshot = db.query(models.UserProductSnapshot).filter(
                models.UserProductSnapshot.snapshot_id == sale.snapshot_id
            ).first()
            if snapshot:
                product_info = get_product_display_info_from_snapshot(snapshot)
                if product_info:
                    # Вычисляем правильную цену используя ту же логику, что и для существующих товаров
                    calculated_price = get_product_price_from_dict(product_info)
                    product_info["price"] = calculated_price
                    # ВАЖНО: Обнуляем discount, так как цена уже вычислена со скидкой
                    product_info["discount"] = 0
                    # ВАЖНО: Для продаж товар доступен (он был продан, когда был доступен)
                    product_info["is_unavailable"] = False
                    # Преобразуем images_urls в полные URL
                    if product_info.get("images_urls"):
                        product_info["images_urls"] = [make_full_url(img_url) for img_url in product_info["images_urls"]]
                    if product_info.get("image_url"):
                        product_info["image_url"] = make_full_url(product_info["image_url"])
                    sale_dict['product'] = product_info
                    if product_info.get("price_card") is not None:
                        print(f"   📸 [SALES] item.product.price_card from snapshot_json (sale_id={sale.id})")
                else:
                    sale_dict['product'] = {
                        "id": sale.product_id or 0,
                        "name": "Товар недоступен",
                        "price": None,
                        "discount": 0,
                        "image_url": None,
                        "images_urls": [],
                        "is_unavailable": True
                    }
            else:
                sale_dict['product'] = _minimal_product_no_snapshot(sale.product_id, sale.product is not None)
        elif sale.product:
            sale_dict['product'] = _minimal_product_no_snapshot(sale.product_id, True)
        else:
            sale_dict['product'] = _minimal_product_no_snapshot(sale.product_id, False)
        
        result.append(sale_dict)
    
    return result

@router.patch("/{sale_id}/complete")
async def complete_sale(
    sale_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Выполнить продажу (только владелец магазина)"""
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
    
    sale = db.query(models.Sale).filter(models.Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Проверяем, что пользователь - владелец магазина
    if sale.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Только владелец магазина может выполнить продажу"
        )
    
    # Проверяем, что продажа не отменена
    if sale.is_cancelled:
        raise HTTPException(
            status_code=400,
            detail="Нельзя выполнить отмененную продажу"
        )
    
    # Проверяем, что продажа еще не выполнена
    if sale.is_completed:
        raise HTTPException(
            status_code=400,
            detail="Продажа уже выполнена"
        )
    
    sale.is_completed = True
    db.commit()
    
    return {"message": "Sale completed", "sale": sale}

@router.delete("/{sale_id}")
async def cancel_sale(
    sale_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Отменить продажу (владелец магазина или продавец)"""
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
    
    sale = db.query(models.Sale).filter(models.Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Проверяем права: владелец магазина или продавец
    is_shop_owner = sale.user_id == user_id
    is_seller = sale.sold_by_user_id == user_id
    
    if not is_shop_owner and not is_seller:
        raise HTTPException(
            status_code=403,
            detail="У вас нет прав для отмены этой продажи"
        )
    
    # Проверяем, что продажа еще не выполнена
    if sale.is_completed:
        raise HTTPException(
            status_code=400,
            detail="Нельзя отменить выполненную продажу"
        )
    
    # Помечаем продажу как отмененную
    sale.is_cancelled = True
    db.commit()
    
    return {"message": "Sale cancelled"}







