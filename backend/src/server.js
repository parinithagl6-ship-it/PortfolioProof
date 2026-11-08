import './env.js'
import mongoose from 'mongoose'
import app from './app.js'
import { migratePortfolioOwnership } from './migratePortfolioOwnership.js'

const port = Number(process.env.PORT) || 5000

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required. Add it to the root .env file before starting the API.')
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  })
  const migrated = await migratePortfolioOwnership()
  console.log('Connected to MongoDB.')
  if (migrated.migratedSkills || migrated.migratedProjects) {
    console.log(`Assigned existing portfolio data to its original owner (${migrated.migratedSkills} skills, ${migrated.migratedProjects} projects).`)
  }

  const server = app.listen(port, () => console.log(`PortfolioProof API listening on port ${port}.`))
  const shutdown = async (signal) => {
    console.log(`${signal} received; closing server.`)
    server.close(async () => {
      await mongoose.disconnect()
      process.exit(0)
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start().catch((error) => {
  console.error('Unable to start PortfolioProof:', error.message)
  process.exitCode = 1
})