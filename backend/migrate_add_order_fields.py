"""
Миграция: Добавление полей для формы оформления заказа
Добавляет поля: промокод, имя, фамилия, отчество, телефон, код страны, почта, примечание, способ доставки, статус заказа
"""
import sqlite3
import os

DB_PATH = "sql_app.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Проверяем, существуют ли уже эти поля
        cursor.execute("PRAGMA table_info(orders)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Добавляем новые поля, если их еще нет
        if 'promo_code' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN promo_code TEXT")
            print("✅ Added promo_code column")
        
        if 'first_name' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN first_name TEXT")
            print("✅ Added first_name column")
        
        if 'last_name' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN last_name TEXT")
            print("✅ Added last_name column")
        
        if 'middle_name' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN middle_name TEXT")
            print("✅ Added middle_name column")
        
        if 'phone_country_code' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN phone_country_code TEXT")
            print("✅ Added phone_country_code column")
        
        if 'phone_number' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN phone_number TEXT")
            print("✅ Added phone_number column")
        
        if 'email' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN email TEXT")
            print("✅ Added email column")
        
        if 'notes' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN notes TEXT")
            print("✅ Added notes column")
        
        if 'delivery_method' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN delivery_method TEXT")
            print("✅ Added delivery_method column")
        
        if 'status' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'")
            print("✅ Added status column")
        
        conn.commit()
        print("✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration error: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()



