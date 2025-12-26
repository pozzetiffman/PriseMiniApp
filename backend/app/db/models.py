from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, BigInteger, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    user_id = Column(BigInteger, index=True)  # ID пользователя Telegram
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)  # ID бота (для независимых магазинов)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)  # ID родительской категории (для подкатегорий)
    
    products = relationship("Product", back_populates="category", cascade="all, delete-orphan")
    parent = relationship("Category", remote_side=[id], backref="subcategories")  # Связь с родительской категорией

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
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)  # ID бота (для независимых магазинов)
    sync_product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)  # ID оригинального товара в основном магазине (для синхронизации)
    is_hot_offer = Column(Boolean, default=False)  # Горящее предложение
    quantity = Column(Integer, default=0)  # Количество товара на складе
    is_sold = Column(Boolean, default=False)  # Продан ли товар (скрыт с витрины)
    is_made_to_order = Column(Boolean, default=False)  # Товар под заказ
    
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

class ShopSettings(Base):
    __tablename__ = "shop_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(BigInteger, index=True)  # ID владельца магазина (общий для всех ботов пользователя)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)  # ID бота (для индивидуальных настроек)
    reservations_enabled = Column(Boolean, default=True)  # Включена ли резервация товаров
    quantity_enabled = Column(Boolean, default=True)  # Включен ли показ количества товаров и учет резервации
    shop_name = Column(String, nullable=True)  # Название магазина (индивидуальное для каждого бота)
    welcome_image_url = Column(String, nullable=True)  # Приветственное изображение/логотип магазина (индивидуальное)
    welcome_description = Column(Text, nullable=True)  # Приветственное описание/примечание магазина (индивидуальное)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ShopVisit(Base):
    __tablename__ = "shop_visits"

    id = Column(Integer, primary_key=True, index=True)
    shop_owner_id = Column(BigInteger, index=True)  # ID владельца магазина
    visitor_id = Column(BigInteger, index=True)  # ID пользователя, который посетил магазин/просмотрел товар
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)  # ID товара (null = общее посещение магазина)
    visited_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время посещения/просмотра
    
    product = relationship("Product", backref="visits")

class SoldProduct(Base):
    __tablename__ = "sold_products"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)  # ID оригинального товара
    user_id = Column(BigInteger, index=True)  # ID владельца магазина
    name = Column(String, index=True)  # Название товара на момент продажи
    description = Column(Text, nullable=True)  # Описание товара на момент продажи
    price = Column(Float)  # Цена на момент продажи
    discount = Column(Float, default=0.0)  # Скидка на момент продажи
    image_url = Column(String, nullable=True)  # Первое изображение
    images_urls = Column(Text, nullable=True)  # JSON массив URL изображений
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    quantity = Column(Integer, default=1)  # Количество проданного товара
    sold_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время продажи
    
    product = relationship("Product", backref="sold_records")
    category = relationship("Category", backref="sold_products")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)  # ID товара
    user_id = Column(BigInteger, index=True)  # ID владельца магазина (создателя товара)
    ordered_by_user_id = Column(BigInteger, index=True)  # ID пользователя, который заказал
    quantity = Column(Integer, default=1)  # Количество заказанного товара
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время создания заказа
    is_completed = Column(Boolean, default=False)  # Выполнен ли заказ
    is_cancelled = Column(Boolean, default=False)  # Отменен ли заказ
    # Поля формы оформления заказа
    promo_code = Column(String, nullable=True)  # Промокод
    first_name = Column(String, nullable=True)  # Имя
    last_name = Column(String, nullable=True)  # Фамилия
    middle_name = Column(String, nullable=True)  # Отчество
    phone_country_code = Column(String, nullable=True)  # Код страны телефона
    phone_number = Column(String, nullable=True)  # Номер телефона
    email = Column(String, nullable=True)  # Почта
    notes = Column(Text, nullable=True)  # Примечание
    delivery_method = Column(String, nullable=True)  # Способ доставки (delivery/pickup)
    status = Column(String, default='pending')  # Статус заказа (pending/completed/cancelled)
    
    product = relationship("Product", backref="orders")

class WebAppContext(Base):
    __tablename__ = "webapp_contexts"

    id = Column(Integer, primary_key=True, index=True)
    viewer_id = Column(BigInteger, unique=True, index=True)  # ID того, кто нажал кнопку (уникальный)
    shop_owner_id = Column(BigInteger, index=True)  # ID владельца магазина
    chat_id = Column(BigInteger, nullable=True)  # ID группы (опционально, для аналитики)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время создания контекста
    # TTL: контекст живет 1 час (3600 секунд)

class Bot(Base):
    __tablename__ = "bots"

    id = Column(Integer, primary_key=True, index=True)
    bot_token = Column(String, unique=True, index=True)  # Токен бота пользователя
    bot_username = Column(String, unique=True, index=True)  # @username бота (без @)
    owner_user_id = Column(BigInteger, index=True)  # ID владельца (Telegram user_id)
    is_active = Column(Boolean, default=True)  # Активен ли бот
    direct_link_name = Column(String, nullable=True)  # Название Direct Link (например, "shop", "TGshowcase_bot")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время регистрации
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)  # Время обновления




