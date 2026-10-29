// ============================================================
// Auto Traffic Engine — Main Express server
// v3.5.0 — Q&A, directories, admin, $29 USD, all features
// ============================================================
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
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
  saveQuestionFinds, listQuestionFinds, getQuestionFind,
  saveDraft, listDrafts, updateDraftStatus,
  createUser, findUserByEmail, findUserById, updateUserLastLogin,
  findAdminUser, countUsers, listAllUsers, claimLegacyKey, updateUserRole,
  pool,
} from './db.js';

import { fullAudit } from './seoEngine.js';
import { submitWithJobLog, verifyKeyFile, verifySitemap } from './indexnow.js';
import { generateListingPackages } from './listingGenerator.js';
import { analyzeKeywords } from './keywordEngine.js';
import {
  createVideo, pollShotstackStatus, DURATION_PRESETS, STYLE_TEMPLATES,
} from './videoEngine.js';
import { postForAccount, encryptToken } from './socialPoster.js';
import { startScheduler, runSocialNow } from './scheduler.js';
import {
  resolveSmartLink,
  runReviewCron,
  recordLeadFromWhatsApp,
  createSmartLinkForCampaign,
  isWhatsAppConfigured,
  smartLinkUrl,
} from './leadEngine.js';
import { findQuestions, listSupportedCountries } from './questionFinder.js';
import { generateDraft } from './draftGenerator.js';

// Optional directory module (won't crash if missing)
let dirModule = null;
try {
  dirModule = await import('./directoryGenerator.js');
} catch (e) {
  console.warn('⚠️  directoryGenerator.js not available — directory feature disabled');
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

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: false,
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-cron-secret'],
}));

app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.url.startsWith('/api/webhook/') || /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|map)$/.test(req.url),
}));

app.use('/api/webhook/flutterwave', express.json({ limit: '1mb' }));
app.use('/api/webhook/whatsapp', express.json({ limit: '2mb' }));
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
const generalLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
const checkPlanLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many plan checks' } });
const auditLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many audits' } });
const videoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many video requests' } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 1000, message: { error: 'Webhook rate limit' } });
const questionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: { error: 'Too many question searches' } });
const draftLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, message: { error: 'Too many draft requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });
const dirLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many directory requests' } });

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
  const apiKey = req.body?.key || req.query?.key || req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 4) return res.status(401).json({ error: 'Authentication required' });
  req.apiKey = apiKey;
  next();
}

function requireCronSecret(req, res, next) {
  const provided = req.headers['x-cron-secret'];
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (provided !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// ============================================================
// HEALTH
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: '3.5.0',
    env: NODE_ENV,
    uptime: Math.round(process.uptime()),
    ai: AI_PROVIDER,
    demoMode: process.env.DEMO_MODE === 'true',
    price: { USD: PREMIUM_PRICE_USD },
    flutterwaveConfigured: Boolean(process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY),
    auth: {
      enabled: true,
      jwtConfigured: Boolean(process.env.JWT_SECRET),
      adminConfigured: Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
    },
    services: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      pexels: Boolean(process.env.PEXELS_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      shotstack: Boolean(process.env.SHOTSTACK_API_KEY),
      flutterwave: Boolean(process.env.FLUTTERWAVE_SECRET_KEY),
      whatsapp: isWhatsAppConfigured(),
      indexnow: Boolean(process.env.INDEXNOW_KEY),
      dataForSeo: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
      directoryGenerator: Boolean(dirModule),
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
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    await updateUserLastLogin(user.id);
    const token = signToken({ userId: user.id, email: user.email, role: user.role, apiKey: user.api_key });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, apiKey: user.api_key } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  try { res.json({ users: await listAllUsers(), total: (await listAllUsers()).length }); }
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
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    res.json({ user: await updateUserRole(Number(req.params.id), role) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PLAN
// ============================================================
app.get('/api/check-plan', checkPlanLimiter, requireApiKey, async (req, res) => {
  try {
    if (req.user && req.user.role === 'admin') {
      return res.json({
        plan: 'premium',
        usage: { auditsToday: 0, videosMonth: 0, backlinksToday: 0 },
        limits: { freeAudits: 999999, premiumVideos: 999999, backlinks: 999999, businesses: 999999, price: 0 },
        isAdmin: true,
      });
    }
    const blog = await getOrCreateBlog(req.apiKey, req.query.url || 'unknown');
    res.json({
      plan: blog.plan,
      usage: blog.usage,
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
// SEO AUDIT
// ============================================================
app.post('/api/audit', auditLimiter, requireApiKey, async (req, res) => {
  const { url, keyword = '', autoFix = true } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin) {
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
// BACKLINK
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

app.post('/api/backlink/listing', generalLimiter, requireApiKey, async (req, res) => {
  if (!req.body.profile?.name) return res.status(400).json({ error: 'profile.name required' });
  try { res.json(await generateListingPackages({ profile: req.body.profile, openai: aiClient })); }
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
  const { topic, businessName = '', durationSeconds = 15, style = 'documentary' } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });
  const isAdmin = req.user && req.user.role === 'admin';
  const blog = await getOrCreateBlog(req.apiKey);
  if (blog.plan !== 'premium' && !isAdmin) return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
  if (!isAdmin) {
    const maxVideos = Number(process.env.PREMIUM_VIDEOS_PER_MONTH) || 30;
    const updated = await tryIncrementVideo(req.apiKey, maxVideos);
    if (!updated) return res.status(403).json({ error: 'MONTHLY_LIMIT_REACHED' });
  }
  try {
    const result = await createVideo({ topic, businessName, durationSeconds, style });
    if (result.renderId) await createRenderJob(req.apiKey, result.renderId, result.script, result.clips).catch(() => {});
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/video-status/:renderId', async (req, res) => {
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

// ============================================================
// BUSINESSES
// ============================================================
app.post('/api/businesses', generalLimiter, requireApiKey, async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    res.json({ business: await createBusiness({ apiKey: req.apiKey, ...req.body, isAdmin }) });
  } catch (e) {
    if (e.code === 'BUSINESS_LIMIT') return res.status(403).json({ error: 'BUSINESS_LIMIT', message: e.message, limit: e.limit, count: e.count });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/list', generalLimiter, requireApiKey, async (req, res) => {
  try {
    const businesses = await listBusinesses(req.apiKey);
    const isAdmin = req.user && req.user.role === 'admin';
    const limit = isAdmin ? 999999 : await getBusinessLimitForPlan(req.apiKey);
    res.json({ businesses, limit, count: businesses.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/me', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ business: await getBusinessByApiKey(req.apiKey) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id', generalLimiter, async (req, res) => {
  try {
    const b = await getBusiness(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Not found' });
    res.json({ business: b });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/businesses/:id', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ business: await updateBusiness(Number(req.params.id), req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/businesses/:id', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ business: await deleteBusiness(Number(req.params.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CAMPAIGNS
// ============================================================
app.post('/api/campaigns', generalLimiter, requireApiKey, async (req, res) => {
  const { businessId, name, text = '', images = [], durationSeconds = 15, style = 'documentary', platforms = ['fb', 'ig', 'jiji', 'linkedin', 'gmb', 'direct'] } = req.body;
  if (!businessId || !name) return res.status(400).json({ error: 'businessId and name required' });
  try {
    const campaign = await createCampaign({ businessId: Number(businessId), name, text, images, durationSeconds, style });
    const business = await getBusiness(Number(businessId));
    const { links, errors } = await createSmartLinkForCampaign({ campaign, business, platforms, createSmartLinkFn: createSmartLink });
    res.json({ campaign, links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })), errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:id', generalLimiter, async (req, res) => {
  try {
    const campaign = await getCampaign(Number(req.params.id));
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const links = await listSmartLinks(campaign.id);
    res.json({ campaign, links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/campaigns', generalLimiter, async (req, res) => {
  try { res.json({ campaigns: await listCampaigns(Number(req.params.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/campaigns/:id', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ campaign: await updateCampaign(Number(req.params.id), req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:id/links', generalLimiter, async (req, res) => {
  try {
    const links = await listSmartLinks(Number(req.params.id));
    res.json({ links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// LEADS
// ============================================================
app.post('/api/leads', generalLimiter, requireApiKey, async (req, res) => {
  const { businessId, campaignId = null, sourcePlatform = 'direct', name = '', phone = '', email = '', intent = 'unknown', notes = '' } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId required' });
  try {
    res.json({ lead: await createLead({ businessId: Number(businessId), campaignId: campaignId ? Number(campaignId) : null, sourcePlatform, name, phone, email, intent, notes, status: 'new' }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/leads', generalLimiter, async (req, res) => {
  try { res.json({ leads: await listLeads(Number(req.params.id), { status: req.query.status || null, limit: Number(req.query.limit) || 100 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leads/:id', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ lead: await updateLead(Number(req.params.id), req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leads/:id/delivered', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ lead: await markLeadDelivered(Number(req.params.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// REVIEWS & ANALYTICS
// ============================================================
app.get('/api/businesses/:id/reviews', generalLimiter, async (req, res) => {
  try { res.json({ reviews: await listReviews(Number(req.params.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/analytics', generalLimiter, async (req, res) => {
  try { res.json({ analytics: await getBusinessAnalytics(Number(req.params.id)) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Q&A
// ============================================================
app.get('/api/questions/sources', (req, res) => {
  res.json({ countries: listSupportedCountries() });
});

app.all('/api/questions/find', questionLimiter, requireApiKey, async (req, res) => {
  const params = req.method === 'GET' ? req.query : (req.body || {});
  const businessId = params.businessId;
  const keyword = params.keyword || params.q;
  const country = params.country || 'ng';
  if (!businessId || !keyword) return res.status(400).json({ error: 'businessId and keyword required' });

  const isAdmin = req.user && req.user.role === 'admin';
  const blog = await getBlog(req.apiKey);
  if ((!blog || blog.plan !== 'premium') && !isAdmin) {
    return res.status(403).json({
      error: 'PREMIUM_REQUIRED',
      message: 'Question Finder is Premium. Log in as admin OR demo-upgrade this key.',
      demoMode: process.env.DEMO_MODE === 'true',
    });
  }

  try {
    const found = await findQuestions({ keyword, country, limitPerSource: 10 });
    const saved = await saveQuestionFinds(Number(businessId), keyword, country, found.results);
    res.json({ keyword, country, totalFound: found.totalFound, newlySaved: saved.length, sourceStatus: found.sourceStatus, warnings: found.warnings, questions: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/questions', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ questions: await listQuestionFinds(Number(req.params.id), { status: req.query.status || null, limit: Number(req.query.limit) || 100 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions/:id/draft', draftLimiter, requireApiKey, async (req, res) => {
  const { blogUrl, blogTitle } = req.body;
  if (!blogUrl) return res.status(400).json({ error: 'blogUrl required' });
  const isAdmin = req.user && req.user.role === 'admin';
  const blog = await getBlog(req.apiKey);
  if ((!blog || blog.plan !== 'premium') && !isAdmin) return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
  try {
    const question = await getQuestionFind(Number(req.params.id));
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const result = await generateDraft({ questionTitle: question.title, questionUrl: question.question_url, blogTitle: blogTitle || blog.url || 'Full guide', blogUrl });
    if (!result.ok) return res.status(422).json({ error: 'DRAFT_REJECTED', reason: result.reason, draft: result.draft });
    const saved = await saveDraft({ businessId: question.business_id, questionId: question.id, draftText: result.draft, blogUrl, platform: result.platform, wordCount: result.wordCount });
    res.json({ draft: saved, platform: result.platform, wordCount: result.wordCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/businesses/:id/drafts', generalLimiter, requireApiKey, async (req, res) => {
  try { res.json({ drafts: await listDrafts(Number(req.params.id), { status: req.query.status || null, limit: Number(req.query.limit) || 100 }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/drafts/:id/status', generalLimiter, requireApiKey, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  try { res.json({ draft: await updateDraftStatus(Number(req.params.id), status) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// DIRECTORIES
// ============================================================
app.get('/api/directories/countries', (req, res) => {
  if (!dirModule) return res.status(503).json({ error: 'Directory feature not available' });
  try { res.json({ countries: dirModule.listSupportedCountries() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/directories/:country', (req, res) => {
  if (!dirModule) return res.status(503).json({ error: 'Directory feature not available' });
  try {
    const result = dirModule.listDirectories(req.params.country);
    if (!result) return res.status(404).json({ error: 'Country not supported' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/directories/generate', dirLimiter, requireApiKey, async (req, res) => {
  if (!dirModule) return res.status(503).json({ error: 'Directory feature not available' });
  const { profile, country = 'ng', limit = 30, language = 'en' } = req.body;
  if (!profile?.name) return res.status(400).json({ error: 'profile.name required' });

  const isAdmin = req.user && req.user.role === 'admin';
  const blog = await getBlog(req.apiKey);
  if ((!blog || blog.plan !== 'premium') && !isAdmin) {
    return res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Directory listings are Premium' });
  }

  try {
    let result = await dirModule.generateListingsForCountry({ profile, country, limit, useAI: Boolean(aiClient) });

    // Translate if language is not English and translator is available
    if (language !== 'en' && dirModule.translateListing) {
      for (const listing of result.listings) {
        try {
          listing.title = await dirModule.translateListing(listing.title, language);
          listing.description = await dirModule.translateListing(listing.description, language);
          listing.pasteBlock = `${listing.title}\n\n${listing.description}\n\nBusiness: ${profile.name}\nLocation: ${profile.city || ''}, ${profile.state || ''}\nPhone: ${profile.phone || 'N/A'}\nWebsite: ${profile.website || '—'}`;
        } catch (e) {
          console.warn('Translation failed for', listing.directory, e.message);
        }
      }
      result.translated = language;
    }

    res.json(result);
  } catch (e) {
    console.error('Directory error:', e.message);
    res.status(500).json({ error: e.message });
  }
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
app.post('/api/webhook/flutterwave', webhookLimiter, async (req, res) => {
  const expectedHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const providedHash = req.headers['verif-hash'];
  if (!expectedHash) return res.status(500).json({ error: 'Server misconfigured' });
  if (providedHash !== expectedHash) return res.status(401).json({ error: 'Invalid signature' });
  res.status(200).json({ received: true });
  try {
    const event = req.body;
    if (event?.event !== 'charge.completed') return;
    const data = event.data || {};
    const transactionId = data.id;
    const metadata = data.meta || data.metadata || {};
    const apiKey = metadata.api_key;
    if (!transactionId || !apiKey) return;
    const verifyRes = await axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` }, timeout: 15000 });
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

app.post('/api/webhook/whatsapp', webhookLimiter, async (req, res) => {
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
app.get('/l/:slug', async (req, res) => {
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
// ROOT + ERROR
// ============================================================
app.get('/', (req, res) => res.redirect('/app.html'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// ============================================================
// BOOT
// ============================================================
async function boot() {
  try {
    if (process.env.DATABASE_URL) {
      console.log('🔄 Initializing schemas...');
      await initSchema();
      await initSocialSchema();
      await initLeadsSchema();
      await initUsersSchema();
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      try {
        const existingAdmin = await findAdminUser();
        if (!existingAdmin) {
          const apiKey = generateApiKey(adminEmail);
          await getOrCreateBlog(apiKey, 'unknown');
          await createUser({ email: adminEmail, passwordHash: hashPassword(adminPassword), name: 'Admin', apiKey, role: 'admin' });
          console.log(`✅ Admin created: ${adminEmail}`);
        } else {
          const emailMatch = existingAdmin.email.toLowerCase() === adminEmail.toLowerCase();
          const passwordMatch = verifyPassword(adminPassword, existingAdmin.password_hash);
          if (!emailMatch || !passwordMatch) {
            try {
              await pool.query(`UPDATE users SET email = LOWER($1), password_hash = $2, role = 'admin', updated_at = NOW() WHERE id = $3`, [adminEmail, hashPassword(adminPassword), existingAdmin.id]);
              console.log(`✅ Admin synced: ${adminEmail}`);
            } catch (syncErr) {
              if (syncErr.code === '23505') console.warn(`⚠️  Cannot sync admin: email in use`);
              else throw syncErr;
            }
          } else {
            console.log(`ℹ️  Admin in sync: ${existingAdmin.email}`);
          }
        }
      } catch (e) { console.warn('Admin setup failed:', e.message); }
    }

    startScheduler();

    app.listen(PORT, () => {
      console.log(`🚀 Auto Traffic Engine v3.5.0 on port ${PORT}`);
      console.log(`   Env: ${NODE_ENV}`);
      console.log(`   AI: ${AI_PROVIDER}`);
      console.log(`   Public URL: ${PUBLIC_BASE_URL}`);
      console.log(`   Directory generator: ${dirModule ? '✅ available' : '⚠️  not loaded'}`);
    });
  } catch (e) {
    console.error('❌ Boot failed:', e.message);
    process.exit(1);
  }
}

boot();

process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT', () => { process.exit(0); });