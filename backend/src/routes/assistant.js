import { Router } from 'express'
import { body } from 'express-validator'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validateRequest } from '../middleware/validate.js'
import Project from '../models/Project.js'
import Skill from '../models/Skill.js'
import { createGeminiClient, MAX_HISTORY_MESSAGES } from '../gemini.js'

const router = Router()
const chatRules = [
  body('messages').isArray({ min: 1, max: MAX_HISTORY_MESSAGES }).withMessage('Send up to 20 recent conversation messages.'),
  body('messages.*.role').isIn(['user', 'model']).withMessage('Conversation role is invalid.'),
  body('messages.*.text').isString().trim().notEmpty().isLength({ max: 4000 }).withMessage('Messages must be 1–4000 characters.'),
]

router.post('/chat', requireAuth, chatRules, validateRequest, asyncHandler(async (req, res) => {
  const messages = req.body.messages.map(({ role, text }) => ({ role, text: text.trim() }))
  if (messages.at(-1)?.role !== 'user') {
    return res.status(400).json({ message: 'The latest conversation message must be from you.' })
  }

  const [skills, projects] = await Promise.all([
    Skill.find({ ownerId: req.user._id }).select('name category level').limit(100).lean(),
    Project.find({ ownerId: req.user._id }).select('title description technologies').limit(50).lean(),
  ])
  const portfolioContext = [
    `Skills: ${skills.map((skill) => `${skill.name} (${skill.category}, ${skill.level})`).join(', ') || 'none'}`,
    `Projects: ${projects.map((project) => `${project.title}: ${project.description} Technologies: ${(project.technologies || []).join(', ')}`).join('\n') || 'none'}`,
  ].join('\n')

  let text
  try {
    text = await createGeminiClient().reply(messages, portfolioContext)
  } catch (error) {
    if (error.statusCode === 503 && /GEMINI_API_KEY/.test(error.message)) {
      return res.status(503).json({ message: error.message })
    }
    throw error
  }
  res.json({ text })
}))

export default router
