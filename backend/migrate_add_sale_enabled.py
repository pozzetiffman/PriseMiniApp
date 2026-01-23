"""
Миграция для добавления поля is_sale_enabled в таблицу products
Это поле определяет, можно ли продавать товар клиентам (когда мы продаем товар, а не покупаем)
"""

import sqlite3
import os

def migrate():
    """Добавляет поле is_sale_enabled в таблицу products"""
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
        
        # Проверяем, существует ли поле is_sale_enabled
        if 'is_sale_enabled' not in columns:
            # Добавляем поле is_sale_enabled
            print("Добавление поля is_sale_enabled в таблицу products...")
            cursor.execute("ALTER TABLE products ADD COLUMN is_sale_enabled BOOLEAN DEFAULT 0")
            print("✅ Поле is_sale_enabled добавлено в таблицу products")
        else:
            print("Поле is_sale_enabled уже существует в таблице products")
        
        conn.commit()
        print("✅ Миграция успешно завершена")
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
