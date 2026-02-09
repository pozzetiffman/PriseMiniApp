# Генерация уникального номера операции (order_number).
# Используется для Order, Purchase, SaleOrder. Резервации не трогаем.

import secrets


def generate_order_number_11() -> str:
    """
    Генерирует уникальный номер из 11 цифр (без ведущих нулей).
    Диапазон: 10000000000 .. 99999999999.
    Используем secrets (крипто-рандом), чтобы номер нельзя было предсказать.
    Уникальность обеспечивается на уровне БД (unique index); при коллизии
    вызывающий код делает повторную попытку с новым номером.
    """
    n = secrets.randbelow(90000000000) + 10000000000  # 10^10 .. 10^11 - 1
    return str(n)


def generate_order_number(prefix: str) -> str:
    """
    Устаревший формат PREFIX-YYYYMMDD-HHMM-XXXX (оставлен для совместимости).
    Новые записи создаются через generate_order_number_11().
    """
    from datetime import datetime, timezone
    import random
    import string
    now = datetime.now(timezone.utc)
    date_part = now.strftime("%Y%m%d")
    time_part = now.strftime("%H%M")
    random_part = "".join(random.choices(string.hexdigits.lower()[:16], k=4))
    return f"{prefix}-{date_part}-{time_part}-{random_part}"
