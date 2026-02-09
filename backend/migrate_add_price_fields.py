"""
Миграция для добавления полей price_card, price_cash, price_old в таблицу products
Безопасная миграция: все поля nullable, не ломает существующие данные
"""
import sqlite3
import os
from pathlib import Path

# Путь к базе данных
DB_PATH = Path(__file__).parent / "sql_app.db"

def migrate():
    """Добавить новые поля в таблицу products"""
    if not DB_PATH.exists():
        print(f"❌ База данных не найдена: {DB_PATH}")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Проверяем, существуют ли уже поля
        cursor.execute("PRAGMA table_info(products)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Добавляем price_card если его нет
        if 'price_card' not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN price_card REAL")
            print("✅ Добавлено поле price_card")
        else:
            print("ℹ️ Поле price_card уже существует")
        
        # Добавляем price_cash если его нет
        if 'price_cash' not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN price_cash REAL")
            print("✅ Добавлено поле price_cash")
        else:
            print("ℹ️ Поле price_cash уже существует")
        
        # Добавляем price_old если его нет
        if 'price_old' not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN price_old REAL")
            print("✅ Добавлено поле price_old")
        else:
            print("ℹ️ Поле price_old уже существует")
        
        conn.commit()
        print("✅ Миграция успешно завершена")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка при миграции: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
