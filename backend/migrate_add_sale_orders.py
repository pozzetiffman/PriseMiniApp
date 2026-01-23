"""
Миграция для создания таблицы sale_orders
Таблица для заказов на покупку (когда мы продаем товар клиенту)
"""

import sqlite3
import os

def migrate():
    """Создает таблицу sale_orders"""
    db_path = os.path.join(os.path.dirname(__file__), 'sql_app.db')
    
    if not os.path.exists(db_path):
        print(f"❌ База данных не найдена: {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли таблица sale_orders
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sale_orders'")
        table_exists = cursor.fetchone() is not None
        
        if not table_exists:
            print("Создание таблицы sale_orders...")
            cursor.execute("""
                CREATE TABLE sale_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    user_id BIGINT NOT NULL,
                    ordered_by_user_id BIGINT NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_completed BOOLEAN DEFAULT 0,
                    is_cancelled BOOLEAN DEFAULT 0,
                    promo_code VARCHAR,
                    first_name VARCHAR,
                    last_name VARCHAR,
                    phone_country_code VARCHAR,
                    phone_number VARCHAR,
                    email VARCHAR,
                    notes TEXT,
                    delivery_method VARCHAR,
                    payment_method VARCHAR,
                    status VARCHAR DEFAULT 'pending',
                    snapshot_id VARCHAR,
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            """)
            
            # Создаем индексы
            cursor.execute("CREATE INDEX idx_sale_orders_product_id ON sale_orders(product_id)")
            cursor.execute("CREATE INDEX idx_sale_orders_user_id ON sale_orders(user_id)")
            cursor.execute("CREATE INDEX idx_sale_orders_ordered_by_user_id ON sale_orders(ordered_by_user_id)")
            cursor.execute("CREATE INDEX idx_sale_orders_created_at ON sale_orders(created_at)")
            cursor.execute("CREATE INDEX idx_sale_orders_snapshot_id ON sale_orders(snapshot_id)")
            
            print("✅ Таблица sale_orders создана успешно")
        else:
            print("Таблица sale_orders уже существует")
        
        conn.commit()
        print("✅ Миграция успешно завершена")
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
