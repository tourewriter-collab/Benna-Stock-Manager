import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import pkg from '../../package.json';
import { Cloud, CloudOff, RefreshCw, AlertCircle, Package, Layers, CreditCard, CheckCircle2, TrendingDown, Truck, Bell, BellOff, Trash, Check, Sparkles, Info, Users, Settings as SettingsIcon, ClipboardList, Award } from 'lucide-react';
import { fetchApi } from '../lib/api';
import UpdaterOverlay from './UpdaterOverlay';
import ModuleSwitcher from './ModuleSwitcher';
import { IkikeAgent } from './IkikeAgent';
import { usePermissions } from '../contexts/PermissionsContext';

const Layout: React.FC = () => {
  const { can } = usePermissions();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { syncStatus, pendingCount, triggerSync, isOnline } = useSync();
  const location = useLocation();
  const [logo, setLogo] = React.useState<string | null>(null);

  interface Notification {
    id: string;
    message: string;
    type: string;
    created_at: string;
    is_read: number | boolean;
  }

  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = React.useState(false);

  const fetchNotifications = () => {
    fetchApi('/notifications')
      .then(data => {
        if (Array.isArray(data)) {
          setNotifications(data);
        }
      })
      .catch(err => console.error('[Notifications] Fetch failed:', err));
  };

  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/notifications/${id}/read`, { method: 'PUT' });
      fetchNotifications();
    } catch (err) {
      console.error('[Notifications] Read error:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetchApi('/notifications/read-all', { method: 'PUT' });
      fetchNotifications();
    } catch (err) {
      console.error('[Notifications] Read-all error:', err);
    }
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/notifications/${id}`, { method: 'DELETE' });
      fetchNotifications();
    } catch (err) {
      console.error('[Notifications] Delete error:', err);
    }
  };

  const clearAllNotifications = async () => {
    if (!confirm(t('confirm_clear_notifications'))) return;
    try {
      await fetchApi('/notifications', { method: 'DELETE' });
      fetchNotifications();
    } catch (err) {
      console.error('[Notifications] Clear-all error:', err);
    }
  };

  const isAccounting = location.pathname.startsWith('/accounting');
  const isHr = location.pathname.startsWith('/hr');

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
                <div className="pl-4 border-l border-white/20 ml-2">
                  <ModuleSwitcher />
                </div>
              </div>

              {/* Full links — lg+ screens */}
              <div className="hidden lg:flex space-x-1 xl:space-x-2">
                {!isAccounting && !isHr ? (
                  <>
                    {can('dashboard', 'view') && <Link to="/dashboard"     className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/dashboard')}`}>{t('dashboard')}</Link>}
                    {can('inventory', 'view') && <Link to="/inventory"     className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/inventory')}`}>{t('inventory')}</Link>}
                    {can('orders', 'view') && <Link to="/orders"        className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/orders')}`}>{t('orders')}</Link>}
                    {can('usage_reports', 'view') && <Link to="/usage-reports" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/usage-reports')}`}>{t('usage_reports')}</Link>}
                    {can('fleet', 'view') && <Link to="/fleet"         className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/fleet')}`}>{t('fleet')}</Link>}
                  </>
                ) : isAccounting ? (
                  <>
                    <Link to="/accounting/dashboard" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/accounting/dashboard')}`}>{t('dashboard')}</Link>
                    <Link to="/accounting/invoices"  className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/accounting/invoices')}`}>{t('invoices', 'Invoices')}</Link>
                    <Link to="/accounting/transactions" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/accounting/transactions')}`}>{t('transactions', 'Transactions')}</Link>
                    <Link to="/accounting/accounts" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/accounting/accounts')}`}>{t('accounts', 'Chart of Accounts')}</Link>
                  </>
                ) : (
                  <>
                     <Link to="/hr" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/hr')}`}>{t('hr_dashboard', 'HR Management')}</Link>
                     {can('employee_portal', 'view') && <Link to="/hr/my-tasks" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/hr/my-tasks')}`}>{t('my_tasks', 'My Tasks')}</Link>}
                     {can('employee_portal', 'view') && <Link to="/hr/my-performance" className={`px-2 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition whitespace-nowrap ${isActive('/hr/my-performance')}`}>{t('my_performance', 'My Performance')}</Link>}
                  </>
                )}
              </div>

              {/* Icon-only links — md to lg screens */}
              <div className="hidden md:flex lg:hidden space-x-1">
                {!isAccounting && !isHr ? (
                  <>
                    {can('dashboard', 'view') && <Link to="/dashboard" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/dashboard')}`} title={t('dashboard')}><Package size={18} /></Link>}
                    {can('inventory', 'view') && <Link to="/inventory" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/inventory')}`} title={t('inventory')}><Layers size={18} /></Link>}
                    {can('orders', 'view') && <Link to="/orders"    className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/orders')}`}    title={t('orders')}><CreditCard size={18} /></Link>}
                    {can('usage_reports', 'view') && <Link to="/usage-reports" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/usage-reports')}`} title={t('usage_reports')}><TrendingDown size={18} /></Link>}
                    {can('fleet', 'view') && <Link to="/fleet"     className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/fleet')}`}     title={t('fleet')}><Truck size={18} /></Link>}
                  </>
                ) : isAccounting ? (
                  <>
                    <Link to="/accounting/dashboard" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/accounting/dashboard')}`} title={t('dashboard')}><Package size={18} /></Link>
                    <Link to="/accounting/invoices"  className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/accounting/invoices')}`} title={t('invoices', 'Invoices')}><Layers size={18} /></Link>
                    <Link to="/accounting/transactions" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/accounting/transactions')}`} title={t('transactions', 'Transactions')}><CreditCard size={18} /></Link>
                    <Link to="/accounting/accounts" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/accounting/accounts')}`} title={t('accounts', 'Chart of Accounts')}><Layers size={18} /></Link>
                  </>
                ) : (
                  <>
                     <Link to="/hr" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/hr')}`} title={t('hr_dashboard', 'HR Management')}><Users size={18} /></Link>
                     {can('employee_portal', 'view') && <Link to="/hr/my-tasks" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/hr/my-tasks')}`} title={t('my_tasks', 'My Tasks')}><ClipboardList size={18} /></Link>}
                     {can('employee_portal', 'view') && <Link to="/hr/my-performance" className={`p-2 rounded-md transition hover:bg-white/10 ${isActive('/hr/my-performance')}`} title={t('my_performance', 'My Performance')}><Award size={18} /></Link>}
                  </>
                )}
              </div>
            </div>

            {/* Right: User name + Logout */}
            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-auto">
              {/* Global Settings Gear Icon */}
              {can('settings', 'view') && (
                <Link
                  to="/settings"
                  title={t('settings')}
                  className={`p-2 rounded-full hover:bg-white/10 transition flex items-center justify-center text-white ${isActive('/settings')}`}
                >
                  <SettingsIcon className="w-5 h-5" />
                </Link>
              )}

              {/* Notification Bell Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 rounded-full hover:bg-white/10 transition relative flex items-center justify-center text-white"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-navy animate-bounce" />
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 text-slate-800 flex flex-col max-h-[480px]">
                    {/* Popover Header */}
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
                        <span className="font-extrabold text-slate-800 text-sm">{t('strategic_ai_alerts')}</span>
                      </div>
                      <div className="flex gap-2">
                        {notifications.filter(n => !n.is_read).length > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[10px] text-blue-600 font-bold hover:underline"
                          >
                            {t('read_all')}
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAllNotifications}
                            className="text-[10px] text-slate-400 font-bold hover:underline hover:text-rose-500"
                          >
                            {t('clear_all')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notification List */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                          <BellOff className="w-8 h-8 opacity-40 text-slate-300" />
                          <p className="text-xs font-semibold">{t('no_notifications')}</p>
                          <p className="text-[10px] text-slate-400 max-w-[200px]">{t('strategic_analyses_appear_here')}</p>
                        </div>
                      ) : (
                        notifications.map(notif => {
                          const isStrategy = notif.type === 'strategy';
                          return (
                            <div
                              key={notif.id}
                              className={`p-4 flex gap-3 transition hover:bg-slate-50/50 relative group ${
                                !notif.is_read ? 'bg-blue-50/10' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isStrategy ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {isStrategy ? <Sparkles className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                              </div>

                              <div className="flex-1 space-y-1 pr-4">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                    isStrategy ? 'text-blue-600' : 'text-slate-400'
                                  }`}>
                                    {isStrategy ? t('ikike_strategy') : t('system')}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className={`text-xs leading-relaxed ${
                                  !notif.is_read ? 'text-slate-800 font-medium' : 'text-slate-500'
                                }`}>
                                  {notif.message}
                                </p>
                              </div>

                              {/* Action buttons (hidden by default, shown on hover/group) */}
                              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!notif.is_read && (
                                  <button
                                    onClick={(e) => markAsRead(notif.id, e)}
                                    className="p-1 rounded bg-slate-100 text-emerald-600 hover:bg-emerald-50 transition"
                                    title={t('mark_as_read')}
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => deleteNotification(notif.id, e)}
                                  className="p-1 rounded bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition"
                                  title={t('delete')}
                                >
                                  <Trash className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

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

      {/* ── Updater Overlay ── */}
      <UpdaterOverlay />

      {/* ── Ikiké AI Agent Floating Chat ── */}
      <IkikeAgent />
    </div>
  );
};

export default Layout;
