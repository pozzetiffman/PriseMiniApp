"""
Миграция для добавления таблицы webapp_contexts
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
        # Проверяем, существует ли таблица
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='webapp_contexts'
        """)
        
        if cursor.fetchone():
            print("Table webapp_contexts already exists. Skipping migration.")
            return
        
        # Создаем таблицу webapp_contexts
        cursor.execute("""
            CREATE TABLE webapp_contexts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                viewer_id BIGINT NOT NULL UNIQUE,
                shop_owner_id BIGINT NOT NULL,
                chat_id BIGINT,
                created_at DATETIME NOT NULL
            )
        """)
        
        # Создаем индексы
        cursor.execute("CREATE INDEX ix_webapp_contexts_viewer_id ON webapp_contexts(viewer_id)")
        cursor.execute("CREATE INDEX ix_webapp_contexts_shop_owner_id ON webapp_contexts(shop_owner_id)")
        cursor.execute("CREATE INDEX ix_webapp_contexts_created_at ON webapp_contexts(created_at)")
        
        conn.commit()
        print("✅ Migration completed: webapp_contexts table created")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()




