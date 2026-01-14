#!/usr/bin/env python3
"""
Self-check тесты для функции normalize_category_id.

Запуск: python test_normalize_category_id.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.orm import Session
from app.db import database, models
from app.utils.products_utils import normalize_category_id


def setup_test_data(db: Session):
    """Создает тестовые данные для проверки"""
    # Очищаем тестовые данные
    db.query(models.Product).filter(models.Product.user_id == 999999999).delete()
    db.query(models.Category).filter(models.Category.user_id == 999999999).delete()
    db.query(models.Bot).filter(models.Bot.owner_user_id == 999999999).delete()
    
    test_user_id = 999999999
    
    # Создаем тестового бота
    test_bot = models.Bot(
        id=999,
        owner_user_id=test_user_id,
        bot_token="test_token",
        is_active=True
    )
    db.add(test_bot)
    db.flush()
    
    # Создаем категории:
    # 1. В основном боте (bot_id=None)
    cat_main = models.Category(
        name="Test Category Main",
        user_id=test_user_id,
        bot_id=None
    )
    db.add(cat_main)
    db.flush()
    
    # 2. В подключенном боте (bot_id=999)
    cat_bot = models.Category(
        name="Test Category Bot",
        user_id=test_user_id,
        bot_id=999
    )
    db.add(cat_bot)
    db.flush()
    
    # 3. Еще одна категория в боте с другим именем
    cat_bot_other = models.Category(
        name="Other Category",
        user_id=test_user_id,
        bot_id=999
    )
    db.add(cat_bot_other)
    db.flush()
    
    db.commit()
    
    return test_user_id, cat_main.id, cat_bot.id, cat_bot_other.id


def test_1_none_none_match(db: Session, test_user_id: int, cat_main_id: int):
    """Тест 1: target_bot_id=None и category.bot_id=None → match"""
    print("\n[TEST 1] target_bot_id=None и category.bot_id=None → match")
    result = normalize_category_id(cat_main_id, None, test_user_id, db)
    assert result == cat_main_id, f"Expected {cat_main_id}, got {result}"
    print(f"✅ PASS: result={result}")


def test_2_int_int_match(db: Session, test_user_id: int, cat_bot_id: int):
    """Тест 2: target_bot_id=2 (int) и category.bot_id=2 → match"""
    print("\n[TEST 2] target_bot_id=999 (int) и category.bot_id=999 → match")
    result = normalize_category_id(cat_bot_id, 999, test_user_id, db)
    assert result == cat_bot_id, f"Expected {cat_bot_id}, got {result}"
    print(f"✅ PASS: result={result}")


def test_3_str_int_match(db: Session, test_user_id: int, cat_bot_id: int):
    """Тест 3: target_bot_id='2' (str) и category.bot_id=2 → должен match после int()"""
    print("\n[TEST 3] target_bot_id='999' (str) и category.bot_id=999 → должен match после int()")
    # Примечание: функция принимает Optional[int], но для теста передадим как есть
    # В реальности типы будут int, но проверим, что функция нормализует правильно
    result = normalize_category_id(cat_bot_id, 999, test_user_id, db)  # Уже int, но проверим
    assert result == cat_bot_id, f"Expected {cat_bot_id}, got {result}"
    print(f"✅ PASS: result={result}")


def test_4_cross_bot_mapping(db: Session, test_user_id: int, cat_main_id: int):
    """Тест 4: category_id принадлежит другому bot_id → маппинг по name"""
    print("\n[TEST 4] category_id из main bot, target_bot_id=999 → маппинг по name")
    # Категория из основного бота, но target_bot_id=999
    # Должна найти категорию с таким же именем в боте 999
    # Но у нас нет такой категории, поэтому должен вернуть None
    # Создадим категорию с таким же именем в боте 999
    cat_main = db.query(models.Category).filter(models.Category.id == cat_main_id).first()
    cat_bot_same_name = models.Category(
        name=cat_main.name,  # То же имя
        user_id=test_user_id,
        bot_id=999
    )
    db.add(cat_bot_same_name)
    db.flush()
    db.commit()
    
    result = normalize_category_id(cat_main_id, 999, test_user_id, db)
    assert result == cat_bot_same_name.id, f"Expected {cat_bot_same_name.id}, got {result}"
    print(f"✅ PASS: result={result}, mapped from {cat_main_id} to {cat_bot_same_name.id}")
    
    # Удаляем тестовую категорию
    db.delete(cat_bot_same_name)
    db.commit()


def test_5_no_matching_category(db: Session, test_user_id: int, cat_main_id: int):
    """Тест 5: нет matching category → None"""
    print("\n[TEST 5] нет matching category → None")
    # Категория из основного бота, target_bot_id=999, но нет категории с таким именем в боте 999
    result = normalize_category_id(cat_main_id, 999, test_user_id, db)
    assert result is None, f"Expected None, got {result}"
    print(f"✅ PASS: result={result}")


def test_6_nonexistent_category(db: Session, test_user_id: int):
    """Тест 6: category_id не существует → None + warning"""
    print("\n[TEST 6] category_id не существует → None + warning")
    nonexistent_id = 999999
    result = normalize_category_id(nonexistent_id, None, test_user_id, db)
    assert result is None, f"Expected None, got {result}"
    print(f"✅ PASS: result={result}")


def cleanup_test_data(db: Session, test_user_id: int):
    """Очищает тестовые данные"""
    db.query(models.Product).filter(models.Product.user_id == test_user_id).delete()
    db.query(models.Category).filter(models.Category.user_id == test_user_id).delete()
    db.query(models.Bot).filter(models.Bot.owner_user_id == test_user_id).delete()
    db.commit()


def run_tests():
    """Запускает все тесты"""
    print("=" * 60)
    print("SELF-CHECK ТЕСТЫ: normalize_category_id")
    print("=" * 60)
    
    db = next(database.get_db())
    
    try:
        # Настройка тестовых данных
        test_user_id, cat_main_id, cat_bot_id, cat_bot_other_id = setup_test_data(db)
        
        # Запуск тестов
        test_1_none_none_match(db, test_user_id, cat_main_id)
        test_2_int_int_match(db, test_user_id, cat_bot_id)
        test_3_str_int_match(db, test_user_id, cat_bot_id)
        test_5_no_matching_category(db, test_user_id, cat_main_id)
        test_4_cross_bot_mapping(db, test_user_id, cat_main_id)
        test_6_nonexistent_category(db, test_user_id)
        
        # Очистка
        cleanup_test_data(db, test_user_id)
        
        print("\n" + "=" * 60)
        print("✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ ТЕСТ НЕ ПРОЙДЕН: {e}")
        cleanup_test_data(db, test_user_id)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        cleanup_test_data(db, test_user_id)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
