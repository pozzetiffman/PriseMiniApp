/**
 * Глобальный перехват console.* — глушит log/info/debug в prod, оставляет warn/error.
 * Сохраняет оригиналы в window.__RAW_CONSOLE__ для безопасного доступа (remoteLogger).
 * ?debug=1 или window.__LOG_LEVEL__=debug: показывает всё.
 */
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, log: 4, debug: 5 };

function getLevel() {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('debug') === '1' || params.get('debug') === 'true') return 'debug';
    if (params.get('debug_user')) return 'debug';
    if (typeof window !== 'undefined' && window.__LOG_LEVEL__) return String(window.__LOG_LEVEL__).toLowerCase();
    return 'warn';
}

export function initConsoleProxy() {
    const c = typeof console !== 'undefined' ? console : { log: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const raw = {
        log: c.log.bind(c),
        info: c.info.bind(c),
        warn: c.warn.bind(c),
        error: c.error.bind(c),
        debug: (c.debug || c.log).bind(c)
    };
    if (typeof window !== 'undefined') window.__RAW_CONSOLE__ = raw;

    const level = getLevel();
    const minLevel = LEVELS[level] ?? LEVELS.warn;

    c.log = (...args) => { if (minLevel >= LEVELS.log) raw.log(...args); };
    c.info = (...args) => { if (minLevel >= LEVELS.info) raw.info(...args); };
    c.warn = (...args) => { if (minLevel >= LEVELS.warn) raw.warn(...args); };
    c.error = (...args) => { if (minLevel >= LEVELS.error) raw.error(...args); };
    if (c.debug) c.debug = (...args) => { if (minLevel >= LEVELS.debug) raw.debug(...args); };
}
