import { Router } from 'express'
import { body, param, query } from 'express-validator'
import mongoose from 'mongoose'
import { asyncHandler } from '../middleware/asyncHandler.js'
import Project from '../models/Project.js'
import { isPublicHttpUrl } from '../publicUrl.js'
import { requireAuth } from '../middleware/requireAuth.js'
import Skill from '../models/Skill.js'
import { validateRequest } from '../middleware/validate.js'

export function createProjectRouter({
  ProjectModel = Project,
  SkillModel = Skill,
  requireAuthMiddleware = requireAuth,
} = {}) {
const router = Router()
const projectRules = [
  body('title').trim().notEmpty().withMessage('Project title is required.').isLength({ max: 100 }),
  body('description').trim().notEmpty().withMessage('Project description is required.').isLength({ max: 1200 }),
  body('githubUrl').optional({ values: 'falsy' }).trim().custom(isPublicHttpUrl).withMessage('GitHub URL must be a public HTTP or HTTPS URL.'),
  body('liveUrl').optional({ values: 'falsy' }).trim().custom(isPublicHttpUrl).withMessage('Live demo URL must be a public HTTP or HTTPS URL.'),
  body('technologies').optional().isArray({ max: 12 }),
  body('technologies.*').optional().trim().notEmpty().isLength({ max: 32 }),
  body('skills').optional().isArray({ max: 30 }),
  body('skills.*').optional().isMongoId().withMessage('Select valid skills.'),
  body('evidence').optional().isArray({ max: 10 }),
  body('evidence.*.label').optional().trim().notEmpty().isLength({ max: 80 }),
  body('evidence.*.url').optional().trim().custom(isPublicHttpUrl).withMessage('Evidence links must be public HTTP or HTTPS URLs.'),
]

async function validateSkillReferences(ids = [], ownerId) {
  const uniqueIds = [...new Set(ids.map(String))]
  if (!uniqueIds.every(mongoose.isValidObjectId)) return false
  return (await SkillModel.countDocuments({ _id: { $in: uniqueIds }, ownerId })) === uniqueIds.length
}

router.get('/', requireAuthMiddleware, [
  query('technology').optional().isString().isLength({ max: 32 }).withMessage('Technology must be 32 characters or fewer.'),
], validateRequest, asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.technology) {
    const escapedTechnology = req.query.technology.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.technologies = { $regex: escapedTechnology, $options: 'i' }
  }
  const projects = await ProjectModel.find({ ...filter, ownerId: req.user._id }).populate({
    path: 'skills',
    select: 'name category level',
    match: { ownerId: req.user._id },
  }).sort({ updatedAt: -1 }).lean()
  res.json(projects)
}))

router.post('/', projectRules, validateRequest, requireAuthMiddleware, asyncHandler(async (req, res) => {
  const bodyData = req.body
  const skillIds = bodyData.skills || []
  if (!(await validateSkillReferences(skillIds, req.user._id))) {
    return res.status(400).json({ message: 'One or more selected skills do not exist.' })
  }
  const project = await ProjectModel.create({
    ownerId: req.user._id,
    title: bodyData.title,
    description: bodyData.description,
    githubUrl: bodyData.githubUrl || '',
    liveUrl: bodyData.liveUrl || '',
    technologies: [...new Set((bodyData.technologies || []).map((tag) => tag.trim()).filter(Boolean))],
    skills: [...new Set(skillIds)],
    evidence: bodyData.evidence || [],
  })
  res.status(201).json(await project.populate('skills', 'name category level'))
}))

router.put('/:id', [param('id').isMongoId(), ...projectRules], validateRequest, requireAuthMiddleware, asyncHandler(async (req, res) => {
  const skillIds = req.body.skills || []
  if (!(await validateSkillReferences(skillIds, req.user._id))) {
    return res.status(400).json({ message: 'One or more selected skills do not exist.' })
  }
  const project = await ProjectModel.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user._id },
    {
      title: req.body.title,
      description: req.body.description,
      githubUrl: req.body.githubUrl || '',
      liveUrl: req.body.liveUrl || '',
      technologies: [...new Set((req.body.technologies || []).map((tag) => tag.trim()).filter(Boolean))],
      skills: [...new Set(skillIds)],
      evidence: req.body.evidence || [],
    },
    { new: true, runValidators: true },
  ).populate({
    path: 'skills',
    select: 'name category level',
    match: { ownerId: req.user._id },
  })
  if (!project) return res.status(404).json({ message: 'Project not found.' })
  res.json(project)
}))

router.delete('/:id', [param('id').isMongoId()], validateRequest, requireAuthMiddleware, asyncHandler(async (req, res) => {
  const project = await ProjectModel.findOne({ _id: req.params.id, ownerId: req.user._id })
  if (!project) return res.status(404).json({ message: 'Project not found.' })
  await project.deleteOne()
  res.status(204).end()
}))

return router
}

export default createProjectRouter()