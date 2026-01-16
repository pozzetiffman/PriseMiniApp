"""
Миграция: Добавление поля snapshot_id в таблицу reservations

Эта миграция добавляет поле snapshot_id для связи резервации с snapshot товара.
Snapshot сохраняет состояние товара на момент резервации, что позволяет:
- Отображать товар в корзине даже если он был удален или изменен админом
- Сохранять права пользователя на резервированный товар
- Изолировать данные товара от изменений админа
"""

import sqlite3
import os

def migrate():
    db_path = "sql_app.db"
    if not os.path.exists(db_path):
        print(f"❌ Database file {db_path} not found")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли уже поле snapshot_id
        cursor.execute("PRAGMA table_info(reservations)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "snapshot_id" not in columns:
            print(f"➕ Adding column snapshot_id to reservations table...")
            cursor.execute("ALTER TABLE reservations ADD COLUMN snapshot_id TEXT")
            print(f"✅ Added column snapshot_id")
        else:
            print(f"ℹ️ Column snapshot_id already exists, skipping")
        
        conn.commit()
        print("✅ Migration completed successfully")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
