// ============================================================
// Auto Traffic Engine — PostgreSQL data layer
// v3.3 — users table, auth, admin support
// ============================================================
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const useSSL = process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

// ============================================================
// SCHEMA — CORE
// ============================================================
export async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        api_key      TEXT PRIMARY KEY,
        url          TEXT NOT NULL DEFAULT 'unknown',
        email        TEXT NOT NULL DEFAULT '',
        plan         TEXT NOT NULL DEFAULT 'free',
        usage        JSONB NOT NULL DEFAULT '{
          "auditsToday":0,
          "videosMonth":0,
          "backlinksToday":0,
          "lastAuditDate":"",
          "lastBacklinkDate":"",
          "lastVideoDate":""
        }'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_history (
        id            SERIAL PRIMARY KEY,
        api_key       TEXT NOT NULL REFERENCES blogs(api_key) ON DELETE CASCADE,
        url           TEXT NOT NULL,
        keyword       TEXT NOT NULL DEFAULT '',
        score_before  INT  NOT NULL DEFAULT 0,
        score_after   INT,
        issues        JSONB NOT NULL DEFAULT '[]'::jsonb,
        fixes         JSONB NOT NULL DEFAULT '[]'::jsonb,
        fixed_html    TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_api_key ON audit_history(api_key, created_at DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS backlink_jobs (
        id          SERIAL PRIMARY KEY,
        api_key     TEXT NOT NULL REFERENCES blogs(api_key) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        type        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
        result      JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_backlink_api_key ON backlink_jobs(api_key, created_at DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS render_jobs (
        render_id   TEXT PRIMARY KEY,
        api_key     TEXT NOT NULL REFERENCES blogs(api_key) ON DELETE CASCADE,
        status      TEXT NOT NULL DEFAULT 'queued',
        script      JSONB NOT NULL DEFAULT '{}'::jsonb,
        clips       JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_url  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_render_api_key ON render_jobs(api_key, created_at DESC);`
    );

    await client.query('COMMIT');
    console.log('✅ Schema ready');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// SCHEMA — USERS
// ============================================================
export async function initUsersSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
        api_key TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);`
    );
    await client.query('COMMIT');
    console.log('✅ Users schema ready');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// SCHEMA — SOCIAL
// ============================================================
export async function initSocialSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS social_accounts (
        id                   SERIAL PRIMARY KEY,
        api_key              TEXT NOT NULL REFERENCES blogs(api_key) ON DELETE CASCADE,
        platform             TEXT NOT NULL CHECK (platform IN ('facebook', 'linkedin')),
        account_id           TEXT NOT NULL,
        account_name         TEXT NOT NULL DEFAULT '',
        access_token_enc     TEXT NOT NULL,
        refresh_token_enc    TEXT,
        expires_at           TIMESTAMPTZ,
        refresh_expires_at   TIMESTAMPTZ,
        scopes               TEXT NOT NULL DEFAULT '',
        enabled              BOOLEAN NOT NULL DEFAULT TRUE,
        last_posted_at       TIMESTAMPTZ,
        last_error           TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (api_key, platform)
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_social_api_key
       ON social_accounts(api_key, platform);`
    );

    await client.query('COMMIT');
    console.log('✅ Social schema ready');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// SCHEMA — LEADS + MULTI-BUSINESS + Q&A
// ============================================================
export async function initLeadsSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id                SERIAL PRIMARY KEY,
        api_key           TEXT REFERENCES blogs(api_key) ON DELETE SET NULL,
        name              TEXT NOT NULL,
        description       TEXT NOT NULL DEFAULT '',
        address           TEXT NOT NULL DEFAULT '',
        city              TEXT NOT NULL DEFAULT '',
        state             TEXT NOT NULL DEFAULT '',
        country           TEXT NOT NULL DEFAULT 'ng',
        phone             TEXT NOT NULL DEFAULT '',
        whatsapp          TEXT NOT NULL DEFAULT '',
        email             TEXT NOT NULL DEFAULT '',
        website           TEXT NOT NULL DEFAULT '',
        category          TEXT NOT NULL DEFAULT '',
        logo_url          TEXT,
        google_review_url TEXT,
        is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
        display_order     INT NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Drop old UNIQUE constraint if it exists (v3.1 → v3.2)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'businesses_api_key_key'
        ) THEN
          ALTER TABLE businesses DROP CONSTRAINT businesses_api_key_key;
        END IF;
      END $$;
    `);

    // Add columns if missing (upgrade path)
    await client.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'ng';`);
    await client.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;`);

    // Index AFTER columns exist
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_businesses_api_key
       ON businesses(api_key, display_order);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id            SERIAL PRIMARY KEY,
        business_id   INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        text          TEXT NOT NULL DEFAULT '',
        images        JSONB NOT NULL DEFAULT '[]'::jsonb,
        video_url     TEXT,
        video_render_id TEXT,
        duration_seconds INT NOT NULL DEFAULT 15,
        style         TEXT NOT NULL DEFAULT 'documentary',
        status        TEXT NOT NULL DEFAULT 'draft',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_campaigns_business ON campaigns(business_id, created_at DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS smart_links (
        id              SERIAL PRIMARY KEY,
        campaign_id     INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        slug            TEXT NOT NULL UNIQUE,
        platform        TEXT NOT NULL,
        destination_url TEXT NOT NULL,
        clicks          INT  NOT NULL DEFAULT 0,
        unique_clicks   INT  NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_clicked_at TIMESTAMPTZ
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_smart_links_campaign ON smart_links(campaign_id);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id              SERIAL PRIMARY KEY,
        business_id     INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        campaign_id     INT REFERENCES campaigns(id) ON DELETE SET NULL,
        smart_link_id   INT REFERENCES smart_links(id) ON DELETE SET NULL,
        source_platform TEXT NOT NULL DEFAULT 'direct',
        name            TEXT NOT NULL DEFAULT '',
        phone           TEXT NOT NULL DEFAULT '',
        email           TEXT NOT NULL DEFAULT '',
        ip_address      TEXT,
        ip_city         TEXT,
        user_agent      TEXT,
        referrer        TEXT,
        intent          TEXT NOT NULL DEFAULT 'unknown',
        status          TEXT NOT NULL DEFAULT 'new',
        notes           TEXT NOT NULL DEFAULT '',
        delivered_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business_id, created_at DESC);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id, created_at DESC);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id                SERIAL PRIMARY KEY,
        business_id       INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        lead_id           INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        google_review_url TEXT NOT NULL,
        requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at      TIMESTAMPTZ,
        status            TEXT NOT NULL DEFAULT 'sent',
        review_text       TEXT,
        platform          TEXT NOT NULL DEFAULT 'google',
        error_message     TEXT
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id, requested_at DESC);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_reviews_pending
       ON reviews(status) WHERE status IN ('sent', 'pending');`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS question_finds (
        id            SERIAL PRIMARY KEY,
        business_id   INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        keyword       TEXT NOT NULL,
        country       TEXT NOT NULL DEFAULT 'ng',
        source        TEXT NOT NULL,
        title         TEXT NOT NULL,
        question_url  TEXT NOT NULL,
        snippet       TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'new',
        found_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (business_id, question_url)
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_question_finds_business
       ON question_finds(business_id, found_at DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS drafts (
        id              SERIAL PRIMARY KEY,
        business_id     INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        question_id     INT NOT NULL REFERENCES question_finds(id) ON DELETE CASCADE,
        draft_text      TEXT NOT NULL,
        blog_url        TEXT NOT NULL,
        platform        TEXT NOT NULL DEFAULT 'generic',
        word_count      INT NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'pending',
        posted_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_drafts_business ON drafts(business_id, created_at DESC);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(business_id, status);`
    );

    await client.query('COMMIT');
    console.log('✅ Leads + Multi-business + Q&A schema ready');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// BLOGS
// ============================================================
export async function getOrCreateBlog(apiKey, url = 'unknown') {
  const { rows } = await pool.query(
    `INSERT INTO blogs (api_key, url)
     VALUES ($1, $2)
     ON CONFLICT (api_key) DO UPDATE
       SET url = CASE WHEN EXCLUDED.url <> 'unknown' THEN EXCLUDED.url ELSE blogs.url END,
           updated_at = NOW()
     RETURNING *;`,
    [apiKey, url || 'unknown']
  );
  return rows[0];
}

export async function getBlog(apiKey) {
  const { rows } = await pool.query('SELECT * FROM blogs WHERE api_key = $1', [apiKey]);
  return rows[0] || null;
}

export async function upgradeToPremium(apiKey, email = '') {
  const { rows } = await pool.query(
    `UPDATE blogs
     SET plan = 'premium',
         email = COALESCE(NULLIF($2, ''), email),
         usage = jsonb_set(usage, '{videosMonth}', '0'::jsonb, true),
         updated_at = NOW()
     WHERE api_key = $1
     RETURNING *;`,
    [apiKey, email]
  );
  return rows[0] || null;
}

// ============================================================
// USAGE INCREMENTS
// ============================================================
async function incrementUsage(apiKey, field, dateField, isMonthly, freeLimit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM blogs WHERE api_key = $1 FOR UPDATE',
      [apiKey]
    );
    const blog = rows[0];
    if (!blog) {
      await client.query('ROLLBACK');
      return null;
    }
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const periodKey = isMonthly ? thisMonth : today;
    const lastField = isMonthly ? 'lastVideoDate' : dateField;
    const last = blog.usage?.[lastField] || '';
    const isNewPeriod = isMonthly
      ? last.slice(0, 7) !== periodKey
      : last !== periodKey;
    const current = isNewPeriod ? 0 : (blog.usage?.[field] || 0);
    if (blog.plan === 'free' && freeLimit !== null && current >= freeLimit) {
      await client.query('ROLLBACK');
      return null;
    }
    const updated = await client.query(
      `UPDATE blogs
       SET usage = jsonb_set(
                     jsonb_set(usage, $2, to_jsonb($3::int), true),
                     $4, to_jsonb($5::text), true
                   ),
           updated_at = NOW()
       WHERE api_key = $1
       RETURNING *;`,
      [apiKey, `{${field}}`, current + 1, `{${lastField}}`, periodKey]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export const tryIncrementAudit = (apiKey, freeLimit) =>
  incrementUsage(apiKey, 'auditsToday', 'lastAuditDate', false, freeLimit);

export const tryIncrementBacklink = (apiKey, freeLimit) =>
  incrementUsage(apiKey, 'backlinksToday', 'lastBacklinkDate', false, freeLimit);

export const tryIncrementVideo = (apiKey, premiumLimit) =>
  incrementUsage(apiKey, 'videosMonth', 'lastVideoDate', true, premiumLimit);

// ============================================================
// AUDIT HISTORY
// ============================================================
export async function logAudit({
  apiKey, url, keyword = '', scoreBefore,
  scoreAfter = null, issues = [], fixes = [], fixedHtml = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO audit_history
       (api_key, url, keyword, score_before, score_after, issues, fixes, fixed_html)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *;`,
    [apiKey, url, keyword, scoreBefore, scoreAfter, issues, fixes, fixedHtml]
  );
  return rows[0];
}

export async function getAuditHistory(apiKey, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, url, keyword, score_before, score_after, created_at
     FROM audit_history
     WHERE api_key = $1
     ORDER BY created_at DESC
     LIMIT $2;`,
    [apiKey, limit]
  );
  return rows;
}

// ============================================================
// BACKLINK JOBS
// ============================================================
export async function createBacklinkJob(apiKey, url, type, payload = {}) {
  const { rows } = await pool.query(
    `INSERT INTO backlink_jobs (api_key, url, type, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [apiKey, url, type, payload]
  );
  return rows[0];
}

export async function updateBacklinkJob(id, status, result = {}) {
  const { rows } = await pool.query(
    `UPDATE backlink_jobs
     SET status = $2, result = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *;`,
    [id, status, result]
  );
  return rows[0] || null;
}

export async function getBacklinkJobs(apiKey, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, url, type, status, created_at
     FROM backlink_jobs
     WHERE api_key = $1
     ORDER BY created_at DESC
     LIMIT $2;`,
    [apiKey, limit]
  );
  return rows;
}

// ============================================================
// RENDER JOBS
// ============================================================
export async function createRenderJob(apiKey, renderId, script, clips) {
  const { rows } = await pool.query(
    `INSERT INTO render_jobs (render_id, api_key, status, script, clips)
     VALUES ($1, $2, 'queued', $3, $4)
     RETURNING *;`,
    [renderId, apiKey, script, clips]
  );
  return rows[0];
}

export async function updateRenderJob(renderId, status, outputUrl = null) {
  const { rows } = await pool.query(
    `UPDATE render_jobs
     SET status = $2, output_url = COALESCE($3, output_url), updated_at = NOW()
     WHERE render_id = $1
     RETURNING *;`,
    [renderId, status, outputUrl]
  );
  return rows[0] || null;
}

export async function getRenderJob(renderId) {
  const { rows } = await pool.query(
    'SELECT * FROM render_jobs WHERE render_id = $1',
    [renderId]
  );
  return rows[0] || null;
}

// ============================================================
// SOCIAL ACCOUNTS
// ============================================================
export async function getSocialAccount(apiKey, platform) {
  const { rows } = await pool.query(
    'SELECT * FROM social_accounts WHERE api_key = $1 AND platform = $2',
    [apiKey, platform]
  );
  return rows[0] || null;
}

export async function upsertSocialAccount({
  apiKey, platform, accountId, accountName = '',
  accessTokenEnc, refreshTokenEnc = null,
  expiresAt = null, refreshExpiresAt = null,
  scopes = '', enabled = true,
}) {
  const { rows } = await pool.query(
    `INSERT INTO social_accounts
       (api_key, platform, account_id, account_name,
        access_token_enc, refresh_token_enc,
        expires_at, refresh_expires_at, scopes, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (api_key, platform) DO UPDATE
       SET account_id = EXCLUDED.account_id,
           account_name = EXCLUDED.account_name,
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, social_accounts.refresh_token_enc),
           expires_at = EXCLUDED.expires_at,
           refresh_expires_at = EXCLUDED.refresh_expires_at,
           scopes = EXCLUDED.scopes,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()
     RETURNING *;`,
    [apiKey, platform, accountId, accountName,
     accessTokenEnc, refreshTokenEnc,
     expiresAt, refreshExpiresAt, scopes, enabled]
  );
  return rows[0];
}

export async function updateSocialToken(apiKey, platform, {
  accessTokenEnc, expiresAt = null, lastError = null,
}) {
  const { rows } = await pool.query(
    `UPDATE social_accounts
     SET access_token_enc = $3,
         expires_at = $4,
         last_error = $5,
         updated_at = NOW()
     WHERE api_key = $1 AND platform = $2
     RETURNING *;`,
    [apiKey, platform, accessTokenEnc, expiresAt, lastError]
  );
  return rows[0] || null;
}

export async function markSocialPosted(apiKey, platform) {
  await pool.query(
    `UPDATE social_accounts
     SET last_posted_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE api_key = $1 AND platform = $2;`,
    [apiKey, platform]
  );
}

export async function getSocialAccounts(apiKey) {
  const { rows } = await pool.query(
    `SELECT id, api_key, platform, account_id, account_name,
            enabled, last_posted_at, last_error, expires_at, created_at
     FROM social_accounts
     WHERE api_key = $1
     ORDER BY platform ASC;`,
    [apiKey]
  );
  return rows;
}

// ============================================================
// BUSINESSES — MULTI
// ============================================================
export async function getBusinessLimitForPlan(apiKey) {
  const blog = await getBlog(apiKey);
  if (!blog) return 1;
  return blog.plan === 'premium' ? 3 : 1;
}

export async function listBusinesses(apiKey) {
  const { rows } = await pool.query(
    `SELECT * FROM businesses
     WHERE api_key = $1
     ORDER BY is_primary DESC, display_order ASC, created_at ASC;`,
    [apiKey]
  );
  return rows;
}

export async function countBusinesses(apiKey) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM businesses WHERE api_key = $1',
    [apiKey]
  );
  return rows[0]?.n || 0;
}

export async function createBusiness({
  apiKey = null, name, description = '', address = '',
  city = '', state = '', country = 'ng',
  phone = '', whatsapp = '', email = '', website = '',
  category = '', logoUrl = null, googleReviewUrl = null,
  isPrimary = false,
}) {
  if (apiKey) {
    const limit = await getBusinessLimitForPlan(apiKey);
    const count = await countBusinesses(apiKey);
    if (count >= limit) {
      const err = new Error(
        `Business limit reached (${count}/${limit}). ${
          limit === 1 ? 'Upgrade to Premium for up to 3 businesses.' : ''
        }`.trim()
      );
      err.code = 'BUSINESS_LIMIT';
      err.limit = limit;
      err.count = count;
      throw err;
    }
    if (count === 0) isPrimary = true;
  }

  const { rows } = await pool.query(
    `INSERT INTO businesses
       (api_key, name, description, address, city, state, country,
        phone, whatsapp, email, website, category, logo_url, google_review_url,
        is_primary, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *;`,
    [apiKey, name, description, address, city, state, country,
     phone, whatsapp, email, website, category, logoUrl, googleReviewUrl,
     isPrimary, 0]
  );
  return rows[0];
}

export async function getBusiness(id) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getBusinessByApiKey(apiKey) {
  const list = await listBusinesses(apiKey);
  return list[0] || null;
}

export async function updateBusiness(id, patch) {
  const allowed = [
    'name', 'description', 'address', 'city', 'state', 'country',
    'phone', 'whatsapp', 'email', 'website', 'category',
    'logo_url', 'google_review_url', 'is_primary', 'display_order',
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (sets.length === 0) return getBusiness(id);
  sets.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE businesses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *;`,
    values
  );
  return rows[0] || null;
}

export async function deleteBusiness(id) {
  const { rows } = await pool.query(
    'DELETE FROM businesses WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
}

// ============================================================
// CAMPAIGNS
// ============================================================
export async function createCampaign({
  businessId, name, text = '', images = [],
  videoUrl = null, videoRenderId = null,
  durationSeconds = 15, style = 'documentary', status = 'draft',
}) {
  const { rows } = await pool.query(
    `INSERT INTO campaigns
       (business_id, name, text, images, video_url, video_render_id,
        duration_seconds, style, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *;`,
    [businessId, name, text, JSON.stringify(images),
     videoUrl, videoRenderId, durationSeconds, style, status]
  );
  return rows[0];
}

export async function getCampaign(id) {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listCampaigns(businessId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT * FROM campaigns WHERE business_id = $1
     ORDER BY created_at DESC LIMIT $2;`,
    [businessId, limit]
  );
  return rows;
}

export async function updateCampaign(id, patch) {
  const allowed = ['name', 'text', 'images', 'video_url', 'video_render_id',
    'duration_seconds', 'style', 'status'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = $${i}`);
    values.push(key === 'images' ? JSON.stringify(value) : value);
    i++;
  }
  if (sets.length === 0) return getCampaign(id);
  sets.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE campaigns SET ${sets.join(', ')} WHERE id = $${i} RETURNING *;`,
    values
  );
  return rows[0] || null;
}

// ============================================================
// SMART LINKS
// ============================================================
export async function createSmartLink({ campaignId, slug, platform, destinationUrl }) {
  const { rows } = await pool.query(
    `INSERT INTO smart_links (campaign_id, slug, platform, destination_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [campaignId, slug, platform, destinationUrl]
  );
  return rows[0];
}

export async function getSmartLinkBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT sl.*, c.business_id, c.name AS campaign_name,
            b.name AS business_name, b.whatsapp, b.phone
     FROM smart_links sl
     JOIN campaigns c ON c.id = sl.campaign_id
     JOIN businesses b ON b.id = c.business_id
     WHERE sl.slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

export async function recordSmartLinkClick(slug) {
  const { rows } = await pool.query(
    `UPDATE smart_links SET clicks = clicks + 1, last_clicked_at = NOW()
     WHERE slug = $1 RETURNING *;`,
    [slug]
  );
  return rows[0] || null;
}

export async function listSmartLinks(campaignId) {
  const { rows } = await pool.query(
    `SELECT * FROM smart_links WHERE campaign_id = $1 ORDER BY created_at DESC;`,
    [campaignId]
  );
  return rows;
}

export async function listSmartLinksByBusiness(businessId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT sl.*, c.name AS campaign_name
     FROM smart_links sl
     JOIN campaigns c ON c.id = sl.campaign_id
     WHERE c.business_id = $1
     ORDER BY sl.created_at DESC LIMIT $2;`,
    [businessId, limit]
  );
  return rows;
}

// ============================================================
// LEADS
// ============================================================
export async function createLead({
  businessId, campaignId = null, smartLinkId = null,
  sourcePlatform = 'direct', name = '', phone = '', email = '',
  ipAddress = null, ipCity = null, userAgent = null, referrer = null,
  intent = 'unknown', status = 'new', notes = '',
}) {
  const { rows } = await pool.query(
    `INSERT INTO leads
       (business_id, campaign_id, smart_link_id, source_platform,
        name, phone, email, ip_address, ip_city,
        user_agent, referrer, intent, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *;`,
    [businessId, campaignId, smartLinkId, sourcePlatform,
     name, phone, email, ipAddress, ipCity,
     userAgent, referrer, intent, status, notes]
  );
  return rows[0];
}

export async function getLead(id) {
  const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listLeads(businessId, { status = null, limit = 100 } = {}) {
  if (status) {
    const { rows } = await pool.query(
      `SELECT * FROM leads WHERE business_id = $1 AND status = $2
       ORDER BY created_at DESC LIMIT $3;`,
      [businessId, status, limit]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT * FROM leads WHERE business_id = $1
     ORDER BY created_at DESC LIMIT $2;`,
    [businessId, limit]
  );
  return rows;
}

export async function updateLead(id, patch) {
  const allowed = ['name', 'phone', 'email', 'intent', 'status', 'notes', 'delivered_at'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (sets.length === 0) return getLead(id);
  sets.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE leads SET ${sets.join(', ')} WHERE id = $${i} RETURNING *;`,
    values
  );
  return rows[0] || null;
}

export async function markLeadDelivered(id) {
  return updateLead(id, {
    status: 'delivered',
    delivered_at: new Date().toISOString(),
  });
}

export async function findLeadsDeliveredBefore(cutoffDate) {
  const { rows } = await pool.query(
    `SELECT l.*, b.google_review_url, b.name AS business_name,
            b.whatsapp AS business_whatsapp
     FROM leads l
     JOIN businesses b ON b.id = l.business_id
     WHERE l.status = 'delivered'
       AND l.delivered_at IS NOT NULL
       AND l.delivered_at <= $1
       AND b.google_review_url IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM reviews r WHERE r.lead_id = l.id
       );`,
    [cutoffDate]
  );
  return rows;
}

// ============================================================
// REVIEWS
// ============================================================
export async function createReviewRequest({
  businessId, leadId, googleReviewUrl, platform = 'google', status = 'sent',
}) {
  const { rows } = await pool.query(
    `INSERT INTO reviews
       (business_id, lead_id, google_review_url, platform, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *;`,
    [businessId, leadId, googleReviewUrl, platform, status]
  );
  return rows[0];
}

export async function markReviewSubmitted(id, reviewText = null) {
  const { rows } = await pool.query(
    `UPDATE reviews
     SET status = 'submitted', submitted_at = NOW(),
         review_text = COALESCE($2, review_text)
     WHERE id = $1 RETURNING *;`,
    [id, reviewText]
  );
  return rows[0] || null;
}

export async function markReviewFailed(id, errorMessage) {
  const { rows } = await pool.query(
    `UPDATE reviews
     SET status = 'failed', error_message = $2
     WHERE id = $1
     RETURNING *;`,
    [id, errorMessage]
  );
  return rows[0] || null;
}

export async function listReviews(businessId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT r.*, l.name AS lead_name, l.phone AS lead_phone
     FROM reviews r
     JOIN leads l ON l.id = r.lead_id
     WHERE r.business_id = $1
     ORDER BY r.requested_at DESC LIMIT $2;`,
    [businessId, limit]
  );
  return rows;
}

// ============================================================
// ANALYTICS
// ============================================================
export async function getBusinessAnalytics(businessId) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM campaigns WHERE business_id = $1) AS campaigns,
       (SELECT COUNT(*)::int FROM smart_links sl
        JOIN campaigns c ON c.id = sl.campaign_id
        WHERE c.business_id = $1) AS smart_links,
       (SELECT COALESCE(SUM(sl.clicks), 0)::int FROM smart_links sl
        JOIN campaigns c ON c.id = sl.campaign_id
        WHERE c.business_id = $1) AS total_clicks,
       (SELECT COUNT(*)::int FROM leads WHERE business_id = $1) AS leads,
       (SELECT COUNT(*)::int FROM leads WHERE business_id = $1 AND status = 'delivered') AS leads_delivered,
       (SELECT COUNT(*)::int FROM reviews WHERE business_id = $1) AS reviews_requested,
       (SELECT COUNT(*)::int FROM reviews WHERE business_id = $1 AND status = 'submitted') AS reviews_submitted,
       (SELECT COUNT(*)::int FROM question_finds WHERE business_id = $1) AS questions_found,
       (SELECT COUNT(*)::int FROM drafts WHERE business_id = $1 AND status = 'pending') AS drafts_pending,
       (SELECT COUNT(*)::int FROM drafts WHERE business_id = $1 AND status = 'posted') AS drafts_posted;`,
    [businessId]
  );
  return rows[0];
}

// ============================================================
// Q&A MODULE — QUESTION FINDS
// ============================================================
export async function saveQuestionFinds(businessId, keyword, country, results) {
  if (!results || results.length === 0) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const r of results) {
      const { rows } = await client.query(
        `INSERT INTO question_finds
           (business_id, keyword, country, source, title, question_url, snippet)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (business_id, question_url) DO NOTHING
         RETURNING *;`,
        [businessId, keyword, country, r.source, r.title, r.url, r.snippet || '']
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    return inserted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listQuestionFinds(businessId, { status = null, limit = 100 } = {}) {
  if (status) {
    const { rows } = await pool.query(
      `SELECT * FROM question_finds
       WHERE business_id = $1 AND status = $2
       ORDER BY found_at DESC LIMIT $3;`,
      [businessId, status, limit]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT * FROM question_finds WHERE business_id = $1
     ORDER BY found_at DESC LIMIT $2;`,
    [businessId, limit]
  );
  return rows;
}

export async function getQuestionFind(id) {
  const { rows } = await pool.query(
    'SELECT * FROM question_finds WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function updateQuestionFind(id, patch) {
  const allowed = ['status'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (sets.length === 0) return getQuestionFind(id);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE question_finds SET ${sets.join(', ')} WHERE id = $${i} RETURNING *;`,
    values
  );
  return rows[0] || null;
}

// ============================================================
// Q&A MODULE — DRAFTS
// ============================================================
export async function saveDraft({
  businessId, questionId, draftText, blogUrl, platform = 'generic', wordCount = 0,
}) {
  const { rows } = await pool.query(
    `INSERT INTO drafts
       (business_id, question_id, draft_text, blog_url, platform, word_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *;`,
    [businessId, questionId, draftText, blogUrl, platform, wordCount]
  );
  return rows[0];
}

export async function listDrafts(businessId, { status = null, limit = 100 } = {}) {
  if (status) {
    const { rows } = await pool.query(
      `SELECT d.*, q.title AS question_title, q.question_url, q.source AS question_source
       FROM drafts d
       JOIN question_finds q ON q.id = d.question_id
       WHERE d.business_id = $1 AND d.status = $2
       ORDER BY d.created_at DESC LIMIT $3;`,
      [businessId, status, limit]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT d.*, q.title AS question_title, q.question_url, q.source AS question_source
     FROM drafts d
     JOIN question_finds q ON q.id = d.question_id
     WHERE d.business_id = $1
     ORDER BY d.created_at DESC LIMIT $2;`,
    [businessId, limit]
  );
  return rows;
}

export async function getDraft(id) {
  const { rows } = await pool.query(
    `SELECT d.*, q.title AS question_title, q.question_url
     FROM drafts d
     JOIN question_finds q ON q.id = d.question_id
     WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function updateDraftStatus(id, status) {
  const allowed = ['pending', 'approved', 'posted', 'rejected'];
  if (!allowed.includes(status)) {
    throw new Error('Invalid draft status: ' + status);
  }
  const { rows } = await pool.query(
    `UPDATE drafts
     SET status = $2,
         posted_at = CASE WHEN $2 = 'posted' THEN NOW() ELSE posted_at END
     WHERE id = $1
     RETURNING *;`,
    [id, status]
  );
  return rows[0] || null;
}

// ============================================================
// USERS — AUTH + ADMIN
// ============================================================
export async function createUser({ email, passwordHash, name = '', apiKey, role = 'user' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, api_key, role)
     VALUES (LOWER($1), $2, $3, $4, $5)
     RETURNING id, email, name, role, api_key, created_at, last_login_at;`,
    [email, passwordHash, name, apiKey, role]
  );
  return rows[0];
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, name, role, api_key, created_at, last_login_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function updateUserLastLogin(id) {
  await pool.query(
    'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
    [id]
  );
}

export async function findAdminUser() {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE role = 'admin' LIMIT 1"
  );
  return rows[0] || null;
}

export async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  return rows[0]?.n || 0;
}

export async function listAllUsers(limit = 500) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.api_key, u.created_at, u.last_login_at,
            b.plan, b.usage
     FROM users u
     LEFT JOIN blogs b ON b.api_key = u.api_key
     ORDER BY u.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function claimLegacyKey(apiKey, userId) {
  // Detach any current user using this key, then attach to new user
  await pool.query(
    'UPDATE users SET api_key = NULL WHERE api_key = $1 AND id <> $2',
    [apiKey, userId]
  ).catch(() => {});
  // Note: api_key column is UNIQUE NOT NULL, so this detach won't work
  // as written unless we allow NULL. Use a suffix approach instead.
  const suffix = `_old_${Date.now()}`;
  await pool.query(
    `UPDATE users SET api_key = api_key || $1, updated_at = NOW()
     WHERE api_key = $2 AND id <> $3`,
    [suffix, apiKey, userId]
  ).catch(() => {});
  const { rows } = await pool.query(
    'UPDATE users SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [apiKey, userId]
  );
  return rows[0] || null;
}

export async function updateUserRole(userId, role) {
  const { rows } = await pool.query(
    "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role",
    [role, userId]
  );
  return rows[0] || null;
}

// ============================================================
// EXPORT DEFAULT
// ============================================================
export default {
  pool, initSchema, initSocialSchema, initLeadsSchema, initUsersSchema,
};