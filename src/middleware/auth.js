import jwt from 'jsonwebtoken';
import { config, isAdminEmail } from '../config.js';
import { User } from '../models/User.js';

export const COOKIE = 'sm_token';
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

export function signSession(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: '30d' });
}

export async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(sub);
    if (user) {
      req.user = user;
      req.isAdmin = isAdminEmail(user.email);
    }
  } catch {
    // invalid/expired token -> treated as logged out
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || !req.isAdmin) return res.status(403).json({ error: 'Admin only.' });
  next();
}
