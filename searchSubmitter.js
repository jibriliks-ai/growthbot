// ============================================================
// searchSubmitter.js — IndexNow submitter (bulletproof key file)
// ============================================================
import { pool } from './db.js';
import { createTrackedLink } from './trackedLinks.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// ------------------------------------------------------------
// Resolve the app's public base URL
// Priority: PUBLIC_BASE_URL env → X-Forwarded headers → req.protocol+host
// ------------------------------------------------------------
function publicBase(req) {
  const env = process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (env) return env.replace(/\/+$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host  = req.get('x-forwarded-host') || req.get('host') || '';
  return `${proto}://${host}`;
}

// ------------------------------------------------------------
// Preflight — verify the key file is publicly reachable
// ------------------------------------------------------------
async function verifyKeyFile(base, key) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${base}/${key}.txt`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, url: `${base}/${key}.txt` };
    const body = (await res.text()).trim();
    if (body !== key) return { ok: false, reason: `Body mismatch (got "${body.slice(0, 20)}...", expected key)`, url: `${base}/${key}.txt` };
    return { ok: true, url: `${base}/${key}.txt` };
  } catch (e) {
    return { ok: false, reason: e.message, url: `${base}/${key}.txt` };
  }
}

// ------------------------------------------------------------
// Submit URLs to IndexNow (batch)
// ------------------------------------------------------------
async function submitToIndexNow({ urls, keyLocation, host, key }) {
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
    });
    const body = await res.text().catch(() => '');
    // Parse IndexNow error messages from body (they return plain text like "Forbidden" or "InvalidKey")
    let reason = '';
    if (!res.ok) {
      if (res.status === 403) reason = 'Key file not reachable or key mismatch. Visit /api/indexnow/verify to diagnose.';
      else if (res.status === 422) reason = 'URLs must belong to the same host as the key file.';
      else if (res.status === 429) reason = 'Rate limited — wait and retry.';
      else if (body) reason = body.slice(0, 300);
    }
    return {
      statusCode: res.status,
      ok: res.status === 200 || res.status === 202,
      reason: reason || null,
      rawBody: body.slice(0, 500),
    };
  } catch (e) {
    return { statusCode: 0, ok: false, reason: e.message, rawBody: '' };
  }
}

// ------------------------------------------------------------
// Main submit
// ------------------------------------------------------------
export async function submitUrlsForIndexing({ req, apiKey, businessId, urls }) {
  if (!Array.isArray(urls) || urls.length === 0) throw new Error('No URLs provided');
  const validUrls = urls.filter(u => /^https?:\/\//i.test(u));
  if (validUrls.length === 0) throw new Error('No valid http/https URLs');

  const base = publicBase(req);
  const host = base.replace(/^https?:\/\//, '');
  const key = process.env.INDEXNOW_KEY;

  if (!key) {
    return {
      ok: false,
      error: 'INDEXNOW_KEY not set in environment. Add it in Render → Environment and redeploy.',
      setup: {
        step1: 'Generate key: node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"',
        step2: 'Render → Environment → add INDEXNOW_KEY = <output>',
        step3: 'Redeploy, then POST /api/indexnow/verify',
      },
    };
  }

  // Preflight — verify key file is reachable BEFORE submitting
  const keyCheck = await verifyKeyFile(base, key);
  if (!keyCheck.ok) {
    return {
      ok: false,
      error: `Key file not reachable at ${keyCheck.url} — ${keyCheck.reason}. IndexNow will reject every submission until this works.`,
      keyCheck,
    };
  }

  // Create tracked link + job row per URL
  const jobs = [];
  for (const url of validUrls) {
    let trackedUrl = null, trackingCode = null;
    if (businessId) {
      try {
        const link = await createTrackedLink({
          apiKey, businessId: Number(businessId),
          channel: 'backlink', platform: 'indexnow', targetUrl: url,
        });
        trackingCode = link.code;
        trackedUrl = `${base}/r/${link.code}`;
      } catch (e) {
        console.warn('[indexing] tracked link failed:', e.message);
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO backlink_jobs (api_key, url, type, status, payload, result)
       VALUES ($1, $2, 'indexnow', 'pending', $3, $4) RETURNING *`,
      [apiKey, url,
       JSON.stringify({ host, engines: ['indexnow'] }),
       JSON.stringify({ trackedUrl, trackingCode })]
    );
    jobs.push({ job: rows[0], url, trackedUrl, trackingCode });
  }

  // Submit
  const result = await submitToIndexNow({ urls: validUrls, keyLocation: `${base}/${key}.txt`, host, key });

  // Update rows
  const finalStatus = result.ok ? 'success' : 'failed';
  for (const j of jobs) {
    await pool.query(
      `UPDATE backlink_jobs SET status = $1, result = $2, updated_at = NOW() WHERE id = $3`,
      [finalStatus, JSON.stringify({ ...result, trackedUrl: j.trackedUrl }), j.job.id]
    );
  }

  return {
    ok: result.ok,
    submitted: jobs.length,
    indexnow: result,
    keyLocation: `${base}/${key}.txt`,
    google: {
      note: 'Google retired the public ping endpoint in 2023. Upload your sitemap.xml in Google Search Console (free, one-time).',
    },
    jobs: jobs.map(j => ({
      id: j.job.id, url: j.url, status: finalStatus,
      trackedUrl: j.trackedUrl, trackingCode: j.trackingCode,
    })),
  };
}

// ------------------------------------------------------------
// Route registration
// ------------------------------------------------------------
export function registerBacklinkRoutes(app, requireApiKey) {
  // ============================================================
  // KEY FILE SERVING — MUST come before all other routes
  // Uses app.use (middleware) which works in Express 4 AND 5.
  // Serves the key at /<key>.txt, /indexnow.txt, /indexnow-key.txt
  // ============================================================
  app.use((req, res, next) => {
    const key = process.env.INDEXNOW_KEY;
    if (!key) return next();
    const filename = req.path.replace(/^\//, '');
    if (filename === `${key}.txt` || filename === 'indexnow.txt' || filename === 'indexnow-key.txt') {
      return res.type('text/plain; charset=utf-8').send(key);
    }
    next();
  });

  // Diagnostics
  app.get('/api/indexnow/verify', async (req, res) => {
    const key = process.env.INDEXNOW_KEY;
    if (!key) {
      return res.status(400).json({
        ok: false,
        error: 'INDEXNOW_KEY not set in environment.',
        setup: 'Render → Environment → add INDEXNOW_KEY = <32-hex-chars>. Redeploy.',
      });
    }
    const base = publicBase(req);
    const keyCheck = await verifyKeyFile(base, key);
    res.json({
      ok: keyCheck.ok,
      keyConfigured: true,
      keyLocation: `${base}/${key}.txt`,
      keyLength: key.length,
      keyPreview: key.slice(0, 4) + '...' + key.slice(-4),
      keyCheck,
      hint: keyCheck.ok
        ? 'Key file is publicly reachable. Submissions should work.'
        : 'Key file is NOT reachable. Check: 1) server restart after env var set, 2) reverse proxy not blocking .txt files, 3) PUBLIC_BASE_URL env var matches your real domain.',
    });
  });

  // Submit
  app.post('/api/backlink/submit', requireApiKey, async (req, res) => {
    try {
      const { businessId, urls } = req.body || {};
      const result = await submitUrlsForIndexing({
        req, apiKey: req.apiKey, businessId, urls,
      });
      res.status(result.ok ? 200 : 500).json(result);
    } catch (e) {
      console.error('[backlink/submit]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Job list
  app.get('/api/backlink/jobs', requireApiKey, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, url, type, status, result, created_at, updated_at
         FROM backlink_jobs WHERE api_key = $1
         ORDER BY created_at DESC LIMIT 100`,
        [req.apiKey]
      );
      res.json({ jobs: rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}