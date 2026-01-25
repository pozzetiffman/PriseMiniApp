from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from ..db import models, database
from ..models import category as schemas

router = APIRouter(prefix="/api/categories", tags=["categories"])

def sync_category_to_all_bots(db_category: models.Category, db: Session, action: str = "create"):
    """
    Синхронизирует категорию во все боты пользователя (двусторонняя синхронизация).
    
    action: "create", "update", "delete"
    """
    user_id = db_category.user_id
    
    # Находим все подключенные боты пользователя
    connected_bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == user_id,
        models.Bot.is_active == True
    ).all()
    
    if db_category.bot_id is None:
        # Категория в основном боте - синхронизируем во все подключенные боты
        for bot in connected_bots:
            if action == "create":
                # Проверяем, не существует ли уже такая категория
                existing = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if not existing:
                    # Создаем копию категории для этого бота
                    # Нужно найти родительскую категорию в целевом боте, если есть parent_id
                    synced_parent_id = None
                    if db_category.parent_id is not None:
                        # Находим родительскую категорию в основном боте
                        parent_in_main = db.query(models.Category).filter(
                            models.Category.id == db_category.parent_id,
                            models.Category.user_id == user_id,
                            models.Category.bot_id == None
                        ).first()
                        if parent_in_main:
                            # Ищем соответствующую категорию в целевом боте
                            parent_in_target = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == parent_in_main.name
                            ).first()
                            if parent_in_target:
                                synced_parent_id = parent_in_target.id
                    
                    new_category = models.Category(
                        name=db_category.name,
                        user_id=user_id,
                        bot_id=bot.id,
                        parent_id=synced_parent_id
                    )
                    db.add(new_category)
                    print(f"🔄 Synced category '{db_category.name}' to bot {bot.id} (CREATE)")
                else:
                    # Категория уже существует в этом боте - это нормально
                    print(f"ℹ️ Category '{db_category.name}' already exists in bot {bot.id}, skipping creation")
            
            elif action == "update":
                # Находим соответствующую категорию и обновляем ее
                matching = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if matching:
                    matching.name = db_category.name
                    print(f"🔄 Synced category '{db_category.name}' to bot {bot.id} (UPDATE)")
            
            elif action == "delete":
                # Удаляем соответствующую категорию
                matching = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if matching:
                    db.delete(matching)
                    print(f"🔄 Synced deletion of category '{db_category.name}' to bot {bot.id} (DELETE)")
    
    else:
        # Категория в подключенном боте - синхронизируем в основной бот И во все другие подключенные боты
        if action == "create":
            # 1. Синхронизируем в основной бот
            existing_main = db.query(models.Category).filter(
                models.Category.user_id == user_id,
                models.Category.bot_id == None,
                models.Category.name == db_category.name
            ).first()
            
            if not existing_main:
                # Создаем копию категории в основном боте
                # Нужно найти родительскую категорию в основном боте, если есть parent_id
                synced_parent_id = None
                if db_category.parent_id is not None:
                    # Находим родительскую категорию в текущем боте
                    parent_in_current = db.query(models.Category).filter(
                        models.Category.id == db_category.parent_id,
                        models.Category.user_id == user_id,
                        models.Category.bot_id == db_category.bot_id
                    ).first()
                    if parent_in_current:
                        # Ищем соответствующую категорию в основном боте
                        parent_in_main = db.query(models.Category).filter(
                            models.Category.user_id == user_id,
                            models.Category.bot_id == None,
                            models.Category.name == parent_in_current.name
                        ).first()
                        if parent_in_main:
                            synced_parent_id = parent_in_main.id
                
                new_category = models.Category(
                    name=db_category.name,
                    user_id=user_id,
                    bot_id=None,
                    parent_id=synced_parent_id
                )
                db.add(new_category)
                print(f"🔄 Synced category '{db_category.name}' to main bot (CREATE)")
            else:
                # Категория уже существует в основном боте - это нормально
                print(f"ℹ️ Category '{db_category.name}' already exists in main bot, skipping creation")
            
            # 2. Синхронизируем во все другие подключенные боты (кроме текущего)
            # ВАЖНО: Синхронизируем даже если категория уже существует в основном боте
            # Это гарантирует, что все боты имеют одинаковые категории
            for bot in connected_bots:
                if bot.id == db_category.bot_id:
                    continue  # Пропускаем текущий бот
                
                existing = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if not existing:
                    # Нужно найти родительскую категорию в целевом боте, если есть parent_id
                    synced_parent_id = None
                    if db_category.parent_id is not None:
                        # Находим родительскую категорию в текущем боте
                        parent_in_current = db.query(models.Category).filter(
                            models.Category.id == db_category.parent_id,
                            models.Category.user_id == user_id,
                            models.Category.bot_id == db_category.bot_id
                        ).first()
                        if parent_in_current:
                            # Ищем соответствующую категорию в целевом боте
                            parent_in_target = db.query(models.Category).filter(
                                models.Category.user_id == user_id,
                                models.Category.bot_id == bot.id,
                                models.Category.name == parent_in_current.name
                            ).first()
                            if parent_in_target:
                                synced_parent_id = parent_in_target.id
                    
                    new_category = models.Category(
                        name=db_category.name,
                        user_id=user_id,
                        bot_id=bot.id,
                        parent_id=synced_parent_id
                    )
                    db.add(new_category)
                    print(f"🔄 Synced category '{db_category.name}' to bot {bot.id} (CREATE)")
                else:
                    # Категория уже существует в этом боте - это нормально
                    print(f"ℹ️ Category '{db_category.name}' already exists in bot {bot.id}, skipping creation")
        
        elif action == "update":
            # 1. Обновляем категорию в основном боте
            matching_main = db.query(models.Category).filter(
                models.Category.user_id == user_id,
                models.Category.bot_id == None,
                models.Category.name == db_category.name
            ).first()
            
            if matching_main:
                matching_main.name = db_category.name
                print(f"🔄 Synced category '{db_category.name}' to main bot (UPDATE)")
            
            # 2. Обновляем категорию во всех других подключенных ботах (кроме текущего)
            for bot in connected_bots:
                if bot.id == db_category.bot_id:
                    continue  # Пропускаем текущий бот
                
                matching = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if matching:
                    matching.name = db_category.name
                    print(f"🔄 Synced category '{db_category.name}' to bot {bot.id} (UPDATE)")
        
        elif action == "delete":
            # 1. Удаляем соответствующую категорию в основном боте
            matching_main = db.query(models.Category).filter(
                models.Category.user_id == user_id,
                models.Category.bot_id == None,
                models.Category.name == db_category.name
            ).first()
            
            if matching_main:
                db.delete(matching_main)
                print(f"🔄 Synced deletion of category '{db_category.name}' to main bot (DELETE)")
            
            # 2. Удаляем категорию из всех других подключенных ботов (кроме текущего)
            for bot in connected_bots:
                if bot.id == db_category.bot_id:
                    continue  # Пропускаем текущий бот
                
                matching = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if matching:
                    db.delete(matching)
                    print(f"🔄 Synced deletion of category '{db_category.name}' to bot {bot.id} (DELETE)")

@router.get("/", response_model=List[schemas.Category])
def get_categories(
    user_id: int,
    bot_id: Optional[int] = Query(None, description="ID бота для независимых магазинов"),
    flat: bool = Query(False, description="Вернуть все категории в плоском виде (включая подкатегории)"),
    db: Session = Depends(database.get_db)
):
    import time
    request_start = time.time()
    print(f"📂 [CATEGORIES API] get_categories called: user_id={user_id}, bot_id={bot_id}, flat={flat}")
    query = db.query(models.Category).filter(models.Category.user_id == user_id)
    # Если bot_id указан - фильтруем по bot_id (независимый магазин бота)
    # Если bot_id не указан - фильтруем по bot_id = None (основной бот)
    if bot_id is not None:
        query = query.filter(models.Category.bot_id == bot_id)
    else:
        query = query.filter(models.Category.bot_id == None)
    
    categories = query.all()
    print(f"📂 [CATEGORIES API] Found {len(categories)} total categories in DB")
    
    if flat:
        # Возвращаем все категории в плоском виде (для выбора при создании товара)
        print(f"📂 [CATEGORIES API] Returning {len(categories)} categories in flat format")
        return categories
    else:
        # Группируем категории: основные (parent_id=None) и подкатегории
        main_categories = [cat for cat in categories if cat.parent_id is None]
        subcategories_dict = {}
        for cat in categories:
            if cat.parent_id is not None:
                if cat.parent_id not in subcategories_dict:
                    subcategories_dict[cat.parent_id] = []
                subcategories_dict[cat.parent_id].append(cat)
        
        # Добавляем подкатегории к основным категориям
        for main_cat in main_categories:
            if main_cat.id in subcategories_dict:
                main_cat.subcategories = subcategories_dict[main_cat.id]
                print(f"📂 [CATEGORIES API] Main category '{main_cat.name}' (id={main_cat.id}) has {len(main_cat.subcategories)} subcategories")
            else:
                main_cat.subcategories = []
                print(f"📂 [CATEGORIES API] Main category '{main_cat.name}' (id={main_cat.id}) has no subcategories")
        
        # Возвращаем только основные категории (с подкатегориями внутри)
        print(f"📂 [CATEGORIES API] Returning {len(main_categories)} main categories with hierarchy")
        for main_cat in main_categories:
            print(f"   - {main_cat.name} (id={main_cat.id}): {len(main_cat.subcategories)} subcategories")
        
        total_time = time.time() - request_start
        print(f"⏱️ [CATEGORIES API] Total request time: {total_time:.3f}s")
        if total_time > 1.0:
            print(f"⚠️ [CATEGORIES API] WARNING: Request took {total_time:.3f}s - this is slow!")
        
        return main_categories

@router.post("/", response_model=schemas.Category)
async def create_category(
    category: schemas.CategoryCreate, 
    user_id: int = Query(...),
    bot_id: Optional[int] = Query(None, description="ID бота для независимых магазинов"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    # Если bot_id не указан, определяем его:
    # 1. Из initData (если запрос от WebApp)
    # 2. По user_id (если запрос от бота - находим подключенный бот пользователя)
    final_bot_id = bot_id
    if final_bot_id is None:
        if x_telegram_init_data:
            # Запрос от WebApp - определяем bot_id из initData
            try:
                from ..routers.context import get_validated_user_and_bot
                _, final_bot_id = await get_validated_user_and_bot(x_telegram_init_data, db)
                print(f"✅ Determined bot_id={final_bot_id} from initData for category creation")
            except:
                final_bot_id = None
        else:
            # Запрос от бота (localhost) - ВСЕГДА создаем в основном боте (bot_id=None)
            # Категории будут синхронизированы во все подключенные боты автоматически
            final_bot_id = None  # Основной бот
            print(f"ℹ️ Category creation from bot - using main bot (bot_id=None), will sync to all connected bots")
    
    # Проверяем, что parent_id существует и принадлежит тому же пользователю, если указан
    if category.parent_id is not None:
        parent_category = db.query(models.Category).filter(
            models.Category.id == category.parent_id,
            models.Category.user_id == user_id,
            models.Category.bot_id == final_bot_id
        ).first()
        if not parent_category:
            raise HTTPException(status_code=404, detail="Parent category not found")
        if parent_category.parent_id is not None:
            raise HTTPException(status_code=400, detail="Cannot create subcategory of a subcategory (only 2 levels allowed)")
    
    db_category = models.Category(
        name=category.name, 
        user_id=user_id,
        bot_id=final_bot_id,  # Если bot_id указан - создаем для независимого магазина бота
        parent_id=category.parent_id  # ID родительской категории (None для основных категорий)
    )
    db.add(db_category)
    db.flush()  # Получаем ID категории, но не коммитим
    
    # Синхронизируем категорию во все боты
    sync_category_to_all_bots(db_category, db, action="create")
    
    db.commit()
    db.refresh(db_category)
    print(f"✅ Created category '{category.name}' for user {user_id}, bot_id={final_bot_id}")
    return db_category

@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """
    Удаление категории.
    
    Поведение:
    - Товары (Product) удаляются каскадно вместе с категорией
    - Исторические продажи (SoldProduct) сохраняются, но category_id устанавливается в NULL
    - Подкатегории (subcategories) удаляются каскадно вместе с родительской категорией
    - Синхронизация удаления происходит во все подключенные боты
    """
    db_category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == user_id
    ).first()
    
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Проверяем, есть ли товары в категории
    products_count = db.query(models.Product).filter(
        models.Product.category_id == category_id
    ).count()
    
    # Проверяем, есть ли подкатегории
    subcategories_count = db.query(models.Category).filter(
        models.Category.parent_id == category_id
    ).count()
    
    # Проверяем, есть ли исторические продажи
    sold_products_count = db.query(models.SoldProduct).filter(
        models.SoldProduct.category_id == category_id
    ).count()
    
    # Явно устанавливаем category_id = NULL для исторических продаж
    # (SQLite может не поддерживать ondelete="SET NULL" автоматически)
    if sold_products_count > 0:
        db.query(models.SoldProduct).filter(
            models.SoldProduct.category_id == category_id
        ).update({models.SoldProduct.category_id: None})
        print(f"📦 Set category_id=NULL for {sold_products_count} historical sold_products")
    
    # Синхронизируем удаление категории во все боты (ПЕРЕД удалением)
    sync_category_to_all_bots(db_category, db, action="delete")
    
    # Удаляем категорию
    # Товары удалятся автоматически из-за cascade="all, delete-orphan" в relationship
    # Подкатегории также удалятся каскадно
    db.delete(db_category)
    db.commit()
    
    message_parts = [f"Category '{db_category.name}' deleted."]
    if products_count > 0:
        message_parts.append(f"{products_count} products deleted.")
    if subcategories_count > 0:
        message_parts.append(f"{subcategories_count} subcategories deleted.")
    if sold_products_count > 0:
        message_parts.append(f"{sold_products_count} historical sales preserved (category_id set to NULL).")
    
    return {"message": " ".join(message_parts)}
