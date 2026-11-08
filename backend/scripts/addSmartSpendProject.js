import '../src/env.js'
import mongoose from 'mongoose'
import Project from '../src/models/Project.js'
import Skill from '../src/models/Skill.js'
import User from '../src/models/User.js'

const projectDetails = {
  title: 'SmartSpend AI – AI-Powered Personal Finance Manager',
  description: 'SmartSpend AI is an AI-powered personal finance management application that helps users track income and expenses, manage spending, and understand financial habits. It uses Gemini AI to provide intelligent financial insights and personalized suggestions.',
  githubUrl: 'https://github.com/parinithagl6-ship-it/SmartSpend-AI',
  liveUrl: 'https://smartspend-ai-1-178b.onrender.com',
  technologies: ['React', 'JavaScript', 'Node.js', 'Express.js', 'MongoDB', 'Gemini AI', 'HTML', 'CSS'],
}

async function addSmartSpendProject() {
  const owner = await User.findOne({ workspaceKey: 'portfolio-owner' }).select('_id')
  if (!owner) throw new Error('Create the original portfolio owner account before adding its existing project.')
  const existingProject = await Project.findOne({
    ownerId: owner._id,
    title: { $regex: /^SmartSpend AI\s*[–—-]\s*AI-Powered Personal Finance Manager$/i },
  })

  if (existingProject) {
    console.log('SmartSpend AI is already in the portfolio; no duplicate was created or existing data changed.')
    return
  }

  const skillAliases = new Map([
    ['express.js', 'express'],
  ])
  const usedTechnologies = new Set(
    projectDetails.technologies.map((technology) => skillAliases.get(technology.toLowerCase()) || technology.toLowerCase()),
  )
  const availableSkills = await Skill.find({ ownerId: owner._id }).select('_id name').lean()
  const skills = availableSkills
    .filter((skill) => usedTechnologies.has(skill.name.trim().toLowerCase()))
    .map((skill) => skill._id)

  await Project.create({ ...projectDetails, ownerId: owner._id, skills })
  console.log(`SmartSpend AI added. Linked ${skills.length} existing matching skill(s); no skills or other records were created or changed.`)
}

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required to add SmartSpend AI.')
  process.exitCode = 1
} else {
  mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(addSmartSpendProject)
    .catch((error) => {
      console.error(`Unable to add SmartSpend AI (${error.name}); connection details are withheld.`)
      process.exitCode = 1
    })
    .finally(() => mongoose.disconnect())
}
