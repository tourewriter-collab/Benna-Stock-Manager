/// <reference types="vite/client" />

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface UpdateCheckResult {
  success: boolean;
  message?: string;
  currentVersion?: string;
  updateInfo?: UpdateInfo;
}

interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  updates: {
    checkForUpdates: () => Promise<UpdateCheckResult>;
    downloadUpdate: () => Promise<{ success: boolean; message?: string }>;
    installUpdate: () => Promise<{ success: boolean; message?: string }>;
    getAppVersion: () => Promise<{ version: string; isPackaged: boolean }>;
    onUpdateChecking: (callback: () => void) => void;
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
    onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => void;
    onUpdateError: (callback: (error: { message: string }) => void) => void;
    onDownloadProgress: (callback: (progress: UpdateProgress) => void) => void;
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void;
  };
}

interface Window {
  electron?: ElectronAPI;
}
