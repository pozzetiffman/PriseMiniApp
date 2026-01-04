#!/usr/bin/env python3
"""
Скрипт для синхронизации всех товаров между основным ботом и подключенными ботами.
Используется для синхронизации товаров, которые были созданы до добавления автоматической синхронизации.
"""
from app.db import database, models
from sqlalchemy.orm import Session

def sync_all_products_for_user(user_id: int, db: Session):
    """
    Синхронизирует все существующие товары между основным ботом и подключенными ботами.
    """
    # Находим все подключенные боты пользователя
    connected_bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == user_id,
        models.Bot.is_active == True
    ).all()
    
    if not connected_bots:
        print(f"❌ У пользователя {user_id} нет подключенных ботов")
        return 0
    
    print(f"✅ Найдено {len(connected_bots)} подключенных ботов для пользователя {user_id}")
    
    synced_count = 0
    
    # 1. Синхронизируем товары из основного бота во все подключенные боты
    main_products = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.bot_id == None,
        models.Product.is_sold == False
    ).all()
    
    print(f"\n📦 Товары в основном боте: {len(main_products)}")
    for main_product in main_products:
        print(f"  - {main_product.name} (ID: {main_product.id}, Price: {main_product.price})")
    
    for main_product in main_products:
        for bot in connected_bots:
            # Проверяем, не существует ли уже такой товар
            existing = db.query(models.Product).filter(
                models.Product.user_id == user_id,
                models.Product.bot_id == bot.id,
                models.Product.name == main_product.name,
                models.Product.price == main_product.price
            ).first()
            
            if not existing:
                # Находим соответствующую категорию в этом боте по имени
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
                
                new_product = models.Product(
                    name=main_product.name,
                    description=main_product.description,
                    price=main_product.price,
                    image_url=main_product.image_url,
                    images_urls=main_product.images_urls,
                    discount=main_product.discount,
                    user_id=user_id,
                    bot_id=bot.id,
                    is_hot_offer=main_product.is_hot_offer,
                    quantity=main_product.quantity,
                    is_sold=main_product.is_sold,
                    is_made_to_order=main_product.is_made_to_order,
                    category_id=category_id_for_bot
                )
                db.add(new_product)
                synced_count += 1
                print(f"🔄 Синхронизирован товар '{main_product.name}' в бот {bot.id} (bot_id={bot.id})")
    
    # 2. Синхронизируем товары из подключенных ботов в основной бот
    for bot in connected_bots:
        bot_products = db.query(models.Product).filter(
            models.Product.user_id == user_id,
            models.Product.bot_id == bot.id,
            models.Product.is_sold == False
        ).all()
        
        print(f"\n📦 Товары в боте {bot.id}: {len(bot_products)}")
        for bot_product in bot_products:
            print(f"  - {bot_product.name} (ID: {bot_product.id}, Price: {bot_product.price})")
        
        for bot_product in bot_products:
            # Проверяем, не существует ли уже такой товар в основном боте
            existing = db.query(models.Product).filter(
                models.Product.user_id == user_id,
                models.Product.bot_id == None,
                models.Product.name == bot_product.name,
                models.Product.price == bot_product.price
            ).first()
            
            if not existing:
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
                
                new_product = models.Product(
                    name=bot_product.name,
                    description=bot_product.description,
                    price=bot_product.price,
                    image_url=bot_product.image_url,
                    images_urls=bot_product.images_urls,
                    discount=bot_product.discount,
                    user_id=user_id,
                    bot_id=None,
                    is_hot_offer=bot_product.is_hot_offer,
                    quantity=bot_product.quantity,
                    is_sold=bot_product.is_sold,
                    is_made_to_order=bot_product.is_made_to_order,
                    category_id=category_id_for_main
                )
                db.add(new_product)
                synced_count += 1
                print(f"🔄 Синхронизирован товар '{bot_product.name}' в основной бот")
    
    db.commit()
    return synced_count

if __name__ == "__main__":
    db = next(database.get_db())
    
    # Синхронизируем товары для пользователя 309699106
    user_id = 309699106
    
    print(f"🔄 Начинаю синхронизацию товаров для пользователя {user_id}...")
    synced_count = sync_all_products_for_user(user_id, db)
    print(f"\n✅ Синхронизация завершена. Синхронизировано товаров: {synced_count}")
    
    # Проверяем результат
    print("\n=== ПРОВЕРКА РЕЗУЛЬТАТА ===")
    
    # Товары в основном боте
    main_products = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.bot_id == None,
        models.Product.is_sold == False
    ).all()
    
    print(f"\n📦 Товары в основном боте (bot_id=None): {len(main_products)}")
    for p in main_products:
        print(f"  - {p.name} (ID: {p.id}, Price: {p.price})")
    
    # Товары в подключенном боте
    bot_products = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.bot_id == 7,
        models.Product.is_sold == False
    ).all()
    
    print(f"\n📦 Товары в подключенном боте (bot_id=7): {len(bot_products)}")
    for p in bot_products:
        print(f"  - {p.name} (ID: {p.id}, Price: {p.price})")






