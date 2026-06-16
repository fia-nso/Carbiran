import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

import authRoutes          from './routes/auth';
import demandesRoutes      from './routes/demandes';
import vehiculesRoutes     from './routes/vehicules';
import ravitaillementsRoutes from './routes/ravitaillements';
import signaturesRoutes    from './routes/signatures';
import notificationsRoutes from './routes/notifications';
import storageRoutes       from './routes/storage';
import logsRoutes          from './routes/logs';

const app = express();
const PORT         = process.env.PORT         || 3000;
const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';
const CORS_ORIGIN  = process.env.CORS_ORIGIN  || 'http://localhost:5173';

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers uploadés (photos + signatures)
app.use('/uploads', express.static(path.resolve(STORAGE_PATH)));

// ── Routes API ───────────────────────────────────────────────────────────────

app.use('/api/auth',            authRoutes);
app.use('/api/demandes',        demandesRoutes);
app.use('/api/vehicules',       vehiculesRoutes);
app.use('/api/ravitaillements', ravitaillementsRoutes);
app.use('/api/signatures',      signaturesRoutes);
app.use('/api/notifications',   notificationsRoutes);
app.use('/api/storage',         storageRoutes);
app.use('/api/logs',            logsRoutes);

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Gestionnaire d'erreurs global ────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Global Error]', err);
  res.status(500).json({ error: err.message || 'Erreur serveur interne' });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Carbiran backend démarré → http://localhost:${PORT}`);
});
