"""
Модуль для синхронизации товаров между ботами.

Этот модуль содержит функции для синхронизации товаров между основным ботом
и подключенными ботами пользователя.
"""

from sqlalchemy.orm import Session
from ..db import models


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
                # Находим соответствующую категорию в этом боте по имени
                category_id_for_bot = None
                if db_product.category_id:
                    original_category = db.query(models.Category).filter(
                        models.Category.id == db_product.category_id
                    ).first()
                    if original_category:
                        matching_category = db.query(models.Category).filter(
                            models.Category.user_id == user_id,
                            models.Category.bot_id == bot.id,
                            models.Category.name == original_category.name
                        ).first()
                        if matching_category:
                            category_id_for_bot = matching_category.id
                
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
                matching.price_from = db_product.price_from
                matching.price_to = db_product.price_to
                matching.price_fixed = db_product.price_fixed
                matching.price_type = db_product.price_type
                matching.quantity_from = db_product.quantity_from
                matching.quantity_unit = db_product.quantity_unit
                matching.quantity_show_enabled = db_product.quantity_show_enabled
                matching.category_id = category_id_for_bot
                # Обновляем sync_product_id если он не был установлен
                if not matching.sync_product_id:
                    matching.sync_product_id = sync_id
                print(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")
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
                    # Находим соответствующую категорию в этом боте по имени
                    category_id_for_bot = None
                    if db_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == db_product.category_id
                        ).first()
                        if original_category:
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
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
                        price_from=db_product.price_from,
                        price_to=db_product.price_to,
                        price_fixed=db_product.price_fixed,
                        price_type=db_product.price_type,
                        quantity_from=db_product.quantity_from,
                        quantity_unit=db_product.quantity_unit,
                        quantity_show_enabled=db_product.quantity_show_enabled,
                        category_id=category_id_for_bot
                    )
                    db.add(new_product)
                    print(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (CREATE)")
    
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
            # Находим соответствующую категорию в основном боте по имени
            category_id_for_main = None
            if db_product.category_id:
                original_category = db.query(models.Category).filter(
                    models.Category.id == db_product.category_id
                ).first()
                if original_category:
                    matching_category = db.query(models.Category).filter(
                        models.Category.user_id == user_id,
                        models.Category.bot_id == None,
                        models.Category.name == original_category.name
                    ).first()
                    if matching_category:
                        category_id_for_main = matching_category.id
            
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
            # Обновляем поля для продажи
            matching_main.is_for_sale = db_product.is_for_sale
            matching_main.price_from = db_product.price_from
            matching_main.price_to = db_product.price_to
            matching_main.price_fixed = db_product.price_fixed
            matching_main.price_type = db_product.price_type
            matching_main.quantity_from = db_product.quantity_from
            matching_main.quantity_unit = db_product.quantity_unit
            matching_main.category_id = category_id_for_main
            # Устанавливаем sync_product_id если он не был установлен
            if not matching_main.sync_product_id:
                matching_main.sync_product_id = matching_main.id
            if not db_product.sync_product_id:
                db_product.sync_product_id = matching_main.sync_product_id
            sync_id = matching_main.sync_product_id
            print(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to main bot (UPDATE)")
        
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
                # Находим соответствующую категорию в этом боте по имени
                category_id_for_bot = None
                if db_product.category_id:
                    original_category = db.query(models.Category).filter(
                        models.Category.id == db_product.category_id
                    ).first()
                    if original_category:
                        matching_category = db.query(models.Category).filter(
                            models.Category.user_id == user_id,
                            models.Category.bot_id == bot.id,
                            models.Category.name == original_category.name
                        ).first()
                        if matching_category:
                            category_id_for_bot = matching_category.id
                
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
                # Обновляем поля для продажи
                matching.is_for_sale = db_product.is_for_sale
                matching.price_from = db_product.price_from
                matching.price_to = db_product.price_to
                matching.price_fixed = db_product.price_fixed
                matching.price_type = db_product.price_type
                matching.quantity_from = db_product.quantity_from
                matching.quantity_unit = db_product.quantity_unit
                matching.category_id = category_id_for_bot
                # Обновляем sync_product_id если он не был установлен
                if sync_id and not matching.sync_product_id:
                    matching.sync_product_id = sync_id
                print(f"🔄 Synced renamed product '{old_name}' -> '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")


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
                    # Находим соответствующую категорию в этом боте по имени
                    category_id_for_bot = None
                    if db_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == db_product.category_id
                        ).first()
                        if original_category:
                            # Ищем категорию с таким же именем в этом боте
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
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
                        price_from=db_product.price_from,
                        price_to=db_product.price_to,
                        price_fixed=db_product.price_fixed,
                        price_type=db_product.price_type,
                        quantity_from=db_product.quantity_from,
                        quantity_unit=db_product.quantity_unit,
                        quantity_show_enabled=db_product.quantity_show_enabled,
                        category_id=category_id_for_bot
                    )
                    db.add(new_product)
                    print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (CREATE)")
            
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
                    # Находим соответствующую категорию в этом боте по имени
                    category_id_for_bot = None
                    if db_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == db_product.category_id
                        ).first()
                        if original_category:
                            # Ищем категорию с таким же именем в этом боте
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
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
                    # Обновляем поля для продажи
                    matching.is_for_sale = db_product.is_for_sale
                    matching.price_from = db_product.price_from
                    matching.price_to = db_product.price_to
                    matching.price_fixed = db_product.price_fixed
                    matching.price_type = db_product.price_type
                    matching.quantity_from = db_product.quantity_from
                    matching.quantity_unit = db_product.quantity_unit
                    matching.category_id = category_id_for_bot
                    # Обновляем sync_product_id если он не был установлен
                    if not matching.sync_product_id:
                        matching.sync_product_id = sync_id
                    print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")
    
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
                # Если товар с таким именем уже есть - обновляем его
                category_id_for_main = None
                if db_product.category_id:
                    original_category = db.query(models.Category).filter(
                        models.Category.id == db_product.category_id
                    ).first()
                    if original_category:
                        matching_category = db.query(models.Category).filter(
                            models.Category.user_id == user_id,
                            models.Category.bot_id == None,
                            models.Category.name == original_category.name
                        ).first()
                        if matching_category:
                            category_id_for_main = matching_category.id
                
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
                existing_main.category_id = category_id_for_main
                # Устанавливаем sync_product_id если он не был установлен
                if not existing_main.sync_product_id:
                    existing_main.sync_product_id = existing_main.id
                # Обновляем sync_product_id у товара в боте
                if not db_product.sync_product_id:
                    db_product.sync_product_id = existing_main.sync_product_id
                print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={existing_main.sync_product_id}) to main bot (UPDATE existing)")
            elif not existing_main:
                # Находим соответствующую категорию в основном боте по имени
                category_id_for_main = None
                if db_product.category_id:
                    original_category = db.query(models.Category).filter(
                        models.Category.id == db_product.category_id
                    ).first()
                    if original_category:
                        # Ищем категорию с таким же именем в основном боте
                        matching_category = db.query(models.Category).filter(
                            models.Category.user_id == user_id,
                            models.Category.bot_id == None,
                            models.Category.name == original_category.name
                        ).first()
                        if matching_category:
                            category_id_for_main = matching_category.id
                
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
                    price_from=db_product.price_from,
                    price_to=db_product.price_to,
                    price_fixed=db_product.price_fixed,
                    price_type=db_product.price_type,
                    quantity_from=db_product.quantity_from,
                    quantity_unit=db_product.quantity_unit,
                    quantity_show_enabled=db_product.quantity_show_enabled,
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
                print(f"🔄 Synced product '{db_product.name}' (id={new_product.id}, sync_id={sync_id}) to main bot (CREATE)")
            
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
                    # Обновляем существующий товар
                    category_id_for_bot = None
                    if db_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == db_product.category_id
                        ).first()
                        if original_category:
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
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
                    existing.category_id = category_id_for_bot
                    # Обновляем sync_product_id если он не был установлен
                    if sync_id and not existing.sync_product_id:
                        existing.sync_product_id = sync_id
                    print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE existing)")
                elif not existing:
                    # Находим соответствующую категорию в этом боте по имени
                    category_id_for_bot = None
                    if db_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == db_product.category_id
                        ).first()
                        if original_category:
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
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
                        price_from=db_product.price_from,
                        price_to=db_product.price_to,
                        price_fixed=db_product.price_fixed,
                        price_type=db_product.price_type,
                        quantity_from=db_product.quantity_from,
                        quantity_unit=db_product.quantity_unit,
                        quantity_show_enabled=db_product.quantity_show_enabled,
                        category_id=category_id_for_bot
                    )
                    db.add(new_product)
                    print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (CREATE)")
        
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
                # Находим соответствующую категорию в основном боте по имени
                category_id_for_main = None
                if db_product.category_id:
                    original_category = db.query(models.Category).filter(
                        models.Category.id == db_product.category_id
                    ).first()
                    if original_category:
                        # Ищем категорию с таким же именем в основном боте
                        matching_category = db.query(models.Category).filter(
                            models.Category.user_id == user_id,
                            models.Category.bot_id == None,
                            models.Category.name == original_category.name
                        ).first()
                        if matching_category:
                            category_id_for_main = matching_category.id
                
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
                matching_main.quantity_show_enabled = db_product.quantity_show_enabled
                # Обновляем поля для продажи
                matching_main.is_for_sale = db_product.is_for_sale
                matching_main.price_from = db_product.price_from
                matching_main.price_to = db_product.price_to
                matching_main.price_fixed = db_product.price_fixed
                matching_main.price_type = db_product.price_type
                matching_main.quantity_from = db_product.quantity_from
                matching_main.quantity_unit = db_product.quantity_unit
                matching_main.category_id = category_id_for_main
                print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to main bot (UPDATE)")
            
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
                    # Находим соответствующую категорию в этом боте по имени
                    category_id_for_bot = None
                    if db_product.category_id:
                        original_category = db.query(models.Category).filter(
                            models.Category.id == db_product.category_id
                        ).first()
                        if original_category:
                            matching_category = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == original_category.name
                            ).first()
                            if matching_category:
                                category_id_for_bot = matching_category.id
                    
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
                    # Обновляем поля для продажи
                    matching.is_for_sale = db_product.is_for_sale
                    matching.price_from = db_product.price_from
                    matching.price_to = db_product.price_to
                    matching.price_fixed = db_product.price_fixed
                    matching.price_type = db_product.price_type
                    matching.quantity_from = db_product.quantity_from
                    matching.quantity_unit = db_product.quantity_unit
                    matching.category_id = category_id_for_bot
                    # Обновляем sync_product_id если он не был установлен
                    if sync_id and not matching.sync_product_id:
                        matching.sync_product_id = sync_id
                    print(f"🔄 Synced product '{db_product.name}' (id={db_product.id}, sync_id={sync_id}) to bot {bot.id} (UPDATE)")
        
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
                print(f"🔄 Synced deletion of product '{db_product.name}' (id={matching_main.id}, sync_id={sync_id}) to main bot (DELETE)")
            
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
                    print(f"🔄 Synced deletion of product '{db_product.name}' (id={matching.id}, sync_id={sync_id}) to bot {bot.id} (DELETE)")
    
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
                print(f"🔄 Synced deletion of product '{db_product.name}' (id={matching.id}, sync_id={sync_id}) from main bot to bot {bot.id} (DELETE)")

