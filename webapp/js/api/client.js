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
    // === ИСПРАВЛЕНИЕ: Graceful degradation вместо throw ===
    const initData = getInitData();
    if (!initData) {
        console.warn('⚠️ [getBaseHeaders] No initData available - request will fail on backend');
        // НЕ выбрасываем ошибку - backend вернет 401, что обработается в getContext()
        // Возвращаем заголовки без initData для graceful degradation
        return headers;
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
    
    // === ИСПРАВЛЕНИЕ: Добавляем таймаут для предотвращения зависания ===
    const TIMEOUT_MS = 15000; // 15 секунд (больше для товаров, так как может быть много данных)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);
    
    // Объединяем signal из options с нашим controller
    const finalOptions = {
        ...options,
        signal: options.signal ? (() => {
            // Если уже есть signal, создаем объединенный
            const combinedController = new AbortController();
            const originalSignal = options.signal;
            const newSignal = controller.signal;
            
            // Отслеживаем оба сигнала
            const abort = () => combinedController.abort();
            originalSignal.addEventListener('abort', abort);
            newSignal.addEventListener('abort', abort);
            
            return combinedController.signal;
        })() : controller.signal
    };
    
    try {
        const response = await fetch(url, finalOptions);
        clearTimeout(timeoutId);
        // #region agent log
        console.log('[DEBUG] apiRequest response:', {url, status: response.status, ok: response.ok});
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:47',message:'apiRequest response',data:{url,status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // === ИСПРАВЛЕНИЕ: Читаем текст ответа один раз для обработки ===
        const responseText = await response.text();
        
        if (!response.ok) {
            // #region agent log
            console.error('[DEBUG] apiRequest error response:', {url, status: response.status, errorText: responseText});
            fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:50',message:'apiRequest error',data:{url,status:response.status,errorText:responseText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            console.error(`❌ API error: ${response.status} - ${responseText}`);
            throw new Error(`Ошибка API: ${response.status} - ${responseText}`);
        }
        
        // === ИСПРАВЛЕНИЕ: Безопасный парсинг JSON с обработкой ошибок ===
        let jsonData = null;
        try {
            jsonData = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ [API CLIENT] JSON parse error:', parseError);
            console.error('❌ [API CLIENT] Response status:', response.status);
            console.error('❌ [API CLIENT] Response text length:', responseText.length);
            console.error('❌ [API CLIENT] Response text preview:', responseText.substring(0, 500));
            throw new Error(`Ошибка парсинга JSON: ${parseError.message}`);
        }
        
        // #region agent log
        console.log('[DEBUG] apiRequest success:', {url, dataLength: JSON.stringify(jsonData).length});
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:55',message:'apiRequest success',data:{url,hasData:!!jsonData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return jsonData;
    } catch (e) {
        clearTimeout(timeoutId);
        
        // #region agent log
        console.error('[DEBUG] apiRequest exception:', {url, error: e.message, name: e.name, stack: e.stack});
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/client.js:57',message:'apiRequest exception',data:{url,error:e.message,name:e.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Обработка ошибки таймаута
        if (e.name === 'AbortError') {
            console.error("❌ API request timeout after", TIMEOUT_MS, "ms for URL:", url);
            throw new Error("Таймаут запроса. Сервер не отвечает. Попробуйте позже.");
        }
        
        // Обработка сетевых ошибок
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
            console.error("❌ Network error:", e);
            throw new Error("Ошибка сети: не удалось подключиться к серверу. Проверьте подключение к интернету.");
        }
        throw e;
    }
}

