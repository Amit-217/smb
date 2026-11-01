// Seeds the researched issues from src/seed-data/<slug>.json (one bilingual file per issue).
//
//   npm run seed               -> adds issues that don't exist yet (admin edits are never touched)
//   npm run seed -- --replace  -> also overwrites the content of existing issues with the same slug
//                                 (keeps their id, so approved news and visitor media stay attached)
//
// Each file: { slug, priority, location, en: {...}, mr: {...}, sources: [...] } — see any file for the shape.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { assertCoreConfig } from './config.js';
import { connectDb } from './db.js';
import { Issue, SOURCE_TYPES } from './models/Issue.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data');

// Issues shown under "Hot topics" at the top of the home page (admin can change this later).
const HOT = new Set(['ujani-ai-data-centre', 'karjat-pumped-storage-torrent', 'vadhavan-port']);

const TEXT_KEYS = ['title', 'district', 'category', 'summary', 'background', 'whatIsProposed', 'cause', 'govPosition', 'status'];
const ARRAY_KEYS = ['effects', 'keyFacts', 'disputed', 'openQuestions', 'timeline'];

function validate(file, d) {
  const errors = [];
  const need = (cond, msg) => cond || errors.push(msg);
  need(/^[a-z0-9-]+$/.test(d.slug || ''), 'slug missing or invalid');
  need(`${d.slug}.json` === path.basename(file), 'file name must be <slug>.json');
  need(['high', 'medium', 'watch'].includes(d.priority), 'priority must be high | medium | watch');
  need(Number.isFinite(d.location?.lat) && Number.isFinite(d.location?.lng), 'location.lat/lng missing');
  for (const lang of ['en', 'mr']) {
    need(d[lang] && typeof d[lang] === 'object', `${lang} section missing`);
    if (!d[lang]) continue;
    need(d[lang].title?.trim(), `${lang}.title missing`);
    for (const k of TEXT_KEYS) need(d[lang][k] === undefined || typeof d[lang][k] === 'string', `${lang}.${k} must be text`);
    for (const k of ARRAY_KEYS) need(d[lang][k] === undefined || Array.isArray(d[lang][k]), `${lang}.${k} must be a list`);
  }
  if (d.en && d.mr) {
    for (const k of ARRAY_KEYS) {
      need((d.en[k] || []).length === (d.mr[k] || []).length, `${k}: English and Marathi lists differ in length`);
    }
    (d.en.timeline || []).forEach((t, i) => {
      need(t.source === d.mr.timeline?.[i]?.source, `timeline[${i}]: English and Marathi source URLs differ`);
    });
  }
  const urls = new Set();
  for (const s of d.sources || []) {
    need(/^https?:\/\//.test(s.url || ''), `source has invalid url: ${s.url}`);
    need(SOURCE_TYPES.includes(s.type), `source type must be one of ${SOURCE_TYPES.join(', ')}: ${s.url}`);
    urls.add(s.url);
  }
  for (const t of d.en?.timeline || []) {
    need(!t.source || urls.has(t.source), `timeline source not listed in sources: ${t.source}`);
  }
  return errors;
}

export function loadSeedIssues() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();
  const problems = [];
  const issues = files.map((f) => {
    const file = path.join(DATA_DIR, f);
    let d;
    try {
      d = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      problems.push(`${f}: invalid JSON (${err.message})`);
      return null;
    }
    validate(file, d).forEach((e) => problems.push(`${f}: ${e}`));
    return {
      slug: d.slug,
      priority: d.priority,
      location: d.location,
      hot: HOT.has(d.slug),
      ...d.en,
      mr: d.mr,
      sources: d.sources || [],
    };
  });
  if (problems.length) throw new Error(`Seed data has problems:\n  ${problems.join('\n  ')}`);
  return issues;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const replace = process.argv.includes('--replace');
  const issues = loadSeedIssues(); // validate before touching the database
  assertCoreConfig();
  await connectDb();
  let inserted = 0;
  let replaced = 0;
  for (const data of issues) {
    if (replace) {
      const { hot, ...content } = data; // keep the admin's hot-topic choice on existing issues
      const r = await Issue.updateOne({ slug: data.slug }, { $set: content, $setOnInsert: { hot } }, { upsert: true, runValidators: true });
      if (r.upsertedCount) inserted += 1;
      else replaced += 1;
    } else {
      const r = await Issue.updateOne({ slug: data.slug }, { $setOnInsert: data }, { upsert: true });
      inserted += r.upsertedCount;
    }
  }
  console.log(`Seed done: ${inserted} new, ${replaced} replaced, ${issues.length - inserted - replaced} left unchanged (${issues.length} files).`);
  await mongoose.disconnect();
}
