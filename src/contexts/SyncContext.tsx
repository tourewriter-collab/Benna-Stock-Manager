import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchApi } from '../lib/api';

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
      const data = await fetchApi('/sync/status');
      setPendingCount(data.pendingItems);

      // Update UI state based on backend response, but NEVER auto-trigger a sync from here
      // to avoid infinite loops if an item gets permanently stuck or the DB is empty.
      if (!data.online || !navigator.onLine) {
        setSyncStatus('offline');
      } else if (data.pendingItems > 0 && syncStatus !== 'syncing' && syncStatus !== 'error') {
        setSyncStatus('pending');
      } else if (syncStatus !== 'syncing' && syncStatus !== 'error') {
        setSyncStatus('synced');
      }
    } catch (err) {
      if (!navigator.onLine) setSyncStatus('offline');
    }
  };

  const triggerSync = async () => {
    if (!isAuthenticated || !navigator.onLine) return;

    setSyncStatus('syncing');
    try {
      // 1. Push pending local changes to Supabase
      if (pendingCount > 0 || (await fetchApi('/sync/status')).pendingItems > 0) {
        await fetchApi('/sync/push', { method: 'POST' });
      }

      // 2. Pull any remote changes made on other devices
      await fetchApi('/sync/pull', { method: 'GET' });

      setLastSyncedAt(new Date());
      setSyncStatus('synced');
      await fetchStatus(); // Reconcile ground truth from server
    } catch (error: any) {
      console.error('[Sync] Sync failed:', error.message);
      if (error.details) {
        console.error('[Sync] Diagnostic details:', error.details);
      }
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Initial mount sync
    const performMountSync = async () => {
      await fetchStatus();
      if (navigator.onLine) {
        await triggerSync();
      }
    };
    performMountSync();

    // Setup periodic polling every 60 seconds to push/pull naturally
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        try {
          await triggerSync();
        } catch (e) {
          // Ignore polling errors
        }
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

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
