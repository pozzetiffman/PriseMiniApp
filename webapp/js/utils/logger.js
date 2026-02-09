/**
 * Frontend Logger: единый механизм с уровнями и защитой PII.
 * Экспортирует safeSerialize, maskSensitive для использования в remoteLogger.
 */
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, log: 4, debug: 5 };

function getLogLevel() {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('debug') === '1' || params.get('debug') === 'true') return 'debug';
    if (params.get('debug_user')) return 'debug';
    if (typeof window !== 'undefined' && window.__LOG_LEVEL__) return String(window.__LOG_LEVEL__).toLowerCase();
    return 'warn';
}

let _level = null;
function currentLevel() {
    if (_level === null) _level = getLogLevel();
    return LEVELS[_level] ?? LEVELS.warn;
}

/** Циклические объекты → [Circular], длинные строки → обрезка до 2000 */
export function safeSerialize(value) {
    const seen = new WeakSet();
    function replacer(_, v) {
        if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
        }
        if (typeof v === 'string' && v.length > 2000) return v.slice(0, 2000) + '...[truncated]';
        return v;
    }
    try {
        if (value instanceof Error) return JSON.stringify({ name: value.name, message: value.message, stack: (value.stack || '').slice(0, 500) });
        if (typeof value === 'object' && value !== null) return JSON.stringify(value, replacer);
    } catch (_) { return String(value); }
    return String(value);
}

/** Маскирует initData, query_id, hash, token, email, phone */
export function maskSensitive(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/query_id=[^&\s]+/gi, 'query_id=***')
        .replace(/auth_date=\d+/gi, 'auth_date=***')
        .replace(/hash=[a-f0-9]+/gi, 'hash=***')
        .replace(/user=[^&\s]+/gi, 'user=***')
        .replace(/X-Telegram-Init-Data[^\s,]*/gi, 'X-Telegram-Init-Data=***')
        .replace(/initData[=:][^\s,]+/gi, 'initData=***')
        .replace(/token[=:][^\s,]+/gi, 'token=***')
        .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email]')
        .replace(/\+?\d{10,15}/g, '[phone]')
        .slice(0, 2000);
}

function formatArgs(args) {
    return args.map(a => maskSensitive(safeSerialize(a)));
}

const noop = () => {};
const raw = typeof window !== 'undefined' && window.__RAW_CONSOLE__
    ? window.__RAW_CONSOLE__
    : (typeof console !== 'undefined' ? console : { log: noop, info: noop, warn: noop, error: noop });

export function log(...args) {
    if (currentLevel() < LEVELS.log) return;
    raw.log('[LOG]', ...formatArgs(args));
}
export function info(...args) {
    if (currentLevel() < LEVELS.info) return;
    raw.info('[INFO]', ...formatArgs(args));
}
export function warn(...args) {
    if (currentLevel() < LEVELS.warn) return;
    raw.warn('[WARN]', ...formatArgs(args));
}
export function error(...args) {
    if (currentLevel() < LEVELS.error) return;
    raw.error('[ERROR]', ...formatArgs(args));
}
export function debug(...args) {
    if (currentLevel() < LEVELS.debug) return;
    (raw.debug || raw.log)('[DEBUG]', ...formatArgs(args));
}

export function resetLogLevel() { _level = null; }
export const logger = { log, info, warn, error, debug };
