"""
Миграция для добавления полей is_client_sale и seller_id в таблицу products
Эти поля используются для товаров, которые клиенты продают другим клиентам (C2C)
"""

import sqlite3
import os

def migrate():
    """Добавляет поля is_client_sale и seller_id в таблицу products"""
    db_path = os.path.join(os.path.dirname(__file__), 'sql_app.db')
    
    if not os.path.exists(db_path):
        print(f"❌ База данных не найдена: {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Получаем список всех столбцов в таблице products
        cursor.execute("PRAGMA table_info(products)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Проверяем, существует ли поле is_client_sale
        if 'is_client_sale' not in columns:
            # Добавляем поле is_client_sale
            print("Добавление поля is_client_sale в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN is_client_sale BOOLEAN DEFAULT 0")
            print("✅ Поле is_client_sale добавлено в таблицу products")
        else:
            print("Поле is_client_sale уже существует в таблице products")
        
        # Проверяем, существует ли поле seller_id
        if 'seller_id' not in columns:
            # Добавляем поле seller_id
            print("Добавление поля seller_id в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN seller_id INTEGER")
            # Создаем индекс для seller_id для быстрого поиска
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id)")
            print("✅ Поле seller_id добавлено в таблицу products с индексом")
        else:
            print("Поле seller_id уже существует в таблице products")
        
        conn.commit()
        print("✅ Миграция успешно завершена")
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
