"""
Миграция для добавления полей delivery_time, delivery_price в таблицу products
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

        # Добавляем delivery_time если его нет
        if 'delivery_time' not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN delivery_time TEXT")
            print("✅ Добавлено поле delivery_time")
        else:
            print("ℹ️ Поле delivery_time уже существует")

        # Добавляем delivery_price если его нет
        if 'delivery_price' not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN delivery_price REAL")
            print("✅ Добавлено поле delivery_price")
        else:
            print("ℹ️ Поле delivery_price уже существует")

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
