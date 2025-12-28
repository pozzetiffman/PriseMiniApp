import os
import json
import uuid
import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Body, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime
from dotenv import load_dotenv
from ..db import models, database
from ..models import purchase as schemas
from ..utils.telegram_auth import get_user_id_from_init_data, validate_init_data_multi_bot

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token для отправки уведомлений
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""
WEBAPP_URL = os.getenv("WEBAPP_URL", "")
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", os.getenv("WEBAPP_URL", "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev"))

print(f"DEBUG: Purchase router initialized - TELEGRAM_BOT_TOKEN={'SET' if TELEGRAM_BOT_TOKEN else 'NOT SET'}, WEBAPP_URL={WEBAPP_URL}, API_PUBLIC_URL={API_PUBLIC_URL}")

router = APIRouter(prefix="/api/purchases", tags=["purchases"])

def make_full_url(path: str) -> str:
    """Преобразует относительный путь в полный HTTPS URL"""
    if not path:
        return path
    
    # Если уже полный URL - возвращаем как есть
    if path.startswith('http://') or path.startswith('https://'):
        return path
    
    # Убираем ведущий слэш, если есть
    if path.startswith('/'):
        path = path[1:]
    
    # Формируем полный URL
    base_url = API_PUBLIC_URL.rstrip('/')
    return f"{base_url}/{path}" if base_url else path

def get_bot_token_for_notifications(shop_owner_id: int, db: Session) -> str:
    """
    Получает токен бота для отправки уведомлений.
    Если у владельца магазина есть подключенный бот, использует его токен.
    Иначе использует токен основного бота.
    """
    connected_bot = db.query(models.Bot).filter(
        models.Bot.owner_user_id == shop_owner_id,
        models.Bot.is_active == True
    ).first()
    
    if connected_bot and connected_bot.bot_token:
        print(f"✅ Using connected bot token for user {shop_owner_id} (bot_id={connected_bot.id})")
        return connected_bot.bot_token
    
    print(f"ℹ️ No connected bot found for user {shop_owner_id}, using main bot token")
    return TELEGRAM_BOT_TOKEN

@router.post("/", response_model=schemas.Purchase)
async def create_purchase(
    product_id: int = Form(...),
    first_name: Optional[str] = Form(None),
    last_name: Optional[str] = Form(None),
    middle_name: Optional[str] = Form(None),
    phone_number: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    payment_method: Optional[str] = Form(None),
    organization: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    images: List[UploadFile] = File(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Создать заявку на покупку товара"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        purchased_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что товар существует и имеет функцию покупки
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if not product.is_for_sale:
        raise HTTPException(status_code=400, detail="Product is not available for purchase")
    
    # Сохраняем изображения (до 5 шт)
    images_urls = []
    if images and len(images) > 0:
        images = images[:5]  # Ограничиваем до 5 фото
        upload_dir = "static/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        for image in images:
            if not image or not image.filename:
                continue
            
            file_ext = os.path.splitext(image.filename)[1] if image.filename else '.jpg'
            unique_filename = f"{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(upload_dir, unique_filename)
            
            try:
                contents = await image.read()
                with open(file_path, "wb") as buffer:
                    buffer.write(contents)
                image_url_path = f"/static/uploads/{unique_filename}"
                images_urls.append(image_url_path)
            except Exception as e:
                print(f"ERROR: Failed to save image: {e}")
                continue
    
    # Сохраняем видео (1 шт)
    video_url = None
    if video and video.filename:
        upload_dir = "static/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_ext = os.path.splitext(video.filename)[1] if video.filename else '.mp4'
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        try:
            contents = await video.read()
            with open(file_path, "wb") as buffer:
                buffer.write(contents)
            video_url = f"/static/uploads/{unique_filename}"
        except Exception as e:
            print(f"ERROR: Failed to save video: {e}")
    
    # Сохраняем массив URL в JSON строку
    images_urls_json = json.dumps(images_urls) if images_urls else None
    
    # Создаем заявку на покупку
    db_purchase = models.Purchase(
        product_id=product_id,
        user_id=product.user_id,
        purchased_by_user_id=purchased_by_user_id,
        first_name=first_name,
        last_name=last_name,
        middle_name=middle_name,
        phone_number=phone_number,
        city=city,
        address=address,
        notes=notes,
        payment_method=payment_method,
        organization=organization,
        images_urls=images_urls_json,
        video_url=video_url,
        status='pending'
    )
    
    db.add(db_purchase)
    db.commit()
    db.refresh(db_purchase)
    
    # Отправляем уведомление владельцу магазина
    try:
        bot_token = get_bot_token_for_notifications(product.user_id, db)
        if bot_token:
            message = f"🛒 Новая заявка на покупку товара!\n\n"
            message += f"Товар: {product.name}\n"
            if last_name or first_name or middle_name:
                name_parts = [part for part in [last_name, first_name, middle_name] if part]
                message += f"Покупатель: {' '.join(name_parts)}\n"
            if phone_number:
                message += f"Телефон: {phone_number}\n"
            if city:
                message += f"Город: {city}\n"
            
            requests.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": product.user_id,
                    "text": message,
                    "parse_mode": "HTML"
                },
                timeout=10
            )
    except Exception as e:
        print(f"ERROR: Failed to send notification: {e}")
    
    # Преобразуем images_urls в полные URL
    images_urls_list = json.loads(db_purchase.images_urls) if db_purchase.images_urls else None
    if images_urls_list:
        images_urls_list = [make_full_url(img_url) for img_url in images_urls_list]
    
    # Преобразуем video_url в полный URL
    video_url_full = make_full_url(db_purchase.video_url) if db_purchase.video_url else None
    
    # Преобразуем для ответа
    purchase_dict = {
        "id": db_purchase.id,
        "product_id": db_purchase.product_id,
        "user_id": db_purchase.user_id,
        "purchased_by_user_id": db_purchase.purchased_by_user_id,
        "created_at": db_purchase.created_at,
        "is_completed": db_purchase.is_completed,
        "is_cancelled": db_purchase.is_cancelled,
        "first_name": db_purchase.first_name,
        "last_name": db_purchase.last_name,
        "middle_name": db_purchase.middle_name,
        "phone_number": db_purchase.phone_number,
        "city": db_purchase.city,
        "address": db_purchase.address,
        "notes": db_purchase.notes,
        "payment_method": db_purchase.payment_method,
        "organization": db_purchase.organization,
        "images_urls": images_urls_list,
        "video_url": video_url_full,
        "status": db_purchase.status,
        "product": {
            "id": product.id,
            "name": product.name,
            "price": product.price,
            "discount": product.discount,
            "image_url": make_full_url(product.image_url) if product.image_url else None,
            "images_urls": [make_full_url(img_url) for img_url in json.loads(product.images_urls)] if product.images_urls else None
        }
    }
    
    return purchase_dict

@router.get("/my", response_model=List[schemas.Purchase])
async def get_my_purchases(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить мои заявки на покупку (как покупатель)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        purchased_by_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    purchases = db.query(models.Purchase).filter(
        models.Purchase.purchased_by_user_id == purchased_by_user_id
    ).order_by(models.Purchase.created_at.desc()).all()
    
    result = []
    for purchase in purchases:
        product = purchase.product
        # Преобразуем images_urls в полные URL
        images_urls_list = json.loads(purchase.images_urls) if purchase.images_urls else None
        if images_urls_list:
            images_urls_list = [make_full_url(img_url) for img_url in images_urls_list]
        
        # Преобразуем video_url в полный URL
        video_url_full = make_full_url(purchase.video_url) if purchase.video_url else None
        
        purchase_dict = {
            "id": purchase.id,
            "product_id": purchase.product_id,
            "user_id": purchase.user_id,
            "purchased_by_user_id": purchase.purchased_by_user_id,
            "created_at": purchase.created_at,
            "is_completed": purchase.is_completed,
            "is_cancelled": purchase.is_cancelled,
            "first_name": purchase.first_name,
            "last_name": purchase.last_name,
            "middle_name": purchase.middle_name,
            "phone_number": purchase.phone_number,
            "city": purchase.city,
            "address": purchase.address,
            "notes": purchase.notes,
            "payment_method": purchase.payment_method,
            "organization": purchase.organization,
            "images_urls": images_urls_list,
            "video_url": video_url_full,
            "status": purchase.status,
            "product": {
                "id": product.id,
                "name": product.name,
                "price": product.price,
                "discount": product.discount,
                "image_url": make_full_url(product.image_url) if product.image_url else None,
                "images_urls": [make_full_url(img_url) for img_url in json.loads(product.images_urls)] if product.images_urls else None
            } if product else None
        }
        result.append(purchase_dict)
    
    return result

@router.get("/all", response_model=List[schemas.Purchase])
async def get_all_purchases(
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Получить все заявки на покупку для владельца магазина (админка)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        viewer_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Проверяем, что пользователь является владельцем магазина
    if viewer_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    purchases = db.query(models.Purchase).filter(
        models.Purchase.user_id == user_id
    ).order_by(models.Purchase.created_at.desc()).all()
    
    result = []
    for purchase in purchases:
        product = purchase.product
        # Преобразуем images_urls в полные URL
        images_urls_list = json.loads(purchase.images_urls) if purchase.images_urls else None
        if images_urls_list:
            images_urls_list = [make_full_url(img_url) for img_url in images_urls_list]
        
        # Преобразуем video_url в полный URL
        video_url_full = make_full_url(purchase.video_url) if purchase.video_url else None
        
        purchase_dict = {
            "id": purchase.id,
            "product_id": purchase.product_id,
            "user_id": purchase.user_id,
            "purchased_by_user_id": purchase.purchased_by_user_id,
            "created_at": purchase.created_at,
            "is_completed": purchase.is_completed,
            "is_cancelled": purchase.is_cancelled,
            "first_name": purchase.first_name,
            "last_name": purchase.last_name,
            "middle_name": purchase.middle_name,
            "phone_number": purchase.phone_number,
            "city": purchase.city,
            "address": purchase.address,
            "notes": purchase.notes,
            "payment_method": purchase.payment_method,
            "organization": purchase.organization,
            "images_urls": images_urls_list,
            "video_url": video_url_full,
            "status": purchase.status,
            "product": {
                "id": product.id,
                "name": product.name,
                "price": product.price,
                "discount": product.discount,
                "image_url": make_full_url(product.image_url) if product.image_url else None,
                "images_urls": [make_full_url(img_url) for img_url in json.loads(product.images_urls)] if product.images_urls else None
            } if product else None
        }
        result.append(purchase_dict)
    
    return result

@router.patch("/{purchase_id}", response_model=schemas.Purchase)
async def update_purchase(
    purchase_id: int,
    purchase_update: schemas.PurchaseUpdate,
    user_id: int = Query(...),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db)
):
    """Обновить статус заявки на покупку (для владельца магазина)"""
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    
    try:
        viewer_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    if viewer_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db_purchase = db.query(models.Purchase).filter(
        models.Purchase.id == purchase_id,
        models.Purchase.user_id == user_id
    ).first()
    
    if not db_purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    if purchase_update.is_completed is not None:
        db_purchase.is_completed = purchase_update.is_completed
    if purchase_update.is_cancelled is not None:
        db_purchase.is_cancelled = purchase_update.is_cancelled
    if purchase_update.status:
        db_purchase.status = purchase_update.status
    
    db.commit()
    db.refresh(db_purchase)
    
    product = db_purchase.product
    
    # Преобразуем images_urls в полные URL
    images_urls_list = json.loads(db_purchase.images_urls) if db_purchase.images_urls else None
    if images_urls_list:
        images_urls_list = [make_full_url(img_url) for img_url in images_urls_list]
    
    # Преобразуем video_url в полный URL
    video_url_full = make_full_url(db_purchase.video_url) if db_purchase.video_url else None
    
    purchase_dict = {
        "id": db_purchase.id,
        "product_id": db_purchase.product_id,
        "user_id": db_purchase.user_id,
        "purchased_by_user_id": db_purchase.purchased_by_user_id,
        "created_at": db_purchase.created_at,
        "is_completed": db_purchase.is_completed,
        "is_cancelled": db_purchase.is_cancelled,
        "first_name": db_purchase.first_name,
        "last_name": db_purchase.last_name,
        "middle_name": db_purchase.middle_name,
        "phone_number": db_purchase.phone_number,
        "city": db_purchase.city,
        "address": db_purchase.address,
        "notes": db_purchase.notes,
        "payment_method": db_purchase.payment_method,
        "organization": db_purchase.organization,
        "images_urls": images_urls_list,
        "video_url": video_url_full,
        "status": db_purchase.status,
        "product": {
            "id": product.id,
            "name": product.name,
            "price": product.price,
            "discount": product.discount,
            "image_url": make_full_url(product.image_url) if product.image_url else None,
            "images_urls": [make_full_url(img_url) for img_url in json.loads(product.images_urls)] if product.images_urls else None
        } if product else None
    }
    
    return purchase_dict

