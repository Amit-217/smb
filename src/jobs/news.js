import Parser from 'rss-parser';
import { Article } from '../models/Article.js';
import { Issue } from '../models/Issue.js';
import { JobRun } from '../models/JobRun.js';
import { chatJson } from '../services/llm.js';
import { FEEDS, KEYWORDS, MAHARASHTRA_TERMS } from './feeds.js';

const MAX_AI_CALLS_PER_RUN = 60; // stays well inside free-tier daily limits
const DELAY_BETWEEN_AI_CALLS_MS = 5000; // respects free-tier per-minute limits
const AUTO_APPROVE_CONFIDENCE = 0.85; // only for attaching a news link to an EXISTING issue

const parser = new Parser({ timeout: 20000, headers: { 'User-Agent': 'SaveMaharashtraBot/1.0' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    [...u.searchParams.keys()].filter((k) => k.startsWith('utm_') || k === 'fbclid').forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function passesFilter(text, scoped) {
  const t = text.toLowerCase();
  if (!KEYWORDS.some((k) => t.includes(k))) return false;
  return scoped || MAHARASHTRA_TERMS.some((k) => t.includes(k));
}

const SYSTEM_PROMPT = `You analyse Indian news (English or Marathi) for a public-interest website that tracks environmental issues in Maharashtra.
Return ONLY a JSON object with these keys:
{
 "relevant": boolean,            // true only if about an environmental issue/project/pollution/forest/water/wildlife/coast problem located in Maharashtra
 "project": string,              // project or issue name, e.g. "Ujani AI data centre"
 "district": string,             // Maharashtra district, "" if unknown
 "place": string,                // village/town/area, "" if unknown
 "category": string,             // one of: Water, Forest, Coast, Air, Pollution, Wildlife, Farmland, Waste, Other
 "summary": string,              // 2-3 neutral sentences in English, your own words, no copying
 "cause": string,                // what is causing the harm (who/what project)
 "effects": string[],            // concrete effects on environment/people
 "govPosition": string,          // government or company stand if mentioned, else ""
 "status": string,               // e.g. proposed, approved, protest, in court, stopped, ongoing
 "publicHearingDate": string,    // YYYY-MM-DD if mentioned, else ""
 "objectionDeadline": string,    // YYYY-MM-DD if mentioned, else ""
 "matchedIssueSlug": string,     // slug from the provided list if this article is clearly about that issue, else ""
 "confidence": number            // 0..1 confidence in relevance + match
}
Be factual. Do not invent numbers or dates that are not in the text.`;

const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function sanitize(raw, validSlugs) {
  const slug = str(raw.matchedIssueSlug, 100);
  return {
    relevant: raw.relevant === true,
    project: str(raw.project, 200),
    district: str(raw.district, 60),
    place: str(raw.place, 100),
    category: str(raw.category, 30),
    summary: str(raw.summary, 1000),
    cause: str(raw.cause),
    effects: Array.isArray(raw.effects) ? raw.effects.map((e) => str(e, 300)).filter(Boolean).slice(0, 8) : [],
    govPosition: str(raw.govPosition),
    status: str(raw.status, 60),
    publicHearingDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.publicHearingDate) ? raw.publicHearingDate : '',
    objectionDeadline: /^\d{4}-\d{2}-\d{2}$/.test(raw.objectionDeadline) ? raw.objectionDeadline : '',
    matchedIssueSlug: validSlugs.has(slug) ? slug : '',
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
  };
}

let running = false;

export async function runNews({ log = console.log } = {}) {
  if (running) throw new Error('News job is already running');
  running = true;
  const run = await JobRun.create({ job: 'news' });
  try {
    // 1. Fetch every feed; one failing feed never stops the others.
    const candidates = new Map();
    for (const feed of FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const item of parsed.items || []) {
          const url = normalizeUrl(item.link);
          if (!url || !item.title) continue;
          run.fetched += 1;
          if (!candidates.has(url)) {
            candidates.set(url, {
              url,
              title: item.title.trim(),
              snippet: (item.contentSnippet || item.content || '').replace(/\s+/g, ' ').slice(0, 1500),
              source: item.source || item.creator || parsed.title || feed.name,
              publishedAt: item.isoDate ? new Date(item.isoDate) : null,
              scoped: feed.scoped,
            });
          }
        }
      } catch (err) {
        run.errors.push(`feed "${feed.name}": ${err.message}`);
      }
    }

    // 2. Skip already-processed URLs.
    const urls = [...candidates.keys()];
    const seen = new Set((await Article.find({ url: { $in: urls } }).select('url').lean()).map((a) => a.url));
    const fresh = urls.filter((u) => !seen.has(u)).map((u) => candidates.get(u));
    run.newItems = fresh.length;

    // 3. Free keyword filter before any AI call.
    const filtered = fresh.filter((c) => passesFilter(`${c.title} ${c.snippet}`, c.scoped));
    run.passedFilter = filtered.length;

    // 4. AI extraction + matching to existing issues.
    const issues = await Issue.find().select('slug title district').lean();
    const bySlug = new Map(issues.map((i) => [i.slug, i]));
    const issueList = issues.map((i) => `${i.slug}: ${i.title} (${i.district})`).join('\n');

    for (const [index, c] of filtered.slice(0, MAX_AI_CALLS_PER_RUN).entries()) {
      if (index > 0) await sleep(DELAY_BETWEEN_AI_CALLS_MS);
      let extracted;
      try {
        const { json } = await chatJson(
          SYSTEM_PROMPT,
          `Existing tracked issues (slug: title):\n${issueList}\n\nARTICLE\nTitle: ${c.title}\nSource: ${c.source}\nText: ${c.snippet}`,
        );
        extracted = sanitize(json, new Set(bySlug.keys()));
      } catch (err) {
        // Not saved, so it is retried on the next run.
        run.errors.push(`AI "${c.title.slice(0, 60)}": ${err.message.slice(0, 200)}`);
        continue;
      }
      run.extracted += 1;

      const matched = extracted.matchedIssueSlug ? bySlug.get(extracted.matchedIssueSlug) : null;
      let reviewStatus = 'pending';
      let reviewNote = '';
      if (!extracted.relevant) {
        reviewStatus = 'rejected';
        reviewNote = 'auto: not relevant';
        run.irrelevant += 1;
      } else if (matched && extracted.confidence >= AUTO_APPROVE_CONFIDENCE) {
        reviewStatus = 'approved';
        reviewNote = 'auto: matched existing issue';
        run.autoApproved += 1;
      } else {
        run.queued += 1;
      }

      try {
        await Article.create({
          url: c.url,
          title: c.title,
          source: c.source,
          publishedAt: c.publishedAt,
          summary: extracted.summary,
          extracted,
          confidence: extracted.confidence,
          issue: matched?._id,
          reviewStatus,
          reviewNote,
        });
        if (reviewStatus === 'approved') await Issue.updateOne({ _id: matched._id }, { lastNewsAt: new Date() });
      } catch (err) {
        if (err.code !== 11000) run.errors.push(`save: ${err.message}`);
      }
    }
    return run;
  } finally {
    run.finishedAt = new Date();
    await run.save().catch(() => {});
    running = false;
    log(`news job: fetched=${run.fetched} new=${run.newItems} filtered=${run.passedFilter} extracted=${run.extracted} auto=${run.autoApproved} queued=${run.queued} errors=${run.errors.length}`);
  }
}
