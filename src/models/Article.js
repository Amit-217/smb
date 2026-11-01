import mongoose from 'mongoose';

// Only headline, link, date and our own AI summary are stored - never the full article text.
const articleSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    source: String,
    publishedAt: Date,
    summary: String,
    extracted: mongoose.Schema.Types.Mixed,
    confidence: Number,
    issue: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', index: true },
    reviewStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    reviewNote: String,
  },
  { timestamps: true },
);

export const Article = mongoose.model('Article', articleSchema);
