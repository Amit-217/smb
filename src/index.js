import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { assertCoreConfig, config } from './config.js';
import { connectDb } from './db.js';
import { loadUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import issueRoutes from './routes/issues.js';
import uploadRoutes from './routes/uploads.js';
import adminRoutes from './routes/admin.js';

assertCoreConfig();

const app = express();
app.set('trust proxy', 1); // behind Nginx

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://res.cloudinary.com'],
        'media-src': ["'self'", 'https://res.cloudinary.com'],
        'connect-src': ["'self'", 'https://api.cloudinary.com'],
      },
    },
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/media', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React app in production (single process; Nginx just proxies).
const clientDist = path.join(config.root, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '7d', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Already exists.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await connectDb();
app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
