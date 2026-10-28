// duckduckgoSearch.js
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function searchDuckDuckGo(keyword, siteDomain, { limit = 10 } = {}) {
  try {
    // Combine the keyword with a site-specific search operator
    const query = `site:${siteDomain} ${keyword}`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const res = await axios.get(url, {
      headers: {
        // A standard User-Agent helps prevent immediate blocking
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15_000,
    });

    const $ = cheerio.load(res.data);
    const results = [];

    // DuckDuckGo's HTML results are inside elements with the class 'result'
    $('.result').each((i, el) => {
      if (results.length >= limit) return false; // Stop when we have enough

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