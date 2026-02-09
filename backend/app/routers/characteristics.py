"""
Роутер для справочника названий характеристик товаров.
Используется Telegram-ботом при создании товара для выбора названий из уже существующих.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import database, models

router = APIRouter(prefix="/api/characteristics", tags=["characteristics"])


@router.get("/names", response_model=List[str])
def get_characteristic_names(
    user_id: int = Query(..., description="ID владельца магазина"),
    bot_id: Optional[int] = Query(None, description="ID бота (None = основной магазин)"),
    q: Optional[str] = Query(None, description="Поиск по названию (опционально)"),
    db: Session = Depends(database.get_db)
):
    """
    Возвращает список уникальных названий характеристик для магазина/бота.
    Используется при создании товара в Telegram: админ может выбрать из списка или ввести новое.
    Список отсортирован по алфавиту.
    """
    # Фильтр по user_id; bot_id опционален — если передан, фильтруем по магазину, иначе возвращаем все названия пользователя (для бота удобнее видеть все)
    query = db.query(models.CharacteristicName.name).filter(
        models.CharacteristicName.user_id == user_id
    )
    if bot_id is not None:
        query = query.filter(models.CharacteristicName.bot_id == bot_id)
    if q and q.strip():
        search_term = f"%{q.strip()}%"
        query = query.filter(models.CharacteristicName.name.ilike(search_term))
    # Уникальные названия, сортировка по алфавиту
    rows = query.distinct().order_by(models.CharacteristicName.name).all()
    return [r[0] for r in rows]
