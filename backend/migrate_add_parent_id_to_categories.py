"""
Миграция: Добавление поля parent_id в таблицу categories для поддержки подкатегорий
"""
import sqlite3
import os

def migrate():
    """Добавляет поле parent_id в таблицу categories"""
    db_path = "sql_app.db"
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found. Skipping migration.")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли уже поле parent_id
        cursor.execute("PRAGMA table_info(categories)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'parent_id' in columns:
            print("✅ Поле parent_id уже существует в таблице categories")
            return
        
        # Добавляем поле parent_id
        print("🔄 Добавление поля parent_id в таблицу categories...")
        cursor.execute("""
            ALTER TABLE categories 
            ADD COLUMN parent_id INTEGER
        """)
        
        # Создаем индекс для parent_id для улучшения производительности
        print("🔄 Создание индекса для parent_id...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_categories_parent_id 
            ON categories(parent_id)
        """)
        
        # Создаем внешний ключ (если поддерживается)
        # SQLite не поддерживает ADD CONSTRAINT, поэтому пропускаем
        
        conn.commit()
        print("✅ Миграция успешно выполнена: поле parent_id добавлено в таблицу categories")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка при выполнении миграции: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

