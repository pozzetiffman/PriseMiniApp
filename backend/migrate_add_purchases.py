#!/usr/bin/env python3
"""
Миграция для создания таблицы purchases
Выполните этот скрипт один раз для создания новой таблицы в базе данных
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Создает таблицу purchases"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли таблица
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='purchases'")
        if cursor.fetchone():
            print("Таблица purchases уже существует")
            return
        
        # Создаем таблицу purchases
        print("Создание таблицы purchases...")
        cursor.execute("""
            CREATE TABLE purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                purchased_by_user_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_completed BOOLEAN DEFAULT 0,
                is_cancelled BOOLEAN DEFAULT 0,
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                middle_name VARCHAR(255),
                phone_number VARCHAR(255),
                city VARCHAR(255),
                address TEXT,
                notes TEXT,
                payment_method VARCHAR(255),
                organization VARCHAR(255),
                images_urls TEXT,
                video_url VARCHAR(255),
                status VARCHAR(50) DEFAULT 'pending',
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        """)
        
        # Создаем индексы
        cursor.execute("CREATE INDEX ix_purchases_product_id ON purchases (product_id)")
        cursor.execute("CREATE INDEX ix_purchases_user_id ON purchases (user_id)")
        cursor.execute("CREATE INDEX ix_purchases_purchased_by_user_id ON purchases (purchased_by_user_id)")
        cursor.execute("CREATE INDEX ix_purchases_created_at ON purchases (created_at)")
        
        conn.commit()
        print("✅ Таблица purchases успешно создана!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

