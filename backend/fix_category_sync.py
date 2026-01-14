"""
Скрипт для исправления рассинхронизации category_id между ботами.

Проблема: Товары могут иметь category_id из основного бота, но при загрузке
в подключенном боте они должны иметь category_id соответствующей категории в этом боте.

Этот скрипт:
1. Находит все товары с неправильным category_id
2. Обновляет их category_id на правильный ID категории в их боте
"""
import sys
from sqlalchemy.orm import Session
from app.db import database, models

def fix_category_sync_for_user(user_id: int, db: Session):
    """
    Исправляет рассинхронизацию category_id для всех товаров пользователя.
    """
    print(f"\n{'='*60}")
    print(f"Исправление рассинхронизации для user_id={user_id}")
    print(f"{'='*60}\n")
    
    # Находим все товары пользователя
    all_products = db.query(models.Product).filter(
        models.Product.user_id == user_id
    ).all()
    
    print(f"Найдено товаров: {len(all_products)}")
    
    fixed_count = 0
    error_count = 0
    skipped_count = 0
    set_to_none_count = 0
    mismatch_count = 0
    
    for product in all_products:
        if not product.category_id:
            # Товар без категории - пропускаем
            skipped_count += 1
            continue
        
        # Определяем, в каком боте находится товар
        product_bot_id = product.bot_id
        
        # Получаем категорию товара
        original_category = db.query(models.Category).filter(
            models.Category.id == product.category_id
        ).first()
        
        if not original_category:
            print(f"⚠️ Товар {product.id} '{product.name}' ссылается на несуществующую категорию {product.category_id}")
            error_count += 1
            continue
        
        # Проверяем, принадлежит ли категория тому же боту, что и товар
        if original_category.bot_id == product_bot_id:
            # Категория и товар в одном боте - все правильно
            skipped_count += 1
            continue
        
        # Категория и товар в разных ботах - нужно найти правильную категорию
        mismatch_count += 1
        # Ищем категорию с таким же именем в боте товара
        correct_category = db.query(models.Category).filter(
            models.Category.user_id == user_id,
            models.Category.bot_id == product_bot_id,
            models.Category.name == original_category.name
        ).first()
        
        if correct_category:
            # Нашли правильную категорию - обновляем товар
            old_category_id = product.category_id
            product.category_id = correct_category.id
            fixed_count += 1
            print(f"✅ Товар {product.id} '{product.name}': category_id {old_category_id} -> {correct_category.id} (бот {product_bot_id})")
        else:
            # Категория не найдена в боте товара - устанавливаем category_id=None
            old_category_id = product.category_id
            product.category_id = None
            set_to_none_count += 1
            print(f"⚠️ Товар {product.id} '{product.name}' (бот {product_bot_id}): категория '{original_category.name}' не найдена в этом боте, установлено category_id=None")
    
    print(f"\n{'='*60}")
    print(f"Результаты:")
    print(f"  Исправлено: {fixed_count}")
    print(f"  Установлено category_id=None: {set_to_none_count}")
    print(f"  Было с bot_id mismatch: {mismatch_count}")
    print(f"  Пропущено (уже правильно): {skipped_count}")
    print(f"  Ошибок: {error_count}")
    print(f"{'='*60}\n")
    
    return fixed_count, set_to_none_count, mismatch_count, skipped_count, error_count


def fix_all_users(db: Session):
    """
    Исправляет рассинхронизацию для всех пользователей.
    """
    # Находим всех пользователей с товарами
    users_with_products = db.query(models.Product.user_id).distinct().all()
    user_ids = [user_id[0] for user_id in users_with_products]
    
    print(f"Найдено пользователей с товарами: {len(user_ids)}")
    
    total_fixed = 0
    total_set_to_none = 0
    total_mismatch = 0
    total_skipped = 0
    total_errors = 0
    
    for user_id in user_ids:
        fixed, set_to_none, mismatch, skipped, errors = fix_category_sync_for_user(user_id, db)
        total_fixed += fixed
        total_set_to_none += set_to_none
        total_mismatch += mismatch
        total_skipped += skipped
        total_errors += errors
    
    print(f"\n{'='*60}")
    print(f"ИТОГО:")
    print(f"  Исправлено: {total_fixed}")
    print(f"  Установлено category_id=None: {total_set_to_none}")
    print(f"  Было с bot_id mismatch: {total_mismatch}")
    print(f"  Пропущено: {total_skipped}")
    print(f"  Ошибок: {total_errors}")
    print(f"{'='*60}\n")
    
    return total_fixed, total_set_to_none, total_mismatch, total_skipped, total_errors


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Исправление рассинхронизации category_id между ботами')
    parser.add_argument('--user-id', type=int, help='ID пользователя для исправления (если не указан - исправляет всех)')
    parser.add_argument('--dry-run', action='store_true', help='Только показать проблемы, не исправлять')
    
    args = parser.parse_args()
    
    # Получаем сессию БД
    db = next(database.get_db())
    
    try:
        if args.dry_run:
            print("🔍 РЕЖИМ ПРОВЕРКИ (dry-run) - изменения не будут сохранены")
            # В режиме dry-run не коммитим изменения
            if args.user_id:
                fix_category_sync_for_user(args.user_id, db)
            else:
                fix_all_users(db)
            db.rollback()
            print("\n⚠️ Изменения НЕ сохранены (dry-run режим)")
        else:
            if args.user_id:
                fix_category_sync_for_user(args.user_id, db)
            else:
                fix_all_users(db)
            db.commit()
            print("✅ Изменения сохранены в базу данных")
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()
