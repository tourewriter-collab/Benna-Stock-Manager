import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { fetchApi } from '../lib/api';
import { formatPrice } from '../utils/currency';
import { Cloud, RefreshCw, AlertCircle, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [showExportModal, setShowExportModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isElectron, setIsElectron] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const [settings, setSettings] = useState({
    high_balance_threshold: '100000',
    company_logo: ''
  });
  const [saving, setSaving] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const canExport = user?.role === 'admin' || user?.role === 'audit_manager';

  useEffect(() => {
    if (window.electron) {
      setIsElectron(true);

      window.electron.updates.getAppVersion().then((info) => {
        setAppVersion(info.version);
      });

      window.electron.updates.onUpdateChecking(() => {
        setUpdateStatus('checking');
        setErrorMessage('');
      });

      window.electron.updates.onUpdateAvailable((info) => {
        setUpdateStatus('available');
        setUpdateInfo(info);
      });

      window.electron.updates.onUpdateNotAvailable((info) => {
        setUpdateStatus('not-available');
        setUpdateInfo(info);
      });

      window.electron.updates.onUpdateError((error) => {
        setUpdateStatus('error');
        setErrorMessage(error.message);
      });

      window.electron.updates.onDownloadProgress((progress) => {
        setUpdateStatus('downloading');
        setDownloadProgress(Math.round(progress.percent));
      });

      window.electron.updates.onUpdateDownloaded((info) => {
        setUpdateStatus('downloaded');
        setUpdateInfo(info);
      });
    }
    fetchSettings();
    if (user?.role === 'admin') {
      fetchDiagnostics();
    }
  }, []);

  const fetchDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const data = await fetchApi('/sync/diagnostics', {
        headers: { 'x-navigator-online': String(navigator.onLine) }
      });
      setDiagnostics(data);
    } catch (err) {
      console.error('Failed to fetch diagnostics:', err);
    } finally {
      setDiagLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await fetchApi('/settings');
      if (data) {
        setSettings({
          high_balance_threshold: data.high_balance_threshold || '100000',
          company_logo: data.company_logo || ''
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await fetchApi('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      alert(t('settings_saved'));
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(t('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings({ ...settings, company_logo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCheckForUpdates = async () => {
    if (!window.electron) return;

    setUpdateStatus('checking');
    setErrorMessage('');

    const result = await window.electron.updates.checkForUpdates();

    if (!result.success) {
      setUpdateStatus('error');
      setErrorMessage(result.message || 'Failed to check for updates');
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.electron) return;

    const result = await window.electron.updates.downloadUpdate();

    if (!result.success) {
      setUpdateStatus('error');
      setErrorMessage(result.message || 'Failed to download update');
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electron) return;

    await window.electron.updates.installUpdate();
  };

  const handlePurgeLocal = async () => {
    if (!confirm(t('confirm_factory_reset'))) return;
    setIsPurging(true);
    try {
      await fetchApi('/settings/purge-local', { method: 'POST' });
      alert(t('purge_success'));
      // Trigger a sync immediately after purge
      window.location.reload();
    } catch (err) {
      alert(t('error'));
    } finally {
      setIsPurging(false);
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const handleExport = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);

      const logs = await fetchApi(`/api/reports/audit-logs?${queryParams.toString()}`);

      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Audit Logs');

      worksheet.columns = [
        { header: 'Timestamp', key: 'timestamp', width: 20 },
        { header: 'User', key: 'user', width: 30 },
        { header: 'Action', key: 'action', width: 15 },
        { header: 'Table', key: 'table', width: 15 },
        { header: 'Record ID', key: 'recordId', width: 36 },
        { header: 'Old Values', key: 'oldValues', width: 30 },
        { header: 'New Values', key: 'newValues', width: 30 },
      ];

      logs.forEach((log: any) => {
        const formatValues = (values: any) => {
          if (!values) return '';
          const valObj = typeof values === 'string' ? JSON.parse(values) : values;
          const formatted = { ...valObj };
          if (formatted.price && typeof formatted.price === 'number') {
            formatted.price = formatPrice(formatted.price);
          }
          return JSON.stringify(formatted);
        };

        worksheet.addRow({
          timestamp: new Date(log.timestamp).toLocaleString(),
          user: log.user_email || 'Unknown',
          action: log.action,
          table: log.table_name,
          recordId: log.record_id,
          oldValues: formatValues(log.old_values),
          newValues: formatValues(log.new_values),
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit_logs_${startDate}_to_${endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('settings')}</h1>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">{t('language')}</h2>
          <div className="flex space-x-4">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-4 py-2 rounded-md ${
                i18n.language === 'en' ? 'bg-navy text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              {t('english')}
            </button>
            <button
              onClick={() => handleLanguageChange('fr')}
              className={`px-4 py-2 rounded-md ${
                i18n.language === 'fr' ? 'bg-navy text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              {t('french')}
            </button>
          </div>
        </div>

        {isElectron && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">{t('software_updates')}</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{t('current_version')}</p>
                  <p className="text-lg font-semibold text-gray-900">{appVersion || t('loading')}</p>
                </div>

                <button
                  onClick={handleCheckForUpdates}
                  disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                  className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateStatus === 'checking' ? t('checking') : t('check_for_updates')}
                </button>
              </div>

                <div className="text-xs text-gray-500 italic mt-2">
                  {t('update_note')}
                </div>

              {updateStatus === 'checking' && (
                <div className="text-blue-600">
                  <span>{t('checking_for_updates')}</span>
                </div>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h3 className="font-semibold text-blue-900">{t('update_available')}</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    {t('update_version_available', { version: updateInfo.version })}
                  </p>
                  {updateInfo.releaseNotes && (
                    <div 
                      className="text-sm text-blue-600 mt-2 whitespace-pre-line"
                      dangerouslySetInnerHTML={{ 
                        __html: typeof updateInfo.releaseNotes === 'string' 
                          ? updateInfo.releaseNotes 
                          : Array.isArray(updateInfo.releaseNotes) 
                            ? updateInfo.releaseNotes.map(n => n.note).join('\n')
                            : ''
                      }}
                    />
                  )}
                  <button
                    onClick={handleDownloadUpdate}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {t('download_update')}
                  </button>
                </div>
              )}

              {updateStatus === 'downloading' && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h3 className="font-semibold text-blue-900">{t('downloading_update')}</h3>
                  <div className="mt-2">
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${downloadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-blue-700 mt-1">{downloadProgress}{t('percent_complete')}</p>
                  </div>
                </div>
              )}

              {updateStatus === 'downloaded' && updateInfo && (
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <h3 className="font-semibold text-green-900">{t('update_ready')}</h3>
                  <p className="text-sm text-green-700 mt-1">
                    {t('update_ready_message', { version: updateInfo.version })}
                  </p>
                  <button
                    onClick={handleInstallUpdate}
                    className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    {t('restart_and_install')}
                  </button>
                </div>
              )}

              {updateStatus === 'not-available' && (
                <div className="text-green-600">
                  <span>{t('up_to_date')}</span>
                </div>
              )}

              {updateStatus === 'error' && errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <h3 className="font-semibold text-red-900">{t('update_error')}</h3>
                  <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {canExport && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">{t('export_audit_logs')}</h2>
            <p className="text-gray-600 mb-4">{t('export_audit_logs_description')}</p>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90"
            >
              {t('export')}
            </button>
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow-md p-6 border border-red-200">
            <h2 className="text-xl font-semibold mb-2 text-red-700">{t('factory_reset')}</h2>
            <p className="text-gray-600 mb-4 bg-red-50 p-3 rounded text-sm text-red-800 border border-red-100">
              {t('factory_reset_description')}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-red-700 mb-1">
                {i18n.language === 'fr'
                  ? 'Tapez SUPPRIMER pour confirmer :'
                  : 'Type DELETE to confirm:'}
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder={i18n.language === 'fr' ? 'SUPPRIMER' : 'DELETE'}
                className="w-full px-3 py-2 border border-red-300 rounded-md focus:ring-red-500 focus:border-red-500 text-sm"
              />
            </div>
            <div className="flex space-x-4">
              <button
                onClick={async () => {
                  const expected = i18n.language === 'fr' ? 'SUPPRIMER' : 'DELETE';
                  if (resetConfirmText !== expected) {
                    alert(i18n.language === 'fr'
                      ? `Veuillez taper exactement "${expected}" pour confirmer.`
                      : `Please type "${expected}" exactly to confirm.`);
                    return;
                  }
                  if (!confirm(t('confirm_factory_reset'))) return;
                  
                  try {
                    await fetchApi('/settings/factory-reset', { method: 'DELETE' });
                    alert(t('factory_reset_success'));
                    logout();
                    window.location.hash = '#/login';
                    window.location.reload();
                  } catch (error) {
                    console.error('Error during factory reset:', error);
                    alert(t('factory_reset_error'));
                  }
                }}
                disabled={resetConfirmText !== (i18n.language === 'fr' ? 'SUPPRIMER' : 'DELETE')}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-md hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('execute_factory_reset')}
              </button>
            </div>
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center">
                <Cloud className="w-5 h-5 mr-2 text-navy" />
                {t('cloud_connectivity')}
              </h2>
              <button 
                onClick={fetchDiagnostics}
                disabled={diagLoading}
                className="text-navy hover:text-opacity-80 disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${diagLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {diagnostics ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-600">{t('internet_status')}</span>
                    {diagnostics.isOnline ? (
                      <span className="flex items-center text-green-600 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Online
                      </span>
                    ) : (
                      <span className="flex items-center text-red-600 text-sm font-bold">
                        <XCircle className="w-4 h-4 mr-1" /> Offline
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-600">{t('supabase_config')}</span>
                    {diagnostics.hasUrl && diagnostics.hasServiceKey ? (
                      <span className="flex items-center text-green-600 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Configured
                      </span>
                    ) : (
                      <span className="flex items-center text-red-600 text-sm font-bold">
                        <ShieldAlert className="w-4 h-4 mr-1" /> {t('credentials_missing')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg md:col-span-2">
                    <span className="text-sm font-medium text-gray-600">Pending Sync Items</span>
                    <span className={`text-sm font-bold ${diagnostics.pendingItems > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {diagnostics.pendingItems} {t('items')}
                    </span>
                  </div>
                </div>

                {diagnostics.pendingItems > 0 && diagnostics.configured && diagnostics.isOnline && (
                  <div className="flex justify-center">
                    <button
                      onClick={async () => {
                        setDiagLoading(true);
                        try {
                          await fetchApi('/sync/push', { method: 'POST' });
                          await fetchApi('/sync/pull', { method: 'GET' });
                          fetchDiagnostics();
                        } catch (err) {
                           console.error("Manual sync failed:", err);
                        } finally {
                          setDiagLoading(false);
                        }
                      }}
                      disabled={diagLoading}
                      className="flex items-center px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${diagLoading ? 'animate-spin' : ''}`} />
                      Sync Now
                    </button>
                  </div>
                )}

                {!diagnostics.configured && (
                   <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start">
                     <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                     <div>
                       <p className="font-bold">Connection Failed</p>
                       <p>{diagnostics.errorMessage || "The application cannot reach Supabase. Check your .env file and internet connection."}</p>
                     </div>
                   </div>
                )}

                {diagnostics.configured && diagnostics.isOnline && (
                   <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-start">
                     <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0" />
                     <p>{t('connection_stable')}</p>
                   </div>
                )}

                {diagnostics.diagAttempts && diagnostics.diagAttempts.length > 0 && (
                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Technical Details</h3>
                    <div className="bg-gray-800 text-gray-300 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-48 leading-relaxed">
                      <div className="mb-2 text-blue-400"># System Context</div>
                      <div>CWD: {diagnostics.cwd}</div>
                      <div>RESOURCES: {diagnostics.resourcesPath}</div>
                      <div>NODE: {diagnostics.nodeVersion}</div>
                      <div className="mt-2 mb-2 text-blue-400"># Env File Checks</div>
                      {diagnostics.diagAttempts.map((attempt: any, idx: number) => (
                        <div key={idx} className="mb-1">
                          <span className={attempt.success ? 'text-green-400' : 'text-red-400'}>
                            [{attempt.success ? 'PASS' : 'FAIL'}]
                          </span>{' '}
                          {attempt.path}
                          {!attempt.success && attempt.error && (
                            <span className="text-gray-500"> ({attempt.error})</span>
                          )}
                        </div>
                      ))}
                      <div className="mt-2 text-blue-400"># Supabase Identity</div>
                      <div>URL: {diagnostics.env.VITE_SUPABASE_URL || 'NOT SET'}</div>
                      <div>KEY: {diagnostics.env.SUPABASE_SERVICE_ROLE_KEY || 'NOT SET'}</div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">{t('purge_local_data')}</h3>
                  <p className="text-xs text-gray-500 mb-4">{t('purge_description')}</p>
                  <button 
                    onClick={handlePurgeLocal}
                    disabled={isPurging}
                    className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm font-bold transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isPurging ? 'animate-spin' : ''}`} />
                    {isPurging ? t('loading') : t('execute_purge')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-gray-500 text-sm italic">
                {diagLoading ? t('loading') : "Failed to load cloud diagnostics."}
              </div>
            )}
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">{t('application_settings')}</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('company_logo')}
                </label>
                <div className="flex items-center space-x-4">
                  {settings.company_logo && (
                    <img 
                      src={settings.company_logo} 
                      alt="Logo" 
                      className="h-16 w-16 object-contain border rounded p-1" 
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-navy file:text-white hover:file:bg-opacity-90"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('high_balance_threshold')} (GNF)
                </label>
                <input
                  type="number"
                  value={settings.high_balance_threshold}
                  onChange={(e) => setSettings({ ...settings, high_balance_threshold: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-navy focus:border-navy"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90 disabled:opacity-50"
              >
                {saving ? t('saving') : t('save_settings')}
              </button>
            </div>
          </div>
        )}
      </div>

      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">{t('export_audit_logs')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('start_date')}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('end_date')}</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90"
                >
                  {t('download')}
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
