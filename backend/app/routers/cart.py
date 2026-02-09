from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.product_action_type import get_product_action_type
from ..utils.logging_config import get_logger
import os
from dotenv import load_dotenv
import json

load_dotenv()
log = get_logger(__name__)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/cart", tags=["cart"])

@router.post("/add")
async def add_to_cart(
    product_id: int = Query(...),
    quantity: int = Query(1, ge=1),
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Добавить товар в корзину или увеличить количество"""
    if not x_telegram_init_data:
        log.warning("add_to_cart: No initData product_id=%s", product_id)
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
        log.warning("add_to_cart: Validation error product_id=%s: %s", product_id, str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        log.warning("add_to_cart: Product not found product_id=%s", product_id)
        raise HTTPException(status_code=404, detail="Product not found")
    
    # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО ДОБАВЛЯТЬ В КОРЗИНУ ==========
    # Определяем роль пользователя (клиент или владелец)
    user_role = 'client' if user_id != product.user_id else 'owner'
    
    # Получаем настройки магазина из БД
    from ..utils.product_action_type import get_shop_settings_dict
    shop_settings = get_shop_settings_dict(product.user_id, getattr(product, 'bot_id', None), db)
    
    action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
        product, user_role, shop_settings, db
    )
    
    if not can_add_to_cart:
        action_type_text = {
            'purchase': 'покупка',
            'order': 'заказ',
            'reserve': 'резервация',
            'none': 'не продается'
        }.get(action_type, 'не продается')
        
        error_message = f"Этот товар нельзя добавить в корзину. Тип: {action_type_text}"
        log.info("add_to_cart BLOCKED product_id=%s reason=%s", product_id, reason_not_sale)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "NOT_SALE",
                "message": error_message,
                "action_type": action_type,
                "reason": reason_not_sale
            }
        )
    # ========== КОНЕЦ ВАЛИДАЦИИ ТИПА ТОВАРА ==========
    
    # Проверяем, есть ли уже товар в корзине
    cart_item = db.query(models.CartItem).filter(
        and_(
            models.CartItem.product_id == product_id,
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id
        )
    ).first()
    
    if cart_item:
        cart_item.quantity += quantity
        cart_item.updated_at = datetime.utcnow()
        is_new = False
    else:
        cart_item = models.CartItem(
            product_id=product_id,
            user_id=user_id,
            shop_owner_id=shop_owner_id,
            bot_id=bot_id,
            quantity=quantity,
            selected=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(cart_item)
        is_new = True
    
    db.commit()
    db.refresh(cart_item)
    return {
        "id": cart_item.id,
        "product_id": cart_item.product_id,
        "quantity": cart_item.quantity,
        "selected": cart_item.selected,
        "is_new": is_new
    }

@router.post("/remove")
async def remove_from_cart(
    product_id: int = Query(...),
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить товар из корзины"""
    if not x_telegram_init_data:
        log.warning("remove_from_cart: No initData product_id=%s", product_id)
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
        log.warning("remove_from_cart: Validation error product_id=%s: %s", product_id, str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Находим товар в корзине
    cart_item = db.query(models.CartItem).filter(
        and_(
            models.CartItem.product_id == product_id,
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id
        )
    ).first()
    
    if not cart_item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    db.delete(cart_item)
    db.commit()
    return {"removed": True}

@router.post("/update")
async def update_cart_item(
    product_id: int = Query(...),
    quantity: int = Query(..., ge=1),
    selected: Optional[bool] = Query(None),
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Обновить количество или выбор товара в корзине"""
    if not x_telegram_init_data:
        log.warning("update_cart_item: No initData product_id=%s", product_id)
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
        log.warning("update_cart_item: Validation error product_id=%s: %s", product_id, str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Находим товар в корзине
    cart_item = db.query(models.CartItem).filter(
        and_(
            models.CartItem.product_id == product_id,
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id
        )
    ).first()
    
    if not cart_item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    cart_item.quantity = quantity
    if selected is not None:
        cart_item.selected = selected
    cart_item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(cart_item)
    
    return {
        "id": cart_item.id,
        "product_id": cart_item.product_id,
        "quantity": cart_item.quantity,
        "selected": cart_item.selected
    }

@router.post("/toggle-selection")
async def toggle_cart_item_selection(
    product_id: int = Query(...),
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Переключить выбор товара в корзине"""
    if not x_telegram_init_data:
        log.warning("toggle_cart_item_selection: No initData product_id=%s", product_id)
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
        log.warning("toggle_cart_item_selection: Validation error product_id=%s: %s", product_id, str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Находим товар в корзине
    cart_item = db.query(models.CartItem).filter(
        and_(
            models.CartItem.product_id == product_id,
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id
        )
    ).first()
    
    if not cart_item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    cart_item.selected = not cart_item.selected
    cart_item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(cart_item)
    return {
        "id": cart_item.id,
        "product_id": cart_item.product_id,
        "selected": cart_item.selected
    }

@router.post("/select-all")
async def select_all_cart_items(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    selected: bool = Query(True),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Выбрать/снять выбор со всех товаров в корзине"""
    if not x_telegram_init_data:
        log.warning("select_all_cart_items: No initData")
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
        log.warning("select_all_cart_items: Validation error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Находим все товары в корзине
    cart_items = db.query(models.CartItem).filter(
        and_(
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id
        )
    ).all()
    
    # Обновляем выбор для всех товаров
    updated_count = 0
    for item in cart_items:
        item.selected = selected
        item.updated_at = datetime.utcnow()
        updated_count += 1
    
    db.commit()
    return {"updated_count": updated_count, "selected": selected}

@router.post("/remove-selected")
async def remove_selected_cart_items(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить все выбранные товары из корзины"""
    if not x_telegram_init_data:
        log.warning("remove_selected_cart_items: No initData")
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
        log.warning("remove_selected_cart_items: Validation error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Находим все выбранные товары в корзине
    cart_items = db.query(models.CartItem).filter(
        and_(
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id,
            models.CartItem.selected == True
        )
    ).all()
    
    removed_count = len(cart_items)
    for item in cart_items:
        db.delete(item)
    
    db.commit()
    return {"removed_count": removed_count}

@router.get("/list")
async def get_cart(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить список товаров в корзине для текущего пользователя"""
    if not x_telegram_init_data:
        log.warning("get_cart: No initData")
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
        log.warning("get_cart: Validation error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем все товары в корзине пользователя для указанного магазина
    cart_items = db.query(models.CartItem).join(
        models.Product
    ).filter(
        and_(
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id,
            models.Product.is_sold == False,  # Только не проданные товары
            models.Product.is_hidden == False  # Только не скрытые товары
        )
    ).order_by(models.CartItem.created_at.desc()).all()
    
    
    # Формируем список товаров с данными из корзины
    items = []
    for cart_item in cart_items:
        product = cart_item.product
        if product:  # Проверяем, что товар еще существует
            # Получаем изображения
            images_urls = []
            if product.images_urls:
                try:
                    images_urls = json.loads(product.images_urls) if isinstance(product.images_urls, str) else product.images_urls
                except:
                    images_urls = []
            
            items.append({
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "description": product.description,
                    "price": product.price,
                    "discount": product.discount,
                    "image_url": product.image_url,
                    "images_urls": images_urls,
                    "is_hot_offer": product.is_hot_offer,
                    "quantity": product.quantity,
                    "is_made_to_order": product.is_made_to_order,
                    "is_for_sale": product.is_for_sale,
                    "price_from": product.price_from,
                    "price_to": product.price_to,
                    "price_fixed": product.price_fixed,
                    "price_type": product.price_type,
                    "quantity_from": product.quantity_from,
                    "quantity_unit": product.quantity_unit,
                    "quantity_show_enabled": product.quantity_show_enabled,
                    "category_id": product.category_id
                },
                "quantity": cart_item.quantity,
                "selected": cart_item.selected,
                "created_at": cart_item.created_at.isoformat() if cart_item.created_at else None,
                "updated_at": cart_item.updated_at.isoformat() if cart_item.updated_at else None
            })
    
    return items

@router.get("/count")
async def get_cart_count(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить количество товаров в корзине для текущего пользователя"""
    # log.debug( get_cart_count called: shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        log.debug("get_cart_count: No initData provided")
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
        log.warning("get_cart_count: Validation error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Подсчитываем товары в корзине пользователя для указанного магазина
    count = db.query(models.CartItem).join(
        models.Product
    ).filter(
        and_(
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id,
            models.Product.is_sold == False,  # Только не проданные товары
            models.Product.is_hidden == False  # Только не скрытые товары
        )
    ).count()
    
    # Подсчитываем общее количество (с учетом quantity каждого товара)
    total_quantity = db.query(models.CartItem).join(
        models.Product
    ).filter(
        and_(
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id,
            models.Product.is_sold == False,
            models.Product.is_hidden == False
        )
    ).with_entities(
        db.func.sum(models.CartItem.quantity)
    ).scalar() or 0
    
    # log.debug( get_cart_count result: user_id={user_id}, shop_owner_id={shop_owner_id}, count={count}, total_quantity={total_quantity}")
    
    return {"count": count, "total_quantity": total_quantity}

@router.post("/clear")
async def clear_cart(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Очистить всю корзину"""
    if not x_telegram_init_data:
        log.warning("clear_cart: No initData")
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
        log.warning("clear_cart: Validation error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Находим все товары в корзине
    cart_items = db.query(models.CartItem).filter(
        and_(
            models.CartItem.user_id == user_id,
            models.CartItem.shop_owner_id == shop_owner_id,
            models.CartItem.bot_id == bot_id
        )
    ).all()
    
    removed_count = len(cart_items)
    for item in cart_items:
        db.delete(item)
    
    db.commit()
    
    
    return {"removed_count": removed_count}
