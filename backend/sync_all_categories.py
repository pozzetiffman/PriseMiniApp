#!/usr/bin/env python3
"""
Скрипт для синхронизации всех категорий между основным ботом и подключенными ботами.
Используется для исправления рассинхронизации категорий.
"""
from app.db import database, models
from sqlalchemy.orm import Session

def sync_all_categories_for_user(user_id: int, db: Session):
    """
    Синхронизирует все существующие категории между основным ботом и подключенными ботами.
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
    
    # 1. Синхронизируем категории из основного бота во все подключенные боты
    main_categories = db.query(models.Category).filter(
        models.Category.user_id == user_id,
        models.Category.bot_id == None
    ).all()
    
    print(f"\n📂 Категории в основном боте: {len(main_categories)}")
    for main_cat in main_categories:
        print(f"  - {main_cat.name} (ID: {main_cat.id})")
    
    for main_cat in main_categories:
        for bot in connected_bots:
            # Проверяем, не существует ли уже такая категория
            existing = db.query(models.Category).filter(
                models.Category.user_id == user_id,
                models.Category.bot_id == bot.id,
                models.Category.name == main_cat.name
            ).first()
            
            if not existing:
                new_category = models.Category(
                    name=main_cat.name,
                    user_id=user_id,
                    bot_id=bot.id
                )
                db.add(new_category)
                synced_count += 1
                print(f"🔄 Синхронизирована категория '{main_cat.name}' в бот {bot.id} (bot_id={bot.id})")
    
    # 2. Синхронизируем категории из подключенных ботов в основной бот
    for bot in connected_bots:
        bot_categories = db.query(models.Category).filter(
            models.Category.user_id == user_id,
            models.Category.bot_id == bot.id
        ).all()
        
        print(f"\n📂 Категории в боте {bot.id}: {len(bot_categories)}")
        for bot_cat in bot_categories:
            print(f"  - {bot_cat.name} (ID: {bot_cat.id})")
        
        for bot_cat in bot_categories:
            # Проверяем, не существует ли уже такая категория в основном боте
            existing = db.query(models.Category).filter(
                models.Category.user_id == user_id,
                models.Category.bot_id == None,
                models.Category.name == bot_cat.name
            ).first()
            
            if not existing:
                new_category = models.Category(
                    name=bot_cat.name,
                    user_id=user_id,
                    bot_id=None
                )
                db.add(new_category)
                synced_count += 1
                print(f"🔄 Синхронизирована категория '{bot_cat.name}' в основной бот")
            
            # 3. Синхронизируем категории из одного подключенного бота в другие подключенные боты
            for other_bot in connected_bots:
                if other_bot.id == bot.id:
                    continue  # Пропускаем текущий бот
                
                existing_other = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == other_bot.id,
                    models.Category.name == bot_cat.name
                ).first()
                
                if not existing_other:
                    new_category = models.Category(
                        name=bot_cat.name,
                        user_id=user_id,
                        bot_id=other_bot.id
                    )
                    db.add(new_category)
                    synced_count += 1
                    print(f"🔄 Синхронизирована категория '{bot_cat.name}' из бота {bot.id} в бот {other_bot.id}")
    
    db.commit()
    return synced_count

if __name__ == "__main__":
    db = next(database.get_db())
    
    # Синхронизируем категории для пользователя 309699106
    user_id = 309699106
    
    print(f"🔄 Начинаю синхронизацию категорий для пользователя {user_id}...")
    synced_count = sync_all_categories_for_user(user_id, db)
    print(f"\n✅ Синхронизация завершена. Синхронизировано категорий: {synced_count}")
    
    # Проверяем результат
    print("\n=== ПРОВЕРКА РЕЗУЛЬТАТА ===")
    
    # Категории в основном боте
    main_categories = db.query(models.Category).filter(
        models.Category.user_id == user_id,
        models.Category.bot_id == None
    ).all()
    
    print(f"\n📂 Категории в основном боте (bot_id=None): {len(main_categories)}")
    for c in main_categories:
        print(f"  - {c.name} (ID: {c.id})")
    
    # Категории в подключенном боте
    bot_categories = db.query(models.Category).filter(
        models.Category.user_id == user_id,
        models.Category.bot_id == 7
    ).all()
    
    print(f"\n📂 Категории в подключенном боте (bot_id=7): {len(bot_categories)}")
    for c in bot_categories:
        print(f"  - {c.name} (ID: {c.id})")






