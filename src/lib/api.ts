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
  
  // Retry loop: give the backend up to 15 seconds to wake up and report its port.
  // The server needs time to fork, initialize SQLite, run schema migrations, and
  // send the SERVER_READY IPC message back with the actual port.
  for (let i = 0; i < 30; i++) {
    if (window.electron?.updates?.getAppVersion) {
      try {
        const info = await window.electron.updates.getAppVersion();
        if (info && info.serverPort) {
          cachedPort = info.serverPort;
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
  // Fallback to default (works for dev mode where server is on port 5000)
  console.warn('[API] Port discovery timed out — falling back to port 5000');
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

  // Attempt the request with one automatic retry on network failure.
  // This handles the case where the server hasn't fully started yet or there's
  // a transient connection issue (common during Electron cold-start).
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
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
    } catch (err: any) {
      // Network-level errors (server not reachable) — retry once after a delay
      if (err instanceof TypeError && err.message === 'Failed to fetch' && attempt === 0) {
        console.warn(`[API] Network error on ${url}, retrying in 2s…`);
        // Invalidate cached port in case the server restarted on a different port
        cachedPort = null;
        await new Promise(r => setTimeout(r, 2000));
        // Re-resolve API root for the retry
        const newRoot = await getApiRoot();
        const newBase = `${newRoot}/api`;
        const retryUrl = endpoint.startsWith('/api')
          ? `${newRoot}${endpoint}`
          : `${newBase}${endpoint}`;
        // Update url for retry (we can't reassign const, so we just continue the loop)
        // Actually, let's just do the retry inline:
        try {
          const res2 = await fetch(retryUrl, { ...options, headers });
          if (!res2.ok) {
            let errorMsg = `Server error (${res2.status})`;
            try {
              const errBody = await res2.json();
              errorMsg = errBody.error || errBody.message || errorMsg;
            } catch (_) {}
            throw new Error(errorMsg);
          }
          if (res2.status === 204) return null;
          return res2.json();
        } catch (retryErr: any) {
          lastError = retryErr;
        }
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

