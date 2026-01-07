#!/usr/bin/env python3
"""
Миграция для добавления полей фиксированной цены покупки в таблицу products
Выполните этот скрипт один раз для добавления новых полей в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поля для фиксированной цены покупки в таблицу products"""
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
        
        if 'price_fixed' not in columns:
            # Добавляем поле price_fixed
            print("Добавление поля price_fixed в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN price_fixed REAL")
            print("✅ Поле price_fixed добавлено в таблицу products")
        else:
            print("Поле price_fixed уже существует в таблице products")
        
        if 'price_type' not in columns:
            # Добавляем поле price_type
            print("Добавление поля price_type в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN price_type TEXT DEFAULT 'range'")
            print("✅ Поле price_type добавлено в таблицу products")
        else:
            print("Поле price_type уже существует в таблице products")
        
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()






