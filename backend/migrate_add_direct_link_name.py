"""
Миграция для добавления поля direct_link_name в таблицу bots
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
        # Проверяем, существует ли колонка
        cursor.execute("PRAGMA table_info(bots)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'direct_link_name' in columns:
            print("Column direct_link_name already exists. Skipping migration.")
            return
        
        # Добавляем колонку direct_link_name
        cursor.execute("""
            ALTER TABLE bots 
            ADD COLUMN direct_link_name TEXT
        """)
        
        conn.commit()
        print("✅ Migration completed: direct_link_name column added to bots table")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()



