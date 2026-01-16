#!/usr/bin/env python3
"""
Миграция для добавления колонки id (INTEGER PRIMARY KEY) в таблицу user_product_snapshots.

Проблема:
- Модель SQLAlchemy UserProductSnapshot ожидает колонку id как PRIMARY KEY
- В реальной БД PRIMARY KEY - это snapshot_id (VARCHAR), колонки id нет
- Это вызывает ошибку: "no such column: user_product_snapshots.id"

Решение:
- Пересоздаем таблицу с колонкой id как PRIMARY KEY
- snapshot_id остается как UNIQUE NOT NULL (бизнес-логика)
- Сохраняем все существующие данные

ВАЖНО: SQLite не поддерживает изменение PRIMARY KEY, поэтому пересоздаем таблицу.
"""
import sqlite3
import os
import shutil
from datetime import datetime

# Путь к базе данных
DB_PATH = "sql_app.db"
BACKUP_SUFFIX = f"_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

def create_backup():
    """Создает резервную копию базы данных"""
    if not os.path.exists(DB_PATH):
        print(f"⚠️  База данных {DB_PATH} не найдена.")
        return False
    
    backup_path = DB_PATH + BACKUP_SUFFIX
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ Создана резервная копия: {backup_path}")
    return True

def migrate():
    """Добавляет колонку id в user_product_snapshots"""
    if not os.path.exists(DB_PATH):
        print(f"⚠️  База данных {DB_PATH} не найдена.")
        print("   Таблица будет создана при следующем запуске приложения.")
        return
    
    # Создаем резервную копию
    if not create_backup():
        print("❌ Не удалось создать резервную копию. Миграция отменена.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        print("\n🔍 Проверка текущей структуры таблицы user_product_snapshots...\n")
        
        # Проверяем существование таблицы
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='user_product_snapshots'"
        )
        if not cursor.fetchone():
            print("⚠️  Таблица user_product_snapshots не существует.")
            print("   Она будет создана при следующем запуске приложения с корректной структурой.")
            conn.close()
            return
        
        # Проверяем текущие колонки
        cursor.execute("PRAGMA table_info(user_product_snapshots)")
        columns = {row[1]: {'type': row[2], 'pk': row[5]} for row in cursor.fetchall()}
        
        print("📋 Текущая структура:")
        for col_name, col_info in columns.items():
            pk_marker = " (PRIMARY KEY)" if col_info['pk'] else ""
            print(f"   - {col_name}: {col_info['type']}{pk_marker}")
        
        # Проверяем, есть ли уже колонка id
        if 'id' in columns:
            if columns['id']['pk']:
                print("\n✅ Колонка id уже существует и является PRIMARY KEY.")
                print("   Миграция не требуется.")
                conn.close()
                return
            else:
                print("\n⚠️  Колонка id существует, но не является PRIMARY KEY.")
                print("   Потребуется пересоздание таблицы.")
        else:
            print("\n❌ Колонка id отсутствует - требуется добавление.")
        
        # Проверяем, есть ли данные
        cursor.execute("SELECT COUNT(*) FROM user_product_snapshots")
        row_count = cursor.fetchone()[0]
        print(f"\n📊 Количество записей: {row_count}")
        
        if row_count == 0:
            print("\n📝 Таблица пустая - можем просто пересоздать её.")
            # Просто пересоздаем таблицу
            cursor.execute("DROP TABLE user_product_snapshots")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_created_at")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_user_id")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_snapshot_id")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_operation_type")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_product_id")
            
            cursor.execute("""
                CREATE TABLE user_product_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_id VARCHAR NOT NULL UNIQUE,
                    product_id INTEGER,
                    user_id BIGINT,
                    operation_type VARCHAR,
                    snapshot_json TEXT NOT NULL,
                    status_at_time VARCHAR,
                    created_at DATETIME,
                    FOREIGN KEY (product_id) REFERENCES products (id)
                )
            """)
            
            # Создаем индексы
            cursor.execute("CREATE INDEX ix_user_product_snapshots_created_at ON user_product_snapshots (created_at)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_user_id ON user_product_snapshots (user_id)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_snapshot_id ON user_product_snapshots (snapshot_id)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_operation_type ON user_product_snapshots (operation_type)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_product_id ON user_product_snapshots (product_id)")
            
            print("✅ Таблица пересоздана с корректной структурой (id как PRIMARY KEY).")
            
        else:
            print("\n📝 Таблица содержит данные - пересоздаем с сохранением данных...")
            
            # Сохраняем данные
            cursor.execute("SELECT snapshot_id, product_id, user_id, operation_type, snapshot_json, status_at_time, created_at FROM user_product_snapshots")
            data = cursor.fetchall()
            
            print(f"   Сохранено {len(data)} записей.")
            
            # Пересоздаем таблицу
            cursor.execute("DROP TABLE user_product_snapshots")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_created_at")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_user_id")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_snapshot_id")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_operation_type")
            cursor.execute("DROP INDEX IF EXISTS ix_user_product_snapshots_product_id")
            
            cursor.execute("""
                CREATE TABLE user_product_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_id VARCHAR NOT NULL UNIQUE,
                    product_id INTEGER,
                    user_id BIGINT,
                    operation_type VARCHAR,
                    snapshot_json TEXT NOT NULL,
                    status_at_time VARCHAR,
                    created_at DATETIME,
                    FOREIGN KEY (product_id) REFERENCES products (id)
                )
            """)
            
            # Восстанавливаем данные
            cursor.executemany("""
                INSERT INTO user_product_snapshots 
                (snapshot_id, product_id, user_id, operation_type, snapshot_json, status_at_time, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, data)
            
            restored_count = cursor.rowcount
            print(f"   Восстановлено {restored_count} записей.")
            
            # Создаем индексы
            cursor.execute("CREATE INDEX ix_user_product_snapshots_created_at ON user_product_snapshots (created_at)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_user_id ON user_product_snapshots (user_id)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_snapshot_id ON user_product_snapshots (snapshot_id)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_operation_type ON user_product_snapshots (operation_type)")
            cursor.execute("CREATE INDEX ix_user_product_snapshots_product_id ON user_product_snapshots (product_id)")
            
            print("✅ Таблица пересоздана с корректной структурой (id как PRIMARY KEY).")
            print("✅ Все данные сохранены и восстановлены.")
        
        # Проверяем результат
        cursor.execute("PRAGMA table_info(user_product_snapshots)")
        new_columns = {row[1]: {'type': row[2], 'pk': row[5], 'notnull': row[3]} for row in cursor.fetchall()}
        
        print("\n📋 Новая структура:")
        for col_name, col_info in new_columns.items():
            pk_marker = " (PRIMARY KEY)" if col_info['pk'] else ""
            notnull_marker = " NOT NULL" if col_info['notnull'] else ""
            print(f"   - {col_name}: {col_info['type']}{notnull_marker}{pk_marker}")
        
        # Проверяем, что id теперь PRIMARY KEY
        if 'id' in new_columns and new_columns['id']['pk']:
            print("\n✅ Колонка id успешно создана как PRIMARY KEY.")
        else:
            print("\n❌ ОШИБКА: Колонка id не является PRIMARY KEY!")
            raise Exception("Миграция не завершилась корректно")
        
        conn.commit()
        print("\n✅ Миграция успешно выполнена!")
        print("\n📋 Итоговый статус:")
        print("   - Колонка id добавлена как INTEGER PRIMARY KEY")
        print("   - snapshot_id остается UNIQUE (бизнес-логика)")
        print("   - Все данные сохранены")
        print("   - Индексы восстановлены")
        print("   - Модель SQLAlchemy теперь соответствует схеме БД")
        
    except sqlite3.Error as e:
        print(f"\n❌ Ошибка при выполнении миграции: {e}")
        conn.rollback()
        print("   Изменения отменены. Используйте резервную копию для восстановления.")
        raise
    except Exception as e:
        print(f"\n❌ Неожиданная ошибка: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 70)
    print("Миграция: Добавление колонки id в user_product_snapshots")
    print("=" * 70)
    migrate()
