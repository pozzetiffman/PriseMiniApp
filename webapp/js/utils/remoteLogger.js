/**
 * RemoteLogger: отправка логов на сервер.
 * ВКЛЮЧЕНИЕ: ТОЛЬКО при ?remote_log=1 или remote_log=true.
 * Никогда не использует console.* для ошибок — только window.__RAW_CONSOLE__ при debug_user.
 */
import { API_BASE } from '../api/config.js';
import { getTelegramInstance } from '../telegram.js';
import { safeSerialize, maskSensitive } from './logger.js';

const BUFFER_DELAY_MS = 2000;
const MAX_BATCH_BYTES = 50 * 1024;
const MAX_BUFFER_SIZE = 100;
const DEDUP_WINDOW_MS = 10000;
const DEDUP_MAX_ITEMS = 200;
const MAX_MESSAGE_LEN = 2000;

let logBuffer = [];
let bufferTimer = null;
let lastSendTime = 0;
let sendInProgress = false;
const dedupMap = new Map();

function isRemoteLoggingEnabled() {
    const params = new URLSearchParams(window.location?.search || '');
    return params.get('remote_log') === '1' || params.get('remote_log') === 'true';
}

function isDebugUser() {
    const params = new URLSearchParams(window.location?.search || '');
    return params.get('debug_user') === '1' || params.get('debug_user') === 'true';
}

function getDebugInfo() {
    const loc = window.location || {};
    const url = (loc.origin || '') + (loc.pathname || '/') + '?***';
    const info = { url, timestamp: new Date().toISOString() };
    try {
        const tg = getTelegramInstance();
        if (tg) { info.tgVersion = tg.version; info.tgPlatform = tg.platform; }
    } catch (_) {}
    return info;
}

function safeStringifyPayload(arg) {
    try {
        if (arg instanceof Error) return safeSerialize(arg);
        const s = safeSerialize(arg);
        return typeof s === 'string' ? s : JSON.stringify(s);
    } catch (_) { return '[serialize error]'; }
}

function isDuplicate(level, message) {
    const key = level + ':' + message.slice(0, 150);
    const now = Date.now();
    if (dedupMap.has(key) && now - dedupMap.get(key) < DEDUP_WINDOW_MS) return true;
    if (dedupMap.size >= DEDUP_MAX_ITEMS) {
        const sorted = [...dedupMap.entries()].sort((a, b) => a[1] - b[1]);
        sorted.slice(0, 50).forEach(([k]) => dedupMap.delete(k));
    }
    dedupMap.set(key, now);
    return false;
}

async function sendLogsToServer() {
    if (logBuffer.length === 0 || sendInProgress) return;
    const toSend = [...logBuffer];
    logBuffer = [];
    if (bufferTimer) { clearTimeout(bufferTimer); bufferTimer = null; }
    sendInProgress = true;

    const payload = {
        user_id: getTelegramInstance()?.initDataUnsafe?.user?.id ?? 'unknown',
        username: getTelegramInstance()?.initDataUnsafe?.user?.username ?? 'unknown',
        timestamp: new Date().toISOString(),
        logs: toSend,
        debug_info: getDebugInfo()
    };

    let body;
    try {
        body = JSON.stringify(payload);
    } catch (_) {
        body = '{}';
    }
    if (body.length > MAX_BATCH_BYTES) {
        const half = Math.floor(toSend.length / 2);
        logBuffer = toSend.slice(half);
        payload.logs = toSend.slice(0, half);
        body = JSON.stringify(payload);
    }

    try {
        const response = await fetch(`${API_BASE}/api/debug/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: body
        });
        lastSendTime = Date.now();
        if (!response.ok && isDebugUser() && window.__RAW_CONSOLE__?.error) {
            window.__RAW_CONSOLE__.error('[RemoteLogger] send failed:', response.status);
        }
    } catch (_err) {
        if (isDebugUser() && window.__RAW_CONSOLE__?.error) {
            window.__RAW_CONSOLE__.error('[RemoteLogger] send error (silent in prod)');
        }
    } finally {
        sendInProgress = false;
        if (logBuffer.length > 0) scheduleSend();
    }
}

function scheduleSend() {
    if (bufferTimer) return;
    bufferTimer = setTimeout(() => {
        bufferTimer = null;
        sendLogsToServer();
    }, BUFFER_DELAY_MS);
}

function addLogToBuffer(level, args) {
    if (!isRemoteLoggingEnabled()) return;
    const raw = args.map(safeStringifyPayload).join(' ');
    const message = maskSensitive(raw).slice(0, MAX_MESSAGE_LEN);
    if (isDuplicate(level, message)) return;
    if (level === 'error' && (message.includes('Url protocol is not supported') || message.includes('Error opening Telegram chat'))) return;

    logBuffer.push({ level, message, timestamp: new Date().toISOString() });

    if (logBuffer.length >= MAX_BUFFER_SIZE) {
        logBuffer = logBuffer.slice(-Math.floor(MAX_BUFFER_SIZE / 2));
    }

    if (logBuffer.length >= 20) {
        if (bufferTimer) { clearTimeout(bufferTimer); bufferTimer = null; }
        sendLogsToServer();
    } else {
        scheduleSend();
    }
}

export function initRemoteLogger() {
    if (!isRemoteLoggingEnabled()) return;

    const orig = window.__RAW_CONSOLE__ || console;
    console.log = (...args) => { addLogToBuffer('log', args); };
    console.info = (...args) => { addLogToBuffer('info', args); };
    console.warn = (...args) => { addLogToBuffer('warn', args); };
    console.error = (...args) => { addLogToBuffer('error', args); };

    window.addEventListener('beforeunload', () => {
        if (logBuffer.length > 0) {
            const payload = {
                user_id: getTelegramInstance()?.initDataUnsafe?.user?.id ?? 'unknown',
                username: getTelegramInstance()?.initDataUnsafe?.user?.username ?? 'unknown',
                timestamp: new Date().toISOString(),
                logs: logBuffer
            };
            try {
                navigator.sendBeacon(`${API_BASE}/api/debug/logs`, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
            } catch (_) {}
        }
    });
}
