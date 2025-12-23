import shutil
import os
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from ..db import models, database
from ..models import product as schemas
from ..utils.telegram_auth import get_user_id_from_init_data

router = APIRouter(prefix="/api/products", tags=["products"])

# Получаем публичный URL из переменной окружения или используем ngrok по умолчанию
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev")

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
            # Убираем query параметры если есть
            filename = filename.split('?')[0]
            return API_PUBLIC_URL + f'/api/images/{filename}'
        return path
    
    if path.startswith('/'):
        # Если это путь к изображению в static/uploads, используем API endpoint
        if path.startswith('/static/uploads/'):
            filename = path.replace('/static/uploads/', '')
            # Убираем query параметры если есть
            filename = filename.split('?')[0]
            return API_PUBLIC_URL + f'/api/images/{filename}'
        return API_PUBLIC_URL + path
    
    return API_PUBLIC_URL + '/' + path

@router.get("/", response_model=List[schemas.Product])
def get_products(
    user_id: int,
    category_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
    print(f"DEBUG: get_products called with user_id={user_id}, category_id={category_id}")
    query = db.query(models.Product).filter(
        models.Product.user_id == user_id,
        models.Product.is_sold == False  # Не показываем проданные товары на витрине
    )
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
        from datetime import datetime
        from sqlalchemy import and_
        
        # Сначала деактивируем истекшие резервации
        expired = db.query(models.Reservation).filter(
            and_(
                models.Reservation.product_id == prod.id,
                models.Reservation.is_active == True,
                models.Reservation.reserved_until <= datetime.utcnow()
            )
        ).all()
        for exp in expired:
            exp.is_active = False
        
        if expired:
            db.commit()
        
        # Получаем все активные резервации для подсчета
        active_reservations = db.query(models.Reservation).filter(
            and_(
                models.Reservation.product_id == prod.id,
                models.Reservation.is_active == True,
                models.Reservation.reserved_until > datetime.utcnow()
            )
        ).all()
        
        active_reservations_count = len(active_reservations)
        
        # Получаем первую резервацию для отображения информации (если есть)
        reservation = active_reservations[0] if active_reservations else None
        
        reservation_info = None
        if reservation:
            # Возвращаем время в UTC с указанием часового пояса (Z)
            reserved_until_str = reservation.reserved_until.isoformat()
            if not reserved_until_str.endswith('Z') and '+' not in reserved_until_str:
                reserved_until_str += 'Z'
            reservation_info = {
                "reserved_until": reserved_until_str,
                "reserved_by_user_id": reservation.reserved_by_user_id,
                "id": reservation.id,
                "active_count": active_reservations_count  # Количество активных резерваций
            }
            print(f"DEBUG: Product {prod.id} '{prod.name}' has {active_reservations_count} active reservation(s), first until {reservation.reserved_until}, reserved_by={reservation.reserved_by_user_id}")
        else:
            print(f"DEBUG: Product {prod.id} '{prod.name}' has no active reservation")
        
        # Создаем объект продукта с images_urls как список (теперь с полными HTTPS URL)
        prod_dict = {
            "id": prod.id,
            "name": prod.name,
            "description": prod.description,
            "price": prod.price,
            "image_url": image_url_full,  # Полный HTTPS URL для обратной совместимости
            "images_urls": images_list,  # Массив полных HTTPS URL
            "discount": prod.discount,
            "category_id": prod.category_id,
            "user_id": prod.user_id,
            "is_hot_offer": getattr(prod, 'is_hot_offer', False),  # Горящее предложение
            "quantity": getattr(prod, 'quantity', 0),  # Количество товара на складе
            "reservation": reservation_info
        }
        result.append(prod_dict)
        
        print(f"DEBUG: Product {prod.id} '{prod.name}' - images_urls: {len(images_list)} images")
        if images_list:
            print(f"DEBUG: Product {prod.id} first image URL: {images_list[0]}")
            # Проверяем, что URL использует /api/images/ вместо /static/uploads/
            if '/static/uploads/' in images_list[0]:
                print(f"WARNING: Product {prod.id} image URL still contains /static/uploads/ - should use /api/images/")
            elif '/api/images/' in images_list[0]:
                print(f"OK: Product {prod.id} image URL correctly uses /api/images/")
    
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

    db_product = models.Product(
        name=name,
        price=price,
        category_id=category_id,
        user_id=user_id,
        description=description,
        discount=discount,
        is_hot_offer=is_hot_offer,
        quantity=quantity,
        image_url=image_url,
        images_urls=images_urls_json
    )
    db.add(db_product)
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
            import requests
            import os
            
            bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
            if not bot_token:
                print("❌ Notification: TELEGRAM_BOT_TOKEN not set")
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
    
    # Обновляем значения
    db_product.name = name_description_update.name
    db_product.description = name_description_update.description
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
    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "quantity": db_product.quantity,
        "message": "Количество товара обновлено"
    }

@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        authenticated_user_id = get_user_id_from_init_data(x_telegram_init_data, bot_token)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что пользователь является владельцем товара
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Проверяем, что авторизованный пользователь является владельцем
    if authenticated_user_id != user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this product")
    
    # Удаляем файлы изображений с диска
    images_to_delete = []
    
    # Получаем список изображений из images_urls
    if db_product.images_urls:
        try:
            images_to_delete = json.loads(db_product.images_urls)
        except:
            pass
    
    # Добавляем image_url если он есть и его нет в списке
    if db_product.image_url and db_product.image_url not in images_to_delete:
        images_to_delete.append(db_product.image_url)
    
    # Удаляем файлы
    for img_url in images_to_delete:
        if img_url and img_url.startswith('/static/'):
            file_path = img_url[1:]  # Убираем первый /
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"DEBUG: Deleted image file: {file_path}")
                except Exception as e:
                    print(f"ERROR: Failed to delete image file {file_path}: {e}")
    
    db.delete(db_product)
    db.commit()
    return {"message": "Product deleted"}
    
@router.post("/{product_id}/mark-sold")
def mark_product_sold(
    product_id: int,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Помечает товар как проданный: скрывает с витрины и добавляет в историю продаж"""
    # Проверяем авторизацию через initData
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    import os
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        authenticated_user_id = get_user_id_from_init_data(x_telegram_init_data, bot_token)
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
    
    # Проверяем, что товар еще не продан
    if db_product.is_sold:
        raise HTTPException(status_code=400, detail="Product is already marked as sold")
    
    # Помечаем товар как проданный
    db_product.is_sold = True
    
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
        sold_at=datetime.utcnow()
    )
    db.add(sold_product)
    db.commit()
    db.refresh(sold_product)
    
    return {
        "message": "Product marked as sold",
        "product_id": product_id,
        "sold_product_id": sold_product.id
    }

@router.get("/sold", response_model=List[dict])
def get_sold_products(
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
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token is not configured")
    
    try:
        authenticated_user_id = get_user_id_from_init_data(x_telegram_init_data, bot_token)
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
            "sold_at": sold.sold_at.isoformat() if sold.sold_at else None
        })
    
    return result
