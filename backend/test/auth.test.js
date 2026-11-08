import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import express from 'express'
import { createAuthRouter } from '../src/routes/auth.js'
import { createOAuthState, readOAuthState } from '../src/authSecurity.js'

const SESSION_SECRET = 'test-session-secret-with-more-than-32-characters'
const users = []
const sentEmails = []
let server
let baseUrl
let savedSecret
let emailDeliveryEnabled = true
let nextUserId = 1

function matches(user, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$gt' in value) return user[key] > value.$gt
    return user[key] === value
  })
}

class FakeUser {
  constructor(values) {
    Object.assign(this, values)
    this._id = (nextUserId++).toString(16).padStart(24, '0')
    this.sessionVersion = 0
  }

  async save() {
    if (!users.includes(this)) users.push(this)
    return this
  }

  static exists(filter) {
    return Promise.resolve(users.some((user) => {
      if (filter.workspaceKey) return user.workspaceKey === filter.workspaceKey
      return filter.$or?.some((condition) => Object.entries(condition).every(([key, value]) => user[key] === value)) || false
    }))
  }

  static findOne(filter) {
    return {
      select: (projection = '') => {
        const user = users.find((item) => filter.$or
          ? filter.$or.some((condition) => matches(item, condition))
          : matches(item, filter))
        if (!user) return Promise.resolve(null)
        const fields = projection.split(/\s+/).filter(Boolean).map((field) => field.replace(/^\+/, ''))
        const selected = Object.assign(Object.create(Object.getPrototypeOf(user)), Object.fromEntries(['_id', ...fields].map((field) => [field, user[field]])))
        selected.save = async () => Object.assign(user, selected)
        return Promise.resolve(selected)
      },
    }
  }

  static findOneAndUpdate(filter, update) {
    const user = users.find((item) => matches(item, filter))
    if (!user) return Promise.resolve(null)
    Object.assign(user, update.$set)
    for (const [key, increment] of Object.entries(update.$inc || {})) user[key] = (user[key] || 0) + increment
    return Promise.resolve(user)
  }

  static findById(id) {
    const user = users.find((item) => String(item._id) === String(id)) || null
    return { select: () => Promise.resolve(user) }
  }
}

before(async () => {
  savedSecret = process.env.SESSION_SECRET
  process.env.SESSION_SECRET = SESSION_SECRET
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter({
    UserModel: FakeUser,
    fetchImpl: async (url, options) => {
      sentEmails.push({ url, options: JSON.parse(options.body) })
      return { ok: emailDeliveryEnabled }
    },
  }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`
})

after(async () => {
  if (savedSecret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = savedSecret
  users.splice(0)
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('registration hashes the password and creates an authenticated session', async () => {
  const response = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Portfolio Owner', username: 'portfolio-owner', email: 'owner@example.com', password: 'a-secure-test-password' }),
  })

  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.user.email, 'owner@example.com')
  assert.equal(result.user.username, 'portfolio-owner')
  assert.equal(users.length, 1)
  assert.match(users[0].passwordHash, /^scrypt\$/)
  assert.notEqual(users[0].passwordHash, 'a-secure-test-password')
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  const me = await fetch(`${baseUrl}/me`, { headers: { Cookie: cookie.split(';')[0] } })
  assert.equal(me.status, 200)
  assert.equal((await me.json()).user.username, 'portfolio-owner')
})

test('registration allows additional users but rejects duplicate usernames and invalid passwords', async () => {
  const invalid = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Other Owner', username: 'other-owner', email: 'other@example.com', password: 'short' }),
  })
  const secondAccount = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Other Owner', username: 'other-owner', email: 'other@example.com', password: 'a-secure-test-password' }),
  })
  const duplicateEmail = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Duplicate Email', username: 'third-owner', email: 'other@example.com', password: 'a-secure-test-password' }),
  })
  const duplicateUsername = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Duplicate Username', username: 'other-owner', email: 'third@example.com', password: 'a-secure-test-password' }),
  })

  assert.equal(invalid.status, 400)
  assert.equal(secondAccount.status, 201)
  assert.equal(duplicateEmail.status, 409)
  assert.equal(duplicateUsername.status, 409)
})

test('login rejects an incorrect password and logout revokes the existing session', async () => {
  const invalidLogin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'portfolio-owner', password: 'wrong-password' }),
  })
  assert.equal(invalidLogin.status, 401)

  const usernameLogin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'PORTFOLIO-OWNER', password: 'a-secure-test-password' }),
  })
  assert.equal(usernameLogin.status, 200)
  assert.equal((await usernameLogin.json()).user.username, 'portfolio-owner')

  const login = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'owner@example.com', password: 'a-secure-test-password' }),
  })
  assert.equal(login.status, 200)
  const sessionCookie = login.headers.get('set-cookie').split(';')[0]
  const logout = await fetch(`${baseUrl}/logout`, { method: 'POST', headers: { Cookie: sessionCookie } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  const afterLogout = await fetch(`${baseUrl}/me`, { headers: { Cookie: sessionCookie } })
  assert.equal(afterLogout.status, 401)

  const relogin = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'owner@example.com', password: 'a-secure-test-password' }),
  })
  assert.equal(relogin.status, 200)
  const renewedSessionCookie = relogin.headers.get('set-cookie').split(';')[0]
  const renewedSession = await fetch(`${baseUrl}/me`, { headers: { Cookie: renewedSessionCookie } })
  assert.equal(renewedSession.status, 200)
})

test('logout clears stale cookies without revealing session details', async () => {
  const response = await fetch(`${baseUrl}/logout`, { method: 'POST', headers: { Cookie: 'pp_session=invalid' } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/)
  assert.deepEqual(await response.json(), { message: 'You have been logged out.' })
})

test('OAuth state is signed, expires, and carries only an allowlisted return target', () => {
  const state = createOAuthState('http://localhost:5173/skills', SESSION_SECRET, 1_000_000)
  assert.deepEqual(readOAuthState(state, SESSION_SECRET, 1_001_000), {
    nonce: readOAuthState(state, SESSION_SECRET, 1_001_000).nonce,
    returnTo: 'http://localhost:5173/skills',
    exp: 1600,
  })
  assert.equal(readOAuthState(state, 'different-session-secret-that-is-long-enough', 1_001_000), null)
  assert.equal(readOAuthState(state, SESSION_SECRET, 1_601_000), null)
})

test('unconfigured Google OAuth reports configuration status without contacting Google', async () => {
  const savedClientId = process.env.GOOGLE_CLIENT_ID
  const savedClientSecret = process.env.GOOGLE_CLIENT_SECRET
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_SECRET
  try {
    const response = await fetch(`${baseUrl}/google?returnTo=${encodeURIComponent('http://localhost:5173/skills')}`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    assert.match(response.headers.get('location'), /^http:\/\/localhost:5173\/skills\?auth_error=google_not_configured$/)
  } finally {
    if (savedClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = savedClientId
    if (savedClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET
    else process.env.GOOGLE_CLIENT_SECRET = savedClientSecret
  }
})

test('password reset is generic, expiring, single-use, and replaces the password', async () => {
  const savedApiKey = process.env.RESEND_API_KEY
  const savedFrom = process.env.PASSWORD_RESET_FROM
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.PASSWORD_RESET_FROM = 'PortfolioProof <noreply@example.com>'
  const emailCount = sentEmails.length
  try {
    const activeLogin = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'owner@example.com', password: 'a-secure-test-password' }),
    })
    const activeCookie = activeLogin.headers.get('set-cookie').split(';')[0]
    const response = await fetch(`${baseUrl}/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com' }),
    })
    assert.equal(response.status, 202)
    const genericMessage = 'If an account exists for that email, password recovery instructions have been sent.'
    assert.equal((await response.json()).message, genericMessage)
    assert.equal(sentEmails.length, emailCount + 1)
    const resetUrl = new URL(sentEmails.at(-1).options.text.match(/https?:\/\/\S+/)[0])
    const token = resetUrl.searchParams.get('token')
    assert.match(token, /^[a-f0-9]{64}$/)
    assert.equal(users[0].passwordResetTokenHash.length, 64)
    assert.notEqual(users[0].passwordResetTokenHash, token)

    const unknownEmail = await fetch(`${baseUrl}/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com' }),
    })
    assert.equal(unknownEmail.status, 202)
    assert.equal((await unknownEmail.json()).message, genericMessage)

    const mismatch = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'a-new-secure-password', confirmPassword: 'a-different-password' }),
    })
    assert.equal(mismatch.status, 400)

    const reset = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'a-new-secure-password', confirmPassword: 'a-new-secure-password' }),
    })
    assert.equal(reset.status, 200)
    assert.equal(users[0].passwordResetTokenHash, null)
    assert.equal((await fetch(`${baseUrl}/me`, { headers: { Cookie: activeCookie } })).status, 401)

    const reused = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'another-new-password', confirmPassword: 'another-new-password' }),
    })
    assert.equal(reused.status, 400)
    assert.match((await reused.json()).message, /invalid, expired, or already used/)

    const login = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'owner@example.com', password: 'a-new-secure-password' }),
    })
    assert.equal(login.status, 200)
    const usernameLogin = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'PORTFOLIO-OWNER', password: 'a-new-secure-password' }),
    })
    assert.equal(usernameLogin.status, 200)

    const nextRequest = await fetch(`${baseUrl}/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com' }),
    })
    assert.equal(nextRequest.status, 202)
    const nextToken = new URL(sentEmails.at(-1).options.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')
    users[0].passwordResetExpiresAt = new Date(Date.now() - 1)
    const expired = await fetch(`${baseUrl}/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: nextToken, password: 'another-new-password', confirmPassword: 'another-new-password' }),
    })
    assert.equal(expired.status, 400)
    assert.match((await expired.json()).message, /invalid, expired, or already used/)
  } finally {
    if (savedApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedApiKey
    if (savedFrom === undefined) delete process.env.PASSWORD_RESET_FROM
    else process.env.PASSWORD_RESET_FROM = savedFrom
  }
})

test('password reset reports required email configuration without account-specific details', async () => {
  const savedApiKey = process.env.RESEND_API_KEY
  const savedFrom = process.env.PASSWORD_RESET_FROM
  delete process.env.RESEND_API_KEY
  delete process.env.PASSWORD_RESET_FROM
  try {
    const response = await fetch(`${baseUrl}/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com' }),
    })
    assert.equal(response.status, 503)
    assert.match((await response.json()).message, /RESEND_API_KEY and PASSWORD_RESET_FROM/)
  } finally {
    if (savedApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedApiKey
    if (savedFrom === undefined) delete process.env.PASSWORD_RESET_FROM
    else process.env.PASSWORD_RESET_FROM = savedFrom
  }
})

test('Google OAuth requests account selection and GitHub redirects to official authorization', async () => {
  const previous = {
    googleId: process.env.GOOGLE_CLIENT_ID,
    googleSecret: process.env.GOOGLE_CLIENT_SECRET,
    githubId: process.env.GITHUB_CLIENT_ID,
    githubSecret: process.env.GITHUB_CLIENT_SECRET,
  }
  process.env.GOOGLE_CLIENT_ID = 'google-client'
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret'
  process.env.GITHUB_CLIENT_ID = 'github-client'
  process.env.GITHUB_CLIENT_SECRET = 'github-secret'
  try {
    const google = await fetch(`${baseUrl}/google?returnTo=${encodeURIComponent('http://localhost:5173/')}`, { redirect: 'manual' })
    const googleUrl = new URL(google.headers.get('location'))
    assert.equal(googleUrl.origin, 'https://accounts.google.com')
    assert.equal(googleUrl.searchParams.get('prompt'), 'select_account')
    const github = await fetch(`${baseUrl}/github?returnTo=${encodeURIComponent('http://localhost:5173/')}`, { redirect: 'manual' })
    assert.equal(new URL(github.headers.get('location')).origin, 'https://github.com')
  } finally {
    for (const [key, value] of Object.entries({
      GOOGLE_CLIENT_ID: previous.googleId,
      GOOGLE_CLIENT_SECRET: previous.googleSecret,
      GITHUB_CLIENT_ID: previous.githubId,
      GITHUB_CLIENT_SECRET: previous.githubSecret,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
