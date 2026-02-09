from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, BigInteger, DateTime, Boolean, UniqueConstraint
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
    # sold_products relationship определен в модели SoldProduct через backref
    # При удалении категории category_id в sold_products устанавливается в NULL (ondelete="SET NULL")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=True)  # Разрешаем null для "Цена по запросу"
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
    is_for_sale = Column(Boolean, default=False)  # Товар для покупки (с диапазоном цен)
    is_sale_enabled = Column(Boolean, default=False)  # Товар доступен для продажи клиентам (когда мы продаем товар)
    is_reservation_enabled = Column(Boolean, default=False)  # Товар доступен для резервации (взаимоисключающий с sale/order)
    price_from = Column(Float, nullable=True)  # Цена от (для товаров для покупки с диапазоном)
    price_to = Column(Float, nullable=True)  # Цена до (для товаров для покупки с диапазоном)
    price_fixed = Column(Float, nullable=True)  # Фиксированная цена покупки (для товаров для покупки с фиксированной ценой)
    price_type = Column(String, default='range')  # Тип цены: 'range' (от-до) или 'fixed' (фиксированная)
    quantity_from = Column(Integer, nullable=True)  # Количество от (для товаров для покупки)
    quantity_unit = Column(String, nullable=True)  # Единица измерения количества (шт или кг)
    quantity_show_enabled = Column(Boolean, nullable=True)  # Индивидуальная настройка показа количества (null = использовать общую настройку магазина)
    is_hidden = Column(Boolean, default=False)  # Скрыт ли товар от клиентов (виден только админу)
    is_client_sale = Column(Boolean, default=False)  # Товар для продажи клиентом другим клиентам (C2C)
    seller_id = Column(BigInteger, nullable=True, index=True)  # ID клиента-продавца (для C2C товаров)
    price_card = Column(Float, nullable=True)  # Цена по карте (для товаров с is_sale_enabled или is_made_to_order)
    price_cash = Column(Float, nullable=True)  # Цена наличными (для товаров с is_sale_enabled или is_made_to_order)
    price_old = Column(Float, nullable=True)  # Старая цена (зачёркнутая, для акций)
    delivery_time = Column(String, nullable=True)  # Срок доставки (текст, например "1–2 дня")
    delivery_price = Column(Float, nullable=True)  # Стоимость доставки (число, может быть 0)

    category_id = Column(Integer, ForeignKey("categories.id"))
    category = relationship("Category", back_populates="products")
    # Характеристики товара (индивидуально для каждого товара)
    characteristics = relationship(
        "ProductCharacteristic",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductCharacteristic.sort_order"
    )
    # Настройки доставки (one-to-one, для страницы редактирования и синхронизации между ботами)
    delivery_option = relationship(
        "ProductDelivery",
        back_populates="product",
        uselist=False,
        cascade="all, delete-orphan"
    )


class ProductDelivery(Base):
    """Настройки доставки товара (доставка/самовывоз). Одна запись на товар."""
    __tablename__ = "product_delivery"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    is_delivery_enabled = Column(Boolean, default=False)
    is_pickup_enabled = Column(Boolean, default=False)
    delivery_time = Column(String, nullable=True)  # Срок доставки (текст, например "1–2 дня")
    delivery_price = Column(Float, nullable=True)
    pickup_address = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="delivery_option")


class ProductCharacteristic(Base):
    """Характеристика товара (пара название + значение). Индивидуально для каждого товара."""
    __tablename__ = "product_characteristics"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(Text, nullable=False)
    value = Column(Text, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="characteristics")


class CharacteristicName(Base):
    """Справочник названий характеристик для быстрого выбора при создании товара.
    Уникальность: (user_id, bot_id, name) — в рамках магазина/бота не дублируем названия."""
    __tablename__ = "characteristic_names"
    __table_args__ = (
        UniqueConstraint("user_id", "bot_id", "name", name="uq_characteristic_names_user_bot_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)
    user_id = Column(BigInteger, nullable=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


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
    snapshot_id = Column(String, nullable=True, index=True)  # ID snapshot товара на момент резервации
    
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
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    quantity = Column(Integer, default=1)  # Количество проданного товара
    sold_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время продажи
    # Примечание: snapshot_id удален - эта функциональность не используется для SoldProduct
    # Используется только в Order, Sale, Purchase через таблицу user_product_snapshots
    
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
    snapshot_id = Column(String, nullable=True, index=True)  # ID snapshot товара на момент заказа
    # Уникальный человекочитаемый номер заказа (ORD-YYYYMMDD-HHMM-XXXX); для старых записей может быть NULL
    order_number = Column(String(64), unique=True, nullable=True, index=True)

    product = relationship("Product", backref="orders")

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)  # ID товара
    user_id = Column(BigInteger, index=True)  # ID владельца магазина (создателя товара)
    sold_by_user_id = Column(BigInteger, index=True)  # ID пользователя, который продал товар
    quantity = Column(Integer, default=1)  # Количество проданного товара
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время создания продажи
    is_completed = Column(Boolean, default=False)  # Выполнена ли продажа
    is_cancelled = Column(Boolean, default=False)  # Отменена ли продажа
    # Поля формы оформления продажи
    promo_code = Column(String, nullable=True)  # Промокод
    first_name = Column(String, nullable=True)  # Имя
    last_name = Column(String, nullable=True)  # Фамилия
    middle_name = Column(String, nullable=True)  # Отчество
    phone_country_code = Column(String, nullable=True)  # Код страны телефона
    phone_number = Column(String, nullable=True)  # Номер телефона
    email = Column(String, nullable=True)  # Почта
    notes = Column(Text, nullable=True)  # Примечание
    delivery_method = Column(String, nullable=True)  # Способ доставки (delivery/pickup)
    status = Column(String, default='pending')  # Статус продажи (pending/completed/cancelled)
    snapshot_id = Column(String, nullable=True, index=True)  # ID snapshot товара на момент продажи
    
    product = relationship("Product", backref="sales")

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)  # ID товара
    user_id = Column(BigInteger, index=True)  # ID владельца магазина (создателя товара)
    purchased_by_user_id = Column(BigInteger, index=True)  # ID пользователя, который хочет продать товар
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время создания заявки на покупку
    is_completed = Column(Boolean, default=False)  # Выполнена ли покупка
    is_cancelled = Column(Boolean, default=False)  # Отменена ли покупка
    # Поля формы заявки на покупку
    first_name = Column(String, nullable=True)  # Имя
    last_name = Column(String, nullable=True)  # Фамилия
    middle_name = Column(String, nullable=True)  # Отчество
    phone_number = Column(String, nullable=True)  # Номер телефона
    city = Column(String, nullable=True)  # Город
    address = Column(Text, nullable=True)  # Адрес
    notes = Column(Text, nullable=True)  # Примечание к покупке
    payment_method = Column(String, nullable=True)  # Форма оплаты (cash/bank_transfer)
    organization = Column(String, nullable=True)  # Организация (если есть)
    images_urls = Column(Text, nullable=True)  # JSON массив URL изображений (до 5 фото)
    video_url = Column(String, nullable=True)  # URL видео (1 видео)
    status = Column(String, default='pending')  # Статус покупки (pending/completed/cancelled)
    snapshot_id = Column(String, nullable=True, index=True)  # ID snapshot товара на момент покупки
    # Уникальный человекочитаемый номер операции (PUR-YYYYMMDD-HHMM-XXXX); для старых записей может быть NULL
    order_number = Column(String(64), unique=True, nullable=True, index=True)

    product = relationship("Product", backref="purchases")

class SaleOrder(Base):
    __tablename__ = "sale_orders"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)  # ID товара
    user_id = Column(BigInteger, index=True)  # ID владельца магазина (создателя товара)
    ordered_by_user_id = Column(BigInteger, index=True)  # ID пользователя, который заказал (купил)
    quantity = Column(Integer, default=1)  # Количество заказанного товара
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время создания заказа
    is_completed = Column(Boolean, default=False)  # Выполнен ли заказ
    is_cancelled = Column(Boolean, default=False)  # Отменен ли заказ
    # Поля формы оформления заказа на покупку
    promo_code = Column(String, nullable=True)  # Промокод
    first_name = Column(String, nullable=True)  # Имя
    last_name = Column(String, nullable=True)  # Фамилия
    phone_country_code = Column(String, nullable=True)  # Код страны телефона
    phone_number = Column(String, nullable=True)  # Номер телефона
    email = Column(String, nullable=True)  # Почта
    notes = Column(Text, nullable=True)  # Примечание
    delivery_method = Column(String, nullable=True)  # Способ доставки (delivery/pickup)
    payment_method = Column(String, nullable=True)  # Способ оплаты (online/crypto/cash)
    delivery_fee = Column(Float, default=0, nullable=True)  # Стоимость доставки
    items_amount = Column(Float, nullable=True)  # Сумма по товарам без доставки
    total_amount = Column(Float, nullable=True)  # items_amount + delivery_fee (финальная сумма)
    status = Column(String, default='pending')  # Статус заказа (pending/completed/cancelled)
    snapshot_id = Column(String, nullable=True, index=True)  # ID snapshot товара на момент заказа
    # Уникальный человекочитаемый номер заказа (SLO-YYYYMMDD-HHMM-XXXX); для старых записей может быть NULL
    order_number = Column(String(64), unique=True, nullable=True, index=True)

    product = relationship("Product", backref="sale_orders")


class Deal(Base):
    """
    Сделка (покупка из корзины): одна сделка = 1..N товаров.
    Статусы: draft (после start), active (после confirm), completed, cancelled.
    """
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    deal_number = Column(String(64), unique=True, nullable=True, index=True)  # Читаемый номер (11 цифр), присваивается при confirm
    buyer_user_id = Column(BigInteger, index=True)  # ID покупателя (клиента)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    # draft -> после checkout/start; active -> после checkout/confirm; completed, cancelled
    status = Column(String(32), default='draft', index=True)
    total_items_count = Column(Integer, default=0)
    total_amount = Column(Float, nullable=True)
    currency = Column(String(8), nullable=True)

    # Данные оформления (заполняются при confirm)
    payment_method = Column(String(32), nullable=True)   # card, cash, transfer, other
    delivery_method = Column(String(32), nullable=True) # pickup, courier, none
    delivery_fee = Column(Float, default=0, nullable=True)  # Стоимость доставки (при courier)
    items_amount = Column(Float, nullable=True)  # Сумма по товарам без доставки (фиксируется при confirm)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(64), nullable=True)
    delivery_address = Column(Text, nullable=True)
    customer_comment = Column(Text, nullable=True)
    seller_comment = Column(Text, nullable=True)  # Внутренняя заметка продавца (опционально)

    items = relationship("DealItem", back_populates="deal", cascade="all, delete-orphan")


class DealItem(Base):
    """Позиция в сделке: один товар с snapshot."""
    __tablename__ = "deal_items"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    snapshot_id = Column(String, nullable=True, index=True)  # ID snapshot товара на момент сделки
    seller_user_id = Column(BigInteger, index=True)  # ID владельца магазина (продавца)
    quantity = Column(Integer, default=1)
    price_per_unit = Column(Float, nullable=True)  # Цена за единицу на момент сделки
    line_total = Column(Float, nullable=True)  # quantity * price_per_unit

    deal = relationship("Deal", back_populates="items")
    product = relationship("Product", backref="deal_items")


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

class UserProductSnapshot(Base):
    __tablename__ = "user_product_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(String, unique=True, index=True)  # Уникальный идентификатор snapshot (UUID)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)  # ID оригинального товара (nullable для сохранения исторических данных при удалении продукта)
    user_id = Column(BigInteger, index=True)  # ID пользователя, для которого создан snapshot
    operation_type = Column(String, index=True)  # Тип операции: 'order', 'sell', 'buy'
    snapshot_json = Column(Text, nullable=True)  # JSON с данными товара на момент создания snapshot
    status_at_time = Column(String, nullable=True)  # Статус товара на момент создания snapshot
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время создания snapshot
    
    product = relationship("Product", backref="snapshots")
    # Примечание: при удалении Product, product_id устанавливается в NULL (ondelete="SET NULL")
    # Это позволяет сохранить исторические snapshots даже после удаления товара

class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True)  # ID товара
    user_id = Column(BigInteger, index=True)  # ID пользователя, который добавил в избранное
    shop_owner_id = Column(BigInteger, index=True)  # ID владельца магазина (для фильтрации)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время добавления в избранное
    
    product = relationship("Product", backref="favorites")
    
    # Уникальный индекс на пару (product_id, user_id) будет создан через миграцию

class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True)  # ID товара
    user_id = Column(BigInteger, index=True)  # ID пользователя, который добавил в корзину
    shop_owner_id = Column(BigInteger, index=True)  # ID владельца магазина (для фильтрации)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)  # ID бота (для независимых магазинов)
    quantity = Column(Integer, default=1)  # Количество товара в корзине
    selected = Column(Boolean, default=True)  # Выбран ли товар для оформления
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # Время добавления в корзину
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)  # Время последнего обновления
    
    product = relationship("Product", backref="cart_items")
    
    # Уникальный индекс на пару (product_id, user_id, shop_owner_id, bot_id) будет создан через миграцию




