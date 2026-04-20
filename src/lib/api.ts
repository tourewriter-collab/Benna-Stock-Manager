let cachedPort: number | null = null;
let isResolving = false;

async function getApiRoot() {
  if (cachedPort) return `http://127.0.0.1:${cachedPort}`;
  if (isResolving) {
    // Wait a bit if another call is already resolving the port
    await new Promise(r => setTimeout(r, 500));
    if (cachedPort) return `http://127.0.0.1:${cachedPort}`;
  }

  isResolving = true;
  
  // Retry loop: give the backend up to 20 seconds to wake up and report its port.
  for (let i = 0; i < 40; i++) {
    if (window.electron?.updates?.getAppVersion) {
      try {
        const info = await window.electron.updates.getAppVersion();
        if (info && info.serverPort) {
          cachedPort = Number(info.serverPort);
          console.log(`[API] Discovered server port: ${cachedPort}`);
          isResolving = false;
          return `http://127.0.0.1:${cachedPort}`;
        }
      } catch (err) {
        console.warn('[API] Retrying port discovery…', i, err);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  isResolving = false;
  // Fallback to 5000 (standard for dev)
  console.warn('[API] Port discovery failed — using fallback port 5000');
  return 'http://127.0.0.1:5000';
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
        try {
          const errBody = await res.json();
          errorMsg = errBody.error || errBody.message || errorMsg;
        } catch (_) {}
        throw new Error(errorMsg);
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

