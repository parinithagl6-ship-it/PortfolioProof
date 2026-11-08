import './env.js'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Skill from './models/Skill.js'
import Project from './models/Project.js'
import User from './models/User.js'

export async function seedDemoData() {
  const owner = await User.findOne({ workspaceKey: 'portfolio-owner' }).select('_id')
  if (!owner) throw new Error('Create an account before seeding its demo portfolio.')
  const [existingSkills, existingProjects] = await Promise.all([
    Skill.countDocuments({ ownerId: owner._id }),
    Project.countDocuments({ ownerId: owner._id }),
  ])
  if (existingSkills || existingProjects) {
    console.log('Existing portfolio data found; demo seed skipped. No existing records were changed.')
    return
  }

  const skills = await Skill.insertMany([
    { ownerId: owner._id, name: 'React', category: 'Frontend', level: 'Advanced', highlighted: true, artifacts: [{ label: 'Component architecture', url: 'https://react.dev/learn' }] },
    { ownerId: owner._id, name: 'Node.js', category: 'Backend', level: 'Advanced', highlighted: true, artifacts: [{ label: 'Runtime fundamentals', url: 'https://nodejs.org/en/learn' }] },
    { ownerId: owner._id, name: 'TypeScript', category: 'Programming', level: 'Intermediate', highlighted: true, artifacts: [{ label: 'TypeScript handbook', url: 'https://www.typescriptlang.org/docs/' }] },
    { ownerId: owner._id, name: 'MongoDB', category: 'Database', level: 'Intermediate', highlighted: false, artifacts: [{ label: 'Data modeling guide', url: 'https://www.mongodb.com/docs/manual/data-modeling/' }] },
    { ownerId: owner._id, name: 'Figma', category: 'Tools', level: 'Intermediate', highlighted: false, artifacts: [{ label: 'Design systems', url: 'https://help.figma.com/hc/en-us/categories/360002042553-Design' }] },
  ])
  await Project.insertMany([
    {
      ownerId: owner._id,
      title: 'React — component patterns',
      description: 'A sample study of reusable UI architecture, component composition, and accessible interactions using React learning resources.',
      githubUrl: 'https://github.com/facebook/react',
      liveUrl: 'https://react.dev/learn',
      technologies: ['React', 'JavaScript', 'UI architecture'],
      skills: [skills[0]._id],
      evidence: [{ label: 'React learning guide', url: 'https://react.dev/learn' }],
    },
    {
      ownerId: owner._id,
      title: 'Node.js — API fundamentals',
      description: 'A sample backend learning project grounded in the Node.js runtime and official guides for maintainable server-side applications.',
      githubUrl: 'https://github.com/nodejs/node',
      liveUrl: 'https://nodejs.org/en/learn',
      technologies: ['Node.js', 'TypeScript', 'REST API'],
      skills: [skills[1]._id, skills[2]._id],
      evidence: [{ label: 'Node.js learning resources', url: 'https://nodejs.org/en/learn' }],
    },
  ])
  console.log('Added the PortfolioProof demonstration portfolio.')
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required to seed data.')
    process.exitCode = 1
  } else {
    mongoose.connect(process.env.MONGODB_URI)
      .then(seedDemoData)
      .then(() => mongoose.disconnect())
      .catch(async (error) => {
        console.error('Unable to seed demo data:', error.message)
        await mongoose.disconnect()
        process.exitCode = 1
      })
  }
}