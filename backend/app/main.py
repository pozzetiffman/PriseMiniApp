import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from .db import database, models
from .routers import products, categories, channels, reservations, context, shop_settings, shop_visits, orders, bots

# Создаем таблицы базы данных
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="PriseMiniApp API")

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
    app.mount("/assets", StaticFiles(directory=str(webapp_dir / "assets")), name="assets")
    
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

# Middleware для добавления заголовков к статическим файлам и API endpoints
@app.middleware("http")
async def add_ngrok_headers(request, call_next):
    response = await call_next(request)
    # Добавляем заголовки для статических файлов, WebApp и API endpoints изображений
    if (request.url.path.startswith("/static/") or 
        request.url.path.startswith("/css/") or 
        request.url.path.startswith("/js/") or 
        request.url.path.startswith("/assets/") or
        request.url.path.startswith("/api/images/") or  # Проксирование изображений через API
        request.url.path == "/" or
        request.url.path.endswith(('.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.webp'))):
        response.headers["ngrok-skip-browser-warning"] = "69420"
        # Добавляем CORS заголовки
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        # Кэширование для изображений
        if request.url.path.endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')) or request.url.path.startswith("/api/images/"):
            response.headers["Cache-Control"] = "public, max-age=31536000"
    return response

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(context.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(channels.router)
app.include_router(reservations.router)
app.include_router(shop_settings.router)
app.include_router(shop_visits.router)
app.include_router(orders.router)
app.include_router(bots.router)

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
            # Логируем для отладки
            print(f"⚠️ Image not found: {filename}")
            print(f"   Tried path 1: {file_path}")
            print(f"   Tried path 2: {alt_path}")
            print(f"   Backend dir: {backend_dir}")
            print(f"   Static dir exists: {(backend_dir / 'static' / 'uploads').exists()}")
            if (backend_dir / "static" / "uploads").exists():
                # Показываем список файлов в директории
                files = list((backend_dir / "static" / "uploads").glob("*"))
                print(f"   Files in directory: {[f.name for f in files[:10]]}")
            
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
    
    # Определяем MIME type по расширению
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    media_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    }
    media_type = media_types.get(ext, 'image/jpeg')
    
    return FileResponse(
        str(file_path),
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*",
        }
    )
