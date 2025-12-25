import shutil
import os
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Header, Request, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional, Any
from ..db import models, database
from ..models import product as schemas
from ..utils.telegram_auth import get_user_id_from_init_data, validate_init_data_multi_bot

router = APIRouter(prefix="/api/products", tags=["products"])

# Получаем публичный URL из переменной окружения или используем ngrok по умолчанию
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev")

# Telegram Bot Token для отправки уведомлений (основной бот)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

def get_bot_token_for_notifications(shop_owner_id: int, db: Session) -> str:
    """
    Получает токен бота для отправки уведомлений.
    Если у владельца магазина есть подключенный бот, использует его токен.
    Иначе использует токен основного бота.
    
    Args:
        shop_owner_id: ID владельца магазина
        db: Сессия базы данных
        
    Returns:
        Токен бота для отправки уведомлений
    """
    # Ищем подключенного бота для этого владельца магазина
    connected_bot = db.query(models.Bot).filter(
        models.Bot.owner_user_id == shop_owner_id,
        models.Bot.is_active == True
    ).first()
    
    if connected_bot and connected_bot.bot_token:
        print(f"✅ Using connected bot token for user {shop_owner_id} (bot_id={connected_bot.id})")
        return connected_bot.bot_token
    
    # Если подключенного бота нет, используем основной токен
    print(f"ℹ️ No connected bot found for user {shop_owner_id}, using main bot token")
    return TELEGRAM_BOT_TOKEN

def make_full_url(path: str) -> str:
    """
    Преобразует относительный путь в полный HTTPS URL.
    Использует /api/images/ вместо /static/uploads/ для обхода блокировки Telegram WebView.
    """
    if not path:
        return ""
    
    # Если уже полный URL, проверяем, содержит ли он /static/uploads/
    if path.startswith('http://') or path.startswith('https://'):
        # Если это полный URL с /static/uploads/, заменяем на /api/images/
        if '/static/uploads/' in path:
            filename = path.split('/static/uploads/')[-1]
            return f"{API_PUBLIC_URL}/api/images/{filename}"
        return path
    
    # Если относительный путь начинается с /static/uploads/, заменяем на /api/images/
    if path.startswith('/static/uploads/'):
        filename = path.replace('/static/uploads/', '')
        return f"{API_PUBLIC_URL}/api/images/{filename}"
    
    # Если путь не начинается с /, добавляем его
    if not path.startswith('/'):
        return API_PUBLIC_URL + '/' + path
    
    return API_PUBLIC_URL + path

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
                    
                    matching.description = db_product.description
                    matching.price = db_product.price  # Обновляем цену при синхронизации
                    matching.image_url = db_product.image_url
                    matching.images_urls = db_product.images_urls
                    matching.discount = db_product.discount
                    matching.is_hot_offer = db_product.is_hot_offer
                    matching.quantity = db_product.quantity
                    matching.is_sold = db_product.is_sold
                    matching.is_made_to_order = db_product.is_made_to_order
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
                
                existing_main.description = db_product.description
                existing_main.price = db_product.price
                existing_main.image_url = db_product.image_url
                existing_main.images_urls = db_product.images_urls
                existing_main.discount = db_product.discount
                existing_main.is_hot_offer = db_product.is_hot_offer
                existing_main.quantity = db_product.quantity
                existing_main.is_sold = db_product.is_sold
                existing_main.is_made_to_order = db_product.is_made_to_order
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
                
                matching_main.description = db_product.description
                matching_main.price = db_product.price  # Обновляем цену при синхронизации
                matching_main.image_url = db_product.image_url
                matching_main.images_urls = db_product.images_urls
                matching_main.discount = db_product.discount
                matching_main.is_hot_offer = db_product.is_hot_offer
                matching_main.quantity = db_product.quantity
                matching_main.is_sold = db_product.is_sold
                matching_main.is_made_to_order = db_product.is_made_to_order
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
                    
                    matching.description = db_product.description
                    matching.price = db_product.price  # Обновляем цену при синхронизации
                    matching.image_url = db_product.image_url
                    matching.images_urls = db_product.images_urls
                    matching.discount = db_product.discount
                    matching.is_hot_offer = db_product.is_hot_offer
                    matching.quantity = db_product.quantity
                    matching.is_sold = db_product.is_sold
                    matching.is_made_to_order = db_product.is_made_to_order
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

@router.post("/sync-all")
async def sync_all_products(
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """
    Синхронизирует все существующие товары между основным ботом и подключенными ботами.
    Используется для синхронизации товаров, которые были созданы до добавления автоматической синхронизации.
    """
    # Проверяем авторизацию
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to sync products")
    
    # Находим все подключенные боты пользователя
    connected_bots = db.query(models.Bot).filter(
        models.Bot.owner_user_id == user_id,
        models.Bot.is_active == True
    ).all()
    
    synced_count = 0
    
    # 1. Синхронизируем товары из основного бота во все подключенные боты
    main_products = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.bot_id == None,
        models.Product.is_sold == False
    ).all()
    
    for main_product in main_products:
        # Устанавливаем sync_product_id для товаров в основном магазине
        if not main_product.sync_product_id:
            main_product.sync_product_id = main_product.id
            db.flush()
        
        sync_id = main_product.sync_product_id
        
        for bot in connected_bots:
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
                    sync_product_id=sync_id,  # Связываем с оригинальным товаром
                    is_hot_offer=main_product.is_hot_offer,
                    quantity=main_product.quantity,
                    is_sold=main_product.is_sold,
                    is_made_to_order=main_product.is_made_to_order,
                    category_id=category_id_for_bot
                )
                db.add(new_product)
                synced_count += 1
                print(f"🔄 Synced product '{main_product.name}' (id={main_product.id}, sync_id={sync_id}) to bot {bot.id}")
    
    # 2. Синхронизируем товары из подключенных ботов в основной бот
    for bot in connected_bots:
        bot_products = db.query(models.Product).filter(
            models.Product.user_id == user_id,
            models.Product.bot_id == bot.id,
            models.Product.is_sold == False
        ).all()
        
        for bot_product in bot_products:
            # Используем sync_product_id для поиска оригинального товара
            sync_id = bot_product.sync_product_id
            
            # Ищем оригинальный товар в основном боте по sync_product_id
            existing = None
            if sync_id:
                existing = db.query(models.Product).filter(
                    models.Product.user_id == user_id,
                    models.Product.bot_id == None,
                    models.Product.sync_product_id == sync_id
                ).first()
            
            # Fallback: если не нашли по sync_product_id, ищем по имени и цене
            if not existing:
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
                    sync_product_id=None,  # Будет установлен после получения ID
                    is_hot_offer=bot_product.is_hot_offer,
                    quantity=bot_product.quantity,
                    is_sold=bot_product.is_sold,
                    is_made_to_order=bot_product.is_made_to_order,
                    category_id=category_id_for_main
                )
                db.add(new_product)
                db.flush()  # Получаем ID нового товара
                # Устанавливаем sync_product_id = id (сам на себя)
                new_product.sync_product_id = new_product.id
                # Обновляем sync_product_id у товара в боте
                if not bot_product.sync_product_id:
                    bot_product.sync_product_id = new_product.id
                synced_count += 1
                print(f"🔄 Synced product '{bot_product.name}' (id={new_product.id}, sync_id={new_product.id}) to main bot")
    
    # 3. Очистка дубликатов: удаляем товары в ботах, которых нет в основном магазине
    deleted_count = 0
    for bot in connected_bots:
        bot_products = db.query(models.Product).filter(
            models.Product.user_id == user_id,
            models.Product.bot_id == bot.id,
            models.Product.is_sold == False
        ).all()
        
        # Получаем все sync_product_id из основного магазина
        main_sync_ids = set()
        for main_product in main_products:
            if main_product.sync_product_id:
                main_sync_ids.add(main_product.sync_product_id)
            else:
                main_sync_ids.add(main_product.id)
        
        for bot_product in bot_products:
            # Если у товара в боте есть sync_product_id, проверяем, существует ли соответствующий товар в основном магазине
            if bot_product.sync_product_id:
                if bot_product.sync_product_id not in main_sync_ids:
                    # Товар в боте ссылается на несуществующий товар в основном магазине - удаляем
                    print(f"🗑️ Deleting orphaned product '{bot_product.name}' (id={bot_product.id}, sync_id={bot_product.sync_product_id}) from bot {bot.id}")
                    db.delete(bot_product)
                    deleted_count += 1
            else:
                # Если у товара в боте нет sync_product_id, проверяем, есть ли он в основном магазине по имени и цене
                found_in_main = False
                for main_product in main_products:
                    if main_product.name == bot_product.name and main_product.price == bot_product.price:
                        # Нашли соответствующий товар - устанавливаем sync_product_id
                        sync_id = main_product.sync_product_id or main_product.id
                        bot_product.sync_product_id = sync_id
                        found_in_main = True
                        print(f"🔗 Linked product '{bot_product.name}' (id={bot_product.id}) to main product (sync_id={sync_id})")
                        break
                
                if not found_in_main:
                    # Товар в боте не найден в основном магазине - удаляем (или создаем в основном магазине)
                    # Создаем товар в основном магазине, если его там нет
                    print(f"🔄 Creating missing product '{bot_product.name}' in main shop from bot {bot.id}")
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
                        category_id=category_id_for_main
                    )
                    db.add(new_main_product)
                    db.flush()
                    new_main_product.sync_product_id = new_main_product.id
                    bot_product.sync_product_id = new_main_product.id
                    synced_count += 1
                    print(f"🔄 Created product '{bot_product.name}' (id={new_main_product.id}, sync_id={new_main_product.id}) in main shop")
    
    db.commit()
    
    return {
        "message": f"Синхронизировано {synced_count} товаров, удалено {deleted_count} дубликатов",
        "synced_count": synced_count,
        "deleted_count": deleted_count
    }

@router.get("/sold")
async def get_sold_products(
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получает список проданных товаров (история продаж)"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что авторизованный пользователь запрашивает свои продажи
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to view these sold products")
    
    # Получаем проданные товары, отсортированные по дате продажи (новые сначала)
    sold_products = db.query(models.SoldProduct).filter(
        models.SoldProduct.user_id == user_id
    ).order_by(models.SoldProduct.sold_at.desc()).all()
    
    result = []
    for sold in sold_products:
        # Преобразуем images_urls из JSON строки в список
        images_list = []
        if sold.images_urls:
            try:
                images_list = json.loads(sold.images_urls)
            except:
                images_list = []
        
        # Для обратной совместимости: если есть image_url, но нет images_urls, добавляем его
        if not images_list and sold.image_url:
            images_list = [sold.image_url]
        
        # Преобразуем относительные пути в полные HTTPS URL
        images_list = [make_full_url(img_url) for img_url in images_list if img_url]
        image_url_full = make_full_url(sold.image_url) if sold.image_url else None
        
        result.append({
            "id": sold.id,
            "product_id": sold.product_id,
            "name": sold.name,
            "description": sold.description,
            "price": sold.price,
            "discount": sold.discount,
            "image_url": image_url_full,
            "images_urls": images_list,
            "category_id": sold.category_id,
            "quantity": sold.quantity or 1,  # Количество проданного товара
            "sold_at": sold.sold_at.isoformat() if sold.sold_at else None
        })
    
    return result

@router.delete("/sold/{sold_id}")
async def delete_sold_product(
    sold_id: int,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить запись о проданном товаре"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что авторизованный пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this sold product")
    
    # Находим запись о проданном товаре
    sold_product = db.query(models.SoldProduct).filter(
        models.SoldProduct.id == sold_id,
        models.SoldProduct.user_id == user_id
    ).first()
    
    if not sold_product:
        raise HTTPException(status_code=404, detail="Sold product not found")
    
    # Удаляем запись
    db.delete(sold_product)
    db.commit()
    
    return {"message": "Запись о проданном товаре удалена", "id": sold_id}

@router.post("/sold/batch-delete")
async def delete_sold_products(
    sold_ids: List[int],
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Удалить несколько записей о проданных товарах"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    try:
        authenticated_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=bot_token if bot_token else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что авторизованный пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete these sold products")
    
    # Проверяем, что список ID не пустой
    if not sold_ids or len(sold_ids) == 0:
        raise HTTPException(status_code=400, detail="No sold product IDs provided")
    
    id_list = sold_ids
    
    # Находим все записи о проданных товарах
    sold_products = db.query(models.SoldProduct).filter(
        models.SoldProduct.id.in_(id_list),
        models.SoldProduct.user_id == user_id
    ).all()
    
    if not sold_products:
        raise HTTPException(status_code=404, detail="No sold products found")
    
    # Удаляем записи
    deleted_count = len(sold_products)
    for sold_product in sold_products:
        db.delete(sold_product)
    
    db.commit()
    
    return {
        "message": f"Удалено записей: {deleted_count}",
        "deleted_count": deleted_count,
        "deleted_ids": [sp.id for sp in sold_products]
    }

@router.get("/{product_id}", response_model=schemas.Product)
def get_product_by_id(
    product_id: int,
    db: Session = Depends(database.get_db)
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
        "has_active_reservation": active_reservation is not None
    }

@router.get("/", response_model=List[schemas.Product])
def get_products(
    user_id: int,
    category_id: Optional[int] = None,
    bot_id: Optional[int] = Query(None, description="ID бота для независимых магазинов"),
    db: Session = Depends(database.get_db)
):
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
                        category_id=category_id_for_bot
                    )
                    db.add(new_bot_product)
                    db.commit()
                    print(f"✅ Auto-synced product '{main_product.name}' (id={new_bot_product.id}) to bot {bot.id}")
    
    query = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.is_sold == False  # Не показываем проданные товары на витрине
    )
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
            "reservation": reservation_data
        })
    
    return result

@router.post("/", response_model=schemas.Product)
async def create_product(
    name: str = Form(...),
    price: float = Form(...),
    category_id: int = Form(...),
    user_id: int = Form(...),
    description: Optional[str] = Form(None),
    discount: float = Form(0.0),
    is_hot_offer: bool = Form(False),
    quantity: int = Form(0),
    bot_id: Optional[int] = Form(None, description="ID бота для независимых магазинов"),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    images: List[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    images_urls = []
    image_url = None  # Для обратной совместимости (первое фото)
    
    print(f"DEBUG: create_product called - images type: {type(images)}, images value: {images}")
    
    if images and len(images) > 0:
        # Ограничиваем до 5 фото
        images = images[:5]
        print(f"DEBUG: Received {len(images)} image files")
        
        upload_dir = "static/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        for idx, image in enumerate(images):
            if not image or not image.filename:
                print(f"DEBUG: Skipping image {idx+1} - no filename")
                continue
                
            print(f"DEBUG: Processing image {idx+1}: filename={image.filename}, content_type={image.content_type}")
            
            # Генерируем уникальное имя файла
            file_ext = os.path.splitext(image.filename)[1] if image.filename else '.jpg'
            unique_filename = f"{uuid.uuid4()}{file_ext}"
            
            file_path = os.path.join(upload_dir, unique_filename)
            
            # Сохраняем файл
            try:
                # Читаем содержимое файла
                contents = await image.read()
                
                with open(file_path, "wb") as buffer:
                    buffer.write(contents)
                print(f"DEBUG: Image {idx+1} saved successfully: {file_path}, size: {len(contents)} bytes")
            except Exception as e:
                print(f"ERROR: Failed to save image {idx+1}: {e}")
                import traceback
                traceback.print_exc()
                continue
            
            image_url_path = f"/static/uploads/{unique_filename}"
            images_urls.append(image_url_path)
            
            # Первое фото сохраняем в image_url для обратной совместимости
            if idx == 0:
                image_url = image_url_path
            
            print(f"DEBUG: Image {idx+1} saved: {image_url_path}")
    else:
        print("DEBUG: No images received or empty list")
    
    # Сохраняем массив URL в JSON строку
    images_urls_json = json.dumps(images_urls) if images_urls else None

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
                print(f"✅ Determined bot_id={final_bot_id} from initData for product creation")
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
                print(f"✅ Determined bot_id={final_bot_id} from user's connected bot for product creation")
            else:
                final_bot_id = None  # Основной бот
                print(f"ℹ️ No connected bot found for user {user_id}, using main bot (bot_id=None)")

    db_product = models.Product(
        name=name,
        price=price,
        category_id=category_id,
        user_id=user_id,
        bot_id=final_bot_id,  # Если bot_id указан - создаем для независимого магазина бота
        description=description,
        discount=discount,
        is_hot_offer=is_hot_offer,
        quantity=quantity,
        image_url=image_url,
        images_urls=images_urls_json,
        sync_product_id=None  # Будет установлен после получения ID
    )
    db.add(db_product)
    db.flush()  # Получаем ID товара, но не коммитим
    
    # Устанавливаем sync_product_id:
    # - Для товара в основном магазине (bot_id=None) - sync_product_id = id (сам на себя)
    # - Для товара в магазине бота - sync_product_id будет установлен при синхронизации
    if final_bot_id is None:
        db_product.sync_product_id = db_product.id
        db.flush()  # Сохраняем sync_product_id перед синхронизацией
    else:
        # Для товара в магазине бота - sync_product_id будет установлен при синхронизации
        # если будет найден оригинальный товар в основном магазине
        pass
    
    # Синхронизируем товар во все боты
    sync_product_to_all_bots(db_product, db, action="create")
    
    db.commit()
    db.refresh(db_product)
    
    print(f"DEBUG: Product created in DB: id={db_product.id}, name={db_product.name}, images_count={len(images_urls)}")
    
    # Преобразуем относительные пути в полные HTTPS URL
    images_urls_full = [make_full_url(img_url) for img_url in images_urls]
    image_url_full = make_full_url(db_product.image_url) if db_product.image_url else None
    
    # Возвращаем продукт с images_urls как список полных HTTPS URL
    return {
        "id": db_product.id,
        "name": db_product.name,
        "description": db_product.description,
        "price": db_product.price,
        "image_url": image_url_full,
        "images_urls": images_urls_full,
        "discount": db_product.discount,
        "category_id": db_product.category_id,
        "user_id": db_product.user_id,
        "is_hot_offer": getattr(db_product, 'is_hot_offer', False),
        "quantity": getattr(db_product, 'quantity', 0)
    }

@router.put("/{product_id}", response_model=schemas.Product)
def update_product(
    product_id: int,
    product: schemas.ProductCreate,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
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

@router.patch("/{product_id}/hot-offer")
def toggle_hot_offer(
    product_id: int,
    hot_offer_update: schemas.HotOfferUpdate,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """Переключение статуса 'горящее предложение' для товара"""
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

@router.patch("/{product_id}/update-price-discount")
def update_price_discount(
    product_id: int,
    price_discount_update: schemas.PriceDiscountUpdate,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """Обновление цены и скидки товара с отправкой уведомлений пользователям"""
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Сохраняем старые значения для сравнения
    old_price = db_product.price
    old_discount = db_product.discount
    
    # Обновляем значения
    db_product.price = price_discount_update.price
    db_product.discount = price_discount_update.discount
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    # Определяем, что изменилось
    price_changed = old_price != price_discount_update.price
    discount_changed = old_discount != price_discount_update.discount
    
    # Отправляем уведомления пользователям, которые посещали магазин
    if price_changed or discount_changed:
        try:
            # Получаем всех пользователей для уведомлений:
            # 1. Те, кто делал резервации в этом магазине
            # 2. Те, кто просматривал конкретный товар (модальное окно)
            # 3. Те, кто посещал магазин в целом (просмотр списка товаров)
            from sqlalchemy import distinct, or_
            
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
            import requests
            
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
            
            final_price = price_discount_update.price * (1 - price_discount_update.discount / 100)
            
            message = f"🔔 **Обновление в {shop_name}**\n\n"
            message += f"📦 Товар: {db_product.name}\n\n"
            
            if price_changed:
                message += f"💰 **Новая цена:** {price_discount_update.price} ₽"
                if old_price:
                    message += f" (было: {old_price} ₽)"
                message += "\n"
            
            if discount_changed:
                message += f"🎯 **Скидка:** {price_discount_update.discount}%"
                if old_discount:
                    message += f" (было: {old_discount}%)"
                message += "\n"
            
            if price_discount_update.discount > 0:
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

@router.patch("/{product_id}/update-name-description")
def update_name_description(
    product_id: int,
    name_description_update: schemas.NameDescriptionUpdate,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """Обновление названия и описания товара (без уведомлений)"""
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
    
    # Обновляем значения
    db_product.name = name_description_update.name
    db_product.description = name_description_update.description
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

@router.patch("/{product_id}/update-quantity")
def update_quantity(
    product_id: int,
    quantity_update: schemas.QuantityUpdate,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """Обновление количества товара (без уведомлений)"""
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем количество
    db_product.quantity = quantity_update.quantity
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

@router.patch("/{product_id}/update-made-to-order")
def update_made_to_order(
    product_id: int,
    made_to_order_update: schemas.MadeToOrderUpdate,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """Обновление статуса 'под заказ' для товара (без уведомлений)"""
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Обновляем статус 'под заказ'
    db_product.is_made_to_order = bool(made_to_order_update.is_made_to_order)
    db.flush()
    
    # Синхронизируем обновление товара во все боты
    sync_product_to_all_bots(db_product, db, action="update")
    
    db.commit()
    db.refresh(db_product)
    
    # Отладочный вывод
    print(f"DEBUG: update_made_to_order - product_id={product_id}, user_id={user_id}, is_made_to_order={made_to_order_update.is_made_to_order}, saved={db_product.is_made_to_order}")
    
    return {
        "id": db_product.id,
        "is_made_to_order": bool(db_product.is_made_to_order),  # Явное преобразование в bool
        "message": "Статус 'под заказ' обновлен"
    }

@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    # Проверяем, что товар существует и принадлежит пользователю
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Если есть initData - проверяем авторизацию через него (запрос от WebApp)
    if x_telegram_init_data:
        import os
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
    
@router.post("/{product_id}/mark-sold")
async def mark_product_sold(
    product_id: int,
    user_id: int = Query(...),
    quantity: int = Query(1, ge=1),  # Количество для продажи (по умолчанию 1)
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Помечает товар как проданный: уменьшает quantity и добавляет в историю продаж"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
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
