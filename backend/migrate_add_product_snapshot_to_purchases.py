"""
Миграция: Добавление полей snapshot данных товара в таблицу purchases

Эта миграция добавляет поля для сохранения snapshot данных товара на момент создания продажи:
- product_name - название товара
- product_price - цена товара
- product_discount - скидка товара
- product_image_url - первое изображение товара
- product_images_urls - JSON массив URL изображений товара
- product_is_for_sale - is_for_sale на момент создания
- product_price_type - price_type на момент создания
- product_price_fixed - price_fixed на момент создания
- product_price_from - price_from на момент создания
- product_price_to - price_to на момент создания

Это необходимо для того, чтобы в корзине отображались данные товара на момент создания продажи,
а не актуальные данные товара (которые могут измениться после создания продажи).
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
        # Проверяем, существуют ли уже эти поля
        cursor.execute("PRAGMA table_info(purchases)")
        columns = [column[1] for column in cursor.fetchall()]
        
        fields_to_add = [
            ("product_name", "TEXT"),
            ("product_price", "REAL"),
            ("product_discount", "REAL"),
            ("product_image_url", "TEXT"),
            ("product_images_urls", "TEXT"),
            ("product_is_for_sale", "BOOLEAN"),
            ("product_price_type", "TEXT"),
            ("product_price_fixed", "REAL"),
            ("product_price_from", "REAL"),
            ("product_price_to", "REAL")
        ]
        
        for field_name, field_type in fields_to_add:
            if field_name not in columns:
                print(f"➕ Adding column {field_name} to purchases table...")
                cursor.execute(f"ALTER TABLE purchases ADD COLUMN {field_name} {field_type}")
                print(f"✅ Added column {field_name}")
            else:
                print(f"ℹ️ Column {field_name} already exists, skipping")
        
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






