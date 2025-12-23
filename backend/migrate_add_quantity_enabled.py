#!/usr/bin/env python3
"""
Миграция для добавления поля quantity_enabled в таблицу shop_settings
Выполните этот скрипт один раз для добавления нового поля в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поле quantity_enabled в таблицу shop_settings"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        # Если базы нет, она будет создана при следующем запуске приложения
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли поле quantity_enabled
        cursor.execute("PRAGMA table_info(shop_settings)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'quantity_enabled' in columns:
            print("Поле quantity_enabled уже существует в таблице shop_settings")
            conn.close()
            return
        
        # Добавляем поле quantity_enabled со значением по умолчанию True
        print("Добавление поля quantity_enabled в таблицу shop_settings...")
        cursor.execute("ALTER TABLE shop_settings ADD COLUMN quantity_enabled INTEGER DEFAULT 1")
        
        # Обновляем существующие записи, устанавливая quantity_enabled = 1 (True)
        cursor.execute("UPDATE shop_settings SET quantity_enabled = 1 WHERE quantity_enabled IS NULL")
        
        conn.commit()
        print("✅ Миграция успешно выполнена! Поле quantity_enabled добавлено в таблицу shop_settings")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

