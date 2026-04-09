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
  
  // Retry loop: give the backend up to 5 seconds to wake up and report its port
  for (let i = 0; i < 10; i++) {
    if (window.electron?.updates?.getAppVersion) {
      try {
        const info = await window.electron.updates.getAppVersion();
        if (info.serverPort) {
          cachedPort = info.serverPort;
          isResolving = false;
          return `http://127.0.0.1:${cachedPort}`;
        }
      } catch (err) {
        console.warn('[API] Retrying port discovery…', i);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  isResolving = false;
  // Fallback to default
  return 'http://127.0.0.1:5000';
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const API_ROOT = await getApiRoot();
  const API_BASE = `${API_ROOT}/api`;
  
  const url = endpoint.startsWith('/api') 
    ? `${API_ROOT}${endpoint}` 
    : `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('benna_cached_user');
      // Force a page reload or let the app handle the missing user in the next cycle
      if (typeof window !== 'undefined') window.location.reload();
    }
    
    let errorMsg = `Server error (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody.details) {
        errorMsg = `${errBody.error || 'Error'}: ${JSON.stringify(errBody.details)}`;
      } else {
        errorMsg = errBody.error || errBody.message || errorMsg;
      }
    } catch (_) {}
    console.error(`[API Error] ${options.method || 'GET'} ${url}: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Handle No Content
  if (res.status === 204) return null;

  return res.json();
}
