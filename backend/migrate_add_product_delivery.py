"""
Миграция: создание таблицы product_delivery (настройки доставки товара).
Одна запись на товар (one-to-one).
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
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS product_delivery (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
                is_delivery_enabled INTEGER NOT NULL DEFAULT 0,
                is_pickup_enabled INTEGER NOT NULL DEFAULT 0,
                delivery_price REAL,
                pickup_address VARCHAR,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME,
                updated_at DATETIME
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_product_delivery_product_id ON product_delivery(product_id)")
        conn.commit()
        print("✅ Таблица product_delivery создана")
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
