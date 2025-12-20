from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, BigInteger, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    user_id = Column(BigInteger, index=True)  # ID пользователя Telegram
    
    products = relationship("Product", back_populates="category", cascade="all, delete-orphan")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    price = Column(Float)
    image_url = Column(String, nullable=True)  # Оставляем для обратной совместимости
    images_urls = Column(Text, nullable=True)  # JSON массив URL изображений (до 5 фото)
    discount = Column(Float, default=0.0)  # Скидка в процентах
    user_id = Column(BigInteger, index=True)  # ID пользователя Telegram
    
    category_id = Column(Integer, ForeignKey("categories.id"))
    category = relationship("Category", back_populates="products")

class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(BigInteger, index=True)  # ID чата/канала в Telegram
    username = Column(String, nullable=True)  # @username канала (если есть)
    title = Column(String)  # Название канала/группы
    chat_type = Column(String)  # channel, group, supergroup
    user_id = Column(BigInteger, index=True)  # ID пользователя Telegram, который добавил канал

class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    user_id = Column(BigInteger, index=True)  # ID владельца магазина (создателя товара)
    reserved_by_user_id = Column(BigInteger, index=True)  # ID пользователя, который зарезервировал
    reserved_until = Column(DateTime, index=True)  # До какого времени зарезервировано
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)  # Активна ли резервация
    
    product = relationship("Product", backref="reservations")




