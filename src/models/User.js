import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, trim: true, maxlength: 40 },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
