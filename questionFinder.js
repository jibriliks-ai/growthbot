// questionFinder.js — v6.0 (Playwright scraping + DuckDuckGo fallback)
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

export const QA_SOURCES_BY_COUNTRY = {
  global: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
  ],
  us: [
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'duckduckgo' },
  ],
  ng: [
    { id: 'nairaland', label: 'Nairaland', domain: 'nairaland.com', method: 'duckduckgo' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'playwright' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
  ],
  // ... (add other countries — same pattern: quora + reddit always included)
};

// --- Playwright browser (reused across requests) ---
let browserInstance = null;
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

// --- Quora scraper ---
async function scrapeQuora(keyword, { limit = 10 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const results = [];
  try {
    await page.goto(`https://www.quora.com/search?q=${encodeURIComponent(keyword)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(3000); // let JS render

    const questions = await page.$$eval('a[href*="/What-"], a[href*="/How-"], a[href*="/Why-"]', (els) =>
      els.map((el) => ({
        title: el.innerText.trim(),
        url: el.href,
      })).filter((x) => x.title.length > 10 && x.url.includes('quora.com'))
    );

    const seen = new Set();
    for (const q of questions) {
      if (results.length >= limit) break;
      const cleanUrl = q.url.split('?')[0];
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);
      results.push({ source: 'quora', title: q.title, url: cleanUrl, snippet: '' });
    }
  } catch (e) {
    console.warn('Quora scrape failed:', e.message);
  } finally {
    await page.close();
  }
  return results;
}

// --- Reddit scraper ---
async function scrapeReddit(keyword, { limit = 10 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const results = [];
  try {
    await page.goto(`https://www.reddit.com/search/?q=${encodeURIComponent(keyword)}&type=link`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(3000);

    const posts = await page.$$eval('a[data-testid="post-title"]', (els) =>
      els.map((el) => ({
        title: el.innerText.trim(),
        url: el.href,
      }))
    );

    for (const p of posts.slice(0, limit)) {
      results.push({ source: 'reddit', title: p.title, url: p.url, snippet: '' });
    }
  } catch (e) {
    console.warn('Reddit scrape failed:', e.message);
  } finally {
    await page.close();
  }
  return results;
}

// --- DuckDuckGo fallback (for sites like Nairaland) ---
async function searchDuckDuckGo(keyword, siteDomain, { limit = 10 } = {}) {
  try {
    const query = `site:${siteDomain} ${keyword}`;
    const res = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result').each((i, el) => {
      if (results.length >= limit) return false;
      const titleEl = $(el).find('.result__a');
      const urlEl = $(el).find('.result__url').attr('href');
      if (titleEl.length && urlEl) {
        results.push({ source: siteDomain, title: titleEl.text().trim(), url: urlEl, snippet: '' });
      }
    });
    return results;
  } catch (e) {
    console.warn('DDG failed:', e.message);
    return [];
  }
}

// --- Main ---
export async function findQuestions({ keyword, country = 'ng', limitPerSource = 10 } = {}) {
  if (!keyword || keyword.trim().length < 3) throw new Error('Keyword must be at least 3 characters');
  const sources = QA_SOURCES_BY_COUNTRY[String(country).toLowerCase()] || QA_SOURCES_BY_COUNTRY.global;

  const allResults = [];
  const sourceStatus = [];

  for (const source of sources) {
    let results = [];
    try {
      if (source.method === 'playwright' && source.domain === 'quora.com') {
        results = await scrapeQuora(keyword, { limit: limitPerSource });
      } else if (source.method === 'playwright' && source.domain === 'reddit.com') {
        results = await scrapeReddit(keyword, { limit: limitPerSource });
      } else {
        results = await searchDuckDuckGo(keyword, source.domain, { limit: limitPerSource });
      }
      sourceStatus.push({ source: source.id, label: source.label, count: results.length, error: null });
    } catch (e) {
      sourceStatus.push({ source: source.id, label: source.label, count: 0, error: e.message });
    }
    allResults.push(...results);
  }

  // dedupe
  const seen = new Set();
  const deduped = allResults.filter((item) => {
    try {
      const u = new URL(item.url);
      const key = u.origin + u.pathname;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch { return false; }
  });

  return {
    keyword,
    country,
    totalFound: deduped.length,
    results: deduped,
    sourceStatus,
    warnings: sourceStatus.filter((s) => s.error).map((s) => `⚠️ ${s.label}: ${s.error}`),
  };
}

export function listSupportedCountries() {
  return Object.keys(QA_SOURCES_BY_COUNTRY).map((code) => ({
    code,
    name: code.toUpperCase(),
    region: 'Global',
    sources: QA_SOURCES_BY_COUNTRY[code].map((s) => s.label),
  }));
}

export default { findQuestions, listSupportedCountries, QA_SOURCES_BY_COUNTRY };