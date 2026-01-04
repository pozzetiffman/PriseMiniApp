// API для работы с категориями
import { API_BASE, getBaseHeadersNoAuth, apiRequest } from './client.js';

// Загрузка категорий (не требует авторизации - только просмотр)
export async function fetchCategories(shopOwnerId, botId = null, flat = false) {
    let url = `${API_BASE}/api/categories/?user_id=${shopOwnerId}`;
    if (botId !== null && botId !== undefined) {
        url += `&bot_id=${botId}`;
    }
    if (flat) {
        url += `&flat=true`;
    }
    console.log("📂 Fetching categories from:", url, "botId:", botId, "flat:", flat);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/categories.js:5',message:'fetchCategories entry',data:{shopOwnerId,botId,flat,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    try {
        const data = await apiRequest(url, {
            headers: getBaseHeadersNoAuth()
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/categories.js:19',message:'fetchCategories success',data:{count:data?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.log("✅ Categories fetched:", data.length);
        return data;
    } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a529e8ef-268e-4207-8623-432f61be7d3f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/categories.js:22',message:'fetchCategories error',data:{error:e.message,stack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.error("❌ Error fetching categories:", e);
        throw e;
    }
}

