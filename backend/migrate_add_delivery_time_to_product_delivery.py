"""
Миграция: добавление колонки delivery_time в таблицу product_delivery.
Безопасная миграция: поле nullable.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "sql_app.db"


def migrate():
    if not DB_PATH.exists():
        print(f"❌ База данных не найдена: {DB_PATH}")
        return
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(product_delivery)")
        columns = [col[1] for col in cursor.fetchall()]
        if "delivery_time" not in columns:
            cursor.execute("ALTER TABLE product_delivery ADD COLUMN delivery_time TEXT")
            conn.commit()
            print("✅ В таблицу product_delivery добавлена колонка delivery_time")
        else:
            print("ℹ️ Колонка delivery_time уже есть в product_delivery")
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
