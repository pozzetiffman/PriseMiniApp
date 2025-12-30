#!/usr/bin/env python3
"""
Миграция для добавления полей покупки от клиентов:
- В таблицу products: is_buy_from_client, buy_price_from, buy_price_to, buy_price_2, buy_price_3, buy_unit
- В таблицу shop_settings: buy_from_client_enabled
- Создание таблицы sales для продаж от клиентов
"""
import sqlite3
import os

DB_PATH = "sql_app.db"

def migrate():
    """Добавляет поля покупки от клиентов"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена. Создание новой базы...")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем и добавляем поля в таблицу products
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_buy_from_client' not in columns:
            print("Добавление поля is_buy_from_client в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN is_buy_from_client BOOLEAN DEFAULT 0")
            print("✅ Поле is_buy_from_client добавлено")
        else:
            print("Поле is_buy_from_client уже существует")
        
        if 'buy_price_from' not in columns:
            print("Добавление поля buy_price_from в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN buy_price_from REAL")
            print("✅ Поле buy_price_from добавлено")
        else:
            print("Поле buy_price_from уже существует")
        
        if 'buy_price_to' not in columns:
            print("Добавление поля buy_price_to в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN buy_price_to REAL")
            print("✅ Поле buy_price_to добавлено")
        else:
            print("Поле buy_price_to уже существует")
        
        if 'buy_price_2' not in columns:
            print("Добавление поля buy_price_2 в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN buy_price_2 REAL")
            print("✅ Поле buy_price_2 добавлено")
        else:
            print("Поле buy_price_2 уже существует")
        
        if 'buy_price_3' not in columns:
            print("Добавление поля buy_price_3 в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN buy_price_3 REAL")
            print("✅ Поле buy_price_3 добавлено")
        else:
            print("Поле buy_price_3 уже существует")
        
        if 'buy_unit' not in columns:
            print("Добавление поля buy_unit в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN buy_unit TEXT DEFAULT 'кол'")
            print("✅ Поле buy_unit добавлено")
        else:
            print("Поле buy_unit уже существует")
        
        # Проверяем и добавляем поле в таблицу shop_settings
        cursor.execute("PRAGMA table_info(shop_settings)")
        shop_settings_columns = [column[1] for column in cursor.fetchall()]
        
        if 'buy_from_client_enabled' not in shop_settings_columns:
            print("Добавление поля buy_from_client_enabled в таблицу shop_settings...")
            cursor.execute("ALTER TABLE shop_settings ADD COLUMN buy_from_client_enabled BOOLEAN DEFAULT 0")
            print("✅ Поле buy_from_client_enabled добавлено")
        else:
            print("Поле buy_from_client_enabled уже существует")
        
        # Создаем таблицу sales, если её еще нет
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'")
        if cursor.fetchone() is None:
            print("Создание таблицы sales...")
            cursor.execute("""
                CREATE TABLE sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER,
                    user_id BIGINT,
                    sold_by_user_id BIGINT,
                    quantity INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_completed BOOLEAN DEFAULT 0,
                    is_cancelled BOOLEAN DEFAULT 0,
                    promo_code TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    middle_name TEXT,
                    phone_country_code TEXT,
                    phone_number TEXT,
                    email TEXT,
                    notes TEXT,
                    delivery_method TEXT,
                    status TEXT DEFAULT 'pending',
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            """)
            # Создаем индексы
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_sold_by_user_id ON sales(sold_by_user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)")
            print("✅ Таблица sales создана")
        else:
            print("Таблица sales уже существует")
        
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()



