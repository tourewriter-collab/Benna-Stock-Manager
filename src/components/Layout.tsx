import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import pkg from '../../package.json';
import { Cloud, CloudOff, RefreshCw, AlertCircle, Package, Layers, CreditCard, CheckCircle2, TrendingDown } from 'lucide-react';
import { fetchApi } from '../lib/api';

const Layout: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { syncStatus, pendingCount, triggerSync, isOnline } = useSync();
  const location = useLocation();
  const [logo, setLogo] = React.useState<string | null>(null);

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

  // ── Sync pill configuration by status ──
  const syncPillConfig: Record<string, { bg: string; ring: string; icon: React.ReactNode; label: string }> = {
    synced:  { bg: 'bg-emerald-500', ring: 'ring-emerald-300', icon: <CheckCircle2 size={15} />, label: t('synced') },
    syncing: { bg: 'bg-blue-500',    ring: 'ring-blue-300',    icon: <RefreshCw size={15} className="animate-spin" />, label: t('syncing') },
    pending: { bg: 'bg-blue-500',    ring: 'ring-blue-300',    icon: <Cloud size={15} />,        label: `${pendingCount} ${t('pending')}` },
    error:   { bg: 'bg-red-500',     ring: 'ring-red-300',     icon: <AlertCircle size={15} />,  label: t('sync_error') },
    offline: { bg: 'bg-gray-400',    ring: 'ring-gray-200',    icon: <CloudOff size={15} />,     label: t('offline') },
  };
  const pill = syncPillConfig[syncStatus] ?? syncPillConfig.synced;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-x-hidden">
      {/* ── Top Navigation Bar ── */}
      <nav className="bg-navy text-white shadow-lg w-full">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between min-h-[4rem] py-2 gap-x-4 gap-y-2">
            {/* Left: Logo + Nav Links */}
            <div className="flex items-center space-x-2 xl:space-x-6 flex-1 min-w-0">
              <div className="flex items-center space-x-2 flex-shrink-0">
                {logo && <img src={logo} alt="Logo" className="h-8 w-8 lg:h-10 lg:w-10 object-contain bg-white rounded-md p-1 shadow-sm" />}
                <h1 className="text-base lg:text-xl font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] sm:max-w-[200px] lg:max-w-none">
                  {t('app_title')}
                </h1>
              </div>

              {/* Full links — lg+ screens */}
              <div className="hidden lg:flex space-x-1 xl:space-x-2">
                <Link to="/dashboard"     className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/dashboard')}`}>{t('dashboard')}</Link>
                <Link to="/inventory"     className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/inventory')}`}>{t('inventory')}</Link>
                <Link to="/orders"        className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/orders')}`}>{t('orders')}</Link>
                <Link to="/usage-reports" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/usage-reports')}`}>{t('usage_reports')}</Link>
                <Link to="/settings" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/settings')}`}>{t('settings')}</Link>
              </div>

              {/* Icon-only links — md to lg screens */}
              <div className="hidden md:flex lg:hidden space-x-1">
                <Link to="/dashboard" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/dashboard')}`} title={t('dashboard')}><Package size={18} /></Link>
                <Link to="/inventory" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/inventory')}`} title={t('inventory')}><Layers size={18} /></Link>
                <Link to="/orders"    className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/orders')}`}    title={t('orders')}><CreditCard size={18} /></Link>
                <Link to="/usage-reports" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/usage-reports')}`} title={t('usage_reports')}><TrendingDown size={18} /></Link>
                <Link to="/settings"  className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/settings')}`}  title={t('settings')}><RefreshCw size={18} /></Link>
              </div>
            </div>

            {/* Right: User name + Logout */}
            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-auto">
              <div className="hidden sm:flex flex-col items-end border-l border-white/20 pl-4 min-w-[80px]">
                <span className="text-[10px] font-bold text-blue-200 uppercase tracking-tighter leading-none mb-0.5">{user?.role}</span>
                <span className="text-xs lg:text-sm font-medium truncate max-w-[80px] lg:max-w-[150px]">{user?.name}</span>
              </div>
              
              <button
                onClick={logout}
                className="px-3 py-1.5 lg:px-4 lg:py-2 bg-white text-navy rounded-md text-xs lg:text-sm font-bold hover:bg-gray-100 transition shadow-sm whitespace-nowrap"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Offline Warning Banner ── */}
      {!isOnline && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <CloudOff className="h-5 w-5 text-yellow-400 flex-shrink-0" aria-hidden="true" />
            <p className="ml-3 text-sm text-yellow-700">{t('offline_warning')}</p>
          </div>
        </div>
      )}

      {/* ── Page Content ── */}
      <main className="flex-grow max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-600">
            © {new Date().getFullYear()} Ikiké Collective SARL. All rights reserved. Version {pkg.version}
          </p>
        </div>
      </footer>

      {/* ── Floating Language Toggle (bottom-left corner) ── */}
      <button
        onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'fr' : 'en')}
        title={i18n.language === 'en' ? 'Switch to French' : 'Passer à l\'anglais'}
        className={[
          'fixed bottom-6 left-6 z-50',
          'flex items-center justify-center w-12 h-12 rounded-full',
          'bg-white text-navy shadow-lg border border-gray-200',
          'text-xs font-bold tracking-wider',
          'transition-all duration-300 ease-in-out',
          'hover:scale-110 hover:shadow-xl hover:border-navy hover:text-blue-600',
          'active:scale-95 shadow-[0_4px_14px_0_rgba(0,0,0,0.1)]'
        ].join(' ')}
      >
        <div className="flex flex-col items-center leading-none">
          <span className="text-[10px] opacity-50 mb-0.5">{i18n.language === 'en' ? 'FR' : 'EN'}</span>
          <span className="text-sm font-black border-t border-gray-100 pt-0.5">{i18n.language.toUpperCase()}</span>
        </div>
      </button>

      {/* ── Floating Sync Pill (bottom-right corner) ── */}
      <button
        onClick={() => isOnline && triggerSync()}
        disabled={syncStatus === 'syncing' || !isOnline}
        title={
          syncStatus === 'error'   ? 'Sync failed — click to retry' :
          syncStatus === 'syncing' ? 'Syncing…' :
          syncStatus === 'offline' ? 'You are offline' :
          'Click to sync now'
        }
        className={[
          'fixed bottom-6 right-6 z-50',
          'flex items-center gap-2 px-4 py-2.5 rounded-full',
          'text-white text-xs font-semibold tracking-wide',
          'shadow-lg ring-2',
          'transition-all duration-500 ease-in-out',
          pill.bg,
          pill.ring,
          'hover:scale-105 hover:shadow-xl',
          'active:scale-95',
          'disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg',
        ].join(' ')}
      >
        {pill.icon}
        <span>{pill.label}</span>
        {/* Pulsing dot for pending state */}
        {syncStatus === 'pending' && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
        )}
      </button>
    </div>
  );
};

export default Layout;
