#!/usr/bin/env python3
"""
Миграция для добавления поля is_reservation_enabled в таблицу products.
Выполните один раз: python migrate_add_reservation_enabled.py (из папки backend).
"""
import sqlite3
import os

DB_PATH = "sql_app.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"База {DB_PATH} не найдена.")
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(products)")
        columns = [c[1] for c in cursor.fetchall()]
        if "is_reservation_enabled" not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN is_reservation_enabled BOOLEAN DEFAULT 0")
            conn.commit()
            print("✅ Поле is_reservation_enabled добавлено.")
        else:
            print("Поле is_reservation_enabled уже есть.")
    except sqlite3.Error as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
