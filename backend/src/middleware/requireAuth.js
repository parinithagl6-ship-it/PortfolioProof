import User from '../models/User.js'
import { asyncHandler } from './asyncHandler.js'
import { getSessionSecret, readSessionCookie, readSessionToken } from '../authSecurity.js'

export function createRequireAuth({ UserModel = User } = {}) {
  return asyncHandler(async (req, res, next) => {
    let claims
    try {
      const secret = getSessionSecret()
      const bearerToken = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      const token = bearerToken || readSessionCookie(req.headers.cookie)
      claims = readSessionToken(token, secret)
    } catch (error) {
      return res.status(error.statusCode || 503).json({ message: error.message })
    }

    if (!claims) return res.status(401).json({ message: 'Please log in to continue.' })
    const user = await UserModel.findById(claims.sub).select('name email username sessionVersion')
    if (!user) return res.status(401).json({ message: 'Your session is no longer valid. Please log in again.' })
    if ((user.sessionVersion || 0) !== claims.sv) {
      return res.status(401).json({ message: 'Your session has ended. Please log in again.' })
    }
    req.user = user
    next()
  })
}

export const requireAuth = createRequireAuth()
