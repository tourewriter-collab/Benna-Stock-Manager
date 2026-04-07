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

      // Instantly trigger full pull on fresh installations
      if (data.configured && data.online && data.hasPulledBefore === false) {
        // Prevent infinite loop if trigger fails
        if (syncStatus !== 'syncing') {
           triggerSync();
        }
        return;
      }

      // If offline, mark as such. If there are pending items and we ARE online,
      // trigger a sync immediately rather than waiting for the next interval.
      if (!data.online || !navigator.onLine) {
        setSyncStatus('offline');
      } else if (data.pendingItems > 0 && syncStatus !== 'syncing') {
        // Fire-and-forget: push right now instead of waiting up to 5 minutes
        triggerSync();
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
      await fetchApi('/sync/push', { method: 'POST' });

      // 2. Pull any remote changes made on other devices
      await fetchApi('/sync/pull', { method: 'GET' });

      setLastSyncedAt(new Date());
      setSyncStatus('synced');
      await fetchStatus(); // Reconcile ground truth from server
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      setSyncStatus('error');
    }
  };

  // Poll every 15 seconds to catch any pending items quickly
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchStatus();

    // Quick poll to detect pending queue items and push them
    const statusInterval = setInterval(fetchStatus, 15 * 1000); // 15 secs

    return () => {
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
