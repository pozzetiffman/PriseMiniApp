"""
Центральная настройка логирования backend.
- LOG_LEVEL=INFO|WARNING|ERROR|DEBUG
- Маскирование: initData, hash, query_id, token, email, phone
- Обрезка сообщений до 4000 символов
"""
import os
import re
import logging
import sys

LOG_LEVEL = os.getenv("LOG_LEVEL", "WARNING").upper()
if LOG_LEVEL not in ("DEBUG", "INFO", "WARNING", "ERROR"):
    LOG_LEVEL = "WARNING"

def _mask_sensitive(msg: str) -> str:
    if not isinstance(msg, str):
        msg = str(msg)
    msg = re.sub(r'x-telegram-init-data[^\s,]*', 'x-telegram-init-data=***', msg, flags=re.I)
    msg = re.sub(r'initData[=:][^\s,]+', 'initData=***', msg, flags=re.I)
    msg = re.sub(r'query_id=[^&\s]+', 'query_id=***', msg, flags=re.I)
    msg = re.sub(r'auth_date=\d+', 'auth_date=***', msg, flags=re.I)
    msg = re.sub(r'hash=[a-f0-9]+', 'hash=***', msg, flags=re.I)
    msg = re.sub(r'user=[^&\s]+', 'user=***', msg, flags=re.I)
    msg = re.sub(r'token[=:][^\s,]+', 'token=***', msg, flags=re.I)
    msg = re.sub(r'X-Telegram-Init-Data[^\s,]*', 'X-Telegram-Init-Data=***', msg, flags=re.I)
    msg = re.sub(r'[\w.-]+@[\w.-]+\.\w+', '[email]', msg)
    msg = re.sub(r'\+\d{10,15}', '[phone]', msg)
    if len(msg) > 4000:
        msg = msg[:4000] + '...[truncated]'
    return msg

class SensitiveFilter(logging.Filter):
    def filter(self, record):
        record.msg = _mask_sensitive(str(record.msg))
        if record.args and isinstance(record.args, tuple):
            record.args = tuple(_mask_sensitive(str(a)) if a is not None else a for a in record.args)
        return True

def setup_logging():
    level = getattr(logging, LOG_LEVEL, logging.WARNING)
    fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    for h in logging.root.handlers:
        h.addFilter(SensitiveFilter())

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
