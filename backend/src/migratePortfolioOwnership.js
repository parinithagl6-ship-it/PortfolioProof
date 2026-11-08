import User from './models/User.js'
import Skill from './models/Skill.js'
import Project from './models/Project.js'

export async function migratePortfolioOwnership({
  UserModel = User,
  SkillModel = Skill,
  ProjectModel = Project,
} = {}) {
  const owner = await UserModel.findOne({ workspaceKey: 'portfolio-owner' }).select('_id')
  const unownedSkills = await SkillModel.countDocuments({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] })
  const unownedProjects = await ProjectModel.countDocuments({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] })

  if ((unownedSkills || unownedProjects) && !owner) {
    throw new Error('Legacy portfolio records exist but the original owner account was not found; ownership migration was stopped.')
  }

  if (owner && unownedSkills) {
    await SkillModel.updateMany(
      { $or: [{ ownerId: { $exists: false } }, { ownerId: null }] },
      { $set: { ownerId: owner._id } },
    )
  }
  if (owner && unownedProjects) {
    await ProjectModel.updateMany(
      { $or: [{ ownerId: { $exists: false } }, { ownerId: null }] },
      { $set: { ownerId: owner._id } },
    )
  }

  const skillIndexes = await SkillModel.collection.indexes()
  const oldUniqueNameIndex = skillIndexes.find((index) => index.name === 'name_1' && index.unique)
  if (oldUniqueNameIndex) await SkillModel.collection.dropIndex(oldUniqueNameIndex.name)
  await SkillModel.collection.createIndex({ ownerId: 1, name: 1 }, { unique: true, name: 'ownerId_1_name_1' })
  await ProjectModel.collection.createIndex({ ownerId: 1, updatedAt: -1 }, { name: 'ownerId_1_updatedAt_-1' })

  return { migratedSkills: unownedSkills, migratedProjects: unownedProjects }
}
