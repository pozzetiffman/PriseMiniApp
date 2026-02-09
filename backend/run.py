"""
Запуск uvicorn с управлением access log через env.
UVICORN_ACCESS_LOG=1 — включить access log (INFO: 176.x "GET ... 200 OK").
UVICORN_ACCESS_LOG=0 (по умолчанию) — выключить.
"""
import os
import uvicorn

access_log = os.getenv("UVICORN_ACCESS_LOG", "0").strip() in ("1", "true", "yes")
uvicorn.run(
    "app.main:app",
    host="0.0.0.0",
    port=8000,
    reload=True,
    access_log=access_log,
)
