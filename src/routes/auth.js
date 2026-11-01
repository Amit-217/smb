import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config, isAdminEmail } from '../config.js';
import { Otp } from '../models/Otp.js';
import { User } from '../models/User.js';
import { sendMail } from '../services/mailer.js';
import { COOKIE, cookieOptions, requireUser, signSession } from '../middleware/auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const hashCode = (email, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${email}:${code}`).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();

// Only ever returned to the logged-in user themselves. Email is never part of any public response.
const meView = (req) => ({ displayName: req.user.displayName || '', email: req.user.email, isAdmin: !!req.isAdmin });

router.post('/request-otp', otpLimiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email.' });

    const existing = await Otp.findOne({ email });
    if (existing && Date.now() - existing.updatedAt.getTime() < RESEND_AFTER_MS) {
      return res.json({ ok: true }); // a code was sent less than a minute ago
    }
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await Otp.findOneAndUpdate(
      { email },
      { codeHash: hashCode(email, code), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      { upsert: true },
    );
    await sendMail({
      to: email,
      subject: `Your Save Maharashtra login code: ${code}`,
      text: `Your login code is ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', otpLimiter, async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const otp = await Otp.findOne({ email });
    const fail = () => res.status(400).json({ error: 'Invalid or expired code.' });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS || !/^\d{6}$/.test(code)) return fail();

    const a = Buffer.from(otp.codeHash, 'hex');
    const b = Buffer.from(hashCode(email, code), 'hex');
    if (!crypto.timingSafeEqual(a, b)) {
      await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      return fail();
    }
    await Otp.deleteOne({ _id: otp._id });
    const user = await User.findOneAndUpdate({ email }, { $setOnInsert: { email } }, { upsert: true, new: true });
    res.cookie(COOKIE, signSession(user._id), cookieOptions);
    req.user = user;
    req.isAdmin = isAdminEmail(email);
    res.json(meView(req));
  } catch (err) {
    next(err);
  }
});

// Admin panel login with ADMIN_EMAIL / ADMIN_PASSWORD from .env (strictly rate limited).
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const MIN_ADMIN_PASSWORD = 10;
const digest = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
const sameSecret = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

router.post('/admin-login', adminLoginLimiter, async (req, res, next) => {
  try {
    if (!config.adminEmail || config.adminPassword.length < MIN_ADMIN_PASSWORD) {
      return res.status(503).json({ error: `Admin login is not set up. Add ADMIN_EMAIL and ADMIN_PASSWORD (min ${MIN_ADMIN_PASSWORD} characters) to .env.` });
    }
    const email = normEmail(req.body.email);
    // Evaluate both comparisons so timing does not reveal which one failed.
    const emailOk = sameSecret(email, config.adminEmail);
    const passwordOk = sameSecret(req.body.password, config.adminPassword);
    if (!emailOk || !passwordOk) return res.status(401).json({ error: 'Wrong email or password.' });

    const user = await User.findOneAndUpdate({ email }, { $setOnInsert: { email } }, { upsert: true, new: true });
    res.cookie(COOKIE, signSession(user._id), cookieOptions);
    req.user = user;
    req.isAdmin = true;
    res.json(meView(req));
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  res.json(req.user ? meView(req) : null);
});

router.put('/me', requireUser, async (req, res, next) => {
  try {
    const displayName = String(req.body.displayName || '').trim().replace(/\s+/g, ' ');
    if (displayName.length < 2 || displayName.length > 40) return res.status(400).json({ error: 'Name must be 2 to 40 characters.' });
    if (displayName.includes('@')) return res.status(400).json({ error: 'Please do not use your email as your public name.' });
    req.user.displayName = displayName;
    await req.user.save();
    res.json(meView(req));
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  const { maxAge, ...opts } = cookieOptions;
  res.clearCookie(COOKIE, opts);
  res.json({ ok: true });
});

export default router;
