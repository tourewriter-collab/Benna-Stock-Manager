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

      // Log any stuck items with errors
      if (data.recentErrors && data.recentErrors.length > 0) {
        console.warn('[Sync] Some items are stuck in the waiting list:', data.recentErrors);
      }

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
        try {
          await fetchApi('/sync/push', { method: 'POST' });
        } catch (pushErr: any) {
          // 400 = not configured, 503 = offline — not a real error, skip silently
          if (pushErr?.status === 400 || pushErr?.status === 503) {
            setSyncStatus('synced');
            return;
          }
          throw pushErr;
        }
      }

      // 2. Pull any remote changes made on other devices
      try {
        await fetchApi('/sync/pull', { method: 'GET' });
      } catch (pullErr: any) {
        // 400 = not configured, 503 = offline — treat as a no-op, not an error
        if (pullErr?.status === 400 || pullErr?.status === 503) {
          setSyncStatus('synced');
          return;
        }
        throw pullErr;
      }

      setLastSyncedAt(new Date());
      setSyncStatus('synced');
      await fetchStatus();
    } catch (error: any) {
      console.error('[Sync] Sync failed:', error.message);
      if (error.stack) console.error('[Sync] Stack trace:', error.stack);
      if (error.hint) console.warn('[Sync] Troubleshooting Hint:', error.hint);
      if (error.details) console.error('[Sync] Diagnostic details:', error.details);
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
