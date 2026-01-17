#!/usr/bin/env python3
"""
Миграция для создания таблицы favorites
Выполните этот скрипт один раз для создания новой таблицы в базе данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Создает таблицу favorites"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли таблица
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'")
        if cursor.fetchone():
            print("Таблица favorites уже существует")
            return
        
        # Создаем таблицу favorites
        print("Создание таблицы favorites...")
        cursor.execute("""
            CREATE TABLE favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                shop_owner_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
            )
        """)
        
        # Создаем индексы
        cursor.execute("CREATE INDEX ix_favorites_product_id ON favorites (product_id)")
        cursor.execute("CREATE INDEX ix_favorites_user_id ON favorites (user_id)")
        cursor.execute("CREATE INDEX ix_favorites_shop_owner_id ON favorites (shop_owner_id)")
        cursor.execute("CREATE INDEX ix_favorites_created_at ON favorites (created_at)")
        
        # Создаем уникальный индекс на пару (product_id, user_id)
        cursor.execute("CREATE UNIQUE INDEX ix_favorites_product_user ON favorites (product_id, user_id)")
        
        conn.commit()
        print("✅ Таблица favorites успешно создана!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
