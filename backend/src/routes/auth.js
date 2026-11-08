import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { body } from 'express-validator'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import User from '../models/User.js'
import {
  clearedOAuthStateCookie,
  clearedSessionCookie,
  createSessionToken,
  createOAuthState,
  createPasswordResetToken,
  getSessionSecret,
  hashPassword,
  hashPasswordResetToken,
  oauthStateCookie,
  readCookie,
  readSessionCookie,
  readOAuthState,
  readSessionToken,
  sessionCookie,
  verifyPassword,
} from '../authSecurity.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { createRequireAuth } from '../middleware/requireAuth.js'
import { validateRequest } from '../middleware/validate.js'

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  // Rate-limit each client IP + account identifier, so people sharing a
  // college/home network do not block one another from signing in.
  keyGenerator: (req) => {
    const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || 'unknown')
      .trim()
      .toLowerCase()
    return `${ipKeyGenerator(req.ip)}:${identifier}`
  },
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please wait and try again.' },
})
const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please wait and try again.' },
})
const passwordResetConfirmRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Please wait and request a new link.' },
})
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

function getAllowedClientOrigins(req) {
  const configured = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const origins = new Set(configured)
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173')
    origins.add('http://127.0.0.1:5173')
  }
  const backendOrigin = process.env.AUTH_BASE_URL || `${req.protocol}://${req.get('host')}`
  origins.add(new URL(backendOrigin).origin)
  return origins
}

function resolveReturnTo(value, req) {
  const allowedOrigins = getAllowedClientOrigins(req)
  const fallbackOrigin = process.env.CLIENT_ORIGIN?.split(',')[0]?.trim()
    || (process.env.NODE_ENV === 'production' ? process.env.AUTH_BASE_URL : 'http://localhost:5173')
    || `${req.protocol}://${req.get('host')}`
  let destination
  try {
    destination = new URL(value || '/', value ? undefined : fallbackOrigin)
  } catch {
    throw Object.assign(new Error('The requested sign-in return address is invalid.'), { statusCode: 400 })
  }
  if (destination.username || destination.password || !allowedOrigins.has(destination.origin)) {
    throw Object.assign(new Error('The requested sign-in return address is not allowed.'), { statusCode: 400 })
  }
  return destination.toString()
}

function setSession(res, user, secret) {
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(user._id, secret, Date.now(), user.sessionVersion || 0)))
}

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, username: user.username || '' }
}

function redirectWithAuthError(res, returnTo, code) {
  const destination = new URL(returnTo)
  destination.searchParams.set('auth_error', code)
  res.setHeader('Set-Cookie', clearedOAuthStateCookie())
  return res.redirect(destination.toString())
}

function callbackUrl(provider, req) {
  const baseUrl = process.env.AUTH_BASE_URL || `${req.protocol}://${req.get('host')}`
  return new URL(`/api/auth/${provider}/callback`, baseUrl).toString()
}

function passwordResetUrl(token, req) {
  const baseUrl = process.env.PASSWORD_RESET_URL
    || (process.env.NODE_ENV === 'production'
      ? process.env.AUTH_BASE_URL
      : process.env.CLIENT_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173')
  if (!baseUrl) throw new Error('Password reset URL is not configured.')
  const url = new URL('/reset-password', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

async function sendPasswordResetEmail(fetchImpl, email, url) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_FROM,
      to: [email],
      subject: 'Reset your PortfolioProof password',
      text: `Use this one-time link within 30 minutes to reset your PortfolioProof password: ${url}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this one-time link within 30 minutes to reset your PortfolioProof password:</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Password reset email could not be sent.')
}

async function exchangeProviderIdentity(provider, code, req) {
  const isGoogle = provider === 'google'
  const clientId = process.env[isGoogle ? 'GOOGLE_CLIENT_ID' : 'GITHUB_CLIENT_ID']
  const clientSecret = process.env[isGoogle ? 'GOOGLE_CLIENT_SECRET' : 'GITHUB_CLIENT_SECRET']
  const callback = callbackUrl(provider, req)
  const tokenUrl = isGoogle ? 'https://oauth2.googleapis.com/token' : 'https://github.com/login/oauth/access_token'
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callback,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!tokenResponse.ok) throw new Error('The identity provider could not complete sign-in.')
  const token = await tokenResponse.json()
  if (!token.access_token) throw new Error('The identity provider returned no access token.')

  if (isGoogle) {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('Google could not verify the signed-in account.')
    const profile = await response.json()
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new Error('Google must provide a verified email address.')
    }
    return { id: String(profile.sub), email: profile.email.toLowerCase(), name: profile.name || profile.email }
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.access_token}`,
    'User-Agent': 'PortfolioProof',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const [userResponse, emailsResponse] = await Promise.all([
    fetch('https://api.github.com/user', { headers, signal: AbortSignal.timeout(15000) }),
    fetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(15000) }),
  ])
  if (!userResponse.ok || !emailsResponse.ok) throw new Error('GitHub could not verify the signed-in account.')
  const [profile, emails] = await Promise.all([userResponse.json(), emailsResponse.json()])
  const primaryEmail = emails.find((email) => email.primary && email.verified)?.email
  if (!profile.id || !primaryEmail) throw new Error('GitHub must provide a verified primary email address.')
  return { id: String(profile.id), email: primaryEmail.toLowerCase(), name: profile.name || profile.login }
}

async function findOrLinkProviderUser({ UserModel, provider, identity }) {
  const providerField = provider === 'google' ? 'googleId' : 'githubId'
  const linkedUser = await UserModel.findOne({ [providerField]: identity.id })
  if (linkedUser) return linkedUser

  const matchingEmailUser = await UserModel.findOne({ email: identity.email })
  if (matchingEmailUser) {
    if (matchingEmailUser[providerField] && matchingEmailUser[providerField] !== identity.id) {
      throw Object.assign(new Error('This provider account is not linked to the portfolio owner.'), { statusCode: 409 })
    }
    matchingEmailUser[providerField] = identity.id
    await matchingEmailUser.save()
    return matchingEmailUser
  }

  const user = new UserModel({
    name: identity.name,
    email: identity.email,
    username: `${provider}-${randomUUID().replaceAll('-', '').slice(0, 20)}`,
    [providerField]: identity.id,
    workspaceKey: randomUUID(),
  })
  await user.save()
  return user
}

export function createAuthRouter({ UserModel = User, fetchImpl = fetch } = {}) {
  const router = Router()
  const requireAuth = createRequireAuth({ UserModel })

  router.post('/register', authRateLimit, [
    body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 80 }),
    body('username').trim().matches(/^[a-zA-Z0-9._-]{3,32}$/).withMessage('Username must be 3–32 letters, numbers, dots, underscores, or hyphens.').customSanitizer((value) => value.toLowerCase()),
    body('email').trim().isEmail().withMessage('Enter a valid email address.').isLength({ max: 254 }).normalizeEmail(),
    body('password').isString().isLength({ min: 10, max: 128 }).withMessage('Password must be 10–128 characters.'),
  ], validateRequest, asyncHandler(async (req, res) => {
    const secret = getSessionSecret()
    if (await UserModel.exists({ $or: [{ email: req.body.email }, { username: req.body.username }] })) {
      return res.status(409).json({ message: 'That email or username is already registered.' })
    }
    const user = new UserModel({
      name: req.body.name,
      username: req.body.username,
      email: req.body.email,
      workspaceKey: randomUUID(),
      passwordHash: await hashPassword(req.body.password),
    })
    try {
      await user.save()
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'That email or username is already registered.' })
      throw error
    }
    setSession(res, user, secret)
    res.status(201).json({ user: publicUser(user) })
  }))

  router.post('/login', authRateLimit, [
    body('identifier').trim().notEmpty().withMessage('Enter your email or username.').isLength({ max: 254 }),
    body('password').isString().notEmpty().isLength({ max: 128 }).withMessage('Password is required.'),
  ], validateRequest, asyncHandler(async (req, res) => {
    const secret = getSessionSecret()
    const identifier = req.body.identifier.trim().toLowerCase()
    const lookup = identifier.includes('@') ? { email: identifier } : { username: identifier }
    const user = await UserModel.findOne(lookup).select('+passwordHash name email username sessionVersion')
    if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email/username or password is incorrect.' })
    }
    setSession(res, user, secret)
    res.json({ user: publicUser(user) })
  }))

  router.post('/password/change', requireAuth, [
    body('currentPassword').isString().notEmpty().withMessage('Enter your current password.'),
    body('newPassword').isString().isLength({ min: 10, max: 128 }).withMessage('New password must be 10–128 characters.'),
    body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match.'),
  ], validateRequest, asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user._id).select('+passwordHash name email username sessionVersion')
    if (!user?.passwordHash || !(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
      return res.status(401).json({ message: 'Current password is incorrect.' })
    }
    user.passwordHash = await hashPassword(req.body.newPassword)
    user.sessionVersion = (user.sessionVersion || 0) + 1
    await user.save()
    setSession(res, user, getSessionSecret())
    res.json({ message: 'Password changed successfully.' })
  }))

  router.post('/password-reset/request', passwordResetRateLimit, [
    body('email').trim().isEmail().withMessage('Enter a valid email address.').isLength({ max: 254 }).normalizeEmail(),
  ], validateRequest, asyncHandler(async (req, res) => {
    if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM) {
      return res.status(503).json({
        message: 'Password recovery is not configured. Set RESEND_API_KEY and PASSWORD_RESET_FROM on the backend.',
      })
    }

    const email = req.body.email.toLowerCase()
    const user = await UserModel.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt')
    if (!user) {
      return res.status(202).json({ message: 'If an account exists for that email, password recovery instructions have been sent.' })
    }

    const { token, tokenHash } = createPasswordResetToken()
    user.passwordResetTokenHash = tokenHash
    user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
    await user.save()

    try {
      await sendPasswordResetEmail(fetchImpl, email, passwordResetUrl(token, req))
    } catch {
      user.passwordResetTokenHash = null
      user.passwordResetExpiresAt = null
      await user.save()
      return res.status(503).json({ message: 'We could not send a password recovery email. Please try again later.' })
    }
    res.status(202).json({ message: 'If an account exists for that email, password recovery instructions have been sent.' })
  }))

  router.post('/password-reset/confirm', passwordResetConfirmRateLimit, [
    body('token').isString().matches(/^[a-f0-9]{64}$/i).withMessage('This password-reset link is invalid or expired. Request a new link.'),
    body('password').isString().isLength({ min: 10, max: 128 }).withMessage('Password must be 10–128 characters.'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match.'),
  ], validateRequest, asyncHandler(async (req, res) => {
    const passwordHash = await hashPassword(req.body.password)
    const user = await UserModel.findOneAndUpdate({
      passwordResetTokenHash: hashPasswordResetToken(req.body.token),
      passwordResetExpiresAt: { $gt: new Date() },
    }, {
      $set: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
      $inc: { sessionVersion: 1 },
    }, { new: true, runValidators: true })
    if (!user) {
      return res.status(400).json({ message: 'This password-reset link is invalid, expired, or already used. Request a new link.' })
    }
    res.json({ message: 'Your password has been reset. You can now log in.' })
  }))

  for (const provider of ['google', 'github']) {
    router.get(`/${provider}`, asyncHandler(async (req, res) => {
      const returnTo = resolveReturnTo(req.query.returnTo, req)
      const clientId = process.env[provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'GITHUB_CLIENT_ID']
      const clientSecret = process.env[provider === 'google' ? 'GOOGLE_CLIENT_SECRET' : 'GITHUB_CLIENT_SECRET']
      if (!clientId || !clientSecret) {
        return redirectWithAuthError(res, returnTo, `${provider}_not_configured`)
      }

      const state = createOAuthState(returnTo)
      const authorizationUrl = new URL(provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://github.com/login/oauth/authorize')
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl(provider, req),
        response_type: 'code',
        scope: provider === 'google' ? 'openid email profile' : 'read:user user:email',
        ...(provider === 'google' ? { prompt: 'select_account' } : {}),
        state,
      }).toString()
      res.setHeader('Set-Cookie', oauthStateCookie(state))
      res.redirect(authorizationUrl.toString())
    }))

    router.get(`/${provider}/callback`, asyncHandler(async (req, res) => {
      const stateCookie = readCookie(req.headers.cookie, 'pp_oauth_state')
      const queryState = typeof req.query.state === 'string' ? req.query.state : ''
      const expectedState = Buffer.from(stateCookie || '')
      const actualState = Buffer.from(queryState)
      const stateMatches = expectedState.length > 0
        && expectedState.length === actualState.length
        && timingSafeEqual(expectedState, actualState)
      const state = stateMatches ? readOAuthState(queryState) : null
      if (!state) {
        const fallback = resolveReturnTo(req.query.returnTo, req)
        return redirectWithAuthError(res, fallback, 'oauth_state_invalid')
      }
      if (req.query.error || typeof req.query.code !== 'string') {
        return redirectWithAuthError(res, state.returnTo, 'oauth_cancelled')
      }

      try {
        const identity = await exchangeProviderIdentity(provider, req.query.code, req)
        const user = await findOrLinkProviderUser({ UserModel, provider, identity })
        const secret = getSessionSecret()
        res.setHeader('Set-Cookie', [
          sessionCookie(createSessionToken(user._id, secret, Date.now(), user.sessionVersion || 0)),
          clearedOAuthStateCookie(),
        ])
        return res.redirect(state.returnTo)
      } catch (error) {
        const code = error.statusCode === 409 ? 'oauth_account_mismatch' : 'oauth_failed'
        return redirectWithAuthError(res, state.returnTo, code)
      }
    }))
  }

  router.post('/logout', asyncHandler(async (req, res) => {
    try {
      const claims = readSessionToken(readSessionCookie(req.headers.cookie), getSessionSecret())
      if (claims) {
        const user = await UserModel.findById(claims.sub).select('sessionVersion')
        if (user && (user.sessionVersion || 0) === claims.sv) {
          user.sessionVersion = (user.sessionVersion || 0) + 1
          await user.save()
        }
      }
    } catch (error) {
      if (error.statusCode !== 503) throw error
    }
    res.setHeader('Set-Cookie', clearedSessionCookie())
    res.json({ message: 'You have been logged out.' })
  }))

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) })
  })

  return router
}

export default createAuthRouter()
