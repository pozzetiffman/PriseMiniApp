#!/usr/bin/env python3
"""
Миграция для добавления полей для функции "покупка" в таблицу products
Выполните этот скрипт один раз для добавления новых полей в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поля для функции покупка в таблицу products"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        # Если базы нет, она будет создана при следующем запуске приложения
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существуют ли поля
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_for_sale' not in columns:
            # Добавляем поле is_for_sale
            print("Добавление поля is_for_sale в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN is_for_sale BOOLEAN DEFAULT 0")
            print("✅ Поле is_for_sale добавлено в таблицу products")
        else:
            print("Поле is_for_sale уже существует в таблице products")
        
        if 'price_from' not in columns:
            # Добавляем поле price_from
            print("Добавление поля price_from в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN price_from REAL")
            print("✅ Поле price_from добавлено в таблицу products")
        else:
            print("Поле price_from уже существует в таблице products")
        
        if 'price_to' not in columns:
            # Добавляем поле price_to
            print("Добавление поля price_to в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN price_to REAL")
            print("✅ Поле price_to добавлено в таблицу products")
        else:
            print("Поле price_to уже существует в таблице products")
        
        if 'quantity_from' not in columns:
            # Добавляем поле quantity_from
            print("Добавление поля quantity_from в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN quantity_from INTEGER")
            print("✅ Поле quantity_from добавлено в таблицу products")
        else:
            print("Поле quantity_from уже существует в таблице products")
        
        if 'quantity_unit' not in columns:
            # Добавляем поле quantity_unit
            print("Добавление поля quantity_unit в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN quantity_unit TEXT")
            print("✅ Поле quantity_unit добавлено в таблицу products")
        else:
            print("Поле quantity_unit уже существует в таблице products")
        
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

