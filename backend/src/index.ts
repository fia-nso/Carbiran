import 'reflect-metadata'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'

import { AppDataSource } from './config/database'

import authRoutes           from './routes/auth'
import demandesRoutes       from './routes/demandes'
import vehiculesRoutes      from './routes/vehicules'
import ravitaillementsRoutes from './routes/ravitaillements'
import signaturesRoutes     from './routes/signatures'
import notificationsRoutes  from './routes/notifications'
import storageRoutes        from './routes/storage'
import logsRoutes           from './routes/logs'

const app = express()
const PORT         = process.env.PORT         || 3000
const STORAGE_PATH = process.env.STORAGE_PATH || './uploads'
const CORS_ORIGIN  = process.env.CORS_ORIGIN  || 'http://localhost:5173'

app.set('trust proxy', true)

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.10.10:3200',
  'https://carburan-rimatel.vercel.app'
]
const ALLOWED_CORS_ORIGINS = (
  process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) || DEFAULT_CORS_ORIGINS
)

app.use(cors({
  origin: (origin, callback) => {
    // Autorise les clients sans header Origin (curl, health checks, appels serveur à serveur).
    if (!origin) return callback(null, true)

    if (ALLOWED_CORS_ORIGINS.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`Origine CORS refusée: ${origin}`))
  },
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.resolve(STORAGE_PATH)))

app.use('/api/auth',            authRoutes)
app.use('/api/demandes',        demandesRoutes)
app.use('/api/vehicules',       vehiculesRoutes)
app.use('/api/ravitaillements', ravitaillementsRoutes)
app.use('/api/signatures',      signaturesRoutes)
app.use('/api/notifications',   notificationsRoutes)
app.use('/api/storage',         storageRoutes)
app.use('/api/logs',            logsRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Global Error]', err)
  res.status(500).json({ error: err.message || 'Erreur serveur interne' })
})

AppDataSource.initialize()
  .then(() => {
    console.log('Base de données connectée')
    app.listen(PORT, () => console.log(`Carbiran backend → http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('Erreur DB:', err)
    process.exit(1)
  })
