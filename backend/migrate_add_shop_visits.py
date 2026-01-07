"""
Миграция для добавления таблицы shop_visits
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
            WHERE type='table' AND name='shop_visits'
        """)
        
        if cursor.fetchone():
            print("Table shop_visits already exists. Skipping migration.")
            return
        
        # Создаем таблицу shop_visits
        cursor.execute("""
            CREATE TABLE shop_visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_owner_id BIGINT NOT NULL,
                visitor_id BIGINT NOT NULL,
                product_id INTEGER,
                visited_at DATETIME NOT NULL,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        """)
        
        # Создаем индексы
        cursor.execute("CREATE INDEX ix_shop_visits_shop_owner_id ON shop_visits(shop_owner_id)")
        cursor.execute("CREATE INDEX ix_shop_visits_visitor_id ON shop_visits(visitor_id)")
        cursor.execute("CREATE INDEX ix_shop_visits_product_id ON shop_visits(product_id)")
        cursor.execute("CREATE INDEX ix_shop_visits_visited_at ON shop_visits(visited_at)")
        
        conn.commit()
        print("✅ Migration completed: shop_visits table created")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()









