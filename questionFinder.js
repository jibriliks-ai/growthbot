// questionFinder.js — v6.1
// Playwright scrapes Quora + Reddit. DuckDuckGo fallback for forums.
// No API keys required.
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

// ============================================================
// COUNTRY → SOURCES (60 countries, Quora default everywhere)
// ============================================================
export const QA_SOURCES_BY_COUNTRY = {
  global: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
  ],
  us: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'ddg' },
  ],
  ca: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  mx: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  gb: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }, { id: 'mse', label: 'MoneySavingExpert', domain: 'moneysavingexpert.com', method: 'ddg' }],
  ie: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'boards', label: 'Boards.ie', domain: 'boards.ie', method: 'ddg' }],
  de: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'gutefrage', label: 'Gutefrage.net', domain: 'gutefrage.net', method: 'ddg' }],
  fr: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  es: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  it: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  nl: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  be: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  at: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ch: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  se: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  no: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  dk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  fi: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  pl: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  pt: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  gr: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  cz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ro: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ng: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'nairaland', label: 'Nairaland', domain: 'nairaland.com', method: 'ddg' },
  ],
  ke: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'kenyatalk', label: 'KenyaTalk', domain: 'kenyatalk.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  gh: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'ghanaweb', label: 'GhanaWeb', domain: 'ghanaweb.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  za: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'mybroadband', label: 'MyBroadband', domain: 'mybroadband.co.za', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  eg: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ma: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  tn: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  dz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  et: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  tz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'jamiiforums', label: 'JamiiForums', domain: 'jamiiforums.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ug: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  in: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'ddg' },
  ],
  pk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  bd: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  lk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  id: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'kaskus', label: 'Kaskus', domain: 'kaskus.co.id', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  my: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'lowyat', label: 'Lowyat.NET', domain: 'lowyat.net', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  sg: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'hardwarezone', label: 'HardwareZone', domain: 'hardwarezone.com.sg', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ph: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'pinoyexchange', label: 'PinoyExchange', domain: 'pinoyexchange.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  th: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'pantip', label: 'Pantip', domain: 'pantip.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  vn: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'tinhte', label: 'Tinhte.vn', domain: 'tinhte.vn', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  jp: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'chiebukuro', label: 'Yahoo Chiebukuro', domain: 'chiebukuro.yahoo.co.jp', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  kr: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'kin', label: 'Naver Knowledge iN', domain: 'kin.naver.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  cn: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'zhihu', label: 'Zhihu', domain: 'zhihu.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  hk: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  tw: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ae: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  sa: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  il: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  tr: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'kizlarsoruyor', label: 'KizlarSoruyor', domain: 'kizlarsoruyor.com', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  br: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ar: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'taringa', label: 'Taringa', domain: 'taringa.net', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  cl: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  co: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  pe: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  ve: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  au: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'whirlpool', label: 'Whirlpool Forums', domain: 'whirlpool.net.au', method: 'ddg' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
  nz: [{ id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' }, { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' }],
};

const COUNTRY_NAMES = {
  global: 'Global', us: 'United States', ca: 'Canada', mx: 'Mexico', gb: 'United Kingdom', ie: 'Ireland',
  de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy', nl: 'Netherlands', be: 'Belgium', at: 'Austria',
  ch: 'Switzerland', se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland', pl: 'Poland', pt: 'Portugal',
  gr: 'Greece', cz: 'Czech Republic', ro: 'Romania', ng: 'Nigeria', ke: 'Kenya', gh: 'Ghana', za: 'South Africa',
  eg: 'Egypt', ma: 'Morocco', tn: 'Tunisia', dz: 'Algeria', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda',
  in: 'India', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka', id: 'Indonesia', my: 'Malaysia',
  sg: 'Singapore', ph: 'Philippines', th: 'Thailand', vn: 'Vietnam', jp: 'Japan', kr: 'South Korea',
  cn: 'China', hk: 'Hong Kong', tw: 'Taiwan', ae: 'UAE', sa: 'Saudi Arabia', il: 'Israel', tr: 'Turkey',
  br: 'Brazil', ar: 'Argentina', cl: 'Chile', co: 'Colombia', pe: 'Peru', ve: 'Venezuela', au: 'Australia', nz: 'New Zealand',
};

export function listSupportedCountries() {
  return Object.keys(QA_SOURCES_BY_COUNTRY).map((code) => ({
    code,
    name: COUNTRY_NAMES[code] || code.toUpperCase(),
    sources: QA_SOURCES_BY_COUNTRY[code].map((s) => s.label),
  }));
}

// ============================================================
// BROWSER — singleton, sandbox disabled (Render requirement)
// ============================================================
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

// ============================================================
// QUORA SCRAPER
// ============================================================
async function scrapeQuora(keyword, limit = 10) {
  const browser = await getBrowser();
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const results = [];
  try {
    await page.goto(`https://www.quora.com/search?q=${encodeURIComponent(keyword)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    await page.waitForTimeout(3500);

    const items = await page.$$eval(
      'a[href*="/What-"], a[href*="/How-"], a[href*="/Why-"], a[href*="/When-"], a[href*="/Can-"]',
      (els) => els.map((el) => ({ title: el.innerText.trim(), url: el.href }))
    );

    const seen = new Set();
    for (const item of items) {
      if (results.length >= limit) break;
      const clean = item.url.split('?')[0];
      if (!item.title || item.title.length < 15 || seen.has(clean)) continue;
      seen.add(clean);
      results.push({ source: 'quora', title: item.title, url: clean, snippet: '' });
    }
    console.log(`✅ Quora: ${results.length} results for "${keyword}"`);
  } catch (e) {
    console.warn(`❌ Quora failed: ${e.message}`);
  } finally {
    await page.close();
  }
  return results;
}

// ============================================================
// REDDIT SCRAPER
// ============================================================
async function scrapeReddit(keyword, limit = 10) {
  const browser = await getBrowser();
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const results = [];
  try {
    await page.goto(`https://www.reddit.com/search/?q=${encodeURIComponent(keyword)}&type=link`, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    await page.waitForTimeout(3500);

    const items = await page.$$eval('a[data-testid="post-title"]', (els) =>
      els.map((el) => ({ title: el.innerText.trim(), url: el.href }))
    );

    const seen = new Set();
    for (const item of items) {
      if (results.length >= limit) break;
      if (!item.title || seen.has(item.url)) continue;
      seen.add(item.url);
      results.push({ source: 'reddit', title: item.title, url: item.url, snippet: '' });
    }
    console.log(`✅ Reddit: ${results.length} results for "${keyword}"`);
  } catch (e) {
    console.warn(`❌ Reddit failed: ${e.message}`);
  } finally {
    await page.close();
  }
  return results;
}

// ============================================================
// DUCKDUCKGO FALLBACK (for forums like Nairaland)
// ============================================================
async function searchDuckDuckGo(keyword, siteDomain, limit = 10) {
  try {
    const query = `site:${siteDomain} ${keyword}`;
    const res = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
      }
    );
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result').each((i, el) => {
      if (results.length >= limit) return false;
      const titleEl = $(el).find('.result__a');
      const urlEl = $(el).find('.result__url').attr('href');
      if (titleEl.length && urlEl) {
        results.push({
          source: siteDomain,
          title: titleEl.text().trim(),
          url: urlEl,
          snippet: '',
        });
      }
    });
    console.log(`✅ DDG ${siteDomain}: ${results.length} results`);
    return results;
  } catch (e) {
    console.warn(`❌ DDG ${siteDomain} failed: ${e.message}`);
    return [];
  }
}

// ============================================================
// MAIN
// ============================================================
export async function findQuestions({ keyword, country = 'ng', limitPerSource = 10 } = {}) {
  if (!keyword || keyword.trim().length < 3) {
    throw new Error('Keyword must be at least 3 characters');
  }

  const sources = QA_SOURCES_BY_COUNTRY[String(country).toLowerCase()] || QA_SOURCES_BY_COUNTRY.global;
  console.log(`🔍 Searching "${keyword}" in ${country} (${sources.length} sources)`);

  const allResults = [];
  const sourceStatus = [];

  for (const source of sources) {
    let results = [];
    let error = null;

    try {
      if (source.method === 'playwright') {
        if (source.domain === 'quora.com') {
          results = await scrapeQuora(keyword, limitPerSource);
        } else if (source.domain === 'reddit.com') {
          results = await scrapeReddit(keyword, limitPerSource);
        }
      } else if (source.method === 'ddg') {
        results = await searchDuckDuckGo(keyword, source.domain, limitPerSource);
      }
    } catch (e) {
      error = e.message;
    }

    sourceStatus.push({
      source: source.id,
      label: source.label,
      count: results.length,
      error,
    });
    allResults.push(...results);
  }

  // Dedupe
  const seen = new Set();
  const deduped = [];
  for (const item of allResults) {
    try {
      const u = new URL(item.url);
      const key = u.origin + u.pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    } catch {}
  }

  console.log(`📊 Total found: ${deduped.length}`);
  return {
    keyword,
    country,
    totalFound: deduped.length,
    results: deduped,
    sourceStatus,
    warnings: sourceStatus.filter((s) => s.error).map((s) => `⚠️ ${s.label}: ${s.error}`),
  };
}

export default { findQuestions, listSupportedCountries, QA_SOURCES_BY_COUNTRY };