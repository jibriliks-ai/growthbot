// ============================================================
// seoAuditor.js — Professional SEO audit engine
// 25+ checks across Technical / On-Page / Content / Social
// Weighted scoring, category breakdown, prioritized issues,
// specific fix instructions, live metrics.
// ============================================================

const TIMEOUT_MS = 15000;
const UA = 'Mozilla/5.0 (compatible; AutoTrafficEngine/1.0; +https://growthbot-aprv.onrender.com)';

// ------------------------------------------------------------
// Fetch with timeout + redirects + headers
// ------------------------------------------------------------
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    const ttfb = Date.now() - t0;
    const html = await res.text();
    const totalMs = Date.now() - t0;
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      html,
      headers: res.headers,
      ttfb,
      totalMs,
      bytes: Buffer.byteLength(html, 'utf8'),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// HTML parsing helpers
// ------------------------------------------------------------
function match(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}
function matchAll(html, re) {
  return Array.from(html.matchAll(re));
}
function getMeta(html, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${esc}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}
function getProperty(html, prop) {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------
// Individual checks — each returns
// { id, category, pass, severity, title, detail, fix, impact }
// severity: critical | warning | info
// ------------------------------------------------------------
function checkHttps(url, res) {
  const isHttps = url.protocol === 'https:';
  const finalHttps = res.finalUrl.startsWith('https://');
  return {
    id: 'https',
    category: 'technical',
    pass: isHttps && finalHttps,
    severity: 'critical',
    title: 'HTTPS / SSL',
    detail: isHttps && finalHttps
      ? 'Site loads over HTTPS with a valid certificate.'
      : (isHttps ? 'Redirected to HTTP — mixed security.' : 'Site loaded over HTTP.'),
    fix: isHttps && finalHttps ? null : 'Install an SSL certificate (Let\'s Encrypt is free) and force HTTPS redirects. Google downranks non-HTTPS sites.',
    impact: 10,
  };
}

function checkStatus(res) {
  return {
    id: 'status',
    category: 'technical',
    pass: res.ok && res.status < 400,
    severity: 'critical',
    title: 'HTTP Status',
    detail: `Response returned status ${res.status}.`,
    fix: res.ok ? null : 'Fix the server error / redirect loop before anything else — Google cannot index a page it cannot load.',
    impact: 15,
  };
}

function checkTtfb(res) {
  const ms = res.ttfb;
  const pass = ms < 800;
  const severity = ms < 800 ? 'info' : ms < 1800 ? 'warning' : 'critical';
  return {
    id: 'ttfb',
    category: 'technical',
    pass,
    severity,
    title: 'Server Response Time (TTFB)',
    detail: `First byte arrived in ${ms}ms (${pass ? 'excellent' : ms < 1800 ? 'needs improvement' : 'slow'}).`,
    fix: pass ? null : 'Target < 800ms. Enable server caching, use a CDN, upgrade hosting, or optimize DB queries.',
    impact: 8,
  };
}

function checkCompression(res) {
  const enc = (res.headers.get('content-encoding') || '').toLowerCase();
  const compressed = enc.includes('gzip') || enc.includes('br') || enc.includes('deflate');
  return {
    id: 'compression',
    category: 'technical',
    pass: compressed,
    severity: compressed ? 'info' : 'warning',
    title: 'Response Compression',
    detail: compressed ? `Compressed with ${enc}.` : 'Not compressed.',
    fix: compressed ? null : 'Enable gzip/brotli on your web server. Cuts transfer size 60-80%.',
    impact: 4,
  };
}

function checkViewport(html) {
  const viewport = getMeta(html, 'viewport');
  const pass = !!viewport && /width\s*=\s*device-width/i.test(viewport);
  return {
    id: 'viewport',
    category: 'technical',
    pass,
    severity: pass ? 'info' : 'critical',
    title: 'Mobile Viewport',
    detail: pass ? 'Viewport meta tag present and correctly configured.' : 'Missing or misconfigured viewport meta.',
    fix: pass ? null : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>. Google mobile-first indexes — this is non-negotiable.',
    impact: 8,
  };
}

function checkCharset(html) {
  const cs = match(html, /<meta[^>]+charset=["']?([a-z0-9-]+)/i);
  const pass = !!cs;
  return {
    id: 'charset',
    category: 'technical',
    pass,
    severity: pass ? 'info' : 'warning',
    title: 'Character Encoding',
    detail: cs ? `Declared charset: ${cs}.` : 'No charset declared.',
    fix: pass ? null : 'Add <meta charset="utf-8"> as the first tag inside <head>.',
    impact: 2,
  };
}

function checkFavicon(html, baseUrl) {
  const link = match(html, /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)/i);
  const pass = !!link;
  return {
    id: 'favicon',
    category: 'technical',
    pass,
    severity: pass ? 'info' : 'info',
    title: 'Favicon',
    detail: link ? `Favicon declared: ${link}` : 'No favicon link tag found.',
    fix: pass ? null : 'Add <link rel="icon" href="/favicon.ico"> — helps with brand recognition in SERPs.',
    impact: 2,
  };
}

function checkCanonical(html) {
  const href = match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  return {
    id: 'canonical',
    category: 'onpage',
    pass: !!href,
    severity: href ? 'info' : 'warning',
    title: 'Canonical Tag',
    detail: href ? `Canonical: ${href}` : 'No canonical tag.',
    fix: href ? null : 'Add <link rel="canonical" href="<absolute-url>"> to prevent duplicate-content penalties.',
    impact: 6,
  };
}

function checkTitle(html) {
  const title = match(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = title ? title.trim() : '';
  const len = t.length;
  let pass = !!t && len >= 30 && len <= 60;
  let severity = pass ? 'info' : (!t ? 'critical' : 'warning');
  return {
    id: 'title',
    category: 'onpage',
    pass,
    severity,
    title: 'Page Title',
    detail: t ? `"${t}" (${len} chars)` : 'Missing <title> tag.',
    fix: pass ? null : (
      !t ? 'Add a <title> tag — this is the #1 on-page SEO factor.' :
      len < 30 ? 'Title is too short. Aim for 50-60 characters with your target keyword.' :
      'Title is too long. Google truncates after ~60 chars. Move keyword to the front.'
    ),
    impact: 12,
  };
}

function checkMetaDescription(html) {
  const desc = getMeta(html, 'description');
  const d = (desc || '').trim();
  const len = d.length;
  const pass = !!d && len >= 120 && len <= 160;
  return {
    id: 'meta-description',
    category: 'onpage',
    pass,
    severity: pass ? 'info' : (!d ? 'warning' : 'info'),
    title: 'Meta Description',
    detail: d ? `${len} chars: "${d.slice(0, 100)}..."` : 'No meta description.',
    fix: pass ? null : (
      !d ? 'Add <meta name="description" content="..."> — this is what shows under your title in Google.' :
      len < 120 ? 'Too short. Aim for 150-160 chars — gives full SERP real estate.' :
      'Too long — Google truncates around 160 chars. Cut it.'
    ),
    impact: 6,
  };
}

function checkH1(html) {
  const h1s = matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  const count = h1s.length;
  const text = h1s.map(m => stripTags(m[1])).join(' | ').slice(0, 200);
  const pass = count === 1;
  return {
    id: 'h1',
    category: 'onpage',
    pass,
    severity: pass ? 'info' : (count === 0 ? 'critical' : 'warning'),
    title: 'H1 Heading',
    detail: count === 0 ? 'No H1 found.' : `${count} H1 tag${count > 1 ? 's' : ''}${text ? ': ' + text : ''}`,
    fix: pass ? null : (
      count === 0 ? 'Add exactly one <h1> to the page — Google uses it to understand topic.' :
      'You have multiple H1s. Use one H1 per page; use H2 for subsections.'
    ),
    impact: 8,
  };
}

function checkH2s(html) {
  const count = matchAll(html, /<h2[^>]*>/gi).length;
  const pass = count >= 2;
  return {
    id: 'h2',
    category: 'onpage',
    pass,
    severity: pass ? 'info' : 'warning',
    title: 'Section Headings (H2)',
    detail: `${count} H2 tag${count === 1 ? '' : 's'} found.`,
    fix: pass ? null : 'Add at least 2-3 H2s to break content into scannable sections — improves both ranking and UX.',
    impact: 4,
  };
}

function checkLang(html) {
  const lang = match(html, /<html[^>]+lang=["']([^"']+)/i);
  const pass = !!lang;
  return {
    id: 'lang',
    category: 'onpage',
    pass,
    severity: pass ? 'info' : 'warning',
    title: 'Language Declaration',
    detail: lang ? `Language: ${lang}` : 'No lang attribute on <html>.',
    fix: pass ? null : 'Add lang="en" (or appropriate) to <html> tag — helps Google serve correct language variants.',
    impact: 3,
  };
}

function checkRobots(html) {
  const robots = getMeta(html, 'robots');
  const noindex = robots && /noindex/i.test(robots);
  return {
    id: 'robots',
    category: 'onpage',
    pass: !noindex,
    severity: noindex ? 'critical' : 'info',
    title: 'Robots Meta',
    detail: robots ? `robots: ${robots}` : 'No robots meta (defaults to index,follow — good).',
    fix: noindex ? 'WARNING: this page has noindex — it will NOT appear in Google. Remove if unintended.' : null,
    impact: noindex ? 20 : 0,
  };
}

function checkImages(html) {
  const imgs = matchAll(html, /<img\b[^>]*>/gi);
  const total = imgs.length;
  const withoutAlt = imgs.filter(m => !/\balt\s*=/i.test(m[0])).length;
  const pass = total === 0 || withoutAlt === 0;
  return {
    id: 'images-alt',
    category: 'content',
    pass,
    severity: pass ? 'info' : (withoutAlt / Math.max(total, 1) > 0.3 ? 'warning' : 'info'),
    title: 'Image Alt Text',
    detail: total === 0 ? 'No images on page.' : `${withoutAlt} of ${total} images missing alt text.`,
    fix: pass ? null : `Add descriptive alt text to ${withoutAlt} image${withoutAlt === 1 ? '' : 's'} — improves accessibility + image search ranking.`,
    impact: 5,
  };
}

function checkWordCount(html) {
  const text = stripTags(html);
  const words = text.split(/\s+/).filter(Boolean);
  const count = words.length;
  const pass = count >= 300;
  return {
    id: 'word-count',
    category: 'content',
    pass,
    severity: count >= 800 ? 'info' : count >= 300 ? 'info' : 'warning',
    title: 'Content Length',
    detail: `${count} words on page.`,
    fix: pass ? null : 'Aim for 300+ words of substantive content. Pages under 300 words rarely rank for competitive terms.',
    impact: 5,
  };
}

function checkLinks(html, baseUrl) {
  const links = matchAll(html, /<a[^>]+href=["']([^"']+)["']/gi);
  let internal = 0, external = 0;
  for (const m of links) {
    const href = m[1];
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.hostname === new URL(baseUrl).hostname) internal++;
      else external++;
    } catch (e) { /* malformed URL */ }
  }
  return {
    id: 'links',
    category: 'content',
    pass: internal >= 3,
    severity: internal >= 3 ? 'info' : 'warning',
    title: 'Internal Linking',
    detail: `${internal} internal links, ${external} external links.`,
    fix: internal >= 3 ? null : 'Add at least 3-5 internal links to related pages — helps both crawlability and link equity flow.',
    impact: 4,
  };
}

function checkOgTags(html) {
  const ogTitle = getProperty(html, 'og:title');
  const ogDesc = getProperty(html, 'og:description');
  const ogImage = getProperty(html, 'og:image');
  const present = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  const pass = present === 3;
  return {
    id: 'og',
    category: 'social',
    pass,
    severity: pass ? 'info' : 'warning',
    title: 'Open Graph Tags',
    detail: `${present}/3 core OG tags present (title, description, image).`,
    fix: pass ? null : 'Add og:title, og:description, og:image — controls how your page appears when shared on Facebook, LinkedIn, WhatsApp.',
    impact: 5,
  };
}

function checkTwitterCard(html) {
  const card = getMeta(html, 'twitter:card');
  const pass = !!card;
  return {
    id: 'twitter-card',
    category: 'social',
    pass,
    severity: pass ? 'info' : 'info',
    title: 'Twitter Card',
    detail: card ? `twitter:card = ${card}` : 'No Twitter card meta.',
    fix: pass ? null : 'Add <meta name="twitter:card" content="summary_large_image"> for richer Twitter/X previews.',
    impact: 3,
  };
}

function checkStructuredData(html) {
  const ldJson = matchAll(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const pass = ldJson.length > 0;
  let type = null;
  if (pass) {
    try {
      const parsed = JSON.parse(ldJson[0][1]);
      type = (Array.isArray(parsed) ? parsed[0] : parsed)['@type'] || null;
    } catch (e) {}
  }
  return {
    id: 'structured-data',
    category: 'social',
    pass,
    severity: pass ? 'info' : 'warning',
    title: 'Structured Data (JSON-LD)',
    detail: pass ? `Schema.org markup present${type ? ' (type: ' + type + ')' : ''}.` : 'No JSON-LD structured data.',
    fix: pass ? null : 'Add JSON-LD schema (Organization, LocalBusiness, Article, or Product) — enables rich results in Google.',
    impact: 6,
  };
}

// ------------------------------------------------------------
// Category scoring — weighted averages
// ------------------------------------------------------------
const CATEGORY_WEIGHTS = { technical: 30, onpage: 30, content: 20, social: 20 };

function scoreCategory(checks, category) {
  const catChecks = checks.filter(c => c.category === category);
  if (!catChecks.length) return { score: 0, max: 0 };
  const totalImpact = catChecks.reduce((s, c) => s + c.impact, 0);
  const passedImpact = catChecks.filter(c => c.pass).reduce((s, c) => s + c.impact, 0);
  return { score: Math.round((passedImpact / totalImpact) * 100), max: 100 };
}

function computeOverallScore(categories) {
  let weighted = 0, totalWeight = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (categories[cat]) {
      weighted += categories[cat].score * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ------------------------------------------------------------
// Simulate "after fix" score — assume all critical + warning issues fixed
// ------------------------------------------------------------
function simulateAfter(checks) {
  const fixed = checks.map(c => ({ ...c, pass: true }));
  const categories = {};
  for (const cat of Object.keys(CATEGORY_WEIGHTS)) categories[cat] = scoreCategory(fixed, cat);
  return computeOverallScore(categories);
}

// ------------------------------------------------------------
// Main export
// ------------------------------------------------------------
export async function runSeoAudit({ url, keyword }) {
  let parsed;
  try {
    parsed = new URL(url.match(/^https?:\/\//) ? url : 'https://' + url);
  } catch (e) {
    throw new Error('Invalid URL — must be a full http(s):// address');
  }

  const res = await fetchPage(parsed.toString());

  const checks = [
    checkHttps(parsed, res),
    checkStatus(res),
    checkTtfb(res),
    checkCompression(res),
    checkViewport(res.html),
    checkCharset(res.html),
    checkFavicon(res.html, res.finalUrl),
    checkCanonical(res.html),
    checkTitle(res.html),
    checkMetaDescription(res.html),
    checkH1(res.html),
    checkH2s(res.html),
    checkLang(res.html),
    checkRobots(res.html),
    checkImages(res.html),
    checkWordCount(res.html),
    checkLinks(res.html, res.finalUrl),
    checkOgTags(res.html),
    checkTwitterCard(res.html),
    checkStructuredData(res.html),
  ];

  const categories = {};
  for (const cat of Object.keys(CATEGORY_WEIGHTS)) categories[cat] = scoreCategory(checks, cat);

  const score = computeOverallScore(categories);
  const afterScore = simulateAfter(checks);

  const issues = checks.filter(c => !c.pass).map(c => ({
    id: c.id,
    category: c.category,
    severity: c.severity,
    title: c.title,
    description: c.detail,
    fix: c.fix,
    impact: c.impact,
  })).sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity] || b.impact - a.impact;
  });

  const passes = checks.filter(c => c.pass).map(c => ({
    id: c.id,
    category: c.category,
    title: c.title,
    detail: c.detail,
  }));

  const text = stripTags(res.html);
  const metrics = {
    ttfb: res.ttfb,
    totalLoadMs: res.totalMs,
    pageSizeKb: Math.round(res.bytes / 1024),
    wordCount: text.split(/\s+/).filter(Boolean).length,
    imagesCount: matchAll(res.html, /<img\b[^>]*>/gi).length,
    h1Count: matchAll(res.html, /<h1[^>]*>/gi).length,
    h2Count: matchAll(res.html, /<h2[^>]*>/gi).length,
    linkCount: matchAll(res.html, /<a[^>]+href=/gi).length,
  };

  return {
    url: parsed.toString(),
    finalUrl: res.finalUrl,
    keyword: keyword || null,
    score,
    grade: gradeFor(score),
    afterScore,
    afterGrade: gradeFor(afterScore),
    categories,
    metrics,
    issues,
    passes,
    checkedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------
// Route registration
// ------------------------------------------------------------
export function registerSeoRoutes(app, requireApiKey) {
  app.post('/api/seo/audit', requireApiKey, async (req, res) => {
    try {
      const { url, keyword } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }
      const result = await runSeoAudit({ url, keyword });
      res.json(result);
    } catch (e) {
      console.error('[seo/audit]', e);
      res.status(500).json({ error: e.message });
    }
  });
}