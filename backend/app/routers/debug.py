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
    Выводит в stdout только критические ошибки (ERROR level).
    """
    # Обрабатываем только критические ошибки (ERROR level)
    error_logs = [log for log in log_data.logs if log.level.upper() == 'ERROR']
    
    if error_logs:
        user_id = log_data.user_id
        username = log_data.username
        timestamp = log_data.timestamp
        
        print(f"\n{'='*80}")
        print(f"📡 REMOTE ERROR LOGS from user_id={user_id} (@{username}) at {timestamp}")
        print(f"{'='*80}")
        
        for log_entry in error_logs:
            message = log_entry.message
            log_timestamp = log_entry.timestamp
            
            print(f"❌ [ERROR] {log_timestamp}: {message}")
            
            # Выводим stack trace для ошибок
            if log_entry.stack:
                # Ограничиваем длину stack trace
                stack_lines = log_entry.stack.split('\n')
                if len(stack_lines) > 20:
                    stack_lines = stack_lines[:20] + ['   ... (truncated)']
                print(f"   Stack trace:\n" + '\n'.join(stack_lines))
        
        print(f"{'='*80}\n")
    
    return {"status": "ok", "received": len(log_data.logs)}
