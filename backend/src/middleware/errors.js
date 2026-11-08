export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`)
  error.statusCode = 404
  next(error)
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const status = error.statusCode || (error.name === 'ValidationError' ? 400 : 500)
  if (error.code === 11000) {
    return res.status(409).json({ message: 'A skill with this name already exists.' })
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'The supplied identifier is invalid.' })
  }

  if (status >= 500) console.error(error)
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong on the server.' : error.message,
  })
}