from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
import os
from dotenv import load_dotenv
import json

load_dotenv()

# Telegram Bot Token для валидации
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
    print(f"[CART DEBUG] add_to_cart called: product_id={product_id}, quantity={quantity}, shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] add_to_cart: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] add_to_cart: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] add_to_cart: Validation error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем наличие товара
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"[CART DEBUG] add_to_cart: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
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
        # Увеличиваем количество
        print(f"[CART DEBUG] add_to_cart: Updating quantity for product_id={product_id}, user_id={user_id}")
        cart_item.quantity += quantity
        cart_item.updated_at = datetime.utcnow()
        is_new = False
    else:
        # Добавляем новый товар в корзину
        print(f"[CART DEBUG] add_to_cart: Adding new item for product_id={product_id}, user_id={user_id}, shop_owner_id={shop_owner_id}, bot_id={bot_id}")
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
    
    print(f"[CART DEBUG] add_to_cart result: product_id={product_id}, user_id={user_id}, quantity={cart_item.quantity}, is_new={is_new}")
    
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
    print(f"[CART DEBUG] remove_from_cart called: product_id={product_id}, shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] remove_from_cart: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] remove_from_cart: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] remove_from_cart: Validation error: {str(e)}")
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
        print(f"[CART DEBUG] remove_from_cart: Cart item not found for product_id={product_id}, user_id={user_id}")
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    db.delete(cart_item)
    db.commit()
    
    print(f"[CART DEBUG] remove_from_cart result: product_id={product_id}, user_id={user_id}, removed=True")
    
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
    print(f"[CART DEBUG] update_cart_item called: product_id={product_id}, quantity={quantity}, selected={selected}, shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] update_cart_item: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] update_cart_item: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] update_cart_item: Validation error: {str(e)}")
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
        print(f"[CART DEBUG] update_cart_item: Cart item not found for product_id={product_id}, user_id={user_id}")
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    cart_item.quantity = quantity
    if selected is not None:
        cart_item.selected = selected
    cart_item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(cart_item)
    
    print(f"[CART DEBUG] update_cart_item result: product_id={product_id}, user_id={user_id}, quantity={cart_item.quantity}, selected={cart_item.selected}")
    
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
    print(f"[CART DEBUG] toggle_cart_item_selection called: product_id={product_id}, shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] toggle_cart_item_selection: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] toggle_cart_item_selection: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] toggle_cart_item_selection: Validation error: {str(e)}")
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
        print(f"[CART DEBUG] toggle_cart_item_selection: Cart item not found for product_id={product_id}, user_id={user_id}")
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    cart_item.selected = not cart_item.selected
    cart_item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(cart_item)
    
    print(f"[CART DEBUG] toggle_cart_item_selection result: product_id={product_id}, user_id={user_id}, selected={cart_item.selected}")
    
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
    print(f"[CART DEBUG] select_all_cart_items called: shop_owner_id={shop_owner_id}, bot_id={bot_id}, selected={selected}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] select_all_cart_items: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] select_all_cart_items: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] select_all_cart_items: Validation error: {str(e)}")
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
    
    print(f"[CART DEBUG] select_all_cart_items result: user_id={user_id}, updated_count={updated_count}, selected={selected}")
    
    return {"updated_count": updated_count, "selected": selected}

@router.post("/remove-selected")
async def remove_selected_cart_items(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить все выбранные товары из корзины"""
    print(f"[CART DEBUG] remove_selected_cart_items called: shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] remove_selected_cart_items: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] remove_selected_cart_items: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] remove_selected_cart_items: Validation error: {str(e)}")
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
    
    print(f"[CART DEBUG] remove_selected_cart_items result: user_id={user_id}, removed_count={removed_count}")
    
    return {"removed_count": removed_count}

@router.get("/list")
async def get_cart(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить список товаров в корзине для текущего пользователя"""
    print(f"[CART DEBUG] get_cart called: shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] get_cart: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] get_cart: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] get_cart: Validation error: {str(e)}")
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
    
    print(f"[CART DEBUG] get_cart: Found {len(cart_items)} cart items")
    
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
    
    print(f"[CART DEBUG] get_cart result: Returning {len(items)} items")
    return items

@router.get("/count")
async def get_cart_count(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить количество товаров в корзине для текущего пользователя"""
    print(f"[CART DEBUG] get_cart_count called: shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] get_cart_count: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] get_cart_count: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] get_cart_count: Validation error: {str(e)}")
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
    
    print(f"[CART DEBUG] get_cart_count result: user_id={user_id}, shop_owner_id={shop_owner_id}, count={count}, total_quantity={total_quantity}")
    
    return {"count": count, "total_quantity": total_quantity}

@router.post("/clear")
async def clear_cart(
    shop_owner_id: int = Query(...),
    bot_id: Optional[int] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Очистить всю корзину"""
    print(f"[CART DEBUG] clear_cart called: shop_owner_id={shop_owner_id}, bot_id={bot_id}")
    
    if not x_telegram_init_data:
        print("[CART DEBUG] clear_cart: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[CART DEBUG] clear_cart: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CART DEBUG] clear_cart: Validation error: {str(e)}")
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
    
    print(f"[CART DEBUG] clear_cart result: user_id={user_id}, removed_count={removed_count}")
    
    return {"removed_count": removed_count}
