const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export function createCorsOptions({ nodeEnv = process.env.NODE_ENV, clientOrigin = process.env.CLIENT_ORIGIN } = {}) {
  const configuredOrigins = (clientOrigin || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const allowedOrigins = new Set([
    ...configuredOrigins,
    ...(nodeEnv === 'production' ? [] : LOCAL_DEVELOPMENT_ORIGINS),
  ])

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true)
      const error = new Error('This origin is not allowed by the CORS policy.')
      error.statusCode = 403
      callback(error)
    },
  }
}
