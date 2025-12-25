#!/usr/bin/env python3
"""
Миграция для добавления поля quantity в таблицу sold_products
Выполните этот скрипт один раз для добавления нового поля в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поле quantity в таблицу sold_products"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        # Если базы нет, она будет создана при следующем запуске приложения
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли таблица sold_products
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sold_products'")
        if not cursor.fetchone():
            print("Таблица sold_products не найдена. Она будет создана при следующем запуске приложения.")
            conn.close()
            return
        
        # Проверяем, существует ли поле quantity
        cursor.execute("PRAGMA table_info(sold_products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'quantity' in columns:
            print("Поле quantity уже существует в таблице sold_products")
            conn.close()
            return
        
        # Добавляем поле quantity
        print("Добавление поля quantity в таблицу sold_products...")
        cursor.execute("ALTER TABLE sold_products ADD COLUMN quantity INTEGER DEFAULT 1")
        
        # Обновляем существующие записи, устанавливая quantity = 1 для всех проданных товаров
        print("Обновление существующих записей...")
        cursor.execute("UPDATE sold_products SET quantity = 1 WHERE quantity IS NULL")
        
        conn.commit()
        print("✅ Миграция успешно выполнена! Поле quantity добавлено в таблицу sold_products")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

