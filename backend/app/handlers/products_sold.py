"""
Обработчики для работы с проданными товарами (история продаж)
"""
import os
import json
from typing import Optional, List
from fastapi import HTTPException, Query, Header, Depends
from sqlalchemy.orm import Session
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.products_utils import make_full_url


async def get_sold_products(
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получает список проданных товаров (история продаж)"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что авторизованный пользователь запрашивает свои продажи
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to view these sold products")
    
    # Получаем проданные товары, отсортированные по дате продажи (новые сначала)
    sold_products = db.query(models.SoldProduct).filter(
        models.SoldProduct.user_id == user_id
    ).order_by(models.SoldProduct.sold_at.desc()).all()
    
    result = []
    for sold in sold_products:
        # Преобразуем images_urls из JSON строки в список
        images_list = []
        if sold.images_urls:
            try:
                images_list = json.loads(sold.images_urls)
            except:
                images_list = []
        
        # Для обратной совместимости: если есть image_url, но нет images_urls, добавляем его
        if not images_list and sold.image_url:
            images_list = [sold.image_url]
        
        # Преобразуем относительные пути в полные HTTPS URL
        images_list = [make_full_url(img_url) for img_url in images_list if img_url]
        image_url_full = make_full_url(sold.image_url) if sold.image_url else None
        
        result.append({
            "id": sold.id,
            "product_id": sold.product_id,
            "name": sold.name,
            "description": sold.description,
            "price": sold.price,
            "discount": sold.discount,
            "image_url": image_url_full,
            "images_urls": images_list,
            "category_id": sold.category_id,
            "quantity": sold.quantity or 1,  # Количество проданного товара
            "sold_at": sold.sold_at.isoformat() if sold.sold_at else None
        })
    
    return result


async def delete_sold_product(
    sold_id: int,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить запись о проданном товаре"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что авторизованный пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this sold product")
    
    # Находим запись о проданном товаре
    sold_product = db.query(models.SoldProduct).filter(
        models.SoldProduct.id == sold_id,
        models.SoldProduct.user_id == user_id
    ).first()
    
    if not sold_product:
        raise HTTPException(status_code=404, detail="Sold product not found")
    
    # Удаляем запись
    db.delete(sold_product)
    db.commit()
    
    return {"message": "Запись о проданном товаре удалена", "id": sold_id}


async def delete_sold_products(
    sold_ids: List[int],
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить несколько записей о проданных товарах"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что авторизованный пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete these sold products")
    
    # Проверяем, что список ID не пустой
    if not sold_ids or len(sold_ids) == 0:
        raise HTTPException(status_code=400, detail="No sold product IDs provided")
    
    id_list = sold_ids
    
    # Находим все записи о проданных товарах
    sold_products = db.query(models.SoldProduct).filter(
        models.SoldProduct.id.in_(id_list),
        models.SoldProduct.user_id == user_id
    ).all()
    
    if not sold_products:
        raise HTTPException(status_code=404, detail="No sold products found")
    
    # Удаляем записи
    deleted_count = len(sold_products)
    for sold_product in sold_products:
        db.delete(sold_product)
    
    db.commit()
    
    return {
        "message": f"Удалено записей: {deleted_count}",
        "deleted_count": deleted_count,
        "deleted_ids": [sp.id for sp in sold_products]
    }

