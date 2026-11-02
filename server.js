// ============================================================
// Auto Traffic Engine -- Main Express server (v4.0.0)
// Clean route ordering; consolidated feature routes.
// ============================================================
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import OpenAI from 'openai';

dotenv.config();

import {
  hashPassword, verifyPassword, signToken, verifyToken,
  generateApiKey, validateEmail, validatePassword,
} from './auth.js';

import {
  initSchema, initSocialSchema, initLeadsSchema, initUsersSchema,
  initDirectoryPostingsSchema,
  getOrCreateBlog, getBlog, upgradeToPremium,
  tryIncrementAudit, tryIncrementVideo,
  logAudit,
  createRenderJob, updateRenderJob,
  createBusiness, getBusiness, getBusinessByApiKey, updateBusiness,
  listBusinesses, deleteBusiness, getBusinessLimitForPlan,
  createCampaign, getCampaign, listCampaigns, updateCampaign,
  createSmartLink, listSmartLinks,
  createLead, listLeads, updateLead, markLeadDelivered,
  listReviews, getBusinessAnalytics,
  getSocialAccounts, upsertSocialAccount,
  listQuestionFinds, listDrafts, updateDraftStatus,
  createUser, findUserByEmail, findUserById, updateUserLastLogin,
  findAdminUser, countUsers, listAllUsers, claimLegacyKey, updateUserRole,
  markDirectoryPosted, listDirectoryPostings, unmarkDirectoryPosted,
  pool,
} from './db.js';

import { fullAudit } from './seoEngine.js';
import { submitWithJobLog, verifyKeyFile, verifySitemap } from './indexnow.js';
import { analyzeKeywords } from './keywordEngine.js';
import {
  createVideo, pollShotstackStatus, DURATION_PRESETS, STYLE_TEMPLATES,
} from './videoEngine.js';
import { postForAccount, encryptToken, listFacebookPages } from './socialPoster.js';
import { startScheduler, runSocialNow } from './scheduler.js';
import {
  resolveSmartLink,
  runReviewCron,
  recordLeadFromWhatsApp,
  createSmartLinkForCampaign,
  isWhatsAppConfigured,
  smartLinkUrl,
} from './leadEngine.js';
import { listSupportedCountries } from './questionFinder.js';
import { initTrackedLinksSchema, registerTrackedLinkRoutes } from './trackedLinks.js';
import { registerDirectoryRoutes } from './directoryData.js';
import { registerFeatureRoutes } from './features.js';

// Optional directory generator (dynamic import)
let dirModule = null;
try {
  dirModule = await import('./directoryGenerator.js');
} catch (e) {
  console.warn('[!] directoryGenerator.js not available - directory feature disabled');
}

// ============================================================
// CONFIG
// ============================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 10000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const PREMIUM_PRICE_USD = 29;

const FB_GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v23.0';
const FB_OAUTH_BASE = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`;
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
let aiClient = null;
if (AI_PROVIDER === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
  aiClient = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
} else if (process.env.OPENAI_API_KEY) {
  aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ============================================================
// APP
// ============================================================
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: false,
}));

// iframe embedding allowed (Blogspot-safe). The payment page is the one
// exception -- we never want it framed (clickjacking on the checkout flow).
app.use((req, res, next) => {
  const pathname = req.path || '';
  if (pathname.startsWith('/pay')) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
  } else {
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  }
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-cron-secret', 'x-hub-signature-256'],
}));

app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.url.startsWith('/api/webhook/') || req.url.startsWith('/l/') || /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|map)$/.test(req.url),
}));

// NOTE: the WhatsApp route needs the raw body to verify X-Hub-Signature-256.
app.use('/api/webhook/flutterwave', express.json({ limit: '1mb' }));
app.use('/api/webhook/whatsapp', express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: NODE_ENV === 'production' ? '1h' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('widget.js') || filePath.endsWith('embed.js')) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  },
}));

// ============================================================
// RATE LIMITERS
// ============================================================
const GENERAL_MAX = Number(process.env.RATE_LIMIT_PER_HOUR) || 300;

const generalLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: GENERAL_MAX, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
const checkPlanLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many plan checks' } });
const auditLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many audits' } });
const videoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many video requests' } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000, message: { error: 'Webhook rate limit' } });
const draftLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, message: { error: 'Too many draft requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });
const dirLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many directory requests' } });
const dirTranslateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, message: { error: 'Too many translation requests' } });
const slugLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many requests' });

// ============================================================
// HELPERS
// ============================================================
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isAdminReq(req) {
  return Boolean(req.user && req.user.role === 'admin');
}

// Strip anything an anonymous caller must never see from a business row.
function publicBusiness(row) {
  if (!row) return row;
  const out = { ...row };
  delete out.api_key;
  for (const k of Object.keys(out)) {
    if (/_enc$/.test(k) || /token|secret|password/i.test(k)) delete out[k];
  }
  return out;
}

// ============================================================
// MIDDLEWARE
// ============================================================
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  req.apiKey = payload.apiKey;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7));
    if (payload) { req.user = payload; req.apiKey = payload.apiKey; return next(); }
  }
  // NOTE: `?key=` is legacy and ends up in access logs / browser history.
  // Prefer the `x-api-key` header. Still accepted here for backward compat.
  const apiKey = req.headers['x-api-key'] || req.body?.key || req.query?.key;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 4) return res.status(401).json({ error: 'Authentication required' });
  req.apiKey = apiKey;
  next();
}

function requireCronSecret(req, res, next) {
  const provided = req.headers['x-cron-secret'];
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// ---- Ownership guards -------------------------------------------------
// requireApiKey proves *who* you are. These prove *what you own*.
// They return 404 (not 403) on mismatch so IDs can't be enumerated.

async function requireBusinessAccess(req, res, next) {
  const id = parseId(req.params.id ?? req.params.businessId ?? req.body?.businessId);
  if (id === null) return res.status(400).json({ error: 'Invalid business id' });
  try {
    const business = await getBusiness(id);
    if (!business) return res.status(404).json({ error: 'Not found' });
    if (!isAdminReq(req) && business.api_key !== req.apiKey) return res.status(404).json({ error: 'Not found' });
    req.business = business;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function requireCampaignAccess(req, res, next) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid campaign id' });
  try {
    const campaign = await getCampaign(id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    if (!isAdminReq(req)) {
      const business = await getBusiness(campaign.business_id);
      if (!business || business.api_key !== req.apiKey) return res.status(404).json({ error: 'Not found' });
    }
    req.campaign = campaign;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Whitelisted table names -- never interpolate user input into SQL.
const OWNED_TABLES = new Set(['leads', 'drafts', 'question_finds']);

function requireRowAccess(table) {
  if (!OWNED_TABLES.has(table)) throw new Error(`requireRowAccess: unsupported table ${table}`);
  return async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid id' });
    if (isAdminReq(req)) return next();
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM ${table} t JOIN businesses b ON b.id = t.business_id
          WHERE t.id = $1 AND b.api_key = $2 LIMIT 1`,
        [id, req.apiKey]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      next();
    } catch (e) { res.status(500).json({ error: e.message }); }
  };
}

// ---- WhatsApp signature verification ---------------------------------
function verifyWhatsAppSignature(req, res, next) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    if (NODE_ENV === 'production') {
      console.warn('[!] WHATSAPP_APP_SECRET not set -- rejecting WhatsApp webhook');
      return res.status(503).json({ error: 'Webhook not configured' });
    }
    console.warn('[!] WHATSAPP_APP_SECRET not set -- skipping signature check (dev only)');
    return next();
  }
  const provided = req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}

// ============================================================
// HEALTH
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    ok: true, version: '4.0.0', env: NODE_ENV,
    uptime: Math.round(process.uptime()), ai: AI_PROVIDER,
    demoMode: process.env.DEMO_MODE === 'true',
    price: { USD: PREMIUM_PRICE_USD },
    flutterwaveConfigured: Boolean(process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY),
    facebookOAuthConfigured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.FACEBOOK_REDIRECT_URI),
    facebookGraphVersion: FB_GRAPH_VERSION,
    auth: { enabled: true, jwtConfigured: Boolean(process.env.JWT_SECRET), adminConfigured: Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) },
    services: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      pexels: Boolean(process.env.PEXELS_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      shotstack: Boolean(process.env.SHOTSTACK_API_KEY),
      flutterwave: Boolean(process.env.FLUTTERWAVE_SECRET_KEY),
      whatsapp: isWhatsAppConfigured(),
      whatsappSignature: Boolean(process.env.WHATSAPP_APP_SECRET),
      indexnow: Boolean(process.env.INDEXNOW_KEY),
      directoryGenerator: Boolean(dirModule),
      trackedLinks: true,
      tokenEncryption: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
    },
    time: new Date().toISOString(),
  });
});

app.get('/api/video-styles', (req, res) => {
  res.json({
    styles: Object.entries(STYLE_TEMPLATES).map(([key, tpl]) => ({ key, label: tpl.label, description: tpl.description })),
    durations: Object.keys(DURATION_PRESETS).map(Number),
  });
});

// ============================================================
// AUTH
// ============================================================
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, name = '' } = req.body || {};
    if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });
    const apiKey = generateApiKey(email);
    const passwordHash = hashPassword(password);
    await getOrCreateBlog(apiKey, 'unknown');
    const user = await createUser({ email, passwordHash, name, apiKey, role: 'user' });
    const token = signToken({ userId: user.id, email: user.email, role: user.role, apiKey: user.api_key });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, apiKey: user.api_key } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    await updateUserLastLogin(user.id);
    const token = signToken({ userId: user.id, email: user.email, role: user.role, apiKey: user.api_key });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, apiKey: user.api_key } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => res.json({ ok: true }));

// ============================================================
// ADMIN
// ============================================================
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await countUsers();
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM blogs) AS total_blogs,
        (SELECT COUNT(*)::int FROM blogs WHERE plan = 'premium') AS premium_blogs,
        (SELECT COUNT(*)::int FROM businesses) AS total_businesses,
        (SELECT COUNT(*)::int FROM leads) AS total_leads,
        (SELECT COUNT(*)::int FROM question_finds) AS total_questions,
        (SELECT COUNT(*)::int FROM drafts WHERE status = 'posted') AS drafts_posted;
    `);
    res.json({ total_users: totalUsers, ...rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try { const u = await listAllUsers(); res.json({ users: u, total: u.length }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/all-businesses', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT b.*, u.email as owner_email FROM businesses b LEFT JOIN users u ON u.api_key = b.api_key ORDER BY b.created_at DESC`);
    res.json({ businesses: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/all-leads', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT l.*, b.name as business_name FROM leads l JOIN businesses b ON b.id = l.business_id ORDER BY l.created_at DESC LIMIT 500`);
    res.json({ leads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/all-campaigns', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT c.*, b.name as business_name FROM campaigns c JOIN businesses b ON b.id = c.business_id ORDER BY c.created_at DESC`);
    res.json({ campaigns: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/claim-legacy', requireAdmin, async (req, res) => {
  try {
    const { apiKey } = req.body || {};
    if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
    const blog = await getBlog(apiKey);
    if (!blog) return res.status(404).json({ error: 'No blog with that key' });
    const updated = await claimLegacyKey(apiKey, req.user.userId);
    res.json({ ok: true, apiKey, message: `Linked to key "${apiKey}"`, user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid id' });
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    res.json({ user: await updateUserRole(id, role) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PLAN
// ============================================================
app.get('/api/check-plan', checkPlanLimiter, requireApiKey, async (req, res) => {
  try {
    if (isAdminReq(req)) {
      return res.json({
        plan: 'premium',
        usage: { auditsToday: 0, videosMonth: 0, backlinksToday: 0 },
        limits: { freeAudits: 999999, premiumVideos: 999999, backlinks: 999999, businesses: 999999, price: 0 },
        isAdmin: true,
      });
    }
    const blog = await getOrCreateBlog(req.apiKey, req.query.url || 'unknown');
    res.json({
      plan: blog.plan, usage: blog.usage,
      limits: {
        freeAudits: Number(process.env.FREE_AUDITS_PER_DAY) || 3,
        premiumVideos: Number(process.env.PREMIUM_VIDEOS_PER_MONTH) || 30,
        backlinks: Number(process.env.PREMIUM_BACKLINKS_PER_DAY) || 10,
        businesses: blog.plan === 'premium' ? 3 : 1,
        price: PREMIUM_PRICE_USD,
      },
      isAdmin: false,
    });
  } catch (e) { res.status(500).json({ error: 'Failed to check plan' }); }
});

// ============================================================
// SEO AUDIT (legacy endpoint -- /api/audit)
// The new /api/seo/audit is provided by features.js.
// ============================================================
app.post('/api/audit', auditLimiter, requireApiKey, async (req, res) => {
  const { url, keyword = '', autoFix = true } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!isAdminReq(req)) {
    const freeLimit = Number(process.env.FREE_AUDITS_PER_DAY) || 3;
    const updated = await tryIncrementAudit(req.apiKey, freeLimit);
    if (!updated) return res.status(403).json({ error: 'FREE_LIMIT', message: 'Daily limit reached' });
  }
  try {
    const result = await fullAudit({ url, keyword, openai: aiClient, autoFix });
    await logAudit({ apiKey: req.apiKey, url, keyword, scoreBefore: result.before.score, scoreAfter: result.after?.score ?? null, issues: result.before.issues, fixes: result.fixes, fixedHtml: result.fixedHtml }).catch(() => {});
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Audit failed', details: e.message }); }
});

// ============================================================
// BACKLINK (legacy endpoints -- features.js adds /api/backlink/submit, /api/backlink/jobs)
// ============================================================
app.post('/api/backlink/indexnow', generalLimiter, requireApiKey, async (req, res) => {
  const { urls, siteUrl, url } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls required' });
  try { res.json(await submitWithJobLog({ apiKey: req.apiKey, urls, siteUrl: siteUrl || url })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/backlink/verify-key', generalLimiter, requireApiKey, async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: 'url required' });
  try { res.json(await verifyKeyFile({ siteUrl: req.query.url, key: process.env.INDEXNOW_KEY })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/backlink/sitemap', generalLimiter, requireApiKey, async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: 'url required' });
  try { res.json(await verifySitemap(new URL('/sitemap.xml', req.query.url).toString())); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// KEYWORDS
// ============================================================
app.post('/api/keywords', generalLimiter, requireApiKey, async (req, res) => {
  const { seeds = [], manualKeywords = [], url = null, country = 'ng', language = 'en' } = req.body;
  if (seeds.length === 0 && manualKeywords.length === 0) return res.status(400).json({ error: 'seeds or manualKeywords required' });
  try {
    const dataForSeo = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
      ? { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD } : null;
    res.json(await analyzeKeywords({ seeds, manualKeywords, url, country, language, dataForSeo }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// VIDEO
// ============================================================
app.post('/api/create-video', videoLimiter, requireApiKey, async (req, res) => {
  const { topic, businessName = '', durationSeconds = 15, style = 'documentary' } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic required' });
  const isAdmin = isAdminReq(req);
  try {
    const blog = await getOrCreateBlog(req.apiKey);
    if (blog.plan !== 'premium' && !isAdmin) return res.status(403).json({ error: 'PREMIUM_REQUIRED' });

    const maxVideos = Number(process.env.PREMIUM_VIDEOS_PER_MONTH) || 30;
    const used = Number(blog?.usage?.videosMonth ?? blog?.usage?.videos_month ?? 0);
    if (!isAdmin && used >= maxVideos) return res.status(403).json({ error: 'MONTHLY_LIMIT_REACHED' });

    const result = await createVideo({ topic, businessName, durationSeconds, style });

    if (result.renderId) {
      await createRenderJob(req.apiKey, result.renderId, result.script, result.clips).catch(() => {});
      // Increment only after the render actually started -- a Shotstack
      // outage should not silently burn a user's monthly allowance.
      if (!isAdmin) {
        const counted = await tryIncrementVideo(req.apiKey, maxVideos).catch(() => false);
        if (!counted) console.warn('[!] video quota increment failed after render', req.apiKey.slice(0, 6) + '***');
      }
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/video-status/:renderId', generalLimiter, async (req, res) => {
  try {
    const status = await pollShotstackStatus(req.params.renderId);
    if (status?.status === 'done' && status.url) await updateRenderJob(req.params.renderId, 'done', status.url).catch(() => {});
    res.json(status);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SOCIAL
// ============================================================
app.post('/api/social/connect', generalLimiter, requireApiKey, async (req, res) => {
  const { platform, accountId, accountName = '', accessToken, expiresAt = null } = req.body;
  if (!['facebook', 'linkedin'].includes(platform)) return res.status(400).json({ error: 'Invalid platform' });
  if (!accountId || !accessToken) return res.status(400).json({ error: 'accountId and accessToken required' });
  try {
    const account = await upsertSocialAccount({ apiKey: req.apiKey, platform, accountId, accountName, accessTokenEnc: encryptToken(accessToken), expiresAt: expiresAt ? new Date(expiresAt) : null });
    res.json({ ok: true, account: { ...account, access_token_enc: undefined } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/social/accounts', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ accounts: await getSocialAccounts(req.apiKey) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/social/post-now', generalLimiter, requireApiKey, async (req, res) => {
  const { platform, message, link = null } = req.body;
  if (!platform || !message) return res.status(400).json({ error: 'platform and message required' });
  try { res.json(await postForAccount({ apiKey: req.apiKey, platform, message, link })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/social/facebook/connect', generalLimiter, requireApiKey, (req, res) => {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
  if (!appId || !redirectUri) {
    return res.status(500).json({ error: 'Facebook OAuth not configured. Add FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI.' });
  }
  const returnUrl = req.query.redirect || '';
  const state = Buffer.from(JSON.stringify({ apiKey: req.apiKey, returnUrl })).toString('base64url');
  const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts';
  const authUrl =
    `${FB_OAUTH_BASE}?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}&scope=${scopes}&response_type=code`;
  console.log('[FB] OAuth redirect:', { graphVersion: FB_GRAPH_VERSION, scopes, redirectUri });
  res.redirect(authUrl);
});

app.get('/api/social/facebook/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const FRONTEND = process.env.PUBLIC_BASE_URL || 'https://growthbot-aprv.onrender.com';

  console.log('[FB] OAuth callback:', {
    graphVersion: FB_GRAPH_VERSION,
    hasCode: !!code, hasState: !!state,
    error: error || null, errorDescription: error_description || null,
  });

  const buildRedirect = (params) => {
    let returnForUrl = '';
    try {
      if (state) {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
        returnForUrl = decoded.returnUrl || '';
      }
    } catch {}
    const qs = new URLSearchParams(params).toString();
    let url = `${FRONTEND}/app.html?${qs}`;
    if (returnForUrl) url += `&return=${encodeURIComponent(returnForUrl)}`;
    return url;
  };

  if (error || !code || !state) {
    return res.redirect(buildRedirect({ fb_error: error_description || 'cancelled' }));
  }

  let apiKey;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    apiKey = decoded.apiKey;
    if (!apiKey) throw new Error('Missing apiKey');
  } catch (e) {
    return res.redirect(buildRedirect({ fb_error: 'invalid_state' }));
  }

  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

    const shortRes = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
      timeout: 15000,
    });
    const shortToken = shortRes.data.access_token;
    if (!shortToken) throw new Error('No short token');

    const longRes = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken },
      timeout: 15000,
    });
    const longToken = longRes.data.access_token;
    if (!longToken) throw new Error('No long-lived token');

    const pagesResult = await listFacebookPages(longToken);
    if (!pagesResult.ok) {
      console.error('[X] listFacebookPages failed:', pagesResult.error);
      return res.redirect(buildRedirect({ fb_error: pagesResult.error }));
    }
    const pages = pagesResult.pages || [];

    if (pages.length === 0) {
      return res.redirect(buildRedirect({
        fb_error: 'No Facebook Pages found. Create one at facebook.com/pages/create, then reconnect.',
      }));
    }

    if (pages.length === 1) {
      const page = pages[0];
      await upsertSocialAccount({
        apiKey, platform: 'facebook',
        accountId: page.id, accountName: page.name,
        accessTokenEnc: encryptToken(page.accessToken), expiresAt: null,
      });
      return res.redirect(buildRedirect({ fb_connected: '1', page: page.name }));
    }

    const pickerPayload = {
      apiKey,
      pages: pages.map((p) => ({
        id: p.id, name: p.name,
        category: p.category || '',
        token: encryptToken(p.accessToken),
      })),
      issuedAt: Date.now(),
    };
    const sessionBlob = Buffer.from(JSON.stringify(pickerPayload)).toString('base64url');
    return res.redirect(buildRedirect({ fb_choose: '1', session: sessionBlob }));
  } catch (e) {
    console.error('[X] Facebook OAuth error:', {
      graphVersion: FB_GRAPH_VERSION,
      status: e.response?.status,
      facebookError: e.response?.data?.error,
      message: e.message,
    });
    const msg = e.response?.data?.error?.message || e.message || 'oauth_failed';
    return res.redirect(buildRedirect({ fb_error: msg }));
  }
});

app.post('/api/social/facebook/select-page', generalLimiter, requireApiKey, async (req, res) => {
  const { session, pageId } = req.body;
  if (!session || !pageId) return res.status(400).json({ error: 'session and pageId required' });

  let payload;
  try {
    payload = JSON.parse(Buffer.from(session, 'base64url').toString());
  } catch (e) {
    return res.status(400).json({ error: 'Invalid session blob' });
  }
  if (Date.now() - (payload.issuedAt || 0) > 15 * 60 * 1000) {
    return res.status(400).json({ error: 'Session expired. Please reconnect Facebook.' });
  }
  if (payload.apiKey !== req.apiKey) {
    return res.status(403).json({ error: 'Session does not match API key' });
  }
  const page = (payload.pages || []).find((p) => p.id === pageId);
  if (!page) return res.status(404).json({ error: 'Page not found in session' });

  try {
    await upsertSocialAccount({
      apiKey: req.apiKey, platform: 'facebook',
      accountId: page.id, accountName: page.name,
      accessTokenEnc: page.token, expiresAt: null,
    });
    res.json({ ok: true, page: { id: page.id, name: page.name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/social/facebook/debug', requireAdmin, async (req, res) => {
  const diagnostics = {
    graphVersion: FB_GRAPH_VERSION,
    envConfigured: {
      FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || null,
      FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ? '(set)' : null,
      FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI || null,
      FACEBOOK_GRAPH_VERSION: process.env.FACEBOOK_GRAPH_VERSION || null,
      TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ? '(set)' : null,
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null,
    },
    graphProbe: null,
  };
  try {
    const r = await axios.get(`${FB_GRAPH_BASE}/me`, {
      params: { access_token: 'INVALID_TEST_TOKEN_FOR_DIAG' },
      validateStatus: () => true,
      timeout: 10000,
    });
    diagnostics.graphProbe = { status: r.status, facebookResponse: r.data };
  } catch (e) {
    diagnostics.graphProbe = { error: e.message };
  }
  res.json(diagnostics);
});

// ============================================================
// BUSINESSES
// ============================================================
app.post('/api/businesses', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ business: await createBusiness({ apiKey: req.apiKey, ...req.body, isAdmin: isAdminReq(req) }) });
  } catch (e) {
    if (e.code === 'BUSINESS_LIMIT') return res.status(403).json({ error: 'BUSINESS_LIMIT', message: e.message, limit: e.limit, count: e.count });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/list', generalLimiter, requireApiKey, async (req, res) => {
  try {
    const businesses = await listBusinesses(req.apiKey);
    const limit = isAdminReq(req) ? 999999 : await getBusinessLimitForPlan(req.apiKey);
    res.json({ businesses, limit, count: businesses.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/me', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ business: await getBusinessByApiKey(req.apiKey) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Public business profile -- sanitized (no api_key / tokens).
// Lock this down too if the profile is never consumed by anon users.
app.get('/api/businesses/:id', generalLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  try {
    const b = await getBusiness(id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    res.json({ business: publicBusiness(b) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/businesses/:id', generalLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ business: await updateBusiness(req.business.id, req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/businesses/:id', generalLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ business: await deleteBusiness(req.business.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CAMPAIGNS
// ============================================================
app.post('/api/campaigns', generalLimiter, requireApiKey, async (req, res) => {
  const { businessId, name, text = '', images = [], durationSeconds = 15, style = 'documentary', platforms = ['fb', 'ig', 'jiji', 'linkedin', 'gmb', 'direct'] } = req.body;
  const bid = parseId(businessId);
  if (bid === null || !name) return res.status(400).json({ error: 'businessId and name required' });
  try {
    const business = await getBusiness(bid);
    if (!business) return res.status(404).json({ error: 'Not found' });
    if (!isAdminReq(req) && business.api_key !== req.apiKey) return res.status(404).json({ error: 'Not found' });

    const campaign = await createCampaign({ businessId: bid, name, text, images, durationSeconds, style });
    const { links, errors } = await createSmartLinkForCampaign({ campaign, business, platforms, createSmartLinkFn: createSmartLink });
    res.json({ campaign, links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })), errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:id', generalLimiter, requireApiKey, requireCampaignAccess, async (req, res) => {
  try {
    const links = await listSmartLinks(req.campaign.id);
    res.json({ campaign: req.campaign, links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/campaigns', generalLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ campaigns: await listCampaigns(req.business.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/campaigns/:id', generalLimiter, requireApiKey, requireCampaignAccess, async (req, res) => {
  try { res.json({ campaign: await updateCampaign(req.campaign.id, req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:id/links', generalLimiter, requireApiKey, requireCampaignAccess, async (req, res) => {
  try {
    const links = await listSmartLinks(req.campaign.id);
    res.json({ links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// LEADS
// ============================================================
app.post('/api/leads', generalLimiter, requireApiKey, async (req, res) => {
  const { businessId, campaignId = null, sourcePlatform = 'direct', name = '', phone = '', email = '', intent = 'unknown', notes = '' } = req.body;
  const bid = parseId(businessId);
  if (bid === null) return res.status(400).json({ error: 'businessId required' });
  try {
    const business = await getBusiness(bid);
    if (!business) return res.status(404).json({ error: 'Not found' });
    if (!isAdminReq(req) && business.api_key !== req.apiKey) return res.status(404).json({ error: 'Not found' });

    res.json({ lead: await createLead({ businessId: bid, campaignId: campaignId ? Number(campaignId) : null, sourcePlatform, name, phone, email, intent, notes, status: 'new' }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PII -- owner only.
app.get('/api/businesses/:id/leads', generalLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ leads: await listLeads(req.business.id, { status: req.query.status || null, limit: Number(req.query.limit) || 100 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leads/:id', generalLimiter, requireApiKey, requireRowAccess('leads'), async (req, res) => {
  try { res.json({ lead: await updateLead(Number(req.params.id), req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:id/delivered', generalLimiter, requireApiKey, requireRowAccess('leads'), async (req, res) => {
  try { res.json({ lead: await markLeadDelivered(Number(req.params.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// REVIEWS & ANALYTICS
// ============================================================
// Reviews are public (used by the embeddable review widget).
app.get('/api/businesses/:id/reviews', generalLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  try { res.json({ reviews: await listReviews(id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/analytics', generalLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ analytics: await getBusinessAnalytics(req.business.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Q&A -- read-only routes (find/draft are in features.js)
// ============================================================
app.get('/api/questions/sources', (req, res) => {
  res.json({ countries: listSupportedCountries() });
});

app.get('/api/businesses/:id/questions', generalLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ questions: await listQuestionFinds(req.business.id, { status: req.query.status || null, limit: Number(req.query.limit) || 100 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/drafts', generalLimiter, draftLimiter, requireApiKey, requireBusinessAccess, async (req, res) => {
  try { res.json({ drafts: await listDrafts(req.business.id, { status: req.query.status || null, limit: Number(req.query.limit) || 100 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/drafts/:id/status', generalLimiter, draftLimiter, requireApiKey, requireRowAccess('drafts'), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  try { res.json({ draft: await updateDraftStatus(Number(req.params.id), status) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// DIRECTORIES (read-only; submit is in features.js)
// ============================================================
app.get('/api/directories/countries', (req, res) => {
  if (!dirModule) return res.status(503).json({ error: 'Directory feature not available' });
  try { res.json({ countries: dirModule.listSupportedCountries() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/directories/translate', dirTranslateLimiter, requireApiKey, async (req, res) => {
  if (!dirModule) return res.status(503).json({ error: 'Directory feature not available' });
  const { postTitle = '', postContent = '', targetLang } = req.body || {};
  if (!targetLang) return res.status(400).json({ error: 'targetLang required' });
  if (!postTitle && !postContent) return res.status(400).json({ error: 'postTitle or postContent required' });

  const isAdmin = isAdminReq(req);
  const blog = await getBlog(req.apiKey);
  if ((!blog || blog.plan !== 'premium') && !isAdmin) {
    return res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Directory listings are Premium' });
  }

  try {
    res.json(await dirModule.translateListing({ postTitle, postContent, targetLang }));
  } catch (e) {
    console.error('Directory translate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/directories/mark-posted', dirLimiter, requireApiKey, async (req, res) => {
  const { businessId, directoryName, directoryUrl, postedUrl, title } = req.body || {};
  const bid = parseId(businessId);
  if (bid === null || !directoryName) {
    return res.status(400).json({ error: 'businessId and directoryName are required' });
  }
  try {
    const business = await getBusiness(bid);
    if (!business) return res.status(404).json({ error: 'Not found' });
    if (!isAdminReq(req) && business.api_key !== req.apiKey) return res.status(404).json({ error: 'Not found' });

    const posting = await markDirectoryPosted({
      apiKey: req.apiKey,
      businessId: bid,
      directoryName,
      directoryUrl: directoryUrl || null,
      postedUrl: postedUrl || null,
      title: title || null,
    });
    res.json({ ok: true, posting });
  } catch (e) {
    console.error('mark-posted error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/directories/postings', generalLimiter, requireApiKey, async (req, res) => {
  const businessId = parseId(req.query.businessId);
  if (businessId === null) return res.status(400).json({ error: 'businessId query param required' });
  try {
    const postings = await listDirectoryPostings(req.apiKey, businessId);
    res.json({ postings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/directories/postings', generalLimiter, requireApiKey, async (req, res) => {
  const { businessId, directoryName } = req.body || {};
  const bid = parseId(businessId);
  if (bid === null || !directoryName) {
    return res.status(400).json({ error: 'businessId and directoryName are required' });
  }
  try {
    await unmarkDirectoryPosted({ apiKey: req.apiKey, businessId: bid, directoryName });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PAYMENT
// ============================================================
app.get('/api/payment/status', (req, res) => {
  const configured = Boolean(process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY);
  res.json({
    configured, demoMode: process.env.DEMO_MODE === 'true', price: PREMIUM_PRICE_USD, currency: 'USD',
    message: configured ? 'Payment gateway ready' : 'Payment gateway not configured',
  });
});

app.post('/api/payment/init', generalLimiter, requireApiKey, async (req, res) => {
  if (!process.env.FLUTTERWAVE_PUBLIC_KEY || !process.env.FLUTTERWAVE_SECRET_KEY) {
    return res.status(503).json({ error: 'PAYMENT_NOT_CONFIGURED', message: 'Payment not configured', demoMode: process.env.DEMO_MODE === 'true' });
  }
  const txRef = `ATE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.json({ tx_ref: txRef, amount: PREMIUM_PRICE_USD, currency: 'USD', public_key: process.env.FLUTTERWAVE_PUBLIC_KEY, email: req.body.email || '', metadata: { api_key: req.apiKey }, callback_url: `${PUBLIC_BASE_URL}/pay.html?status=success` });
});

app.post('/api/payment/demo-upgrade', generalLimiter, requireApiKey, async (req, res) => {
  if (process.env.DEMO_MODE !== 'true') return res.status(403).json({ error: 'Demo mode disabled' });
  try {
    const blog = await upgradeToPremium(req.apiKey, req.body.email || 'demo@example.com');
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    res.json({ ok: true, plan: blog.plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// WEBHOOKS
// ============================================================
// Idempotency: claim the transaction before acting on it. Replays and
// duplicate charge.completed events are dropped.
async function claimPaymentEvent(txId) {
  if (!pool || !process.env.DATABASE_URL) return true; // no DB -> best effort
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO payment_events (tx_id) VALUES ($1) ON CONFLICT (tx_id) DO NOTHING`,
      [String(txId)]
    );
    return rowCount === 1;
  } catch (e) {
    console.warn('[!] payment_events claim failed:', e.message);
    return true; // fail open so a DB hiccup doesn't block a real upgrade
  }
}

app.post('/api/webhook/flutterwave', webhookLimiter, async (req, res) => {
  const expectedHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const providedHash = req.headers['verif-hash'];
  if (!expectedHash) return res.status(500).json({ error: 'Server misconfigured' });

  const a = Buffer.from(String(providedHash || ''));
  const b = Buffer.from(String(expectedHash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Invalid signature' });

  // Ack fast; Flutterwave retries on non-2xx.
  res.status(200).json({ received: true });

  try {
    const event = req.body;
    if (event?.event !== 'charge.completed') return;
    const data = event.data || {};
    const transactionId = data.id;
    const metadata = data.meta || data.metadata || {};
    const apiKey = metadata.api_key;
    if (!transactionId || !apiKey) return;

    if (!(await claimPaymentEvent(transactionId))) {
      console.log('[i] duplicate payment webhook ignored:', transactionId);
      return;
    }

    const verifyRes = await axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
      timeout: 15000,
    });
    const verified = verifyRes.data?.data;
    if (!verified || verified.status !== 'successful') return;
    if (Number(verified.amount) < PREMIUM_PRICE_USD) return;
    if (verified.currency !== 'USD') return;

    await upgradeToPremium(apiKey, verified.customer?.email || '');
  } catch (e) { console.error('Webhook error:', e.message); }
});

app.get('/api/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.status(403).send('Forbidden');
});

app.post('/api/webhook/whatsapp', webhookLimiter, verifyWhatsAppSignature, async (req, res) => {
  res.status(200).json({ received: true });
  try { await recordLeadFromWhatsApp(req.body); } catch (e) { console.error(e.message); }
});

// ============================================================
// CRON
// ============================================================
app.post('/api/cron/social', requireCronSecret, async (req, res) => {
  try { res.json(await runSocialNow(req.body?.window || 'manual')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cron/reviews', requireCronSecret, async (req, res) => {
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
  try { res.json(await runReviewCron({ hoursAgo: 24, dryRun })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SMART LINK
// ============================================================
app.get('/l/:slug', slugLimiter, async (req, res) => {
  try {
    const result = await resolveSmartLink({ slug: req.params.slug, ip: getClientIp(req), userAgent: req.headers['user-agent'] || null, referrer: req.headers['referer'] || null });
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.redirect(302, result.redirectUrl);
  } catch (e) {
    if (e.code === 'LINK_NOT_FOUND') return res.status(404).send('Link not found');
    res.status(500).send('Redirect failed');
  }
});

// ============================================================
// ROOT
// ============================================================
app.get('/', (req, res) => res.redirect('/app.html'));

// ============================================================
// === FEATURE ROUTES (MUST COME BEFORE 404 CATCH-ALL) ===
// ============================================================
registerTrackedLinkRoutes(app, requireApiKey);
registerDirectoryRoutes(app, requireApiKey);
registerFeatureRoutes(app, requireApiKey);

// ============================================================
// 404 + ERROR HANDLERS (AFTER all routes)
// ============================================================
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// ============================================================
// BOOT
// ============================================================
let httpServer = null;

async function initPaymentEventsSchema() {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_events (
        tx_id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[OK] payment_events schema ready');
  } catch (e) {
    console.warn('[!] payment_events schema init failed:', e.message);
  }
}

async function boot() {
  try {
    if (process.env.DATABASE_URL) {
      console.log('[..] Initializing schemas...');
      await initSchema();
      await initSocialSchema();
      await initLeadsSchema();
      await initUsersSchema();
      await initDirectoryPostingsSchema();
      await initPaymentEventsSchema();
    }
    await initTrackedLinksSchema();

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      try {
        const existingAdmin = await findAdminUser();
        if (!existingAdmin) {
          const apiKey = generateApiKey(adminEmail);
          await getOrCreateBlog(apiKey, 'unknown');
          await createUser({ email: adminEmail, passwordHash: hashPassword(adminPassword), name: 'Admin', apiKey, role: 'admin' });
          console.log(`[OK] Admin created: ${adminEmail}`);
        } else {
          const emailMatch = existingAdmin.email.toLowerCase() === adminEmail.toLowerCase();
          const passwordMatch = verifyPassword(adminPassword, existingAdmin.password_hash);
          if (!emailMatch || !passwordMatch) {
            try {
              await pool.query(`UPDATE users SET email = LOWER($1), password_hash = $2, role = 'admin', updated_at = NOW() WHERE id = $3`, [adminEmail, hashPassword(adminPassword), existingAdmin.id]);
              console.log(`[OK] Admin synced: ${adminEmail}`);
            } catch (syncErr) {
              if (syncErr.code === '23505') console.warn(`[!] Cannot sync admin: email in use`);
              else throw syncErr;
            }
          } else {
            console.log(`[i] Admin in sync: ${existingAdmin.email}`);
          }
        }
      } catch (e) { console.warn('Admin setup failed:', e.message); }
    }

    startScheduler();

    httpServer = app.listen(PORT, () => {
      console.log(`==> Auto Traffic Engine v4.0.0 on port ${PORT}`);
      console.log(`   Env: ${NODE_ENV}`);
      console.log(`   Public URL: ${PUBLIC_BASE_URL}`);
      console.log(`   Directory generator: ${dirModule ? '[OK]' : '[!] not loaded'}`);
      console.log(`   Facebook OAuth: ${process.env.FACEBOOK_APP_ID ? '[OK] configured' : '[!] not configured'}`);
      console.log(`   Facebook Graph API version: ${FB_GRAPH_VERSION}`);
      console.log(`   WhatsApp signature: ${process.env.WHATSAPP_APP_SECRET ? '[OK] enforced' : '[!] WHATSAPP_APP_SECRET missing'}`);
      console.log(`   iframe embedding: [OK] allowed (Blogspot-safe; /pay is frame-denied)`);
    });
  } catch (e) {
    console.error('[X] Boot failed:', e.message);
    process.exit(1);
  }
}

boot();

process.on('unhandledRejection', (err) => {
  console.error('[X] Unhandled rejection:', err?.message || err);
});

function shutdown(signal) {
  console.log(`[i] ${signal} received, shutting down`);
  if (!httpServer) return process.exit(0);
  httpServer.close(() => {
    pool?.end?.().catch(() => {}).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));