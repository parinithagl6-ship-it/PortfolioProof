import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, required: true, maxlength: 254 },
    username: { type: String, trim: true, lowercase: true, maxlength: 32 },
    passwordHash: { type: String, select: false },
    googleId: { type: String },
    githubId: { type: String },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    workspaceKey: { type: String, required: true, unique: true, default: 'portfolio-owner' },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)

userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ username: 1 }, { unique: true, sparse: true })
userSchema.index({ googleId: 1 }, { unique: true, sparse: true })
userSchema.index({ githubId: 1 }, { unique: true, sparse: true })

export default mongoose.model('User', userSchema)
