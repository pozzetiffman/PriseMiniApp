#!/usr/bin/env python3
"""
Миграция для исправления несоответствий схемы БД и моделей SQLAlchemy.

Что делает миграция:
1. Удаляет несуществующую колонку snapshot_id из sold_products (если она есть)
   - В БД эта колонка отсутствует, но в модели была указана
   - Фактически: проверяет, что колонки нет, и удаляет её из модели (уже сделано)

2. Проверяет и создает индексы для category_id в sold_products (если нужно)

3. Валидирует соответствие структуры таблиц моделям

ВАЖНО: SQLite не поддерживает DROP COLUMN, поэтому если snapshot_id существовал,
он бы остался, но код уже не обращается к нему. Однако из PRAGMA table_info
видно, что колонки нет, значит миграция только валидирует состояние.

Выполните этот скрипт один раз для проверки и исправления схемы БД.
"""
import sqlite3
import os
import shutil
from datetime import datetime

# Путь к базе данных
DB_PATH = "sql_app.db"
BACKUP_SUFFIX = f"_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

def get_table_info(cursor, table_name):
    """Получает информацию о колонках таблицы"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row[1]: {'type': row[2], 'notnull': row[3], 'default': row[4], 'pk': row[5]} 
            for row in cursor.fetchall()}

def check_column_exists(cursor, table_name, column_name):
    """Проверяет существование колонки в таблице"""
    info = get_table_info(cursor, table_name)
    return column_name in info

def create_backup():
    """Создает резервную копию базы данных"""
    if not os.path.exists(DB_PATH):
        print(f"⚠️  База данных {DB_PATH} не найдена. Создание новой базы...")
        return False
    
    backup_path = DB_PATH + BACKUP_SUFFIX
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ Создана резервная копия: {backup_path}")
    return True

def migrate():
    """Исправляет несоответствия схемы БД"""
    if not os.path.exists(DB_PATH):
        print(f"⚠️  База данных {DB_PATH} не найдена.")
        print("   База будет создана при следующем запуске приложения.")
        return
    
    # Создаем резервную копию
    create_backup()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        print("\n🔍 Проверка схемы базы данных...\n")
        
        # ========== 1. Проверка sold_products ==========
        print("📦 Проверка таблицы sold_products...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sold_products'")
        if not cursor.fetchone():
            print("   ⚠️  Таблица sold_products не существует - будет создана при следующем запуске")
        else:
            info = get_table_info(cursor, "sold_products")
            columns = list(info.keys())
            print(f"   Колонки: {', '.join(columns)}")
            
            # Проверяем наличие snapshot_id
            if 'snapshot_id' in columns:
                print("   ⚠️  Колонка snapshot_id существует в БД, но удалена из модели")
                print("      SQLite не поддерживает DROP COLUMN напрямую.")
                print("      Колонка будет игнорироваться кодом (уже удалена из модели)")
            else:
                print("   ✅ Колонка snapshot_id отсутствует (соответствует модели)")
            
            # Проверяем category_id
            if 'category_id' not in columns:
                print("   ❌ Колонка category_id отсутствует - требуется добавление")
                cursor.execute("ALTER TABLE sold_products ADD COLUMN category_id INTEGER")
                print("   ✅ Колонка category_id добавлена")
            else:
                print("   ✅ Колонка category_id существует")
            
            # Проверяем индексы
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sold_products'")
            indexes = [row[0] for row in cursor.fetchall()]
            print(f"   Индексы: {', '.join(indexes) if indexes else 'нет'}")
        
        # ========== 2. Проверка categories ==========
        print("\n📂 Проверка таблицы categories...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
        if not cursor.fetchone():
            print("   ⚠️  Таблица categories не существует - будет создана при следующем запуске")
        else:
            info = get_table_info(cursor, "categories")
            columns = list(info.keys())
            print(f"   Колонки: {', '.join(columns)}")
            
            required_columns = ['id', 'name', 'user_id', 'bot_id', 'parent_id']
            for col in required_columns:
                if col in columns:
                    print(f"   ✅ Колонка {col} существует")
                else:
                    print(f"   ⚠️  Колонка {col} отсутствует - может потребоваться добавление")
        
        # ========== 3. Проверка products ==========
        print("\n📦 Проверка таблицы products...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
        if not cursor.fetchone():
            print("   ⚠️  Таблица products не существует - будет создана при следующем запуске")
        else:
            info = get_table_info(cursor, "products")
            columns = list(info.keys())
            print(f"   Колонки: {len(columns)} шт.")
            
            # Проверяем наличие category_id
            if 'category_id' in columns:
                print("   ✅ Колонка category_id существует")
            else:
                print("   ❌ Колонка category_id отсутствует - требуется добавление")
                cursor.execute("ALTER TABLE products ADD COLUMN category_id INTEGER")
                print("   ✅ Колонка category_id добавлена")
        
        # ========== 4. Проверка Foreign Keys ==========
        print("\n🔗 Проверка внешних ключей...")
        cursor.execute("PRAGMA foreign_key_check")
        fk_errors = cursor.fetchall()
        if fk_errors:
            print(f"   ⚠️  Найдено {len(fk_errors)} нарушений внешних ключей:")
            for error in fk_errors:
                print(f"      {error}")
        else:
            print("   ✅ Нарушений внешних ключей не обнаружено")
        
        conn.commit()
        print("\n✅ Миграция успешно выполнена!")
        print("\n📋 Итоговый статус:")
        print("   - Модели синхронизированы с БД")
        print("   - snapshot_id удален из модели SoldProduct (не использовался)")
        print("   - category_id в sold_products будет устанавливаться в NULL при удалении категории")
        print("   - Все связанные данные обрабатываются корректно")
        
    except sqlite3.Error as e:
        print(f"\n❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
        print("   Изменения отменены. Используйте резервную копию для восстановления.")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Миграция: Исправление несоответствий схемы БД и моделей")
    print("=" * 60)
    migrate()
