"""
Обработчики для чтения товаров
"""
import json
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_
from ..db import models, database
from ..utils.products_utils import make_full_url
from ..utils.product_action_type import get_product_action_type_dict

log = logging.getLogger(__name__)


def get_product_by_id(
    product_id: int,
    db: Session
):
    """Получить товар по его ID (из любого магазина)"""
    product = db.query(models.Product).options(
        selectinload(models.Product.characteristics),
        selectinload(models.Product.delivery_option)
    ).filter(models.Product.id == product_id).first()
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
    
    log.debug("[PRODUCT BY ID] id=%s name='%s' description type=%s", product.id, product.name, type(product.description))
    log.debug("[PRODUCT PRICE] id=%s price_card=%s price_cash=%s price_old=%s", product.id, getattr(product, 'price_card', None), getattr(product, 'price_cash', None), getattr(product, 'price_old', None))
    
    # ВАЖНО: Используем Pydantic модель для правильной сериализации всех полей
    from ..models import product as schemas
    
    product_dict = {
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
        "is_sale_enabled": getattr(product, 'is_sale_enabled', False),
        "is_reservation_enabled": getattr(product, 'is_reservation_enabled', False),
        "price_from": getattr(product, 'price_from', None),
        "price_to": getattr(product, 'price_to', None),
        "price_fixed": getattr(product, 'price_fixed', None),
        "price_type": getattr(product, 'price_type', 'range'),
        "quantity_from": getattr(product, 'quantity_from', None),
        "quantity_unit": getattr(product, 'quantity_unit', None),
        "is_hidden": getattr(product, 'is_hidden', False),
        "is_client_sale": getattr(product, 'is_client_sale', False),
        "seller_id": getattr(product, 'seller_id', None),
        "sync_product_id": getattr(product, 'sync_product_id', None),
        # КРИТИЧНО: Включаем новые поля цен
        "price_card": getattr(product, 'price_card', None),
        "price_cash": getattr(product, 'price_cash', None),
        "price_old": getattr(product, 'price_old', None),
        "delivery_time": getattr(product, 'delivery_time', None),
        "delivery_price": getattr(product, 'delivery_price', None),
        "reservation": None,  # reservation будет добавлен отдельно, если нужно
        # Характеристики товара (из product_characteristics): id, name, value, sort_order для редактирования
        "characteristics": [{"id": pc.id, "name": pc.name, "value": pc.value, "sort_order": pc.sort_order or 0} for pc in product.characteristics] if hasattr(product, 'characteristics') and product.characteristics else [],
        # Настройки доставки (из product_delivery) для страницы редактирования
        "delivery": {"is_delivery_enabled": d.is_delivery_enabled, "is_pickup_enabled": d.is_pickup_enabled, "delivery_price": d.delivery_price, "pickup_address": d.pickup_address, "delivery_time": getattr(d, 'delivery_time', None)} if hasattr(product, 'delivery_option') and product.delivery_option and (d := product.delivery_option) else None
    }
    
    # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
    # Получаем роль пользователя из контекста (если доступна)
    # Для клиентов вычисляем action_type, для владельцев - None (они видят все)
    user_role = None  # TODO: Получить из контекста запроса если нужно
    
    # Получаем настройки магазина из БД
    from ..utils.product_action_type import get_shop_settings_dict
    shop_settings = get_shop_settings_dict(product.user_id, product.bot_id, db)
    
    action_type_info = get_product_action_type_dict(product, user_role, shop_settings, db)
    product_dict.update(action_type_info)
    
    # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат как в products list для сравнения
    log.debug(
        f"[PRODUCT BY ID DEBUG] Product {product.id}: "
        f"action_type={action_type_info['action_type']}, "
        f"can_add_to_cart={action_type_info['can_add_to_cart']}, "
        f"reason_not_sale={action_type_info['reason_not_sale']}, "
        f"flags: is_sale_enabled={getattr(product, 'is_sale_enabled', False)}, "
        f"is_made_to_order={getattr(product, 'is_made_to_order', False)}, "
        f"is_reservation_enabled={getattr(product, 'is_reservation_enabled', False)}, "
        f"price_card={getattr(product, 'price_card', None)}, "
        f"price_cash={getattr(product, 'price_cash', None)}"
    )
    # ========== КОНЕЦ ВЫЧИСЛЕНИЯ action_type ==========
    
    chars_count = len(product_dict.get("characteristics") or [])
    if chars_count > 0:
        log.debug(f"📋 [PRODUCT SERIALIZE] Product {product.id}: characteristics_count={chars_count}")
    
    # Валидируем через Pydantic модель для гарантии правильной сериализации
    # Это гарантирует, что все поля из ProductBase (включая price_card, price_cash) будут включены
    try:
        product_model = schemas.Product(**product_dict)
        result_dict = product_model.model_dump()
        # Логируем для диагностики
        log.debug(f"✅ [PRODUCT BY ID SERIALIZE] Product {product.id}: price_card={result_dict.get('price_card')}, price_cash={result_dict.get('price_cash')}, discount={result_dict.get('discount')}")
        
        # Добавляем дополнительное поле has_active_reservation (не в схеме, но используется фронтендом)
        result_dict["has_active_reservation"] = active_reservation is not None
        
        return result_dict
    except Exception as e:
        log.debug(f"❌ [PRODUCT BY ID SERIALIZE ERROR] Product {product.id}: {e}")
        # Fallback: возвращаем словарь напрямую
        product_dict["has_active_reservation"] = active_reservation is not None
        return product_dict


def get_products(
    user_id: int,
    category_id: Optional[int],
    bot_id: Optional[int],
    db: Session,
    viewer_id: Optional[int] = None  # ID пользователя, который просматривает товары (для фильтрации скрытых)
):
    """Получить список товаров с автоматической синхронизацией между основным магазином и ботами"""
    import time
    sync_start = time.time()
    log.debug(f"📦 [PRODUCTS] get_products called with user_id={user_id}, category_id={category_id}, bot_id={bot_id}, viewer_id={viewer_id}")
    
    # ОПТИМИЗАЦИЯ: Синхронизация выполняется только для владельца магазина (viewer_id == user_id)
    # Для клиентов (viewer_id != user_id) синхронизация не нужна - это только просмотр
    # ДОПОЛНИТЕЛЬНАЯ ОПТИМИЗАЦИЯ: Синхронизация выполняется только при необходимости (раз в час или при изменении)
    # Для просмотра товаров синхронизация не нужна - она замедляет загрузку
    should_sync = False  # ОТКЛЮЧЕНО: Синхронизация выполняется только при создании/обновлении товаров, не при просмотре
    
    if not should_sync:
        log.debug(f"📦 [PRODUCTS] Skipping sync - viewing mode (sync disabled for performance)")
    else:
        log.debug(f"📦 [PRODUCTS] Running sync - owner view (viewer_id={viewer_id}, user_id={user_id})")
    
    # Автоматическая синхронизация: проверяем расхождения между основным магазином и ботами
    # ОПТИМИЗАЦИЯ: Выполняем только для владельца, и только если есть подключенные боты
    # ВРЕМЕННО ОТКЛЮЧЕНО: Синхронизация выполняется только при создании/обновлении товаров
    if should_sync:
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
                        log.debug(f"🔄 Auto-syncing product '{bot_product.name}' from bot {bot.id} to main shop")
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
                        log.debug(f"✅ Auto-synced product '{bot_product.name}' (id={new_main_product.id}) to main shop")
            
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
                        log.debug(f"🔄 Auto-syncing product '{main_product.name}' from main shop to bot {bot.id}")
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
                        log.debug(f"✅ Auto-synced product '{main_product.name}' (id={new_bot_product.id}) to bot {bot.id}")
        
        sync_time = time.time() - sync_start
        if sync_time > 1.0:
            log.debug(f"⚠️ [PRODUCTS] Sync took {sync_time:.3f}s - this is slow!")
        else:
            log.debug(f"⏱️ [PRODUCTS] Sync completed in {sync_time:.3f}s")
    
    query = db.query(models.Product).options(
        selectinload(models.Product.characteristics),
        selectinload(models.Product.delivery_option)
    ).filter(
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
    
    # ИСПРАВЛЕНИЕ: Если товаров нет для клиентского бота, пробуем главный бот (fallback)
    if not products and bot_id is not None:
        log.debug(f"📦 [PRODUCTS] No products for bot_id={bot_id}, trying main bot (bot_id=None) as fallback")
        query_fallback = db.query(models.Product).options(
            selectinload(models.Product.characteristics)
        ).filter(
            models.Product.user_id == user_id,
            models.Product.is_sold == False,
            models.Product.bot_id == None
        )
        if viewer_id is not None and viewer_id != user_id:
            query_fallback = query_fallback.filter(models.Product.is_hidden == False)
        if category_id is not None:
            query_fallback = query_fallback.filter(models.Product.category_id == category_id)
        products = query_fallback.all()
        log.debug(f"📦 [PRODUCTS] Found {len(products)} products in main bot (fallback)")
    
    # Логируем информацию о товарах и их изображениях
    log.debug(f"📦 [PRODUCTS] Found {len(products)} products for user {user_id}, bot_id={bot_id}, category_id={category_id}")
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
        
        log.debug(f"DEBUG: Product {prod.id} '{prod.name}' has {'active' if has_reservation else 'no active'} reservation")
        log.debug(f"DEBUG: Product {prod.id} '{prod.name}' - is_made_to_order raw={getattr(prod, 'is_made_to_order', False)} (type: {type(getattr(prod, 'is_made_to_order', False))}), converted={is_made_to_order}")
        log.debug(f"DEBUG: Product {prod.id} '{prod.name}' - images_urls: {len(images_list)} images")
        if images_list:
            first_image = images_list[0]
            log.debug(f"DEBUG: Product {prod.id} first image URL: {first_image}")
            if '/api/images/' in first_image:
                log.debug(f"OK: Product {prod.id} image URL correctly uses /api/images/")
            elif '/static/uploads/' in first_image:
                log.debug(f"WARNING: Product {prod.id} image URL still contains /static/uploads/ - should use /api/images/")
        
        # Логируем информацию о описании товара для отладки
        description_value = prod.description
        log.debug(f"🔍 [PRODUCTS DEBUG] Product {prod.id} '{prod.name}': description={description_value}, type={type(description_value)}, has_description={bool(description_value)}")
        
        # КРИТИЧНО: Логирование новых полей цен для диагностики (используем print для backend-логов)
        log.debug(
            f"[PRODUCT PRICE DEBUG] "
            f"id={prod.id} "
            f"price_card={getattr(prod, 'price_card', None)} "
            f"price_cash={getattr(prod, 'price_cash', None)} "
            f"price_old={getattr(prod, 'price_old', None)}"
        )
        
        # ВАЖНО: Используем Pydantic модель для правильной сериализации всех полей
        # Это гарантирует, что price_card, price_cash и discount будут включены в ответ
        from ..models import product as schemas
        
        # Создаем словарь с данными товара для Pydantic модели
        product_dict = {
            "id": prod.id,
            "name": prod.name,
            "description": prod.description,
            "price": prod.price,
            "image_url": image_url_full,
            "images_urls": images_list,
            "discount": prod.discount,
            "category_id": prod.category_id,
            "user_id": prod.user_id,
            "bot_id": getattr(prod, 'bot_id', None),
            "sync_product_id": getattr(prod, 'sync_product_id', None),
            "is_hot_offer": getattr(prod, 'is_hot_offer', False),
            "quantity": getattr(prod, 'quantity', 0),
            "is_made_to_order": is_made_to_order,
            "is_for_sale": getattr(prod, 'is_for_sale', False),
            "is_sale_enabled": getattr(prod, 'is_sale_enabled', False),
            "is_reservation_enabled": getattr(prod, 'is_reservation_enabled', False),
            "price_from": getattr(prod, 'price_from', None),
            "price_to": getattr(prod, 'price_to', None),
            "price_fixed": getattr(prod, 'price_fixed', None),
            "price_type": getattr(prod, 'price_type', 'range'),
            "quantity_from": getattr(prod, 'quantity_from', None),
            "quantity_unit": getattr(prod, 'quantity_unit', None),
            "quantity_show_enabled": getattr(prod, 'quantity_show_enabled', None),
            "is_hidden": getattr(prod, 'is_hidden', False),
            "is_client_sale": getattr(prod, 'is_client_sale', False),
            "seller_id": getattr(prod, 'seller_id', None),
            # КРИТИЧНО: Включаем новые поля цен
            "price_card": getattr(prod, 'price_card', None),
            "price_cash": getattr(prod, 'price_cash', None),
            "price_old": getattr(prod, 'price_old', None),
            "delivery_time": getattr(prod, 'delivery_time', None),
            "delivery_price": getattr(prod, 'delivery_price', None),
            "reservation": reservation_data,
            # Характеристики товара (из product_characteristics): id, name, value, sort_order
            "characteristics": [{"id": pc.id, "name": pc.name, "value": pc.value, "sort_order": pc.sort_order or 0} for pc in prod.characteristics] if hasattr(prod, 'characteristics') and prod.characteristics else [],
            # Настройки доставки (из product_delivery)
            "delivery": {"is_delivery_enabled": d.is_delivery_enabled, "is_pickup_enabled": d.is_pickup_enabled, "delivery_price": d.delivery_price, "pickup_address": d.pickup_address, "delivery_time": getattr(d, 'delivery_time', None)} if hasattr(prod, 'delivery_option') and prod.delivery_option and (d := prod.delivery_option) else None
        }
        
        # ========== ВЫЧИСЛЕНИЕ action_type И can_add_to_cart ==========
        # Для клиентов вычисляем action_type, для владельцев - None
        user_role = 'client' if (viewer_id is not None and viewer_id != user_id) else None
        
        # Получаем настройки магазина из БД
        from ..utils.product_action_type import get_shop_settings_dict
        shop_settings = get_shop_settings_dict(prod.user_id, getattr(prod, 'bot_id', None), db)
        
        action_type_info = get_product_action_type_dict(prod, user_role, shop_settings, db)
        product_dict.update(action_type_info)
        
        # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат для сравнения с checkout
        log.debug(
            f"[PRODUCTS LIST DEBUG] Product {prod.id}: "
            f"action_type={action_type_info['action_type']}, "
            f"can_add_to_cart={action_type_info['can_add_to_cart']}, "
            f"reason_not_sale={action_type_info['reason_not_sale']}, "
            f"flags: is_sale_enabled={getattr(prod, 'is_sale_enabled', False)}, "
            f"is_made_to_order={getattr(prod, 'is_made_to_order', False)}, "
            f"is_reservation_enabled={getattr(prod, 'is_reservation_enabled', False)}, "
            f"price_card={getattr(prod, 'price_card', None)}, "
            f"price_cash={getattr(prod, 'price_cash', None)}"
        )
        # ========== КОНЕЦ ВЫЧИСЛЕНИЯ action_type ==========
        
        # Валидируем через Pydantic модель для гарантии правильной сериализации
        # Это гарантирует, что все поля из ProductBase (включая price_card, price_cash) будут включены
        try:
            product_model = schemas.Product(**product_dict)
            serialized = product_model.model_dump()
            # Логируем для диагностики
            chars_n = len(serialized.get("characteristics") or [])
            log.debug(f"✅ [PRODUCT SERIALIZE] Product {prod.id}: characteristics_count={chars_n}, price_card={serialized.get('price_card')}")
            result.append(serialized)
        except Exception as e:
            log.debug(f"❌ [PRODUCT SERIALIZE ERROR] Product {prod.id}: {e}")
            # Fallback: возвращаем словарь напрямую
            result.append(product_dict)
    
    log.debug(f"📦 [PRODUCTS] Returning {len(result)} products")
    return result

