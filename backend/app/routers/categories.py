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
                    new_category = models.Category(
                        name=db_category.name,
                        user_id=user_id,
                        bot_id=bot.id
                    )
                    db.add(new_category)
                    print(f"🔄 Synced category '{db_category.name}' to bot {bot.id} (CREATE)")
            
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
                new_category = models.Category(
                    name=db_category.name,
                    user_id=user_id,
                    bot_id=None
                )
                db.add(new_category)
                print(f"🔄 Synced category '{db_category.name}' to main bot (CREATE)")
            
            # 2. Синхронизируем во все другие подключенные боты (кроме текущего)
            for bot in connected_bots:
                if bot.id == db_category.bot_id:
                    continue  # Пропускаем текущий бот
                
                existing = db.query(models.Category).filter(
                    models.Category.user_id == user_id,
                    models.Category.bot_id == bot.id,
                    models.Category.name == db_category.name
                ).first()
                
                if not existing:
                    new_category = models.Category(
                        name=db_category.name,
                        user_id=user_id,
                        bot_id=bot.id
                    )
                    db.add(new_category)
                    print(f"🔄 Synced category '{db_category.name}' to bot {bot.id} (CREATE)")
        
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
    db: Session = Depends(database.get_db)
):
    print(f"DEBUG: get_categories called with user_id={user_id}, bot_id={bot_id}, type={type(user_id)}")
    query = db.query(models.Category).filter(models.Category.user_id == user_id)
    # Если bot_id указан - фильтруем по bot_id (независимый магазин бота)
    # Если bot_id не указан - фильтруем по bot_id = None (основной бот)
    if bot_id is not None:
        query = query.filter(models.Category.bot_id == bot_id)
    else:
        query = query.filter(models.Category.bot_id == None)
    
    categories = query.all()
    print(f"DEBUG: Found {len(categories)} categories")
    return categories

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
            # Запрос от бота (localhost) - определяем bot_id по user_id
            # Если у пользователя есть подключенный бот, используем его bot_id
            user_bot = db.query(models.Bot).filter(
                models.Bot.owner_user_id == user_id,
                models.Bot.is_active == True
            ).first()
            if user_bot:
                final_bot_id = user_bot.id
                print(f"✅ Determined bot_id={final_bot_id} from user's connected bot for category creation")
            else:
                final_bot_id = None  # Основной бот
                print(f"ℹ️ No connected bot found for user {user_id}, using main bot (bot_id=None)")
    
    db_category = models.Category(
        name=category.name, 
        user_id=user_id,
        bot_id=final_bot_id  # Если bot_id указан - создаем для независимого магазина бота
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
    """Удаление категории. При удалении категории также удаляются все товары в этой категории."""
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
    
    # Синхронизируем удаление категории во все боты
    sync_category_to_all_bots(db_category, db, action="delete")
    
    # Удаляем категорию (товары удалятся автоматически из-за cascade)
    db.delete(db_category)
    db.commit()
    
    return {
        "message": f"Category deleted. {products_count} products were also deleted." if products_count > 0 else "Category deleted."
    }
