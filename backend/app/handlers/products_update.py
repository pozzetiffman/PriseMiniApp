"""
Обработчики для обновления товаров
"""
import os
import requests
from typing import Optional
from fastapi import HTTPException, Header
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import distinct
from ..db import models
from ..models import product as schemas
from ..utils.products_sync import sync_product_to_all_bots, sync_product_to_all_bots_with_rename
from ..utils.products_utils import get_bot_token_for_notifications, normalize_action_flags
from ..utils.telegram_auth import validate_init_data_multi_bot


def _get_sync_siblings(db: Session, db_product: models.Product):
    """
    Возвращает список sync-копий товара (другой bot_id или main), чтобы применить к ним
    те же флаги action type. Иначе клиент на витрине видит копию с устаревшими флагами.
    """
    user_id = db_product.user_id
    sync_id = getattr(db_product, "sync_product_id", None) or db_product.id
    out = []
    # Главная копия (main bot): id == sync_id, если мы редактировали копию в боте
    if sync_id != db_product.id:
        main = db.query(models.Product).filter(
            models.Product.id == sync_id,
            models.Product.user_id == user_id,
        ).first()
        if main:
            out.append(main)
    # Все копии, привязанные к этому товару (sync_product_id == id текущего), кроме самого себя
    others = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.sync_product_id == db_product.id,
        models.Product.id != db_product.id,
    ).all()
    out.extend(others)
    return out


def update_product(
    product_id: int,
    product: schemas.ProductCreate,
    user_id: int,
    db: Session
):
    """
    Полное обновление товара
    
    Args:
        product_id: ID товара для обновления
        product: Данные товара для обновления
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Обновленный товар
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    for key, value in product.model_dump().items():
        setattr(db_product, key, value)
    
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    return db_product


def toggle_hot_offer(
    product_id: int,
    hot_offer_update: schemas.HotOfferUpdate,
    user_id: int,
    db: Session
):
    """
    Переключение статуса 'горящее предложение' для товара
    
    Args:
        product_id: ID товара для обновления
        hot_offer_update: Данные для обновления статуса горящего предложения
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    db_product.is_hot_offer = hot_offer_update.is_hot_offer
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "is_hot_offer": db_product.is_hot_offer,
        "message": f"Горящее предложение {'включено' if db_product.is_hot_offer else 'выключено'}"
    }


def update_price_discount(
    product_id: int,
    price_discount_update: schemas.PriceDiscountUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление цены и скидки товара с отправкой уведомлений пользователям
    
    Args:
        product_id: ID товара для обновления
        price_discount_update: Данные для обновления цены и скидки
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Сохраняем старые значения для сравнения
    old_price = db_product.price
    old_price_card = getattr(db_product, 'price_card', None)
    old_price_cash = getattr(db_product, 'price_cash', None)
    old_discount = db_product.discount
    
    # Обновляем цены: price_card/price_cash (витрина), legacy price для обратной совместимости
    if price_discount_update.price_card is not None:
        db_product.price_card = price_discount_update.price_card
        db_product.price = price_discount_update.price_card
    else:
        if price_discount_update.price is not None:
            db_product.price = price_discount_update.price
            if db_product.price_card is None:
                db_product.price_card = price_discount_update.price
    if hasattr(price_discount_update, 'price_cash') and getattr(price_discount_update, 'model_fields_set', None) and 'price_cash' in price_discount_update.model_fields_set:
        db_product.price_cash = price_discount_update.price_cash
    db_product.discount = price_discount_update.discount
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    # Определяем, что изменилось (для уведомлений)
    price_changed = (
        old_price != (price_discount_update.price_card if price_discount_update.price_card is not None else price_discount_update.price)
        or old_price_card != price_discount_update.price_card
        or old_price_cash != price_discount_update.price_cash
    )
    discount_changed = old_discount != price_discount_update.discount
    
    # Отправляем уведомления пользователям, которые посещали магазин
    if price_changed or discount_changed:
        try:
            # Получаем всех пользователей для уведомлений:
            # 1. Те, кто делал резервации в этом магазине
            # 2. Те, кто просматривал конкретный товар (модальное окно)
            # 3. Те, кто посещал магазин в целом (просмотр списка товаров)
            
            visited_user_ids = set()
            
            # 1. Пользователи, которые делали резервации в этом магазине
            reservations = db.query(distinct(models.Reservation.reserved_by_user_id)).filter(
                models.Reservation.user_id == user_id
            ).all()
            reservation_users = []
            for row in reservations:
                if row[0] is not None:
                    visited_user_ids.add(row[0])
                    reservation_users.append(row[0])
            print(f"📊 Notification: Found {len(reservation_users)} users from reservations: {reservation_users}")
            
            # 2. Пользователи, которые просматривали конкретный товар (модальное окно)
            product_views = db.query(distinct(models.ShopVisit.visitor_id)).filter(
                models.ShopVisit.shop_owner_id == user_id,
                models.ShopVisit.product_id == product_id
            ).all()
            product_view_users = []
            for row in product_views:
                if row[0] is not None:
                    visited_user_ids.add(row[0])
                    product_view_users.append(row[0])
            print(f"📊 Notification: Found {len(product_view_users)} users who viewed product {product_id}: {product_view_users}")
            
            # 3. Пользователи, которые посещали магазин в целом (просмотр списка товаров)
            shop_visits = db.query(distinct(models.ShopVisit.visitor_id)).filter(
                models.ShopVisit.shop_owner_id == user_id,
                models.ShopVisit.product_id.is_(None)
            ).all()
            shop_visit_users = []
            for row in shop_visits:
                if row[0] is not None:
                    visited_user_ids.add(row[0])
                    shop_visit_users.append(row[0])
            print(f"📊 Notification: Found {len(shop_visit_users)} users who visited shop: {shop_visit_users}")
            
            # Преобразуем в список для итерации
            visited_user_ids = list(visited_user_ids)
            
            print(f"📢 Notification: Found {len(visited_user_ids)} users to notify for product {product_id}")
            print(f"📢 Notification: User IDs: {visited_user_ids}")
            
            if not visited_user_ids:
                print("⚠️ Notification: No users found to notify")
                return {
                    "id": db_product.id,
                    "price": db_product.price,
                    "discount": db_product.discount,
                    "message": "Товар обновлен, но нет пользователей для уведомлений"
                }
            
            # Отправляем уведомления через HTTP запрос к боту
            # Используем токен подключенного бота админа, если он есть
            
            bot_token = get_bot_token_for_notifications(user_id, db)
            if not bot_token:
                print("❌ Notification: Bot token not available")
                return {
                    "id": db_product.id,
                    "price": db_product.price,
                    "discount": db_product.discount,
                    "message": "Товар обновлен, но токен бота не настроен"
                }
            
            bot_api_url = f"https://api.telegram.org/bot{bot_token}"
            
            # Формируем сообщение
            shop_settings = db.query(models.ShopSettings).filter(
                models.ShopSettings.user_id == user_id
            ).first()
            shop_name = shop_settings.shop_name if shop_settings and shop_settings.shop_name else "магазин"
            
            message = f"🔔 **Обновление в {shop_name}**\n\n"
            message += f"📦 Товар: {db_product.name}\n\n"
            
            if price_changed:
                if price_discount_update.price is not None:
                    message += f"💰 **Новая цена:** {price_discount_update.price} ₽"
                    if old_price is not None:
                        message += f" (было: {old_price} ₽)"
                    message += "\n"
                else:
                    message += f"💰 **Цена:** Цена по запросу"
                    if old_price is not None:
                        message += f" (было: {old_price} ₽)"
                    message += "\n"
            
            if discount_changed:
                message += f"🎯 **Скидка:** {price_discount_update.discount}%"
                if old_discount:
                    message += f" (было: {old_discount}%)"
                message += "\n"
            
            # Вычисляем цену со скидкой только если цена указана
            if price_discount_update.discount > 0 and price_discount_update.price is not None:
                final_price = price_discount_update.price * (1 - price_discount_update.discount / 100)
                message += f"\n💵 **Цена со скидкой:** {final_price:.0f} ₽"
            
            # Отправляем уведомления всем пользователям
            sent_count = 0
            failed_count = 0
            for visited_user_id in visited_user_ids:
                try:
                    print(f"📤 Sending notification to user {visited_user_id}...")
                    response = requests.post(
                        f"{bot_api_url}/sendMessage",
                        json={
                            "chat_id": visited_user_id,
                            "text": message,
                            "parse_mode": "Markdown"
                        },
                        timeout=5
                    )
                    if response.status_code == 200:
                        print(f"✅ Notification sent successfully to user {visited_user_id}")
                        sent_count += 1
                    else:
                        print(f"❌ Failed to send notification to user {visited_user_id}: status={response.status_code}, response={response.text}")
                        failed_count += 1
                except Exception as e:
                    print(f"❌ Error sending notification to user {visited_user_id}: {e}")
                    failed_count += 1
                    # Продолжаем отправку другим пользователям даже при ошибке
            
            print(f"📊 Notification summary: {sent_count} sent, {failed_count} failed out of {len(visited_user_ids)} total")
        except Exception as e:
            print(f"Error sending notifications: {e}")
            # Не прерываем обновление товара, даже если уведомления не отправились
    
    return {
        "id": db_product.id,
        "price": db_product.price,
        "discount": db_product.discount,
        "message": "Товар обновлен, уведомления отправлены"
    }


def update_name_description(
    product_id: int,
    name_description_update: schemas.NameDescriptionUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление названия и описания товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        name_description_update: Данные для обновления названия и описания
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # КРИТИЧНО: Сохраняем старое имя для синхронизации
    # Синхронизация ищет товар по имени, поэтому нужно использовать старое имя для поиска
    old_name = db_product.name
    old_price = db_product.price  # Также сохраняем цену для более точного поиска
    
    # Фильтрация UI-текста из description: если description содержит текст настроек количества,
    # это явно ошибка (UI-текст попал в поле описания товара) — очищаем его.
    description_to_save = name_description_update.description
    if description_to_save and (
        'Показывать количество товара на витрине' in description_to_save or
        '• Использовать настройку магазина' in description_to_save or
        '• Показывать - всегда показывать количество' in description_to_save or
        '• Не показывать - скрыть количество' in description_to_save
    ):
        print(f"[DESCRIPTION FILTER] Filtered UI text from description for product_id={product_id}, original_length={len(description_to_save)}")
        description_to_save = None  # Очищаем description от UI-текста
    
    # Обновляем значения
    db_product.name = name_description_update.name
    db_product.description = description_to_save
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    # Используем специальную функцию для синхронизации с переименованием
    sync_product_to_all_bots_with_rename(db_product, db, old_name=old_name, old_price=old_price)
    
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "name": db_product.name,
        "description": db_product.description,
        "message": "Название и описание товара обновлены"
    }


def update_quantity(
    product_id: int,
    quantity_update: schemas.QuantityUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление количества товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        quantity_update: Данные для обновления количества
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем количество и единицу измерения
    db_product.quantity = quantity_update.quantity
    if quantity_update.quantity_unit is not None:
        db_product.quantity_unit = quantity_update.quantity_unit
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "quantity": db_product.quantity,
        "message": "Количество товара обновлено"
    }


def update_made_to_order(
    product_id: int,
    made_to_order_update: schemas.MadeToOrderUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление статуса 'под заказ' для товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        made_to_order_update: Данные для обновления статуса "под заказ"
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    # Логирование входа в handler для диагностики отсутствующих PATCH запросов
    print(f"[ACTION FLAG PATCH HIT] endpoint=update-made-to-order product_id={product_id} user_id={user_id} raw_body={made_to_order_update.model_dump()}")
    
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем статус 'под заказ'
    db_product.is_made_to_order = bool(made_to_order_update.is_made_to_order)
    # Железобетонная нормализация на бэкенде: при is_made_to_order=True сбрасываем sale и reservation,
    # иначе при нескольких PATCH подряд клиент может видеть старый is_sale_enabled → приоритет sale → "Купить"/🛒.
    normalize_action_flags(db_product)
    for sibling in _get_sync_siblings(db, db_product):
        sibling.is_sale_enabled = db_product.is_sale_enabled
        sibling.is_made_to_order = db_product.is_made_to_order
        sibling.is_reservation_enabled = getattr(db_product, "is_reservation_enabled", False)
        normalize_action_flags(sibling)
    db.flush()
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    db.commit()
    db.refresh(db_product)
    # DEBUG: итоговое состояние после нормализации (чтобы по логам видеть консистентность)
    print(
        f"[ACTION FLAG RESULT] product_id={product_id} sale={getattr(db_product, 'is_sale_enabled', False)} "
        f"made_to_order={getattr(db_product, 'is_made_to_order', False)} reservation={getattr(db_product, 'is_reservation_enabled', False)}"
    )
    return {
        "id": db_product.id,
        "is_made_to_order": bool(db_product.is_made_to_order),  # Явное преобразование в bool
        "message": "Статус 'под заказ' обновлен"
    }


def update_for_sale(
    product_id: int,
    for_sale_update: schemas.ForSaleUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление функции 'покупка' для товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        for_sale_update: Данные для обновления функции "покупка"
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем функцию 'покупка'
    db_product.is_for_sale = bool(for_sale_update.is_for_sale)
    db_product.price_from = for_sale_update.price_from
    db_product.price_to = for_sale_update.price_to
    db_product.price_fixed = for_sale_update.price_fixed
    db_product.price_type = for_sale_update.price_type if for_sale_update.price_type in ['range', 'fixed'] else 'range'
    db_product.quantity_from = for_sale_update.quantity_from
    db_product.quantity_unit = for_sale_update.quantity_unit
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "is_for_sale": bool(db_product.is_for_sale),
        "price_from": db_product.price_from,
        "price_to": db_product.price_to,
        "price_fixed": db_product.price_fixed,
        "price_type": db_product.price_type,
        "quantity_from": db_product.quantity_from,
        "quantity_unit": db_product.quantity_unit,
        "message": "Функция 'покупка' обновлена"
    }


def update_sale_enabled(
    product_id: int,
    sale_enabled_update: schemas.SaleEnabledUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление статуса 'продажа' для товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        sale_enabled_update: Данные для обновления статуса "продажа"
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    # Логирование входа в handler для диагностики отсутствующих PATCH запросов
    print(f"[ACTION FLAG PATCH HIT] endpoint=update-sale-enabled product_id={product_id} user_id={user_id} raw_body={sale_enabled_update.model_dump()}")
    
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем статус 'продажа'
    db_product.is_sale_enabled = bool(sale_enabled_update.is_sale_enabled)
    # Нормализация взаимоисключающих флагов на бэкенде (sale → сброс order и reservation).
    normalize_action_flags(db_product)
    for sibling in _get_sync_siblings(db, db_product):
        sibling.is_sale_enabled = db_product.is_sale_enabled
        sibling.is_made_to_order = db_product.is_made_to_order
        sibling.is_reservation_enabled = getattr(db_product, "is_reservation_enabled", False)
        normalize_action_flags(sibling)
    db.flush()
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    db.commit()
    db.refresh(db_product)
    print(
        f"[ACTION FLAG RESULT] product_id={product_id} sale={getattr(db_product, 'is_sale_enabled', False)} "
        f"made_to_order={getattr(db_product, 'is_made_to_order', False)} reservation={getattr(db_product, 'is_reservation_enabled', False)}"
    )
    return {
        "id": db_product.id,
        "is_sale_enabled": bool(db_product.is_sale_enabled),  # Явное преобразование в bool
        "message": "Статус 'продажа' обновлен"
    }


def update_reservation_enabled(
    product_id: int,
    reservation_enabled_update: schemas.ReservationEnabledUpdate,
    user_id: int,
    db: Session
):
    """Обновление статуса 'резервация' для товара (без уведомлений). Взаимоисключение с sale/order на фронте."""
    # Логирование входа в handler для диагностики отсутствующих PATCH запросов
    print(f"[ACTION FLAG PATCH HIT] endpoint=update-reservation-enabled product_id={product_id} user_id={user_id} raw_body={reservation_enabled_update.model_dump()}")
    
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    db_product.is_reservation_enabled = bool(reservation_enabled_update.is_reservation_enabled)
    # Нормализация взаимоисключающих флагов на бэкенде (reservation → сброс sale и order).
    normalize_action_flags(db_product)
    for sibling in _get_sync_siblings(db, db_product):
        sibling.is_sale_enabled = db_product.is_sale_enabled
        sibling.is_made_to_order = db_product.is_made_to_order
        sibling.is_reservation_enabled = getattr(db_product, "is_reservation_enabled", False)
        normalize_action_flags(sibling)
    db.flush()
    sync_product_to_all_bots(db_product, db, action="update")
    db.commit()
    db.refresh(db_product)
    print(
        f"[ACTION FLAG RESULT] product_id={product_id} sale={getattr(db_product, 'is_sale_enabled', False)} "
        f"made_to_order={getattr(db_product, 'is_made_to_order', False)} reservation={getattr(db_product, 'is_reservation_enabled', False)}"
    )
    return {
        "id": db_product.id,
        "is_reservation_enabled": bool(db_product.is_reservation_enabled),
        "message": "Статус 'резервация' обновлен"
    }


def update_quantity_show_enabled(
    product_id: int,
    quantity_show_enabled_update: schemas.QuantityShowEnabledUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление индивидуальной настройки показа количества для товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        quantity_show_enabled_update: Данные для обновления настройки показа количества
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем индивидуальную настройку показа количества
    # None означает использование общей настройки магазина
    if quantity_show_enabled_update.quantity_show_enabled is None:
        db_product.quantity_show_enabled = None
    else:
        db_product.quantity_show_enabled = bool(quantity_show_enabled_update.quantity_show_enabled)
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "quantity_show_enabled": db_product.quantity_show_enabled,
        "message": "Настройка показа количества обновлена"
    }


async def bulk_update_made_to_order(
    bulk_update: schemas.BulkMadeToOrderUpdate,
    x_telegram_init_data: Optional[str],
    db: Session
):
    """
    Массовое обновление статуса 'под заказ' для всех товаров пользователя.
    Требует авторизации через Telegram initData.
    
    Args:
        bulk_update: Данные для массового обновления статуса "под заказ"
        x_telegram_init_data: Telegram initData для авторизации
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если авторизация не прошла или произошла ошибка
    """
    # Валидация пользователя через initData
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram initData is required. Open the app through Telegram bot."
        )
    
    # Получаем bot_token из окружения (как в других эндпоинтах)
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    print(f"🔄 Bulk update made-to-order - initData present: {bool(x_telegram_init_data)}, bot_token present: {bool(bot_token)}")
    
    try:
        # Используем функцию для валидации с любым ботом
        authenticated_user_id, bot_token_validated, bot_id = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
        print(f"✅ Validated initData - user_id={authenticated_user_id}, bot_id={bot_id}")
    except HTTPException as e:
        print(f"❌ HTTPException during validation: {e.status_code} - {e.detail}")
        raise
    except Exception as e:
        print(f"❌ Exception during validation: {type(e).__name__} - {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Получаем только активные товары из основного бота (bot_id=None)
    # Синхронизация обновит их во все подключенные боты
    # Это исключает дубликаты - один товар может быть в основном боте и в подключенных ботах
    all_products = db.query(models.Product).filter(
        models.Product.user_id == authenticated_user_id,
        models.Product.bot_id == None,  # Только товары из основного бота
        models.Product.is_sold == False  # Только активные товары (не проданные)
    ).all()
    
    print(f"📦 Found {len(all_products)} active products in main bot for user {authenticated_user_id}")
    
    if not all_products:
        return {
            "updated_count": 0,
            "message": "У вас нет активных товаров для обновления"
        }
    
    # Обновляем все товары из основного бота
    # sync_product_to_all_bots обновит их во все подключенные боты
    updated_count = 0
    try:
        for product in all_products:
            product.is_made_to_order = bool(bulk_update.is_made_to_order)
            # Синхронизируем обновление товара во все боты
            try:
                sync_product_to_all_bots(product, db, action="update")
            except Exception as e:
                print(f"⚠️ Error syncing product {product.id} to bots: {str(e)}")
                # Продолжаем обновление других товаров даже если синхронизация не удалась
            updated_count += 1
        
        db.commit()
        print(f"✅ Bulk update made-to-order - user_id={authenticated_user_id}, is_made_to_order={bulk_update.is_made_to_order}, updated_count={updated_count}")
    except Exception as e:
        db.rollback()
        print(f"❌ Error during bulk update: {type(e).__name__} - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении товаров: {str(e)}")
    
    return {
        "updated_count": updated_count,
        "is_made_to_order": bulk_update.is_made_to_order,
        "message": f"Обновлено {updated_count} товаров"
    }


def update_hidden(
    product_id: int,
    hidden_update: schemas.HiddenUpdate,
    user_id: int,
    db: Session
):
    """
    Обновление статуса скрытия товара (без уведомлений)
    
    Args:
        product_id: ID товара для обновления
        hidden_update: Данные для обновления статуса скрытия
        user_id: ID пользователя (владельца магазина)
        db: Сессия базы данных
        
    Returns:
        Словарь с результатом обновления
        
    Raises:
        HTTPException: Если товар не найден
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем статус скрытия
    db_product.is_hidden = bool(hidden_update.is_hidden)
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "is_hidden": db_product.is_hidden,
        "message": "Статус скрытия товара обновлен"
    }


def update_product_characteristics(
    product_id: int,
    payload: schemas.ProductCharacteristicsUpdateIn,
    user_id: int,
    db: Session
):
    """
    Обновление характеристик товара: замена списком (replace).
    - Удаляются все характеристики, которых нет в payload.
    - Для записей с id — обновляется value и sort_order.
    - Для записей без id — создаётся новая характеристика.
    - Новые названия добавляются в справочник characteristic_names (get-or-create).
    - После commit перезагружаем товар с selectinload и синхронизируем во все боты.
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    user_id_val = db_product.user_id
    bot_id_val = db_product.bot_id
    payload_count = len([c for c in payload.characteristics if (c.name or "").strip() and (c.value or "").strip()])
    print(f"📋 [PATCH CHARS] product_id={product_id} payload_chars={payload_count}")

    # Идентификаторы в payload — эти оставляем/обновляем
    payload_ids = {c.id for c in payload.characteristics if c.id is not None}

    # Удаляем характеристики, которых нет в payload
    for pc in list(db_product.characteristics):
        if pc.id not in payload_ids:
            db.delete(pc)
    db.flush()

    # Обновляем/создаём по порядку
    seen_names = set()
    for idx, item in enumerate(payload.characteristics):
        name = (item.name or "").strip()
        value = (item.value or "").strip()
        if not name or not value:
            continue

        if item.id is not None:
            # Обновляем существующую
            pc = db.query(models.ProductCharacteristic).filter(
                models.ProductCharacteristic.id == item.id,
                models.ProductCharacteristic.product_id == product_id
            ).first()
            if pc:
                pc.value = value
                pc.sort_order = idx
                pc.name = name  # разрешаем менять название
        else:
            # Создаём новую
            pc = models.ProductCharacteristic(
                product_id=product_id,
                name=name,
                value=value,
                sort_order=idx
            )
            db.add(pc)

        # Get-or-create в справочник названий (по user_id + bot_id)
        if name not in seen_names:
            seen_names.add(name)
            existing_name = db.query(models.CharacteristicName).filter(
                models.CharacteristicName.user_id == user_id_val,
                models.CharacteristicName.name == name,
                models.CharacteristicName.bot_id == bot_id_val
            ).first()
            if not existing_name:
                cn = models.CharacteristicName(
                    name=name,
                    user_id=user_id_val,
                    bot_id=bot_id_val
                )
                db.add(cn)

    db.flush()
    db.commit()
    actual_count = db.query(models.ProductCharacteristic).filter(
        models.ProductCharacteristic.product_id == product_id
    ).count()
    print(f"📋 [PATCH CHARS] after commit product_id={product_id} actual_chars={actual_count}")

    # Перезагружаем товар с characteristics (selectinload), чтобы sync_product_to_all_bots получил свежие данные
    current_product = db.query(models.Product).options(
        selectinload(models.Product.characteristics)
    ).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if current_product:
        sync_product_to_all_bots(current_product, db, action="update")
        db.commit()
        main_count = db.query(models.Product).filter(
            models.Product.user_id == user_id,
            models.Product.sync_product_id == (current_product.sync_product_id or current_product.id)
        ).count()
        print(f"📋 [PATCH CHARS] sync done product_id={product_id} siblings_count={main_count}")
    return {"id": product_id, "message": "Характеристики обновлены"}


def update_product_delivery(
    product_id: int,
    payload: schemas.ProductDeliveryUpdateIn,
    user_id: int,
    db: Session
):
    """
    Обновление настроек доставки товара (upsert одной записи).
    После commit перезагружаем товар с selectinload(delivery_option) и синхронизируем во все боты.
    """
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    print(f"📦 [PATCH DELIVERY] product_id={product_id} payload={payload.model_dump()}")

    delivery = db_product.delivery_option
    pickup_addr = (payload.pickup_address or "").strip() or None
    delivery_time_val = (payload.delivery_time or "").strip() or None
    if delivery is None:
        delivery = models.ProductDelivery(
            product_id=product_id,
            is_delivery_enabled=payload.is_delivery_enabled,
            is_pickup_enabled=payload.is_pickup_enabled,
            delivery_time=delivery_time_val,
            delivery_price=payload.delivery_price,
            pickup_address=pickup_addr,
            sort_order=0
        )
        db.add(delivery)
    else:
        delivery.is_delivery_enabled = payload.is_delivery_enabled
        delivery.is_pickup_enabled = payload.is_pickup_enabled
        delivery.delivery_time = delivery_time_val
        delivery.delivery_price = payload.delivery_price
        delivery.pickup_address = pickup_addr

    db.flush()
    db.commit()
    db.refresh(delivery)
    print(f"📦 [PATCH DELIVERY] after commit product_id={product_id} is_delivery_enabled={delivery.is_delivery_enabled} delivery_price={delivery.delivery_price}")

    # Перезагружаем товар с delivery_option и синхронизируем
    current_product = db.query(models.Product).options(
        selectinload(models.Product.delivery_option)
    ).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if current_product:
        sync_product_to_all_bots(current_product, db, action="update")
        db.commit()
        siblings = db.query(models.Product).filter(
            models.Product.user_id == user_id,
            models.Product.sync_product_id == (current_product.sync_product_id or current_product.id)
        ).count()
        print(f"📦 [PATCH DELIVERY] sync done product_id={product_id} siblings_count={siblings}")

    return {
        "id": product_id,
        "message": "Настройки доставки обновлены",
        "delivery": {
            "is_delivery_enabled": delivery.is_delivery_enabled,
            "is_pickup_enabled": delivery.is_pickup_enabled,
            "delivery_time": getattr(delivery, "delivery_time", None),
            "delivery_price": delivery.delivery_price,
            "pickup_address": delivery.pickup_address,
        }
    }

