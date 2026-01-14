from fastapi import APIRouter, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/debug", tags=["debug"])

class LogEntry(BaseModel):
    level: str
    message: str
    timestamp: str
    stack: Optional[str] = None

class LogData(BaseModel):
    user_id: Any
    username: str
    timestamp: str
    logs: List[LogEntry]
    debug_info: Optional[Dict[str, Any]] = None

@router.post("/logs")
async def receive_logs(log_data: LogData):
    """
    Принимает логи от клиента для отладки.
    Логи выводятся в консоль сервера.
    """
    user_id = log_data.user_id
    username = log_data.username
    timestamp = log_data.timestamp
    
    # Получаем debug_info если есть
    debug_info = log_data.debug_info
    
    print(f"\n{'='*80}")
    print(f"📡 REMOTE LOGS from user_id={user_id} (@{username}) at {timestamp}")
    if debug_info:
        print(f"   URL: {debug_info.get('url', 'N/A')}")
        print(f"   Platform: {debug_info.get('platform', 'N/A')}")
        print(f"   Telegram: {debug_info.get('telegramVersion', 'N/A')} ({debug_info.get('telegramPlatform', 'N/A')})")
        print(f"   Screen: {debug_info.get('screenSize', 'N/A')}, Viewport: {debug_info.get('viewportSize', 'N/A')}")
    print(f"{'='*80}")
    
    for log_entry in log_data.logs:
        level = log_entry.level.upper()
        message = log_entry.message
        log_timestamp = log_entry.timestamp
        
        # Форматируем вывод в зависимости от уровня
        if level == 'ERROR':
            print(f"❌ [{level}] {log_timestamp}: {message}")
        elif level == 'WARN':
            print(f"⚠️  [{level}] {log_timestamp}: {message}")
        elif level == 'INFO':
            print(f"ℹ️  [{level}] {log_timestamp}: {message}")
        else:
            print(f"📝 [{level}] {log_timestamp}: {message}")
        
        # Выводим stack trace для ошибок
        if log_entry.stack and level == 'ERROR':
            # Ограничиваем длину stack trace
            stack_lines = log_entry.stack.split('\n')
            if len(stack_lines) > 20:
                stack_lines = stack_lines[:20] + ['   ... (truncated)']
            print(f"   Stack trace:\n" + '\n'.join(stack_lines))
    
    print(f"{'='*80}\n")
    
    return {"status": "ok", "received": len(log_data.logs)}
