from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
import time

SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"

# Настройки для оптимизации SQLite и предотвращения зависаний
connect_args = {
    "check_same_thread": False,
    "timeout": 10.0,  # Таймаут для операций с БД (10 секунд)
}

# NullPool для SQLite: не держим пул соединений, чтобы избежать
# QueuePool limit reached при большом числе одновременных запросов (favorites/check, PATCH и т.д.)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    poolclass=NullPool,
    echo=False  # Отключить SQL логирование для производительности
)

# Оптимизация SQLite для лучшей производительности
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """Настройка SQLite для лучшей производительности и предотвращения блокировок"""
    cursor = dbapi_conn.cursor()
    # WAL mode для лучшей конкурентности
    cursor.execute("PRAGMA journal_mode=WAL")
    # Увеличиваем таймаут для операций
    cursor.execute("PRAGMA busy_timeout=10000")  # 10 секунд
    # Оптимизация для производительности
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=10000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependency для получения сессии БД"""
    import time
    db_start = time.time()
    db = SessionLocal()
    try:
        # КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Логируем создание сессии БД
        db_time = time.time() - db_start
        if db_time > 0.1:
            print(f"⚠️ [DB] Session creation took {db_time:.3f}s - this is slow!")
        yield db
    finally:
        db.close()

