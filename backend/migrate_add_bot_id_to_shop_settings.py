"""
Миграция: Добавить bot_id в shop_settings для индивидуальных настроек каждого бота
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
        # Проверяем, есть ли уже колонка bot_id
        cursor.execute("PRAGMA table_info(shop_settings)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'bot_id' in columns:
            print("Column bot_id already exists. Skipping migration.")
            return

        # Убираем unique constraint с user_id (если есть)
        # SQLite не поддерживает ALTER TABLE DROP CONSTRAINT, поэтому нужно пересоздать таблицу
        print("Adding bot_id column to shop_settings...")
        
        # Создаем новую таблицу с bot_id
        cursor.execute("""
            CREATE TABLE shop_settings_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id BIGINT NOT NULL,
                bot_id INTEGER,
                reservations_enabled BOOLEAN NOT NULL DEFAULT 1,
                quantity_enabled BOOLEAN NOT NULL DEFAULT 1,
                shop_name TEXT,
                welcome_image_url TEXT,
                welcome_description TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY (bot_id) REFERENCES bots(id)
            )
        """)
        
        # Копируем данные
        cursor.execute("""
            INSERT INTO shop_settings_new 
            (id, user_id, bot_id, reservations_enabled, quantity_enabled, shop_name, welcome_image_url, welcome_description, created_at, updated_at)
            SELECT id, user_id, NULL, reservations_enabled, quantity_enabled, shop_name, welcome_image_url, welcome_description, created_at, updated_at
            FROM shop_settings
        """)
        
        # Удаляем старую таблицу
        cursor.execute("DROP TABLE shop_settings")
        
        # Переименовываем новую таблицу
        cursor.execute("ALTER TABLE shop_settings_new RENAME TO shop_settings")
        
        # Создаем индексы
        cursor.execute("CREATE INDEX ix_shop_settings_user_id ON shop_settings(user_id)")
        cursor.execute("CREATE INDEX ix_shop_settings_bot_id ON shop_settings(bot_id)")
        
        conn.commit()
        print("✅ Migration completed: bot_id column added to shop_settings")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()




