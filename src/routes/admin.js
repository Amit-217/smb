import mongoose from 'mongoose';
import { Router } from 'express';
import { Issue, ISSUE_EDITABLE_FIELDS } from '../models/Issue.js';
import { Article } from '../models/Article.js';
import { Media } from '../models/Media.js';
import { JobRun } from '../models/JobRun.js';
import { requireAdmin } from '../middleware/auth.js';
import { deleteMedia, mediaUrls } from '../services/media.js';
import { runNews } from '../jobs/news.js';

const router = Router();
router.use(requireAdmin);

const pick = (body) => Object.fromEntries(ISSUE_EDITABLE_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
const validId = (req, res, next) => (mongoose.isValidObjectId(req.params.id) ? next() : res.status(400).json({ error: 'Invalid id.' }));
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || `issue-${Date.now()}`;

// ---- Issues ----
router.get('/issues', async (_req, res, next) => {
  try {
    res.json(await Issue.find().sort({ updatedAt: -1 }).lean());
  } catch (err) {
    next(err);
  }
});

router.post('/issues', async (req, res, next) => {
  try {
    const data = pick(req.body);
    data.slug = slugify(data.slug || data.title);
    res.status(201).json(await Issue.create(data));
  } catch (err) {
    next(err);
  }
});

router.put('/issues/:id', validId, async (req, res, next) => {
  try {
    const data = pick(req.body);
    if (data.slug) data.slug = slugify(data.slug);
    const issue = await Issue.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!issue) return res.status(404).json({ error: 'Issue not found.' });
    res.json(issue);
  } catch (err) {
    next(err);
  }
});

// ---- News review queue ----
router.get('/articles', async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    res.json(await Article.find({ reviewStatus: status }).populate('issue', 'title slug').sort({ createdAt: -1 }).limit(200).lean());
  } catch (err) {
    next(err);
  }
});

router.post('/articles/:id/approve', validId, async (req, res, next) => {
  try {
    const { issueId } = req.body;
    if (!mongoose.isValidObjectId(issueId)) return res.status(400).json({ error: 'Choose an issue to attach this news to.' });
    const issue = await Issue.findById(issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found.' });
    const article = await Article.findByIdAndUpdate(
      req.params.id,
      { issue: issue._id, reviewStatus: 'approved', reviewNote: 'admin' },
      { new: true },
    );
    if (!article) return res.status(404).json({ error: 'Article not found.' });
    issue.lastNewsAt = new Date();
    await issue.save();
    res.json(article);
  } catch (err) {
    next(err);
  }
});

router.post('/articles/:id/reject', validId, async (req, res, next) => {
  try {
    const article = await Article.findByIdAndUpdate(req.params.id, { reviewStatus: 'rejected', reviewNote: 'admin' }, { new: true });
    if (!article) return res.status(404).json({ error: 'Article not found.' });
    res.json(article);
  } catch (err) {
    next(err);
  }
});

// Turn a detected new issue into a draft (unpublished) issue page prefilled by the AI, and attach the article.
router.post('/articles/:id/create-issue', validId, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found.' });
    const x = article.extracted || {};
    const issue = await Issue.create({
      slug: `${slugify(x.project || article.title)}-${Date.now().toString(36)}`,
      title: x.project || article.title,
      district: x.district,
      category: x.category,
      summary: x.summary,
      cause: x.cause,
      effects: x.effects,
      govPosition: x.govPosition,
      status: x.status,
      priority: 'medium',
      published: false,
      timeline: [{ date: (article.publishedAt || new Date()).toISOString().slice(0, 10), text: article.title }],
      sources: [{ title: `${article.source || 'News'}: ${article.title}`, url: article.url }],
      openQuestions: ['Verify facts and add map location before publishing.'],
    });
    article.issue = issue._id;
    article.reviewStatus = 'approved';
    article.reviewNote = 'admin: created issue';
    await article.save();
    res.status(201).json(issue);
  } catch (err) {
    next(err);
  }
});

// ---- Visitor photos & videos (review queue) ----
// Admin-only view: includes who uploaded each item, which is never shown publicly.
router.get('/media', async (req, res, next) => {
  try {
    const status = ['pending', 'published', 'hidden', 'removed'].includes(req.query.status) ? req.query.status : 'pending';
    const items = await Media.find({ status })
      .populate('user', 'displayName email')
      .populate('issue', 'title slug')
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();
    res.json(
      items.map(({ reportedBy, ...m }) => {
        const kind = m.kind || 'video';
        return { ...m, kind, reports: reportedBy?.length || 0, ...mediaUrls(kind, m.publicId) };
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/media/:id/approve', validId, async (req, res, next) => {
  try {
    const media = await Media.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['pending', 'hidden'] } },
      { status: 'published', reportedBy: [] },
      { new: true },
    );
    if (!media) return res.status(404).json({ error: 'Nothing waiting for approval with this id.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/media/:id/remove', validId, async (req, res, next) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Not found.' });
    await deleteMedia(media.kind || 'video', media.publicId);
    media.status = 'removed';
    await media.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- News job ----
router.get('/jobs', async (_req, res, next) => {
  try {
    res.json(await JobRun.find().sort({ startedAt: -1 }).limit(30).lean());
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/news/run', (_req, res) => {
  runNews().catch((err) => console.error('manual news run failed:', err.message));
  res.status(202).json({ ok: true, message: 'News job started. Refresh in a few minutes.' });
});

export default router;
