import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import app from '../src/app.js'
import { createCorsOptions } from '../src/corsOptions.js'
import { isPublicHttpUrl } from '../src/publicUrl.js'

let server
let baseUrl
let savedSessionSecret

before(async () => {
  savedSessionSecret = process.env.SESSION_SECRET
  process.env.SESSION_SECRET = 'api-tests-session-secret-at-least-32-characters'
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (savedSessionSecret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = savedSessionSecret
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('health endpoint reports the actual database state', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  const result = await response.json()

  assert.ok([200, 503].includes(response.status))
  assert.equal(result.status, response.status === 200 ? 'ok' : 'unavailable')
  assert.equal(result.database, response.status === 200 ? 'connected' : 'disconnected')
})

test('skill creation rejects incomplete input before database access', async () => {
  const response = await fetch(`${baseUrl}/api/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 400)
  assert.ok((await response.json()).errors.length > 0)
})

test('highlighted skills must have a supporting artifact', async () => {
  const response = await fetch(`${baseUrl}/api/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'React',
      category: 'Frontend',
      level: 'Advanced',
      highlighted: true,
      artifacts: [],
    }),
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /supporting artifact/)
})

test('project creation rejects malformed evidence URLs', async () => {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test project',
      description: 'A project used to test URL validation.',
      githubUrl: 'https://%',
    }),
  })

  assert.equal(response.status, 400)
  assert.ok((await response.json()).errors.some((error) => error.field === 'githubUrl'))
})

test('project creation rejects private and localhost portfolio links', async () => {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Private link check',
      description: 'A project used to test public URL validation.',
      liveUrl: 'http://172.20.10.5:4173',
    }),
  })
  assert.equal(response.status, 400)
  assert.ok((await response.json()).errors.some((error) => error.field === 'liveUrl'))
})

test('portfolio skill mutations require an authenticated owner session', async () => {
  const create = await fetch(`${baseUrl}/api/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unauthorized test', category: 'Tools', level: 'Beginner' }),
  })
  const remove = await fetch(`${baseUrl}/api/skills/0123456789abcdef01234567`, { method: 'DELETE' })

  assert.equal(create.status, 401)
  assert.equal(remove.status, 401)
  assert.match((await create.json()).message, /log in/i)
  assert.match((await remove.json()).message, /log in/i)
})

test('private workspace reads require an authenticated session', async () => {
  for (const path of ['/api/skills', '/api/projects', '/api/dashboard/stats']) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 401, `${path} must require authentication`)
  }
})

test('invalid resource identifiers and unknown API routes return 4xx responses', async () => {
  const invalidId = await fetch(`${baseUrl}/api/projects/not-a-mongo-id`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const missingRoute = await fetch(`${baseUrl}/api/not-a-route`)

  assert.equal(invalidId.status, 400)
  assert.equal(missingRoute.status, 404)
})

test('development CORS allows both local Vite origins and rejects unrelated origins', () => {
  const options = createCorsOptions({ nodeEnv: 'development', clientOrigin: '' })
  const checkOrigin = (origin) => new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed))
  })

  return Promise.all([
    checkOrigin('http://localhost:5173'),
    checkOrigin('http://127.0.0.1:5173'),
  ]).then(async (results) => {
    assert.deepEqual(results, [true, true])
    await assert.rejects(checkOrigin('http://evil.example'), { statusCode: 403 })
  })
})

test('production CORS only allows explicitly configured origins', async () => {
  const options = createCorsOptions({
    nodeEnv: 'production',
    clientOrigin: 'https://portfolio.example, https://admin.example',
  })
  const checkOrigin = (origin) => new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed))
  })

  assert.equal(await checkOrigin('https://portfolio.example'), true)
  await assert.rejects(checkOrigin('http://localhost:5173'), { statusCode: 403 })
  await assert.rejects(checkOrigin('https://unlisted.example'), { statusCode: 403 })
})

test('public portfolio URL validation rejects loopback, private IPs, and local hostnames', () => {
  for (const url of [
    'http://localhost:5173',
    'http://127.0.0.1:5000',
    'http://172.20.10.5:4173',
    'http://192.168.1.20',
    'http://[::1]:8080',
    'http://[::ffff:127.0.0.1]',
  ]) {
    assert.equal(isPublicHttpUrl(url), false, `${url} should not be public`)
  }
  assert.equal(isPublicHttpUrl('https://smartspend-ai-1-178b.onrender.com'), true)
})

test('CORS middleware allows local Vite origins on API preflight requests', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
  }
})
