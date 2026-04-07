const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { config: dotenvConfig } = require('dotenv');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Setup logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Load environment variables
dotenvConfig();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Benna Stock Manager'
  });

  const startURL = app.isPackaged
    ? `file://${path.join(__dirname, '..', 'dist', 'index.html')}`
    : 'http://localhost:3000';

  mainWindow.loadURL(startURL);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// APP STARTUP
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  createWindow();

  // Start the internal API server (both dev and production)
  try {
    const { fork } = require('child_process');
    const fs = require('fs');
    if (app.isPackaged) {
      // In production, server files are unpacked outside the main ASAR archive
      serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'index.js');
      envPath = path.join(process.resourcesPath, '.env');
    } else {
      serverPath = path.join(process.cwd(), 'server', 'index.js');
      envPath = path.join(process.cwd(), '.env');
    }

    log.info('Checking for .env at:', envPath);
    if (fs.existsSync(envPath)) {
      log.info('.env file found.');
      const envConfig = require('dotenv').config({ path: envPath, override: true });
      if (envConfig.error) {
        log.error('Error parsing .env file:', envConfig.error);
      } else {
        log.info('.env variables loaded successfully.');
      }
    } else {
      log.warn('.env file NOT found at expected path!');
    }

    log.info('Starting internal server from:', serverPath);

    const serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        // Let the server know where to find .env (for completeness)
        RESOURCES_PATH: app.isPackaged ? process.resourcesPath : process.cwd(),
        // Production SQLite writes must go to an unwalkable user data dir
        DB_PATH: path.join(app.getPath('userData'), 'database.sqlite')
      },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => log.info(`[Server] ${data.toString().trim()}`));
    serverProcess.stderr.on('data', (data) => log.error(`[Server Error] ${data.toString().trim()}`));

    serverProcess.on('exit', (code) => {
      log.info(`Internal server exited with code ${code}`);
    });

    app.on('before-quit', () => {
      if (serverProcess) serverProcess.kill();
    });

    log.info('Internal server spawned successfully.');
  } catch (err) {
    log.error('Failed to spawn internal server:', err);
  }


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (app.isPackaged) {
    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ---------------------------------------------------------------------------
// IPC HANDLERS
// ---------------------------------------------------------------------------
ipcMain.handle('get-app-version', () => {
  return { version: app.getVersion() };
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result ? result.updateInfo : null };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-not-available', info);
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update-error', err);
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) mainWindow.webContents.send('download-progress', progress);
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
});
