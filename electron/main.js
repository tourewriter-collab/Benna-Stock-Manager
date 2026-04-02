import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { config as dotenvConfig } from 'dotenv';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import log from 'electron-log';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// createRequire lets us use require() for CommonJS modules from ESM context
const require = createRequire(import.meta.url);
const http = require('http');

log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow;
let updateCheckInProgress = false;

// ---------------------------------------------------------------------------
// App configuration
// ---------------------------------------------------------------------------

// Disable hardware acceleration to resolve blank/white screen issues 
// and GPU process crashes on certain Windows configurations/VMs.
app.disableHardwareAcceleration();

// ---------------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------------

/**
 * Poll the health endpoint until the Express server is ready,
 * then resolve. Gives up after maxAttempts and resolves anyway
 * so the window always opens.
 */
function waitForServer(port, maxAttempts = 40) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        log.info(`[Server] Ready on port ${port}`);
        resolve();
      });
      req.on('error', () => {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          log.warn(`[Server] Not ready after ${maxAttempts} attempts — proceeding anyway`);
          resolve();
        }
      });
      req.end();
    };
    // Give the server a brief head-start before first check
    setTimeout(check, 300);
  });
}

/**
 * Import the Express server module in-process (same Electron Node context).
 * This avoids all child-process / ASAR / ABI complications with native modules.
 */
async function startServer() {
  try {
    log.info('[Server] Loading Express server module in-process…');
    await import('../server/index.js');
    log.info('[Server] Module loaded, waiting for HTTP server…');
    await waitForServer(5000);
  } catch (err) {
    log.error('[Server] Failed to start:', err);
    // Don't rethrow — let the window open even if the server fails,
    // so the user can see an error rather than a permanent blank screen.
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Must be .cjs — Electron preload scripts cannot use ESM
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });

  // Build the URL / file path we will load
  const startURL = app.isPackaged
    ? `file://${path.join(__dirname, '..', 'dist', 'index.html')}`
    : 'http://localhost:3000';

  log.info('[Window] Loading:', startURL);

  // --- Diagnostic listeners ---
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`[Window] did-fail-load (${errorCode}): ${errorDescription}`);
    log.error('[Window] Attempted URL:', startURL);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('[Window] Page loaded successfully');
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('[Window] Renderer process gone:', details);
  });

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    log.info(`[Renderer] ${message}`);
  });
  // --- End diagnostic listeners ---

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
      .catch(err => log.error('[Window] loadFile error:', err));
  } else {
    mainWindow.loadURL('http://localhost:3000')
      .catch(err => log.error('[Window] loadURL error:', err));
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function setupAutoUpdater() {
  if (!app.isPackaged) {
    log.info('[Updater] Disabled in development mode');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking…');
    if (mainWindow) mainWindow.webContents.send('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Update available:', info);
    updateCheckInProgress = false;
    if (mainWindow) mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] Up to date:', info);
    updateCheckInProgress = false;
    if (mainWindow) mainWindow.webContents.send('update-not-available', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err);
    updateCheckInProgress = false;
    if (mainWindow) mainWindow.webContents.send('update-error', { message: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`[Updater] Progress: ${progressObj.percent.toFixed(1)}%`);
    if (mainWindow) mainWindow.webContents.send('update-download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Downloaded:', info);
    if (mainWindow) mainWindow.webContents.send('update-downloaded', { version: info.version });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart now to install it?',
      buttons: ['Restart', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => autoUpdater.checkForUpdates(), 1000 * 60 * 60);
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function setupIpcHandlers() {
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { success: false, message: 'Updates only available in production' };
    if (updateCheckInProgress) return { success: false, message: 'Update check already in progress' };
    try {
      updateCheckInProgress = true;
      const result = await autoUpdater.checkForUpdates();
      return { success: true, currentVersion: app.getVersion(), updateInfo: result.updateInfo };
    } catch (error) {
      updateCheckInProgress = false;
      log.error('[IPC] check-for-updates error:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    if (!app.isPackaged) return { success: false, message: 'Updates only available in production' };
    try {
      await autoUpdater.downloadUpdate();
      return { success: true, message: 'Download started' };
    } catch (error) {
      log.error('[IPC] download-update error:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('install-update', async () => {
    if (!app.isPackaged) return { success: false, message: 'Updates only available in production' };
    try {
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (error) {
      log.error('[IPC] install-update error:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('get-app-version', async () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  }));
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('ready', async () => {
  log.info('[App] Ready — Electron', process.versions.electron, '/ Node', process.versions.node);

  // 1. Load .env — must happen BEFORE importing the server module
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '..', '.env');
  dotenvConfig({ path: envPath });
  log.info('[App] Environment loaded from:', envPath);

  // 2. Tell the server where to store the SQLite database.
  //    In packaged mode use the user's writable app-data folder;
  //    in dev mode keep using the repo-root database.sqlite.
  process.env.DB_PATH = app.isPackaged
    ? path.join(app.getPath('userData'), 'database.sqlite')
    : path.join(__dirname, '..', 'database.sqlite');
  log.info('[App] DB_PATH set to:', process.env.DB_PATH);

  setupIpcHandlers();

  // 3. Start the Express + SQLite server in-process
  await startServer();

  // 4. Open the main window
  createWindow();

  // 5. Set up auto-updater (no-op in dev)
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
