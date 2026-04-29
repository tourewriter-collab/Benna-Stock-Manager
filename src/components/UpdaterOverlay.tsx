import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, AlertCircle, CheckCircle2, ArrowUpCircle } from 'lucide-react';

const UpdaterOverlay: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.electron) return;

    // Listen for events from the main process
    window.electron.updates.onUpdateAvailable((info: any) => {
      setUpdateInfo(info);
      setStatus('available');
      setVisible(true);
    });

    window.electron.updates.onUpdateNotAvailable(() => {
      // Don't show anything if no update is available (unless triggered manually)
    });

    window.electron.updates.onUpdateError((err: any) => {
      console.error('[Updater] Error:', err);
      setError(err.message || 'An error occurred during update');
      setStatus('error');
      setVisible(true);
    });

    window.electron.updates.onDownloadProgress((prog: any) => {
      setStatus('downloading');
      setProgress(prog.percent || 0);
    });

    window.electron.updates.onUpdateDownloaded(() => {
      setStatus('downloaded');
      setProgress(100);
    });

    // Check for updates automatically on start
    window.electron.updates.checkForUpdates().catch(err => {
        console.error("[Updater] Initial check failed:", err);
    });
  }, []);

  const handleDownload = async () => {
    try {
      setStatus('downloading');
      await window.electron?.updates.downloadUpdate();
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleInstall = () => {
    window.electron?.updates.installUpdate();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 right-6 z-[100] max-w-sm w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-navy p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <ArrowUpCircle className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-sm tracking-tight">Software Update</span>
          </div>
          <button 
            onClick={() => setVisible(false)}
            className="text-white/50 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {status === 'available' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-gray-900">New Version Available!</h3>
                <p className="text-xs text-gray-500 mt-1">Version {updateInfo?.version} is ready to download.</p>
              </div>
              <button 
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-200"
              >
                <Download size={16} />
                Download Update
              </button>
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Downloading...</span>
                <span className="text-xs font-black text-blue-600">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 text-center uppercase font-bold tracking-widest italic">
                Please do not close the application
              </p>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-600">
                <CheckCircle2 size={24} />
                <div>
                  <h3 className="font-bold text-gray-900">Update Ready!</h3>
                  <p className="text-xs text-gray-500">The new version has been downloaded.</p>
                </div>
              </div>
              <button 
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
              >
                <RefreshCw size={16} />
                Install & Restart
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle size={24} />
                <div>
                  <h3 className="font-bold text-gray-900">Update Failed</h3>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">{error}</p>
                </div>
              </div>
              <button 
                onClick={() => setVisible(false)}
                className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdaterOverlay;
