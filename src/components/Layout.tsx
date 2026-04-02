import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { fetchApi } from '../lib/api';

const Layout: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { syncStatus, pendingCount, triggerSync, isOnline } = useSync();
  const location = useLocation();
  const [logo, setLogo] = React.useState<string | null>(null);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'fr' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  const isActive = (path: string) => {
    return location.pathname === path ? 'bg-navy bg-opacity-20' : '';
  };

  React.useEffect(() => {
    fetchApi('/settings').then(settings => {
      if (settings?.company_logo) {
        setLogo(settings.company_logo);
      }
    }).catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-navy text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                {logo && <img src={logo} alt="Logo" className="h-8 w-8 object-contain bg-white rounded-sm p-0.5" />}
                <h1 className="text-xl font-bold">{t('app_title')}</h1>
              </div>
              <div className="hidden md:flex space-x-4">
                <Link
                  to="/dashboard"
                  className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/dashboard')}`}
                >
                  {t('dashboard')}
                </Link>
                <Link
                  to="/inventory"
                  className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/inventory')}`}
                >
                  {t('inventory')}
                </Link>
                <Link
                  to="/suppliers"
                  className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/suppliers')}`}
                >
                  {t('suppliers')}
                </Link>
                <Link
                  to="/orders"
                  className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/orders')}`}
                >
                  {t('orders')}
                </Link>
                <Link
                  to="/usage-reports"
                  className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/usage-reports')}`}
                >
                  {t('usage_reports')}
                </Link>
                {user?.role === 'admin' && (
                  <>
                    <Link
                      to="/categories"
                      className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/categories')}`}
                    >
                      {t('categories')}
                    </Link>
                    <Link
                      to="/admin/users"
                      className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/admin/users')}`}
                    >
                      {t('admin_users')}
                    </Link>
                  </>
                )}
                <Link
                  to="/settings"
                  className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition ${isActive('/settings')}`}
                >
                  {t('settings')}
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleLanguage}
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-navy hover:bg-opacity-20 transition"
              >
                {i18n.language === 'en' ? 'FR' : 'EN'}
              </button>
              
              <button 
                onClick={() => triggerSync()}
                disabled={syncStatus === 'syncing' || !isOnline}
                className="flex items-center space-x-1 px-3 py-2 rounded-md hover:bg-navy hover:bg-opacity-20 transition text-sm disabled:opacity-50"
                title={syncStatus === 'error' ? 'Sync failed. Click to retry.' : 'Click to sync now'}
              >
                {syncStatus === 'synced' && <Cloud size={18} />}
                {syncStatus === 'syncing' && <RefreshCw size={18} className="animate-spin" />}
                {syncStatus === 'pending' && (
                  <div className="relative">
                    <Cloud size={18} />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                    </span>
                  </div>
                )}
                {syncStatus === 'offline' && <CloudOff size={18} className="text-gray-400" />}
                {syncStatus === 'error' && <AlertCircle size={18} className="text-red-400" />}
                <span className="hidden sm:inline-block">
                  {syncStatus === 'synced' && 'Synced'}
                  {syncStatus === 'syncing' && 'Syncing...'}
                  {syncStatus === 'pending' && `${pendingCount} pending`}
                  {syncStatus === 'offline' && 'Offline'}
                  {syncStatus === 'error' && 'Sync Error'}
                </span>
              </button>

              <span className="text-sm border-l border-white/20 pl-4 ml-2">{user?.name}</span>
              <button
                onClick={logout}
                className="px-4 py-2 bg-white text-navy rounded-md text-sm font-medium hover:bg-gray-100 transition"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {!isOnline && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <CloudOff className="h-5 w-5 text-yellow-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                You are currently offline. Changes will be saved locally and synced automatically when your connection is restored.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-600">
            © {new Date().getFullYear()} Ikiké Collective SARL. All rights reserved. Version 1.0.0
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
