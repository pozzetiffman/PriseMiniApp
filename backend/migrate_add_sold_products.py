#!/usr/bin/env python3
"""
Миграция для добавления поля is_sold в таблицу products и создания таблицы sold_products
Выполните этот скрипт один раз для добавления нового поля и таблицы в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поле is_sold в таблицу products и создает таблицу sold_products"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        # Если базы нет, она будет создана при следующем запуске приложения
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли поле is_sold
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_sold' not in columns:
            # Добавляем поле is_sold
            print("Добавление поля is_sold в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN is_sold BOOLEAN DEFAULT 0")
            print("✅ Поле is_sold добавлено в таблицу products")
        else:
            print("Поле is_sold уже существует в таблице products")
        
        # Проверяем, существует ли таблица sold_products
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sold_products'")
        if cursor.fetchone():
            print("Таблица sold_products уже существует")
        else:
            # Создаем таблицу sold_products для истории продаж
            print("Создание таблицы sold_products...")
            cursor.execute("""
                CREATE TABLE sold_products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    price REAL NOT NULL,
                    discount REAL DEFAULT 0.0,
                    image_url TEXT,
                    images_urls TEXT,
                    category_id INTEGER,
                    sold_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                )
            """)
            print("✅ Таблица sold_products создана")
        
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()






