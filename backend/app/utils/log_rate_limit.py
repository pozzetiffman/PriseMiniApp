"""
In-memory rate limiter для логов. Без внешних зависимостей.
"""
import time
from collections import OrderedDict

_CACHE = OrderedDict()
_MAX_KEYS = 500
_TTL = 10  # sec

def _cleanup():
    global _CACHE
    now = time.time()
    to_remove = [k for k, last_ts in list(_CACHE.items()) if now - last_ts > _TTL]
    for k in to_remove:
        _CACHE.pop(k, None)
    while len(_CACHE) > _MAX_KEYS:
        _CACHE.popitem(last=False)

def allow(key: str, interval_sec: int = 10) -> bool:
    """Возвращает True если лог разрешён (прошло >= interval_sec с последнего)."""
    _cleanup()
    now = time.time()
    if key in _CACHE:
        last_ts = _CACHE[key]
        _CACHE.move_to_end(key)
        if now - last_ts < interval_sec:
            return False
    _CACHE[key] = now
    _CACHE.move_to_end(key)
    return True
