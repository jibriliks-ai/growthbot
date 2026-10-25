// ============================================================
// GrowthBot — Main Express server
// v3.1 — wires SEO, keywords, backlinks, video, social, and MOD 5 leads
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

// ============================================================
// MODULES
// ============================================================
import {
  initSchema, initSocialSchema, initLeadsSchema,
  getOrCreateBlog, getBlog, upgradeToPremium,
  tryIncrementAudit, tryIncrementVideo,
  logAudit,
  createRenderJob, updateRenderJob,
  createBusiness, getBusiness, getBusinessByApiKey, updateBusiness,
  createCampaign, getCampaign, listCampaigns, updateCampaign,
  createSmartLink, listSmartLinks,
  createLead, listLeads, updateLead, markLeadDelivered,
  listReviews, getBusinessAnalytics,
  getSocialAccounts, upsertSocialAccount,
} from './db.js';

import { fullAudit } from './seoEngine.js';
import { submitWithJobLog, verifyKeyFile, verifySitemap } from './indexnow.js';
import { generateListingPackages } from './listingGenerator.js';
import { analyzeKeywords } from './keywordEngine.js';
import { createVideo, pollShotstackStatus, DURATION_PRESETS, STYLE_TEMPLATES } from './videoEngine.js';
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

// ============================================================
// CONFIG
// ============================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 10000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const PREMIUM_PRICE_NGN = Number(process.env.PREMIUM_PRICE_NGN) || 5000;

// AI client (OpenAI or DeepSeek — selected by AI_PROVIDER)
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
let aiClient = null;
if (AI_PROVIDER === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
  aiClient = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });
} else if (process.env.OPENAI_API_KEY) {
  aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ============================================================
// APP
// ============================================================
const app = express();
app.set('trust proxy', 1); // Render / Render-like proxies

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(
  helmet({
    // Dashboard + widget use inline scripts, and the widget is embedded cross-origin
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: '*', // widget must load from any Blogger / blog domain
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// Skip logging for static files and webhooks (PII in webhook payloads)
app.use(
  morgan(NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req) =>
      req.url.startsWith('/api/webhook/') ||
      /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|map)$/.test(req.url),
  })
);

// Body parsers — webhook routes first so they get their own limit
app.use('/api/webhook/flutterwave', express.json({ limit: '1mb' }));
app.use('/api/webhook/whatsapp', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================================
// STATIC FILES
// ============================================================
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: NODE_ENV === 'production' ? '1h' : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('widget.js')) {
        // Widget is loaded by every blog visitor — 5-minute cache
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    },
  })
);

// ============================================================
// RATE LIMITERS
// ============================================================
const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});

const checkPlanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // widget polls this
  message: { error: 'Too many plan checks' },
});

const auditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many audits — slow down or upgrade' },
});

const videoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many video requests' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000, // webhooks must succeed even under load
  message: { error: 'Webhook rate limit exceeded' },
});

// ============================================================
// MIDDLEWARE HELPERS
// ============================================================
function requireApiKey(req, res, next) {
  const apiKey =
    req.body?.key || req.query?.key || req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 4) {
    return res.status(400).json({ error: 'Missing or invalid api key' });
  }
  req.apiKey = apiKey;
  next();
}

function requireCronSecret(req, res, next) {
  const provided = req.headers['x-cron-secret'];
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  )
    .split(',')[0]
    .trim();
}

// ============================================================
// HEALTH & META
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: '3.1.0',
    env: NODE_ENV,
    uptime: Math.round(process.uptime()),
    ai: AI_PROVIDER,
    demoMode: process.env.DEMO_MODE === 'true',
    price: {
      NGN: Number(process.env.PREMIUM_PRICE_NGN) || 5000,
    },
    flutterwaveConfigured: Boolean(
      process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY
    ),
    services: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      pexels: Boolean(process.env.PEXELS_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      shotstack: Boolean(process.env.SHOTSTACK_API_KEY),
      flutterwave: Boolean(process.env.FLUTTERWAVE_SECRET_KEY),
      whatsapp: isWhatsAppConfigured(),
      indexnow: Boolean(process.env.INDEXNOW_KEY),
      dataForSeo: Boolean(
        process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
      ),
    },
    time: new Date().toISOString(),
  });
});

app.get('/api/video-styles', (req, res) => {
  res.json({
    styles: Object.entries(STYLE_TEMPLATES).map(([key, tpl]) => ({
      key,
      label: tpl.label,
      description: tpl.description,
    })),
    durations: Object.keys(DURATION_PRESETS).map(Number),
  });
});

// ============================================================
// PLAN CHECK
// ============================================================
app.get('/api/check-plan', checkPlanLimiter, requireApiKey, async (req, res) => {
  try {
    const blog = await getOrCreateBlog(req.apiKey, req.query.url || 'unknown');
    res.json({
      plan: blog.plan,
      usage: blog.usage,
      limits: {
        freeAudits: Number(process.env.FREE_AUDITS_PER_DAY) || 3,
        premiumVideos: Number(process.env.PREMIUM_VIDEOS_PER_MONTH) || 30,
        backlinks: Number(process.env.PREMIUM_BACKLINKS_PER_DAY) || 10,
        price: PREMIUM_PRICE_NGN,
      },
    });
  } catch (e) {
    console.error('Plan check error:', e.message);
    res.status(500).json({ error: 'Failed to check plan' });
  }
});

// ============================================================
// SEO AUDIT
// ============================================================
app.post('/api/audit', auditLimiter, requireApiKey, async (req, res) => {
  const { url, keyword = '', autoFix = true } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const freeLimit = Number(process.env.FREE_AUDITS_PER_DAY) || 3;
  const updated = await tryIncrementAudit(req.apiKey, freeLimit);
  if (!updated) {
    return res.status(403).json({
      error: 'FREE_LIMIT',
      message: 'Daily free audit limit reached',
    });
  }

  try {
    const result = await fullAudit({
      url,
      keyword,
      openai: aiClient,
      autoFix,
    });
    await logAudit({
      apiKey: req.apiKey,
      url,
      keyword,
      scoreBefore: result.before.score,
      scoreAfter: result.after?.score ?? null,
      issues: result.before.issues,
      fixes: result.fixes,
      fixedHtml: result.fixedHtml,
    }).catch((e) => console.error('logAudit failed:', e.message));
    res.json(result);
  } catch (e) {
    console.error('Audit error:', e.message);
    res.status(500).json({ error: 'Audit failed', details: e.message });
  }
});

// ============================================================
// BACKLINK
// ============================================================
app.post('/api/backlink/indexnow', generalLimiter, requireApiKey, async (req, res) => {
  const { urls, siteUrl, url } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array is required' });
  }
  try {
    const result = await submitWithJobLog({
      apiKey: req.apiKey,
      urls,
      siteUrl: siteUrl || url,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/backlink/verify-key', generalLimiter, requireApiKey, async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: 'url query required' });
  try {
    res.json(
      await verifyKeyFile({ siteUrl: req.query.url, key: process.env.INDEXNOW_KEY })
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/backlink/sitemap', generalLimiter, requireApiKey, async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: 'url query required' });
  try {
    const sitemapUrl = new URL('/sitemap.xml', req.query.url).toString();
    res.json(await verifySitemap(sitemapUrl));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/backlink/listing', generalLimiter, requireApiKey, async (req, res) => {
  if (!req.body.profile?.name) {
    return res.status(400).json({ error: 'profile.name is required' });
  }
  try {
    const result = await generateListingPackages({
      profile: req.body.profile,
      openai: aiClient,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// KEYWORDS
// ============================================================
app.post('/api/keywords', generalLimiter, requireApiKey, async (req, res) => {
  const {
    seeds = [],
    manualKeywords = [],
    url = null,
    country = 'ng',
    language = 'en',
  } = req.body;

  if (seeds.length === 0 && manualKeywords.length === 0) {
    return res.status(400).json({ error: 'Provide seeds or manualKeywords' });
  }

  try {
    const dataForSeo =
      process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
        ? {
            login: process.env.DATAFORSEO_LOGIN,
            password: process.env.DATAFORSEO_PASSWORD,
          }
        : null;

    const result = await analyzeKeywords({
      seeds,
      manualKeywords,
      url,
      country,
      language,
      dataForSeo,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// VIDEO
// ============================================================
app.post('/api/create-video', videoLimiter, requireApiKey, async (req, res) => {
  const {
    topic,
    businessName = '',
    durationSeconds = 15,
    style = 'documentary',
  } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  const blog = await getOrCreateBlog(req.apiKey);
  if (blog.plan !== 'premium') {
    return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
  }

  const maxVideos = Number(process.env.PREMIUM_VIDEOS_PER_MONTH) || 30;
  const updated = await tryIncrementVideo(req.apiKey, maxVideos);
  if (!updated) {
    return res.status(403).json({ error: 'MONTHLY_LIMIT_REACHED' });
  }

  try {
    const result = await createVideo({ topic, businessName, durationSeconds, style });
    if (result.renderId) {
      await createRenderJob(req.apiKey, result.renderId, result.script, result.clips)
        .catch((e) => console.error('createRenderJob failed:', e.message));
    }
    res.json(result);
  } catch (e) {
    console.error('Video create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/video-status/:renderId', async (req, res) => {
  try {
    const status = await pollShotstackStatus(req.params.renderId);
    if (status?.status === 'done' && status.url) {
      await updateRenderJob(req.params.renderId, 'done', status.url)
        .catch((e) => console.error('updateRenderJob failed:', e.message));
    }
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SOCIAL
// ============================================================
app.post('/api/social/connect', generalLimiter, requireApiKey, async (req, res) => {
  const { platform, accountId, accountName = '', accessToken, expiresAt = null } = req.body;
  if (!['facebook', 'linkedin'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be facebook or linkedin' });
  }
  if (!accountId || !accessToken) {
    return res.status(400).json({ error: 'accountId and accessToken required' });
  }
  try {
    const account = await upsertSocialAccount({
      apiKey: req.apiKey,
      platform,
      accountId,
      accountName,
      accessTokenEnc: encryptToken(accessToken),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    res.json({ ok: true, account: { ...account, access_token_enc: undefined } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/social/accounts', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ accounts: await getSocialAccounts(req.apiKey) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/social/post-now', generalLimiter, requireApiKey, async (req, res) => {
  const { platform, message, link = null } = req.body;
  if (!platform || !message) {
    return res.status(400).json({ error: 'platform and message required' });
  }
  try {
    res.json(
      await postForAccount({ apiKey: req.apiKey, platform, message, link })
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// BUSINESSES
// ============================================================
app.post('/api/businesses', generalLimiter, requireApiKey, async (req, res) => {
  try {
    const business = await createBusiness({ apiKey: req.apiKey, ...req.body });
    res.json({ business });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/me', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ business: await getBusinessByApiKey(req.apiKey) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/:id', generalLimiter, async (req, res) => {
  try {
    const business = await getBusiness(Number(req.params.id));
    if (!business) return res.status(404).json({ error: 'Not found' });
    res.json({ business });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/businesses/:id', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ business: await updateBusiness(Number(req.params.id), req.body) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// CAMPAIGNS
// ============================================================
app.post('/api/campaigns', generalLimiter, requireApiKey, async (req, res) => {
  const {
    businessId,
    name,
    text = '',
    images = [],
    durationSeconds = 15,
    style = 'documentary',
    platforms = ['fb', 'ig', 'jiji', 'linkedin', 'gmb', 'direct'],
  } = req.body;
  if (!businessId || !name) {
    return res.status(400).json({ error: 'businessId and name required' });
  }
  try {
    const campaign = await createCampaign({
      businessId: Number(businessId),
      name,
      text,
      images,
      durationSeconds,
      style,
    });
    const business = await getBusiness(Number(businessId));
    const { links, errors } = await createSmartLinkForCampaign({
      campaign,
      business,
      platforms,
      createSmartLinkFn: createSmartLink,
    });
    res.json({
      campaign,
      links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })),
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/campaigns/:id', generalLimiter, async (req, res) => {
  try {
    const campaign = await getCampaign(Number(req.params.id));
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const links = await listSmartLinks(campaign.id);
    res.json({
      campaign,
      links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/:id/campaigns', generalLimiter, async (req, res) => {
  try {
    res.json({ campaigns: await listCampaigns(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/campaigns/:id', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ campaign: await updateCampaign(Number(req.params.id), req.body) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/campaigns/:id/links', generalLimiter, async (req, res) => {
  try {
    const links = await listSmartLinks(Number(req.params.id));
    res.json({ links: links.map((l) => ({ ...l, publicUrl: smartLinkUrl(l.slug) })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// LEADS
// ============================================================
app.post('/api/leads', generalLimiter, requireApiKey, async (req, res) => {
  const {
    businessId,
    campaignId = null,
    sourcePlatform = 'direct',
    name = '',
    phone = '',
    email = '',
    intent = 'unknown',
    notes = '',
  } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId required' });
  try {
    const lead = await createLead({
      businessId: Number(businessId),
      campaignId: campaignId ? Number(campaignId) : null,
      sourcePlatform,
      name,
      phone,
      email,
      intent,
      notes,
      status: 'new',
    });
    res.json({ lead });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/:id/leads', generalLimiter, async (req, res) => {
  try {
    res.json({
      leads: await listLeads(Number(req.params.id), {
        status: req.query.status || null,
        limit: Number(req.query.limit) || 100,
      }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/leads/:id', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ lead: await updateLead(Number(req.params.id), req.body) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/leads/:id/delivered', generalLimiter, requireApiKey, async (req, res) => {
  try {
    res.json({ lead: await markLeadDelivered(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// REVIEWS & ANALYTICS
// ============================================================
app.get('/api/businesses/:id/reviews', generalLimiter, async (req, res) => {
  try {
    res.json({ reviews: await listReviews(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/businesses/:id/analytics', generalLimiter, async (req, res) => {
  try {
    res.json({ analytics: await getBusinessAnalytics(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SMART LINK REDIRECT — /l/:slug
// ============================================================
app.get('/l/:slug', async (req, res) => {
  try {
    const result = await resolveSmartLink({
      slug: req.params.slug,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      referrer: req.headers['referer'] || null,
    });
    // 302 not 301 — every click must hit the server for tracking
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.redirect(302, result.redirectUrl);
  } catch (e) {
    if (e.code === 'LINK_NOT_FOUND') {
      return res.status(404).send('Link not found or expired');
    }
    console.error('Smart link error:', e.message);
    res.status(500).send('Redirect failed');
  }
});

// ============================================================
// WEBHOOK: FLUTTERWAVE
// ============================================================
app.post('/api/webhook/flutterwave', webhookLimiter, async (req, res) => {
  // 1. Verify verif-hash (direct comparison — Flutterwave's documented method)
  const expectedHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const providedHash = req.headers['verif-hash'];
  if (!expectedHash) {
    console.error('❌ FLUTTERWAVE_SECRET_HASH not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (providedHash !== expectedHash) {
    console.warn('❌ Flutterwave webhook: invalid verif-hash');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Acknowledge immediately — Flutterwave retries on non-2xx
  res.status(200).json({ received: true });

  // 3. Process asynchronously
  try {
    const event = req.body;
    if (event?.event !== 'charge.completed') {
      console.log('Ignoring Flutterwave event:', event?.event);
      return;
    }

    const data = event.data || {};
    const transactionId = data.id;
    const metadata = data.meta || data.metadata || {};
    const apiKey = metadata.api_key;
    const email = data.customer?.email || '';

    if (!transactionId || !apiKey) {
      console.warn('❌ Webhook missing transactionId or api_key in metadata');
      return;
    }

    // 4. Server-side verification — the security step that matters
    const verifyRes = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
        timeout: 15_000,
      }
    );
    const verified = verifyRes.data?.data;
    if (!verified || verified.status !== 'successful') {
      console.warn('❌ Flutterwave verification failed:', verified?.status);
      return;
    }

    // 5. Check amount + currency
    if (Number(verified.amount) < PREMIUM_PRICE_NGN) {
      console.warn(
        `❌ Amount mismatch: got ${verified.amount}, expected ${PREMIUM_PRICE_NGN}`
      );
      return;
    }
    if (verified.currency !== 'NGN') {
      console.warn(`❌ Currency mismatch: ${verified.currency}`);
      return;
    }

    // 6. Upgrade the user
    const blog = await upgradeToPremium(apiKey, verified.customer?.email || email);
    if (!blog) {
      console.warn('❌ Could not upgrade blog:', apiKey);
      return;
    }
    console.log(
      `✅ Premium upgrade: ${apiKey} — ${verified.amount} ${verified.currency}`
    );
  } catch (e) {
    console.error('❌ Flutterwave webhook error:', e.message);
  }
});

// ============================================================
// WEBHOOK: WHATSAPP
// ============================================================
// GET — verification challenge
app.get('/api/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
});

// POST — inbound messages
app.post('/api/webhook/whatsapp', webhookLimiter, async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const result = await recordLeadFromWhatsApp(req.body);
    if (result.leads.length > 0) {
      console.log(`✅ Captured ${result.leads.length} WhatsApp lead(s)`);
    }
    if (result.errors.length > 0) {
      console.warn('⚠️  WhatsApp webhook errors:', result.errors);
    }
  } catch (e) {
    console.error('❌ WhatsApp webhook error:', e.message);
  }
});

// ============================================================
// CRON TRIGGERS (external cron can call these)
// ============================================================
app.post('/api/cron/social', requireCronSecret, async (req, res) => {
  try {
    res.json(await runSocialNow(req.body?.window || 'manual'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cron/reviews', requireCronSecret, async (req, res) => {
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
  try {
    res.json(await runReviewCron({ hoursAgo: 24, dryRun }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PAYMENT INIT (for pay.html)
// ============================================================
app.post('/api/payment/init', generalLimiter, requireApiKey, async (req, res) => {
  const txRef = `GB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.json({
    tx_ref: txRef,
    amount: PREMIUM_PRICE_NGN,
    currency: 'NGN',
    public_key: process.env.FLUTTERWAVE_PUBLIC_KEY,
    email: req.body.email || '',
    metadata: { api_key: req.apiKey },
    callback_url: `${PUBLIC_BASE_URL}/pay.html?status=success`,
  });
});

// Demo upgrade — only when explicitly enabled
app.post('/api/payment/demo-upgrade', generalLimiter, requireApiKey, async (req, res) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({ error: 'Demo mode is disabled' });
  }
  try {
    const blog = await upgradeToPremium(
      req.apiKey,
      req.body.email || 'demo@example.com'
    );
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    res.json({ ok: true, plan: blog.plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ROOT REDIRECT + 404 + ERROR
// ============================================================
app.get('/', (req, res) => res.redirect('/dashboard.html'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
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
    } else {
      console.warn('⚠️  DATABASE_URL not set — DB operations will fail');
    }

    startScheduler();

    app.listen(PORT, () => {
      console.log(`🚀 GrowthBot v3.1 on port ${PORT}`);
      console.log(`   Env: ${NODE_ENV}`);
      console.log(`   AI: ${AI_PROVIDER}`);
      console.log(`   Public URL: ${PUBLIC_BASE_URL}`);
    });
  } catch (e) {
    console.error('❌ Boot failed:', e.message);
    process.exit(1);
  }
}

boot();

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down');
  process.exit(0);
});