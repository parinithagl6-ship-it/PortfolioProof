import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import express from 'express'
import { createSkillRouter } from '../src/routes/skills.js'

const skillId = '0123456789abcdef01234567'
const ownerId = 'fedcba987654321001234567'
let server
let baseUrl
let deletedId
let unlinkOperation
let skillExists = true

const SkillModel = {
  async findOneAndDelete(filter) {
    deletedId = filter
    return skillExists ? { _id: skillId } : null
  },
}

const ProjectModel = {
  async updateMany(filter, update) {
    unlinkOperation = { filter, update }
  },
}

before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/skills', createSkillRouter({
    SkillModel,
    ProjectModel,
    requireAuthMiddleware: (req, res, next) => {
      req.user = { _id: ownerId }
      next()
    },
  }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api/skills`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('delete removes only the requested skill and unlinks it from related projects', async () => {
  const response = await fetch(`${baseUrl}/${skillId}`, { method: 'DELETE' })

  assert.equal(response.status, 204)
  assert.deepEqual(deletedId, { _id: skillId, ownerId })
  assert.deepEqual(unlinkOperation, {
    filter: { ownerId, skills: skillId },
    update: { $pull: { skills: skillId } },
  })
})

test('delete returns not found and leaves project relationships untouched for a missing ID', async () => {
  skillExists = false
  unlinkOperation = undefined
  const response = await fetch(`${baseUrl}/${skillId}`, { method: 'DELETE' })

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { message: 'Skill not found.' })
  assert.deepEqual(deletedId, { _id: skillId, ownerId })
  assert.equal(unlinkOperation, undefined)
})
