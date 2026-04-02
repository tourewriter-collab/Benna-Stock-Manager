export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const API_BASE = 'http://localhost:5000/api';
  const API_ROOT = 'http://localhost:5000';
  
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
      errorMsg = errBody.error || errBody.message || errBody.details ? `${errBody.error || 'Error'}: ${JSON.stringify(errBody.details)}` : (errBody.error || errBody.message || errorMsg);
    } catch (_) {}
    console.error(`[API Error] ${options.method || 'GET'} ${url}: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Handle No Content
  if (res.status === 204) return null;

  return res.json();
}
