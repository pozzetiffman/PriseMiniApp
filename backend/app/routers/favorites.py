from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
import os
from dotenv import load_dotenv

load_dotenv()

# Telegram Bot Token для валидации
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/favorites", tags=["favorites"])

@router.get("/check/{product_id}")
async def check_favorite(
    product_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Проверить, добавлен ли товар в избранное для текущего пользователя"""
    print(f"[FAVORITES DEBUG] check_favorite called: product_id={product_id}")
    
    if not x_telegram_init_data:
        print("[FAVORITES DEBUG] check_favorite: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[FAVORITES DEBUG] check_favorite: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FAVORITES DEBUG] check_favorite: Validation error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем наличие товара в избранном
    favorite = db.query(models.Favorite).filter(
        and_(
            models.Favorite.product_id == product_id,
            models.Favorite.user_id == user_id
        )
    ).first()
    
    is_favorite = favorite is not None
    print(f"[FAVORITES DEBUG] check_favorite result: product_id={product_id}, user_id={user_id}, is_favorite={is_favorite}")
    
    return {"is_favorite": is_favorite}

@router.post("/toggle/{product_id}")
async def toggle_favorite(
    product_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Переключить статус избранного для товара (добавить/удалить)"""
    print(f"[FAVORITES DEBUG] toggle_favorite called: product_id={product_id}")
    
    if not x_telegram_init_data:
        print("[FAVORITES DEBUG] toggle_favorite: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[FAVORITES DEBUG] toggle_favorite: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FAVORITES DEBUG] toggle_favorite: Validation error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем наличие товара
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        print(f"[FAVORITES DEBUG] toggle_favorite: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, есть ли уже товар в избранном
    favorite = db.query(models.Favorite).filter(
        and_(
            models.Favorite.product_id == product_id,
            models.Favorite.user_id == user_id
        )
    ).first()
    
    if favorite:
        # Удаляем из избранного
        print(f"[FAVORITES DEBUG] toggle_favorite: Removing favorite for product_id={product_id}, user_id={user_id}")
        db.delete(favorite)
        is_favorite = False
    else:
        # Добавляем в избранное
        print(f"[FAVORITES DEBUG] toggle_favorite: Adding favorite for product_id={product_id}, user_id={user_id}, shop_owner_id={product.user_id}")
        new_favorite = models.Favorite(
            product_id=product_id,
            user_id=user_id,
            shop_owner_id=product.user_id,
            created_at=datetime.utcnow()
        )
        db.add(new_favorite)
        is_favorite = True
    
    db.commit()
    print(f"[FAVORITES DEBUG] toggle_favorite result: product_id={product_id}, user_id={user_id}, is_favorite={is_favorite}")
    
    return {"is_favorite": is_favorite}

@router.get("/list")
async def get_favorites(
    shop_owner_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить список избранных товаров для текущего пользователя"""
    print(f"[FAVORITES DEBUG] get_favorites called: shop_owner_id={shop_owner_id}")
    
    if not x_telegram_init_data:
        print("[FAVORITES DEBUG] get_favorites: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[FAVORITES DEBUG] get_favorites: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FAVORITES DEBUG] get_favorites: Validation error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем все избранные товары пользователя для указанного магазина
    favorites = db.query(models.Favorite).join(
        models.Product
    ).filter(
        and_(
            models.Favorite.user_id == user_id,
            models.Favorite.shop_owner_id == shop_owner_id,
            models.Product.is_sold == False,  # Только не проданные товары
            models.Product.is_hidden == False  # Только не скрытые товары
        )
    ).order_by(models.Favorite.created_at.desc()).all()
    
    print(f"[FAVORITES DEBUG] get_favorites: Found {len(favorites)} favorites")
    
    # Формируем список товаров
    products = []
    for favorite in favorites:
        product = favorite.product
        if product:  # Проверяем, что товар еще существует
            products.append({
                "id": product.id,
                "name": product.name,
                "description": product.description,
                "price": product.price,
                "discount": product.discount,
                "image_url": product.image_url,
                "images_urls": product.images_urls,
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
                "category_id": product.category_id,
                "created_at": favorite.created_at.isoformat() if favorite.created_at else None
            })
    
    print(f"[FAVORITES DEBUG] get_favorites result: Returning {len(products)} products")
    return products

@router.get("/count")
async def get_favorites_count(
    shop_owner_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить количество избранных товаров для текущего пользователя"""
    print(f"[FAVORITES DEBUG] get_favorites_count called: shop_owner_id={shop_owner_id}")
    
    if not x_telegram_init_data:
        print("[FAVORITES DEBUG] get_favorites_count: No initData provided")
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
        print(f"[FAVORITES DEBUG] get_favorites_count: user_id={user_id}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FAVORITES DEBUG] get_favorites_count: Validation error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Подсчитываем избранные товары пользователя для указанного магазина
    count = db.query(models.Favorite).join(
        models.Product
    ).filter(
        and_(
            models.Favorite.user_id == user_id,
            models.Favorite.shop_owner_id == shop_owner_id,
            models.Product.is_sold == False,  # Только не проданные товары
            models.Product.is_hidden == False  # Только не скрытые товары
        )
    ).count()
    
    print(f"[FAVORITES DEBUG] get_favorites_count result: user_id={user_id}, shop_owner_id={shop_owner_id}, count={count}")
    
    return {"count": count}
