import React, { createContext, useState, useContext, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'audit_manager' | 'user';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY = 'benna_cached_user';
const TOKEN_KEY = 'token';

/** Store the logged-in user profile locally for offline access */
function cacheUser(user: User, token: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
  } catch (_) {}
}

/** Remove the cached user on logout */
function clearCachedUser() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

/** Read the locally-cached user */
function loadCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
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
      const token = localStorage.getItem(TOKEN_KEY);

      if (cached && token) {
        try {
          // Verify with server
          const res = await fetch('http://localhost:5000/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (res.ok) {
            const serverUser = await res.json();
            setUser(serverUser);
            setIsAuthenticated(true);
            console.log('[Auth] Restored and verified cached user:', serverUser.email);
          } else {
            // Token invalid or user not found
            console.warn('[Auth] Cached token invalid, clearing state');
            logout();
          }
        } catch (error) {
          console.error('[Auth] Token verification failed:', error);
          // Don't log out on network error, keep current state (offline support)
          setUser(cached);
          setIsAuthenticated(true);
        }
      }
      
      setLoading(false);
    };

    verifyToken();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      console.log('[Auth] Login attempt against local API:', email);

      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Invalid credentials');
      }

      const data = await res.json();
      
      setUser(data.user);
      setIsAuthenticated(true);
      cacheUser(data.user, data.token);

      console.log('[Auth] Login successful');
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

