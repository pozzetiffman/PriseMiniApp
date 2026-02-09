"""
Обработчики для управления товарами
"""
import asyncio
import json
import os
import logging

log = logging.getLogger(__name__)
import tempfile
import aiohttp
from aiogram import types
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.exceptions import TelegramNetworkError

# Lazy imports для утилит
try:
    from ..utils import clear_state_if_needed, is_command, is_menu_button
except ImportError:
    from utils import clear_state_if_needed, is_command, is_menu_button

# Импорт состояний FSM
try:
    from ..states import AddProduct
except ImportError:
    from states import AddProduct

# Lazy import для show_category_selection из categories
try:
    from ..handlers.categories import show_category_selection
except ImportError:
    from handlers.categories import show_category_selection

# Lazy import для cmd_manage и _cmd_manage_impl из commands
try:
    from ..handlers.commands import cmd_manage, _cmd_manage_impl
except ImportError:
    from handlers.commands import cmd_manage, _cmd_manage_impl

# Lazy import для получения API_URL из bot.py
def get_api_url():
    """Получить API_URL из bot.py"""
    try:
        import __main__
        return __main__.API_URL
    except:
        return "http://localhost:8000/api"

# Размер страницы для пагинации названий характеристик
FEATURE_NAMES_PAGE_SIZE = 8


async def fetch_characteristic_names(user_id: int, bot_id=None) -> list:
    """Загрузить список названий характеристик из backend API для магазина/бота"""
    API_URL = get_api_url()
    params = {"user_id": user_id}
    if bot_id is not None:
        params["bot_id"] = bot_id
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/characteristics/names", params=params) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        logging.warning(f"Failed to fetch characteristic names: {e}")
    return []


PHOTOS_STEP_TEXT = "Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:"


async def _go_to_photos_or_next(message_or_callback, state: FSMContext):
    """
    Переход после характеристик: для обычного товара — quantity_unit, для остальных — photos.
    """
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    is_client_sale = data.get('is_client_sale', False)
    is_made_to_order = data.get('is_made_to_order', False)
    obj = message_or_callback.message if hasattr(message_or_callback, 'message') else message_or_callback

    if is_for_sale or is_client_sale or is_made_to_order:
        await state.update_data(photos=[])
        await state.set_state(AddProduct.photos)
        await obj.answer(PHOTOS_STEP_TEXT)
    else:
        # Обычный товар — сначала единица измерения
        await state.set_state(AddProduct.quantity_unit)
        builder = InlineKeyboardBuilder()
        for u in ["шт", "кг", "г", "л", "мл", "м", "см", "м²", "м³", "упак", "набор", "пара"]:
            builder.button(text=u, callback_data=f"unit_{u}")
        builder.adjust(3)
        await obj.answer("📏 Выберите единицу измерения:", reply_markup=builder.as_markup())


# Lazy import для получения bot из bot.py
def get_bot():
    """Получить bot из bot.py"""
    try:
        import __main__
        return __main__.bot
    except:
        # Fallback: пытаемся импортировать напрямую
        try:
            from ..bot import bot
            return bot
        except:
            from bot import bot
            return bot


async def start_add_product(message: Message, state: FSMContext):
    """Начало добавления товара"""
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    await state.update_data(user_id=message.from_user.id)
    await state.set_state(AddProduct.name)
    await message.answer("Введите название товара:", reply_markup=types.ReplyKeyboardRemove())


async def process_name(message: Message, state: FSMContext):
    """Обработка названия товара"""
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    await state.update_data(name=message.text)
    await state.set_state(AddProduct.product_type)
    
    # Создаем кнопки для выбора типа товара
    builder = InlineKeyboardBuilder()
    builder.button(text="📦 Обычный товар", callback_data="product_type_regular")
    builder.button(text="📝 Под заказ", callback_data="product_type_made_to_order")
    builder.button(text="💰 Покупка у клиента (C2B)", callback_data="product_type_for_sale")
    builder.button(text="💼 Продажа (C2C)", callback_data="product_type_client_sale")
    builder.adjust(1)
    
    await message.answer(
        "Выберите тип товара:\n\n"
        "📦 <b>Обычный товар</b> - товар с фиксированной ценой (магазин продаёт клиенту)\n"
        "📝 <b>Под заказ</b> - товар, который изготавливается по заказу\n"
        "💰 <b>Покупка у клиента (C2B)</b> - товар, который вы хотите купить (с диапазоном цен)\n"
        "💼 <b>Продажа (C2C)</b> - товар, который вы продаете другим клиентам",
        reply_markup=builder.as_markup(),
        parse_mode="HTML"
    )


async def send_price_type_keyboard(message: Message):
    """Отправить сообщение с кнопками «Диапазон» / «Фиксированная» для товара «Для покупки»."""
    builder = InlineKeyboardBuilder()
    builder.button(text="📊 Диапазон цен (от-до)", callback_data="price_type_range")
    builder.button(text="💰 Фиксированная цена", callback_data="price_type_fixed")
    builder.adjust(1)
    await message.answer(
        "Выберите тип цены для товара:\n\n"
        "📊 <b>Диапазон цен</b> - укажите цену от и до\n"
        "💰 <b>Фиксированная цена</b> - укажите одну цену",
        reply_markup=builder.as_markup(),
        parse_mode="HTML"
    )


async def process_product_type(callback: CallbackQuery, state: FSMContext):
    """Обработка типа товара"""
    product_type = callback.data.replace("product_type_", "")
    
    if product_type == "regular":
        log.debug(f"process_product_type: regular, user_id={callback.from_user.id}")
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=False,
            is_client_sale=False,
            is_sale_enabled=False,  # По умолчанию выключено — пользователь включает «Продажа» вручную в редактировании
            user_id=callback.from_user.id
        )
        # Переходим сразу к выбору категории (убрали шаг price)
        await show_categories_with_navigation(callback, state, parent_id=None)
    elif product_type == "made_to_order":
        log.debug(f"process_product_type: made_to_order, user_id={callback.from_user.id}")
        await state.update_data(
            is_made_to_order=True,
            is_for_sale=False,
            is_client_sale=False,
            is_sale_enabled=False,  # Для товаров под заказ is_sale_enabled = False, но запрашиваем цены
            user_id=callback.from_user.id
        )
        # Переходим сразу к выбору категории (убрали шаг price)
        await show_categories_with_navigation(callback, state, parent_id=None)
    elif product_type == "for_sale":
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=True,
            is_client_sale=False
        )
        await state.set_state(AddProduct.price_type)
        await send_price_type_keyboard(callback.message)
    elif product_type == "client_sale":
        # C2C товар: клиент продает другим клиентам
        log.debug(f"process_product_type: client_sale, user_id={callback.from_user.id}")
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=False,
            is_client_sale=True,
            is_sale_enabled=True,  # Автоматически включаем продажу
            user_id=callback.from_user.id
        )
        # Переходим сразу к выбору категории (убрали шаг price)
        await callback.message.answer("💼 <b>Продажа товара (C2C)</b>", parse_mode="HTML")
        await show_categories_with_navigation(callback, state, parent_id=None)
    
    await callback.answer()


async def process_price_type(callback: CallbackQuery, state: FSMContext):
    """Обработка типа цены"""
    price_type = callback.data.replace("price_type_", "")
    await state.update_data(price_type=price_type)
    
    if price_type == "range":
        await state.set_state(AddProduct.price_from)
        await callback.message.answer("Введите цену ОТ (число):")
    elif price_type == "fixed":
        await state.set_state(AddProduct.price_fixed)
        await callback.message.answer("Введите фиксированную цену (число):")
    
    await callback.answer()


async def resend_price_type_on_product_type_click(callback: CallbackQuery, state: FSMContext):
    """В price_type пользователь снова нажал тип товара — показываем клавиатуру выбора типа цены."""
    await send_price_type_keyboard(callback.message)
    await callback.answer()


async def process_price_from(message: Message, state: FSMContext):
    """Обработка цены 'от'"""
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_from = float(message.text)
        await state.update_data(price_from=price_from)
        await state.set_state(AddProduct.price_to)
        await message.answer("Введите цену ДО (число):")
    except ValueError:
        await message.answer("Пожалуйста, введите число.")


async def process_price_to(message: Message, state: FSMContext):
    """Обработка цены 'до'"""
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_to = float(message.text)
        data = await state.get_data()
        price_from = data.get('price_from')
        
        if price_to <= price_from:
            await message.answer("Цена ДО должна быть больше цены ОТ. Попробуйте снова:")
            return
        
        await state.update_data(price_to=price_to)
        await state.set_state(AddProduct.quantity_unit)
        
        # Создаем кнопки для выбора единицы измерения (все доступные единицы)
        # ВАЖНО: callback_data должен быть в формате "unit_<значение>", где значение - русское название
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_шт")
        builder.button(text="кг", callback_data="unit_кг")
        builder.button(text="г", callback_data="unit_г")
        builder.button(text="л", callback_data="unit_л")
        builder.button(text="мл", callback_data="unit_мл")
        builder.button(text="м", callback_data="unit_м")
        builder.button(text="см", callback_data="unit_см")
        builder.button(text="м²", callback_data="unit_м²")
        builder.button(text="м³", callback_data="unit_м³")
        builder.button(text="упак", callback_data="unit_упак")
        builder.button(text="набор", callback_data="unit_набор")
        builder.button(text="пара", callback_data="unit_пара")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("📏 Выберите единицу измерения:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")


async def process_price_fixed(message: Message, state: FSMContext):
    """Обработка фиксированной цены"""
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_fixed = float(message.text)
        await state.update_data(price_fixed=price_fixed)
        await state.set_state(AddProduct.quantity_unit)
        
        # Создаем кнопки для выбора единицы измерения (все доступные единицы)
        # ВАЖНО: callback_data должен быть в формате "unit_<значение>", где значение - русское название
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_шт")
        builder.button(text="кг", callback_data="unit_кг")
        builder.button(text="г", callback_data="unit_г")
        builder.button(text="л", callback_data="unit_л")
        builder.button(text="мл", callback_data="unit_мл")
        builder.button(text="м", callback_data="unit_м")
        builder.button(text="см", callback_data="unit_см")
        builder.button(text="м²", callback_data="unit_м²")
        builder.button(text="м³", callback_data="unit_м³")
        builder.button(text="упак", callback_data="unit_упак")
        builder.button(text="набор", callback_data="unit_набор")
        builder.button(text="пара", callback_data="unit_пара")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("📏 Выберите единицу измерения:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")


async def process_quantity_from(message: Message, state: FSMContext):
    """Обработка количества 'от'"""
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        quantity_from = int(message.text)
        if quantity_from < 1:
            await message.answer("Количество должно быть больше 0. Попробуйте снова:")
            return
        
        await state.update_data(quantity_from=quantity_from)
        
        # Для товара для покупки спрашиваем о показе количества
        await state.set_state(AddProduct.quantity_show_enabled)
        
        # Создаем кнопки для выбора показа количества
        builder = InlineKeyboardBuilder()
        builder.button(text="✅ Показывать", callback_data="quantity_show_yes")
        builder.button(text="❌ Не показывать", callback_data="quantity_show_no")
        builder.button(text="⚙️ Использовать настройку магазина", callback_data="quantity_show_default")
        builder.adjust(1)
        
        await message.answer(
            "Показывать количество товара на витрине?\n\n"
            "• <b>Показывать</b> - всегда показывать количество\n"
            "• <b>Не показывать</b> - скрыть количество\n"
            "• <b>Использовать настройку магазина</b> - использовать общую настройку",
            reply_markup=builder.as_markup(),
            parse_mode="HTML"
        )
    except ValueError:
        await message.answer("Пожалуйста, введите целое число.")


async def process_quantity_unit(callback: CallbackQuery, state: FSMContext):
    """Обработка единицы измерения"""
    log.debug(f" process_quantity_unit called: callback_data={callback.data}")
    
    # Извлекаем единицу измерения из callback_data (формат: "unit_<значение>")
    if not callback.data.startswith("unit_"):
        log.debug(f"ERROR: invalid callback_data format: {callback.data}")
        await callback.answer("❌ Ошибка: неверный формат данных", show_alert=True)
        return
    
    unit = callback.data.replace("unit_", "", 1)  # Убираем префикс "unit_"
    log.debug(f" process_quantity_unit: parsed unit={unit}")
    
    # Сохраняем единицу измерения (уже в русском формате)
    await state.update_data(quantity_unit=unit)
    
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    is_client_sale = data.get('is_client_sale', False)
    is_made_to_order = data.get('is_made_to_order', False)
    
    log.debug(f" process_quantity_unit: is_for_sale={is_for_sale}, is_client_sale={is_client_sale}, is_made_to_order={is_made_to_order}")
    
    if is_made_to_order:
        # Для товара под заказ количество = 0, переходим к описанию
        await state.update_data(quantity=0)
        next_state = AddProduct.description
        log.debug(f"process_quantity_unit: next state for made_to_order={next_state}")
        await state.set_state(next_state)
        await callback.message.edit_text("📝 Введите описание товара (или отправьте /skip чтобы пропустить):")
        await callback.answer()
        return
    
    if is_for_sale:
        # Для товара для покупки переходим к вводу количества ОТ
        next_state = AddProduct.quantity_from
        log.debug(f"process_quantity_unit: next state for is_for_sale={next_state}")
        await state.set_state(next_state)
        await callback.message.edit_text(f"📦 Введите количество ОТ ({unit}, например: 1):")
    elif is_client_sale:
        # Для C2C товара переходим к вводу количества на складе
        next_state = AddProduct.quantity
        log.debug(f"process_quantity_unit: next state for is_client_sale={next_state}")
        await state.set_state(next_state)
        await callback.message.edit_text(f"📦 Введите количество товара на складе ({unit}):")
    else:
        # Для обычного товара переходим к вводу количества на складе
        next_state = AddProduct.quantity
        log.debug(f"process_quantity_unit: next state for regular={next_state}")
        await state.set_state(next_state)
        await callback.message.edit_text(f"📦 Введите количество товара на складе ({unit}):")
    
    await callback.answer()


async def process_quantity_show_enabled(callback: CallbackQuery, state: FSMContext):
    """Обработка показа количества"""
    log.debug(f" process_quantity_show_enabled called: callback_data={callback.data}")
    
    show_type = callback.data.replace("quantity_show_", "")
    
    if show_type == "yes":
        quantity_show_enabled = True
    elif show_type == "no":
        quantity_show_enabled = False
    else:  # default
        quantity_show_enabled = None
    
    await state.update_data(quantity_show_enabled=quantity_show_enabled)
    log.debug(f" process_quantity_show_enabled: quantity_show_enabled={quantity_show_enabled}")
    
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    is_client_sale = data.get('is_client_sale', False)
    
    log.debug(f" process_quantity_show_enabled: is_for_sale={is_for_sale}, is_client_sale={is_client_sale}")
    
    if is_for_sale:
        # Для товара для покупки переходим к выбору категории
        next_state = AddProduct.category
        log.debug(f"process_quantity_show_enabled: next state for is_for_sale={next_state}")
        await show_category_selection(callback, state)
    elif is_client_sale:
        # Для C2C товара после показа количества переходим к описанию
        next_state = AddProduct.description
        log.debug(f"process_quantity_show_enabled: next state for is_client_sale={next_state}")
        await state.set_state(next_state)
        await callback.message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    else:
        # Для обычного товара переходим к загрузке фото
        next_state = AddProduct.photos
        log.debug(f"process_quantity_show_enabled: next state for regular={next_state}")
        await state.update_data(photos=[])
        await state.set_state(next_state)
        await callback.message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    
    await callback.answer()


async def process_price(message: Message, state: FSMContext):
    """Обработка цены"""
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price = float(message.text)
        await state.update_data(price=price)
        
        # Получаем категории пользователя
        data = await state.get_data()
        user_id = data.get('user_id', message.from_user.id)
        API_URL = get_api_url()
        
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/categories/", params={"user_id": user_id}) as resp:
                categories = await resp.json()
        
        if not categories:
            await message.answer("Сначала создайте категорию! Используйте /manage")
            return await state.clear()
            
        # Используем новую функцию для показа категорий с навигацией
        await state.update_data(user_id=user_id)
        await show_categories_with_navigation(message, state, parent_id=None)
    except ValueError:
        await message.answer("Пожалуйста, введите число.")


async def show_categories_with_navigation(callback_or_message, state: FSMContext, parent_id=None):
    """Показать категории с навигацией по дереву"""
    data = await state.get_data()
    # Получаем user_id из состояния или из callback/message
    if hasattr(callback_or_message, 'from_user'):
        user_id = data.get('user_id', callback_or_message.from_user.id)
    elif hasattr(callback_or_message, 'message') and hasattr(callback_or_message.message, 'from_user'):
        user_id = data.get('user_id', callback_or_message.message.from_user.id)
    else:
        user_id = data.get('user_id')
    
    if not user_id:
        log.debug(f"ERROR: user_id not found in state or callback")
        if hasattr(callback_or_message, 'message'):
            return await callback_or_message.message.answer("❌ Ошибка: не найден user_id")
        else:
            return await callback_or_message.answer("❌ Ошибка: не найден user_id")
    
    API_URL = get_api_url()
    
    log.debug(f" show_categories_with_navigation: parent_id={parent_id}, user_id={user_id}")
    
    # Получаем дерево категорий
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                log.debug(f"Error getting categories: status={resp.status}, error={error_text}")
                if hasattr(callback_or_message, 'message'):
                    return await callback_or_message.message.answer("❌ Ошибка при получении списка категорий")
                else:
                    return await callback_or_message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        if hasattr(callback_or_message, 'message'):
            return await callback_or_message.message.answer("❌ Нет категорий. Сначала создайте категорию!")
        else:
            return await callback_or_message.answer("❌ Нет категорий. Сначала создайте категорию!")
    
    builder = InlineKeyboardBuilder()
    
    if parent_id is None:
        # Показываем основные категории
        log.debug(f"Showing main categories: {len(main_categories)} categories")
        for cat in main_categories:
            has_subcategories = bool(cat.get('subcategories'))
            # Если есть подкатегории, показываем кнопку для перехода в них
            if has_subcategories:
                builder.button(text=f"📁 {cat['name']} →", callback_data=f"cat_parent_{cat['id']}")
            else:
                # Если нет подкатегорий, можно выбрать эту категорию
                builder.button(text=f"📁 {cat['name']}", callback_data=f"cat_{cat['id']}")
    else:
        # Показываем подкатегории выбранной родительской категории
        parent_cat = None
        for cat in main_categories:
            if cat['id'] == parent_id:
                parent_cat = cat
                break
        
        if not parent_cat:
            log.debug(f"Parent category {parent_id} not found")
            if hasattr(callback_or_message, 'message'):
                return await callback_or_message.message.answer("❌ Родительская категория не найдена")
            else:
                return await callback_or_message.answer("❌ Родительская категория не найдена")
        
        # Кнопка "Назад" к основным категориям
        builder.button(text="⬅ Назад", callback_data="cat_back")
        
        # Показываем подкатегории
        if parent_cat.get('subcategories'):
            log.debug(f"Showing subcategories of {parent_cat['name']}: {len(parent_cat['subcategories'])} subcategories")
            for subcat in parent_cat['subcategories']:
                builder.button(text=f"📂 {subcat['name']}", callback_data=f"cat_{subcat['id']}")
        
        # Кнопка для выбора самой родительской категории
        builder.button(text=f"📁 {parent_cat['name']} (выбрать эту)", callback_data=f"cat_{parent_id}")
    
    builder.adjust(1)
    
    await state.set_state(AddProduct.category)
    if hasattr(callback_or_message, 'message'):
        await callback_or_message.message.answer("Выберите категорию:", reply_markup=builder.as_markup())
    else:
        await callback_or_message.answer("Выберите категорию:", reply_markup=builder.as_markup())


async def process_category(callback: CallbackQuery, state: FSMContext):
    """Обработка категории"""
    log.debug(f" process_category called: callback_data={callback.data}")
    
    current_state = await state.get_state()
    log.debug(f" Current FSM state: {current_state}")
    
    # Обработка навигации назад
    if callback.data == "cat_back":
        await show_categories_with_navigation(callback, state, parent_id=None)
        await callback.answer()
        return
    
    # Обработка перехода к подкатегориям
    if callback.data.startswith("cat_parent_"):
        parent_id = int(callback.data.split("_")[2])
        log.debug(f"Navigating to subcategories of parent_id={parent_id}")
        await show_categories_with_navigation(callback, state, parent_id=parent_id)
        await callback.answer()
        return
    
    # Обработка выбора категории
    if callback.data.startswith("cat_"):
        cat_id = int(callback.data.split("_")[1])
        log.debug(f"Category selected: category_id={cat_id}")
        
        await state.update_data(category_id=cat_id)
        
        # Проверяем, что category_id сохранен
        verify_data = await state.get_data()
        log.debug(f"Verified category_id in state: {verify_data.get('category_id')}")
        
        # Проверяем тип товара
        data = await state.get_data()
        is_for_sale = data.get('is_for_sale', False)
        is_client_sale = data.get('is_client_sale', False)
        is_made_to_order = data.get('is_made_to_order', False)
        
        log.debug(f"Product type flags: is_for_sale={is_for_sale}, is_client_sale={is_client_sale}, is_made_to_order={is_made_to_order}")
        
        if is_for_sale:
            # Для товара для покупки переходим к горящему предложению
            next_state = AddProduct.is_hot_offer
            log.debug(f"Next state for is_for_sale: {next_state}")
            await state.set_state(next_state)
            
            # Создаем кнопки для выбора горящего предложения
            builder = InlineKeyboardBuilder()
            builder.button(text="✅ Да", callback_data="hot_offer_yes")
            builder.button(text="❌ Нет", callback_data="hot_offer_no")
            builder.adjust(2)
            
            await callback.message.answer(
                "🔥 Это горящее предложение?",
                reply_markup=builder.as_markup()
            )
        elif is_client_sale:
            # Для C2C товара после категории переходим к горящему предложению (новый flow)
            next_state = AddProduct.is_hot_offer
            log.debug(f"Next state for is_client_sale: {next_state}")
            await state.set_state(next_state)
            
            # Создаем кнопки для выбора горящего предложения
            builder = InlineKeyboardBuilder()
            builder.button(text="✅ Да", callback_data="hot_offer_yes")
            builder.button(text="❌ Нет", callback_data="hot_offer_no")
            builder.adjust(2)
            
            await callback.message.answer(
                "🔥 Это горящее предложение?",
                reply_markup=builder.as_markup()
            )
        else:
            # Для обычного товара и товара под заказ переходим к горящему предложению
            next_state = AddProduct.is_hot_offer
            log.debug(f"Next state for regular/made_to_order: {next_state}")
            await state.set_state(next_state)
            
            # Создаем кнопки для выбора горящего предложения
            builder = InlineKeyboardBuilder()
            builder.button(text="✅ Да", callback_data="hot_offer_yes")
            builder.button(text="❌ Нет", callback_data="hot_offer_no")
            builder.adjust(2)
            
            await callback.message.answer(
                "🔥 Это горящее предложение?",
                reply_markup=builder.as_markup()
            )
    
    await callback.answer()


async def process_hot_offer(callback: CallbackQuery, state: FSMContext):
    """Обработка горящего предложения"""
    log.debug(f" process_hot_offer called: callback_data={callback.data}")
    
    is_hot_offer = callback.data == "hot_offer_yes"
    await state.update_data(is_hot_offer=is_hot_offer)
    
    # Проверяем, является ли товар для покупки или C2C
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    is_client_sale = data.get('is_client_sale', False)
    is_sale_enabled = data.get('is_sale_enabled', False)
    is_made_to_order = data.get('is_made_to_order', False)
    
    log.debug(f" process_hot_offer: is_hot_offer={is_hot_offer}, is_sale_enabled={is_sale_enabled}, is_made_to_order={is_made_to_order}, is_for_sale={is_for_sale}")
    
    # Цену (price_card/price_cash) запрашиваем для всех товаров, кроме is_for_sale (покупка у клиента — там свои поля).
    # Обычный товар, под заказ и C2C всегда проходят шаг цены — для карточки и на случай включения «Продажа» позже.
    if not is_for_sale:
        next_state = AddProduct.price_card
        log.debug(f"process_hot_offer: next state={next_state}")
        await state.set_state(next_state)
        await callback.message.answer("💳 Введите цену по карте (обязательно, это базовая цена товара):")
        await callback.answer()
        return
    
    # is_for_sale: товар для покупки у клиента — цену не запрашиваем здесь, переходим к описанию
    await state.update_data(discount=0.0)
    await state.set_state(AddProduct.description)
    await callback.message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    await callback.answer()


async def process_price_card(message: Message, state: FSMContext):
    """Обработка цены по карте (обязательно)"""
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        price_card = float(message.text)
        if price_card <= 0:
            await message.answer("❌ Цена должна быть больше 0. Введите цену по карте:")
            return
        await state.update_data(price_card=price_card)
        await state.set_state(AddProduct.price_cash)
        await message.answer("💵 Введите цену наличными (или отправьте /skip чтобы пропустить):")
    except ValueError:
        await message.answer("❌ Пожалуйста, введите число (например, 1000).")


async def process_price_cash(message: Message, state: FSMContext):
    """Обработка цены наличными (опционально)"""
    # Если пользователь отправил команду (кроме /skip) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text != "/skip") or is_menu_button(message.text or ""):
        return

    # Пропуск цены наличными
    if message.text == "/skip":
        await state.update_data(price_cash=None)
        # Переходим к скидке (убрали шаг price_old)
        await state.set_state(AddProduct.discount)
        await message.answer("💯 Введите скидку на товар в % (от 0 до 90, или отправьте /skip чтобы пропустить):")
        return
    
    try:
        price_cash = float(message.text)
        if price_cash <= 0:
            await message.answer("❌ Цена должна быть больше 0. Введите цену наличными или /skip:")
            return
        
        # Проверяем, что цена наличными меньше цены по карте (предупреждение)
        data = await state.get_data()
        price_card = data.get('price_card')
        if price_card and price_cash >= price_card:
            await message.answer(
                "⚠️ Цена наличными обычно меньше цены по карте.\n"
                "Если это правильно, отправьте /skip чтобы пропустить, или введите меньшую цену:"
            )
            return
        
        await state.update_data(price_cash=price_cash)
        # Переходим к скидке (убрали шаг price_old)
        await state.set_state(AddProduct.discount)
        await message.answer("💯 Введите скидку на товар в % (от 0 до 90, или отправьте /skip чтобы пропустить):")
    except ValueError:
        await message.answer("❌ Пожалуйста, введите число (например, 1000) или /skip чтобы пропустить.")


async def process_price_old(message: Message, state: FSMContext):
    """Обработка старой цены (опционально) - УДАЛЕНО из flow, оставлено только для обратной совместимости"""
    # Этот обработчик больше не используется в новом flow
    # Оставлен для обратной совместимости, если где-то остались ссылки
    # В новом flow после price_cash сразу идет discount
    pass


async def process_discount(message: Message, state: FSMContext):
    """Обработка скидки"""
    log.debug(f" process_discount called: text={message.text}")
    
    # Если пользователь отправил команду (кроме /skip) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text != "/skip") or is_menu_button(message.text or ""):
        return
    
    # Пропуск скидки
    if message.text == "/skip":
        await state.update_data(discount=0.0)
        log.debug(f"process_discount: discount skipped, set to 0")
    else:
        try:
            discount = float(message.text)
            if discount < 0:
                await message.answer("❌ Скидка не может быть отрицательной. Введите число от 0 до 90:")
                return
            if discount > 90:
                await message.answer("❌ Скидка не может быть больше 90%. Введите число от 0 до 90:")
                return
            await state.update_data(discount=discount)
            log.debug(f"process_discount: discount set to {discount}")
        except ValueError:
            await message.answer("❌ Пожалуйста, введите число от 0 до 90 (например, 10 или 0) или /skip чтобы пропустить.")
            return
    
    # После discount переходим к quantity_unit (для обычных товаров и C2C) или description (для под заказ)
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    is_client_sale = data.get('is_client_sale', False)
    is_made_to_order = data.get('is_made_to_order', False)
    
    log.debug(f" process_discount: is_for_sale={is_for_sale}, is_client_sale={is_client_sale}, is_made_to_order={is_made_to_order}")
    
    if is_for_sale:
        # Для товаров для покупки discount не используется, но мы уже установили его в 0
        # Переходим к description
        next_state = AddProduct.description
        log.debug(f"process_discount: next state for is_for_sale={next_state}")
        await state.set_state(next_state)
        await message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    elif is_made_to_order:
        # Для товаров под заказ пропускаем quantity_unit и quantity, переходим к description
        next_state = AddProduct.description
        log.debug(f"process_discount: next state for is_made_to_order={next_state}")
        await state.set_state(next_state)
        await message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    else:
        # Для обычных товаров и C2C переходим к quantity_unit
        next_state = AddProduct.quantity_unit
        log.debug(f"process_discount: next state for regular/C2C={next_state}")
        await state.set_state(next_state)
        
        # Проверяем, что state установлен
        verify_state = await state.get_state()
        log.debug(f"sending quantity_unit keyboard, state={verify_state}")
        
        # Создаем кнопки для выбора единицы измерения
        # ВАЖНО: callback_data должен быть в формате "unit_<значение>", где значение - русское название
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_шт")
        builder.button(text="кг", callback_data="unit_кг")
        builder.button(text="г", callback_data="unit_г")
        builder.button(text="л", callback_data="unit_л")
        builder.button(text="мл", callback_data="unit_мл")
        builder.button(text="м", callback_data="unit_м")
        builder.button(text="см", callback_data="unit_см")
        builder.button(text="м²", callback_data="unit_м²")
        builder.button(text="м³", callback_data="unit_м³")
        builder.button(text="упак", callback_data="unit_упак")
        builder.button(text="набор", callback_data="unit_набор")
        builder.button(text="пара", callback_data="unit_пара")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("📏 Выберите единицу измерения:", reply_markup=builder.as_markup())
        log.debug(f"quantity_unit keyboard sent successfully")


async def process_description(message: Message, state: FSMContext):
    """Обработка описания. После описания → характеристики → фото."""
    if (is_command(message.text or "") and message.text != "/skip") or is_menu_button(message.text or ""):
        return

    description = message.text if message.text != "/skip" else None
    await state.update_data(description=description)
    data = await state.get_data()

    # Пришли из «пропуск фото»: сразу создаём товар (0 фото), без перехода к фото/единицам
    if data.get("skip_photos_before_description"):
        await _create_product_from_state(message, state, [])
        return

    is_for_sale = data.get('is_for_sale', False)
    is_client_sale = data.get('is_client_sale', False)
    is_made_to_order = data.get('is_made_to_order', False)

    # Для товаров для покупки, C2C и под заказ устанавливаем quantity/quantity_unit по умолчанию
    if is_for_sale:
        await state.update_data(quantity=0)
    elif is_client_sale:
        pass  # quantity_unit, quantity уже были введены ранее
    elif is_made_to_order:
        await state.update_data(quantity=0, quantity_unit="шт")

    # ШАГ ДОСТАВКИ: после описания спрашиваем "Указать доставку для товара?"
    # Пропустить → характеристики; Да → срок доставки → стоимость доставки → характеристики
    await state.update_data(delivery_time=None, delivery_price=None)
    await state.set_state(AddProduct.ask_delivery)
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Да", callback_data="delivery_yes")
    builder.button(text="⏭ Пропустить", callback_data="delivery_skip")
    builder.adjust(2)
    await message.answer(
        "Указать доставку для товара?",
        reply_markup=builder.as_markup()
    )


# ========== Обработчики доставки (после описания, перед характеристиками) ==========

async def process_ask_delivery(callback: CallbackQuery, state: FSMContext):
    """Обработка выбора: указать доставку или пропустить"""
    if callback.data == "delivery_skip":
        await state.update_data(delivery_time=None, delivery_price=None)
        await state.set_state(AddProduct.ask_features)
        builder = InlineKeyboardBuilder()
        builder.button(text="✅ Да", callback_data="features_yes")
        builder.button(text="⏭ Пропустить", callback_data="features_skip")
        builder.adjust(2)
        await callback.message.answer(
            "Хотите добавить характеристики? (например: Размер, Материал, Цвет)\n\n"
            "Вы сможете выбрать из уже использованных названий или ввести новое.",
            reply_markup=builder.as_markup()
        )
    elif callback.data == "delivery_yes":
        await state.set_state(AddProduct.delivery_time_input)
        await callback.message.answer(
            "Введите срок доставки (например: 1–2 дня, сегодня, 3-5 дней, по договорённости):"
        )
    await callback.answer()


async def process_delivery_time(message: Message, state: FSMContext):
    """Обработка ввода срока доставки"""
    if (is_command(message.text or "") or is_menu_button(message.text or "")):
        return
    text = (message.text or "").strip()
    if not text:
        await message.answer("Введите непустой срок доставки (например: 1–2 дня):")
        return
    await state.update_data(delivery_time=text)
    await state.set_state(AddProduct.delivery_price_input)
    await message.answer("Введите стоимость доставки (число, можно 0):")


async def process_delivery_price(message: Message, state: FSMContext):
    """Обработка ввода стоимости доставки"""
    if (is_command(message.text or "") or is_menu_button(message.text or "")):
        return
    text = (message.text or "").strip()
    try:
        val = float(text.replace(",", "."))
        if val < 0:
            await message.answer("Введите неотрицательное число (например: 249 или 0):")
            return
        await state.update_data(delivery_price=val)
        await state.set_state(AddProduct.ask_features)
        builder = InlineKeyboardBuilder()
        builder.button(text="✅ Да", callback_data="features_yes")
        builder.button(text="⏭ Пропустить", callback_data="features_skip")
        builder.adjust(2)
        await message.answer(
            "Хотите добавить характеристики? (например: Размер, Материал, Цвет)\n\n"
            "Вы сможете выбрать из уже использованных названий или ввести новое.",
            reply_markup=builder.as_markup()
        )
    except ValueError:
        await message.answer("Введите число (например: 249 или 0):")


# ========== Обработчики характеристик (после описания/доставки, перед фото) ==========


# ========== Обработчики характеристик (после описания, перед фото) ==========

async def process_ask_features(callback: CallbackQuery, state: FSMContext):
    """Обработка выбора: добавить характеристики или пропустить"""
    if callback.data == "features_skip":
        await _go_to_photos_or_next(callback, state)
    elif callback.data == "features_yes":
        await _show_feature_name_choose(callback.message, state, page=0)
    await callback.answer()


async def _show_feature_name_choose(msg, state: FSMContext, page: int = 0):
    """Показать меню выбора названия характеристики (с пагинацией)"""
    data = await state.get_data()
    user_id = data.get('user_id')
    bot_id = data.get('bot_id')  # может быть None
    names = await fetch_characteristic_names(user_id, bot_id)
    total = len(names)
    start = page * FEATURE_NAMES_PAGE_SIZE
    end = start + FEATURE_NAMES_PAGE_SIZE
    page_names = names[start:end]
    has_prev = page > 0
    has_next = end < total

    builder = InlineKeyboardBuilder()
    # Используем индекс в callback_data (ограничение 64 байта) — индекс в полном списке names
    for i, name in enumerate(page_names):
        builder.button(text=name, callback_data=f"feature_pick_idx:{start + i}")
    builder.button(text="✍️ Ввести новое название", callback_data="feature_new_name")
    if has_prev or has_next:
        row = []
        if has_prev:
            row.append(types.InlineKeyboardButton(text="⏪", callback_data="feature_names_prev"))
        if has_next:
            row.append(types.InlineKeyboardButton(text="⏩", callback_data="feature_names_next"))
        builder.row(*row)
    builder.adjust(1)

    await state.set_state(AddProduct.feature_name_choose)
    await state.update_data(feature_names_page=page)
    text = "Выберите название характеристики или введите новое:"
    await msg.answer(text, reply_markup=builder.as_markup())


async def process_feature_name_choose(callback: CallbackQuery, state: FSMContext):
    """Обработка выбора названия характеристики из списка или ввод нового"""
    if callback.data == "feature_new_name":
        await state.set_state(AddProduct.feature_name_manual)
        await callback.message.answer("✍️ Введите название характеристики (например: Размер, Материал, Цвет):")
    elif callback.data == "feature_names_prev":
        data = await state.get_data()
        page = max(0, data.get('feature_names_page', 0) - 1)
        await _show_feature_name_choose(callback.message, state, page=page)
    elif callback.data == "feature_names_next":
        data = await state.get_data()
        page = data.get('feature_names_page', 0) + 1
        await _show_feature_name_choose(callback.message, state, page=page)
    elif callback.data.startswith("feature_pick_idx:"):
        try:
            idx = int(callback.data.replace("feature_pick_idx:", ""))
            data = await state.get_data()
            names = await fetch_characteristic_names(data.get('user_id'), data.get('bot_id'))
            if 0 <= idx < len(names):
                name = names[idx]
                await state.update_data(selected_feature_name=name)
                await state.set_state(AddProduct.feature_value)
                await callback.message.answer(f"Введите значение для «{name}»:")
        except (ValueError, IndexError):
            pass
    await callback.answer()


async def process_feature_name_manual(message: Message, state: FSMContext):
    """Обработка ввода нового названия характеристики вручную"""
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    name = (message.text or "").strip()
    if not name:
        await message.answer("❌ Введите непустое название характеристики:")
        return
    await state.update_data(selected_feature_name=name)
    await state.set_state(AddProduct.feature_value)
    await message.answer(f"Введите значение для «{name}»:")


async def process_feature_value(message: Message, state: FSMContext):
    """Обработка ввода значения характеристики"""
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    value = (message.text or "").strip()
    if not value:
        await message.answer("❌ Введите непустое значение:")
        return
    data = await state.get_data()
    name = data.get('selected_feature_name', '').strip()
    if not name:
        await state.set_state(AddProduct.feature_name_choose)
        await _show_feature_name_choose(message, state, page=0)
        return
    chars = data.get('characteristics', [])
    chars.append({"name": name, "value": value})
    await state.update_data(characteristics=chars, selected_feature_name=None)
    await state.set_state(AddProduct.ask_more_features)
    builder = InlineKeyboardBuilder()
    builder.button(text="➕ Добавить ещё", callback_data="features_add_more")
    builder.button(text="➡️ Продолжить", callback_data="features_continue")
    builder.adjust(2)
    summary = ", ".join(f"{c['name']}: {c['value']}" for c in chars)
    await message.answer(
        f"✅ Добавлено: {name} = {value}\n\nВсего характеристик: {len(chars)}\n{summary}\n\nДобавить ещё?",
        reply_markup=builder.as_markup()
    )


async def process_ask_more_features(callback: CallbackQuery, state: FSMContext):
    """Обработка: добавить ещё характеристику или продолжить к фото"""
    if callback.data == "features_add_more":
        await state.update_data(feature_names_page=0)
        await _show_feature_name_choose(callback.message, state, page=0)
    elif callback.data == "features_continue":
        await _go_to_photos_or_next(callback, state)
    await callback.answer()


async def process_quantity(message: Message, state: FSMContext):
    """Обработка количества"""
    log.debug(f" process_quantity called: text={message.text}")
    
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        quantity = int(message.text)
        if quantity < 0:
            await message.answer("Количество не может быть отрицательным. Введите число (0 или больше):")
            return
        
        # Проверяем, есть ли уже единица измерения (для обычного товара)
        data = await state.get_data()
        if not data.get('quantity_unit'):
            # Если единица измерения не установлена (для товара под заказ), устанавливаем по умолчанию
            await state.update_data(quantity_unit="шт")
        
        await state.update_data(quantity=quantity)
        log.debug(f"process_quantity: quantity={quantity}")
        
        # Для обычного товара и C2C товара спрашиваем о показе количества
        is_made_to_order = data.get('is_made_to_order', False)
        is_client_sale = data.get('is_client_sale', False)
        log.debug(f"process_quantity: is_made_to_order={is_made_to_order}, is_client_sale={is_client_sale}")
        
        if not is_made_to_order:  # Для обычных и C2C товаров (у C2C is_made_to_order=False)
            next_state = AddProduct.quantity_show_enabled
            log.debug(f"process_quantity: next state={next_state}")
            await state.set_state(next_state)
            
            # Создаем кнопки для выбора показа количества
            builder = InlineKeyboardBuilder()
            builder.button(text="✅ Показывать", callback_data="quantity_show_yes")
            builder.button(text="❌ Не показывать", callback_data="quantity_show_no")
            builder.button(text="⚙️ Использовать настройку магазина", callback_data="quantity_show_default")
            builder.adjust(1)
            
            await message.answer(
                "Показывать количество товара на витрине?\n\n"
                "• <b>Показывать</b> - всегда показывать количество\n"
                "• <b>Не показывать</b> - скрыть количество\n"
                "• <b>Использовать настройку магазина</b> - использовать общую настройку",
                reply_markup=builder.as_markup(),
                parse_mode="HTML"
            )
        else:
            # Для товара под заказ пропускаем вопрос о показе количества
            next_state = AddProduct.photos
            log.debug(f"process_quantity: next state for made_to_order={next_state}")
            await state.update_data(quantity_show_enabled=None, photos=[])
            await state.set_state(next_state)
            await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    except ValueError:
        await message.answer("Пожалуйста, введите целое число (например, 10 или 0).")


async def process_photos(message: Message, state: FSMContext):
    """Обработка фото"""
    bot = get_bot()
    data = await state.get_data()
    photos_list = data.get('photos', [])
    
    log.debug("[PHOTOS] Received photo, current photos_list length=%s", len(photos_list))
    
    # Проверяем лимит (до 5 фото)
    if len(photos_list) >= 5:
        await message.answer("⚠️ Максимум 5 фото. Отправьте /done чтобы закончить добавление товара.")
        return
    
    photo = message.photo[-1]
    log.debug("[PHOTOS] Processing photo with file_id=%s", photo.file_id)
    
    # Сохраняем file_id и путь к файлу во временное хранилище
    # Добавляем повторные попытки при ошибках сети
    max_retries = 3
    retry_delay = 2  # секунды
    
    for attempt in range(max_retries):
        try:
            file_info = await bot.get_file(photo.file_id)
            file_ext = os.path.splitext(file_info.file_path)[1] or '.jpg'
            
            # Скачиваем во временный файл
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                tmp_path = tmp_file.name
                await bot.download_file(file_info.file_path, tmp_path)
            
            # ВАЖНО: снова получаем актуальное состояние, так как оно могло измениться
            data = await state.get_data()
            photos_list = data.get('photos', [])
            
            # Проверяем, не добавлено ли уже это фото (по file_id)
            if any(p.get('file_id') == photo.file_id for p in photos_list):
                logging.warning(f"[PHOTOS] Photo {photo.file_id} already in list, skipping")
                await message.answer(f"⚠️ Это фото уже добавлено. Отправьте другое фото или /done чтобы закончить.")
                return
            
            # Сохраняем путь к временному файлу
            photos_list.append({
                'file_id': photo.file_id,
                'tmp_path': tmp_path,
                'file_ext': file_ext
            })
            
            log.debug("[PHOTOS] Successfully added photo %s/5, file_id=%s", len(photos_list), photo.file_id)
            
            await state.update_data(photos=photos_list)
            
            # Проверяем, что фото действительно добавлено в состояние
            verify_data = await state.get_data()
            verify_photos = verify_data.get('photos', [])
            log.debug("[PHOTOS] Verified: photos in state after update: %s", len(verify_photos))
            
            remaining = 5 - len(photos_list)
            if remaining > 0:
                await message.answer(f"✅ Фото {len(photos_list)}/5 добавлено. Отправьте еще фото или /done чтобы закончить.")
            else:
                await message.answer("✅ Добавлено максимальное количество фото (5). Отправьте /done чтобы закончить.")
            break  # Успешно обработано, выходим из цикла
        except (TelegramNetworkError, aiohttp.client_exceptions.ClientConnectorError) as e:
            if attempt < max_retries - 1:
                logging.warning(f"Network error on attempt {attempt + 1}/{max_retries} for photo {len(photos_list)+1}, retrying in {retry_delay}s: {e}")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Увеличиваем задержку при каждой попытке
            else:
                logging.error(f"Exception in process_photos after {max_retries} attempts for photo {len(photos_list)+1}: {e}", exc_info=True)
                await message.answer(f"❌ Ошибка при обработке фото {len(photos_list)+1} после {max_retries} попыток. Попробуйте отправить фото еще раз.")
                # НЕ выходим из функции - пользователь может попробовать отправить фото снова
                return
        except Exception as e:
            logging.error(f"Exception in process_photos: {e}", exc_info=True)
            await message.answer(f"❌ Ошибка при обработке фото: {str(e)}")
            break  # Для других ошибок не повторяем


async def _create_product_from_state(message: Message, state: FSMContext, photos_list: list):
    """Создать товар из данных state и photos_list, отправить на бэкенд, очистить состояние, показать управление."""
    data = await state.get_data()
    user_id = data.get('user_id', message.from_user.id)
    API_URL = get_api_url()
    log.debug("Sending product data to %s/products/ with %s photos", API_URL, len(photos_list))
    try:
        async with aiohttp.ClientSession() as session:
            form_data = aiohttp.FormData()
            form_data.add_field('name', data['name'])
            if data.get('is_for_sale'):
                if data.get('price_type') == 'fixed' and data.get('price_fixed'):
                    form_data.add_field('price', str(data['price_fixed']))
                elif data.get('price_from'):
                    form_data.add_field('price', str(data['price_from']))
                else:
                    form_data.add_field('price', '0')
            form_data.add_field('category_id', str(data['category_id']))
            form_data.add_field('user_id', str(user_id))
            form_data.add_field('discount', str(data.get('discount', 0)))
            form_data.add_field('quantity', str(data.get('quantity', 0)))
            form_data.add_field('is_hot_offer', str(data.get('is_hot_offer', False)).lower())
            form_data.add_field('is_made_to_order', str(data.get('is_made_to_order', False)).lower())
            form_data.add_field('is_for_sale', str(data.get('is_for_sale', False)).lower())
            is_client_sale = data.get('is_client_sale', False)
            if is_client_sale:
                form_data.add_field('is_client_sale', 'true')
                form_data.add_field('is_sale_enabled', 'true')
            else:
                if data.get('is_sale_enabled', False):
                    form_data.add_field('is_sale_enabled', 'true')
            qs = data.get('quantity_show_enabled')
            if qs is not None:
                form_data.add_field('quantity_show_enabled', str(qs).lower())
            if data.get('description'):
                form_data.add_field('description', data['description'])
            if data.get('delivery_time') is not None:
                form_data.add_field('delivery_time', data['delivery_time'])
            if data.get('delivery_price') is not None:
                form_data.add_field('delivery_price', str(data['delivery_price']))
            # Характеристики товара (JSON)
            chars = data.get('characteristics', [])
            if chars and isinstance(chars, list):
                form_data.add_field('characteristics', json.dumps(chars, ensure_ascii=False))
            if data.get('is_for_sale'):
                if data.get('price_type'):
                    form_data.add_field('price_type', data['price_type'])
                if data.get('price_from') is not None:
                    form_data.add_field('price_from', str(data['price_from']))
                if data.get('price_to') is not None:
                    form_data.add_field('price_to', str(data['price_to']))
                if data.get('price_fixed') is not None:
                    form_data.add_field('price_fixed', str(data['price_fixed']))
                if data.get('quantity_from') is not None:
                    form_data.add_field('quantity_from', str(data['quantity_from']))
                if data.get('quantity_unit'):
                    form_data.add_field('quantity_unit', data['quantity_unit'])
            # Цену отправляем для всех товаров, прошедших шаг price_card (не is_for_sale): обычный, под заказ, C2C
            if not data.get('is_for_sale'):
                if data.get('price_card') is not None:
                    form_data.add_field('price_card', str(data['price_card']))
                if data.get('price_cash') is not None:
                    form_data.add_field('price_cash', str(data['price_cash']))
            file_handles = []
            try:
                for idx, photo_data in enumerate(photos_list):
                    tmp_path = photo_data['tmp_path']
                    file_ext = photo_data['file_ext']
                    fh = open(tmp_path, 'rb')
                    file_handles.append(fh)
                    form_data.add_field(
                        'images', fh,
                        filename=f"product_{photo_data['file_id']}{file_ext}",
                        content_type='image/jpeg'
                    )
                async with session.post(f"{API_URL}/products/", data=form_data) as resp:
                    text = await resp.text()
                    log.debug("Backend response: status=%s, body=%s", resp.status, text[:200])
                    if resp.status == 200:
                        try:
                            result = json.loads(text)
                        except Exception:
                            result = {}
                        images_count = len(result.get('images_urls', []))
                        await message.answer(f"✅ Товар успешно добавлен!\n\n📷 Фото: {images_count} шт.")
                    else:
                        await message.answer(f"❌ Ошибка при сохранении (статус {resp.status}): {text[:200]}")
            finally:
                for fh in file_handles:
                    try:
                        fh.close()
                    except Exception:
                        pass
    except Exception as e:
        logging.error(f"Exception in _create_product_from_state: {e}", exc_info=True)
        await message.answer(f"❌ Ошибка при сохранении товара: {str(e)}")
    finally:
        for photo_data in photos_list:
            try:
                if os.path.exists(photo_data.get('tmp_path', '')):
                    os.unlink(photo_data['tmp_path'])
            except Exception:
                pass
        await state.clear()
        await cmd_manage(message, state)


async def process_photos_done(message: Message, state: FSMContext):
    """Завершение обработки фото"""
    if (is_command(message.text or "") and message.text not in ["/done", "/skip"]) or is_menu_button(message.text or ""):
        return

    if message.text != "/done" and message.text != "/skip":
        await message.answer("Отправьте фото товара, /done чтобы закончить, или /skip чтобы пропустить фото:")
        return

    data = await state.get_data()
    user_id = data.get('user_id', message.from_user.id)
    photos_list = data.get('photos', [])

    if message.text == "/skip" and len(photos_list) == 0:
        # Описание уже запрашивали до фото у «под заказ», «покупка у клиента» и C2C — сразу создаём товар
        if data.get('is_for_sale') or data.get('is_made_to_order') or data.get('is_client_sale'):
            await _create_product_from_state(message, state, [])
            return
        await state.update_data(description=None, skip_photos_before_description=True)
        await state.set_state(AddProduct.description)
        await message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
        return

    log.debug(f" process_photos_done: photos_list length={len(photos_list)}")
    log.debug("Processing photos_done: photos_list length=%s", len(photos_list))
    await _create_product_from_state(message, state, photos_list)


async def delete_product_start(message: Message, state: FSMContext):
    """Начало удаления товара"""
    # Сбрасываем состояние FSM при использовании этой кнопки
    await clear_state_if_needed(message, state)
    user_id = message.from_user.id
    API_URL = get_api_url()
    
    # Получаем список товаров пользователя
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/products/", params={"user_id": user_id}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении списка товаров")
            products = await resp.json()
    
    if not products:
        return await message.answer("У вас пока нет товаров для удаления.")
    
    # Показываем список товаров с кнопками для удаления
    text = "🗑️ Выберите товар для удаления:\n\n"
    builder = InlineKeyboardBuilder()
    
    for prod in products:
        price_text = f"{prod['price']} ₽"
        if prod.get('discount', 0) > 0:
            final_price = prod['price'] * (1 - prod['discount'] / 100)
            price_text = f"{prod['price']} ₽ → {final_price:.0f} ₽ (-{prod['discount']}%)"
        
        builder.button(
            text=f"❌ {prod['name']} ({price_text})",
            callback_data=f"del_product_{prod['id']}"
        )
    
    builder.adjust(1)
    await message.answer(text, reply_markup=builder.as_markup())


async def delete_product_confirm(callback: CallbackQuery):
    """Подтверждение удаления товара"""
    product_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    API_URL = get_api_url()
    
    # Удаляем товар через API
    async with aiohttp.ClientSession() as session:
        async with session.delete(
            f"{API_URL}/products/{product_id}",
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.answer("✅ Товар удален!", show_alert=True)
                await callback.message.delete()
                await _cmd_manage_impl(callback.message)
            elif resp.status == 404:
                await callback.answer("❌ Товар не найден", show_alert=True)
            else:
                error_text = await resp.text()
                await callback.answer(f"❌ Ошибка: {error_text}", show_alert=True)

