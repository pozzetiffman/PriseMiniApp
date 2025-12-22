import shutil
import os
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..db import models, database
from ..models import product as schemas

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
    query = db.query(models.Product).filter(models.Product.user_id == user_id)
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
        
        # Получаем активную резервацию
        reservation = db.query(models.Reservation).filter(
            and_(
                models.Reservation.product_id == prod.id,
                models.Reservation.is_active == True,
                models.Reservation.reserved_until > datetime.utcnow()
            )
        ).first()
        
        reservation_info = None
        if reservation:
            # Возвращаем время в UTC с указанием часового пояса (Z)
            reserved_until_str = reservation.reserved_until.isoformat()
            if not reserved_until_str.endswith('Z') and '+' not in reserved_until_str:
                reserved_until_str += 'Z'
            reservation_info = {
                "reserved_until": reserved_until_str,
                "reserved_by_user_id": reservation.reserved_by_user_id,
                "id": reservation.id
            }
            print(f"DEBUG: Product {prod.id} '{prod.name}' has active reservation until {reservation.reserved_until}, reserved_by={reservation.reserved_by_user_id}")
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
        "is_hot_offer": getattr(db_product, 'is_hot_offer', False)
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

@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == user_id
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
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
