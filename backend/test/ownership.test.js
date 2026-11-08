import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import express from 'express'
import { createProjectRouter } from '../src/routes/projects.js'
import { createSkillRouter } from '../src/routes/skills.js'
import { createPortfolioRouter } from '../src/routes/portfolio.js'
import { migratePortfolioOwnership } from '../src/migratePortfolioOwnership.js'

const ownerA = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const ownerB = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const skillA = { _id: '111111111111111111111111', ownerId: ownerA, name: 'Owner A skill' }
const skillB = { _id: '222222222222222222222222', ownerId: ownerB, name: 'Owner B skill' }
const projectA = { _id: '333333333333333333333333', ownerId: ownerA, title: 'Owner A project', skills: [skillA._id] }
const projectB = { _id: '444444444444444444444444', ownerId: ownerB, title: 'Owner B project', skills: [skillB._id] }
const skills = [skillA, skillB]
const projects = [projectA, projectB]
const queryValue = (value) => ({
  populate: () => ({ sort: () => ({ lean: async () => value }) }),
  sort: () => ({ lean: async () => value }),
})
let server
let baseUrl

const SkillModel = {
  find(filter) {
    return queryValue(skills.filter((skill) => skill.ownerId === filter.ownerId))
  },
  countDocuments(filter) {
    const ids = filter._id?.$in?.map(String)
    return Promise.resolve(skills.filter((skill) => skill.ownerId === filter.ownerId && ids?.includes(skill._id)).length)
  },
  async findOneAndDelete(filter) {
    return skills.find((skill) => skill._id === filter._id && skill.ownerId === filter.ownerId) || null
  },
}

const ProjectModel = {
  find(filter) {
    return queryValue(projects.filter((project) => project.ownerId === filter.ownerId))
  },
  async create(project) {
    projects.push({ _id: '555555555555555555555555', ...project })
    return projects.at(-1)
  },
  findOneAndUpdate(filter) {
    const project = projects.find((item) => item._id === filter._id && item.ownerId === filter.ownerId) || null
    return { populate: async () => project }
  },
  async findOne(filter) {
    return projects.find((project) => project._id === filter._id && project.ownerId === filter.ownerId) || null
  },
}

function testAuth(req, _res, next) {
  req.user = { _id: req.get('x-test-owner') === ownerB ? ownerB : ownerA }
  next()
}

before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/skills', createSkillRouter({ SkillModel, ProjectModel, requireAuthMiddleware: testAuth }))
  app.use('/api/projects', createProjectRouter({ ProjectModel, SkillModel, requireAuthMiddleware: testAuth }))
  app.use('/api/portfolio', createPortfolioRouter({
    UserModel: {
      findOne(filter) {
        return {
          select: async () => filter.workspaceKey
            ? { _id: ownerA, name: 'Owner A', username: 'owner-a' }
            : filter.username === 'owner-b'
              ? { _id: ownerB, name: 'Owner B', username: 'owner-b' }
              : null,
        }
      },
    },
    SkillModel,
    ProjectModel,
  }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  projects.splice(2)
})

test('skill and project lists are scoped to the authenticated owner', async () => {
  const [skillsResponse, projectsResponse] = await Promise.all([
    fetch(`${baseUrl}/skills`, { headers: { 'x-test-owner': ownerA } }),
    fetch(`${baseUrl}/projects`, { headers: { 'x-test-owner': ownerA } }),
  ])
  assert.equal(skillsResponse.status, 200)
  assert.equal(projectsResponse.status, 200)
  assert.deepEqual((await skillsResponse.json()).map(({ name }) => name), ['Owner A skill'])
  assert.deepEqual((await projectsResponse.json()).map(({ title }) => title), ['Owner A project'])
})

test('project operations reject another owner project and another owner skill reference', async () => {
  const projectId = projectB._id
  const put = await fetch(`${baseUrl}/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-test-owner': ownerA },
    body: JSON.stringify({ title: 'Changed', description: 'Should not change', skills: [] }),
  })
  const remove = await fetch(`${baseUrl}/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'x-test-owner': ownerA },
  })
  const crossOwnerSkill = await fetch(`${baseUrl}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-owner': ownerA },
    body: JSON.stringify({
      title: 'Cross-owner reference',
      description: 'Should not be created',
      skills: [skillB._id],
    }),
  })
  assert.equal(put.status, 404)
  assert.equal(remove.status, 404)
  assert.equal(crossOwnerSkill.status, 400)
  assert.equal(projectB.title, 'Owner B project')
  assert.equal(projects.length, 2)
})

test('public portfolio URL returns only the named owner portfolio', async () => {
  const response = await fetch(`${baseUrl}/portfolio/owner-b`)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.owner.username, 'owner-b')
  assert.deepEqual(body.skills.map(({ name }) => name), ['Owner B skill'])
  assert.deepEqual(body.projects.map(({ title }) => title), ['Owner B project'])
})

test('migration assigns only unowned legacy records to the original owner and replaces the global index', async () => {
  const legacyOwner = { _id: ownerA }
  const legacySkills = [{ _id: 'legacy-skill' }]
  const legacyProjects = [{ _id: 'legacy-project' }]
  const dropped = []
  const created = []
  const fakeSkillModel = {
    countDocuments: async () => legacySkills.length,
    updateMany: async (filter, update) => {
      assert.equal(filter.$or.length, 2)
      legacySkills.forEach((item) => Object.assign(item, update.$set))
    },
    collection: {
      indexes: async () => [{ name: 'name_1', unique: true }],
      dropIndex: async (name) => dropped.push(name),
      createIndex: async (keys, options) => created.push({ keys, options }),
    },
  }
  const fakeProjectModel = {
    countDocuments: async () => legacyProjects.length,
    updateMany: async (_filter, update) => legacyProjects.forEach((item) => Object.assign(item, update.$set)),
    collection: { createIndex: async (keys, options) => created.push({ keys, options }) },
  }
  const migrated = await migratePortfolioOwnership({
    UserModel: { findOne: () => ({ select: async () => legacyOwner }) },
    SkillModel: fakeSkillModel,
    ProjectModel: fakeProjectModel,
  })
  assert.deepEqual(migrated, { migratedSkills: 1, migratedProjects: 1 })
  assert.equal(legacySkills[0].ownerId, ownerA)
  assert.equal(legacyProjects[0].ownerId, ownerA)
  assert.deepEqual(dropped, ['name_1'])
  assert.equal(created.length, 2)
})
