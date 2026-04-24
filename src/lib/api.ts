let cachedPort: number | null = null;
let isResolving = false;
let lastDiscoveryAttempt = 0;
const DISCOVERY_COOLDOWN = 30000; // Wait 30s before retrying discovery if it timed out once

async function getApiRoot() {
  if (cachedPort) return `http://127.0.0.1:${cachedPort}`;
  
  const now = Date.now();
  const isCooldownActive = (now - lastDiscoveryAttempt) < DISCOVERY_COOLDOWN;
  const fallbackPort = 5000;

  if (isResolving || isCooldownActive) {
    return `http://127.0.0.1:${fallbackPort}`;
  }

  isResolving = true;
  lastDiscoveryAttempt = now;
  
  // Give it a quick 2-second chance to find the real port.
  // We don't want to block the UI for 30s anymore.
  for (let i = 0; i < 10; i++) {
    if (!window.electron) { // If not running in electron, skip this discovery
      break;
    }
    if (window.electron?.updates?.getAppVersion) {
      try {
        const info = await window.electron.updates.getAppVersion();
        if (info && info.serverPort) {
          cachedPort = Number(info.serverPort);
          console.log(`[API] Discovered server port: ${cachedPort}`);
          isResolving = false;
          return `http://127.0.0.1:${cachedPort}`;
        }
      } catch (err) {}
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  isResolving = false;
  console.warn(`[API] Port discovery slow — proceeding with fallback port ${fallbackPort}`);
  return `http://127.0.0.1:${fallbackPort}`;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Attempt the request with automatic retries on network failure.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const API_ROOT = await getApiRoot();
      const API_BASE = `${API_ROOT}/api`;
      const url = endpoint.startsWith('/api') ? `${API_ROOT}${endpoint}` : `${API_BASE}${endpoint}`;

      const res = await fetch(url, { ...options, headers });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('benna_cached_user');
          if (typeof window !== 'undefined') window.location.reload();
        }
        
        let errorMsg = `Server error (${res.status})`;
        let details = null;
        let stack = null;
        let hint = null;
        try {
          const errBody = await res.json();
          errorMsg = errBody.message || errBody.error || errorMsg;
          details = errBody.details || null;
          stack = errBody.stack || null;
          hint = errBody.hint || null;
        } catch (_) {}
        
        const error = new Error(errorMsg) as any;
        error.status = res.status;
        error.details = details;
        error.stack = stack || error.stack;
        error.hint = hint;
        throw error;
      }

      if (res.status === 204) return null;
      return res.json();
    } catch (err: any) {
      lastError = err;
      // Network-level errors (server not reachable) — retry after a delay
      if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('Network'))) {
        console.warn(`[API] Network error on ${endpoint}, retrying...`, attempt + 1);
        cachedPort = null; // Invalidate port cache and try again
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

