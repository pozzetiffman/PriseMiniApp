#!/usr/bin/env python3
"""
Миграция для добавления поля is_hot_offer в таблицу products
Выполните этот скрипт один раз для добавления нового поля в существующую базу данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поле is_hot_offer в таблицу products"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        # Если базы нет, она будет создана при следующем запуске приложения
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли поле is_hot_offer
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_hot_offer' in columns:
            print("Поле is_hot_offer уже существует в таблице products")
            conn.close()
            return
        
        # Добавляем поле is_hot_offer
        print("Добавление поля is_hot_offer в таблицу products...")
        cursor.execute("ALTER TABLE products ADD COLUMN is_hot_offer BOOLEAN DEFAULT 0")
        
        conn.commit()
        print("✅ Миграция успешно выполнена! Поле is_hot_offer добавлено в таблицу products")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()







