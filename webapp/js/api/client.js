/**
 * API client - реэкспорт apiClient и config для обратной совместимости.
 * Все запросы идут через apiClient с initData, X-Request-Id, таймаутами, retry.
 */
export { API_BASE } from './config.js';
export { getBaseHeaders, getBaseHeadersNoAuth, fetchOptions } from './config.js';
export { apiFetch, apiRequest } from './apiClient.js';
