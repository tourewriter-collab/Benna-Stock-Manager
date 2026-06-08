import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'audit_manager' | 'user';
  module?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole, module }) => {
  const { isAuthenticated, user } = useAuth();
  const { can } = usePermissions();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    if (user?.role === 'user' && !can('dashboard', 'view')) {
      return <Navigate to="/hr/my-tasks" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  if (module && !can(module, 'view')) {
    if (user?.role === 'user' && !can('dashboard', 'view')) {
      return <Navigate to="/hr/my-tasks" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
