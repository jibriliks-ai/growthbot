// ============================================================
// features.js — SEO Audit + Q&A Finder + IndexNow Submitter
// One file, one import, one registration call.
// Works with or without a business profile.
// ============================================================
import { pool } from './db.js';

let trackedMod = null;
try { trackedMod = await import('./trackedLinks.js'); } catch (e) {}

async function makeTrackedLink(args) {
  if (!trackedMod?.createTrackedLink) return null;
  try { return await trackedMod.createTrackedLink(args); } catch (e) { return null; }
}

// ------------------------------------------------------------
// UTILITIES
// ------------------------------------------------------------
async function timedFetch(url, options = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function getMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ============================================================
// SEO AUDIT
// ============================================================
async function runSeoAudit(url) {
  const parsed = new URL(url.match(/^https?:\/\//) ? url : 'https://' + url);
  const t0 = Date.now();
  const res = await timedFetch(parsed.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthBot/1.0)' },
  });
  const ttfb = Date.now() - t0;
  const html = await res.text();
  const totalMs = Date.now() - t0;

  const checks = [];
  const add = (id, cat, pass, sev, title, detail, fix, impact) =>
    checks.push({ id, cat, pass, sev, title, detail, fix, impact });

  const isHttps = res.url.startsWith('https://');
  add('https', 'technical', isHttps, isHttps ? 'info' : 'critical',
    'HTTPS / SSL', isHttps ? 'Site loads over HTTPS.' : 'Site loaded over HTTP.',
    isHttps ? null : 'Install SSL cert and force HTTPS redirects.', 10);
  add('status', 'technical', res.ok, res.ok ? 'info' : 'critical',
    'HTTP Status', `Status ${res.status}`,
    res.ok ? null : 'Fix server error before anything else.', 15);
  add('ttfb', 'technical', ttfb < 800, ttfb < 800 ? 'info' : ttfb < 1800 ? 'warning' : 'critical',
    'Server Response Time', `${ttfb}ms`,
    ttfb < 800 ? null : 'Enable caching, use a CDN, or upgrade hosting.', 8);
  const enc = (res.headers.get('content-encoding') || '').toLowerCase();
  const compressed = /gzip|br|deflate/.test(enc);
  add('compression', 'technical', compressed, compressed ? 'info' : 'warning',
    'Response Compression', compressed ? `Compressed: ${enc}` : 'Not compressed.',
    compressed ? null : 'Enable gzip/brotli on the server.', 4);
  const viewport = getMeta(html, 'viewport');
  const vpOk = !!viewport && /width\s*=\s*device-width/i.test(viewport);
  add('viewport', 'technical', vpOk, vpOk ? 'info' : 'critical',
    'Mobile Viewport', vpOk ? 'Viewport configured.' : 'Missing viewport meta.',
    vpOk ? null : 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', 8);
  const charset = html.match(/<meta[^>]+charset=["']?([a-z0-9-]+)/i);
  add('charset', 'technical', !!charset, charset ? 'info' : 'warning',
    'Character Encoding', charset ? `charset=${charset[1]}` : 'Not declared.',
    charset ? null : 'Add <meta charset="utf-8"> as first tag in head.', 2);
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  add('canonical', 'onpage', !!canonical, canonical ? 'info' : 'warning',
    'Canonical Tag', canonical ? canonical[1] : 'Missing.',
    canonical ? null : 'Add <link rel="canonical" href="...">.', 6);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const titleOk = title.length >= 30 && title.length <= 60;
  add('title', 'onpage', titleOk, titleOk ? 'info' : (!title ? 'critical' : 'warning'),
    'Page Title', title ? `"${title}" (${title.length} chars)` : 'Missing.',
    titleOk ? null : (!title ? 'Add <title> tag.' : title.length < 30 ? 'Aim 50-60 chars.' : 'Trim to under 60 chars.'), 12);
  const desc = getMeta(html, 'description') || '';
  const descOk = desc.length >= 120 && desc.length <= 160;
  add('description', 'onpage', descOk, descOk ? 'info' : (desc ? 'info' : 'warning'),
    'Meta Description', desc ? `${desc.length} chars` : 'Missing.',
    descOk ? null : (!desc ? 'Add meta description.' : desc.length < 120 ? 'Aim 150-160 chars.' : 'Trim to under 160.'), 6);
  const h1s = (html.match(/<h1[^>]*>/gi) || []).length;
  const h1Ok = h1s === 1;
  add('h1', 'onpage', h1Ok, h1Ok ? 'info' : 'critical',
    'H1 Heading', `${h1s} H1 tag(s)`,
    h1Ok ? null : (h1s === 0 ? 'Add exactly one H1.' : 'Use only one H1 per page.'), 8);
  const h2s = (html.match(/<h2[^>]*>/gi) || []).length;
  add('h2', 'onpage', h2s >= 2, h2s >= 2 ? 'info' : 'warning',
    'Section Headings', `${h2s} H2 tag(s)`,
    h2s >= 2 ? null : 'Add 2-3 H2s to break up content.', 4);
  const lang = html.match(/<html[^>]+lang=["']([^"']+)/i);
  add('lang', 'onpage', !!lang, lang ? 'info' : 'warning',
    'Language Declaration', lang ? `lang=${lang[1]}` : 'Missing.',
    lang ? null : 'Add lang="en" to <html>.', 3);
  const robots = getMeta(html, 'robots');
  const noindex = robots && /noindex/i.test(robots);
  add('robots', 'onpage', !noindex, noindex ? 'critical' : 'info',
    'Robots Meta', noindex ? `noindex (${robots})` : (robots || 'default index,follow'),
    noindex ? 'Remove noindex from robots meta.' : null, noindex ? 20 : 0);

  const text = stripTags(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  add('words', 'content', wordCount >= 300, wordCount >= 300 ? 'info' : 'warning',
    'Content Length', `${wordCount} words`,
    wordCount >= 300 ? null : 'Aim for 300+ words.', 5);
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter(tag => !/\balt\s*=/i.test(tag)).length;
  add('alt', 'content', noAlt === 0 || imgs.length === 0,
    (imgs.length > 0 && noAlt / imgs.length > 0.3) ? 'warning' : 'info',
    'Image Alt Text', imgs.length === 0 ? 'No images.' : `${noAlt} of ${imgs.length} missing alt.`,
    (noAlt === 0 || imgs.length === 0) ? null : `Add alt text to ${noAlt} images.`, 5);
  const linkTags = html.match(/<a[^>]+href=["']([^"']+)["']/gi) || [];
  let internal = 0;
  for (const l of linkTags) {
    const m = l.match(/href=["']([^"']+)/i);
    if (!m) continue;
    try {
      const u = new URL(m[1], res.url);
      if (u.hostname === parsed.hostname) internal++;
    } catch (e) {}
  }
  add('links', 'content', internal >= 3, internal >= 3 ? 'info' : 'warning',
    'Internal Linking', `${internal} internal links`,
    internal >= 3 ? null : 'Add 3-5 internal links.', 4);

  const ogCount = ['og:title', 'og:description', 'og:image'].filter(n => getMeta(html, n)).length;
  add('og', 'social', ogCount === 3, ogCount === 3 ? 'info' : 'warning',
    'Open Graph Tags', `${ogCount}/3 present`,
    ogCount === 3 ? null : 'Add og:title, og:description, og:image.', 5);
  const tw = getMeta(html, 'twitter:card');
  add('twitter', 'social', !!tw, 'info', 'Twitter Card', tw || 'Missing',
    tw ? null : 'Add twitter:card meta.', 3);
  const jsonld = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  add('schema', 'social', jsonld, jsonld ? 'info' : 'warning',
    'Structured Data', jsonld ? 'Present' : 'Missing',
    jsonld ? null : 'Add JSON-LD schema.', 6);

  const weights = { technical: 30, onpage: 30, content: 20, social: 20 };
  const categories = {};
  for (const cat of Object.keys(weights)) {
    const cc = checks.filter(c => c.cat === cat);
    const ti = cc.reduce((s, c) => s + c.impact, 0);
    const pi = cc.filter(c => c.pass).reduce((s, c) => s + c.impact, 0);
    categories[cat] = ti > 0 ? Math.round(pi / ti * 100) : 0;
  }
  let weighted = 0, totalW = 0;
  for (const [cat, w] of Object.entries(weights)) { weighted += categories[cat] * w; totalW += w; }
  const score = Math.round(weighted / totalW);
  const gradeFor = s => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';
  const afterScore = 100;

  return {
    url: parsed.toString(), finalUrl: res.url,
    score, grade: gradeFor(score), afterScore, afterGrade: gradeFor(afterScore),
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, { score: v, max: 100 }])),
    metrics: { ttfb, totalLoadMs: totalMs, pageSizeKb: Math.round(Buffer.byteLength(html) / 1024),
      wordCount, imagesCount: imgs.length, h1Count: h1s, h2Count: h2s, linkCount: linkTags.length },
    issues: checks.filter(c => !c.pass).map(c => ({
      id: c.id, category: c.cat, severity: c.sev, title: c.title,
      description: c.detail, fix: c.fix, impact: c.impact,
    })).sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity] || b.impact - a.impact;
    }),
    passes: checks.filter(c => c.pass).map(c => ({
      id: c.id, category: c.cat, title: c.title, detail: c.detail,
    })),
    checkedAt: new Date().toISOString(),
  };
}

// ============================================================
// Q&A FINDER — 4 sources
// ============================================================
async function findOnReddit(kw) {
  try {
    const r = await timedFetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(kw)}&limit=10&sort=relevance&t=year`,
      { headers: { 'User-Agent': 'GrowthBot/1.0' } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d?.data?.children || []).slice(0, 10).map(c => ({
      source: 'reddit', title: c.data.title,
      url: `https://www.reddit.com${c.data.permalink}`,
      snippet: (c.data.selftext || '').slice(0, 220),
    }));
  } catch (e) { return []; }
}

async function findOnLemmy(instances, kw) {
  const out = []; const seen = new Set();
  for (const inst of instances) {
    try {
      const r = await timedFetch(`https://${inst}/api/v3/search?q=${encodeURIComponent(kw)}&type_=Posts&limit=8&sort=TopAll`,
        { headers: { 'User-Agent': 'GrowthBot/1.0' } });
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of (d.posts || []).slice(0, 8)) {
        const post = p.post; if (!post?.name) continue;
        const url = post.ap_id || `https://${inst}/post/${post.id}`;
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ source: 'lemmy', title: post.name, url,
          snippet: (post.body || '').slice(0, 220) || `From ${p.community?.name || inst}` });
      }
    } catch (e) {}
  }
  return out;
}

async function findOnStackExchange(sites, kw) {
  const out = [];
  for (const site of sites) {
    try {
      const r = await timedFetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(kw)}&site=${site}&pagesize=6`);
      if (!r.ok) continue;
      const d = await r.json();
      for (const it of (d.items || []).slice(0, 6)) {
        out.push({ source: 'stackexchange', title: it.title, url: it.link,
          snippet: `Score ${it.score} · ${it.answer_count || 0} answers` });
      }
    } catch (e) {}
  }
  return out;
}

async function findOnNairaland(kw) {
  try {
    const r = await timedFetch(`https://www.nairaland.com/search?q=${encodeURIComponent(kw)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const html = await r.text();
    const re = /<a[^>]+href="\/(\d+)\/([a-z0-9\-]+)"[^>]*>([^<]{15,200})<\/a>/gi;
    const out = []; const seen = new Set(); let m;
    while ((m = re.exec(html)) !== null && out.length < 8) {
      const u = `https://www.nairaland.com/${m[1]}/${m[2]}`;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({ source: 'nairaland', title: m[3].trim(), url: u, snippet: '' });
    }
    return out;
  } catch (e) { return []; }
}

async function findQuestions({ keyword, country }) {
  const cc = (country || 'us').toLowerCase();
  const instMap = {
    us: ['lemmy.world', 'sh.itjust.works', 'lemmy.ml'],
    ca: ['lemmy.ca', 'lemmy.world'],
    au: ['aussie.zone', 'lemmy.com.au'],
    gb: ['feddit.uk', 'lemmy.world'],
    ng: ['lemmy.world'],
  };
  const lemmyInst = instMap[cc] || ['lemmy.world'];
  const seSites = ['stackoverflow', 'superuser'];

  const results = await Promise.all([
    findOnReddit(keyword),
    findOnLemmy(lemmyInst, keyword),
    findOnStackExchange(seSites, keyword),
    cc === 'ng' ? findOnNairaland(keyword) : Promise.resolve([]),
  ]);
  const all = results.flat();
  const seen = new Set(); const deduped = [];
  for (const item of all) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
    if (deduped.length >= 40) break;
  }
  return deduped;
}

// ============================================================
// DRAFT GENERATOR
// ============================================================
function platformTone(p) {
  p = (p || '').toLowerCase();
  if (p.includes('reddit')) return 'first-person, concrete, earn the pitch with real detail';
  if (p.includes('quora')) return 'informative, business links expected';
  if (p.includes('nairaland')) return 'warm, direct, professional';
  if (p.includes('stack')) return 'technical, link only at end as reference';
  if (p.includes('lemmy')) return 'casual, allergic to marketing speak';
  return 'conversational, specific';
}

function buildPrompt(business, platform, site) {
  return `You are writing a genuinely helpful forum answer that quietly sells a business.

STRUCTURE (100-200 words, 3 paragraphs):
1. OPENER: Answer with real substance — a number, method, or concrete scenario.
2. VALUE: Mention "${business.name || 'our business'}" ONCE, mid-answer, with a specific strength.
3. CLOSER: Point clearly to ${site || 'the website'} with a specific promise ("the exact 5-step framework" or "the checklist we use").

RULES:
- No emojis. No bullets. No bold/headers.
- Banned: "unlock", "revolutionize", "game-changer", "in today's fast-paced world".
- URL must appear literally in text.
- Tone: ${platformTone(platform)}.

Return ONLY the answer text.`;
}

async function generateDraftText({ question, business, blogUrl, platform }) {
  const sys = buildPrompt(business, platform, blogUrl);
  const userMsg = `Question (${platform}): "${question.title}"\n` +
    (question.snippet ? `Context: ${question.snippet}\n` : '') +
    `Business: ${business.name || '(none)'}\nWebsite: ${blogUrl || business.website || '(none)'}\n\nWrite the answer.`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await timedFetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ parts: [{ text: userMsg }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 500 },
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t && t.length > 60) return t.trim();
      }
    } catch (e) {}
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await timedFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
          temperature: 0.9, max_tokens: 500,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const t = d?.choices?.[0]?.message?.content;
        if (t && t.length > 60) return t.trim();
      }
    } catch (e) {}
  }

  if (process.env.OLLAMA_URL) {
    try {
      const r = await timedFetch(`${process.env.OLLAMA_URL.replace(/\/+$/, '')}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || 'llama3.1',
          prompt: sys + '\n\n' + userMsg,
          stream: false, options: { temperature: 0.9 },
        }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.response && d.response.length > 60) return d.response.trim();
      }
    } catch (e) {}
  }

  const site = blogUrl || business.website || '';
  const biz = business.name || 'our team';
  const cat = business.category || 'this';
  return `The honest answer is that most people skip the fundamentals. In my experience with ${cat}, the biggest wins come from three things: understanding what your audience actually needs, committing to one channel long enough to see results, and measuring weekly instead of guessing.\n\nWe run ${biz} and this is the exact pattern we use with every client. Start with a fundamentals audit, identify the single biggest bottleneck, then fix only that for 30 days.\n\nI put the full 3-step process into a walkthrough at ${site} — no email gate, just the guide.`;
}

// ============================================================
// INDEXNOW SUBMITTER
// ============================================================
async function submitToIndexNow({ urls, host, key, keyLocation }) {
  try {
    const r = await timedFetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
    });
    const body = await r.text().catch(() => '');
    let reason = '';
    if (!r.ok) {
      if (r.status === 403) reason = 'Key file not reachable at keyLocation';
      else if (r.status === 422) reason = 'URLs must match the key file host';
      else if (r.status === 429) reason = 'Rate limited';
      else reason = body.slice(0, 300);
    }
    return { statusCode: r.status, ok: r.status === 200 || r.status === 202, reason, body: body.slice(0, 500) };
  } catch (e) {
    return { statusCode: 0, ok: false, reason: e.message, body: '' };
  }
}

// ============================================================
// ROUTE HANDLERS
// ============================================================
async function seoAuditHandler(req, res) {
  try {
    if (!req.body?.url) return res.status(400).json({ error: 'url is required' });
    res.json(await runSeoAudit(req.body.url));
  } catch (e) { console.error('[seo]', e.message); res.status(500).json({ error: e.message }); }
}

async function qaFindHandler(req, res) {
  try {
    const { keyword, country, businessId } = req.body || {};
    if (!keyword) return res.status(400).json({ error: 'keyword is required' });
    const questions = await findQuestions({ keyword, country: country || 'us' });
    if (businessId) {
      for (const q of questions) {
        try {
          await pool.query(
            `INSERT INTO question_finds (business_id, keyword, country, source, title, question_url, snippet)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (business_id, question_url) DO NOTHING`,
            [businessId, keyword, country || 'us', q.source, q.title, q.url, q.snippet || '']
          );
        } catch (e) {}
      }
    }
    res.json({ questions: questions.map((q, i) => ({ ...q, id: 'q' + i })) });
  } catch (e) { console.error('[qa/find]', e.message); res.status(500).json({ error: e.message }); }
}

async function qaDraftHandler(req, res) {
  try {
    const b = req.body || {};
    const question = b.question || { title: b.title || '', snippet: b.snippet || '', source: b.source || 'generic' };
    if (!question.title) return res.status(400).json({ error: 'question.title is required' });
    const business = b.business || {
      name: b.businessName || '', website: b.businessWebsite || '',
      category: b.businessCategory || '', phone: b.businessPhone || '',
    };
    const blogUrl = b.blogUrl || business.website || '';
    if (!blogUrl) return res.status(400).json({ error: 'Website URL required. Add one in your business profile.' });

    const text = await generateDraftText({ question, business, blogUrl, platform: question.source || 'generic' });
    res.json({
      draft: {
        draft_text: text, text,
        word_count: text.split(/\s+/).length,
        blogUrl, blogTitle: b.blogTitle || business.name || 'Guide',
      },
    });
  } catch (e) { console.error('[qa/draft]', e.message); res.status(500).json({ error: e.message }); }
}

async function backlinkSubmitHandler(req, res) {
  try {
    const { businessId, urls } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls array is required' });
    const valid = urls.filter(u => /^https?:\/\//i.test(u));
    if (valid.length === 0) return res.status(400).json({ error: 'No valid http/https URLs' });

    const key = process.env.INDEXNOW_KEY;
    if (!key) return res.status(500).json({
      error: 'INDEXNOW_KEY not set in environment',
      setup: 'Add INDEXNOW_KEY=<32-hex> in Render env, redeploy.',
    });

    const base = process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`;
    const host = base.replace(/^https?:\/\//, '');
    const keyLocation = `${base}/${key}.txt`;

    // Verify key file
    let ok = false, reason = '';
    try {
      const r = await timedFetch(keyLocation, {}, 6000);
      if (r.ok) {
        const body = (await r.text()).trim();
        ok = body === key;
        if (!ok) reason = 'Key file body mismatch';
      } else reason = `HTTP ${r.status}`;
    } catch (e) { reason = e.message; }

    if (!ok) return res.status(500).json({
      error: `Key file not reachable at ${keyLocation} — ${reason}`,
      keyLocation,
      hint: 'Open ' + keyLocation + ' in your browser. Should print the key. If 404, check INDEXNOW_KEY env and PUBLIC_BASE_URL.',
    });

    const jobs = [];
    for (const url of valid) {
      let trackedUrl = null;
      if (businessId) {
        const link = await makeTrackedLink({ apiKey: req.apiKey, businessId: Number(businessId),
          channel: 'backlink', platform: 'indexnow', targetUrl: url });
        if (link) trackedUrl = `${base}/r/${link.code}`;
      }
      const jr = await pool.query(
        `INSERT INTO backlink_jobs (api_key, url, type, status, payload, result)
         VALUES ($1, $2, 'indexnow', 'pending', $3, $4) RETURNING id`,
        [req.apiKey, url, JSON.stringify({ host }), JSON.stringify({ trackedUrl })]
      );
      jobs.push({ id: jr.rows[0].id, url, trackedUrl });
    }

    const result = await submitToIndexNow({ urls: valid, host, key, keyLocation });
    const status = result.ok ? 'success' : 'failed';
    for (const j of jobs) {
      await pool.query(
        `UPDATE backlink_jobs SET status = $1, result = $2, updated_at = NOW() WHERE id = $3`,
        [status, JSON.stringify({ ...result, trackedUrl: j.trackedUrl }), j.id]
      );
    }

    res.json({
      ok: result.ok, indexnow: result, keyLocation, submitted: jobs.length,
      jobs: jobs.map(j => ({ ...j, status })),
      google: { note: 'Google retired the ping endpoint. Upload sitemap.xml in Search Console.' },
    });
  } catch (e) { console.error('[backlink/submit]', e.message); res.status(500).json({ error: e.message }); }
}

async function backlinkJobsHandler(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, url, type, status, result, created_at FROM backlink_jobs
       WHERE api_key = $1 ORDER BY created_at DESC LIMIT 100`, [req.apiKey]);
    res.json({ jobs: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function indexnowVerifyHandler(req, res) {
  try {
    const key = process.env.INDEXNOW_KEY;
    if (!key) return res.json({ ok: false, error: 'INDEXNOW_KEY not set in env' });
    const base = process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`;
    const keyLocation = `${base}/${key}.txt`;
    let ok = false, reason = '';
    try {
      const r = await timedFetch(keyLocation, {}, 6000);
      if (r.ok) {
        const body = (await r.text()).trim();
        ok = body === key;
        if (!ok) reason = 'Body mismatch';
      } else reason = `HTTP ${r.status}`;
    } catch (e) { reason = e.message; }
    res.json({
      ok, keyConfigured: true, keyLocation, keyLength: key.length,
      keyPreview: key.slice(0, 4) + '...' + key.slice(-4),
      reason: ok ? null : reason,
      hint: ok ? 'Ready. Submit URLs from the Indexer tab.' : `Key file not reachable at ${keyLocation}.`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// ============================================================
// REGISTER
// ============================================================
export function registerFeatureRoutes(app, requireApiKey) {
  // Serve IndexNow key file
  app.use((req, res, next) => {
    const key = process.env.INDEXNOW_KEY;
    if (!key) return next();
    const f = req.path.replace(/^\//, '');
    if (f === `${key}.txt` || f === 'indexnow.txt') {
      return res.type('text/plain; charset=utf-8').send(key);
    }
    next();
  });

  app.post('/api/seo/audit', requireApiKey, seoAuditHandler);
  app.post('/api/questions/find', requireApiKey, qaFindHandler);
  app.post('/api/questions/draft', requireApiKey, qaDraftHandler);
  app.post('/api/backlink/submit', requireApiKey, backlinkSubmitHandler);
  app.get('/api/backlink/jobs', requireApiKey, backlinkJobsHandler);
  app.get('/api/indexnow/verify', indexnowVerifyHandler);

  console.log('[features] SEO + Q&A + Indexer routes registered');
}