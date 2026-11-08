import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGeminiClient, DEFAULT_MODEL } from '../src/gemini.js'

test('Gemini client returns actual generated content using the server-side API key', async () => {
  let requestUrl
  let requestOptions
  const client = createGeminiClient({
    apiKey: 'test-secret-key',
    fetchImpl: async (url, options) => {
      requestUrl = url
      requestOptions = options
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'A generated answer.' }] } }] }),
      }
    },
  })

  const answer = await client.reply([{ role: 'user', text: 'How do I show a project?' }], 'Skills: React')
  assert.equal(answer, 'A generated answer.')
  assert.match(requestUrl, new RegExp(`/models/${DEFAULT_MODEL}:generateContent$`))
  assert.equal(requestOptions.headers['x-goog-api-key'], 'test-secret-key')
  assert.match(requestOptions.body, /Skills: React/)
})

test('Gemini client fails clearly when the API key is missing', async () => {
  const client = createGeminiClient({ apiKey: '' })
  await assert.rejects(client.reply([{ role: 'user', text: 'Hello' }]), {
    statusCode: 503,
    message: /GEMINI_API_KEY/,
  })
})

test('Gemini client rejects unsuccessful or empty upstream responses', async () => {
  const limited = createGeminiClient({
    apiKey: 'test-secret-key',
    fetchImpl: async () => ({ ok: false, status: 429 }),
  })
  await assert.rejects(limited.reply([{ role: 'user', text: 'Hello' }]), { statusCode: 429 })

  const empty = createGeminiClient({
    apiKey: 'test-secret-key',
    fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [] }) }),
  })
  await assert.rejects(empty.reply([{ role: 'user', text: 'Hello' }]), { statusCode: 502 })
})
