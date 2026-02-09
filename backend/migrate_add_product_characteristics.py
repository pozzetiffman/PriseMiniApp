"""
Миграция для добавления таблиц product_characteristics и characteristic_names.

product_characteristics — характеристики товара (FK product_id).
characteristic_names — справочник названий характеристик для быстрого выбора (по user_id + bot_id).
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "sql_app.db"


def migrate():
    """Создать таблицы product_characteristics и characteristic_names"""
    if not DB_PATH.exists():
        print(f"❌ База данных не найдена: {DB_PATH}")
        return

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    try:
        # Проверяем, существует ли уже таблица product_characteristics
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='product_characteristics'"
        )
        if cursor.fetchone():
            print("ℹ️ Таблица product_characteristics уже существует")
        else:
            cursor.execute("""
                CREATE TABLE product_characteristics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    value TEXT NOT NULL,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                )
            """)
            cursor.execute(
                "CREATE INDEX idx_product_characteristics_product_id ON product_characteristics(product_id)"
            )
            print("✅ Создана таблица product_characteristics")

        # Проверяем, существует ли уже таблица characteristic_names
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='characteristic_names'"
        )
        if cursor.fetchone():
            print("ℹ️ Таблица characteristic_names уже существует")
        else:
            cursor.execute("""
                CREATE TABLE characteristic_names (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    user_id INTEGER NULL,
                    bot_id INTEGER NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, bot_id, name)
                )
            """)
            cursor.execute(
                "CREATE INDEX idx_characteristic_names_user_bot ON characteristic_names(user_id, bot_id)"
            )
            print("✅ Создана таблица characteristic_names")

        conn.commit()
        print("✅ Миграция успешно завершена")

    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка при миграции: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
