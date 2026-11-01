import mongoose from 'mongoose';

const keyFactSchema = new mongoose.Schema({ label: String, value: String }, { _id: false });
// `source`: URL supporting this timeline entry.
const timelineSchema = new mongoose.Schema({ date: String, text: String, source: String }, { _id: false });
export const SOURCE_TYPES = ['government', 'court', 'company', 'news', 'advocacy', 'research'];
// `type` tells readers what kind of source it is (official record vs. news vs. advocacy).
const sourceSchema = new mongoose.Schema(
  { title: String, url: String, type: { type: String, enum: [...SOURCE_TYPES, ''], default: '' } },
  { _id: false },
);

// Marathi version of the translatable text. Any empty field falls back to English on the site.
const marathiSchema = new mongoose.Schema(
  {
    title: String,
    district: String,
    category: String,
    summary: String,
    background: String,
    whatIsProposed: String,
    cause: String,
    effects: [String],
    govPosition: String,
    status: String,
    keyFacts: [keyFactSchema],
    disputed: [String],
    openQuestions: [String],
    timeline: [timelineSchema],
  },
  { _id: false },
);

const issueSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    title: { type: String, required: true, trim: true },
    district: String,
    category: String,
    location: { lat: Number, lng: Number },
    summary: String,
    background: String, // long-form explanation; paragraphs separated by blank lines
    whatIsProposed: String,
    cause: String,
    effects: [String],
    govPosition: String,
    status: String,
    keyFacts: [keyFactSchema],
    priority: { type: String, enum: ['high', 'medium', 'watch'], default: 'medium' },
    hot: { type: Boolean, default: false }, // "Hot topic": shown first on the home page
    disputed: [String],
    openQuestions: [String],
    timeline: [timelineSchema],
    sources: [sourceSchema],
    mr: { type: marathiSchema, default: () => ({}) },
    published: { type: Boolean, default: true },
    lastNewsAt: Date,
  },
  { timestamps: true },
);

export const ISSUE_EDITABLE_FIELDS = [
  'slug', 'title', 'district', 'category', 'location', 'summary', 'background', 'whatIsProposed', 'cause', 'effects',
  'govPosition', 'status', 'keyFacts', 'priority', 'hot', 'disputed', 'openQuestions', 'timeline', 'sources', 'mr', 'published',
];

export const Issue = mongoose.model('Issue', issueSchema);
