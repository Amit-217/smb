// Background worker: daily news automation + cleanup. Run with PM2 as a separate process.
// `node src/worker.js --once` runs the job immediately and exits (useful for testing).
import cron from 'node-cron';
import mongoose from 'mongoose';
import { assertCoreConfig } from './config.js';
import { connectDb } from './db.js';
import { runNews } from './jobs/news.js';
import { cleanupStaleUploads } from './routes/uploads.js';

assertCoreConfig();
await connectDb();

async function daily() {
  try {
    await runNews();
  } catch (err) {
    console.error('news job failed:', err.message);
  }
  try {
    const n = await cleanupStaleUploads();
    if (n) console.log(`cleaned ${n} unfinished uploads`);
  } catch (err) {
    console.error('cleanup failed:', err.message);
  }
}

if (process.argv.includes('--once')) {
  await daily();
  await mongoose.disconnect();
} else {
  cron.schedule('0 6 * * *', daily, { timezone: 'Asia/Kolkata' });
  console.log('Worker started: news job runs daily at 06:00 IST');
}
