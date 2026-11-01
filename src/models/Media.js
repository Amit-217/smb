import mongoose from 'mongoose';

// Photos and videos shared by logged-in visitors under an issue.
// Lifecycle: uploading -> pending (file verified) -> published (admin approved) | removed.
// Published items can become hidden after visitor reports, until an admin re-approves or removes them.
// The uploader is never exposed publicly; only admins see who shared what.
const mediaSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true, index: true },
    kind: { type: String, enum: ['video', 'image'], default: 'video' },
    publicId: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    bytes: Number,
    duration: Number,
    status: { type: String, enum: ['uploading', 'pending', 'published', 'hidden', 'removed'], default: 'uploading', index: true },
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  // Kept in the original "videos" collection so earlier uploads (all videos) remain intact.
  { timestamps: true, collection: 'videos' },
);

export const REPORTS_TO_HIDE = 3;
export const Media = mongoose.model('Media', mediaSchema);
