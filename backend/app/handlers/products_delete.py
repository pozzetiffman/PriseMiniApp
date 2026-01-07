"""
Обработчики для удаления товаров
"""
import os
import json
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, Query, Header, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from ..db import models, database
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.products_sync import sync_product_to_all_bots


async def delete_product(
    product_id: int,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Удаление товара
    
    Args:
        product_id: ID товара для удаления
        user_id: ID пользователя (владельца магазина)
        x_telegram_init_data: Telegram initData для авторизации (опционально)
        db: Сессия базы данных
        
    Returns:
        Сообщение об успешном удалении
        
    Raises:
        HTTPException: Если товар не найден или нет прав на удаление
    """
    # Проверяем, что товар существует и принадлежит пользователю
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Если есть initData - проверяем авторизацию через него (запрос от WebApp)
    if x_telegram_init_data:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        
        try:
            # Используем функцию для валидации с любым ботом
            authenticated_user_id, _, _ = await validate_init_data_multi_bot(
                x_telegram_init_data,
                db,
                default_bot_token=bot_token if bot_token else None
            )
            
            # Проверяем, что авторизованный пользователь является владельцем
            if authenticated_user_id != user_id:
                raise HTTPException(status_code=403, detail="You don't have permission to delete this product")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    # Если нет initData - это запрос от бота (localhost), проверяем только что user_id совпадает с владельцем товара
    # (товар уже проверен выше, что он принадлежит user_id)
    
    # Сначала синхронизируем удаление товара во все боты (двусторонняя синхронизация)
    # Это удалит все синхронизированные копии товара из БД
    sync_product_to_all_bots(db_product, db, action="delete")
    
    # Теперь проверяем, используются ли файлы изображений другими товарами
    # Собираем все пути к изображениям, которые нужно проверить
    images_to_check = []
    
    # Получаем список изображений из images_urls
    if db_product.images_urls:
        try:
            images_to_check = json.loads(db_product.images_urls)
        except:
            pass
    
    # Добавляем image_url если он есть и его нет в списке
    if db_product.image_url and db_product.image_url not in images_to_check:
        images_to_check.append(db_product.image_url)
    
    # Удаляем товар из БД
    db.delete(db_product)
    db.commit()
    
    # НЕ удаляем файлы изображений автоматически!
    # Файлы могут использоваться другими товарами (включая синхронизированные копии)
    # или могут быть восстановлены позже
    # Удаление файлов должно быть явным действием администратора
    print(f"DEBUG: Product deleted, but image files are preserved (may be used by other products or synced copies)")
    for img_url in images_to_check:
        if img_url and img_url.startswith('/static/'):
            file_path = img_url[1:]  # Убираем первый /
            
            # Проверяем, используется ли этот файл другими товарами
            # Ищем товары с таким же image_url или в images_urls
            other_products_with_image = db.query(models.Product).filter(
                or_(
                    models.Product.image_url == img_url,
                    models.Product.images_urls.like(f'%{img_url}%')
                )
            ).count()
            
            if other_products_with_image > 0:
                print(f"DEBUG: Image file {file_path} is still used by {other_products_with_image} other product(s), preserved")
            else:
                print(f"DEBUG: Image file {file_path} is not used by any other product, but preserved for safety (can be manually deleted later)")
    
    return {"message": "Product deleted"}


async def mark_product_sold(
    product_id: int,
    user_id: int = Query(...),
    quantity: int = Query(1, ge=1),  # Количество для продажи (по умолчанию 1)
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Помечает товар как проданный: уменьшает quantity и добавляет в историю продаж
    
    Args:
        product_id: ID товара для пометки как проданного
        user_id: ID пользователя (владельца магазина)
        quantity: Количество товара для продажи (по умолчанию 1)
        x_telegram_init_data: Telegram initData для авторизации (обязательно)
        db: Сессия базы данных
        
    Returns:
        Информация о товаре после продажи (id, is_sold, quantity, message)
        
    Raises:
        HTTPException: Если товар не найден, нет прав, недостаточно товара или нет initData
    """
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        # Используем функцию для валидации с любым ботом
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что товар существует и принадлежит пользователю
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, что авторизованный пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to mark this product as sold")
    
    # Проверяем количество товара
    product_quantity = db_product.quantity or 0
    
    # Если товар под заказ (is_made_to_order = True), не проверяем quantity
    is_made_to_order = db_product.is_made_to_order == True or db_product.is_made_to_order == 1
    
    if not is_made_to_order and product_quantity < quantity:
        raise HTTPException(
            status_code=400, 
            detail=f"Недостаточно товара для продажи. В наличии: {product_quantity} шт., запрошено: {quantity} шт."
        )
    
    # Уменьшаем quantity товара
    if not is_made_to_order:
        new_quantity = product_quantity - quantity
        db_product.quantity = max(0, new_quantity)  # Не даем quantity стать отрицательным
        
        # Если quantity стал 0 или меньше, помечаем товар как проданный
        if new_quantity <= 0:
            db_product.is_sold = True
    else:
        # Для товаров под заказ просто помечаем как проданный
        db_product.is_sold = True
    
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    
    # Создаем запись в истории продаж
    sold_product = models.SoldProduct(
        product_id=product_id,
        user_id=user_id,
        name=db_product.name,
        description=db_product.description,
        price=db_product.price,
        discount=db_product.discount,
        image_url=db_product.image_url,
        images_urls=db_product.images_urls,
        category_id=db_product.category_id,
        quantity=quantity,
        sold_at=datetime.utcnow()
    )
    db.add(sold_product)
    db.commit()
    
    return {
        "id": db_product.id,
        "is_sold": db_product.is_sold,
        "quantity": db_product.quantity,
        "message": f"Продано {quantity} шт. товара"
    }

