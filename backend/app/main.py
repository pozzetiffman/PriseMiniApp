import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from .db import database, models
from .db.schema_check import log_schema_status
from .routers import products, categories, channels, reservations, context, shop_settings, shop_visits, orders, bots, purchases, debug, favorites, clients, sale_orders, cart, characteristics, deals, pricing

from .utils.logging_config import setup_logging, get_logger
from .utils.log_rate_limit import allow as log_rate_allow
setup_logging()
log = get_logger(__name__)

app_start = time.time()
log.info("APP START: Application initialization")
log_schema_status()

# C) Глобально глушим print() (DISABLE_PY_PRINT=1 по умолчанию) — после startup
import sys
import builtins
_original_print = builtins.print
if os.getenv("DISABLE_PY_PRINT", "1").strip() in ("1", "true", "yes"):
    _app_log = get_logger("app")
    def _silent_print(*args, file=sys.stdout, **kwargs):
        if file is sys.stderr:
            _app_log.error(" ".join(str(a) for a in args))
        elif os.getenv("LOG_LEVEL", "WARNING").upper() == "DEBUG":
            _app_log.debug(" ".join(str(a) for a in args))
    builtins.print = _silent_print

db_init_start = time.time()
models.Base.metadata.create_all(bind=database.engine)
db_init_time = time.time() - db_init_start
log.info("APP START: Database tables created in %.3fs", db_init_time)

app = FastAPI(title="PriseMiniApp API")
app_init_time = time.time() - app_start
log.info("APP START: FastAPI app created in %.3fs", app_init_time)

# Подключаем статику для изображений
if not os.path.exists("static/uploads"):
    os.makedirs("static/uploads")

app.mount("/static", StaticFiles(directory="static"), name="static")

# Подключаем статику для WebApp (фронтенд)
# Определяем путь к webapp относительно backend/app/main.py
backend_dir = Path(__file__).parent.parent
webapp_dir = backend_dir.parent / "webapp"

if webapp_dir.exists():
    # Раздаем статические файлы webapp (CSS, JS, изображения)
    app.mount("/css", StaticFiles(directory=str(webapp_dir / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(webapp_dir / "js")), name="js")
    # Монтируем assets только если директория существует
    assets_dir = webapp_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    
    # Главная страница WebApp
    @app.get("/")
    async def webapp_index():
        """Главная страница WebApp"""
        index_path = webapp_dir / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return {"message": "PriseMiniApp API is running", "webapp": "not found"}
else:
    # Если webapp не найден, возвращаем только API сообщение
    @app.get("/")
    async def root():
        return {"message": "PriseMiniApp API is running", "webapp": "not found"}

DEBUG_MODE = os.getenv("DEBUG", "0") == "1"
LOG_LEVEL = os.getenv("LOG_LEVEL", "WARNING").upper()

# Публичные endpoint'ы (без initData)
PUBLIC_API_PATHS = {"/api/debug/logs", "/api/health", "/api/test-image"}


@app.middleware("http")
async def add_ngrok_headers(request, call_next):
    from .utils.telegram_auth import request_id_ctx
    import uuid

    request_start = time.time()
    headers_dict = dict(request.headers)
    has_init_data = "X-Telegram-Init-Data" in headers_dict and bool(headers_dict.get("X-Telegram-Init-Data"))
    init_data_len = len(headers_dict.get("X-Telegram-Init-Data") or "")
    request_id = headers_dict.get("X-Request-Id") or str(uuid.uuid4())
    request_id_ctx.set(request_id)
    request.state.request_id = request_id

    path = request.url.path
    method = request.method
    client_ip = request.client.host if request.client else "0.0.0.0"

    if path.startswith("/api/") and path not in PUBLIC_API_PATHS:
        if not has_init_data:
            rl_key = f"no_initdata:{path}:{client_ip}"
            if log_rate_allow(rl_key, 10):
                log.warning("REQUEST: %s %s missing initData request_id=%s initData_len=0", method, path, request_id)
        elif LOG_LEVEL == "DEBUG":
            log.debug("REQUEST: %s %s has_initdata request_id=%s initData_len=%s", method, path, request_id, init_data_len)

    try:
        response = await call_next(request)
        request_time_ms = float((time.time() - request_start) * 1000)
        status = response.status_code

        if path.startswith("/api/"):
            if status >= 400:
                # Rate-limit noisy 401 (Invalid initData) to 1 per 10s per path+ip
                if status == 401:
                    rl_key = f"auth_401:{path}:{client_ip}"
                    if not log_rate_allow(rl_key, 10):
                        pass  # skip log
                    else:
                        log.warning("REQUEST: %s %s status=401 duration_ms=%.0f request_id=%s", method, path, request_time_ms, request_id)
                else:
                    log.warning("REQUEST: %s %s status=%s duration_ms=%.0f request_id=%s", method, path, status, request_time_ms, request_id)
            elif request_time_ms > 2000:
                log.warning("REQUEST: Slow %s %s duration_ms=%.0f request_id=%s", method, path, request_time_ms, request_id)
            elif LOG_LEVEL == "DEBUG":
                log.info("REQUEST: %s %s status=%s duration_ms=%.0f request_id=%s", method, path, status, request_time_ms, request_id)
        
        # Добавляем заголовки для статических файлов, WebApp и API endpoints изображений
        if (path.startswith("/static/") or path.startswith("/css/") or path.startswith("/js/") or
            path.startswith("/assets/") or path.startswith("/api/images/") or path == "/" or
            path.endswith(('.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.webp'))):
            response.headers["ngrok-skip-browser-warning"] = "69420"
            # Добавляем CORS заголовки
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            # Кэширование для изображений
            if path.endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')) or path.startswith("/api/images/"):
                response.headers["Cache-Control"] = "public, max-age=31536000"

        # Для всех API endpoints добавляем CORS заголовки
        if path.startswith("/api/"):
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Expose-Headers"] = "*"
            response.headers["ngrok-skip-browser-warning"] = "69420"
        
        return response
    except Exception as e:
        request_time_ms = float((time.time() - request_start) * 1000)
        log.error("REQUEST: Error %s %s after %.0fms: %s request_id=%s", method, path, request_time_ms, str(e), request_id)
        raise

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

router_start = time.time()
app.include_router(context.router)
router_time = time.time() - router_start
log.info("APP START: Routers included in %.3fs", router_time)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(characteristics.router)
app.include_router(channels.router)
app.include_router(reservations.router)
app.include_router(shop_settings.router)
app.include_router(shop_visits.router)
app.include_router(orders.router)
app.include_router(sale_orders.router)
app.include_router(bots.router)
app.include_router(purchases.router)
app.include_router(favorites.router)
app.include_router(cart.router)
app.include_router(clients.router)
app.include_router(deals.router)
app.include_router(pricing.router)
app.include_router(debug.router)

@app.get("/")
async def root():
    return {"message": "PriseMiniApp API is running"}

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/test-image/{filename}")
async def test_image(filename: str):
    """Тестовый endpoint для проверки доступности изображений"""
    file_path = f"static/uploads/{filename}"
    if os.path.exists(file_path):
        return {"exists": True, "path": file_path, "size": os.path.getsize(file_path)}
    return {"exists": False, "path": file_path}

@app.get("/api/images/{filename}")
async def proxy_image(filename: str):
    """
    Проксирует изображения через API endpoint.
    Это обходит блокировку Telegram WebView для ngrok доменов.
    """
    # Безопасность: проверяем, что filename не содержит путь (предотвращаем path traversal)
    if '/' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # Используем абсолютный путь относительно корня проекта
    backend_dir = Path(__file__).parent.parent
    file_path = backend_dir / "static" / "uploads" / filename
    
    if not file_path.exists():
        # Пробуем альтернативный путь (если файл в корне backend)
        alt_path = Path("static/uploads") / filename
        if alt_path.exists():
            file_path = alt_path
        else:
            log.warning("Image not found: %s paths=%s,%s", filename, file_path, alt_path)
            
            # Вместо 404 возвращаем placeholder изображение (1x1 прозрачный PNG)
            # Это позволит фронтенду обработать отсутствие изображения корректно
            placeholder_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
            from fastapi.responses import Response
            return Response(
                content=placeholder_png,
                media_type='image/png',
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Access-Control-Allow-Origin": "*",
                }
            )
    
    # Определяем MIME type по расширению (поддерживаем изображения и видео)
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    media_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska'
    }
    media_type = media_types.get(ext, 'application/octet-stream')
    
    return FileResponse(
        str(file_path),
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "*",
            "ngrok-skip-browser-warning": "69420",
        }
    )
