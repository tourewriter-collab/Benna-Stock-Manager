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
let serverPort = 5000; // Default fallback

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
    let serverPath, envPath;
    if (app.isPackaged) {
      // In production, server files are unpacked outside the main ASAR archive
      serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'index.js');
      envPath = path.join(process.resourcesPath, '.env');
      log.info(`[Production] resourcesPath: ${process.resourcesPath}`);
    } else {
      serverPath = path.join(process.cwd(), 'server', 'index.js');
      envPath = path.join(process.cwd(), '.env');
      log.info(`[Development] cwd: ${process.cwd()}`);
    }

    log.info(`[Main] serverPath: ${serverPath}`);
    log.info(`[Main] envPath: ${envPath}`);

    log.info('Checking for .env at:', envPath);
    let parsedEnv = {};
    if (fs.existsSync(envPath)) {
      log.info('.env file found.');
      const envConfig = require('dotenv').config({ path: envPath, override: true });
      if (envConfig.error) {
        log.error('Error parsing .env file:', envConfig.error);
      } else {
        parsedEnv = envConfig.parsed || {};
        log.info('.env variables loaded successfully. Keys found:', Object.keys(parsedEnv).join(', '));
      }
    } else {
      log.warn('.env file NOT found at expected path!');
    }

    // Log which Supabase vars are present for diagnostics
    log.info('[Supabase Config] VITE_SUPABASE_URL present:', !!process.env.VITE_SUPABASE_URL);
    log.info('[Supabase Config] SUPABASE_URL present:', !!process.env.SUPABASE_URL);
    log.info('[Supabase Config] SUPABASE_SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    log.info('Starting internal server from:', serverPath);

    const serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: app.isPackaged ? 0 : (process.env.PORT || 5000), // Random port in prod, fixed in dev
        // Explicitly carry the Supabase credentials so the forked child
        // always has them, regardless of whether its own dotenv call works.
        ...(parsedEnv.VITE_SUPABASE_URL ? { VITE_SUPABASE_URL: parsedEnv.VITE_SUPABASE_URL } : {}),
        ...(parsedEnv.SUPABASE_URL ? { SUPABASE_URL: parsedEnv.SUPABASE_URL } : {}),
        ...(parsedEnv.SUPABASE_SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY: parsedEnv.SUPABASE_SERVICE_ROLE_KEY } : {}),
        ...(parsedEnv.SERVICE_ROLE_KEY ? { SERVICE_ROLE_KEY: parsedEnv.SERVICE_ROLE_KEY } : {}),
        ...(parsedEnv.JWT_SECRET ? { JWT_SECRET: parsedEnv.JWT_SECRET } : {}),
        // Let the server know where to find .env (for completeness)
        RESOURCES_PATH: app.isPackaged ? process.resourcesPath : process.cwd(),
        // Production SQLite writes must go to an unwalkable user data dir
        DB_PATH: path.join(app.getPath('userData'), 'database.sqlite'),
        APP_VERSION: app.getVersion()
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    serverProcess.on('message', (msg) => {
      if (msg.type === 'SERVER_READY') {
        serverPort = msg.port;
        log.info(`[Main] Server reported port: ${serverPort}`);
      }
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
  return { 
    version: app.getVersion(),
    serverPort: serverPort
  };
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
