"""
Миграция: добавление полей оформления сделки в таблицу deals.
Поля: updated_at, payment_method, delivery_method, customer_name, customer_phone,
delivery_address, customer_comment, seller_comment.
Статус расширен: для существующих записей оставляем 'active'; новые из checkout/start получают 'draft'.
"""

import sqlite3
import os


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), "sql_app.db")
    if not os.path.exists(db_path):
        print(f"База не найдена: {db_path}, пропуск миграции deals")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    columns = [
        ("updated_at", "DATETIME"),
        ("payment_method", "VARCHAR(32)"),
        ("delivery_method", "VARCHAR(32)"),
        ("customer_name", "VARCHAR(255)"),
        ("customer_phone", "VARCHAR(64)"),
        ("delivery_address", "TEXT"),
        ("customer_comment", "TEXT"),
        ("seller_comment", "TEXT"),
    ]

    try:
        for col_name, col_type in columns:
            if not column_exists(cursor, "deals", col_name):
                cursor.execute(f"ALTER TABLE deals ADD COLUMN {col_name} {col_type}")
                print(f"  Добавлена колонка deals.{col_name}")
        # Статус: если в модели был default='active', существующие строки уже active.
        # Менять default на 'draft' в БД не нужно — это задаётся в коде при создании.
        conn.commit()
        print("✅ Миграция deal checkout fields завершена")
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
