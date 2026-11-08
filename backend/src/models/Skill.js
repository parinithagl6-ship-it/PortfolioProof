import mongoose from 'mongoose'

const artifactSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true, maxlength: 80 },
    url: { type: String, trim: true, required: true, maxlength: 2048 },
  },
  { _id: true },
)

const skillSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 60 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      enum: ['Frontend', 'Backend', 'Programming', 'Database', 'AI/ML', 'Tools'],
      required: true,
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },
    highlighted: { type: Boolean, default: false },
    artifacts: { type: [artifactSchema], default: [] },
  },
  { timestamps: true, autoIndex: false },
)

skillSchema.index({ ownerId: 1, name: 1 }, { unique: true })

export default mongoose.model('Skill', skillSchema)