import { Router } from 'express'
import User from '../models/User.js'
import Skill from '../models/Skill.js'
import Project from '../models/Project.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

export function createPortfolioRouter({
  UserModel = User,
  SkillModel = Skill,
  ProjectModel = Project,
} = {}) {
const router = Router()

async function getPortfolio(res, user) {
  if (!user) return res.status(404).json({ message: 'Portfolio not found.' })

  const [skills, projects] = await Promise.all([
    SkillModel.find({ ownerId: user._id }).sort({ highlighted: -1, updatedAt: -1 }).lean(),
    ProjectModel.find({ ownerId: user._id }).populate({
      path: 'skills',
      select: 'name category level',
      match: { ownerId: user._id },
    }).sort({ updatedAt: -1 }).lean(),
  ])
  return res.json({
    owner: { name: user.name, username: user.username || '' },
    skills,
    projects,
  })
}

router.get('/', asyncHandler(async (_req, res) => {
  const owner = await UserModel.findOne({ workspaceKey: 'portfolio-owner' }).select('_id name username')
  return getPortfolio(res, owner)
}))

router.get('/:username', asyncHandler(async (req, res) => {
  const username = req.params.username.toLowerCase()
  const owner = await UserModel.findOne({ username }).select('_id name username')
  return getPortfolio(res, owner)
}))

return router
}

export default createPortfolioRouter()
