import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(serverDir, '..'); // project root (contains client/)
dotenv.config({ path: path.join(serverDir, '.env') }); // secrets live in server/.env

const env = process.env;

export const config = {
  root,
  port: Number(env.PORT || 5000),
  isProd: env.NODE_ENV === 'production',
  siteUrl: env.SITE_URL || 'http://localhost:5173',
  mongoUri: env.MONGO_URI,
  jwtSecret: env.JWT_SECRET,
  // Password login for the admin panel (/admin). ADMIN_EMAILS (optional) grants admin to more OTP-login emails.
  adminEmail: String(env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',
  adminEmails: [env.ADMIN_EMAIL, ...(env.ADMIN_EMAILS || '').split(',')].map((e) => String(e || '').trim().toLowerCase()).filter(Boolean),
  mail: {
    host: env.MAIL_HOST,
    port: Number(env.MAIL_PORT || 587),
    secure: env.MAIL_SECURE === 'true',
    user: env.MAIL_USER,
    pass: env.MAIL_PASSWORD,
    from: `"${env.MAIL_FROM_NAME || 'Save Maharashtra'}" <${env.MAIL_FROM_EMAIL || env.MAIL_USER}>`,
  },
  cloudinary: { cloudName: env.CLOUD_NAME, apiKey: env.C_API_KEY, apiSecret: env.C_API_SECRET },
  maxVideoBytes: Number(env.MAX_VIDEO_MB || 100) * 1024 * 1024,
  maxImageBytes: Number(env.MAX_IMAGE_MB || 15) * 1024 * 1024,
  uploadsPerDay: Number(env.UPLOADS_PER_DAY || 3),
  llmProviders: [
    { name: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-2.5-flash' },
    { name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', key: env.GROQ_API_KEY, model: env.GROQ_MODEL || 'openai/gpt-oss-120b' },
  ].filter((p) => p.key),
};

export function assertCoreConfig() {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGO_URI');
  if (!config.jwtSecret || config.jwtSecret.length < 32) missing.push('JWT_SECRET (min 32 chars)');
  if (missing.length) throw new Error(`Missing config in .env: ${missing.join(', ')}`);
}

export const isAdminEmail = (email) => config.adminEmails.includes(String(email || '').toLowerCase());
