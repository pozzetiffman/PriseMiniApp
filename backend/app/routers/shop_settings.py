"""
Роутер для управления настройками магазина
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv
from ..db import database, models
from ..models import shop_settings as schemas
from ..utils.telegram_auth import validate_telegram_init_data

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev")

router = APIRouter(prefix="/api/shop-settings", tags=["shop-settings"])


async def get_validated_user(
    request: Request,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    user_id: Optional[int] = Query(None, description="User ID для внутренних запросов от бота (только localhost)")
):
    """
    Dependency для валидации Telegram initData и извлечения user_id.
    Также поддерживает авторизацию через user_id в query для внутренних запросов от бота (localhost).
    """
    # Если есть initData - используем его (основной способ для WebApp)
    if x_telegram_init_data:
        if not TELEGRAM_BOT_TOKEN:
            raise HTTPException(
                status_code=500,
                detail="Bot token is not configured"
            )
        
        try:
            validated_data = validate_telegram_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
            return validated_data["user"]["id"]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")
    
    # Если нет initData, но есть user_id в query - проверяем, что запрос с localhost (для бота)
    if user_id is not None:
        client_host = request.client.host if request.client else None
        # Разрешаем только localhost/127.0.0.1 для безопасности
        if client_host in ("127.0.0.1", "localhost", "::1") or client_host.startswith("127."):
            return user_id
        else:
            raise HTTPException(
                status_code=403,
                detail="Direct user_id authentication is only allowed from localhost (for bot requests)"
            )
    
    # Нет ни initData, ни user_id
    raise HTTPException(
        status_code=401,
        detail="Telegram initData is required. Open the app through Telegram bot."
    )

async def get_optional_validated_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
) -> Optional[int]:
    """
    Dependency для опциональной валидации Telegram initData и извлечения user_id
    Возвращает None, если initData не предоставлен
    """
    if not x_telegram_init_data:
        return None
    
    if not TELEGRAM_BOT_TOKEN:
        return None
    
    try:
        validated_data = validate_telegram_init_data(x_telegram_init_data, TELEGRAM_BOT_TOKEN)
        return validated_data["user"]["id"]
    except:
        # Игнорируем ошибки валидации, возвращаем None
        return None


@router.get("", response_model=schemas.ShopSettings)
async def get_shop_settings(
    shop_owner_id: Optional[int] = Query(None, description="ID владельца магазина (для клиентов, просмотр чужих настроек)"),
    user_id: Optional[int] = Depends(get_optional_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Получить настройки магазина.
    Если shop_owner_id указан - возвращает настройки владельца магазина (публичные данные для клиентов).
    Если shop_owner_id не указан, но пользователь авторизован - возвращает настройки текущего пользователя (свои настройки).
    Если настройки не существуют, создаются с дефолтными значениями.
    """
    # Определяем, чьи настройки нужно получить
    # ВАЖНО: Приоритет shop_owner_id - если он указан, всегда используем его (клиент смотрит чужой магазин)
    # Иначе используем user_id если пользователь авторизован (свой магазин)
    if shop_owner_id is not None:
        # shop_owner_id указан - клиент смотрит чужой магазин, используем shop_owner_id
        target_user_id = shop_owner_id
    elif user_id is not None:
        # shop_owner_id не указан, но пользователь авторизован - используем его настройки (свой магазин)
        target_user_id = user_id
    else:
        # Нет ни shop_owner_id, ни авторизации
        raise HTTPException(
            status_code=401,
            detail="Authentication required or shop_owner_id must be provided"
        )
    
    print(f"📋 GET /api/shop-settings - user_id={user_id}, shop_owner_id={shop_owner_id}, target_user_id={target_user_id}")
    
    # Ищем существующие настройки
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == target_user_id
    ).first()
    
    # Если настройки не существуют, создаем с дефолтными значениями
    if not settings:
        print(f"📋 Creating default settings for user {target_user_id}")
        settings = models.ShopSettings(
            user_id=target_user_id,
            reservations_enabled=True,
            shop_name=None,
            welcome_image_url=None,
            welcome_description=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    # Преобразуем относительный путь в полный HTTPS URL для welcome_image_url
    welcome_image_url_full = None
    if settings.welcome_image_url:
        if settings.welcome_image_url.startswith('http://') or settings.welcome_image_url.startswith('https://'):
            welcome_image_url_full = settings.welcome_image_url
        else:
            # Извлекаем имя файла из пути
            filename = settings.welcome_image_url.replace('/static/uploads/', '')
            welcome_image_url_full = f"{API_PUBLIC_URL}/api/images/{filename}"
    
    # Возвращаем настройки с полным URL
    return {
        "id": settings.id,
        "user_id": settings.user_id,
        "reservations_enabled": settings.reservations_enabled,
        "shop_name": settings.shop_name,
        "welcome_image_url": welcome_image_url_full,
        "welcome_description": settings.welcome_description,
        "created_at": settings.created_at,
        "updated_at": settings.updated_at
    }


@router.put("", response_model=schemas.ShopSettings)
async def update_shop_settings(
    settings_update: schemas.ShopSettingsUpdate,
    user_id: int = Depends(get_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Обновить настройки магазина текущего пользователя.
    """
    # Используем model_dump(exclude_unset=True) чтобы получить только переданные поля
    update_data = settings_update.model_dump(exclude_unset=True)
    print(f"📋 PUT /api/shop-settings - user_id={user_id}, update_data={update_data}")
    
    # Ищем существующие настройки
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == user_id
    ).first()
    
    # Если настройки не существуют, создаем
    if not settings:
        print(f"📋 Creating settings for user {user_id}")
        # Используем значения из update_data или значения по умолчанию
        settings = models.ShopSettings(
            user_id=user_id,
            reservations_enabled=update_data.get('reservations_enabled', True),
            shop_name=update_data.get('shop_name', None),
            welcome_image_url=update_data.get('welcome_image_url', None),
            welcome_description=update_data.get('welcome_description', None),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(settings)
    else:
        # Обновляем только переданные поля
        if 'reservations_enabled' in update_data:
            settings.reservations_enabled = update_data['reservations_enabled']
        if 'shop_name' in update_data:
            settings.shop_name = update_data['shop_name']
        if 'welcome_image_url' in update_data:
            settings.welcome_image_url = update_data['welcome_image_url']
        if 'welcome_description' in update_data:
            settings.welcome_description = update_data['welcome_description']
        settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    print(f"✅ Settings updated - reservations_enabled={settings.reservations_enabled}, shop_name={settings.shop_name}")
    return settings


@router.post("/welcome-image", response_model=schemas.ShopSettings)
async def upload_welcome_image(
    image: UploadFile = File(...),
    user_id: int = Depends(get_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Загрузить приветственное изображение/логотип магазина.
    """
    print(f"📷 POST /api/shop-settings/welcome-image - user_id={user_id}")
    
    # Проверяем, что это изображение
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    upload_dir = "static/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Генерируем уникальное имя файла
    file_ext = os.path.splitext(image.filename)[1] if image.filename else '.jpg'
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    # Сохраняем файл
    try:
        contents = await image.read()
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
        print(f"📷 Welcome image saved: {file_path}, size: {len(contents)} bytes")
    except Exception as e:
        print(f"❌ Error saving welcome image: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")
    
    # Формируем путь к изображению
    image_url_path = f"/static/uploads/{unique_filename}"
    
    # Получаем или создаем настройки
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == user_id
    ).first()
    
    if not settings:
        settings = models.ShopSettings(
            user_id=user_id,
            reservations_enabled=True,
            shop_name=None,
            welcome_image_url=image_url_path,
            welcome_description=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(settings)
    else:
        # Удаляем старое изображение, если оно было
        if settings.welcome_image_url:
            old_path = settings.welcome_image_url.replace('/static/uploads/', 'static/uploads/')
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                    print(f"🗑️ Old welcome image deleted: {old_path}")
                except Exception as e:
                    print(f"⚠️ Could not delete old image: {e}")
        
        settings.welcome_image_url = image_url_path
        settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    # Преобразуем относительный путь в полный HTTPS URL
    welcome_image_url_full = f"{API_PUBLIC_URL}/api/images/{unique_filename}" if settings.welcome_image_url else None
    
    print(f"✅ Welcome image uploaded - user_id={user_id}, image_url={welcome_image_url_full}")
    
    # Возвращаем настройки с полным URL
    return {
        "id": settings.id,
        "user_id": settings.user_id,
        "reservations_enabled": settings.reservations_enabled,
        "shop_name": settings.shop_name,
        "welcome_image_url": welcome_image_url_full,
        "welcome_description": settings.welcome_description,
        "created_at": settings.created_at,
        "updated_at": settings.updated_at
    }


@router.delete("/welcome-image", response_model=schemas.ShopSettings)
async def delete_welcome_image(
    user_id: int = Depends(get_validated_user),
    db: Session = Depends(database.get_db)
):
    """
    Удалить приветственное изображение/логотип магазина.
    """
    print(f"🗑️ DELETE /api/shop-settings/welcome-image - user_id={user_id}")
    
    settings = db.query(models.ShopSettings).filter(
        models.ShopSettings.user_id == user_id
    ).first()
    
    if not settings:
        raise HTTPException(status_code=404, detail="Shop settings not found")
    
    # Удаляем файл изображения, если он существует
    if settings.welcome_image_url:
        file_path = settings.welcome_image_url.replace('/static/uploads/', 'static/uploads/')
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"🗑️ Welcome image deleted: {file_path}")
            except Exception as e:
                print(f"⚠️ Could not delete image file: {e}")
        
        settings.welcome_image_url = None
        settings.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(settings)
    
    print(f"✅ Welcome image deleted - user_id={user_id}")
    return settings

