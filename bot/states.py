"""
Состояния FSM для бота
"""
from aiogram.fsm.state import State, StatesGroup


class AddCategory(StatesGroup):
    """Состояния для добавления категории"""
    name = State()
    parent_choice = State()  # Выбор родительской категории (для подкатегорий)


class AddProduct(StatesGroup):
    """Состояния для добавления товара"""
    name = State()
    product_type = State()  # Тип товара: обычный, под заказ, для покупки
    price = State()
    price_from = State()  # Цена от (для товаров для покупки)
    price_to = State()  # Цена до (для товаров для покупки)
    price_fixed = State()  # Фиксированная цена (для товаров для покупки)
    price_type = State()  # Тип цены: range или fixed (для товаров для покупки)
    quantity_from = State()  # Количество от (для товаров для покупки)
    quantity_unit = State()  # Единица измерения (шт или кг)
    category = State()
    discount = State()
    description = State()
    # Доставка (после описания, перед характеристиками)
    ask_delivery = State()  # Указать доставку для товара?
    delivery_time_input = State()  # Ввод срока доставки текстом
    delivery_price_input = State()  # Ввод стоимости доставки числом
    # Характеристики товара (после описания/доставки, перед фото)
    ask_features = State()  # Хотите добавить характеристики?
    feature_name_choose = State()  # Выбор названия из списка
    feature_name_manual = State()  # Ввод нового названия вручную
    feature_value = State()  # Ввод значения характеристики
    ask_more_features = State()  # Добавить ещё / продолжить
    quantity = State()  # Количество товара
    is_hot_offer = State()  # Горящее предложение
    quantity_show_enabled = State()  # Показ количества товара
    price_card = State()  # Цена по карте (для is_sale_enabled или is_made_to_order)
    price_cash = State()  # Цена наличными (опционально)
    price_old = State()  # Старая цена (опционально)
    photos = State()  # Состояние для загрузки нескольких фото


class AddChannel(StatesGroup):
    """Состояния для добавления канала"""
    waiting_for_channel = State()


class SetShopName(StatesGroup):
    """Состояния для установки названия магазина"""
    name = State()


class SetWelcomeImage(StatesGroup):
    """Состояния для установки логотипа"""
    image = State()


class SetWelcomeDescription(StatesGroup):
    """Состояния для установки описания"""
    description = State()


class ConnectBot(StatesGroup):
    """Состояния для подключения бота"""
    token = State()
    web_app_name = State()  # Название Web App (создается через /newapp в BotFather)

