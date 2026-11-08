import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { envFilePath } from '../src/env.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '../..')

test('backend dotenv path resolves to the project root regardless of working directory', () => {
  assert.equal(envFilePath, path.join(projectRoot, '.env'))
})

test('backend loads MONGODB_URI from root dotenv when started outside the project', (context) => {
  if (!existsSync(envFilePath)) {
    context.skip('Root .env is not present in this checkout.')
    return
  }

  const moduleUrl = new URL('../src/env.js', import.meta.url).href
  const childEnv = { ...process.env }
  delete childEnv.MONGODB_URI
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "await import(process.argv[1]); process.stdout.write(process.env.MONGODB_URI ? 'loaded' : 'missing')",
    moduleUrl,
  ], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    env: childEnv,
  })

  assert.equal(result.status, 0, 'dotenv loader subprocess should exit successfully')
  assert.equal(result.stdout, 'loaded')
})
