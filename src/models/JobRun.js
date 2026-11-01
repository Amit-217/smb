import mongoose from 'mongoose';

const jobRunSchema = new mongoose.Schema({
  job: { type: String, default: 'news' },
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
  fetched: { type: Number, default: 0 },
  newItems: { type: Number, default: 0 },
  passedFilter: { type: Number, default: 0 },
  extracted: { type: Number, default: 0 },
  autoApproved: { type: Number, default: 0 },
  queued: { type: Number, default: 0 },
  irrelevant: { type: Number, default: 0 },
  errors: [String],
});

export const JobRun = mongoose.model('JobRun', jobRunSchema);
