// IMPORTANT: dotenv must be loaded before any other server module reads process.env.
// Because ES module `import` statements are hoisted, we cannot rely on top-level dotenv.config
// running before route modules are evaluated. Instead, electron/main.js sets RESOURCES_PATH
// and calls dotenvConfig BEFORE dynamic-importing this server module.
// This file does a best-effort secondary load in case it is run standalone (e.g. `node server/index.js`).
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This secondary dotenv load is for standalone/dev use ($node server/index.js).
// When run via Electron, env vars are already set by main.js before this module loads.
const envPath = process.env.RESOURCES_PATH
  ? path.join(process.env.RESOURCES_PATH, '.env')
  : path.join(__dirname, '..', '.env');

dotenv.config({ path: envPath, override: false }); // override:false never clobbers vars already set

// Startup diagnostic — confirm which keys are available at server boot
console.log('[Server] Env check: VITE_SUPABASE_URL =', process.env.VITE_SUPABASE_URL ? `SET (${process.env.VITE_SUPABASE_URL.substring(0, 30)}...)` : 'MISSING');
console.log('[Server] Env check: SUPABASE_URL =', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
console.log('[Server] Env check: SUPABASE_SERVICE_ROLE_KEY =', process.env.SUPABASE_SERVICE_ROLE_KEY ? `SET (len=${process.env.SUPABASE_SERVICE_ROLE_KEY.length})` : 'MISSING');

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import inventoryRoutes from './routes/inventory.js';
import auditRoutes from './routes/audit.js';
import suppliersRoutes from './routes/suppliers.js';
import ordersRoutes from './routes/orders.js';
import paymentsRoutes from './routes/payments.js';
import categoriesRoutes from './routes/categories.js';
import reportsRoutes from './routes/reports.js';
import syncRoutes from './routes/sync.js';
import settingsRoutes from './routes/settings.js';
import visionRoutes from './routes/vision.js';
import db, { runPostStartupMaintenance } from './database.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// CORS -- accept requests from localhost dev servers AND from the packaged
// Electron app (which uses file://  origin is null/undefined).
// ---------------------------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];
    // No origin means same-origin or Electron file:// request -- allow it
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/vision', visionRoutes);

import { getSupabaseDiagnostics } from './supabaseClient.js';

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: getSupabaseDiagnostics(),
  });
});

// ---------------------------------------------------------------------------
// Error handlers
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`[Server] Express listening on port ${actualPort}`);
  
  // If run as a forked child process (Electron), report the port back to parent IMMEDIATELY
  // so the renderer can start making API calls without waiting for seeding.
  if (process.send) {
    process.send({ type: 'SERVER_READY', port: actualPort });
  }

  // Run non-critical maintenance AFTER announcing ready, so startup is fast
  setImmediate(() => {
    try {
      runPostStartupMaintenance();
      console.log('[Server] Post-startup maintenance complete.');
    } catch (e) {
      console.warn('[Server] Post-startup maintenance failed (non-fatal):', e.message);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another instance is already running -- that's fine, the window will use it
    console.warn(`[Server] Port ${PORT} already in use -- assuming server already running`);
  } else {
    console.error('[Server] Fatal error:', err);
  }
});
