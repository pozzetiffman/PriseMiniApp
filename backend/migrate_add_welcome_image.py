"""
Миграция для добавления поля welcome_image_url в таблицу shop_settings
"""
import sqlite3
import os

def migrate():
    """Добавляет поле welcome_image_url в таблицу shop_settings"""
    db_path = "sql_app.db"
    
    if not os.path.exists(db_path):
        print(f"❌ База данных {db_path} не найдена!")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Получаем список колонок в таблице shop_settings
        cursor.execute("PRAGMA table_info(shop_settings)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        # Проверяем, существует ли поле welcome_image_url
        if 'welcome_image_url' in column_names:
            print("Поле welcome_image_url уже существует в таблице shop_settings")
        else:
            # Добавляем поле welcome_image_url
            print("Добавление поля welcome_image_url в таблицу shop_settings...")
            cursor.execute("ALTER TABLE shop_settings ADD COLUMN welcome_image_url VARCHAR")
            conn.commit()
            print("✅ Миграция успешно выполнена! Поле welcome_image_url добавлено в таблицу shop_settings")
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()







