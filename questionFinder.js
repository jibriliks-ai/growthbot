// ============================================================
// Question Finder — Reddit + Lemmy (v2.0)
// Country list is delegated to directoryGenerator so the Q&A
// dropdown always matches the Listings dropdown.
// ============================================================
import axios from 'axios';
import { listSupportedCountries as listDirCountries } from './directoryGenerator.js';

const UA = 'GrowthBot/2.0 (Question Finder; by /u/growthbot)';
const REDDIT_SEARCH = 'https://www.reddit.com/search.json';
const LEMMY_INSTANCES = [
  'https://lemmy.world',
  'https://lemmy.ml',
  'https://sh.itjust.works',
  'https://feddit.de',
  'https://lemmy.ca',
];

export function listSupportedCountries() {
  return listDirCountries().map(({ code, name, language, total }) => ({
    code, name, language, total,
  }));
}

export async function findQuestions({ keyword, country = 'ng', limitPerSource = 10 }) {
  const results = [];
  const warnings = [];
  const sourceStatus = {};

  // ---- Reddit ----
  try {
    const redditResults = await searchReddit(keyword, limitPerSource);
    results.push(...redditResults);
    sourceStatus.reddit = { ok: true, count: redditResults.length };
  } catch (e) {
    warnings.push(`Reddit: ${e.message}`);
    sourceStatus.reddit = { ok: false, error: e.message };
  }

  // ---- Lemmy (first instance that answers wins) ----
  let lemmyHit = false;
  for (const instance of LEMMY_INSTANCES) {
    if (lemmyHit) break;
    try {
      const lemmyResults = await searchLemmy(instance, keyword, limitPerSource);
      sourceStatus[`lemmy:${instance.replace('https://', '')}`] = {
        ok: true, count: lemmyResults.length,
      };
      if (lemmyResults.length > 0) {
        results.push(...lemmyResults);
        lemmyHit = true;
      }
    } catch (e) {
      sourceStatus[`lemmy:${instance.replace('https://', '')}`] = {
        ok: false, error: e.message,
      };
    }
  }

  return {
    keyword,
    country,
    totalFound: results.length,
    results,
    sourceStatus,
    warnings,
  };
}

async function searchReddit(keyword, limit) {
  const res = await axios.get(REDDIT_SEARCH, {
    params: { q: keyword, limit, sort: 'relevance', type: 'link', t: 'year' },
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: 15000,
  });
  const children = res.data?.data?.children || [];
  return children.map((c) => {
    const d = c.data;
    return {
      source_platform: 'reddit',
      title: String(d.title || '').slice(0, 200),
      snippet: String(d.selftext || '').slice(0, 300),
      question_url: `https://www.reddit.com${d.permalink}`,
      score: d.score || 0,
      num_comments: d.num_comments || 0,
    };
  }).filter((r) => r.title && r.question_url);
}

async function searchLemmy(instance, keyword, limit) {
  const res = await axios.get(`${instance}/api/v3/search`, {
    params: { q: keyword, type_: 'Posts', sort: 'TopAll', limit },
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: 12000,
  });
  const posts = res.data?.posts || [];
  return posts.map((p) => ({
    source_platform: 'lemmy',
    title: String(p.post?.name || '').slice(0, 200),
    snippet: String(p.post?.body || '').slice(0, 300),
    question_url: p.post?.ap_id || `${instance}/post/${p.post?.id}`,
    score: p.counts?.score || 0,
    num_comments: p.counts?.comments || 0,
  })).filter((r) => r.title && r.question_url);
}