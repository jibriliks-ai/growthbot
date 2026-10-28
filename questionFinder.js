// ============================================================
// Auto Traffic Engine — Question Finder
// v5.1 — 60 countries, DuckDuckGo + Reddit proxies, Quora default
// ============================================================
import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================
// COUNTRY → SOURCES MAP (60 countries)
// Every country includes Quora by default.
// ============================================================
export const QA_SOURCES_BY_COUNTRY = {
  global: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  us: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }, { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'web_search' }],
  ca: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  mx: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  gb: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }, { id: 'moneysavingexpert', label: 'MoneySavingExpert', domain: 'moneysavingexpert.com', method: 'web_search' }],
  ie: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'boards', label: 'Boards.ie', domain: 'boards.ie', method: 'web_search' }],
  de: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'gutefrage', label: 'Gutefrage.net', domain: 'gutefrage.net', method: 'web_search' }],
  fr: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  es: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  it: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  nl: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  be: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  at: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ch: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  se: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  no: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  dk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  fi: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  pl: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  pt: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  gr: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  cz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ro: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ng: [{ id: 'nairaland', label: 'Nairaland', domain: 'nairaland.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ke: [{ id: 'kenyatalk', label: 'KenyaTalk', domain: 'kenyatalk.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  gh: [{ id: 'ghanaweb', label: 'GhanaWeb', domain: 'ghanaweb.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  za: [{ id: 'mybroadband', label: 'MyBroadband', domain: 'mybroadband.co.za', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  eg: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ma: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  tn: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  dz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  et: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  tz: [{ id: 'jamiiforums', label: 'JamiiForums', domain: 'jamiiforums.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ug: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  in: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }, { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'web_search' }],
  pk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  bd: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  lk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  id: [{ id: 'kaskus', label: 'Kaskus', domain: 'kaskus.co.id', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  my: [{ id: 'lowyat', label: 'Lowyat.NET', domain: 'lowyat.net', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  sg: [{ id: 'hardwarezone', label: 'HardwareZone', domain: 'hardwarezone.com.sg', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ph: [{ id: 'pinoyexchange', label: 'PinoyExchange', domain: 'pinoyexchange.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  th: [{ id: 'pantip', label: 'Pantip', domain: 'pantip.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  vn: [{ id: 'tinhte', label: 'Tinhte.vn', domain: 'tinhte.vn', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  jp: [{ id: 'chiebukuro', label: 'Yahoo Chiebukuro', domain: 'chiebukuro.yahoo.co.jp', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  kr: [{ id: 'kin', label: 'Naver Knowledge iN', domain: 'kin.naver.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  cn: [{ id: 'zhihu', label: 'Zhihu', domain: 'zhihu.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  hk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  tw: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ae: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  sa: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  il: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  tr: [{ id: 'kizlarsoruyor', label: 'KizlarSoruyor', domain: 'kizlarsoruyor.com', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  br: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ar: [{ id: 'taringa', label: 'Taringa', domain: 'taringa.net', method: 'web_search' }, { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  cl: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  co: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  pe: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  ve: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  au: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'whirlpool', label: 'Whirlpool Forums', domain: 'whirlpool.net.au', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
  nz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'web_search' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'reddit_api' }],
};

const REGION_MAP = {
  global: 'Global', us: 'North America', ca: 'North America', mx: 'North America',
  gb: 'Europe', ie: 'Europe', de: 'Europe', fr: 'Europe', es: 'Europe', it: 'Europe', nl: 'Europe', be: 'Europe', at: 'Europe', ch: 'Europe', se: 'Europe', no: 'Europe', dk: 'Europe', fi: 'Europe', pl: 'Europe', pt: 'Europe', gr: 'Europe', cz: 'Europe', ro: 'Europe',
  ng: 'Africa', ke: 'Africa', gh: 'Africa', za: 'Africa', eg: 'Africa', ma: 'Africa', tn: 'Africa', dz: 'Africa', et: 'Africa', tz: 'Africa', ug: 'Africa',
  in: 'Asia', pk: 'Asia', bd: 'Asia', lk: 'Asia', id: 'Asia', my: 'Asia', sg: 'Asia', ph: 'Asia', th: 'Asia', vn: 'Asia', jp: 'Asia', kr: 'Asia', cn: 'Asia', hk: 'Asia', tw: 'Asia',
  ae: 'Middle East', sa: 'Middle East', il: 'Middle East', tr: 'Middle East',
  br: 'Latin America', ar: 'Latin America', cl: 'Latin America', co: 'Latin America', pe: 'Latin America', ve: 'Latin America',
  au: 'Oceania', nz: 'Oceania',
};

const MANUAL_NAMES = {
  global: 'Global', us: 'United States', ca: 'Canada', mx: 'Mexico', gb: 'United Kingdom', ie: 'Ireland', de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy', nl: 'Netherlands', be: 'Belgium', at: 'Austria', ch: 'Switzerland', se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland', pl: 'Poland', pt: 'Portugal', gr: 'Greece', cz: 'Czech Republic', ro: 'Romania', ng: 'Nigeria', ke: 'Kenya', gh: 'Ghana', za: 'South Africa', eg: 'Egypt', ma: 'Morocco', tn: 'Tunisia', dz: 'Algeria', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', in: 'India', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka', id: 'Indonesia', my: 'Malaysia', sg: 'Singapore', ph: 'Philippines', th: 'Thailand', vn: 'Vietnam', jp: 'Japan', kr: 'South Korea', cn: 'China', hk: 'Hong Kong', tw: 'Taiwan', ae: 'United Arab Emirates', sa: 'Saudi Arabia', il: 'Israel', tr: 'Turkey', br: 'Brazil', ar: 'Argentina', cl: 'Chile', co: 'Colombia', pe: 'Peru', ve: 'Venezuela', au: 'Australia', nz: 'New Zealand',
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
// DUCKDUCKGO SEARCH (Free, No API Key)
// ============================================================
async function searchDuckDuckGo(keyword, siteDomain, { limit = 10 } = {}) {
  try {
    const query = `site:${siteDomain} ${keyword}`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15_000,
    });

    const $ = cheerio.load(res.data);
    const results = [];

    $('.result').each((i, el) => {
      if (results.length >= limit) return false;

      const titleEl = $(el).find('.result__a');
      const snippetEl = $(el).find('.result__snippet');
      const urlEl = $(el).find('.result__url').attr('href');

      if (titleEl.length && urlEl) {
        results.push({
          source: siteDomain,
          title: titleEl.text().trim(),
          url: urlEl,
          snippet: snippetEl.text().trim() || '',
        });
      }
    });

    console.log(`✅ DuckDuckGo ${siteDomain}: ${results.length} results`);
    return { results };
  } catch (e) {
    const status = e.response?.status;
    console.warn(`❌ DuckDuckGo ${siteDomain} failed [${status}]:`, e.message);
    return { error: `[${status}] ${e.message}`, results: [] };
  }
}

// ============================================================
// REDDIT — Multi-Strategy Fetch
// ============================================================
async function searchReddit(keyword, { limit = 25 } = {}) {
  const redditPath = `search.json?q=${encodeURIComponent(keyword)}&sort=relevance&limit=${limit}&t=year`;
  const directUrl = `https://www.reddit.com/${redditPath}`;

  try {
    const res = await axios.get(directUrl, {
      headers: { 'User-Agent': 'AutoTrafficEngine/5.1' },
      timeout: 10_000,
    });
    if (res.data?.data?.children) return parseReddit(res.data.data.children);
  } catch (e) { console.log('Reddit direct failed:', e.message); }

  try {
    const proxied = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
    const res = await axios.get(proxied, { timeout: 15_000 });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (data?.data?.children) return parseReddit(data.data.children);
  } catch (e) { console.log('Reddit corsproxy.io failed:', e.message); }

  try {
    const proxied = `https://api.cors.lol/?${encodeURIComponent(directUrl)}`;
    const res = await axios.get(proxied, { timeout: 15_000 });
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (data?.data?.children) return parseReddit(data.data.children);
  } catch (e) { console.log('Reddit cors.lol failed:', e.message); }

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
// UNIFIED SEARCH
// ============================================================
async function searchWeb(keyword, siteDomain, { limit = 10 } = {}) {
  return await searchDuckDuckGo(keyword, siteDomain, { limit });
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
    } else if (source.method === 'web_search') {
      const r = await searchWeb(keyword, source.domain, { limit: limitPerSource });
      results = r.results || [];
      if (r.error) error = r.error;
    }

    sourceStatus.push({ source: source.id, label: source.label, count: results.length, error });
    allResults.push(...results);
  }

  const deduped = dedupeByUrl(allResults);

  console.log(`📊 Total found: ${deduped.length}`);

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

export default { findQuestions, listSupportedCountries, QA_SOURCES_BY_COUNTRY };