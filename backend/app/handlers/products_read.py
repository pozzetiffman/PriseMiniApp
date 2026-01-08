"""
Обработчики для чтения товаров
"""
import json
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..db import models, database
from ..utils.products_utils import make_full_url


def get_product_by_id(
    product_id: int,
    db: Session
):
    """Получить товар по его ID (из любого магазина)"""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Преобразуем images_urls из JSON строки в список
    images_list = []
    if product.images_urls:
        try:
            images_list = json.loads(product.images_urls)
        except:
            images_list = []
    
    # Для обратной совместимости: если есть image_url, но нет images_urls, добавляем его
    if not images_list and product.image_url:
        images_list = [product.image_url]
    
    # Преобразуем относительные пути в полные HTTPS URL для Telegram Mini App
    images_list = [make_full_url(img_url) for img_url in images_list if img_url]
    image_url_full = make_full_url(product.image_url) if product.image_url else None
    
    # Проверяем активную резервацию (используем sync_product_id для надежного поиска)
    sync_id = product.sync_product_id or product.id
    active_reservation = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id.in_(
                db.query(models.Product.id).filter(
                    models.Product.user_id == product.user_id,
                    models.Product.sync_product_id == sync_id
                )
            ),
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow()
        )
    ).first()
    
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "price": product.price,
        "image_url": image_url_full,
        "images_urls": images_list,
        "discount": product.discount,
        "category_id": product.category_id,
        "user_id": product.user_id,
        "bot_id": product.bot_id,
        "is_hot_offer": product.is_hot_offer,
        "quantity": product.quantity,
        "is_sold": product.is_sold,
        "is_made_to_order": product.is_made_to_order,
        "is_for_sale": getattr(product, 'is_for_sale', False),
        "price_from": getattr(product, 'price_from', None),
        "price_to": getattr(product, 'price_to', None),
        "price_fixed": getattr(product, 'price_fixed', None),
        "price_type": getattr(product, 'price_type', 'range'),
        "quantity_from": getattr(product, 'quantity_from', None),
        "quantity_unit": getattr(product, 'quantity_unit', None),
        "is_hidden": getattr(product, 'is_hidden', False),
        "has_active_reservation": active_reservation is not None
    }


def get_products(
    user_id: int,
    category_id: Optional[int],
    bot_id: Optional[int],
    db: Session,
    viewer_id: Optional[int] = None  # ID пользователя, который просматривает товары (для фильтрации скрытых)
):
    """Получить список товаров с автоматической синхронизацией между основным магазином и ботами"""
    print(f"DEBUG: get_products called with user_id={user_id}, category_id={category_id}, bot_id={bot_id}")
    
    # Автоматическая синхронизация: проверяем расхождения между основным магазином и ботами
    # Находим все подключенные боты пользователя
    connected_bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == user_id,
        models.Bot.is_active == True
    ).all()
    
    if connected_bots:
        # Получаем товары из основного магазина
        main_products = db.query(models.Product).filter(
            models.Product.user_id == user_id,
            models.Product.bot_id == None,
            models.Product.is_sold == False
        ).all()
        
        # Получаем товары из всех ботов
        for bot in connected_bots:
            bot_products = db.query(models.Product).filter(
                models.Product.user_id == user_id,
                models.Product.bot_id == bot.id,
                models.Product.is_sold == False
            ).all()
            
            # Проверяем товары в боте, которых нет в основном магазине
            for bot_product in bot_products:
                sync_id = bot_product.sync_product_id
                
                # Ищем соответствующий товар в основном магазине
                found_in_main = False
                if sync_id:
                    found_in_main = any(
                        p.sync_product_id == sync_id or p.id == sync_id 
                        for p in main_products
                    )
                
                # Если не нашли по sync_id, ищем по имени и цене
                if not found_in_main:
                    found_in_main = any(
                        p.name == bot_product.name and p.price == bot_product.price
                        for p in main_products
                    )
                
                # Если товар в боте не найден в основном магазине - синхронизируем
                if not found_in_main:
                    print(f"🔄 Auto-syncing product '{bot_product.name}' from bot {bot.id} to main shop")
                    # Находим соответствующую категорию в основном боте по имени
                    category_id_for_main = None
                    if bot_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == bot_product.category_id
                        ).first()
                        if original_category:
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == None,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_main = matching_category.id
                    
                    new_main_product = models.Product(
                        name=bot_product.name,
                        description=bot_product.description,
                        price=bot_product.price,
                        image_url=bot_product.image_url,
                        images_urls=bot_product.images_urls,
                        discount=bot_product.discount,
                        user_id=user_id,
                        bot_id=None,
                        sync_product_id=None,  # Будет установлен после получения ID
                        is_hot_offer=bot_product.is_hot_offer,
                        quantity=bot_product.quantity,
                        is_sold=bot_product.is_sold,
                        is_made_to_order=bot_product.is_made_to_order,
                        is_for_sale=bot_product.is_for_sale,
                        price_from=bot_product.price_from,
                        price_to=bot_product.price_to,
                        price_fixed=bot_product.price_fixed,
                        price_type=bot_product.price_type,
                        quantity_from=bot_product.quantity_from,
                        quantity_unit=bot_product.quantity_unit,
                        quantity_show_enabled=bot_product.quantity_show_enabled,
                        is_hidden=bot_product.is_hidden,
                        category_id=category_id_for_main
                    )
                    db.add(new_main_product)
                    db.flush()
                    new_main_product.sync_product_id = new_main_product.id
                    if not bot_product.sync_product_id:
                        bot_product.sync_product_id = new_main_product.id
                    db.commit()
                    print(f"✅ Auto-synced product '{bot_product.name}' (id={new_main_product.id}) to main shop")
        
        # Также синхронизируем товары из основного магазина в боты
        for main_product in main_products:
            if not main_product.sync_product_id:
                main_product.sync_product_id = main_product.id
                db.flush()
            
            sync_id = main_product.sync_product_id
            for bot in connected_bots:
                # Ищем товар в боте по sync_product_id
                existing = None
                if sync_id:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.sync_product_id == sync_id
                    ).first()
                
                # Если не нашли, ищем по имени и цене
                if not existing:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == main_product.name,
                        models.Product.price == main_product.price
                    ).first()
                
                # Если товар в основном магазине не найден в боте - синхронизируем
                if not existing:
                    print(f"🔄 Auto-syncing product '{main_product.name}' from main shop to bot {bot.id}")
                    # Находим соответствующую категорию в боте по имени
                    category_id_for_bot = None
                    if main_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == main_product.category_id
                        ).first()
                        if original_category:
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
                    new_bot_product = models.Product(
                        name=main_product.name,
                        description=main_product.description,
                        price=main_product.price,
                        image_url=main_product.image_url,
                        images_urls=main_product.images_urls,
                        discount=main_product.discount,
                        user_id=user_id,
                        bot_id=bot.id,
                        sync_product_id=sync_id,
                        is_hot_offer=main_product.is_hot_offer,
                        quantity=main_product.quantity,
                        is_sold=main_product.is_sold,
                        is_made_to_order=main_product.is_made_to_order,
                        is_for_sale=main_product.is_for_sale,
                        price_from=main_product.price_from,
                        price_to=main_product.price_to,
                        price_fixed=main_product.price_fixed,
                        price_type=main_product.price_type,
                        quantity_from=main_product.quantity_from,
                        quantity_unit=main_product.quantity_unit,
                        quantity_show_enabled=main_product.quantity_show_enabled,
                        is_hidden=main_product.is_hidden,
                        category_id=category_id_for_bot
                    )
                    db.add(new_bot_product)
                    db.commit()
                    print(f"✅ Auto-synced product '{main_product.name}' (id={new_bot_product.id}) to bot {bot.id}")
    
    query = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.is_sold == False  # Не показываем проданные товары на витрине
    )
    
    # Фильтруем скрытые товары для клиентов (если viewer_id указан и не является владельцем)
    # Если viewer_id не указан или равен user_id (владелец), показываем все товары
    if viewer_id is not None and viewer_id != user_id:
        # Клиент просматривает - скрываем товары с is_hidden = True
        query = query.filter(models.Product.is_hidden == False)
    # Если bot_id указан - фильтруем по bot_id (независимый магазин бота)
    # Если bot_id не указан - фильтруем по bot_id = None (основной бот)
    if bot_id is not None:
        query = query.filter(models.Product.bot_id == bot_id)
    else:
        query = query.filter(models.Product.bot_id == None)
    
    if category_id is not None:
        query = query.filter(models.Product.category_id == category_id)
    products = query.all()
    # Логируем информацию о товарах и их изображениях
    print(f"DEBUG: Found {len(products)} products for user {user_id}")
    result = []
    for prod in products:
        # Преобразуем images_urls из JSON строки в список
        images_list = []
        if prod.images_urls:
            try:
                images_list = json.loads(prod.images_urls)
            except:
                images_list = []
        
        # Для обратной совместимости: если есть image_url, но нет images_urls, добавляем его
        if not images_list and prod.image_url:
            images_list = [prod.image_url]
        
        # Преобразуем относительные пути в полные HTTPS URL для Telegram Mini App
        images_list = [make_full_url(img_url) for img_url in images_list if img_url]
        image_url_full = make_full_url(prod.image_url) if prod.image_url else None
        
        # Проверяем активную резервацию
        # Используем sync_product_id для надежного поиска всех синхронизированных копий
        sync_id = prod.sync_product_id or prod.id
        
        # Находим все синхронизированные копии товара по sync_product_id
        synced_products = db.query(models.Product).filter(
            models.Product.user_id == prod.user_id,
            models.Product.sync_product_id == sync_id
        ).all()
        
        # Fallback: если sync_product_id не установлен, ищем по имени и цене (для обратной совместимости)
        if not synced_products:
            synced_products = db.query(models.Product).filter(
                models.Product.user_id == prod.user_id,
                models.Product.name == prod.name,
                models.Product.price == prod.price
            ).all()
        
        # Проверяем активные резервации для всех синхронизированных копий
        active_reservation = db.query(models.Reservation).filter(
            and_(
                models.Reservation.product_id.in_([p.id for p in synced_products]),
                models.Reservation.is_active == True,
                models.Reservation.reserved_until > datetime.utcnow()
            )
        ).first()
        
        has_reservation = active_reservation is not None
        
        # Подсчитываем количество активных резерваций для всех синхронизированных копий товара
        active_reservations_count = 0
        if has_reservation:
            active_reservations_count = db.query(models.Reservation).filter(
                and_(
                    models.Reservation.product_id.in_([p.id for p in synced_products]),
                    models.Reservation.is_active == True,
                    models.Reservation.reserved_until > datetime.utcnow()
                )
            ).count()
        
        # Формируем объект резервации для фронтенда
        reservation_data = None
        if active_reservation:
            reservation_data = {
                "id": active_reservation.id,
                "reserved_until": active_reservation.reserved_until.isoformat() if active_reservation.reserved_until else None,
                "reserved_by_user_id": active_reservation.reserved_by_user_id,
                "active_count": active_reservations_count
            }
        
        # Преобразуем is_made_to_order в bool
        is_made_to_order = bool(getattr(prod, 'is_made_to_order', False))
        
        print(f"DEBUG: Product {prod.id} '{prod.name}' has {'active' if has_reservation else 'no active'} reservation")
        print(f"DEBUG: Product {prod.id} '{prod.name}' - is_made_to_order raw={getattr(prod, 'is_made_to_order', False)} (type: {type(getattr(prod, 'is_made_to_order', False))}), converted={is_made_to_order}")
        print(f"DEBUG: Product {prod.id} '{prod.name}' - images_urls: {len(images_list)} images")
        if images_list:
            first_image = images_list[0]
            print(f"DEBUG: Product {prod.id} first image URL: {first_image}")
            if '/api/images/' in first_image:
                print(f"OK: Product {prod.id} image URL correctly uses /api/images/")
            elif '/static/uploads/' in first_image:
                print(f"WARNING: Product {prod.id} image URL still contains /static/uploads/ - should use /api/images/")
        
        result.append({
            "id": prod.id,
            "name": prod.name,
            "description": prod.description,
            "price": prod.price,
            "image_url": image_url_full,
            "images_urls": images_list,
            "discount": prod.discount,
            "category_id": prod.category_id,
            "user_id": prod.user_id,
            "is_hot_offer": getattr(prod, 'is_hot_offer', False),
            "quantity": getattr(prod, 'quantity', 0),
            "is_reserved": has_reservation,
            "is_made_to_order": is_made_to_order,
            "is_for_sale": getattr(prod, 'is_for_sale', False),
            "price_from": getattr(prod, 'price_from', None),
            "price_to": getattr(prod, 'price_to', None),
            "price_fixed": getattr(prod, 'price_fixed', None),
            "price_type": getattr(prod, 'price_type', 'range'),
            "quantity_from": getattr(prod, 'quantity_from', None),
            "quantity_unit": getattr(prod, 'quantity_unit', None),
            "quantity_show_enabled": getattr(prod, 'quantity_show_enabled', None),
            "is_hidden": getattr(prod, 'is_hidden', False),
            "reservation": reservation_data
        })
    
    return result

