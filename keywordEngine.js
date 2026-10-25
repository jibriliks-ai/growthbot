// ============================================================
// GrowthBot — Keyword analysis engine
// ============================================================
// Two modes, identical output shape so callers don't care:
//
//   FREE  — Google Autocomplete expansion + on-page scoring.
//           No API key. No volume/CPC/difficulty. Labelled "estimated".
//   PRO   — DataForSEO Google Ads Search Volume (real volume/CPC/competition).
//
// Never blends the two silently — the response always carries an
// `honestNote` field telling the user which data they're looking at.
// ============================================================
import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================
// CONSTANTS
// ============================================================
const AUTocomplete_ENDPOINT =
  'https://suggestqueries.google.com/complete/search';

const DATAFORSEO_ENDPOINT =
  'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';

const INTENT_KEYWORDS = {
  transactional: [
    'buy', 'price', 'cost', 'cheap', 'order', 'purchase', 'sale',
    'discount', 'deal', 'offer', 'subscribe', 'download', 'hire', 'book',
    'pay', 'pricing', 'checkout', 'shop',
  ],
  commercial: [
    'best', 'top', 'review', 'vs', 'compare', 'alternative', 'rating',
    'recommendation', 'worth', 'legit', 'scam',
  ],
  informational: [
    'how', 'what', 'why', 'when', 'where', 'guide', 'tutorial',
    'learn', 'tips', 'ideas', 'meaning', 'definition', 'example',
  ],
  navigational: [
    'login', 'sign in', 'app', 'official', 'portal', 'website',
    'contact', 'customer service', 'download app',
  ],
};

const INTENT_WEIGHTS = {
  transactional: 1.6,
  commercial: 1.3,
  informational: 1.0,
  navigational: 0.7,
};

const COUNTRY_NAMES = {
  ng: 'Nigeria',
  us: 'United States',
  gb: 'United Kingdom',
  ke: 'Kenya',
  gh: 'Ghana',
  za: 'South Africa',
  ca: 'Canada',
  au: 'Australia',
  in: 'India',
};

// Default expansion prefixes — kept small to stay polite to Google
const DEFAULT_EXPANSIONS = ['', 'how to ', 'best ', 'cheap '];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'of', 'to', 'is', 'it', 'and', 'or',
  'for', 'with', 'how', 'what', 'why', 'when', 'where', 'at', 'by',
  'from', 'as', 'be', 'this', 'that', 'these', 'those', 'my', 'your',
]);

// ============================================================
// HELPERS
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clean(str) {
  return String(str ?? '').replace(/\s+/g, ' ').trim();
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function countryToLocationName(code) {
  return COUNTRY_NAMES[String(code || 'us').toLowerCase()] || COUNTRY_NAMES.us;
}

// ============================================================
// INTENT CLASSIFICATION
// ============================================================
export function detectIntent(keyword) {
  const k = String(keyword).toLowerCase();
  for (const [intent, words] of Object.entries(INTENT_KEYWORDS)) {
    if (words.some((w) => k.includes(w))) return intent;
  }
  return 'informational';
}

// ============================================================
// GOOGLE AUTOCOMPLETE (free)
// ============================================================
export async function fetchAutocomplete(
  seed,
  { country = 'ng', language = 'en', timeout = 8000 } = {}
) {
  const url =
    `${AUTocomplete_ENDPOINT}?client=firefox` +
    `&hl=${encodeURIComponent(language)}` +
    `&gl=${encodeURIComponent(country)}` +
    `&q=${encodeURIComponent(seed)}`;

  try {
    const res = await axios.get(url, {
      timeout,
      responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0 (GrowthBot/3.0)' },
      validateStatus: (s) => s === 200,
    });

    // The API returns JSON: [query, [suggestions], ...]
    let data;
    if (typeof res.data === 'string') {
      try {
        data = JSON.parse(res.data);
      } catch {
        return [];
      }
    } else {
      data = res.data;
    }

    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return data[1].map((s) => String(s).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ============================================================
// DATAFORSEO (paid, optional)
// ============================================================
async function fetchDataForSEO(
  keywords,
  { login, password, country = 'ng', language = 'en', timeout = 30_000 }
) {
  if (!login || !password || keywords.length === 0) return new Map();

  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  // Free trial allows 100 keywords/request; paid allows more.
  const batch = keywords.slice(0, 700);

  const payload = [
    {
      keywords: batch,
      location_name: countryToLocationName(country),
      language_code: language,
      search_partners: false,
    },
  ];

  try {
    const res = await axios.post(DATAFORSEO_ENDPOINT, payload, {
      timeout,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    const list = res.data?.tasks?.[0]?.result?.[0]?.keywords || [];
    const map = new Map();
    for (const item of list) {
      if (!item.keyword) continue;
      map.set(item.keyword, {
        volume: item.search_volume ?? null,
        cpc: item.cpc ?? null,
        difficulty:
          item.competition_index ?? item.keyword_difficulty ?? null,
        competition: item.competition ?? null,
      });
    }
    return map;
  } catch (e) {
    console.error(
      '⚠️ DataForSEO failed:',
      e.response?.data?.status_message || e.message
    );
    return new Map();
  }
}

// ============================================================
// ON-PAGE ANALYSIS
// ============================================================
export async function analyzeOnPage(url, keywords) {
  let $;
  let html;
  try {
    const res = await axios.get(url, {
      timeout: 12_000,
      headers: { 'User-Agent': 'GrowthBot/3.0 (+https://growthbot.app)' },
      maxContentLength: 5_000_000,
    });
    html = res.data;
    $ = cheerio.load(html);
  } catch {
    return new Map();
  }

  const title = $('title').first().text().toLowerCase();
  const metaDesc = ($('meta[name="description"]').attr('content') || '').toLowerCase();
  const h1 = $('h1').text().toLowerCase();
  const h2 = $('h2').text().toLowerCase();
  const bodyLower = $('body').text().replace(/\s+/g, ' ').toLowerCase();
  const totalWords = bodyLower.split(/\s+/).length || 1;
  const urlLower = url.toLowerCase();

  const results = new Map();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const words = kwLower.split(/\s+/).length;
    const occurrences = countOccurrences(bodyLower, kwLower);
    const density = (occurrences * words) / totalWords * 100;

    const inTitle = title.includes(kwLower);
    const inMeta = metaDesc.includes(kwLower);
    const inH1 = h1.includes(kwLower);
    const inH2 = h2.includes(kwLower);
    const inUrl = urlLower.includes(kwLower.replace(/\s+/g, '-'));

    let score = 0;
    if (inTitle) score += 20;
    if (inH1) score += 15;
    if (inMeta) score += 10;
    if (inH2) score += 10;
    if (inUrl) score += 10;
    if (occurrences >= 2) score += 15;
    else if (occurrences === 1) score += 8;
    if (density >= 0.5 && density <= 2.5) score += 20;
    else if (density > 0 && density < 0.5) score += 8;

    results.set(kw, {
      inTitle,
      inMeta,
      inH1,
      inH2,
      inUrl,
      occurrences,
      density: Math.round(density * 100) / 100,
      score: Math.min(score, 100),
    });
  }

  return results;
}

// ============================================================
// OPPORTUNITY SCORING
// ============================================================
function scoreKeyword({ intent, df, onPage, autocompletePosition }) {
  const intentWeight = INTENT_WEIGHTS[intent] || 1.0;

  if (df && df.volume !== null && df.volume !== undefined) {
    // PRO mode — real data
    const volumeScore = Math.min(50, (Math.log10(df.volume + 1) / 5) * 50);
    const difficultyPenalty =
      df.difficulty !== null ? (100 - df.difficulty) * 0.25 : 12.5;
    const intentScore = intentWeight * 15;
    const onPageBonus = onPage ? (onPage.score / 100) * 10 : 0;
    return Math.min(
      100,
      Math.round(volumeScore + difficultyPenalty + intentScore + onPageBonus)
    );
  }

  // FREE mode — proxy score, honestly labelled "estimated"
  const positionScore = autocompletePosition
    ? Math.max(0, 25 - autocompletePosition * 2)
    : 10;
  const intentScore = intentWeight * 15;
  const onPageBonus = onPage ? (onPage.score / 100) * 20 : 0;
  return Math.min(100, Math.round(25 + positionScore + intentScore + onPageBonus));
}

// ============================================================
// CLUSTERING (union-find on Jaccard similarity)
// ============================================================
function tokenize(str) {
  return new Set(
    String(str)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function clusterKeywords(keywords, threshold = 0.5) {
  if (keywords.length === 0) return [];

  const parent = {};
  for (const k of keywords) parent[k.keyword] = k.keyword;

  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const tokenSets = new Map();
  for (const k of keywords) tokenSets.set(k.keyword, tokenize(k.keyword));

  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length; j++) {
      const a = tokenSets.get(keywords[i].keyword);
      const b = tokenSets.get(keywords[j].keyword);
      if (jaccard(a, b) >= threshold) {
        union(keywords[i].keyword, keywords[j].keyword);
      }
    }
  }

  const groups = new Map();
  for (const k of keywords) {
    const root = find(k.keyword);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(k);
  }

  const clusters = [];
  for (const [, members] of groups) {
    const label = members.reduce((a, b) =>
      a.keyword.length <= b.keyword.length ? a : b
    ).keyword;
    clusters.push({
      label,
      size: members.length,
      keywords: members.map((m) => m.keyword),
      avgOpportunity: Math.round(
        members.reduce((s, m) => s + m.opportunityScore, 0) / members.length
      ),
    });
  }
  return clusters.sort((a, b) => b.size - a.size);
}

// ============================================================
// SUMMARY
// ============================================================
function buildSummary(keywords) {
  const intentDistribution = {};
  let densitySum = 0;
  let densityCount = 0;
  let highOpportunity = 0;

  for (const k of keywords) {
    intentDistribution[k.intent] = (intentDistribution[k.intent] || 0) + 1;
    if (k.onPage) {
      densitySum += k.onPage.density;
      densityCount++;
    }
    if (k.opportunityScore >= 70) highOpportunity++;
  }

  return {
    total: keywords.length,
    highOpportunity,
    avgDensity:
      densityCount > 0
        ? Math.round((densitySum / densityCount) * 100) / 100
        : null,
    intentDistribution,
  };
}

// ============================================================
// MAIN API
// ============================================================
export async function analyzeKeywords({
  seeds = [],
  manualKeywords = [],
  url = null,
  country = 'ng',
  language = 'en',
  dataForSeo = null,      // { login, password } or null
  maxPerQuery = 15,       // cap autocomplete results per query
  expansions = DEFAULT_EXPANSIONS,
  throttleMs = 250,       // polite delay between Google calls
} = {}) {
  if ((!seeds || seeds.length === 0) && (!manualKeywords || manualKeywords.length === 0)) {
    throw new Error('Provide at least one seed or manual keyword');
  }

  // ---- Step 1: expand seeds via autocomplete ----
  const seen = new Map(); // keyword → { source, position, seed }

  for (const seed of seeds) {
    const base = clean(seed);
    if (!base) continue;

    for (const prefix of expansions) {
      const query = `${prefix}${base}`.trim();
      const suggestions = await fetchAutocomplete(query, { country, language });

      suggestions.slice(0, maxPerQuery).forEach((kw, idx) => {
        if (!seen.has(kw)) {
          seen.set(kw, {
            source: 'autocomplete',
            position: idx + 1,
            seed: base,
          });
        }
      });

      if (throttleMs > 0) await sleep(throttleMs);
    }
  }

  // ---- Step 1b: merge manual keywords (bypass network entirely) ----
  manualKeywords.forEach((kw, idx) => {
    const c = clean(kw);
    if (c && !seen.has(c)) {
      seen.set(c, { source: 'manual', position: idx + 1, seed: 'manual' });
    }
  });

  const allKeywords = Array.from(seen.keys());

  // ---- Step 2: real volume (if configured) ----
  let volumeMap = new Map();
  if (dataForSeo?.login && dataForSeo?.password && allKeywords.length > 0) {
    volumeMap = await fetchDataForSEO(allKeywords, {
      ...dataForSeo,
      country,
      language,
    });
  }

  // ---- Step 3: on-page scoring ----
  let onPageMap = new Map();
  if (url && allKeywords.length > 0) {
    onPageMap = await analyzeOnPage(url, allKeywords);
  }

  // ---- Step 4: score every keyword ----
  const scored = [];
  for (const kw of allKeywords) {
    const meta = seen.get(kw);
    const df = volumeMap.get(kw) || null;
    const onPage = onPageMap.get(kw) || null;
    const intent = detectIntent(kw);

    scored.push({
      keyword: kw,
      intent,
      volume: df?.volume ?? null,
      cpc: df?.cpc ?? null,
      difficulty: df?.difficulty ?? null,
      competition: df?.competition ?? null,
      onPage,
      opportunityScore: scoreKeyword({
        intent,
        df,
        onPage,
        autocompletePosition: meta.position,
      }),
      source: df ? 'dataforseo+autocomplete' : meta.source,
      seed: meta.seed,
    });
  }

  // ---- Step 5: cluster + summary ----
  const clusters = clusterKeywords(scored);
  const summary = buildSummary(scored);

  return {
    seeds,
    url,
    country,
    language,
    dataSource: volumeMap.size > 0 ? 'dataforseo' : 'autocomplete-only',
    totalKeywords: scored.length,
    keywords: scored.sort((a, b) => b.opportunityScore - a.opportunityScore),
    clusters,
    summary,
    honestNote:
      volumeMap.size > 0
        ? 'Volume, CPC, and difficulty from DataForSEO. Opportunity score is real.'
        : 'NO volume/CPC data — DataForSEO is not configured. Opportunity scores are directional estimates based on autocomplete popularity, intent weight, and on-page fit. Do not present these as search volumes.',
  };
}

export default {
  detectIntent,
  fetchAutocomplete,
  analyzeOnPage,
  analyzeKeywords,
};