import { Router } from 'express'
import { body, param, query } from 'express-validator'
import Project from '../models/Project.js'
import Skill from '../models/Skill.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { isPublicHttpUrl } from '../publicUrl.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validateRequest } from '../middleware/validate.js'

const categories = ['Frontend', 'Backend', 'Programming', 'Database', 'AI/ML', 'Tools']
const levels = ['Beginner', 'Intermediate', 'Advanced']
const skillRules = [
  body('name').trim().notEmpty().withMessage('Skill name is required.')
    .isLength({ max: 60 }).withMessage('Skill name must be 60 characters or fewer.'),
  body('category').isIn(categories).withMessage('Choose a valid category.'),
  body('level').isIn(levels).withMessage('Choose a valid proficiency level.'),
  body('highlighted').optional().isBoolean().withMessage('Feature this skill must be true or false.'),
  body('artifacts').optional().isArray({ max: 10 }).withMessage('Add no more than 10 evidence links.'),
  body('artifacts.*.label').optional().trim().notEmpty().withMessage('Each evidence link needs a label.')
    .isLength({ max: 80 }).withMessage('Evidence labels must be 80 characters or fewer.'),
  body('artifacts.*.url').optional().trim().custom(isPublicHttpUrl).withMessage('Evidence links must be public HTTP or HTTPS URLs.'),
]
const requireSupportingArtifact = (req, res, next) => {
  const { highlighted = false, artifacts = [] } = req.body
  if (highlighted && !artifacts.length) {
    return res.status(400).json({ message: 'Highlighted skills need at least one supporting artifact.' })
  }
  next()
}

export function createSkillRouter({
  SkillModel = Skill,
  ProjectModel = Project,
  requireAuthMiddleware = requireAuth,
} = {}) {
const router = Router()

router.get('/', requireAuthMiddleware, [
  query('category').optional().isIn(categories).withMessage('Choose a valid category.'),
  query('search').optional().isString().isLength({ max: 80 }).withMessage('Search must be 80 characters or fewer.'),
], validateRequest, asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.search) {
    const escapedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.name = { $regex: escapedSearch, $options: 'i' }
  }
  const skills = await SkillModel.find({ ...filter, ownerId: req.user._id }).sort({ highlighted: -1, updatedAt: -1 }).lean()
  res.json(skills)
}))

router.post('/', skillRules, validateRequest, requireSupportingArtifact, requireAuthMiddleware, asyncHandler(async (req, res) => {
  const { name, category, level, highlighted = false, artifacts = [] } = req.body
  const skill = new SkillModel({ name, category, level, highlighted, artifacts, ownerId: req.user._id })
  await skill.save()
  res.status(201).json(skill)
}))

router.put('/:id', [param('id').isMongoId(), ...skillRules], validateRequest, requireSupportingArtifact, requireAuthMiddleware, asyncHandler(async (req, res) => {
  const skill = await SkillModel.findOne({ _id: req.params.id, ownerId: req.user._id })
  if (!skill) return res.status(404).json({ message: 'Skill not found.' })

  const { name, category, level, highlighted = false, artifacts = [] } = req.body
  Object.assign(skill, { name, category, level, highlighted, artifacts })
  await skill.save()
  res.json(skill)
}))

router.delete('/:id', [param('id').isMongoId()], validateRequest, requireAuthMiddleware, asyncHandler(async (req, res) => {
  const skill = await SkillModel.findOneAndDelete({ _id: req.params.id, ownerId: req.user._id })
  if (!skill) return res.status(404).json({ message: 'Skill not found.' })
  await ProjectModel.updateMany({ ownerId: req.user._id, skills: skill._id }, { $pull: { skills: skill._id } })
  res.status(204).end()
}))

return router
}

export default createSkillRouter()