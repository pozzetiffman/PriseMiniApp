"""
Миграция: добавление поля order_number в orders, purchases, sale_orders.
Уникальный человекочитаемый номер операции (ORD-/PUR-/SLO-YYYYMMDD-HHMM-XXXX).
Старые записи остаются с order_number=NULL (обратная совместимость).
"""

import sqlite3
import os


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def index_exists(cursor, index_name: str) -> bool:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (index_name,))
    return cursor.fetchone() is not None


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), "sql_app.db")
    if not os.path.exists(db_path):
        print(f"❌ База данных не найдена: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # orders
        if not column_exists(cursor, "orders", "order_number"):
            print("Добавление order_number в orders...")
            cursor.execute("ALTER TABLE orders ADD COLUMN order_number VARCHAR(64)")
        if not index_exists(cursor, "idx_orders_order_number"):
            cursor.execute("CREATE UNIQUE INDEX idx_orders_order_number ON orders(order_number)")
            print("✅ Индекс idx_orders_order_number создан")

        # purchases
        if not column_exists(cursor, "purchases", "order_number"):
            print("Добавление order_number в purchases...")
            cursor.execute("ALTER TABLE purchases ADD COLUMN order_number VARCHAR(64)")
        if not index_exists(cursor, "idx_purchases_order_number"):
            cursor.execute("CREATE UNIQUE INDEX idx_purchases_order_number ON purchases(order_number)")
            print("✅ Индекс idx_purchases_order_number создан")

        # sale_orders
        if not column_exists(cursor, "sale_orders", "order_number"):
            print("Добавление order_number в sale_orders...")
            cursor.execute("ALTER TABLE sale_orders ADD COLUMN order_number VARCHAR(64)")
        if not index_exists(cursor, "idx_sale_orders_order_number"):
            cursor.execute("CREATE UNIQUE INDEX idx_sale_orders_order_number ON sale_orders(order_number)")
            print("✅ Индекс idx_sale_orders_order_number создан")

        conn.commit()
        print("✅ Миграция order_number завершена")
    except Exception as e:
        print(f"❌ Ошибка миграции: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
