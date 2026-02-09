"""
Универсальный helper для бизнес-событий (безопасное логирование).
"""
import re

def _safe_val(v):
    if v is None: return "null"
    s = str(v)
    s = re.sub(r'query_id=[^&\s]+', 'query_id=***', s, flags=re.I)
    s = re.sub(r'hash=[a-f0-9]+', 'hash=***', s, flags=re.I)
    s = re.sub(r'initData[=:][^\s,]+', 'initData=***', s, flags=re.I)
    s = re.sub(r'token[=:][^\s,]+', 'token=***', s, flags=re.I)
    if len(s) > 500: s = s[:500] + "...[truncated]"
    return s

def log_event(logger, event: str, level: str = "info", **fields):
    """
    Безопасно логирует бизнес-событие.
    event: ORDER_CREATED, PURCHASE_CREATED, RESERVATION_CREATED, CHECKOUT_BLOCKED, AUTH_NO_INITDATA, AUTH_INVALID_SIGNATURE
    level: info (ORDER_CREATED и т.д.), warning (AUTH_*), error (исключения)
    """
    safe = " ".join(f"{k}={_safe_val(v)}" for k, v in sorted(fields.items()))
    msg = f"EVENT {event} {safe}".strip()
    if level == "warning":
        logger.warning(msg)
    elif level == "error":
        logger.error(msg)
    else:
        logger.info(msg)
