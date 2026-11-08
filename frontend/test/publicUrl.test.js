import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPublicPortfolioUrl } from '../src/publicUrl.js'

test('public portfolio links reject local hostnames and private IP addresses', () => {
  for (const url of [
    'http://localhost:5173',
    'http://dev.localhost',
    'http://127.0.0.1:5000',
    'http://172.16.0.2',
    'http://172.31.255.255',
    'http://192.168.1.1',
    'http://[::1]:8080',
    'http://[::ffff:127.0.0.1]',
    'http://mongo.internal',
  ]) {
    assert.equal(isPublicPortfolioUrl(url), false, `${url} should not be exposed`)
  }
})

test('public portfolio links allow external HTTP and HTTPS URLs', () => {
  assert.equal(isPublicPortfolioUrl('https://smartspend-ai-1-178b.onrender.com'), true)
  assert.equal(isPublicPortfolioUrl('https://github.com/parinithagl6-ship-it/SmartSpend-AI'), true)
})
