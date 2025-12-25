"""
Миграция для добавления таблицы bots
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
            WHERE type='table' AND name='bots'
        """)
        
        if cursor.fetchone():
            print("Table bots already exists. Skipping migration.")
            return
        
        # Создаем таблицу bots
        cursor.execute("""
            CREATE TABLE bots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bot_token TEXT NOT NULL UNIQUE,
                bot_username TEXT NOT NULL UNIQUE,
                owner_user_id BIGINT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """)
        
        # Создаем индексы
        cursor.execute("CREATE INDEX ix_bots_bot_token ON bots(bot_token)")
        cursor.execute("CREATE INDEX ix_bots_bot_username ON bots(bot_username)")
        cursor.execute("CREATE INDEX ix_bots_owner_user_id ON bots(owner_user_id)")
        cursor.execute("CREATE INDEX ix_bots_created_at ON bots(created_at)")
        
        conn.commit()
        print("✅ Migration completed: bots table created")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()




