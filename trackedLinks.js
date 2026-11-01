// ============================================================
// trackedLinks.js — Standalone tracked links for the 4-in-1 bot
// Uses your existing Postgres pool + createLead from db.js
// ============================================================
import crypto from 'crypto';
import { pool, createLead } from './db.js';

const CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += CHARS[bytes[i] % CHARS.length];
  return s;
}

export async function initTrackedLinksSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracked_links (
      id SERIAL PRIMARY KEY,
      api_key TEXT NOT NULL,
      business_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      platform TEXT,
      target_url TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      clicks INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tracked_links_business ON tracked_links(business_id);
    CREATE INDEX IF NOT EXISTS idx_tracked_links_api_key ON tracked_links(api_key);
  `);
}

export async function createTrackedLink({ apiKey, businessId, channel, platform, targetUrl }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const { rows } = await pool.query(
        `INSERT INTO tracked_links (api_key, business_id, channel, platform, target_url, code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [apiKey, businessId, channel, platform || null, targetUrl, code]
      );
      return rows[0];
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw new Error('Could not generate unique code after 5 attempts');
}

export async function trackClick(code) {
  const { rows } = await pool.query(
    `UPDATE tracked_links SET clicks = clicks + 1 WHERE code = $1 RETURNING *`,
    [code]
  );
  return rows[0] || null;
}

export async function listTrackedLinks(apiKey) {
  const { rows } = await pool.query(
    `SELECT * FROM tracked_links WHERE api_key = $1 ORDER BY created_at DESC LIMIT 200`,
    [apiKey]
  );
  return rows;
}

export async function getBusinessLinkStats(apiKey, businessId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS links, COALESCE(SUM(clicks),0)::int AS clicks
     FROM tracked_links WHERE api_key = $1 AND business_id = $2`,
    [apiKey, businessId]
  );
  return rows[0] || { links: 0, clicks: 0 };
}

// ============================================================
// Route registration — called from server.js after app is set up
// ============================================================
export function registerTrackedLinkRoutes(app, requireApiKey) {
  // Public redirect — logs every click as a Lead, then redirects to target
  app.get('/r/:code', async (req, res) => {
    try {
      const link = await trackClick(req.params.code);
      if (!link) return res.status(404).send('Link not found');

      // Log as a Lead so it shows in Leads tab + Home analytics
      try {
        await createLead({
          businessId: link.business_id,
          campaignId: null,
          sourcePlatform: link.channel || 'tracked_link',
          name: '',
          phone: '',
          email: '',
          intent: 'click',
          notes: `Clicked /r/${link.code}${link.platform ? ' (' + link.platform + ')' : ''} → ${link.target_url}`,
          status: 'new',
        });
      } catch (e) {
        console.warn('Lead log failed for /r/' + link.code + ':', e.message);
      }

      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.redirect(302, link.target_url);
    } catch (e) {
      console.error('Tracked link error:', e.message);
      res.status(500).send('Redirect failed');
    }
  });

  // Create a tracked link
  app.post('/api/links/create', requireApiKey, async (req, res) => {
    try {
      const { businessId, channel, platform, targetUrl } = req.body || {};
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return res.status(400).json({ error: 'A valid targetUrl (http or https) is required' });
      }
      if (!businessId) return res.status(400).json({ error: 'businessId is required' });

      const link = await createTrackedLink({
        apiKey: req.apiKey,
        businessId: Number(businessId),
        channel: channel || 'general',
        platform: platform || null,
        targetUrl,
      });
      const full = `${req.protocol}://${req.get('host')}/r/${link.code}`;
      res.json({ id: link.id, code: link.code, trackedUrl: full });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // List tracked links for the current API key
  app.get('/api/links/list', requireApiKey, async (req, res) => {
    try {
      res.json({ links: await listTrackedLinks(req.apiKey) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Aggregate link + click stats for a business
  app.get('/api/businesses/:id/link-stats', requireApiKey, async (req, res) => {
    try {
      res.json(await getBusinessLinkStats(req.apiKey, Number(req.params.id)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}