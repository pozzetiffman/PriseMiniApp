"""
Обработчики для создания товаров
"""
import os
import uuid
import json
from typing import List, Optional
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from ..db import models, database
from ..utils.products_utils import str_to_bool, make_full_url, normalize_category_id
from ..utils.products_sync import sync_product_to_all_bots
from ..utils.telegram_auth import validate_init_data_multi_bot


async def create_product(
    name: str,
    price: Optional[float],  # Опционально - используется только как fallback для старых товаров
    category_id: int,
    user_id: int,
    description: Optional[str],
    discount: float,
    is_hot_offer: str,
    quantity: int,
    is_made_to_order: str,
    is_for_sale: str,
    price_from: Optional[float],
    price_to: Optional[float],
    price_fixed: Optional[float],
    price_type: str,
    quantity_from: Optional[int],
    quantity_unit: Optional[str],
    quantity_show_enabled: Optional[str],
    bot_id: Optional[int],
    x_telegram_init_data: Optional[str],
    images: List[UploadFile],
    db: Session,
    is_sale_enabled: Optional[str] = None,
    is_client_sale: Optional[str] = None,
    seller_id: Optional[int] = None,
    price_card: Optional[float] = None,  # Базовая цена (обязательна для новых товаров с is_sale_enabled или is_made_to_order)
    price_cash: Optional[float] = None,
    price_old: Optional[float] = None,
    characteristics: Optional[str] = None,  # JSON: [{"name":"Размер","value":"XL"},...]
    delivery_time: Optional[str] = None,
    delivery_price: Optional[float] = None,
):
    """
    Создание нового товара
    
    Args:
        name: Название товара
        price: Цена товара
        category_id: ID категории
        user_id: ID пользователя (владельца магазина)
        description: Описание товара (опционально)
        discount: Скидка (по умолчанию 0.0)
        is_hot_offer: Горящее предложение (строка "true"/"false")
        quantity: Количество товара
        is_made_to_order: На заказ (строка "true"/"false")
        is_for_sale: На продажу (строка "true"/"false")
        price_from: Цена от (опционально)
        price_to: Цена до (опционально)
        price_fixed: Фиксированная цена (опционально)
        price_type: Тип цены (по умолчанию 'range')
        quantity_from: Количество от (опционально)
        quantity_unit: Единица измерения количества (опционально)
        quantity_show_enabled: Показывать количество (строка "true"/"false"/None)
        bot_id: ID бота для независимых магазинов (опционально)
        x_telegram_init_data: Telegram init data для авторизации (опционально)
        images: Список изображений товара
        db: Сессия базы данных
        
    Returns:
        Словарь с данными созданного товара
    """
    # Конвертируем строки в boolean
    is_hot_offer_bool = str_to_bool(is_hot_offer)
    is_made_to_order_bool = str_to_bool(is_made_to_order)
    is_for_sale_bool = str_to_bool(is_for_sale)
    is_sale_enabled_bool = str_to_bool(is_sale_enabled) if is_sale_enabled else False
    is_client_sale_bool = str_to_bool(is_client_sale) if is_client_sale else False
    
    # Для C2C товаров: если is_client_sale=true, автоматически устанавливаем is_sale_enabled=true
    if is_client_sale_bool:
        is_sale_enabled_bool = True
        # Если seller_id не указан, пытаемся получить его из initData
        if seller_id is None and x_telegram_init_data:
            try:
                from ..routers.context import get_validated_user
                validated_user = await get_validated_user(x_telegram_init_data, db)
                seller_id = validated_user.id
                print(f"✅ Determined seller_id={seller_id} from initData for C2C product")
            except:
                print(f"⚠️ Could not determine seller_id from initData for C2C product")
    
    # Конвертируем quantity_show_enabled (может быть None, "true" или "false")
    quantity_show_enabled_bool = None
    if quantity_show_enabled is not None and quantity_show_enabled.strip():
        quantity_show_enabled_bool = str_to_bool(quantity_show_enabled)
    images_urls = []
    image_url = None  # Для обратной совместимости (первое фото)
    
    print(f"DEBUG: create_product called - images type: {type(images)}, images count: {len(images) if images else 0}")
    
    # Фильтруем пустые файлы (если FastAPI передал пустые объекты)
    if images:
        images = [img for img in images if img and img.filename]
    
    print(f"DEBUG: images is a list with {len(images)} items after filtering")
    for i, img in enumerate(images):
        if img:
            print(f"DEBUG: images[{i}]: filename={getattr(img, 'filename', 'unknown')}, content_type={getattr(img, 'content_type', 'unknown')}")
    
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

    # Нормализуем category_id для гарантии инварианта product.bot_id === category.bot_id
    normalized_category_id = normalize_category_id(category_id, final_bot_id, user_id, db)

    # ВАЛИДАЦИЯ И ЛОГИКА ЦЕН:
    # Новая модель: price_card - базовая цена (для новых товаров)
    # Старая модель: price - используется как fallback для старых товаров
    # 
    # Правила:
    # 1. Если указан price_card - используем его как price (для обратной совместимости со старым кодом)
    # 2. Если не указан price_card, но указан price - используем price (для старых товаров)
    # 3. Для товаров с is_sale_enabled или is_made_to_order (не is_for_sale) требуется хотя бы price_card или price
    # 4. Для товаров is_for_sale цена не требуется (используется price_from/price_to/price_fixed)
    
    final_price = None
    if price_card is not None:
        # Новая модель: используем price_card как price для обратной совместимости
        final_price = price_card
        print(f"✅ Using price_card={price_card} as price (new model)")
    elif price is not None:
        # Старая модель: используем price как есть
        final_price = price
        print(f"✅ Using price={price} (old model fallback)")
    
    # Валидация: для товаров с is_sale_enabled или is_made_to_order требуется цена
    if not is_for_sale_bool and (is_sale_enabled_bool or is_made_to_order_bool):
        if final_price is None:
            raise HTTPException(
                status_code=422,
                detail="Price is required for products with is_sale_enabled or is_made_to_order. Provide either price_card (new model) or price (old model)."
            )
    
    # Для товаров is_for_sale цена не требуется, но если указана - сохраняем
    # (может использоваться для обратной совместимости или как fallback)

    # ВАЖНО: Сохраняем price_card и price_cash напрямую, независимо от логики price
    # price используется только как fallback для обратной совместимости
    print(f"💾 [CREATE PRODUCT] Saving prices: price={final_price}, price_card={price_card}, price_cash={price_cash}, discount={discount}")

    db_product = models.Product(
        name=name,
        price=final_price,  # Используем финальное значение цены (для обратной совместимости)
        category_id=normalized_category_id,
        user_id=user_id,
        bot_id=final_bot_id,  # Если bot_id указан - создаем для независимого магазина бота
        description=description,
        discount=discount,
        is_hot_offer=is_hot_offer_bool,
        quantity=quantity,
        is_made_to_order=is_made_to_order_bool,
        is_for_sale=is_for_sale_bool,
        is_sale_enabled=is_sale_enabled_bool,
        is_client_sale=is_client_sale_bool,
        seller_id=seller_id,
        price_from=price_from,
        price_to=price_to,
        price_fixed=price_fixed,
        price_type=price_type,
        quantity_from=quantity_from,
        quantity_unit=quantity_unit,
        quantity_show_enabled=quantity_show_enabled_bool,
        price_card=price_card,  # Сохраняем price_card напрямую (новая модель)
        price_cash=price_cash,  # Сохраняем price_cash напрямую (новая модель)
        price_old=price_old,
        delivery_time=delivery_time,
        delivery_price=delivery_price,
        image_url=image_url,
        images_urls=images_urls_json,
        sync_product_id=None  # Будет установлен после получения ID
    )
    db.add(db_product)
    db.flush()  # Получаем ID товара, но не коммитим

    # Сохранение характеристик товара (ПОСЛЕ db.flush(), когда уже есть db_product.id)
    # Характеристики приходят как JSON: [{"name":"Размер","value":"XL"},...]
    if characteristics:
        try:
            chars_list = json.loads(characteristics) if isinstance(characteristics, str) else characteristics
            if isinstance(chars_list, list) and len(chars_list) > 0:
                seen_names = set()
                for idx, item in enumerate(chars_list):
                    if isinstance(item, dict):
                        name = (item.get("name") or "").strip()
                        value = (item.get("value") or "").strip()
                        if name and value:
                            # Вставляем в product_characteristics
                            pc = models.ProductCharacteristic(
                                product_id=db_product.id,
                                name=name,
                                value=value,
                                sort_order=idx
                            )
                            db.add(pc)
                            # Get-or-create в справочник названий (по user_id + bot_id)
                            if name not in seen_names:
                                seen_names.add(name)
                                existing_name = db.query(models.CharacteristicName).filter(
                                    models.CharacteristicName.user_id == user_id,
                                    models.CharacteristicName.name == name,
                                    models.CharacteristicName.bot_id == final_bot_id
                                ).first()
                                if not existing_name:
                                    cn = models.CharacteristicName(
                                        name=name,
                                        user_id=user_id,
                                        bot_id=final_bot_id
                                    )
                                    db.add(cn)
                db.flush()
                print(f"DEBUG: Saved {len(chars_list)} characteristics for product {db_product.id}")
        except (json.JSONDecodeError, TypeError) as e:
            print(f"WARN: Invalid characteristics JSON: {e}")

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
    print(f"💾 [CREATE PRODUCT] Saved in DB: price={db_product.price}, price_card={db_product.price_card}, price_cash={db_product.price_cash}, discount={db_product.discount}")
    
    # Преобразуем относительные пути в полные HTTPS URL
    images_urls_full = [make_full_url(img_url) for img_url in images_urls]
    image_url_full = make_full_url(db_product.image_url) if db_product.image_url else None
    
    # Возвращаем продукт с images_urls как список полных HTTPS URL
    # ВАЖНО: возвращаем все поля цен для поддержки новой модели
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
        "quantity": getattr(db_product, 'quantity', 0),
        "price_card": getattr(db_product, 'price_card', None),
        "price_cash": getattr(db_product, 'price_cash', None),
        "price_old": getattr(db_product, 'price_old', None),
        "is_sale_enabled": getattr(db_product, 'is_sale_enabled', False),
        "is_made_to_order": getattr(db_product, 'is_made_to_order', False),
        "is_for_sale": getattr(db_product, 'is_for_sale', False),
        "is_client_sale": getattr(db_product, 'is_client_sale', False),
        "delivery_time": getattr(db_product, 'delivery_time', None),
        "delivery_price": getattr(db_product, 'delivery_price', None),
    }


async def sync_all_products(
    user_id: int,
    x_telegram_init_data: Optional[str],
    db: Session
):
    """
    Синхронизирует все существующие товары между основным ботом и подключенными ботами.
    Используется для синхронизации товаров, которые были созданы до добавления автоматической синхронизации.
    """
    # Проверяем авторизацию
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
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
                    is_for_sale=main_product.is_for_sale,
                    price_from=main_product.price_from,
                    price_to=main_product.price_to,
                    quantity_from=main_product.quantity_from,
                    quantity_unit=main_product.quantity_unit,
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
                    is_for_sale=bot_product.is_for_sale,
                    price_from=bot_product.price_from,
                    price_to=bot_product.price_to,
                    quantity_from=bot_product.quantity_from,
                    quantity_unit=bot_product.quantity_unit,
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
                        is_for_sale=bot_product.is_for_sale,
                        price_from=bot_product.price_from,
                        price_to=bot_product.price_to,
                        price_fixed=bot_product.price_fixed,
                        price_type=bot_product.price_type,
                        quantity_from=bot_product.quantity_from,
                        quantity_unit=bot_product.quantity_unit,
                        quantity_show_enabled=bot_product.quantity_show_enabled,
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

