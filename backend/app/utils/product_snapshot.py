import json
import uuid
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from ..db import models


def create_product_snapshot(
    db: Session,
    product: models.Product,
    user_id: int,
    operation_type: str = 'order'
) -> str:
    """
    Создает snapshot товара на момент операции (заказ, продажа, покупка, резервация).
    Это необходимо для изоляции данных товара - даже если товар будет изменен или удален,
    snapshot сохранит его состояние на момент операции.
    
    Args:
        db: Сессия базы данных
        product: Объект товара
        user_id: ID пользователя, для которого создается snapshot
        operation_type: Тип операции ('order', 'sell', 'buy', 'reservation')
    
    Returns:
        snapshot_id: Уникальный идентификатор snapshot (UUID строка)
    """
    # Генерируем уникальный ID для snapshot
    snapshot_id = str(uuid.uuid4())
    
    # Парсим images_urls если это строка
    images_urls_list = []
    if product.images_urls:
        try:
            if isinstance(product.images_urls, str):
                images_urls_list = json.loads(product.images_urls)
            else:
                images_urls_list = product.images_urls
        except (json.JSONDecodeError, TypeError):
            images_urls_list = []
    
    # Формируем JSON с данными товара на момент операции
    product_data = {
        # Основные данные товара
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "price": product.price,
        "discount": product.discount or 0.0,
        "image_url": product.image_url,
        "images_urls": images_urls_list,
        # Дополнительные поля
        "is_hot_offer": product.is_hot_offer or False,
        "quantity": product.quantity or 0,
        "is_made_to_order": product.is_made_to_order or False,
        "is_for_sale": product.is_for_sale or False,
        "price_from": product.price_from,
        "price_to": product.price_to,
        "price_fixed": product.price_fixed,
        "price_type": product.price_type or 'range',
        "quantity_from": product.quantity_from,
        "quantity_unit": product.quantity_unit,
        "quantity_show_enabled": product.quantity_show_enabled,
        "category_id": product.category_id
    }
    
    # Создаем snapshot с данными товара на момент операции
    snapshot = models.UserProductSnapshot(
        snapshot_id=snapshot_id,
        product_id=product.id,
        user_id=user_id,
        operation_type=operation_type,
        snapshot_json=json.dumps(product_data, ensure_ascii=False),
        status_at_time="available"  # Статус товара на момент создания
    )
    
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    
    print(f"📸 Created product snapshot: snapshot_id={snapshot_id}, product_id={product.id}, operation_type={operation_type}")
    
    return snapshot_id


def get_product_display_info_from_snapshot(snapshot: models.UserProductSnapshot) -> Optional[Dict[str, Any]]:
    """
    Преобразует snapshot в словарь с информацией о товаре для отображения.
    Возвращает данные в том же формате, что и обычный товар.
    
    Args:
        snapshot: Объект UserProductSnapshot
    
    Returns:
        Словарь с данными товара или None если snapshot невалиден
    """
    if not snapshot:
        return None
    
    # Парсим JSON из snapshot_json
    if not snapshot.snapshot_json:
        return None
    
    try:
        product_info = json.loads(snapshot.snapshot_json)
        # Убеждаемся, что images_urls это список
        if isinstance(product_info.get("images_urls"), str):
            product_info["images_urls"] = json.loads(product_info["images_urls"])
        return product_info
    except (json.JSONDecodeError, TypeError) as e:
        print(f"❌ Error parsing snapshot JSON: {e}")
        return None
