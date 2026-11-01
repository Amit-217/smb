import { Router } from 'express';
import { Issue } from '../models/Issue.js';
import { Article } from '../models/Article.js';
import { Media } from '../models/Media.js';
import { mediaUrls } from '../services/media.js';

const router = Router();
const PRIORITY_ORDER = { high: 0, medium: 1, watch: 2 };

router.get('/', async (_req, res, next) => {
  try {
    const issues = await Issue.find({ published: true })
      .select('slug title district category location summary status priority hot lastNewsAt updatedAt mr.title mr.district mr.category mr.summary mr.status')
      .lean();
    issues.sort(
      (a, b) => Number(!!b.hot) - Number(!!a.hot)
        || (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
        || b.updatedAt - a.updatedAt,
    );
    res.json(issues);
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const issue = await Issue.findOne({ slug: req.params.slug, published: true }).lean();
    if (!issue) return res.status(404).json({ error: 'Issue not found.' });
    const news = await Article.find({ issue: issue._id, reviewStatus: 'approved' })
      .select('title url source publishedAt summary')
      .sort({ publishedAt: -1 })
      .limit(50)
      .lean();
    res.json({ ...issue, news });
  } catch (err) {
    next(err);
  }
});

// Public media list: only admin-approved items, and never any uploader information.
router.get('/:slug/media', async (req, res, next) => {
  try {
    const issue = await Issue.findOne({ slug: req.params.slug, published: true }).select('_id').lean();
    if (!issue) return res.status(404).json({ error: 'Issue not found.' });
    const items = await Media.find({ issue: issue._id, status: 'published' }).sort({ createdAt: -1 }).limit(100).lean();
    res.json(
      items.map((m) => {
        const kind = m.kind || 'video';
        return { id: m._id, kind, title: m.title, description: m.description, createdAt: m.createdAt, ...mediaUrls(kind, m.publicId) };
      }),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
