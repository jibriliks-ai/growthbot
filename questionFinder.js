// ============================================================
// Auto Traffic Engine — Question Finder
// v3.1 — 60 countries + Reddit proxy fallback + better logging
// ============================================================
import axios from 'axios';

// ============================================================
// COUNTRY → SOURCES MAP (60 countries)
// ============================================================
export const QA_SOURCES_BY_COUNTRY = {
  // ---- GLOBAL ----
  global: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],

  // ---- NORTH AMERICA ----
  us: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],
  ca: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  mx: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- EUROPE ----
  gb: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'moneysavingexpert', label: 'MoneySavingExpert', domain: 'moneysavingexpert.com', method: 'google_cse' },
  ],
  ie: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'boards', label: 'Boards.ie', domain: 'boards.ie', method: 'google_cse' },
  ],
  de: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'gutefrage', label: 'Gutefrage.net', domain: 'gutefrage.net', method: 'google_cse' },
  ],
  fr: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  es: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  it: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  nl: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'fok', label: 'FOK.nl', domain: 'fok.nl', method: 'google_cse' },
  ],
  be: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  at: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ch: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  se: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'flashback', label: 'Flashback.org', domain: 'flashback.org', method: 'google_cse' },
  ],
  no: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'diskusjon', label: 'Diskusjon.no', domain: 'diskusjon.no', method: 'google_cse' },
  ],
  dk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  fi: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'vauva', label: 'Vauva.fi', domain: 'vauva.fi', method: 'google_cse' },
  ],
  pl: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'wykop', label: 'Wykop.pl', domain: 'wykop.pl', method: 'google_cse' },
  ],
  pt: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  gr: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  cz: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ro: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- AFRICA ----
  ng: [
    { id: 'nairaland', label: 'Nairaland', domain: 'nairaland.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ke: [
    { id: 'kenyatalk', label: 'KenyaTalk', domain: 'kenyatalk.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  gh: [
    { id: 'ghanaweb', label: 'GhanaWeb', domain: 'ghanaweb.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  za: [
    { id: 'mybroadband', label: 'MyBroadband', domain: 'mybroadband.co.za', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  eg: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ma: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tn: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  dz: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  et: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tz: [
    { id: 'jamiiforums', label: 'JamiiForums', domain: 'jamiiforums.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  ug: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- ASIA ----
  in: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'google_cse' },
  ],
  pk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  bd: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  lk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  id: [
    { id: 'kaskus', label: 'Kaskus', domain: 'kaskus.co.id', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  my: [
    { id: 'lowyat', label: 'Lowyat.NET', domain: 'lowyat.net', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  sg: [
    { id: 'hardwarezone', label: 'HardwareZone', domain: 'hardwarezone.com.sg', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  ph: [
    { id: 'pinoyexchange', label: 'PinoyExchange', domain: 'pinoyexchange.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  th: [
    { id: 'pantip', label: 'Pantip', domain: 'pantip.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  vn: [
    { id: 'tinhte', label: 'Tinhte.vn', domain: 'tinhte.vn', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  jp: [
    { id: 'chiebukuro', label: 'Yahoo Chiebukuro', domain: 'chiebukuro.yahoo.co.jp', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  kr: [
    { id: 'kin', label: 'Naver Knowledge iN', domain: 'kin.naver.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  cn: [
    { id: 'zhihu', label: 'Zhihu', domain: 'zhihu.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  hk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tw: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- MIDDLE EAST ----
  ae: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  sa: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  il: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tr: [
    { id: 'kizlarsoruyor', label: 'KizlarSoruyor', domain: 'kizlarsoruyor.com', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],

  // ---- LATIN AMERICA ----
  br: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ar: [
    { id: 'taringa', label: 'Taringa', domain: 'taringa.net', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
  ],
  cl: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  co: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  pe: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ve: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- OCEANIA ----
  au: [
    { id: 'whirlpool', label: 'Whirlpool Forums', domain: 'whirlpool.net.au', method: 'google_cse' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  nz: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
};

// ============================================================
// REGION MAP
// ============================================================
const REGION_MAP = {
  global: 'Global',
  us: 'North America', ca: 'North America', mx: 'North America',
  gb: 'Europe', ie: 'Europe', de: 'Europe', fr: 'Europe', es: 'Europe',
  it: 'Europe', nl: 'Europe', be: 'Europe', at: 'Europe', ch: 'Europe',
  se: 'Europe', no: 'Europe', dk: 'Europe', fi: 'Europe', pl: 'Europe',
  pt: 'Europe', gr: 'Europe', cz: 'Europe', ro: 'Europe',
  ng: 'Africa', ke: 'Africa', gh: 'Africa', za: 'Africa', eg: 'Africa',
  ma: 'Africa', tn: 'Africa', dz: 'Africa', et: 'Africa', tz: 'Africa',
  ug: 'Africa',
  in: 'Asia', pk: 'Asia', bd: 'Asia', lk: 'Asia', id: 'Asia', my: 'Asia',
  sg: 'Asia', ph: 'Asia', th: 'Asia', vn: 'Asia', jp: 'Asia', kr: 'Asia',
  cn: 'Asia', hk: 'Asia', tw: 'Asia',
  ae: 'Middle East', sa: 'Middle East', il: 'Middle East', tr: 'Middle East',
  br: 'Latin America', ar: 'Latin America', cl: 'Latin America',
  co: 'Latin America', pe: 'Latin America', ve: 'Latin America',
  au: 'Oceania', nz: 'Oceania',
};

const MANUAL_NAMES = {
  global: 'Global',
  us: 'United States', ca: 'Canada', mx: 'Mexico',
  gb: 'United Kingdom', ie: 'Ireland', de: 'Germany', fr: 'France',
  es: 'Spain', it: 'Italy', nl: 'Netherlands', be: 'Belgium',
  at: 'Austria', ch: 'Switzerland', se: 'Sweden', no: 'Norway',
  dk: 'Denmark', fi: 'Finland', pl: 'Poland', pt: 'Portugal',
  gr: 'Greece', cz: 'Czech Republic', ro: 'Romania',
  ng: 'Nigeria', ke: 'Kenya', gh: 'Ghana', za: 'South Africa',
  eg: 'Egypt', ma: 'Morocco', tn: 'Tunisia', dz: 'Algeria',
  et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda',
  in: 'India', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka',
  id: 'Indonesia', my: 'Malaysia', sg: 'Singapore', ph: 'Philippines',
  th: 'Thailand', vn: 'Vietnam', jp: 'Japan', kr: 'South Korea',
  cn: 'China', hk: 'Hong Kong', tw: 'Taiwan',
  ae: 'United Arab Emirates', sa: 'Saudi Arabia', il: 'Israel', tr: 'Turkey',
  br: 'Brazil', ar: 'Argentina', cl: 'Chile', co: 'Colombia',
  pe: 'Peru', ve: 'Venezuela',
  au: 'Australia', nz: 'New Zealand',
};

function getCountryName(code) {
  return MANUAL_NAMES[code] || code.toUpperCase();
}

export function listSupportedCountries() {
  return Object.keys(QA_SOURCES_BY_COUNTRY).map((code) => ({
    code,
    name: getCountryName(code),
    region: REGION_MAP[code] || 'Other',
    sources: QA_SOURCES_BY_COUNTRY[code].map((s) => s.label),
  }));
}

// ============================================================
// REDDIT FETCHER — Multi-strategy (direct → allorigins → corsproxy)
// ============================================================
async function searchReddit(keyword, { limit = 25, sort = 'relevance' } = {}) {
  const redditPath = `search.json?q=${encodeURIComponent(keyword)}&sort=${sort}&limit=${limit}&t=year`;
  const directUrl = `https://www.reddit.com/${redditPath}`;

  // Strategy 1: Direct (works from residential IPs, sometimes from Render)
  try {
    const res = await axios.get(directUrl, {
      headers: { 'User-Agent': 'AutoTrafficEngine/3.1 (research)' },
      timeout: 10_000,
      validateStatus: (s) => s === 200,
    });
    if (res.data?.data?.children) {
      console.log('[questionFinder] ✅ Reddit: direct success');
      return parseRedditChildren(res.data.data.children);
    }
  } catch (e) {
    console.log('[questionFinder] ⚠️ Reddit direct failed:', e.response?.status || e.message);
  }

  // Strategy 2: allorigins.win proxy (residential exit nodes)
  try {
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
    const res = await axios.get(proxied, { timeout: 20_000 });
    let data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch {}
    }
    if (data?.data?.children) {
      console.log('[questionFinder] ✅ Reddit: allorigins proxy success');
      return parseRedditChildren(data.data.children);
    }
  } catch (e) {
    console.log('[questionFinder] ⚠️ Reddit allorigins failed:', e.message);
  }

  // Strategy 3: corsproxy.io (alternative residential proxy)
  try {
    const proxied = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
    const res = await axios.get(proxied, { timeout: 20_000 });
    let data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch {}
    }
    if (data?.data?.children) {
      console.log('[questionFinder] ✅ Reddit: corsproxy success');
      return parseRedditChildren(data.data.children);
    }
  } catch (e) {
    console.log('[questionFinder] ⚠️ Reddit corsproxy failed:', e.message);
  }

  // Strategy 4: Old Reddit domain (sometimes not blocked)
  try {
    const oldRedditUrl = `https://old.reddit.com/${redditPath}`;
    const res = await axios.get(oldRedditUrl, {
      headers: { 'User-Agent': 'AutoTrafficEngine/3.1' },
      timeout: 12_000,
      validateStatus: (s) => s === 200,
    });
    if (res.data?.data?.children) {
      console.log('[questionFinder] ✅ Reddit: old.reddit success');
      return parseRedditChildren(res.data.data.children);
    }
  } catch (e) {
    console.log('[questionFinder] ⚠️ Reddit old.reddit failed:', e.message);
  }

  console.warn('[questionFinder] ❌ All Reddit strategies failed for:', keyword);
  return [];
}

function parseRedditChildren(children) {
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
}

// ============================================================
// GOOGLE CUSTOM SEARCH
// ============================================================
async function searchGoogleCSE(keyword, siteDomain, { limit = 10 } = {}) {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cx) {
    const err = 'GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID not configured on server';
    console.warn('[questionFinder] ❌ ' + err);
    return { error: err, results: [] };
  }

  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q: `${keyword} site:${siteDomain}`,
        num: Math.min(limit, 10),
      },
      timeout: 15_000,
    });
    const items = res.data?.items || [];
    console.log(`[questionFinder] ✅ Google CSE ${siteDomain}: ${items.length} results`);
    return {
      results: items.map((i) => ({
        source: siteDomain,
        title: i.title,
        url: i.link,
        snippet: i.snippet || '',
      })),
    };
  } catch (e) {
    const status = e.response?.status;
    const errMsg = e.response?.data?.error?.message || e.message;
    console.warn(`[questionFinder] ❌ Google CSE ${siteDomain} failed [${status}]:`, errMsg);
    return { error: `[${status}] ${errMsg}`, results: [] };
  }
}

// ============================================================
// HELPERS
// ============================================================
function dedupeByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    try {
      const u = new URL(item.url);
      const key = u.origin + u.pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    } catch {}
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
  sources = null,
} = {}) {
  if (!keyword || keyword.trim().length < 3) {
    throw new Error('Keyword must be at least 3 characters');
  }

  const normalizedCountry = String(country).toLowerCase();
  const countrySources = QA_SOURCES_BY_COUNTRY[normalizedCountry] || QA_SOURCES_BY_COUNTRY.global;
  const activeSources = sources ? countrySources.filter((s) => sources.includes(s.id)) : countrySources;

  console.log(`[questionFinder] 🔍 Searching "${keyword}" in ${normalizedCountry} (${activeSources.length} sources)`);

  const allResults = [];
  const sourceStatus = [];

  for (const source of activeSources) {
    let results = [];
    let error = null;

    if (source.method === 'reddit_api') {
      results = await searchReddit(keyword, { limit: limitPerSource });
    } else if (source.method === 'google_cse') {
      const r = await searchGoogleCSE(keyword, source.domain, { limit: limitPerSource });
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
  deduped.sort((a, b) => {
    if (a.postedAt && b.postedAt) return new Date(b.postedAt) - new Date(a.postedAt);
    return 0;
  });

  console.log(`[questionFinder] 📊 Total found: ${deduped.length}`);

  return {
    keyword,
    country: normalizedCountry,
    totalFound: deduped.length,
    results: deduped,
    sourceStatus,
    warnings: sourceStatus.filter((s) => s.error).map((s) => `⚠️ ${s.label}: ${s.error}`),
  };
}

export default { findQuestions, listSupportedCountries, QA_SOURCES_BY_COUNTRY };