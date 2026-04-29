import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { fetchApi } from '../lib/api';
import { useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon, Truck, Tags, Activity, RefreshCw, AlertCircle, Download, Users } from 'lucide-react';
import CategoryManager from '../components/settings/CategoryManager';
import SupplierManager from '../components/settings/SupplierManager';
import AdminUsers from '../pages/AdminUsers';

type Tab = 'general' | 'suppliers' | 'categories' | 'diagnostics' | 'users';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'general');

  // Sync state if URL changes externally
  useEffect(() => {
    const tab = searchParams.get('tab') as Tab;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };
  const [showExportModal, setShowExportModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isElectron, setIsElectron] = useState(false);
  const [appVersion, setAppVersion] = useState('');


  const [settings, setSettings] = useState({
    high_balance_threshold: '100000',
    show_total_stock_value: 'true',
    company_logo: '',
    gemini_api_key: ''
  });
  const [saving, setSaving] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetOptions, setResetOptions] = useState({
    inventory: true,
    orders: true,
    payments: true,
    usage: true,
    base_data: false,
    audit: true
  });

  const isAdmin = user?.role === 'admin';
  const canExport = user?.role === 'admin' || user?.role === 'audit_manager';

  useEffect(() => {
    if (window.electron) {
      setIsElectron(true);
      window.electron.updates.getAppVersion().then((info) => setAppVersion(info.version));
    }
    fetchSettings();
    if (isAdmin) fetchDiagnostics();
  }, []);

  const fetchDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const data = await fetchApi('/sync/diagnostics', { headers: { 'x-navigator-online': String(navigator.onLine) } });
      setDiagnostics(data);
    } catch (err) { console.error('Failed diagnostics:', err); }
    finally { setDiagLoading(false); }
  };

  const fetchSettings = async () => {
    try {
      const data = await fetchApi('/settings');
      if (data) setSettings({ 
        high_balance_threshold: data.high_balance_threshold || '100000', 
        show_total_stock_value: data.show_total_stock_value !== undefined ? String(data.show_total_stock_value) : 'true',
        company_logo: data.company_logo || '', 
        gemini_api_key: data.gemini_api_key || '' 
      });
    } catch (error) { console.error('Error fetching settings:', error); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await fetchApi('/settings', { method: 'POST', body: JSON.stringify(settings) });
      alert(t('settings_saved'));
    } catch (error) { alert(t('error')); }
    finally { setSaving(false); }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSettings({ ...settings, company_logo: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handlePurgeLocal = async () => {
    if (!confirm(t('confirm_purge') || "Are you sure you want to purge local data? This will trigger a full re-sync.")) return;
    setIsPurging(true);
    try {
      await fetchApi('/sync/purge', { method: 'POST' });
      window.location.reload();
    } catch (error) { alert(t('error')); setIsPurging(false); }
  };

  const handleFullReset = async () => {
    if (!resetPassword) {
      alert("Password is required");
      return;
    }
    
    setIsResetting(true);
    try {
      console.log('[Settings] Triggering Full Reset with options:', resetOptions);
      const response = await fetchApi('/settings/full-reset', { 
        method: 'POST', 
        body: JSON.stringify({ 
          password: resetPassword,
          options: resetOptions
        }) 
      });
      console.log('[Settings] Reset response:', response);
      alert("Selected data has been erased. The application will now reload.");
      
      // Clear any local caches that might persist
      localStorage.removeItem('benna_inventory_cache');
      localStorage.removeItem('benna_dashboard_stats');
      
      window.location.reload();
    } catch (error: any) {
      console.error('[Settings] Reset failed:', error);
      alert(error.message || "Reset failed. Check your password.");
      setIsResetting(false);
    }
  };

  const handleExport = async () => {
    try {
      const url = `/api/audit/export?start_date=${startDate}&end_date=${endDate}`;
      const response = await fetchApi(url, { responseType: 'blob' } as any);
      const downloadUrl = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `audit_logs_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setShowExportModal(false);
    } catch (error) { alert(t('error_exporting')); }
  };

  const TabButton = ({ id, label, icon: Icon }: { id: Tab, label: string, icon: any }) => (
    <button
      onClick={() => handleTabChange(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${
        activeTab === id 
        ? 'bg-blue-100 text-blue-900 shadow-sm border border-blue-200' 
        : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      <Icon size={18} className={activeTab === id ? 'text-blue-700' : 'text-gray-400'} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* ── Sidebar ── */}
      <aside className="w-full md:w-64 space-y-2 flex-shrink-0">
        <h1 className="text-2xl font-bold text-[#001f3f] mb-6 px-4">{t('settings')}</h1>
        <TabButton id="general" label={t('general')} icon={SettingsIcon} />
        <TabButton id="suppliers" label={t('suppliers')} icon={Truck} />
        <TabButton id="categories" label={t('categories')} icon={Tags} />
        {isAdmin && <TabButton id="users" label={t('admin_users')} icon={Users} />}
        {isAdmin && <TabButton id="diagnostics" label={t('performance')} icon={Activity} />}
        
        {canExport && (
          <div className="pt-6 border-t border-gray-200 mt-6">
            <button
              onClick={() => setShowExportModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-navy bg-white border border-gray-200 hover:bg-gray-50 transition-all"
            >
              <Download size={18} />
              {t('export_audit_logs')}
            </button>
          </div>
        )}
      </aside>

      {/* ── Content Area ── */}
      <main className="flex-grow bg-white rounded-2xl shadow-sm border border-gray-100 p-8 min-h-[70vh]">
        {activeTab === 'general' && (
          <div className="max-w-2xl space-y-8">
            <section className="space-y-6">
              <h2 className="text-xl font-bold text-[#001f3f]">{t('application_settings')}</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('company_logo')}</label>
                <div className="flex items-center gap-6 p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                  <div className="h-20 w-20 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center p-2">
                    {settings.company_logo ? (
                      <img src={settings.company_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="text-[10px] text-gray-300 font-bold uppercase text-center">{t('no_data')}</div>
                    )}
                  </div>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-navy file:text-white hover:file:bg-opacity-90" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('high_balance_threshold')} (GNF)</label>
                <input type="number" value={settings.high_balance_threshold} onChange={e => setSettings({ ...settings, high_balance_threshold: e.target.value })} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                <p className="mt-1 text-xs text-gray-400">{t('high_balance_desc')}</p>
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                <div>
                  <label className="block text-sm font-bold text-gray-900">{t('show_total_stock_value')}</label>
                  <p className="text-xs text-gray-500">{t('show_total_stock_value_desc')}</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, show_total_stock_value: settings.show_total_stock_value === 'true' ? 'false' : 'true' })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.show_total_stock_value === 'true' ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.show_total_stock_value === 'true' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="bg-orange-50 border border-orange-200 p-5 rounded-xl">
                <div className="flex items-start gap-3 mb-4">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                  <div className="space-y-1">
                    <label className="block text-sm font-bold text-orange-900">{t('gemini_ai_key')}</label>
                    <p className="text-xs text-orange-800 leading-relaxed">{t('gemini_warning')}</p>
                  </div>
                </div>
                <input type="password" value={settings.gemini_api_key} onChange={e => setSettings({ ...settings, gemini_api_key: e.target.value })} className="w-full px-4 py-2 border border-orange-200 rounded-lg bg-white" placeholder="AIzaSy..." />
              </div>

              <button onClick={handleSaveSettings} disabled={saving} className="w-full py-3 bg-navy text-white rounded-xl font-bold shadow-lg shadow-navy/20 hover:bg-opacity-90 transition disabled:opacity-50">
                {saving ? t('saving') : t('save_settings')}
              </button>

              {isElectron && (
                <div className="pt-6 border-t border-gray-100 mt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('version')}</div>
                      <div className="text-lg font-black text-navy">{appVersion}</div>
                    </div>
                    
                    <button 
                      onClick={async () => {
                        setDiagLoading(true);
                        try {
                          await window.electron.updates.checkForUpdates();
                        } catch (err) {
                          console.error("Manual check failed:", err);
                        } finally {
                          setDiagLoading(false);
                        }
                      }}
                      disabled={diagLoading}
                      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-black uppercase border border-blue-100 hover:bg-blue-100 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3 h-3 ${diagLoading ? 'animate-spin' : ''}`} />
                      Check for Updates
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'suppliers' && <SupplierManager />}
        {activeTab === 'categories' && <CategoryManager />}
        {activeTab === 'users' && isAdmin && <AdminUsers />}

        {activeTab === 'diagnostics' && isAdmin && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#001f3f]">{t('performance')}</h2>
            
            {diagLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg w-full"></div>)}
              </div>
            ) : diagnostics ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-[10px] uppercase font-black text-gray-400 mb-1">Local Pending</div>
                    <div className="text-2xl font-black text-navy">{diagnostics.local_count}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-[10px] uppercase font-black text-gray-400 mb-1">{t('sync_now')}</div>
                    <div className="text-2xl font-black text-green-600">{(diagnostics.sync_errors?.length || 0) === 0 ? 'Healthy' : 'Issues'}</div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">{t('purge_local_data')}</h3>
                  <p className="text-xs text-gray-500 mb-4">{t('purge_description')}</p>
                  <div className="flex flex-col md:flex-row gap-4">
                <button
                  onClick={handleRepairInventory}
                  disabled={isRepairing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isRepairing ? 'animate-spin' : ''}`} />
                  {isRepairing ? t('settings.diagnostics.repairing') : t('settings.diagnostics.repair_inventory')}
                </button>

                <button
                  onClick={async () => {
                    if (!confirm("This will compare all local data with the cloud and remove items that no longer exist in Supabase. Continue?")) return;
                    setIsRepairing(true);
                    try {
                      const res = await fetchApi('/sync/reconcile-deletions', { method: 'POST' });
                      console.log('[Sync] Reconciliation results:', res);
                      alert("Reconciliation complete. Any 'ghost' items have been removed.");
                      window.location.reload();
                    } catch (error: any) {
                      alert("Reconciliation failed: " + error.message);
                    } finally {
                      setIsRepairing(false);
                    }
                  }}
                  disabled={isRepairing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Database className="w-4 h-4" />
                  Reconcile Cloud Deletions
                </button>
              </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 italic">{t('error')}</div>
            )}

            <div className="pt-6 border-t border-red-100 bg-red-50/30 p-6 rounded-2xl mt-8">
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertCircle size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider">Danger Zone</h3>
              </div>
              <p className="text-xs text-red-600 mb-4">
                This will permanently erase ALL data from the LOCAL database and the CLOUD (Supabase). 
                This action is irreversible. Use only if you want to start fresh.
              </p>
              <button 
                onClick={() => setShowResetModal(true)} 
                className="flex items-center px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-bold shadow-lg shadow-red-200 transition"
              >
                <Activity className="w-4 h-4 mr-2" />
                Full Reset (Local + Cloud)
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Export Modal ── */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-navy mb-6">{t('export_audit_logs')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{t('start_date')}</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{t('end_date')}</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3 pt-6">
                <button onClick={handleExport} className="flex-1 bg-navy text-white py-3 rounded-xl font-bold shadow-lg shadow-navy/20">{t('download')}</button>
                <button onClick={() => setShowExportModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold">{t('cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Confirmation Modal ── */}
      {showResetModal && (
        <div className="fixed inset-0 bg-red-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl border-2 border-red-100">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle size={32} />
              <h2 className="text-2xl font-black uppercase tracking-tight">Nuclear Reset</h2>
            </div>
            
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              Select the data you want to <span className="font-bold text-red-600">PERMANENTLY ERASE</span> from both this device and the cloud.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6 bg-red-50/50 p-4 rounded-xl border border-red-100">
              {Object.entries(resetOptions).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={value} 
                      onChange={() => setResetOptions({ ...resetOptions, [key]: !value })}
                      className="peer h-5 w-5 appearance-none rounded border-2 border-red-200 checked:bg-red-600 checked:border-red-600 transition-all cursor-pointer"
                    />
                    <svg className="absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 top-1 left-1 pointer-events-none transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-700 group-hover:text-red-700 transition-colors">
                    {key.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Confirm Admin Password</label>
                <input 
                  type="password" 
                  value={resetPassword} 
                  onChange={e => setResetPassword(e.target.value)} 
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-red-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={handleFullReset} 
                  disabled={isResetting || !resetPassword || !Object.values(resetOptions).some(v => v)}
                  className="w-full bg-red-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-red-200 hover:bg-red-700 disabled:opacity-50 transition-all flex items-center justify-center"
                >
                  {isResetting ? <RefreshCw className="animate-spin mr-2" /> : null}
                  Confirm & Erase Selected Data
                </button>
                <button 
                  onClick={() => { setShowResetModal(false); setResetPassword(''); }} 
                  disabled={isResetting}
                  className="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
