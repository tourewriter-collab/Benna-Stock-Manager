import React from 'react';
import { usePermissions } from '../contexts/PermissionsContext';

interface PermissionGateProps {
  module: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const PermissionGate: React.FC<PermissionGateProps> = ({
  module,
  action,
  children,
  fallback = null,
}) => {
  const { can } = usePermissions();

  if (can(module, action)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default PermissionGate;
