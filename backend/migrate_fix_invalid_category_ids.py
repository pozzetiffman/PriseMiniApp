#!/usr/bin/env python3
"""
Миграция для очистки невалидных category_id в таблице products.

Находит товары, у которых category_id указывает на несуществующую категорию,
и устанавливает category_id = NULL для таких товаров.
"""
import sqlite3
import os
import shutil
from datetime import datetime

DB_PATH = "sql_app.db"
BACKUP_SUFFIX = f"_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

def create_backup():
    if not os.path.exists(DB_PATH):
        return False
    backup_path = DB_PATH + BACKUP_SUFFIX
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ Создана резервная копия: {backup_path}")
    return True

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"⚠️  База данных {DB_PATH} не найдена.")
        return
    
    create_backup()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        print("\n🔍 Поиск товаров с невалидными category_id...\n")
        
        # Находим все валидные category_id
        cursor.execute("SELECT id FROM categories")
        valid_category_ids = {row[0] for row in cursor.fetchall()}
        print(f"✅ Найдено {len(valid_category_ids)} валидных категорий")
        
        # Находим товары с невалидными category_id
        cursor.execute("SELECT id, category_id FROM products WHERE category_id IS NOT NULL")
        products = cursor.fetchall()
        
        invalid_count = 0
        for product_id, category_id in products:
            if category_id not in valid_category_ids:
                cursor.execute(
                    "UPDATE products SET category_id = NULL WHERE id = ?",
                    (product_id,)
                )
                invalid_count += 1
                print(f"   ⚠️  Товар {product_id}: category_id {category_id} → NULL")
        
        conn.commit()
        
        if invalid_count > 0:
            print(f"\n✅ Исправлено {invalid_count} товаров с невалидными category_id")
        else:
            print("\n✅ Невалидных category_id не обнаружено")
        
    except sqlite3.Error as e:
        print(f"\n❌ Ошибка: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Миграция: Очистка невалидных category_id в products")
    print("=" * 60)
    migrate()
