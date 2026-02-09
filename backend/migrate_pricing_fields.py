"""
Миграция: добавление полей для единого расчёта цен (pricing).
Deals: delivery_fee, items_amount.
SaleOrders: delivery_fee, items_amount, total_amount.
Не удаляет и не меняет существующие данные.
"""
import sqlite3
import os

# Путь к БД относительно корня backend
DB_PATH = os.path.join(os.path.dirname(__file__), "sql_app.db")


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    rows = cursor.fetchall()
    return any(row[1] == column for row in rows)


def run():
    if not os.path.exists(DB_PATH):
        print(f"⚠️ DB not found: {DB_PATH}")
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Deals
        if not column_exists(cursor, "deals", "delivery_fee"):
            cursor.execute("ALTER TABLE deals ADD COLUMN delivery_fee REAL DEFAULT 0")
            print("✅ deals.delivery_fee added")
        else:
            print("ℹ️ deals.delivery_fee already exists")
        if not column_exists(cursor, "deals", "items_amount"):
            cursor.execute("ALTER TABLE deals ADD COLUMN items_amount REAL")
            print("✅ deals.items_amount added")
        else:
            print("ℹ️ deals.items_amount already exists")

        # Sale_orders
        if not column_exists(cursor, "sale_orders", "delivery_fee"):
            cursor.execute("ALTER TABLE sale_orders ADD COLUMN delivery_fee REAL DEFAULT 0")
            print("✅ sale_orders.delivery_fee added")
        else:
            print("ℹ️ sale_orders.delivery_fee already exists")
        if not column_exists(cursor, "sale_orders", "items_amount"):
            cursor.execute("ALTER TABLE sale_orders ADD COLUMN items_amount REAL")
            print("✅ sale_orders.items_amount added")
        else:
            print("ℹ️ sale_orders.items_amount already exists")
        if not column_exists(cursor, "sale_orders", "total_amount"):
            cursor.execute("ALTER TABLE sale_orders ADD COLUMN total_amount REAL")
            print("✅ sale_orders.total_amount added")
        else:
            print("ℹ️ sale_orders.total_amount already exists")

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    run()
