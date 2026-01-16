"""
Модуль для проверки целостности схемы БД при старте приложения.
Проверяет соответствие структуры таблиц моделям SQLAlchemy.
"""
import sqlite3
from typing import List, Tuple
from pathlib import Path


def check_schema_integrity(db_path: str = "sql_app.db") -> Tuple[bool, List[str]]:
    """
    Проверяет целостность схемы БД.
    
    Returns:
        Tuple[bool, List[str]]: (is_valid, list_of_issues)
    """
    issues = []
    
    # Находим путь к БД (относительно backend/app)
    backend_dir = Path(__file__).parent.parent.parent
    db_full_path = backend_dir / db_path
    
    if not db_full_path.exists():
        # Если БД не существует, это нормально - она будет создана
        return True, []
    
    try:
        conn = sqlite3.connect(str(db_full_path))
        cursor = conn.cursor()
        
        # Проверяем критичные таблицы
        critical_tables = {
            'categories': ['id', 'name', 'user_id', 'bot_id', 'parent_id'],
            'products': ['id', 'name', 'user_id', 'category_id'],
            'sold_products': ['id', 'product_id', 'user_id', 'category_id'],
            'user_product_snapshots': ['id', 'snapshot_id', 'product_id', 'user_id']
        }
        
        for table_name, required_columns in critical_tables.items():
            # Проверяем существование таблицы
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table_name,)
            )
            if not cursor.fetchone():
                issues.append(f"Таблица {table_name} не существует")
                continue
            
            # Получаем информацию о колонках
            cursor.execute(f"PRAGMA table_info({table_name})")
            existing_columns = {row[1] for row in cursor.fetchall()}
            
            # Проверяем наличие обязательных колонок
            for col in required_columns:
                if col not in existing_columns:
                    issues.append(
                        f"Таблица {table_name}: отсутствует колонка {col}"
                    )
        
        # Специальная проверка: sold_products не должна иметь snapshot_id
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sold_products'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(sold_products)")
            sold_products_columns = {row[1] for row in cursor.fetchall()}
            if 'snapshot_id' in sold_products_columns:
                issues.append(
                    "Таблица sold_products: обнаружена устаревшая колонка snapshot_id "
                    "(должна быть удалена из модели)"
                )
        
        # Специальная проверка: user_product_snapshots должна иметь id как PRIMARY KEY
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_product_snapshots'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(user_product_snapshots)")
            snapshot_columns = {row[1]: {'pk': row[5]} for row in cursor.fetchall()}
            
            if 'id' not in snapshot_columns:
                issues.append(
                    "Таблица user_product_snapshots: отсутствует колонка id (PRIMARY KEY) - "
                    "выполните миграцию: python migrate_add_id_to_user_product_snapshots.py"
                )
            elif not snapshot_columns['id']['pk']:
                issues.append(
                    "Таблица user_product_snapshots: колонка id существует, но не является PRIMARY KEY - "
                    "выполните миграцию: python migrate_add_id_to_user_product_snapshots.py"
                )
        
        conn.close()
        
        return len(issues) == 0, issues
        
    except sqlite3.Error as e:
        issues.append(f"Ошибка при проверке схемы БД: {e}")
        return False, issues
    except Exception as e:
        issues.append(f"Неожиданная ошибка при проверке схемы: {e}")
        return False, issues


def log_schema_status():
    """Выводит статус схемы БД в логи"""
    is_valid, issues = check_schema_integrity()
    
    if is_valid:
        print("✅ Проверка целостности схемы БД: успешно")
    else:
        print("⚠️  Проверка целостности схемы БД: обнаружены проблемы:")
        for issue in issues:
            print(f"   - {issue}")
        print("   Рекомендуется выполнить миграцию:")
        if any("user_product_snapshots" in issue for issue in issues):
            print("     - python migrate_add_id_to_user_product_snapshots.py")
        if any("sold_products" in issue or "categories" in issue or "products" in issue for issue in issues):
            print("     - python migrate_fix_schema_consistency.py")
