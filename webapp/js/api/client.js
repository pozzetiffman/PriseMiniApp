// Базовый HTTP клиент для API запросов
import { getInitData, requireTelegram } from '../telegram.js';

// НАСТРОЙКА АДРЕСА
export const API_BASE = "https://unmaneuvered-chronogrammatically-otelia.ngrok-free.dev".trim();

// Базовые заголовки без авторизации (для просмотра товаров/категорий)
export function getBaseHeadersNoAuth() {
    return {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
}

// Базовые опции для запросов с авторизацией
export function getBaseHeaders() {
    const headers = {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    };
    
    // Добавляем initData в заголовок для валидации на backend
    // Согласно аудиту: приложение работает ТОЛЬКО через Telegram, initData всегда должен быть доступен
    const initData = getInitData();
    if (!initData) {
        console.error('❌ CRITICAL: No initData available - app should only work through Telegram!');
        throw new Error("Telegram initData is required. Open the app through Telegram bot.");
    }
    
    headers["X-Telegram-Init-Data"] = initData;
    return headers;
}

// Опции для обхода предупреждения ngrok (для обратной совместимости)
// НЕ используем getBaseHeaders() здесь, так как он требует initData при импорте
export const fetchOptions = {
    headers: {
        "ngrok-skip-browser-warning": "69420",
        "Content-Type": "application/json"
    }
};

// Базовая функция для выполнения запросов с обработкой ошибок
export async function apiRequest(url, options = {}) {
    // #region agent log
    console.log('[DEBUG] apiRequest called:', {url, method: options.method || 'GET', hasHeaders: !!options.headers});
    fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:44',message:'apiRequest entry',data:{url,method:options.method||'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    try {
        const response = await fetch(url, options);
        // #region agent log
        console.log('[DEBUG] apiRequest response:', {url, status: response.status, ok: response.ok});
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:47',message:'apiRequest response',data:{url,status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        if (!response.ok) {
            const errorText = await response.text();
            // #region agent log
            console.error('[DEBUG] apiRequest error response:', {url, status: response.status, errorText});
            fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:50',message:'apiRequest error',data:{url,status:response.status,errorText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            console.error(`❌ API error: ${response.status} - ${errorText}`);
            throw new Error(`Ошибка API: ${response.status} - ${errorText}`);
        }
        
        const jsonData = await response.json();
        // #region agent log
        console.log('[DEBUG] apiRequest success:', {url, dataLength: JSON.stringify(jsonData).length});
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:55',message:'apiRequest success',data:{url,hasData:!!jsonData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return jsonData;
    } catch (e) {
        // #region agent log
        console.error('[DEBUG] apiRequest exception:', {url, error: e.message, name: e.name, stack: e.stack});
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:57',message:'apiRequest exception',data:{url,error:e.message,name:e.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
            console.error("❌ Network error:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.");
        }
        throw e;
    }
}

