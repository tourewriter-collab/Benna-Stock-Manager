import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { fetchApi } from '../lib/api';
import { formatPrice } from '../utils/currency';

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
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
  }, []);

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
            <h2 className="text-xl font-semibold mb-4">Software Updates</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Current Version</p>
                  <p className="text-lg font-semibold text-gray-900">{appVersion || 'Loading...'}</p>
                </div>

                <button
                  onClick={handleCheckForUpdates}
                  disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                  className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
                </button>
              </div>

              <div className="text-xs text-gray-500 italic mt-2">
                Note: In order for the updater to detect a new version, a formal "Release" containing the built installer must be published on GitHub by the CI pipeline. Standard code commits will not trigger an update.
              </div>

              {updateStatus === 'checking' && (
                <div className="text-blue-600">
                  <span>Checking for updates...</span>
                </div>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h3 className="font-semibold text-blue-900">Update Available</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Version {updateInfo.version} is available for download.
                  </p>
                  {updateInfo.releaseNotes && (
                    <p className="text-sm text-blue-600 mt-2 whitespace-pre-line">
                      {updateInfo.releaseNotes}
                    </p>
                  )}
                  <button
                    onClick={handleDownloadUpdate}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Download Update
                  </button>
                </div>
              )}

              {updateStatus === 'downloading' && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h3 className="font-semibold text-blue-900">Downloading Update</h3>
                  <div className="mt-2">
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${downloadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-blue-700 mt-1">{downloadProgress}% complete</p>
                  </div>
                </div>
              )}

              {updateStatus === 'downloaded' && updateInfo && (
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <h3 className="font-semibold text-green-900">Update Ready</h3>
                  <p className="text-sm text-green-700 mt-1">
                    Version {updateInfo.version} has been downloaded and is ready to install.
                  </p>
                  <button
                    onClick={handleInstallUpdate}
                    className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Restart and Install
                  </button>
                </div>
              )}

              {updateStatus === 'not-available' && (
                <div className="text-green-600">
                  <span>You are running the latest version</span>
                </div>
              )}

              {updateStatus === 'error' && errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <h3 className="font-semibold text-red-900">Update Error</h3>
                  <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {canExport && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">{t('export_audit_logs')}</h2>
            <p className="text-gray-600 mb-4">Export audit logs to Excel for analysis</p>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90"
            >
              {t('export')}
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">{t('sync_google_drive')}</h2>
          <p className="text-gray-600 mb-4">Google Drive sync is not yet configured</p>
          <div className="flex space-x-4">
            <button
              onClick={() => alert('Google Drive OAuth flow would be initiated here')}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              {t('connect_google_drive')}
            </button>
            <button
              onClick={() => alert('Syncing with Google Drive...')}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              {t('sync_now')}
            </button>
          </div>
        </div>

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
