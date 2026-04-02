import 'dotenv/config';
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
import './database.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// CORS — accept requests from localhost dev servers AND from the packaged
// Electron app (which uses file:// → origin is null/undefined).
// ---------------------------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];
    // No origin means same-origin or Electron file:// request — allow it
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  console.log(`[Server] Express listening on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another instance is already running — that's fine, the window will use it
    console.warn(`[Server] Port ${PORT} already in use — assuming server already running`);
  } else {
    console.error('[Server] Fatal error:', err);
  }
});
