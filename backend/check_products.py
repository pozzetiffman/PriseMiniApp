#!/usr/bin/env python3
"""Скрипт для проверки товаров и их изображений в БД"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from app.db.database import SessionLocal
from app.db.models import Product

db = SessionLocal()

print("=" * 50)
print("ПРОВЕРКА ТОВАРОВ В БД")
print("=" * 50)

products = db.query(Product).all()
print(f"\nВсего товаров в БД: {len(products)}\n")

for prod in products:
    print(f"Товар ID {prod.id}: '{prod.name}'")
    print(f"  - user_id: {prod.user_id}")
    print(f"  - price: {prod.price} ₽")
    print(f"  - image_url: {prod.image_url}")
    
    if prod.image_url:
        # Проверяем, существует ли файл
        if prod.image_url.startswith('/static/'):
            file_path = prod.image_url[1:]  # Убираем первый /
            abs_path = os.path.abspath(file_path)
            exists = os.path.exists(file_path)
            if exists:
                size = os.path.getsize(file_path)
                print(f"  - Файл существует: ✅ {abs_path} ({size} bytes)")
            else:
                print(f"  - Файл НЕ существует: ❌ {abs_path}")
        else:
            print(f"  - image_url не является статическим путем")
    else:
        print(f"  - Нет image_url")
    print()

db.close()







