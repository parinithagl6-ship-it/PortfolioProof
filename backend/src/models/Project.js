import mongoose from 'mongoose'

const evidenceSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true, maxlength: 80 },
    url: { type: String, trim: true, required: true, maxlength: 2048 },
  },
  { _id: true },
)

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 100 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, trim: true, required: true, maxlength: 1200 },
    githubUrl: { type: String, trim: true, default: '', maxlength: 2048 },
    liveUrl: { type: String, trim: true, default: '', maxlength: 2048 },
    technologies: { type: [{ type: String, trim: true, maxlength: 32 }], default: [] },
    skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
    evidence: { type: [evidenceSchema], default: [] },
  },
  { timestamps: true, autoIndex: false },
)

projectSchema.index({ ownerId: 1, updatedAt: -1 })

export default mongoose.model('Project', projectSchema)