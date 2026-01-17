#!/usr/bin/env python3
"""
Миграция для исправления структуры таблицы favorites
Добавляет недостающие колонки и пересоздает таблицу с правильной структурой
"""
import sqlite3
import os

# Путь к базе данных
DB_PATH = "sql_app.db"

def migrate():
    """Исправляет структуру таблицы favorites"""
    if not os.path.exists(DB_PATH):
        print(f"База данных {DB_PATH} не найдена.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существует ли таблица
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'")
        table_exists = cursor.fetchone()
        
        if not table_exists:
            print("Таблица favorites не существует, создаем новую...")
            create_table(cursor)
        else:
            # Проверяем структуру таблицы
            cursor.execute("PRAGMA table_info(favorites)")
            columns = {row[1]: row for row in cursor.fetchall()}
            
            # Проверяем, есть ли новая структура (shop_owner_id)
            if 'shop_owner_id' in columns:
                print("✅ Таблица favorites уже имеет правильную структуру")
                return
            
            # Проверяем, есть ли данные в таблице
            cursor.execute("SELECT COUNT(*) FROM favorites")
            count = cursor.fetchone()[0]
            
            if count > 0:
                print(f"⚠️ В таблице favorites найдено {count} записей со старой структурой")
                print("Пересоздаем таблицу с новой структурой (старые данные будут потеряны)...")
            
            # Удаляем старую таблицу и индексы
            print("Удаление старой таблицы favorites...")
            cursor.execute("DROP INDEX IF EXISTS ix_favorites_product_id")
            cursor.execute("DROP INDEX IF EXISTS ix_favorites_user_id")
            cursor.execute("DROP INDEX IF EXISTS ix_favorites_shop_owner_id")
            cursor.execute("DROP INDEX IF EXISTS ix_favorites_created_at")
            cursor.execute("DROP INDEX IF EXISTS ix_favorites_product_user")
            cursor.execute("DROP TABLE IF EXISTS favorites")
            
            # Создаем новую таблицу с правильной структурой
            create_table(cursor)
        
        conn.commit()
        print("✅ Таблица favorites успешно исправлена!")
        
    except sqlite3.Error as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

def create_table(cursor):
    """Создает таблицу favorites с правильной структурой"""
    print("Создание таблицы favorites с новой структурой...")
    cursor.execute("""
        CREATE TABLE favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            shop_owner_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
        )
    """)
    
    # Создаем индексы
    cursor.execute("CREATE INDEX ix_favorites_product_id ON favorites (product_id)")
    cursor.execute("CREATE INDEX ix_favorites_user_id ON favorites (user_id)")
    cursor.execute("CREATE INDEX ix_favorites_shop_owner_id ON favorites (shop_owner_id)")
    cursor.execute("CREATE INDEX ix_favorites_created_at ON favorites (created_at)")
    
    # Создаем уникальный индекс на пару (product_id, user_id)
    cursor.execute("CREATE UNIQUE INDEX ix_favorites_product_user ON favorites (product_id, user_id)")

if __name__ == "__main__":
    migrate()
