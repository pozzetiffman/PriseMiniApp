"""
Модуль для синхронизации товаров между ботами.

Этот модуль содержит функции для синхронизации товаров между основным ботом
и подключенными ботами пользователя.
"""
import logging
from sqlalchemy.orm import Session
from ..db import models
from .products_utils import normalize_category_id

log = logging.getLogger(__name__)


def _sync_characteristics(source_product: models.Product, target_product: models.Product, db: Session) -> int:
    """
    Синхронизирует характеристики из source_product в target_product:
    DELETE старые у target, INSERT новые из source с сохранением sort_order.
    Источник загружается прямым запросом (не lazy load).
    Возвращает количество вставленных характеристик.
    """
    source_id = source_product.id
    target_id = target_product.id
    source_chars = db.query(models.ProductCharacteristic).filter(
        models.ProductCharacteristic.product_id == source_id
    ).order_by(models.ProductCharacteristic.sort_order).all()
    n_source = len(source_chars)
    db.query(models.ProductCharacteristic).filter(
        models.ProductCharacteristic.product_id == target_id
    ).delete(synchronize_session=False)
    db.flush()
    new_chars = [
        models.ProductCharacteristic(
            product_id=target_id,
            name=pc.name,
            value=pc.value,
            sort_order=pc.sort_order or 0
        )
        for pc in source_chars
    ]
    db.add_all(new_chars)
    db.flush()
    log.debug("[SYNC CHARS] source_id=%s target_id=%s bot_id=%s inserted=%s", source_id, target_id, target_product.bot_id, n_source)
    return n_source


def _sync_characteristics_to_all_siblings(source_product: models.Product, db: Session, action: str) -> None:
    """
    BACKFILL: для всех товаров с тем же sync_product_id (siblings) копирует характеристики из source.
    Вызывается при action=create/update. source_product — тот, кого только что обновили.
    """
    sync_id = source_product.sync_product_id
    if sync_id is None:
        return
    user_id = source_product.user_id
    source_id = source_product.id
    source_chars = db.query(models.ProductCharacteristic).filter(
        models.ProductCharacteristic.product_id == source_id
    ).order_by(models.ProductCharacteristic.sort_order).all()
    n_source = len(source_chars)
    log.debug(f"📋 [SYNC CHARS BACKFILL] source_id={source_id} sync_id={sync_id} source_chars={n_source}")
    siblings = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.sync_product_id == sync_id,
        models.Product.id != source_id
    ).all()
    for t in siblings:
        _sync_characteristics(source_product, t, db)


def _sync_delivery(source_product: models.Product, target_product: models.Product, db: Session) -> None:
    """
    Синхронизирует настройки доставки из source_product в target_product:
    удаляет старую запись у target (если есть), создаёт одну запись с полями из source.
    """
    target_id = target_product.id
    source_d = getattr(source_product, "delivery_option", None) or (
        db.query(models.ProductDelivery).filter(
            models.ProductDelivery.product_id == source_product.id
        ).first()
    )
    # Удаляем старую запись доставки у target
    db.query(models.ProductDelivery).filter(
        models.ProductDelivery.product_id == target_id
    ).delete(synchronize_session=False)
    db.flush()
    if source_d:
        new_d = models.ProductDelivery(
            product_id=target_id,
            is_delivery_enabled=source_d.is_delivery_enabled,
            is_pickup_enabled=source_d.is_pickup_enabled,
            delivery_time=getattr(source_d, "delivery_time", None),
            delivery_price=source_d.delivery_price,
            pickup_address=source_d.pickup_address,
            sort_order=source_d.sort_order or 0
        )
        db.add(new_d)
        db.flush()
        log.debug(f"📦 [SYNC DELIVERY] source_id={source_product.id} target_id={target_id} bot_id={target_product.bot_id} copied")
    else:
        log.debug(f"📦 [SYNC DELIVERY] source_id={source_product.id} target_id={target_id} bot_id={target_product.bot_id} no source delivery")


def _sync_delivery_to_all_siblings(source_product: models.Product, db: Session, action: str) -> None:
    """BACKFILL: для всех товаров с тем же sync_product_id копирует доставку из source."""
    sync_id = source_product.sync_product_id
    if sync_id is None:
        return
    user_id = source_product.user_id
    source_id = source_product.id
    siblings = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.sync_product_id == sync_id,
        models.Product.id != source_id
    ).all()
    for t in siblings:
        _sync_delivery(source_product, t, db)


def sync_product_to_all_bots_with_rename(db_product: models.Product, db: Session, old_name: str, old_price: float):
    """
    Синхронизирует товар во все боты пользователя при переименовании.
    Использует sync_product_id для надежной связи товаров.
    
    Args:
        db_product: Товар с новым именем
        db: Сессия базы данных
        old_name: Старое имя товара (для fallback поиска)
        old_price: Старая цена товара (для fallback поиска)
    """
    user_id = db_product.user_id
    
    # Находим все подключенные боты пользователя
    connected_bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == user_id,
        models.Bot.is_active == True
    ).all()
    
    # Используем sync_product_id для надежной синхронизации
    sync_id = db_product.sync_product_id or db_product.id
    
    if db_product.bot_id is None:
        # Товар в основном боте - синхронизируем во все подключенные боты
        for bot in connected_bots:
            # Ищем товар по sync_product_id (надежный способ)
            matching = None
            if sync_id:
                matching = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.sync_product_id == sync_id
                ).first()
            
            # Fallback: если не нашли по sync_product_id, ищем по старому имени и цене
            if not matching:
                matching = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.name == old_name,
                    models.Product.price == old_price
                ).first()
            
            if matching:
                # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                
                # Обновляем товар, включая новое имя
                matching.name = db_product.name
                matching.description = db_product.description
                matching.price = db_product.price
                matching.image_url = db_product.image_url
                matching.images_urls = db_product.images_urls
                matching.discount = db_product.discount
                matching.is_hot_offer = db_product.is_hot_offer
                matching.quantity = db_product.quantity
                matching.is_sold = db_product.is_sold
                matching.is_made_to_order = db_product.is_made_to_order
                matching.is_for_sale = db_product.is_for_sale
                matching.is_sale_enabled = db_product.is_sale_enabled
                matching.is_reservation_enabled = getattr(db_product, 'is_reservation_enabled', False)
                matching.is_client_sale = db_product.is_client_sale
                matching.seller_id = db_product.seller_id
                matching.price_from = db_product.price_from
                matching.price_to = db_product.price_to
                matching.price_fixed = db_product.price_fixed
                matching.price_type = db_product.price_type
                matching.quantity_from = db_product.quantity_from
                matching.quantity_unit = db_product.quantity_unit
                matching.quantity_show_enabled = db_product.quantity_show_enabled
                matching.is_hidden = db_product.is_hidden
                # КРИТИЧНО: Обновляем новые поля цен
                matching.price_card = db_product.price_card
                matching.price_cash = db_product.price_cash
                matching.price_old = db_product.price_old
                matching.category_id = category_id_for_bot
                # Обновляем sync_product_id если он не был установлен
                if not matching.sync_product_id:
                    matching.sync_product_id = sync_id
                log.debug(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")
            else:
                # Товар не найден - проверяем, не существует ли уже товар с новым именем и sync_product_id
                existing = None
                if sync_id:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.sync_product_id == sync_id
                    ).first()
                
                # Fallback: ищем по новому имени
                if not existing:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == db_product.name
                    ).first()
                
                if not existing:
                    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                    category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                    
                    # Создаем новый товар
                    new_product = models.Product(
                        name=db_product.name,
                        description=db_product.description,
                        price=db_product.price,
                        image_url=db_product.image_url,
                        images_urls=db_product.images_urls,
                        discount=db_product.discount,
                        user_id=user_id,
                        bot_id=bot.id,
                        sync_product_id=sync_id,  # Связываем с оригинальным товаром
                        is_hot_offer=db_product.is_hot_offer,
                        quantity=db_product.quantity,
                        is_sold=db_product.is_sold,
                        is_made_to_order=db_product.is_made_to_order,
                        is_for_sale=db_product.is_for_sale,
                        is_sale_enabled=db_product.is_sale_enabled,
                        is_reservation_enabled=getattr(db_product, 'is_reservation_enabled', False),
                        is_client_sale=db_product.is_client_sale,
                        seller_id=db_product.seller_id,
                        price_from=db_product.price_from,
                        price_to=db_product.price_to,
                        price_fixed=db_product.price_fixed,
                        price_type=db_product.price_type,
                        quantity_from=db_product.quantity_from,
                        quantity_unit=db_product.quantity_unit,
                        quantity_show_enabled=db_product.quantity_show_enabled,
                        is_hidden=db_product.is_hidden,
                        # КРИТИЧНО: Копируем новые поля цен
                        price_card=db_product.price_card,
                        price_cash=db_product.price_cash,
                        price_old=db_product.price_old,
                        category_id=category_id_for_bot
                    )
                    db.add(new_product)
                    log.debug(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (CREATE)")
    
    else:
        # Товар в подключенном боте - синхронизируем в основной бот И во все другие подключенные боты
        # Используем sync_product_id для надежной синхронизации
        if not sync_id:
            sync_id = db_product.sync_product_id
        
        # 1. Обновляем товар в основном боте (ищем по sync_product_id)
        matching_main = None
        if sync_id:
            matching_main = db.query(models.Product).filter(
                models.Product.user_id == user_id,
                models.Product.bot_id == None,
                models.Product.sync_product_id == sync_id
            ).first()
        
        # Fallback: если не нашли по sync_product_id, ищем по старому имени и цене
        if not matching_main:
            matching_main = db.query(models.Product).filter(
                models.Product.user_id == user_id,
                models.Product.bot_id == None,
                models.Product.name == old_name,
                models.Product.price == old_price
            ).first()
        
        if matching_main:
            # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
            category_id_for_main = normalize_category_id(db_product.category_id, None, user_id, db)
            
            # Обновляем товар, включая новое имя
            matching_main.name = db_product.name
            matching_main.description = db_product.description
            matching_main.price = db_product.price
            matching_main.image_url = db_product.image_url
            matching_main.images_urls = db_product.images_urls
            matching_main.discount = db_product.discount
            matching_main.is_hot_offer = db_product.is_hot_offer
            matching_main.quantity = db_product.quantity
            matching_main.is_sold = db_product.is_sold
            matching_main.is_made_to_order = db_product.is_made_to_order
            matching_main.quantity_show_enabled = db_product.quantity_show_enabled
            matching_main.is_hidden = db_product.is_hidden
            # Обновляем поля для продажи
            matching_main.is_for_sale = db_product.is_for_sale
            matching_main.price_from = db_product.price_from
            matching_main.price_to = db_product.price_to
            matching_main.price_fixed = db_product.price_fixed
            matching_main.price_type = db_product.price_type
            matching_main.quantity_from = db_product.quantity_from
            matching_main.quantity_unit = db_product.quantity_unit
            # КРИТИЧНО: Обновляем новые поля цен
            matching_main.price_card = db_product.price_card
            matching_main.price_cash = db_product.price_cash
            matching_main.price_old = db_product.price_old
            matching_main.category_id = category_id_for_main
            # Устанавливаем sync_product_id если он не был установлен
            if not matching_main.sync_product_id:
                matching_main.sync_product_id = matching_main.id
            if not db_product.sync_product_id:
                db_product.sync_product_id = matching_main.sync_product_id
            sync_id = matching_main.sync_product_id
            log.debug(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to main bot (UPDATE)")
        
        # 2. Обновляем товар во всех других подключенных ботах (кроме текущего)
        for bot in connected_bots:
            if bot.id == db_product.bot_id:
                continue  # Пропускаем текущий бот
            
            # Ищем товар по sync_product_id (надежный способ)
            matching = None
            if sync_id:
                matching = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.sync_product_id == sync_id
                ).first()
            
            # Fallback: если не нашли по sync_product_id, ищем по старому имени и цене
            if not matching:
                matching = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.name == old_name,
                    models.Product.price == old_price
                ).first()
            
            if matching:
                # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                
                # Обновляем товар, включая новое имя
                matching.name = db_product.name
                matching.description = db_product.description
                matching.price = db_product.price
                matching.image_url = db_product.image_url
                matching.images_urls = db_product.images_urls
                matching.discount = db_product.discount
                matching.is_hot_offer = db_product.is_hot_offer
                matching.quantity = db_product.quantity
                matching.is_sold = db_product.is_sold
                matching.is_made_to_order = db_product.is_made_to_order
                matching.quantity_show_enabled = db_product.quantity_show_enabled
                matching.is_hidden = db_product.is_hidden
                # Обновляем поля для продажи
                matching.is_for_sale = db_product.is_for_sale
                matching.price_from = db_product.price_from
                matching.price_to = db_product.price_to
                matching.price_fixed = db_product.price_fixed
                matching.price_type = db_product.price_type
                matching.quantity_from = db_product.quantity_from
                matching.quantity_unit = db_product.quantity_unit
                # КРИТИЧНО: Обновляем новые поля цен
                matching.price_card = db_product.price_card
                matching.price_cash = db_product.price_cash
                matching.price_old = db_product.price_old
                matching.category_id = category_id_for_bot
                # Обновляем sync_product_id если он не был установлен
                if sync_id and not matching.sync_product_id:
                    matching.sync_product_id = sync_id
                log.debug(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")


def sync_product_to_all_bots(db_product: models.Product, db: Session, action: str = "create"):
    """
    Синхронизирует товар во все боты пользователя (двусторонняя синхронизация).
    Использует sync_product_id для надежной связи товаров между магазинами.
    
    action: "create", "update", "delete"
    """
    user_id = db_product.user_id
    
    # Находим все подключенные боты пользователя
    connected_bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == user_id,
        models.Bot.is_active == True
    ).all()
    
    if db_product.bot_id is None:
        # Товар в основном боте - синхронизируем во все подключенные боты
        # sync_product_id уже установлен на id товара (сам на себя)
        sync_id = db_product.sync_product_id or db_product.id
        
        for bot in connected_bots:
            if action == "create":
                # Ищем существующий синхронизированный товар по sync_product_id
                existing = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.sync_product_id == sync_id
                ).first()
                
                # Fallback: если sync_product_id не установлен, ищем по имени и цене (для обратной совместимости)
                if not existing:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == db_product.name,
                        models.Product.price == db_product.price
                    ).first()
                
                if not existing:
                    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                    category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                    
                    # Создаем копию товара для этого бота
                    new_product = models.Product(
                        name=db_product.name,
                        description=db_product.description,
                        price=db_product.price,
                        image_url=db_product.image_url,
                        images_urls=db_product.images_urls,
                        discount=db_product.discount,
                        user_id=user_id,
                        bot_id=bot.id,
                        sync_product_id=sync_id,  # Связываем с оригинальным товаром
                        is_hot_offer=db_product.is_hot_offer,
                        quantity=db_product.quantity,
                        is_sold=db_product.is_sold,
                        is_made_to_order=db_product.is_made_to_order,
                        is_for_sale=db_product.is_for_sale,
                        is_sale_enabled=db_product.is_sale_enabled,
                        is_reservation_enabled=getattr(db_product, 'is_reservation_enabled', False),
                        is_client_sale=db_product.is_client_sale,
                        seller_id=db_product.seller_id,
                        price_from=db_product.price_from,
                        price_to=db_product.price_to,
                        price_fixed=db_product.price_fixed,
                        price_type=db_product.price_type,
                        quantity_from=db_product.quantity_from,
                        quantity_unit=db_product.quantity_unit,
                        quantity_show_enabled=db_product.quantity_show_enabled,
                        is_hidden=db_product.is_hidden,
                        # КРИТИЧНО: Копируем новые поля цен
                        price_card=db_product.price_card,
                        price_cash=db_product.price_cash,
                        price_old=db_product.price_old,
                        category_id=category_id_for_bot
                    )
                    db.add(new_product)
                    db.flush()  # Получаем new_product.id для копирования характеристик
                    # Копируем характеристики товара в синхронизированную копию
                    for pc in db_product.characteristics:
                        new_pc = models.ProductCharacteristic(
                            product_id=new_product.id,
                            name=pc.name,
                            value=pc.value,
                            sort_order=pc.sort_order
                        )
                        db.add(new_pc)
                    _sync_delivery(db_product, new_product, db)
                    log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (CREATE)")
            
            elif action == "update":
                # Ищем синхронизированный товар по sync_product_id (надежный способ)
                matching = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.sync_product_id == sync_id
                ).first()
                
                # Fallback: если sync_product_id не установлен, ищем по имени и цене (для обратной совместимости)
                if not matching:
                    matching = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == db_product.name,
                        models.Product.price == db_product.price
                    ).first()
                
                if matching:
                    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                    category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                    
                    # Синхронизируем характеристики: удаляем старые, копируем новые
                    for old_pc in list(matching.characteristics):
                        db.delete(old_pc)
                    for pc in db_product.characteristics:
                        new_pc = models.ProductCharacteristic(
                            product_id=matching.id,
                            name=pc.name,
                            value=pc.value,
                            sort_order=pc.sort_order
                        )
                        db.add(new_pc)
                    _sync_delivery(db_product, matching, db)
                    matching.name = db_product.name  # Обновляем название
                    matching.description = db_product.description
                    matching.price = db_product.price  # Обновляем цену при синхронизации
                    matching.image_url = db_product.image_url
                    matching.images_urls = db_product.images_urls
                    matching.discount = db_product.discount
                    matching.is_hot_offer = db_product.is_hot_offer
                    matching.quantity = db_product.quantity
                    matching.is_sold = db_product.is_sold
                    matching.is_made_to_order = db_product.is_made_to_order
                    matching.quantity_show_enabled = db_product.quantity_show_enabled
                    matching.is_hidden = db_product.is_hidden
                    # Обновляем поля для продажи
                    matching.is_for_sale = db_product.is_for_sale
                    matching.is_sale_enabled = db_product.is_sale_enabled
                    matching.is_reservation_enabled = getattr(db_product, 'is_reservation_enabled', False)
                    matching.is_client_sale = db_product.is_client_sale
                    matching.seller_id = db_product.seller_id
                    matching.price_from = db_product.price_from
                    matching.price_to = db_product.price_to
                    matching.price_fixed = db_product.price_fixed
                    matching.price_type = db_product.price_type
                    matching.quantity_from = db_product.quantity_from
                    matching.quantity_unit = db_product.quantity_unit
                    # КРИТИЧНО: Обновляем новые поля цен
                    matching.price_card = db_product.price_card
                    matching.price_cash = db_product.price_cash
                    matching.price_old = db_product.price_old
                    matching.category_id = category_id_for_bot
                    # Обновляем sync_product_id если он не был установлен
                    if not matching.sync_product_id:
                        matching.sync_product_id = sync_id
                    log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")
    
    else:
        # Товар в подключенном боте - синхронизируем в основной бот И во все другие подключенные боты
        # Определяем sync_product_id: если товар уже связан, используем его, иначе ищем оригинальный товар
        sync_id = db_product.sync_product_id
        
        if action == "create":
            # Если sync_product_id не установлен, ищем оригинальный товар по имени и цене
            if not sync_id:
                existing_main = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.name == db_product.name,
                    models.Product.price == db_product.price
                ).first()
                if existing_main:
                    sync_id = existing_main.sync_product_id or existing_main.id
                    db_product.sync_product_id = sync_id
            
            # 1. Синхронизируем в основной бот (ищем по sync_product_id)
            if sync_id:
                existing_main = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.sync_product_id == sync_id
                ).first()
                
                # Fallback: если не нашли по sync_product_id, ищем по имени и цене
                if not existing_main:
                    existing_main = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == None,
                        models.Product.name == db_product.name,
                        models.Product.price == db_product.price
                    ).first()
            else:
                # Если sync_product_id не установлен, ищем по имени и цене
                existing_main = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.name == db_product.name,
                    models.Product.price == db_product.price
                ).first()
            
            if existing_main:
                # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                category_id_for_main = normalize_category_id(db_product.category_id, None, user_id, db)
                
                existing_main.name = db_product.name  # Обновляем название
                existing_main.description = db_product.description
                existing_main.price = db_product.price
                existing_main.image_url = db_product.image_url
                existing_main.images_urls = db_product.images_urls
                existing_main.discount = db_product.discount
                existing_main.is_hot_offer = db_product.is_hot_offer
                existing_main.quantity = db_product.quantity
                existing_main.is_sold = db_product.is_sold
                existing_main.is_made_to_order = db_product.is_made_to_order
                existing_main.quantity_show_enabled = db_product.quantity_show_enabled
                # Обновляем поля для продажи
                existing_main.is_for_sale = db_product.is_for_sale
                existing_main.price_from = db_product.price_from
                existing_main.price_to = db_product.price_to
                existing_main.price_fixed = db_product.price_fixed
                existing_main.price_type = db_product.price_type
                existing_main.quantity_from = db_product.quantity_from
                existing_main.quantity_unit = db_product.quantity_unit
                # КРИТИЧНО: Обновляем новые поля цен
                existing_main.price_card = db_product.price_card
                existing_main.price_cash = db_product.price_cash
                existing_main.price_old = db_product.price_old
                existing_main.category_id = category_id_for_main
                # Устанавливаем sync_product_id если он не был установлен
                if not existing_main.sync_product_id:
                    existing_main.sync_product_id = existing_main.id
                # Обновляем sync_product_id у товара в боте
                if not db_product.sync_product_id:
                    db_product.sync_product_id = existing_main.sync_product_id
                # Синхронизируем характеристики и доставку: main bot <- bot product
                _sync_characteristics(db_product, existing_main, db)
                _sync_delivery(db_product, existing_main, db)
                log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={existing_main.sync_product_id}) to main bot (UPDATE existing)")
                log.debug(f"💾 [SYNC] Updated main bot product {existing_main.id}: price_card={existing_main.price_card}, price_cash={existing_main.price_cash}, price_old={existing_main.price_old}")
            elif not existing_main:
                # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                category_id_for_main = normalize_category_id(db_product.category_id, None, user_id, db)
                
                # Создаем копию товара в основном боте
                new_product = models.Product(
                    name=db_product.name,
                    description=db_product.description,
                    price=db_product.price,
                    image_url=db_product.image_url,
                    images_urls=db_product.images_urls,
                    discount=db_product.discount,
                    user_id=user_id,
                    bot_id=None,
                    sync_product_id=None,  # Будет установлен после получения ID
                    is_hot_offer=db_product.is_hot_offer,
                    quantity=db_product.quantity,
                    is_sold=db_product.is_sold,
                    is_made_to_order=db_product.is_made_to_order,
                    is_for_sale=db_product.is_for_sale,
                    is_sale_enabled=db_product.is_sale_enabled,
                    is_reservation_enabled=getattr(db_product, 'is_reservation_enabled', False),
                    is_client_sale=db_product.is_client_sale,
                    seller_id=db_product.seller_id,
                    price_from=db_product.price_from,
                    price_to=db_product.price_to,
                    price_fixed=db_product.price_fixed,
                    price_type=db_product.price_type,
                    quantity_from=db_product.quantity_from,
                    quantity_unit=db_product.quantity_unit,
                    quantity_show_enabled=db_product.quantity_show_enabled,
                    # КРИТИЧНО: Копируем новые поля цен
                    price_card=db_product.price_card,
                    price_cash=db_product.price_cash,
                    price_old=db_product.price_old,
                    category_id=category_id_for_main
                )
                db.add(new_product)
                db.flush()  # Получаем ID нового товара
                # Устанавливаем sync_product_id = id (сам на себя)
                new_product.sync_product_id = new_product.id
                # Обновляем sync_product_id у товара в боте
                if not db_product.sync_product_id:
                    db_product.sync_product_id = new_product.id
                sync_id = new_product.id
                # Копируем характеристики и доставку в main bot
                _sync_characteristics(db_product, new_product, db)
                _sync_delivery(db_product, new_product, db)
                log.debug(f"🔄 Synced product '{db_product.name}' (id={new_product.id}, sync_id={sync_id}) to main bot (CREATE)")
                log.debug(f"💾 [SYNC] Created main bot product {new_product.id}: price_card={new_product.price_card}, price_cash={new_product.price_cash}, price_old={new_product.price_old}")
            
            # 2. Синхронизируем во все другие подключенные боты (кроме текущего)
            # Используем sync_id для надежной синхронизации
            if not sync_id:
                sync_id = db_product.sync_product_id
            
            for bot in connected_bots:
                if bot.id == db_product.bot_id:
                    continue  # Пропускаем текущий бот
                
                # Ищем синхронизированный товар по sync_product_id (надежный способ)
                existing = None
                if sync_id:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.sync_product_id == sync_id
                    ).first()
                
                # Fallback: если не нашли по sync_product_id, ищем по имени и цене
                if not existing:
                    existing = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == db_product.name,
                        models.Product.price == db_product.price
                    ).first()
                
                if existing:
                    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                    category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                    
                    existing.description = db_product.description
                    existing.price = db_product.price  # Обновляем цену при синхронизации
                    existing.image_url = db_product.image_url
                    existing.images_urls = db_product.images_urls
                    existing.discount = db_product.discount
                    existing.is_hot_offer = db_product.is_hot_offer
                    existing.quantity = db_product.quantity
                    existing.is_sold = db_product.is_sold
                    existing.is_made_to_order = db_product.is_made_to_order
                    existing.is_for_sale = db_product.is_for_sale
                    existing.price_from = db_product.price_from
                    existing.price_to = db_product.price_to
                    existing.price_fixed = db_product.price_fixed
                    existing.price_type = db_product.price_type
                    existing.quantity_from = db_product.quantity_from
                    existing.quantity_unit = db_product.quantity_unit
                    # КРИТИЧНО: Обновляем новые поля цен
                    existing.price_card = db_product.price_card
                    existing.price_cash = db_product.price_cash
                    existing.price_old = db_product.price_old
                    existing.category_id = category_id_for_bot
                    # Обновляем sync_product_id если он не был установлен
                    if sync_id and not existing.sync_product_id:
                        existing.sync_product_id = sync_id
                    # Синхронизируем характеристики и доставку: other bot <- bot product
                    _sync_characteristics(db_product, existing, db)
                    _sync_delivery(db_product, existing, db)
                    log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE existing)")
                elif not existing:
                    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                    category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                    
                    new_product = models.Product(
                        name=db_product.name,
                        description=db_product.description,
                        price=db_product.price,
                        image_url=db_product.image_url,
                        images_urls=db_product.images_urls,
                        discount=db_product.discount,
                        user_id=user_id,
                        bot_id=bot.id,
                        sync_product_id=sync_id if sync_id else None,  # Связываем с оригинальным товаром
                        is_hot_offer=db_product.is_hot_offer,
                        quantity=db_product.quantity,
                        is_sold=db_product.is_sold,
                        is_made_to_order=db_product.is_made_to_order,
                        is_for_sale=db_product.is_for_sale,
                        is_sale_enabled=db_product.is_sale_enabled,
                        is_reservation_enabled=getattr(db_product, 'is_reservation_enabled', False),
                        is_client_sale=db_product.is_client_sale,
                        seller_id=db_product.seller_id,
                        price_from=db_product.price_from,
                        price_to=db_product.price_to,
                        price_fixed=db_product.price_fixed,
                        price_type=db_product.price_type,
                        quantity_from=db_product.quantity_from,
                        quantity_unit=db_product.quantity_unit,
                        quantity_show_enabled=db_product.quantity_show_enabled,
                        is_hidden=db_product.is_hidden,
                        # КРИТИЧНО: Копируем новые поля цен
                        price_card=db_product.price_card,
                        price_cash=db_product.price_cash,
                        price_old=db_product.price_old,
                        category_id=category_id_for_bot
                    )
                    db.add(new_product)
                    db.flush()
                    # Копируем характеристики и доставку в other bot
                    _sync_characteristics(db_product, new_product, db)
                    _sync_delivery(db_product, new_product, db)
                    log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (CREATE)")
        
        elif action == "update":
            # Используем sync_product_id для надежной синхронизации
            sync_id = db_product.sync_product_id
            
            # 1. Обновляем товар в основном боте (ищем по sync_product_id)
            matching_main = None
            if sync_id:
                matching_main = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.sync_product_id == sync_id
                ).first()
            
            # Fallback: если не нашли по sync_product_id, ищем по имени и цене
            if not matching_main:
                matching_main = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.name == db_product.name,
                    models.Product.price == db_product.price
                ).first()
                # Если нашли по имени и цене, устанавливаем sync_product_id
                if matching_main:
                    if not matching_main.sync_product_id:
                        matching_main.sync_product_id = matching_main.id
                    if not db_product.sync_product_id:
                        db_product.sync_product_id = matching_main.sync_product_id
                    sync_id = matching_main.sync_product_id
            
            if matching_main:
                # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                category_id_for_main = normalize_category_id(db_product.category_id, None, user_id, db)
                
                matching_main.name = db_product.name  # Обновляем название
                matching_main.description = db_product.description
                matching_main.price = db_product.price  # Обновляем цену при синхронизации
                matching_main.image_url = db_product.image_url
                matching_main.images_urls = db_product.images_urls
                matching_main.discount = db_product.discount
                matching_main.is_hot_offer = db_product.is_hot_offer
                matching_main.quantity = db_product.quantity
                matching_main.is_sold = db_product.is_sold
                matching_main.is_made_to_order = db_product.is_made_to_order
                matching_main.is_sale_enabled = db_product.is_sale_enabled
                matching_main.is_reservation_enabled = getattr(db_product, "is_reservation_enabled", False)
                matching_main.quantity_show_enabled = db_product.quantity_show_enabled
                matching_main.is_hidden = db_product.is_hidden
                # Обновляем поля для продажи
                matching_main.is_for_sale = db_product.is_for_sale
                matching_main.price_from = db_product.price_from
                matching_main.price_to = db_product.price_to
                matching_main.price_fixed = db_product.price_fixed
                matching_main.price_type = db_product.price_type
                matching_main.quantity_from = db_product.quantity_from
                matching_main.quantity_unit = db_product.quantity_unit
                # КРИТИЧНО: Обновляем новые поля цен
                matching_main.price_card = db_product.price_card
                matching_main.price_cash = db_product.price_cash
                matching_main.price_old = db_product.price_old
                matching_main.category_id = category_id_for_main
                # Синхронизируем характеристики и доставку: main bot <- bot product
                _sync_characteristics(db_product, matching_main, db)
                _sync_delivery(db_product, matching_main, db)
                log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to main bot (UPDATE)")
            
            # 2. Обновляем товар во всех других подключенных ботах (кроме текущего)
            # Используем sync_id для надежной синхронизации
            if not sync_id:
                sync_id = db_product.sync_product_id
            
            for bot in connected_bots:
                if bot.id == db_product.bot_id:
                    continue  # Пропускаем текущий бот
                
                # Ищем синхронизированный товар по sync_product_id (надежный способ)
                matching = None
                if sync_id:
                    matching = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.sync_product_id == sync_id
                    ).first()
                
                # Fallback: если не нашли по sync_product_id, ищем по имени и цене
                if not matching:
                    matching = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == db_product.name,
                        models.Product.price == db_product.price
                    ).first()
                
                if matching:
                    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
                    category_id_for_bot = normalize_category_id(db_product.category_id, bot.id, user_id, db)
                    
                    matching.name = db_product.name  # Обновляем название
                    matching.description = db_product.description
                    matching.price = db_product.price  # Обновляем цену при синхронизации
                    matching.image_url = db_product.image_url
                    matching.images_urls = db_product.images_urls
                    matching.discount = db_product.discount
                    matching.is_hot_offer = db_product.is_hot_offer
                    matching.quantity = db_product.quantity
                    matching.is_sold = db_product.is_sold
                    matching.is_made_to_order = db_product.is_made_to_order
                    matching.quantity_show_enabled = db_product.quantity_show_enabled
                    matching.is_hidden = db_product.is_hidden
                    # Обновляем поля для продажи
                    matching.is_for_sale = db_product.is_for_sale
                    matching.is_sale_enabled = db_product.is_sale_enabled
                    matching.is_reservation_enabled = getattr(db_product, 'is_reservation_enabled', False)
                    matching.price_from = db_product.price_from
                    matching.price_to = db_product.price_to
                    matching.price_fixed = db_product.price_fixed
                    matching.price_type = db_product.price_type
                    matching.quantity_from = db_product.quantity_from
                    matching.quantity_unit = db_product.quantity_unit
                    # КРИТИЧНО: Обновляем новые поля цен
                    matching.price_card = db_product.price_card
                    matching.price_cash = db_product.price_cash
                    matching.price_old = db_product.price_old
                    matching.category_id = category_id_for_bot
                    # Обновляем sync_product_id если он не был установлен
                    if sync_id and not matching.sync_product_id:
                        matching.sync_product_id = sync_id
                    # Синхронизируем характеристики и доставку: other bot <- bot product
                    _sync_characteristics(db_product, matching, db)
                    _sync_delivery(db_product, matching, db)
                    log.debug(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")
        
        elif action == "delete":
            # Используем sync_product_id для надежного удаления всех связанных товаров
            sync_id = db_product.sync_product_id
            
            # 1. Удаляем товар в основном боте по sync_product_id
            if sync_id:
                matching_main_products = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.sync_product_id == sync_id
                ).all()
            else:
                # Fallback: если sync_product_id не установлен, удаляем по имени
                matching_main_products = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.name == db_product.name
                ).all()
            
            for matching_main in matching_main_products:
                db.delete(matching_main)
                log.debug(f"🔄 Synced deletion of product '{db_product.name}' (id={matching_main.id}, sync_id={sync_id}) to main bot (DELETE)")
            
            # 2. Удаляем все связанные товары из всех других подключенных ботов (кроме текущего)
            for bot in connected_bots:
                if bot.id == db_product.bot_id:
                    continue  # Пропускаем текущий бот
                
                if sync_id:
                    # Удаляем по sync_product_id (надежный способ)
                    matching_products = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.sync_product_id == sync_id
                    ).all()
                else:
                    # Fallback: удаляем по имени
                    matching_products = db.query(models.Product).filter(
                        models.Product.user_id == user_id,
                        models.Product.bot_id == bot.id,
                        models.Product.name == db_product.name
                    ).all()
                
                for matching in matching_products:
                    db.delete(matching)
                    log.debug(f"🔄 Synced deletion of product '{db_product.name}' (id={matching.id}, sync_id={sync_id}) to bot {bot.id} (DELETE)")
    
    # Также обрабатываем удаление из основного бота во все подключенные боты
    if db_product.bot_id is None and action == "delete":
        sync_id = db_product.sync_product_id or db_product.id
        
        for bot in connected_bots:
            # Удаляем все товары с таким же sync_product_id (надежный способ)
            if sync_id:
                matching_products = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.sync_product_id == sync_id
                ).all()
            else:
                # Fallback: удаляем по имени
                matching_products = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == bot.id,
                    models.Product.name == db_product.name
                ).all()
            
            for matching in matching_products:
                db.delete(matching)
                log.debug(f"🔄 Synced deletion of product '{db_product.name}' (id={matching.id}, sync_id={sync_id}) from main bot to bot {bot.id} (DELETE)")
    
    # BACKFILL: для create/update — синхронизируем характеристики и доставку во все siblings (товары с тем же sync_product_id)
    if action in ("create", "update") and db_product.sync_product_id is not None:
        _sync_characteristics_to_all_siblings(db_product, db, action)
        _sync_delivery_to_all_siblings(db_product, db, action)

