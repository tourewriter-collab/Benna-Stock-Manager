import React, { createContext, useState, useContext, useEffect } from 'react';
import { fetchApi } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'audit_manager' | 'user';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, stayLoggedIn?: boolean) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY = 'benna_cached_user';
const TOKEN_KEY = 'token';

/** Store the logged-in user profile. Uses localStorage when stayLoggedIn=true, sessionStorage otherwise. */
function cacheUser(user: User, token: string, persistent: boolean) {
  try {
    const store = persistent ? localStorage : sessionStorage;
    store.setItem(CACHE_KEY, JSON.stringify(user));
    store.setItem(TOKEN_KEY, token);
    // Clean the other store to avoid stale data
    if (persistent) {
      sessionStorage.removeItem(CACHE_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (_) {}
}

/** Remove the cached user on logout */
function clearCachedUser() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

/** Read the locally-cached user — checks sessionStorage first, then localStorage */
function loadCachedUser(): { user: User; token: string } | null {
  try {
    // Session-only first (browser tab still open)
    let raw = sessionStorage.getItem(CACHE_KEY);
    let token = sessionStorage.getItem(TOKEN_KEY);
    if (!raw || !token) {
      // Fall back to persistent store
      raw = localStorage.getItem(CACHE_KEY);
      token = localStorage.getItem(TOKEN_KEY);
    }
    if (raw && token) return { user: JSON.parse(raw) as User, token };
    return null;
  } catch (_) {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt to restore user from cache on initial load
    const verifyToken = async () => {
      const cached = loadCachedUser();

      if (cached) {
        try {
          // Verify with server
          const serverUser = await fetchApi('/auth/me');
          setUser(serverUser);
          setIsAuthenticated(true);
          console.log('[Auth] Restored and verified cached user:', serverUser.email);
        } catch (error) {
          console.error('[Auth] Token verification failed:', error);
          // Don't log out on network error — support offline access
          setUser(cached.user);
          setIsAuthenticated(true);
        }
      }
      
      setLoading(false);
    };

    verifyToken();
  }, []);

  const login = async (email: string, password: string, stayLoggedIn = true) => {
    try {
      console.log('[Auth] Login attempt against local API:', email);

      const data = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      setUser(data.user);
      setIsAuthenticated(true);
      cacheUser(data.user, data.token, stayLoggedIn);

      console.log('[Auth] Login successful, persistent:', stayLoggedIn);
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    clearCachedUser();
    setUser(null);
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

