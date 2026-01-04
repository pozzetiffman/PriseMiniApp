"""
Миграция: Заполнение snapshot данных для существующих purchases

Эта миграция заполняет snapshot данные для purchases, которые были созданы до миграции
и не имеют snapshot данных. Используются актуальные данные товара на момент выполнения миграции.
"""

import sqlite3
import json
import os

def migrate():
    db_path = "sql_app.db"
    if not os.path.exists(db_path):
        print(f"❌ Database file {db_path} not found")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Получаем все purchases, у которых нет snapshot данных
        cursor.execute("""
            SELECT p.id, p.product_id, p.user_id, p.purchased_by_user_id, p.created_at
            FROM purchases p
            WHERE p.product_name IS NULL OR p.product_price IS NULL
        """)
        
        purchases = cursor.fetchall()
        print(f"📦 Found {len(purchases)} purchases without snapshot data")
        
        updated_count = 0
        for purchase_id, product_id, user_id, purchased_by_user_id, created_at in purchases:
            # Получаем товар
            cursor.execute("""
                SELECT id, name, price, discount, image_url, images_urls, 
                       is_for_sale, price_type, price_fixed, price_from, price_to
                FROM products
                WHERE id = ?
            """, (product_id,))
            
            product = cursor.fetchone()
            if not product:
                print(f"⚠️ Product {product_id} not found for purchase {purchase_id}")
                continue
            
            prod_id, prod_name, prod_price, prod_discount, prod_image_url, prod_images_urls, \
            prod_is_for_sale, prod_price_type, prod_price_fixed, prod_price_from, prod_price_to = product
            
            # Обновляем snapshot данные
            cursor.execute("""
                UPDATE purchases
                SET product_name = ?,
                    product_price = ?,
                    product_discount = ?,
                    product_image_url = ?,
                    product_images_urls = ?,
                    product_is_for_sale = ?,
                    product_price_type = ?,
                    product_price_fixed = ?,
                    product_price_from = ?,
                    product_price_to = ?
                WHERE id = ?
            """, (
                prod_name,
                prod_price,
                prod_discount,
                prod_image_url,
                prod_images_urls,
                prod_is_for_sale,
                prod_price_type,
                prod_price_fixed,
                prod_price_from,
                prod_price_to,
                purchase_id
            ))
            
            updated_count += 1
            print(f"✅ Updated purchase {purchase_id} (product: {prod_name}, is_for_sale: {prod_is_for_sale}, price_from: {prod_price_from}, price_to: {prod_price_to})")
        
        conn.commit()
        print(f"✅ Migration completed: updated {updated_count} purchases")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()




