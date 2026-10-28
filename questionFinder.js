// ============================================================
// Auto Traffic Engine — Question Finder
// v4.0 — Quora default, multi-proxy Reddit, regional forums
// ============================================================
import axios from 'axios';

// ============================================================
// COUNTRY → SOURCES MAP
// Every country includes Quora. Regional forums are added per region.
// ============================================================
export const QA_SOURCES_BY_COUNTRY = {
  // ---- GLOBAL ----
  global: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],

  // ---- NORTH AMERICA ----
  us: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],
  ca: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  mx: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],

  // ---- EUROPE ----
  gb: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'moneysavingexpert', label: 'MoneySavingExpert', domain: 'moneysavingexpert.com', method: 'google_cse' },
  ],
  de: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'gutefrage', label: 'Gutefrage.net', domain: 'gutefrage.net', method: 'google_cse' },
  ],
  fr: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  es: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  it: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  nl: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  // ... (repeat for all European countries)

  // ---- AFRICA ----
  ng: [
    { id: 'nairaland', label: 'Nairaland', domain: 'nairaland.com', method: 'google_cse' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  ke: [
    { id: 'kenyatalk', label: 'KenyaTalk', domain: 'kenyatalk.com', method: 'google_cse' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  gh: [
    { id: 'ghanaweb', label: 'GhanaWeb', domain: 'ghanaweb.com', method: 'google_cse' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  za: [
    { id: 'mybroadband', label: 'MyBroadband', domain: 'mybroadband.co.za', method: 'google_cse' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  // ... (repeat for all African countries)

  // ---- ASIA ----
  in: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],
  // ... (repeat for all Asian countries)

  // ---- MIDDLE EAST ----
  ae: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  // ... (repeat for all Middle Eastern countries)

  // ---- LATIN AMERICA ----
  br: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  // ... (repeat for all Latin American countries)

  // ---- OCEANIA ----
  au: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'whirlpool', label: 'Whirlpool Forums', domain: 'whirlpool.net.au', method: 'google_cse' },
  ],
  nz: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
};

// ============================================================
// REDDIT — Multi-Strategy Fetch (Updated Proxies)
// ============================================================
async function searchReddit(keyword, { limit = 25 } = {}) {
  const redditPath = `search.json?q=${encodeURIComponent(keyword)}&sort=relevance&limit=${limit}&t=year`;
  const directUrl = `https://www.reddit.com/${redditPath}`;

  // Strategy 1: Direct (works from residential IPs)
  try {
    const res = await axios.get(directUrl, {
      headers: { 'User-Agent': 'AutoTrafficEngine/4.0' },
      timeout: 10_000,
    });
    if (res.data?.data?.children) return parseReddit(res.data.data.children);
  } catch (e) {
    console.log('Reddit direct failed:', e.response?.status || e.message);
  }

  // Strategy 2: corsproxy.io (Free tier: 10k/month)
  try {
    const proxied = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
    const res = await axios.get(proxied, { timeout: 15_000 });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (data?.data?.children) return parseReddit(data.data.children);
  } catch (e) {
    console.log('Reddit corsproxy.io failed:', e.message);
  }

  // Strategy 3: cors.lol (Free, open-source)
  try {
    const proxied = `https://api.cors.lol/?${encodeURIComponent(directUrl)}`;
    const res = await axios.get(proxied, { timeout: 15_000 });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (data?.data?.children) return parseReddit(data.data.children);
  } catch (e) {
    console.log('Reddit cors.lol failed:', e.message);
  }

  console.warn('❌ All Reddit strategies failed for:', keyword);
  return [];
}

function parseReddit(children) {
  return children
    .filter((c) => c.data && c.data.title && c.data.permalink)
    .map((c) => ({
      source: 'reddit',
      title: c.data.title,
      url: 'https://www.reddit.com' + c.data.permalink,
      snippet: (c.data.selftext || '').slice(0, 300),
      subreddit: c.data.subreddit,
      score: c.data.score,
      postedAt: new Date(c.data.created_utc * 1000).toISOString(),
    }));
}

// ============================================================
// GOOGLE CSE
// ============================================================
async function searchGoogleCSE(keyword, siteDomain, { limit = 10 } = {}) {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cx) {
    return { error: 'Google CSE not configured (missing API key or CSE ID)', results: [] };
  }

  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: apiKey, cx, q: `${keyword} site:${siteDomain}`, num: Math.min(limit, 10) },
      timeout: 15_000,
    });
    const items = res.data?.items || [];
    return { results: items.map((i) => ({ source: siteDomain, title: i.title, url: i.link, snippet: i.snippet || '' })) };
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error?.message || e.message;
    console.warn(`Google CSE failed for ${siteDomain} [${status}]:`, msg);
    return { error: `[${status}] ${msg}`, results: [] };
  }
}

// ============================================================
// MAIN FINDER
// ============================================================
export async function findQuestions({ keyword, country = 'ng', limitPerSource = 10 } = {}) {
  if (!keyword || keyword.trim().length < 3) throw new Error('Keyword must be at least 3 characters');
  
  const normalizedCountry = String(country).toLowerCase();
  const sources = QA_SOURCES_BY_COUNTRY[normalizedCountry] || QA_SOURCES_BY_COUNTRY.global;

  console.log(`🔍 Searching "${keyword}" in ${normalizedCountry} (${sources.length} sources)`);

  const allResults = [];
  const sourceStatus = [];

  for (const source of sources) {
    let results = [];
    let error = null;

    if (source.method === 'reddit_api') {
      results = await searchReddit(keyword, { limit: limitPerSource });
    } else if (source.method === 'google_cse') {
      const r = await searchGoogleCSE(keyword, source.domain, { limit: limitPerSource });
      results = r.results || [];
      if (r.error) error = r.error;
    }

    sourceStatus.push({ source: source.id, label: source.label, count: results.length, error });
    allResults.push(...results);
  }

  const deduped = dedupeByUrl(allResults);

  return {
    keyword,
    country: normalizedCountry,
    totalFound: deduped.length,
    results: deduped,
    sourceStatus,
    warnings: sourceStatus.filter((s) => s.error).map((s) => `⚠️ ${s.label}: ${s.error}`),
  };
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    try {
      const u = new URL(item.url);
      const key = u.origin + u.pathname;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch { return false; }
  });
}

// Helper to list countries for the frontend
export function listSupportedCountries() {
  return Object.keys(QA_SOURCES_BY_COUNTRY).map((code) => ({
    code,
    name: code.toUpperCase(), // Replace with a full name map if needed
    region: 'Global',
    sources: QA_SOURCES_BY_COUNTRY[code].map((s) => s.label),
  }));
}