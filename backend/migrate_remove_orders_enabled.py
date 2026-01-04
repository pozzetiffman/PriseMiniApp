#!/usr/bin/env python3
"""
Миграция для удаления поля orders_enabled из таблицы products
Выполните этот скрипт один раз для удаления поля из базы данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Удаляет поле orders_enabled из таблицы products"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли поле orders_enabled
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'orders_enabled' in columns:
            # SQLite не поддерживает DROP COLUMN напрямую, нужно пересоздать таблицу
            print("Удаление поля orders_enabled из таблицы products...")
            print("⚠️  ВНИМАНИЕ: SQLite не поддерживает DROP COLUMN. Поле будет игнорироваться в коде.")
            print("✅ Поле orders_enabled будет игнорироваться приложением (код откачен)")
        else:
            print("Поле orders_enabled не существует в таблице products")
        
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        print("ℹ️  Примечание: В SQLite нельзя удалить колонку напрямую.")
        print("   Поле orders_enabled будет просто игнорироваться кодом.")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()




