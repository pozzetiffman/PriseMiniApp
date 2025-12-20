from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..db import database
from ..db.models import Channel
from pydantic import BaseModel

router = APIRouter(prefix="/api/channels", tags=["channels"])

class ChannelCreate(BaseModel):
    chat_id: int
    username: Optional[str] = None
    title: str
    chat_type: str
    user_id: int

class ChannelResponse(BaseModel):
    id: int
    chat_id: int
    username: Optional[str] = None
    title: str
    chat_type: str
    user_id: int

    class Config:
        from_attributes = True

@router.get("/", response_model=List[ChannelResponse])
def get_channels(user_id: int = Query(...), db: Session = Depends(database.get_db)):
    """Получить все каналы пользователя"""
    print(f"DEBUG: get_channels called with user_id={user_id}, type={type(user_id)}")
    try:
        channels = db.query(Channel).filter(Channel.user_id == user_id).all()
        print(f"DEBUG: Found {len(channels)} channels for user {user_id}")
        return channels if channels else []
    except Exception as e:
        print(f"ERROR: Exception in get_channels: {e}")
        raise

@router.post("/", response_model=ChannelResponse)
def create_channel(channel: ChannelCreate, db: Session = Depends(database.get_db)):
    """Добавить канал"""
    # Проверяем, не существует ли уже такой канал для этого пользователя
    existing = db.query(Channel).filter(
        Channel.chat_id == channel.chat_id,
        Channel.user_id == channel.user_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Канал уже добавлен")
    
    db_channel = Channel(**channel.model_dump())
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)
    return db_channel

@router.delete("/{channel_id}")
def delete_channel(channel_id: int, user_id: int = Query(...), db: Session = Depends(database.get_db)):
    """Удалить канал"""
    channel = db.query(Channel).filter(
        Channel.id == channel_id,
        Channel.user_id == user_id
    ).first()
    
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    
    db.delete(channel)
    db.commit()
    return {"message": "Канал удален"}

