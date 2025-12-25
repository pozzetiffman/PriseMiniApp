#!/usr/bin/env python3
"""
Миграция для добавления поля sync_product_id в таблицу products
Это поле связывает синхронизированные товары между основным магазином и магазинами ботов
Выполните этот скрипт один раз для добавления нового поля в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поле sync_product_id в таблицу products и устанавливает значения для существующих товаров"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        # Если базы нет, она будет создана при следующем запуске приложения
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли поле sync_product_id
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'sync_product_id' in columns:
            print("Поле sync_product_id уже существует в таблице products")
            conn.close()
            return
        
        # Добавляем поле sync_product_id
        print("Добавление поля sync_product_id в таблицу products...")
        cursor.execute("ALTER TABLE products ADD COLUMN sync_product_id INTEGER")
        
        # Устанавливаем sync_product_id для существующих товаров:
        # 1. Для товаров в основном магазине (bot_id IS NULL) - sync_product_id = id (сам на себя)
        print("Установка sync_product_id для товаров в основном магазине...")
        cursor.execute("""
            UPDATE products 
            SET sync_product_id = id 
            WHERE bot_id IS NULL AND sync_product_id IS NULL
        """)
        main_products_count = cursor.rowcount
        print(f"  Обновлено {main_products_count} товаров в основном магазине")
        
        # 2. Для товаров в магазинах ботов - пытаемся найти оригинальный товар по имени и цене
        # и установить sync_product_id на ID оригинального товара
        print("Установка sync_product_id для товаров в магазинах ботов...")
        cursor.execute("""
            SELECT p.id, p.user_id, p.bot_id, p.name, p.price
            FROM products p
            WHERE p.bot_id IS NOT NULL AND p.sync_product_id IS NULL
        """)
        bot_products = cursor.fetchall()
        
        synced_count = 0
        for bot_product_id, user_id, bot_id, name, price in bot_products:
            # Ищем оригинальный товар в основном магазине с таким же именем и ценой
            cursor.execute("""
                SELECT id, sync_product_id FROM products
                WHERE user_id = ? AND bot_id IS NULL AND name = ? AND price = ?
                LIMIT 1
            """, (user_id, name, price))
            
            result = cursor.fetchone()
            if result:
                original_id = result[0]
                original_sync_id = result[1] if result[1] else original_id  # Используем sync_product_id или id
                cursor.execute("""
                    UPDATE products
                    SET sync_product_id = ?
                    WHERE id = ?
                """, (original_sync_id, bot_product_id))
                synced_count += 1
        
        print(f"  Связано {synced_count} товаров в магазинах ботов с оригинальными товарами")
        
        # Создаем индекс для быстрого поиска по sync_product_id
        print("Создание индекса для sync_product_id...")
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_sync_product_id ON products(sync_product_id)")
        except sqlite3.OperationalError:
            pass  # Индекс уже существует
        
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        print(f"   - Добавлено поле sync_product_id")
        print(f"   - Обновлено {main_products_count} товаров в основном магазине")
        print(f"   - Связано {synced_count} товаров в магазинах ботов")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

