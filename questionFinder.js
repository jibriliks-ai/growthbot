// ============================================================
// GrowthBot — Question Finder (Module 1)
// ============================================================
// Finds questions from Q&A sites per country.
//
// Strategy:
//   • Reddit        → free public JSON search (no auth needed for reads)
//   • Quora/other   → Google Custom Search API (needs GOOGLE_CSE_API_KEY)
//
// We NEVER auto-post. We return URLs + titles for human review only.
// ============================================================
import axios from 'axios';

// ============================================================
// COUNTRY → Q&A SOURCES MAP
// ============================================================
export const QA_SOURCES_BY_COUNTRY = {
  global: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
    { id: 'stackexchange',label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],
  ng: [
    { id: 'nairaland',    label: 'Nairaland',    domain: 'nairaland.com',    method: 'google_cse' },
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
  ],
  us: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
    { id: 'stackexchange',label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],
  gb: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
  ],
  in: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
  ],
  ke: [
    { id: 'kenyatalk',    label: 'KenyaTalk',    domain: 'kenyatalk.com',    method: 'google_cse' },
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
  ],
  gh: [
    { id: 'ghanaweb',     label: 'GhanaWeb',     domain: 'ghanaweb.com',     method: 'google_cse' },
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
  ],
  za: [
    { id: 'mybroadband',  label: 'MyBroadband',  domain: 'mybroadband.co.za', method: 'google_cse' },
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
  ],
  ph: [
    { id: 'pinoyexchange',label: 'PinoyExchange',domain: 'pinoyexchange.com', method: 'google_cse' },
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
  ],
  eg: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
  ],
  br: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
  ],
  mx: [
    { id: 'reddit',       label: 'Reddit',       domain: 'reddit.com',       method: 'reddit_api' },
    { id: 'quora',        label: 'Quora',        domain: 'quora.com',        method: 'google_cse' },
  ],
};

export function listSupportedCountries() {
  return Object.keys(QA_SOURCES_BY_COUNTRY).map((code) => ({
    code,
    name: {
      global: 'Global',
      ng: 'Nigeria', us: 'United States', gb: 'United Kingdom',
      in: 'India', ke: 'Kenya', gh: 'Ghana', za: 'South Africa',
      ph: 'Philippines', eg: 'Egypt', br: 'Brazil', mx: 'Mexico',
    }[code] || code.toUpperCase(),
    sources: QA_SOURCES_BY_COUNTRY[code].map((s) => s.label),
  }));
}

// ============================================================
// REDDIT SEARCH — public JSON, no auth
// ============================================================
async function searchReddit(keyword, { limit = 25, sort = 'relevance' } = {}) {
  const url = 'https://www.reddit.com/search.json';
  try {
    const res = await axios.get(url, {
      params: { q: keyword, sort, limit, t: 'year' },
      headers: {
        'User-Agent': 'GrowthBot/3.2 (question research; contact@growthbot.app)',
      },
      timeout: 12_000,
    });
    const children = res.data?.data?.children || [];
    return children
      .filter((c) => c.data && c.data.title && c.data.permalink)
      .map((c) => ({
        source: 'reddit',
        title: c.data.title,
        url: 'https://www.reddit.com' + c.data.permalink,
        snippet: (c.data.selftext || '').slice(0, 300),
        subreddit: c.data.subreddit,
        score: c.data.score,
        numComments: c.data.num_comments,
        postedAt: new Date(c.data.created_utc * 1000).toISOString(),
      }));
  } catch (e) {
    console.warn('[questionFinder] Reddit failed:', e.message);
    return [];
  }
}

// ============================================================
// GOOGLE CUSTOM SEARCH — the only reliable way to search Quora, Nairaland, etc.
// ============================================================
async function searchGoogleCSE(keyword, siteDomain, { limit = 10 } = {}) {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cx) {
    return { error: 'GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID required', results: [] };
  }

  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q: `${keyword} site:${siteDomain}`,
        num: Math.min(limit, 10), // Google CSE max is 10 per request
      },
      timeout: 15_000,
    });
    const items = res.data?.items || [];
    return {
      results: items.map((i) => ({
        source: siteDomain,
        title: i.title,
        url: i.link,
        snippet: i.snippet || '',
      })),
    };
  } catch (e) {
    console.warn(`[questionFinder] Google CSE failed for ${siteDomain}:`, e.message);
    return { error: e.message, results: [] };
  }
}

// ============================================================
// NORMALISE — force every URL into a safe shareable form
// ============================================================
function dedupeByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    try {
      const u = new URL(item.url);
      const key = u.origin + u.pathname; // ignore query strings, fragments
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    } catch {
      // skip invalid URL
    }
  }
  return out;
}

// ============================================================
// MAIN — findQuestions
// ============================================================
export async function findQuestions({
  keyword,
  country = 'ng',
  limitPerSource = 10,
  sources = null,   // null = use all sources for country
} = {}) {
  if (!keyword || keyword.trim().length < 3) {
    throw new Error('Keyword must be at least 3 characters');
  }
  const normalizedCountry = String(country).toLowerCase();
  const countrySources = QA_SOURCES_BY_COUNTRY[normalizedCountry] ||
    QA_SOURCES_BY_COUNTRY.global;

  const activeSources = sources
    ? countrySources.filter((s) => sources.includes(s.id))
    : countrySources;

  const allResults = [];
  const sourceStatus = [];

  for (const source of activeSources) {
    let results = [];
    let error = null;

    if (source.method === 'reddit_api') {
      results = await searchReddit(keyword, { limit: limitPerSource });
    } else if (source.method === 'google_cse') {
      const r = await searchGoogleCSE(keyword, source.domain, {
        limit: limitPerSource,
      });
      results = r.results || [];
      if (r.error) error = r.error;
    }

    sourceStatus.push({
      source: source.id,
      label: source.label,
      count: results.length,
      error,
    });
    allResults.push(...results);
  }

  const deduped = dedupeByUrl(allResults);
  // Sort by recency-ish heuristic + source variety
  deduped.sort((a, b) => {
    if (a.postedAt && b.postedAt) {
      return new Date(b.postedAt) - new Date(a.postedAt);
    }
    return 0;
  });

  return {
    keyword,
    country: normalizedCountry,
    totalFound: deduped.length,
    results: deduped,
    sourceStatus,
    warnings: sourceStatus
      .filter((s) => s.error)
      .map((s) => `⚠️ ${s.label}: ${s.error}`),
  };
}

export default { findQuestions, listSupportedCountries, QA_SOURCES_BY_COUNTRY };