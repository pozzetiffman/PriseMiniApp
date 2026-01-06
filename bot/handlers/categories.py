"""
Обработчики для управления категориями
"""
import aiohttp
from collections import defaultdict
from aiogram import types
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder

# Lazy imports для утилит
try:
    from ..utils import clear_state_if_needed, is_command, is_menu_button
except ImportError:
    from utils import clear_state_if_needed, is_command, is_menu_button

# Импорт состояний FSM
try:
    from ..states import AddCategory, AddProduct
except ImportError:
    from states import AddCategory, AddProduct

# Lazy import для получения API_URL из bot.py
def get_api_url():
    """Получить API_URL из bot.py"""
    try:
        import __main__
        return __main__.API_URL
    except:
        return "http://localhost:8000/api"

# Lazy import для _cmd_manage_impl
try:
    from ..handlers.commands import _cmd_manage_impl
except ImportError:
    from handlers.commands import _cmd_manage_impl


async def start_add_category(message: Message, state: FSMContext):
    """Начало добавления категории"""
    # Проверяем и очищаем состояние, если пользователь был в процессе подключения бота
    await clear_state_if_needed(message, state)
    await state.update_data(user_id=message.from_user.id)
    await state.set_state(AddCategory.name)
    await message.answer("Введите название новой категории:", reply_markup=types.ReplyKeyboardRemove())


async def process_category_name(message: Message, state: FSMContext):
    """Обработка названия категории"""
    # Если пользователь отправил команду или кнопку меню, не обрабатываем её здесь (обработчик команды/кнопки сбросит состояние)
    if is_command(message.text or "") or is_menu_button(message.text or ""):
        return
    
    data = await state.get_data()
    user_id = data.get('user_id', message.from_user.id)
    category_name = message.text.strip()
    
    # Сохраняем название категории
    await state.update_data(category_name=category_name)
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    # Получаем список основных категорий для выбора родительской
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        # Нет категорий - создаем основную категорию
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/categories/",
                json={"name": category_name, "parent_id": None},
                params={"user_id": user_id}
            ) as resp:
                if resp.status == 200:
                    await message.answer(f"✅ Категория '{category_name}' создана!")
                else:
                    await message.answer(f"❌ Ошибка: {await resp.text()}")
        await state.clear()
        # Вызываем _cmd_manage_impl для показа меню управления
        await _cmd_manage_impl(message)
        return
    
    # Есть категории - спрашиваем, основная это категория или подкатегория
    builder = InlineKeyboardBuilder()
    builder.button(text="📁 Основная категория", callback_data="cat_main")
    builder.button(text="📂 Подкатегория", callback_data="cat_sub")
    builder.adjust(1)
    
    await state.set_state(AddCategory.parent_choice)
    await message.answer(
        f"Категория '{category_name}'\n\n"
        "Выберите тип категории:",
        reply_markup=builder.as_markup()
    )


async def create_main_category(callback: CallbackQuery, state: FSMContext):
    """Создание основной категории"""
    data = await state.get_data()
    user_id = data.get('user_id', callback.from_user.id)
    category_name = data.get('category_name')
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{API_URL}/categories/",
            json={"name": category_name, "parent_id": None},
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.message.answer(f"✅ Основная категория '{category_name}' создана!")
            else:
                error_text = await resp.text()
                await callback.message.answer(f"❌ Ошибка: {error_text}")
    
    await callback.answer()
    await state.clear()
    # Вызываем _cmd_manage_impl для показа меню управления
    await _cmd_manage_impl(callback.message)


async def choose_parent_category(callback: CallbackQuery, state: FSMContext):
    """Выбор родительской категории для подкатегории"""
    data = await state.get_data()
    user_id = data.get('user_id', callback.from_user.id)
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    # Получаем список основных категорий
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                return await callback.message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        await callback.answer("❌ Сначала создайте основную категорию!", show_alert=True)
        await state.clear()
        # Вызываем _cmd_manage_impl для показа меню управления
        await _cmd_manage_impl(callback.message)
        return
    
    # Показываем список основных категорий для выбора родительской
    builder = InlineKeyboardBuilder()
    for cat in main_categories:
        builder.button(text=cat['name'], callback_data=f"parent_{cat['id']}")
    builder.adjust(1)
    
    await callback.message.answer(
        "Выберите основную категорию, к которой будет относиться подкатегория:",
        reply_markup=builder.as_markup()
    )
    await callback.answer()


async def create_subcategory(callback: CallbackQuery, state: FSMContext):
    """Создание подкатегории"""
    parent_id = int(callback.data.split("_")[1])
    data = await state.get_data()
    user_id = data.get('user_id', callback.from_user.id)
    category_name = data.get('category_name')
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{API_URL}/categories/",
            json={"name": category_name, "parent_id": parent_id},
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                await callback.message.answer(f"✅ Подкатегория '{category_name}' создана!")
            else:
                error_text = await resp.text()
                await callback.message.answer(f"❌ Ошибка: {error_text}")
    
    await callback.answer()
    await state.clear()
    # Вызываем _cmd_manage_impl для показа меню управления
    await _cmd_manage_impl(callback.message)


async def list_categories(message: Message, state: FSMContext):
    """Список категорий с возможностью удаления"""
    # Сбрасываем состояние FSM при использовании этой кнопки
    await clear_state_if_needed(message, state)
    user_id = message.from_user.id
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                return await message.answer("❌ Ошибка при получении списка категорий")
            main_categories = await resp.json()
    
    if not main_categories:
        return await message.answer("Список категорий пуст. Создайте первую категорию!")
    
    # Получаем все категории в плоском виде для подсчета товаров
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "true"}) as resp:
            all_categories_flat = await resp.json() if resp.status == 200 else []
    
    # Получаем количество товаров в каждой категории для предупреждения
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/products/", params={"user_id": user_id}) as resp:
            products = await resp.json() if resp.status == 200 else []
    
    # Подсчитываем товары по категориям
    products_by_category = defaultdict(int)
    for prod in products:
        products_by_category[prod.get('category_id')] += 1
    
    text = "📁 Ваши категории:\n\n"
    builder = InlineKeyboardBuilder()
    
    for main_cat in main_categories:
        products_count = products_by_category.get(main_cat['id'], 0)
        text += f"📁 {main_cat['name']}"
        if products_count > 0:
            text += f" ({products_count} товар{'ов' if products_count > 1 else ''})"
        text += "\n"
        
        # Показываем подкатегории
        if main_cat.get('subcategories'):
            for subcat in main_cat['subcategories']:
                sub_products_count = products_by_category.get(subcat['id'], 0)
                text += f"  └─ 📂 {subcat['name']}"
                if sub_products_count > 0:
                    text += f" ({sub_products_count} товар{'ов' if sub_products_count > 1 else ''})"
                text += "\n"
        
        # Кнопка для удаления основной категории
        builder.button(
            text=f"❌ Удалить: {main_cat['name']}",
            callback_data=f"del_category_{main_cat['id']}"
        )
        
        # Кнопки для удаления подкатегорий
        if main_cat.get('subcategories'):
            for subcat in main_cat['subcategories']:
                builder.button(
                    text=f"❌ Удалить: {subcat['name']}",
                    callback_data=f"del_category_{subcat['id']}"
                )
    
    text += "\n⚠️ **Внимание:** При удалении категории все товары в ней также будут удалены!"
    text += "\n\nДля удаления используйте кнопки ниже:"
    
    builder.adjust(1)
    await message.answer(text, reply_markup=builder.as_markup(), parse_mode="Markdown")


async def delete_category_confirm(callback: CallbackQuery):
    """Подтверждение и удаление категории"""
    category_id = int(callback.data.split("_")[2])
    user_id = callback.from_user.id
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    # Удаляем категорию через API
    async with aiohttp.ClientSession() as session:
        async with session.delete(
            f"{API_URL}/categories/{category_id}",
            params={"user_id": user_id}
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                await callback.answer("✅ Категория удалена!", show_alert=True)
                await callback.message.delete()
                # Вызываем _cmd_manage_impl для показа меню управления
                await _cmd_manage_impl(callback.message)
            elif resp.status == 404:
                await callback.answer("❌ Категория не найдена", show_alert=True)
            else:
                error_text = await resp.text()
                await callback.answer(f"❌ Ошибка: {error_text}", show_alert=True)


async def show_category_selection(callback_or_message, state: FSMContext):
    """Вспомогательная функция для показа выбора категории"""
    data = await state.get_data()
    user_id = data.get('user_id', callback_or_message.from_user.id)
    
    # Получаем API_URL
    API_URL = get_api_url()
    
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "true"}) as resp:
            if resp.status != 200:
                if hasattr(callback_or_message, 'message'):
                    return await callback_or_message.message.answer("❌ Ошибка при получении списка категорий")
                else:
                    return await callback_or_message.answer("❌ Ошибка при получении списка категорий")
            all_categories = await resp.json()
    
    if not all_categories:
        if hasattr(callback_or_message, 'message'):
            return await callback_or_message.message.answer("❌ Нет категорий. Сначала создайте категорию!")
        else:
            return await callback_or_message.answer("❌ Нет категорий. Сначала создайте категорию!")
    
    # Получаем иерархию для отображения
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/categories/", params={"user_id": user_id, "flat": "false"}) as resp:
            if resp.status != 200:
                if hasattr(callback_or_message, 'message'):
                    return await callback_or_message.message.answer("❌ Ошибка при получении списка категорий")
                else:
                    return await callback_or_message.answer("❌ Ошибка при получении списка категорий")
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
    if hasattr(callback_or_message, 'message'):
        await callback_or_message.message.answer("Выберите категорию или подкатегорию:", reply_markup=builder.as_markup())
    else:
        await callback_or_message.answer("Выберите категорию или подкатегорию:", reply_markup=builder.as_markup())

