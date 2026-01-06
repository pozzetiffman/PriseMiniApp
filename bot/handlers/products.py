"""
Обработчики для управления товарами
"""
import asyncio
import os
import logging
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
    builder.button(text="💰 Для покупки", callback_data="product_type_for_sale")
    builder.adjust(1)
    
    await message.answer(
        "Выберите тип товара:\n\n"
        "📦 <b>Обычный товар</b> - товар с фиксированной ценой\n"
        "📝 <b>Под заказ</b> - товар, который изготавливается по заказу\n"
        "💰 <b>Для покупки</b> - товар, который вы хотите купить (с диапазоном цен)",
        reply_markup=builder.as_markup(),
        parse_mode="HTML"
    )


async def process_product_type(callback: CallbackQuery, state: FSMContext):
    """Обработка типа товара"""
    product_type = callback.data.replace("product_type_", "")
    
    if product_type == "regular":
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=False
        )
        await state.set_state(AddProduct.price)
        await callback.message.answer("Введите цену товара (число):")
    elif product_type == "made_to_order":
        await state.update_data(
            is_made_to_order=True,
            is_for_sale=False
        )
        await state.set_state(AddProduct.price)
        await callback.message.answer("Введите цену товара (число):")
    elif product_type == "for_sale":
        await state.update_data(
            is_made_to_order=False,
            is_for_sale=True
        )
        await state.set_state(AddProduct.price_type)
        
        # Создаем кнопки для выбора типа цены
        builder = InlineKeyboardBuilder()
        builder.button(text="📊 Диапазон цен (от-до)", callback_data="price_type_range")
        builder.button(text="💰 Фиксированная цена", callback_data="price_type_fixed")
        builder.adjust(1)
        
        await callback.message.answer(
            "Выберите тип цены для товара:\n\n"
            "📊 <b>Диапазон цен</b> - укажите цену от и до\n"
            "💰 <b>Фиксированная цена</b> - укажите одну цену",
            reply_markup=builder.as_markup(),
            parse_mode="HTML"
        )
    
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
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_pcs")
        builder.button(text="кг", callback_data="unit_kg")
        builder.button(text="г", callback_data="unit_g")
        builder.button(text="л", callback_data="unit_l")
        builder.button(text="мл", callback_data="unit_ml")
        builder.button(text="м", callback_data="unit_m")
        builder.button(text="см", callback_data="unit_cm")
        builder.button(text="м²", callback_data="unit_m2")
        builder.button(text="м³", callback_data="unit_m3")
        builder.button(text="упак", callback_data="unit_pack")
        builder.button(text="набор", callback_data="unit_set")
        builder.button(text="пара", callback_data="unit_pair")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("Выберите единицу измерения:", reply_markup=builder.as_markup())
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
        builder = InlineKeyboardBuilder()
        builder.button(text="шт", callback_data="unit_pcs")
        builder.button(text="кг", callback_data="unit_kg")
        builder.button(text="г", callback_data="unit_g")
        builder.button(text="л", callback_data="unit_l")
        builder.button(text="мл", callback_data="unit_ml")
        builder.button(text="м", callback_data="unit_m")
        builder.button(text="см", callback_data="unit_cm")
        builder.button(text="м²", callback_data="unit_m2")
        builder.button(text="м³", callback_data="unit_m3")
        builder.button(text="упак", callback_data="unit_pack")
        builder.button(text="набор", callback_data="unit_set")
        builder.button(text="пара", callback_data="unit_pair")
        builder.adjust(3)  # По 3 кнопки в ряд
        
        await message.answer("Выберите единицу измерения:", reply_markup=builder.as_markup())
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
    unit = callback.data.replace("unit_", "")
    
    # Маппинг единиц измерения
    unit_map = {
        "pcs": "шт",
        "kg": "кг",
        "g": "г",
        "l": "л",
        "ml": "мл",
        "m": "м",
        "cm": "см",
        "m2": "м²",
        "m3": "м³",
        "pack": "упак",
        "set": "набор",
        "pair": "пара"
    }
    
    quantity_unit = unit_map.get(unit, "шт")  # По умолчанию "шт"
    await state.update_data(quantity_unit=quantity_unit)
    
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товара для покупки переходим к вводу количества ОТ
        await state.set_state(AddProduct.quantity_from)
        await callback.message.answer("Введите количество ОТ (число, например: 1):")
    else:
        # Для обычного товара переходим к вводу количества на складе
        await state.set_state(AddProduct.quantity)
        await callback.message.answer("Введите количество товара на складе:")
    
    await callback.answer()


async def process_quantity_show_enabled(callback: CallbackQuery, state: FSMContext):
    """Обработка показа количества"""
    show_type = callback.data.replace("quantity_show_", "")
    
    if show_type == "yes":
        quantity_show_enabled = True
    elif show_type == "no":
        quantity_show_enabled = False
    else:  # default
        quantity_show_enabled = None
    
    await state.update_data(quantity_show_enabled=quantity_show_enabled)
    
    # Проверяем тип товара
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товара для покупки переходим к выбору категории
        await show_category_selection(callback, state)
    else:
        # Для обычного товара переходим к загрузке фото
        await state.update_data(photos=[])
        await state.set_state(AddProduct.photos)
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
            
        # Получаем все категории в плоском виде (включая подкатегории)
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "true"}) as resp:
                if resp.status != 200:
                    return await message.answer("❌ Ошибка при получении списка категорий")
                all_categories = await resp.json()
        
        if not all_categories:
            return await message.answer("❌ Нет категорий. Сначала создайте категорию!")
        
        # Получаем иерархию для отображения
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
                if resp.status != 200:
                    return await message.answer("❌ Ошибка при получении списка категорий")
                main_categories = await resp.json()
        
        # Создаем словарь для быстрого поиска родительских категорий
        parent_map = {}
        for main_cat in main_categories:
            if main_cat.get('subcategories'):
                for subcat in main_cat['subcategories']:
                    parent_map[subcat['id']] = main_cat['name']
        
        builder = InlineKeyboardBuilder()
        for cat in all_categories:
            # Если это подкатегория, показываем с указанием родительской
            if cat.get('parent_id'):
                parent_name = parent_map.get(cat['id'], '')
                display_name = f"{parent_name} → {cat['name']}"
            else:
                display_name = cat['name']
            builder.button(text=display_name, callback_data=f"cat_{cat['id']}")
        builder.adjust(1)
        
        await state.set_state(AddProduct.category)
        await message.answer("Выберите категорию или подкатегорию:", reply_markup=builder.as_markup())
    except ValueError:
        await message.answer("Пожалуйста, введите число.")


async def process_category(callback: CallbackQuery, state: FSMContext):
    """Обработка категории"""
    cat_id = int(callback.data.split("_")[1])
    await state.update_data(category_id=cat_id)
    await state.set_state(AddProduct.is_hot_offer)
    
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
    is_hot_offer = callback.data == "hot_offer_yes"
    await state.update_data(is_hot_offer=is_hot_offer)
    
    # Проверяем, является ли товар для покупки
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товаров для покупки пропускаем вопрос о скидке
        await state.update_data(discount=0.0)  # Устанавливаем 0 по умолчанию
        await state.set_state(AddProduct.description)
        await callback.message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    else:
        # Для обычных товаров и товаров под заказ спрашиваем скидку
        await state.set_state(AddProduct.discount)
        await callback.message.answer("Введите скидку на товар в % (если нет, введите 0):")
    
    await callback.answer()


async def process_discount(message: Message, state: FSMContext):
    """Обработка скидки"""
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    try:
        discount = float(message.text)
        await state.update_data(discount=discount)
        await state.set_state(AddProduct.description)
        await message.answer("Введите описание товара (или отправьте /skip чтобы пропустить):")
    except ValueError:
        await message.answer("Пожалуйста, введите число (например, 10 или 0).")


async def process_description(message: Message, state: FSMContext):
    """Обработка описания"""
    # Если пользователь отправил команду (кроме /skip) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text != "/skip") or is_menu_button(message.text or ""):
        return
    
    description = message.text if message.text != "/skip" else None
    await state.update_data(description=description)
    
    # Проверяем, является ли товар для покупки
    data = await state.get_data()
    is_for_sale = data.get('is_for_sale', False)
    
    if is_for_sale:
        # Для товаров для покупки пропускаем вопрос о количестве на складе
        await state.update_data(quantity=0)  # Устанавливаем 0 по умолчанию
        await state.set_state(AddProduct.photos)
        await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    else:
        # Для обычных товаров и товаров под заказ
        data = await state.get_data()
        is_made_to_order = data.get('is_made_to_order', False)
        
        if is_made_to_order:
            # Для товара под заказ пропускаем вопрос о количестве на складе
            await state.update_data(quantity=0, quantity_unit="шт")  # Устанавливаем 0 и "шт" по умолчанию
            await state.set_state(AddProduct.photos)
            await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
        else:
            # Для обычного товара сначала выбираем единицу измерения
            await state.set_state(AddProduct.quantity_unit)
            
            # Создаем кнопки для выбора единицы измерения (все доступные единицы)
            builder = InlineKeyboardBuilder()
            builder.button(text="шт", callback_data="unit_pcs")
            builder.button(text="кг", callback_data="unit_kg")
            builder.button(text="г", callback_data="unit_g")
            builder.button(text="л", callback_data="unit_l")
            builder.button(text="мл", callback_data="unit_ml")
            builder.button(text="м", callback_data="unit_m")
            builder.button(text="см", callback_data="unit_cm")
            builder.button(text="м²", callback_data="unit_m2")
            builder.button(text="м³", callback_data="unit_m3")
            builder.button(text="упак", callback_data="unit_pack")
            builder.button(text="набор", callback_data="unit_set")
            builder.button(text="пара", callback_data="unit_pair")
            builder.adjust(3)  # По 3 кнопки в ряд
            
            await message.answer("Выберите единицу измерения:", reply_markup=builder.as_markup())


async def process_quantity(message: Message, state: FSMContext):
    """Обработка количества"""
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
        
        # Для обычного товара спрашиваем о показе количества
        is_made_to_order = data.get('is_made_to_order', False)
        if not is_made_to_order:
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
        else:
            # Для товара под заказ пропускаем вопрос о показе количества
            await state.update_data(quantity_show_enabled=None, photos=[])
            await state.set_state(AddProduct.photos)
            await message.answer("Отправьте фото товара (можно до 5 фото). После каждого фото напишите /done чтобы закончить, или /skip чтобы пропустить фото:")
    except ValueError:
        await message.answer("Пожалуйста, введите целое число (например, 10 или 0).")


async def process_photos(message: Message, state: FSMContext):
    """Обработка фото"""
    bot = get_bot()
    data = await state.get_data()
    photos_list = data.get('photos', [])
    
    logging.info(f"[PHOTOS] Received photo, current photos_list length: {len(photos_list)}")
    
    # Проверяем лимит (до 5 фото)
    if len(photos_list) >= 5:
        await message.answer("⚠️ Максимум 5 фото. Отправьте /done чтобы закончить добавление товара.")
        return
    
    photo = message.photo[-1]
    logging.info(f"[PHOTOS] Processing photo with file_id: {photo.file_id}")
    
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
            
            logging.info(f"[PHOTOS] Successfully added photo {len(photos_list)}/5, file_id: {photo.file_id}, tmp_path: {tmp_path}")
            
            await state.update_data(photos=photos_list)
            
            # Проверяем, что фото действительно добавлено в состояние
            verify_data = await state.get_data()
            verify_photos = verify_data.get('photos', [])
            logging.info(f"[PHOTOS] Verified: photos in state after update: {len(verify_photos)}")
            
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


async def process_photos_done(message: Message, state: FSMContext):
    """Завершение обработки фото"""
    # Если пользователь отправил команду (кроме /done и /skip) или кнопку меню, не обрабатываем её здесь
    if (is_command(message.text or "") and message.text not in ["/done", "/skip"]) or is_menu_button(message.text or ""):
        return
    
    if message.text == "/done" or message.text == "/skip":
        data = await state.get_data()
        user_id = data.get('user_id', message.from_user.id)
        photos_list = data.get('photos', [])
        API_URL = get_api_url()
        
        logging.info(f"Processing photos_done: photos_list length={len(photos_list)}")
        for idx, photo_data in enumerate(photos_list):
            logging.info(f"Photo {idx+1}: file_id={photo_data.get('file_id')}, tmp_path={photo_data.get('tmp_path')}, exists={os.path.exists(photo_data.get('tmp_path', ''))}")
        
        try:
            # Отправляем данные на бэкенд
            # Используем FormData для правильной отправки множественных файлов
            logging.info(f"Sending product data to {API_URL}/products/ with {len(photos_list)} photos")
            try:
                async with aiohttp.ClientSession() as session:
                    # Создаем FormData для правильной отправки множественных файлов
                    # FormData правильно обрабатывает множественные файлы с одним именем поля для FastAPI
                    form_data = aiohttp.FormData()
                    
                    # Добавляем все текстовые поля
                    form_data.add_field('name', data['name'])
                    
                    # Для товаров для покупки price может быть не установлен
                    # Используем price_from или price_fixed как базовую цену для отображения
                    if data.get('is_for_sale'):
                        if data.get('price_type') == 'fixed' and data.get('price_fixed'):
                            form_data.add_field('price', str(data['price_fixed']))
                        elif data.get('price_from'):
                            form_data.add_field('price', str(data['price_from']))
                        else:
                            form_data.add_field('price', '0')
                    else:
                        form_data.add_field('price', str(data.get('price', 0)))
                    
                    form_data.add_field('category_id', str(data['category_id']))
                    form_data.add_field('user_id', str(user_id))
                    form_data.add_field('discount', str(data.get('discount', 0)))
                    form_data.add_field('quantity', str(data.get('quantity', 0)))
                    form_data.add_field('is_hot_offer', str(data.get('is_hot_offer', False)).lower())
                    form_data.add_field('is_made_to_order', str(data.get('is_made_to_order', False)).lower())
                    form_data.add_field('is_for_sale', str(data.get('is_for_sale', False)).lower())
                    
                    # Поле для показа количества (может быть None, True или False)
                    quantity_show_enabled = data.get('quantity_show_enabled')
                    if quantity_show_enabled is not None:
                        form_data.add_field('quantity_show_enabled', str(quantity_show_enabled).lower())
                    
                    if data.get('description'):
                        form_data.add_field('description', data['description'])
                    
                    # Поля для товаров для покупки
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
                    
                    # Добавляем все файлы с одним именем поля 'images'
                    # ВАЖНО: FormData позволяет добавлять несколько файлов с одним именем поля
                    # FastAPI соберет их в список при использовании List[UploadFile]
                    file_handles = []
                    try:
                        for idx, photo_data in enumerate(photos_list):
                            tmp_path = photo_data['tmp_path']
                            file_ext = photo_data['file_ext']
                            
                            # Открываем файл для чтения (остается открытым до отправки)
                            file_handle = open(tmp_path, 'rb')
                            file_handles.append(file_handle)
                            
                            # Добавляем файл в FormData с одним именем поля 'images'
                            # Все файлы с именем 'images' будут собраны FastAPI в список
                            form_data.add_field(
                                'images',
                                file_handle,
                                filename=f"product_{photo_data['file_id']}{file_ext}",
                                content_type='image/jpeg'
                            )
                            logging.info(f"Added image {idx+1} to FormData: {tmp_path}")
                        
                        logging.info(f"Total images added to FormData: {len(photos_list)}")
                        
                        async with session.post(f"{API_URL}/products/", data=form_data) as resp:
                            response_text = await resp.text()
                            logging.info(f"Backend response: status={resp.status}, body={response_text[:500]}")
                            
                            if resp.status == 200:
                                result = await resp.json()
                                images_count = len(result.get('images_urls', []))
                                logging.info(f"Product created successfully: id={result.get('id')}, images_count={images_count}")
                                await message.answer(f"✅ Товар успешно добавлен!\n\n📷 Фото: {images_count} шт.")
                            else:
                                logging.error(f"Error creating product: status={resp.status}, error={response_text}")
                                await message.answer(f"❌ Ошибка при сохранении (статус {resp.status}): {response_text[:200]}")
                    finally:
                        # Закрываем все открытые файлы после отправки
                        for fh in file_handles:
                            try:
                                fh.close()
                            except:
                                pass
            except Exception as req_e:
                logging.error(f"Exception during request: {req_e}", exc_info=True)
                await message.answer(f"❌ Ошибка при отправке запроса: {str(req_e)}")
        except Exception as e:
            logging.error(f"Exception in process_photos_done: {e}", exc_info=True)
            await message.answer(f"❌ Ошибка при сохранении товара: {str(e)}")
        finally:
            # Удаляем временные файлы
            for photo_data in photos_list:
                try:
                    if os.path.exists(photo_data['tmp_path']):
                        os.unlink(photo_data['tmp_path'])
                except:
                    pass
            
            await state.clear()
            await cmd_manage(message, state)
    else:
        await message.answer("Отправьте фото товара, /done чтобы закончить, или /skip чтобы пропустить фото:")


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

