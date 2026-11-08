import { promisify } from 'node:util'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto'

const scrypt = promisify(scryptCallback)
const TOKEN_ISSUER = 'portfolio-proof'
const SESSION_COOKIE = 'pp_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    const error = new Error('Authentication is unavailable. Configure SESSION_SECRET with at least 32 characters.')
    error.statusCode = 503
    throw error
  }
  return secret
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password, passwordHash) {
  const [algorithm, saltHex, keyHex] = (passwordHash || '').split('$')
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{128}$/i.test(keyHex || '')) {
    return false
  }
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(expected, actual)
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') }
}

export function hashPasswordResetToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function createSessionToken(userId, secret = getSessionSecret(), now = Date.now(), sessionVersion = 0) {
  const payload = Buffer.from(JSON.stringify({
    sub: String(userId),
    iss: TOKEN_ISSUER,
    exp: Math.floor(now / 1000) + SESSION_SECONDS,
    sv: sessionVersion,
  })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function readSessionToken(token, secret = getSessionSecret(), now = Date.now()) {
  if (typeof token !== 'string') return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null

  const expected = Buffer.from(sign(payload, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (claims.iss !== TOKEN_ISSUER || typeof claims.sub !== 'string' || claims.exp <= Math.floor(now / 1000)) return null
    if (!Number.isInteger(claims.sv) || claims.sv < 0) return null
    return claims
  } catch {
    return null
  }
}

export function sessionCookie(token, isProduction = process.env.NODE_ENV === 'production') {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=${SESSION_SECONDS}${isProduction ? '; Secure' : ''}`
}

export function clearedSessionCookie(isProduction = process.env.NODE_ENV === 'production') {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`
}

export function readSessionCookie(cookieHeader = '') {
  return readCookie(cookieHeader, SESSION_COOKIE)
}

export function readCookie(cookieHeader = '', name) {
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue
    return cookie.slice(separator + 1).trim()
  }
  return null
}

export function createOAuthState(returnTo, secret = getSessionSecret(), now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    nonce: randomBytes(32).toString('base64url'),
    returnTo,
    exp: Math.floor(now / 1000) + 10 * 60,
  })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function readOAuthState(state, secret = getSessionSecret(), now = Date.now()) {
  if (typeof state !== 'string') return null
  const [payload, signature, extra] = state.split('.')
  if (!payload || !signature || extra) return null
  const expected = Buffer.from(sign(payload, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof claims.nonce !== 'string' || typeof claims.returnTo !== 'string' || claims.exp <= Math.floor(now / 1000)) return null
    return claims
  } catch {
    return null
  }
}

export function oauthStateCookie(state, isProduction = process.env.NODE_ENV === 'production') {
  return `pp_oauth_state=${state}; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=600${isProduction ? '; Secure' : ''}`
}

export function clearedOAuthStateCookie(isProduction = process.env.NODE_ENV === 'production') {
  return `pp_oauth_state=; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`
}
