import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

interface SyncContextType {
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  isOnline: boolean;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const fetchStatus = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('http://localhost:5000/api/sync/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}` // use token if stored
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pendingItems);
        // If there are pending items but we are online, it's 'pending'
        // If offline, it's 'offline'
        if (!data.online || !navigator.onLine) {
          setSyncStatus('offline');
        } else if (data.pendingItems > 0 && syncStatus !== 'syncing' && syncStatus !== 'error') {
          setSyncStatus('pending');
        } else if (syncStatus !== 'syncing' && syncStatus !== 'error') {
          setSyncStatus('synced');
        }
      }
    } catch (err) {
      if (!navigator.onLine) setSyncStatus('offline');
    }
  };

  const triggerSync = async () => {
    if (!isAuthenticated || !navigator.onLine) return;
    
    setSyncStatus('syncing');
    try {
      // Allow passing auth headers
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Push pending changes
      await fetch('http://localhost:5000/api/sync/push', { method: 'POST', headers });
      
      // 2. Pull remote changes
      await fetch('http://localhost:5000/api/sync/pull', { method: 'GET', headers });

      setLastSyncedAt(new Date());
      setSyncStatus('synced');
      await fetchStatus(); // Get ground truth from server after push/pull
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      setSyncStatus('error');
    }
  };

  // Poll status occasionally and sync automatically every 5 minutes if online and pending
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      if (navigator.onLine && syncStatus === 'pending') {
        triggerSync();
      }
    }, 5 * 60 * 1000); // 5 mins

    // Also poll specifically for status changes (like when DB queue increments)
    const statusInterval = setInterval(fetchStatus, 30 * 1000); // 30 secs

    return () => {
      clearInterval(interval);
      clearInterval(statusInterval);
    };
  }, [isAuthenticated, syncStatus]);

  // Handle explicit online/offline browser events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      fetchStatus();
      triggerSync(); // Trigger sync immediately on reconnect
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthenticated]);

  return (
    <SyncContext.Provider value={{ syncStatus, pendingCount, lastSyncedAt, triggerSync, refreshStatus: fetchStatus, isOnline }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
