import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { fetchApi } from '../lib/api';

interface UserPermission {
  module: string;
  action: string;
  allowed: number;
}

interface PermissionsContextType {
  permissions: UserPermission[];
  loading: boolean;
  refreshPermissions: () => Promise<void>;
  can: (module: string, action: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshPermissions = async () => {
    if (!user) {
      setPermissions([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchApi(`/users/${user.id}/permissions`);
      setPermissions(data || []);
    } catch (error) {
      console.error('[Permissions] Failed to fetch permissions:', error);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      refreshPermissions();
    } else {
      setPermissions([]);
    }
  }, [isAuthenticated, user]);

  const can = (module: string, action: string): boolean => {
    if (!user) return false;

    // Admin has superuser status
    if (user.role === 'admin') return true;

    // Audit manager has default read-only on everything
    if (user.role === 'audit_manager' && action === 'view') {
      return true;
    }

    // "employee_portal" (My Tasks/Employee module) is accessible by everyone for view and edit (for completing tasks)
    if (module === 'employee_portal' && (action === 'view' || action === 'edit')) {
      return true;
    }

    // Default: Dashboard is accessible by everyone for view
    if (module === 'dashboard' && action === 'view') {
      return true;
    }

    // Check custom granular permissions from DB
    const match = permissions.find(
      (p) => p.module === module && p.action === action
    );

    return match ? match.allowed === 1 : false;
  };

  return (
    <PermissionsContext.Provider value={{ permissions, loading, refreshPermissions, can }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
