import './env.js'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCorsOptions } from './corsOptions.js'
import assistantRoutes from './routes/assistant.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboard.js'
import projectRoutes from './routes/projects.js'
import portfolioRoutes from './routes/portfolio.js'
import skillRoutes from './routes/skills.js'
import { errorHandler, notFound } from './middleware/errors.js'

const app = express()
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDist = path.resolve(currentDir, '../../frontend/dist')

// Render sits behind one trusted reverse proxy. This lets express-rate-limit
// use the real client IP from X-Forwarded-For without rejecting API requests.
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
}))
app.use(cors(createCorsOptions()))
app.use(express.json({ limit: '100kb' }))
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }))

app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/assistant', assistantRoutes)
app.use('/api/skills', skillRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/portfolio', portfolioRoutes)

app.use('/api', notFound)
app.use(express.static(frontendDist, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }))
app.get('*', (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
    if (error) next(error)
  })
})
app.use(notFound)
app.use(errorHandler)

export default app