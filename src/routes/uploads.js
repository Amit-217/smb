import mongoose from 'mongoose';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { Issue } from '../models/Issue.js';
import { Media, REPORTS_TO_HIDE } from '../models/Media.js';
import { requireUser } from '../middleware/auth.js';
import { MEDIA_KINDS, deleteMedia, getResource, signUpload } from '../services/media.js';

const router = Router();
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const mb = (bytes) => Math.round(bytes / 1048576);

router.get('/limits', (_req, res) => {
  res.json({ imageMb: mb(MEDIA_KINDS.image.maxBytes()), videoMb: mb(MEDIA_KINDS.video.maxBytes()) });
});

// Step 1: validate, create an "uploading" record, return a signed Cloudinary upload.
// The browser then uploads the file directly to Cloudinary (our server never handles media bytes).
router.post('/sign', requireUser, uploadLimiter, async (req, res, next) => {
  try {
    const { issueId, kind, title, description, size } = req.body;
    if (typeof kind !== 'string' || !Object.hasOwn(MEDIA_KINDS, kind)) return res.status(400).json({ error: 'Only photos and videos can be shared.' });
    const rules = MEDIA_KINDS[kind];
    if (!mongoose.isValidObjectId(issueId)) return res.status(400).json({ error: 'Invalid issue.' });
    const issue = await Issue.findOne({ _id: issueId, published: true }).select('_id');
    if (!issue) return res.status(404).json({ error: 'Issue not found.' });

    const cleanTitle = String(title || '').trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 120) return res.status(400).json({ error: 'Title must be 3 to 120 characters.' });
    if (!Number.isFinite(size) || size <= 0 || size > rules.maxBytes()) {
      return res.status(400).json({ error: `File must be under ${mb(rules.maxBytes())} MB.` });
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await Media.countDocuments({ user: req.user._id, createdAt: { $gte: since } });
    if (recent >= config.uploadsPerDay) {
      return res.status(429).json({ error: `Daily limit reached (${config.uploadsPerDay} uploads per day).` });
    }

    const id = new mongoose.Types.ObjectId();
    const publicId = `${rules.folder}/${id}`;
    const signed = signUpload(kind, publicId);
    await Media.create({
      _id: id,
      user: req.user._id,
      issue: issue._id,
      kind,
      publicId,
      title: cleanTitle,
      description: String(description || '').trim().slice(0, 1000),
    });
    res.json({ mediaId: id, ...signed });
  } catch (err) {
    next(err);
  }
});

// Step 2: after the browser finished uploading, verify the file with Cloudinary and queue it for admin review.
router.post('/:id/confirm', requireUser, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid upload.' });
    const media = await Media.findOne({ _id: req.params.id, user: req.user._id, status: 'uploading' });
    if (!media) return res.status(404).json({ error: 'Upload not found.' });

    const rules = MEDIA_KINDS[media.kind];
    const resource = await getResource(media.kind, media.publicId);
    if (!resource) return res.status(400).json({ error: 'Upload not found on media server. Please try again.' });
    if (resource.bytes > rules.maxBytes() || !rules.formats.includes(String(resource.format).toLowerCase())) {
      await deleteMedia(media.kind, media.publicId).catch(() => {});
      media.status = 'removed';
      await media.save();
      return res.status(400).json({ error: 'File rejected: wrong format or too large.' });
    }
    media.bytes = resource.bytes;
    media.duration = resource.duration;
    media.status = 'pending';
    await media.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/report', requireUser, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid upload.' });
    const media = await Media.findOneAndUpdate(
      { _id: req.params.id, status: 'published' },
      { $addToSet: { reportedBy: req.user._id } },
      { new: true },
    );
    if (!media) return res.status(404).json({ error: 'Not found.' });
    if (media.reportedBy.length >= REPORTS_TO_HIDE) {
      media.status = 'hidden';
      await media.save();
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

// Remove uploads that were started but never confirmed (run daily by the worker).
export async function cleanupStaleUploads() {
  const stale = await Media.find({ status: 'uploading', createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  for (const m of stale) {
    await deleteMedia(m.kind, m.publicId).catch(() => {});
    m.status = 'removed';
    await m.save();
  }
  return stale.length;
}
