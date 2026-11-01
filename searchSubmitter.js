// ============================================================
// searchSubmitter.js — Submit URLs to search engines for indexing
// Uses IndexNow (Bing/Yandex/Seznam/Naver) + creates tracked links
// for retargeting. Google is reported honestly (requires Search Console).
// ============================================================
import { pool } from './db.js';
import { createTrackedLink } from './trackedLinks.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// ------------------------------------------------------------
// IndexNow submission (batch — one call handles all URLs)
// ------------------------------------------------------------
async function submitToIndexNow({ urls, host, key }) {
  if (!key) {
    return { engine: 'indexnow', ok: false, error: 'INDEXNOW_KEY not configured' };
  }
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: host,
        key: key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: urls,
      }),
    });
    const body = await res.text().catch(() => '');
    return {
      engine: 'indexnow',
      statusCode: res.status,
      ok: res.status === 200 || res.status === 202,
      body: body.slice(0, 500),
    };
  } catch (e) {
    return { engine: 'indexnow', ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Google — report honest status (no free API for general URLs)
// ------------------------------------------------------------
function submitToGoogle() {
  return {
    engine: 'google',
    ok: false,
    skipped: true,
    note: 'Google retired the public ping endpoint in 2023. Upload your sitemap.xml in Google Search Console (free, one-time). Indexing API only supports job postings and livestreams.',
  };
}

// ------------------------------------------------------------
// Main entry
// ------------------------------------------------------------
export async function submitUrlsForIndexing({ apiKey, businessId, urls, host }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('No URLs provided');
  }
  const validUrls = urls.filter(u => /^https?:\/\//i.test(u));
  if (validUrls.length === 0) {
    throw new Error('No valid http/https URLs found');
  }

  const baseHost = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const key = process.env.INDEXNOW_KEY;

  // 1. Create tracked link + job row for each URL
  const jobs = [];
  for (const url of validUrls) {
    let trackedUrl = null;
    let trackingCode = null;
    if (businessId) {
      try {
        const link = await createTrackedLink({
          apiKey: apiKey,
          businessId: Number(businessId),
          channel: 'backlink',
          platform: 'indexnow',
          targetUrl: url,
        });
        trackingCode = link.code;
        trackedUrl = `https://${baseHost}/r/${link.code}`;
      } catch (e) {
        console.warn('[indexing] tracked link failed for', url, ':', e.message);
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO backlink_jobs (api_key, url, type, status, payload, result)
       VALUES ($1, $2, 'indexnow', 'pending', $3, $4)
       RETURNING *`,
      [
        apiKey,
        url,
        JSON.stringify({ host: baseHost, engines: ['indexnow', 'google'] }),
        JSON.stringify({ trackedUrl: trackedUrl, trackingCode: trackingCode }),
      ]
    );
    jobs.push({ job: rows[0], url: url, trackedUrl: trackedUrl, trackingCode: trackingCode });
  }

  // 2. Submit to IndexNow (batch)
  const indexNowResult = await submitToIndexNow({ urls: validUrls, host: baseHost, key: key });

  // 3. Google status
  const googleResult = submitToGoogle();

  // 4. Update all job rows with results
  const finalStatus = indexNowResult.ok ? 'success' : 'failed';
  for (const j of jobs) {
    const merged = Object.assign(
      { indexnow: indexNowResult, google: googleResult },
      { trackedUrl: j.trackedUrl, trackingCode: j.trackingCode }
    );
    await pool.query(
      `UPDATE backlink_jobs SET status = $1, result = $2, updated_at = NOW() WHERE id = $3`,
      [finalStatus, JSON.stringify(merged), j.job.id]
    );
  }

  return {
    submitted: jobs.length,
    indexnow: indexNowResult,
    google: googleResult,
    jobs: jobs.map(j => ({
      id: j.job.id,
      url: j.url,
      status: finalStatus,
      trackedUrl: j.trackedUrl,
      trackingCode: j.trackingCode,
    })),
  };
}

// ------------------------------------------------------------
// Route registration
// ------------------------------------------------------------
export function registerBacklinkRoutes(app, requireApiKey) {
  // Serve /<KEY>.txt (required by IndexNow to verify domain ownership)
  // Narrow regex: only matches /[hex].txt — won't shadow /api/* routes
  app.get(/^\/([a-f0-9]{8,64})\.txt$/, (req, res, next) => {
    const key = process.env.INDEXNOW_KEY;
    if (!key) return next();
    const requested = req.params[0];
    if (requested !== key) return next();
    res.type('text/plain').send(key);
  });

  // Submit URLs
  app.post('/api/backlink/submit', requireApiKey, async (req, res) => {
    try {
      const body = req.body || {};
      const urls = body.urls;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'urls array required' });
      }
      const host = req.get('host') || '';
      const result = await submitUrlsForIndexing({
        apiKey: req.apiKey,
        businessId: body.businessId,
        urls: urls,
        host: host,
      });
      res.json(result);
    } catch (e) {
      console.error('[backlink/submit]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // List recent jobs
  app.get('/api/backlink/jobs', requireApiKey, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, url, type, status, result, created_at, updated_at
         FROM backlink_jobs
         WHERE api_key = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.apiKey]
      );
      res.json({ jobs: rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}