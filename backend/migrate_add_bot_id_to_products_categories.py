"""
Миграция: Добавить bot_id в products и categories для независимых магазинов каждого бота
"""
import sqlite3
import os

def migrate():
    db_path = "sql_app.db"
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found. Skipping migration.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Проверяем, есть ли уже колонка bot_id в categories
        cursor.execute("PRAGMA table_info(categories)")
        category_columns = [column[1] for column in cursor.fetchall()]
        
        if 'bot_id' not in category_columns:
            print("Adding bot_id column to categories...")
            cursor.execute("ALTER TABLE categories ADD COLUMN bot_id INTEGER")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_categories_bot_id ON categories(bot_id)")
            print("✅ Added bot_id to categories")
        else:
            print("Column bot_id already exists in categories")
        
        # Проверяем, есть ли уже колонка bot_id в products
        cursor.execute("PRAGMA table_info(products)")
        product_columns = [column[1] for column in cursor.fetchall()]
        
        if 'bot_id' not in product_columns:
            print("Adding bot_id column to products...")
            cursor.execute("ALTER TABLE products ADD COLUMN bot_id INTEGER")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_products_bot_id ON products(bot_id)")
            print("✅ Added bot_id to products")
        else:
            print("Column bot_id already exists in products")
        
        conn.commit()
        print("✅ Migration completed: bot_id columns added to products and categories")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()









