import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'
import Project from '../models/Project.js'
import Skill from '../models/Skill.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

router.get('/stats', requireAuth, asyncHandler(async (req, res) => {
  const ownerId = req.user._id
  const [totalSkills, totalProjects, skills, projects] = await Promise.all([
    Skill.countDocuments({ ownerId }),
    Project.countDocuments({ ownerId }),
    Skill.find({ ownerId }).select('name category level highlighted artifacts updatedAt').sort({ updatedAt: -1 }).limit(5).lean(),
    Project.find({ ownerId }).select('title technologies evidence githubUrl liveUrl updatedAt').sort({ updatedAt: -1 }).limit(5).lean(),
  ])
  const evidenceCount = await Skill.aggregate([
    { $match: { ownerId } },
    { $project: { count: { $size: '$artifacts' } } },
    { $group: { _id: null, count: { $sum: '$count' } } },
  ])
  const projectEvidence = await Project.aggregate([
    { $match: { ownerId } },
    { $project: { count: { $add: [{ $size: '$evidence' }, { $cond: [{ $ne: ['$githubUrl', ''] }, 1, 0] }, { $cond: [{ $ne: ['$liveUrl', ''] }, 1, 0] }] } } },
    { $group: { _id: null, count: { $sum: '$count' } } },
  ])
  const activities = [
    ...skills.map((item) => ({ id: item._id, type: 'skill', title: item.name, detail: `${item.level} ${item.category} skill`, date: item.updatedAt })),
    ...projects.map((item) => ({ id: item._id, type: 'project', title: item.title, detail: `Project · ${item.technologies.slice(0, 3).join(', ') || 'Portfolio project'}`, date: item.updatedAt })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6)

  res.json({
    totalSkills,
    totalProjects,
    verifiedEvidence: (evidenceCount[0]?.count || 0) + (projectEvidence[0]?.count || 0),
    highlightedSkills: await Skill.countDocuments({ ownerId, highlighted: true }),
    categoryBreakdown: await Skill.aggregate([{ $match: { ownerId } }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    recentSkills: skills,
    recentProjects: projects,
    activities,
  })
}))

export default router