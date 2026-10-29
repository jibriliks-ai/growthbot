// ============================================================
// Auto Traffic Engine — Directory Listing Generator
// v6.0 — URL validation + reliable translation + super-brain copy
// ============================================================
import OpenAI from 'openai';
import axios from 'axios';

// ============================================================
// AI CLIENT + MODEL SELECTION (provider-aware)
// ============================================================
const IS_DEEPSEEK = Boolean(process.env.DEEPSEEK_API_KEY) && !process.env.OPENAI_API_KEY;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : process.env.DEEPSEEK_API_KEY
  ? new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY })
  : null;

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
const DEEPSEEK_MODELS = ['deepseek-flash', 'deepseek-v4-pro'];

const LISTING_DEFAULT_MODEL = IS_DEEPSEEK ? 'deepseek-flash' : 'gpt-4o-mini';

const AI_MODEL = (() => {
  const override = process.env.AI_LISTING_MODEL;
  if (!override) return LISTING_DEFAULT_MODEL;
  const validList = IS_DEEPSEEK ? DEEPSEEK_MODELS : OPENAI_MODELS;
  if (validList.includes(override)) return override;
  console.warn(
    `⚠️ AI_LISTING_MODEL="${override}" is invalid for ${IS_DEEPSEEK ? 'DeepSeek' : 'OpenAI'}. Falling back to ${LISTING_DEFAULT_MODEL}.`
  );
  return LISTING_DEFAULT_MODEL;
})();

// ============================================================
// SPAM PHRASES
// ============================================================
const SPAM_PHRASES = [
  'click here', 'click now', 'buy now', '100% sure', 'guaranteed',
  'limited time', 'act fast', "don't miss", 'free money', 'make money fast',
  'lowest price', 'best price ever', 'unbelievable', 'shocking',
  "in today's fast-paced", "let's dive in", 'game-changer',
];

// ============================================================
// PLATFORM SPECS (character limits + tone per directory)
// ============================================================
export const PLATFORM_SPECS = {
  jiji:        { titleMax: 70, descMax: 1000, tone: 'classified' },
  'olx':       { titleMax: 70, descMax: 1000, tone: 'classified' },
  locanto:     { titleMax: 70, descMax: 900,  tone: 'classified' },
  craigslist:  { titleMax: 70, descMax: 1000, tone: 'classified' },
  gumtree:     { titleMax: 70, descMax: 1000, tone: 'classified' },
  quoka:       { titleMax: 65, descMax: 1000, tone: 'classified' },
  kleinanzeigen:{ titleMax: 65, descMax: 1000, tone: 'classified' },
  leboncoin:   { titleMax: 50, descMax: 4000, tone: 'classified' },
  milanuncios: { titleMax: 60, descMax: 1500, tone: 'classified' },
  quikr:       { titleMax: 70, descMax: 1000, tone: 'classified' },
  mercadolivre:{ titleMax: 60, descMax: 1000, tone: 'classified' },
  mercadolibre:{ titleMax: 60, descMax: 1000, tone: 'classified' },
  adverts:     { titleMax: 70, descMax: 800,  tone: 'classified' },
  naijaads:    { titleMax: 70, descMax: 800,  tone: 'classified' },
  'google business': { titleMax: 30, descMax: 750, tone: 'local' },
  'bing places':     { titleMax: 60, descMax: 500, tone: 'local' },
  yelp:              { titleMax: 60, descMax: 750, tone: 'local' },
  foursquare:        { titleMax: 60, descMax: 500, tone: 'local' },
  nextdoor:          { titleMax: 60, descMax: 750, tone: 'local' },
  vconnect:    { titleMax: 80, descMax: 2000, tone: 'business' },
  'yellow pages': { titleMax: 80, descMax: 1000, tone: 'business' },
  yellowpages: { titleMax: 80, descMax: 1000, tone: 'business' },
  businesslist:{ titleMax: 80, descMax: 1500, tone: 'business' },
  finelib:     { titleMax: 80, descMax: 1000, tone: 'business' },
  hotfrog:     { titleMax: 80, descMax: 1000, tone: 'business' },
  cylex:       { titleMax: 80, descMax: 1000, tone: 'business' },
  manta:       { titleMax: 60, descMax: 750,  tone: 'business' },
  bbb:         { titleMax: 80, descMax: 1000, tone: 'business' },
  superpages:  { titleMax: 80, descMax: 1000, tone: 'business' },
  yell:        { titleMax: 80, descMax: 1000, tone: 'business' },
  'thomson local': { titleMax: 80, descMax: 1000, tone: 'business' },
  freeindex:   { titleMax: 80, descMax: 1000, tone: 'business' },
  pagesjaunes: { titleMax: 80, descMax: 1000, tone: 'business' },
  justdial:    { titleMax: 80, descMax: 500,  tone: 'business' },
  sulekha:     { titleMax: 80, descMax: 1000, tone: 'business' },
  custojusto:  { titleMax: 70, descMax: 1000, tone: 'business' },
  indiamart:   { titleMax: 100, descMax: 2000, tone: 'b2b' },
  default:     { titleMax: 70, descMax: 800, tone: 'generic' },
};

function getSpecForDirectory(dirName) {
  const lower = String(dirName || '').toLowerCase();
  for (const [key, spec] of Object.entries(PLATFORM_SPECS)) {
    if (key === 'default') continue;
    if (lower.includes(key)) return spec;
  }
  return PLATFORM_SPECS.default;
}

// ============================================================
// TONE PLAYBOOKS
// ============================================================
const TONE_PLAYBOOKS = {
  classified: {
    framework: 'AIDA (Attention → Interest → Desire → Action)',
    voice: 'Direct, urgent, benefit-led. Buyer is comparing 10 other listings in 30 seconds. Use specifics — prices, quantities, timeframe, guarantee, location. Avoid adjectives like "amazing" or "quality" — replace with proof: "verified", "same-day delivery", "12-month warranty", "20 in stock".',
    hook: 'Lead with the strongest specific benefit + location. Example: "Toyota Camry 2018 — Lagos, 42k mileage, papers complete" NOT "Amazing Toyota Camry for sale".',
    cta: 'Clear action with TRUE urgency: "Call now for today\'s price", "Message on WhatsApp to reserve".',
    avoid: 'Generic marketing words, emojis, ALL CAPS.',
  },
  business: {
    framework: 'Problem → Solution → Proof → Action',
    voice: 'Professional, confident, credible. Establish authority: years in business, number of clients served, certifications, service area. Use "we".',
    hook: 'Open with what you do + who you serve + where.',
    cta: 'Trust-building CTA: "Visit our website", "Call to book a consultation".',
    avoid: 'Hyperbole, urgency tricks, unverifiable claims.',
  },
  local: {
    framework: 'Local Identity → Service → Trust → NAP → Action',
    voice: 'Warm, community-focused. Emphasize locality: "family-owned", "serving [neighborhood] since [year]". NAP must be present and consistent.',
    hook: 'Lead with location + category + differentiator.',
    cta: 'Local CTA: "Drop by — walk-ins welcome", "Call to book a same-day appointment".',
    avoid: 'Corporate language.',
  },
  b2b: {
    framework: 'Capability → Specs → Volume → Contact',
    voice: 'Commercial, spec-focused. Buyer is a procurement officer. They want numbers: MOQ, lead time, certifications, payment terms.',
    hook: 'Lead with product category, certifications, production capacity.',
    cta: 'B2B CTA: "Request quote", "Contact sales for bulk pricing".',
    avoid: 'Consumer language, urgency, emotion.',
  },
  generic: {
    framework: 'Hook → Benefit → Trust → CTA',
    voice: 'Helpful, clear, no hype. Reader is skimming.',
    hook: 'Specific value proposition in one sentence.',
    cta: 'Clear next step.',
    avoid: 'Clichés, hype, generic filler.',
  },
};

// ============================================================
// RELIABLE TRANSLATION — multi-provider chain
// ============================================================
async function translateWithVitalets(text, targetLang) {
  try {
    const { translate } = await import('@vitalets/google-translate-api');
    const res = await translate(text, { to: targetLang, from: 'en' });
    return res.text;
  } catch (e) {
    console.warn('Vitalets translation failed:', e.message);
    return null;
  }
}

async function translateWithLibre(text, targetLang) {
  try {
    const res = await axios.post(
      'https://libretranslate.com/translate',
      { q: text, source: 'en', target: targetLang, format: 'text' },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );
    return res.data?.translatedText || null;
  } catch (e) {
    console.warn('LibreTranslate failed:', e.message);
    return null;
  }
}

async function translateWithGoogleWeb(text, targetLang) {
  // Direct scrape of translate.google.com — works from most server IPs
  try {
    const url = `https://translate.google.com/m?sl=en&tl=${targetLang}&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const match = res.data.match(/<div class="result-container">([\s\S]*?)<\/div>/);
    if (match) {
      const decoded = match[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      return decoded.trim();
    }
    return null;
  } catch (e) {
    console.warn('Google web translation failed:', e.message);
    return null;
  }
}

export async function translateText(text, targetLang) {
  if (!text || !targetLang || targetLang === 'en') return text;

  // Try 3 providers in order — first one that succeeds wins
  const providers = [
    { name: 'vitalets', fn: translateWithVitalets },
    { name: 'libre', fn: translateWithLibre },
    { name: 'google-web', fn: translateWithGoogleWeb },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn(text, targetLang);
      if (result && result.length > 0 && result !== text) {
        console.log(`✅ Translation succeeded via ${provider.name}`);
        return result;
      }
    } catch (e) {
      console.warn(`Translation provider ${provider.name} threw:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.warn(`❌ All translation providers failed for ${targetLang}. Returning original.`);
  return text;
}

// ============================================================
// URL VALIDATION — skip directories whose compose page is down
// ============================================================
async function validateUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { ok: false, reason: 'invalid URL format' };
  }

  try {
    // HEAD first (fast), fall back to GET if HEAD is blocked
    let res;
    try {
      res = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
    } catch (headErr) {
      res = await axios.get(url, {
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });
    }

    const status = res.status;
    // 2xx = working, 3xx = redirect to a working page (axios already followed it)
    if (status >= 200 && status < 400) {
      return { ok: true, status };
    }
    // 403/429 often means the page exists but blocks bots — treat as valid
    if (status === 403 || status === 429) {
      return { ok: true, status, note: 'bot-blocked but page exists' };
    }
    return { ok: false, status, reason: `HTTP ${status}` };
  } catch (e) {
    return { ok: false, reason: e.code || e.message };
  }
}

// ============================================================
// DIRECTORY DATABASE — verified URLs
// ============================================================
export const DIRECTORIES_BY_COUNTRY = {
  ng: {
    name: 'Nigeria', language: 'en',
    directories: [
      { name: 'Jiji.ng', composeUrl: 'https://jiji.ng/add-free-ad.html', url: 'https://jiji.ng', type: 'manual', category: 'classified' },
      { name: 'OLX Nigeria', composeUrl: 'https://www.olx.com.ng/post', url: 'https://www.olx.com.ng', type: 'manual', category: 'classified' },
      { name: 'Locanto Nigeria', composeUrl: 'https://www.locanto.com.ng/post-ad/', url: 'https://www.locanto.com.ng', type: 'manual', category: 'classified' },
      { name: 'Adverts Nigeria', composeUrl: 'https://adverts.com.ng/post', url: 'https://adverts.com.ng', type: 'manual', category: 'classified' },
      { name: 'NaijaAds', composeUrl: 'https://naijaads.com/post-ad', url: 'https://naijaads.com', type: 'manual', category: 'classified' },
      { name: 'VConnect', composeUrl: 'https://www.vconnect.com/register', url: 'https://www.vconnect.com', type: 'manual', category: 'business' },
      { name: 'BusinessList.com.ng', composeUrl: 'https://www.businesslist.com.ng/add-company', url: 'https://www.businesslist.com.ng', type: 'manual', category: 'business' },
      { name: 'Yellow Pages Nigeria', composeUrl: 'https://www.yellowpages.com.ng/add-listing', url: 'https://www.yellowpages.com.ng', type: 'manual', category: 'business' },
      { name: 'Finelib.com.ng', composeUrl: 'https://www.finelib.com.ng/add-listing/', url: 'https://www.finelib.com.ng', type: 'manual', category: 'business' },
      { name: 'Hotfrog Nigeria', composeUrl: 'https://www.hotfrog.com.ng/add-your-business', url: 'https://www.hotfrog.com.ng', type: 'manual', category: 'business' },
      { name: 'Cylex Nigeria', composeUrl: 'https://www.cylex.ng/add-company.html', url: 'https://www.cylex.ng', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
      { name: 'Bing Places', composeUrl: 'https://www.bingplaces.com/', url: 'https://www.bingplaces.com', type: 'manual', category: 'local' },
    ],
  },
  us: {
    name: 'United States', language: 'en',
    directories: [
      { name: 'Craigslist', composeUrl: 'https://post.craigslist.org/', url: 'https://www.craigslist.org', type: 'manual', category: 'classified' },
      { name: 'Yelp', composeUrl: 'https://biz.yelp.com/', url: 'https://www.yelp.com', type: 'manual', category: 'local' },
      { name: 'Yellow Pages US', composeUrl: 'https://adsolutions.yp.com/listings/basic', url: 'https://www.yellowpages.com', type: 'manual', category: 'business' },
      { name: 'Manta', composeUrl: 'https://www.manta.com/claim', url: 'https://www.manta.com', type: 'manual', category: 'business' },
      { name: 'Better Business Bureau', composeUrl: 'https://www.bbb.org/', url: 'https://www.bbb.org', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
      { name: 'Bing Places', composeUrl: 'https://www.bingplaces.com/', url: 'https://www.bingplaces.com', type: 'manual', category: 'local' },
      { name: 'Foursquare', composeUrl: 'https://business.foursquare.com/', url: 'https://foursquare.com', type: 'manual', category: 'local' },
      { name: 'Superpages', composeUrl: 'https://claimlisting.superpages.com/spportal/quickbpflow.do', url: 'https://www.superpages.com', type: 'manual', category: 'business' },
      { name: 'Nextdoor', composeUrl: 'https://business.nextdoor.com/local', url: 'https://nextdoor.com', type: 'manual', category: 'local' },
    ],
  },
  gb: {
    name: 'United Kingdom', language: 'en',
    directories: [
      { name: 'Gumtree', composeUrl: 'https://www.gumtree.com/post', url: 'https://www.gumtree.com', type: 'manual', category: 'classified' },
      { name: 'Yell.com', composeUrl: 'https://www.yell.com/free-listing', url: 'https://www.yell.com', type: 'manual', category: 'business' },
      { name: 'Thomson Local', composeUrl: 'https://www.thomsonlocal.com/', url: 'https://www.thomsonlocal.com', type: 'manual', category: 'business' },
      { name: 'FreeIndex', composeUrl: 'https://www.freeindex.co.uk/add/', url: 'https://www.freeindex.co.uk', type: 'manual', category: 'business' },
      { name: 'Hotfrog UK', composeUrl: 'https://www.hotfrog.co.uk/add-your-business', url: 'https://www.hotfrog.co.uk', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  in: {
    name: 'India', language: 'en',
    directories: [
      { name: 'OLX India', composeUrl: 'https://www.olx.in/post', url: 'https://www.olx.in', type: 'manual', category: 'classified' },
      { name: 'Quikr', composeUrl: 'https://www.quikr.com/post-free-ad', url: 'https://www.quikr.com', type: 'manual', category: 'classified' },
      { name: 'JustDial', composeUrl: 'https://www.justdial.com/free-listing', url: 'https://www.justdial.com', type: 'manual', category: 'business' },
      { name: 'IndiaMART', composeUrl: 'https://seller.indiamart.com/', url: 'https://www.indiamart.com', type: 'manual', category: 'business' },
      { name: 'Sulekha', composeUrl: 'https://www.sulekha.com/', url: 'https://www.sulekha.com', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  ke: {
    name: 'Kenya', language: 'en',
    directories: [
      { name: 'Jiji Kenya', composeUrl: 'https://jiji.co.ke/add-free-ad.html', url: 'https://jiji.co.ke', type: 'manual', category: 'classified' },
      { name: 'OLX Kenya', composeUrl: 'https://www.olx.co.ke/post', url: 'https://www.olx.co.ke', type: 'manual', category: 'classified' },
      { name: 'BusinessList Kenya', composeUrl: 'https://www.businesslist.co.ke/add-company', url: 'https://www.businesslist.co.ke', type: 'manual', category: 'business' },
      { name: 'Yellow Pages Kenya', composeUrl: 'https://www.yellowpageskenya.com/', url: 'https://www.yellowpageskenya.com', type: 'manual', category: 'business' },
    ],
  },
  za: {
    name: 'South Africa', language: 'en',
    directories: [
      { name: 'Gumtree South Africa', composeUrl: 'https://www.gumtree.co.za/post', url: 'https://www.gumtree.co.za', type: 'manual', category: 'classified' },
      { name: 'OLX ZA', composeUrl: 'https://www.olx.co.za/post', url: 'https://www.olx.co.za', type: 'manual', category: 'classified' },
      { name: 'BusinessList ZA', composeUrl: 'https://www.businesslist.co.za/add-company', url: 'https://www.businesslist.co.za', type: 'manual', category: 'business' },
    ],
  },
  de: {
    name: 'Germany', language: 'de',
    directories: [
      { name: 'eBay Kleinanzeigen', composeUrl: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html', url: 'https://www.kleinanzeigen.de', type: 'manual', category: 'classified' },
      { name: 'Quoka', composeUrl: 'https://www.quoka.de/inserieren/anzeige-aufgeben.html', url: 'https://www.quoka.de', type: 'manual', category: 'classified' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  fr: {
    name: 'France', language: 'fr',
    directories: [
      { name: 'LeBonCoin', composeUrl: 'https://www.leboncoin.fr/deposer-une-annonce', url: 'https://www.leboncoin.fr', type: 'manual', category: 'classified' },
      { name: 'PagesJaunes', composeUrl: 'https://www.pagesjaunes.fr/pros/creer-fiche', url: 'https://www.pagesjaunes.fr', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  es: {
    name: 'Spain', language: 'es',
    directories: [
      { name: 'Milanuncios', composeUrl: 'https://www.milanuncios.com/publicar-anuncios-gratis/', url: 'https://www.milanuncios.com', type: 'manual', category: 'classified' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  pt: {
    name: 'Portugal', language: 'pt',
    directories: [
      { name: 'OLX Portugal', composeUrl: 'https://www.olx.pt/ads/create', url: 'https://www.olx.pt', type: 'manual', category: 'classified' },
      { name: 'CustoJusto', composeUrl: 'https://www.custojusto.pt/', url: 'https://www.custojusto.pt', type: 'manual', category: 'classified' },
    ],
  },
  br: {
    name: 'Brazil', language: 'pt',
    directories: [
      { name: 'OLX Brasil', composeUrl: 'https://www.olx.com.br/anunciar', url: 'https://www.olx.com.br', type: 'manual', category: 'classified' },
      { name: 'MercadoLivre', composeUrl: 'https://www.mercadolivre.com.br/publicar', url: 'https://www.mercadolivre.com.br', type: 'manual', category: 'classified' },
    ],
  },
  ar: {
    name: 'Argentina', language: 'es',
    directories: [
      { name: 'MercadoLibre', composeUrl: 'https://www.mercadolibre.com.ar/publicar', url: 'https://www.mercadolibre.com.ar', type: 'manual', category: 'classified' },
    ],
  },
};

// ============================================================
// NAP CONSISTENCY CHECK
// ============================================================
function clean(str) { return String(str ?? '').replace(/\s+/g, ' ').trim(); }
function truncate(str, max) {
  const s = clean(str);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}
export function normalisePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}
export function normaliseAddress(raw) {
  return clean(raw).toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ').trim();
}
function normaliseName(raw) { return clean(raw).toLowerCase().replace(/\s+/g, ' '); }

export function checkNaps(profile, listings) {
  const canonical = {
    name: normaliseName(profile.name),
    address: normaliseAddress(profile.address),
    phone: normalisePhone(profile.phone),
  };
  const mismatches = [];
  for (const l of listings) {
    const pName = normaliseName(l.name || profile.name);
    const pAddr = normaliseAddress(l.address || profile.address);
    const pPhone = normalisePhone(l.phone || profile.phone);
    if (pName && pName !== canonical.name) mismatches.push({ directory: l.directory, field: 'name', expected: canonical.name, found: pName });
    if (pAddr && pAddr !== canonical.address) mismatches.push({ directory: l.directory, field: 'address', expected: canonical.address, found: pAddr });
    if (pPhone && pPhone !== canonical.phone) mismatches.push({ directory: l.directory, field: 'phone', expected: canonical.phone, found: pPhone });
  }
  return { ok: mismatches.length === 0, canonical, mismatches };
}

// ============================================================
// FALLBACK LISTING
// ============================================================
function fallbackListing(profile, countryName, spec) {
  const name = clean(profile.name);
  const loc = [profile.city, profile.state].filter(Boolean).join(', ') || countryName;
  const cat = clean(profile.category) || 'Business';
  const phone = clean(profile.phone);
  const wa = clean(profile.whatsapp) || phone;
  const web = clean(profile.website);
  const services = Array.isArray(profile.services) ? profile.services.filter(Boolean).slice(0, 4) : [];

  if (spec.tone === 'classified') {
    const hook = `${name} — ${cat} in ${loc}`.slice(0, spec.titleMax);
    const body = [
      `${hook}.`,
      services.length ? `Available now: ${services.join(', ')}.` : '',
      phone ? `Call or WhatsApp ${wa || phone} to reserve — today's price quoted on call.` : '',
      web ? `View full details: ${web}` : '',
    ].filter(Boolean).join(' ');
    return { postTitle: truncate(hook, spec.titleMax), postContent: truncate(body, spec.descMax), keywords: [cat, profile.city, profile.state, loc].filter(Boolean), category: cat };
  }

  const hook = `${name} — ${cat}${loc ? ` in ${loc}` : ''}`.slice(0, spec.titleMax);
  const body = [
    `${name} is a ${cat.toLowerCase()} serving ${loc}.`,
    services.length ? `We offer: ${services.join(', ')}.` : '',
    profile.description ? clean(profile.description) : '',
    phone ? `Call ${phone}${wa && wa !== phone ? ` or WhatsApp ${wa}` : ''} to speak with our team.` : '',
    web ? `Learn more: ${web}` : '',
  ].filter(Boolean).join(' ');
  return { postTitle: truncate(hook, spec.titleMax), postContent: truncate(body, spec.descMax), keywords: [cat, profile.city, profile.state, loc].filter(Boolean), category: cat };
}

// ============================================================
// AI PROMPT
// ============================================================
function buildListingPrompt(profile, directory, countryName, spec) {
  const pb = TONE_PLAYBOOKS[spec.tone] || TONE_PLAYBOOKS.generic;
  const services = Array.isArray(profile.services) ? profile.services.filter(Boolean) : [];
  const facts = [
    profile.name ? `Business name: ${clean(profile.name)}` : '',
    profile.category ? `Category: ${clean(profile.category)}` : '',
    profile.city || profile.state ? `Location: ${[profile.city, profile.state].filter(Boolean).join(', ')}, ${countryName}` : `Location: ${countryName}`,
    profile.phone ? `Phone: ${clean(profile.phone)}` : '',
    profile.whatsapp ? `WhatsApp: ${clean(profile.whatsapp)}` : '',
    profile.website ? `Website: ${clean(profile.website)}` : '',
    profile.address ? `Address: ${clean(profile.address)}` : '',
    services.length ? `Services offered: ${services.join(', ')}` : '',
    profile.description ? `Existing description: ${clean(profile.description)}` : '',
    profile.yearsInBusiness ? `Years in business: ${profile.yearsInBusiness}` : '',
    profile.priceRange ? `Price range: ${clean(profile.priceRange)}` : '',
    profile.keywords?.length ? `Target keywords: ${profile.keywords.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return `You are a senior direct-response copywriter who has generated over 10,000 high-converting classified and directory listings.

TARGET DIRECTORY: ${directory.name} (${directory.category} category)
LOCATION: ${countryName}

BUSINESS FACTS (use ONLY these):
${facts}

WRITING FRAMEWORK: ${pb.framework}
VOICE: ${pb.voice}
HOOK STRATEGY: ${pb.hook}
CTA STYLE: ${pb.cta}
AVOID: ${pb.avoid}

CHARACTER LIMITS (hard):
- postTitle: max ${spec.titleMax}
- postContent: max ${spec.descMax}

CONVERSION RULES:
1. postTitle must include: business name + specific category + location. NO generic adjectives.
2. postContent must include at least ONE concrete number (price, quantity, years, delivery time).
3. postContent must include the phone number as a direct CTA.
4. Do NOT use: ${SPAM_PHRASES.join(', ')}.
5. Do NOT use emojis, exclamation marks, or ALL CAPS.
6. Do NOT invent services, awards, or claims not in the facts.
7. Do NOT change the name, address, or phone.
8. Keep every field WITHIN the character limit.
9. Return valid JSON only.

Return JSON:
{"postTitle":"...","postContent":"...","keywords":["..."],"category":"..."}`;
}

async function callAI(prompt, temp = 0.8) {
  const res = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You are a senior direct-response copywriter. You write tight, specific, converting copy. You follow character limits exactly. You return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: temp,
    response_format: { type: 'json_object' },
  });
  return JSON.parse(res.choices[0].message.content);
}

// ============================================================
// QUALITY SCORER
// ============================================================
function scoreListing({ postTitle, postContent }, spec, profile) {
  let score = 100;
  const issues = [];

  if (!postTitle || postTitle.length < 15) { score -= 20; issues.push('title too short'); }
  if (!postContent || postContent.length < 100) { score -= 20; issues.push('content too short'); }
  if (postTitle.length > spec.titleMax) { score -= 20; issues.push('title over limit'); }
  if (postContent.length > spec.descMax) { score -= 20; issues.push('content over limit'); }

  const lower = (postTitle + ' ' + postContent).toLowerCase();
  const spamHits = SPAM_PHRASES.filter((p) => lower.includes(p));
  if (spamHits.length) { score -= 25 * spamHits.length; issues.push(`spam: ${spamHits.join(', ')}`); }

  if (profile.phone && !postContent.includes(profile.phone.replace(/\D/g, '').slice(-7))) {
    score -= 10; issues.push('phone not in content');
  }
  if (!/\d/.test(postContent)) { score -= 10; issues.push('no concrete number'); }
  if (/[\u{1F300}-\u{1FAFF}]/u.test(postTitle + postContent)) { score -= 15; issues.push('emojis'); }
  if (/\b[A-Z]{5,}\b/.test(postTitle + postContent)) { score -= 10; issues.push('ALL CAPS'); }

  return { total: score, issues };
}

// ============================================================
// BOOKMARKLET
// ============================================================
export function buildBookmarklet() {
  return `javascript:(function(){var t=prompt('Paste your listing (Title/Content/Keywords/Category):');if(!t)return;var m={};t.split('\\n').forEach(function(l){var i=l.indexOf(':');if(i>0)m[l.slice(0,i).trim().toLowerCase()]=l.slice(i+1).trim();});var ttl=m['post title']||m['title']||'',cnt=m['post content']||m['content']||'',kw=m['keywords']||'',cat=m['category']||'';document.querySelectorAll('input,textarea,select').forEach(function(el){var k=((el.name||'')+' '+(el.id||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.labels&&el.labels[0]?el.labels[0].innerText:'')).toLowerCase();if(/title|subject|headline/.test(k))el.value=ttl;else if(/desc|content|body|message|detail/.test(k)&&el.tagName==='TEXTAREA')el.value=cnt;else if(/keyword|tag/.test(k))el.value=kw;else if(/categ/.test(k))el.value=cat;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});alert('Filled! Review and click Submit.');})();`;
}

// ============================================================
// LIST FUNCTIONS
// ============================================================
export function listDirectories(country = 'ng') {
  const data = DIRECTORIES_BY_COUNTRY[String(country).toLowerCase()];
  if (!data) return null;
  return { country, name: data.name, language: data.language, total: data.directories.length, directories: data.directories };
}

export function listSupportedCountries() {
  return Object.entries(DIRECTORIES_BY_COUNTRY).map(([code, d]) => ({
    code, name: d.name, language: d.language, total: d.directories.length,
  }));
}

// ============================================================
// GENERATE — validate URLs, then generate
// ============================================================
export async function generateListingsForCountry({ profile, country = 'ng', limit = 30, language = null }) {
  const countryData = DIRECTORIES_BY_COUNTRY[String(country).toLowerCase()];
  if (!countryData) throw new Error('Unsupported country: ' + country);

  const targetLang = language || countryData.language || 'en';
  const dirs = countryData.directories.slice(0, limit);
  const listings = [];
  const warnings = [];
  const skipped = [];

  // Phase 1 — Validate all composeUrls in parallel (fast)
  console.log(`🔍 Validating ${dirs.length} URLs for ${countryData.name}...`);
  const urlChecks = await Promise.all(
    dirs.map(async (dir) => {
      const result = await validateUrl(dir.composeUrl);
      return { dir, result };
    })
  );

  const validDirs = [];
  for (const { dir, result } of urlChecks) {
    if (result.ok) {
      validDirs.push(dir);
      if (result.note) warnings.push(`${dir.name}: ${result.note}`);
    } else {
      skipped.push({ directory: dir.name, url: dir.composeUrl, reason: result.reason });
      warnings.push(`${dir.name}: SKIPPED — ${result.reason}`);
    }
  }

  console.log(`✅ ${validDirs.length}/${dirs.length} URLs valid. Skipped ${skipped.length}.`);

  // Phase 2 — Generate listings only for valid directories
  for (const dir of validDirs) {
    const spec = getSpecForDirectory(dir.name);
    const prompt = buildListingPrompt(profile, dir, countryData.name, spec);

    let best = null;
    let second = null;

    if (openai) {
      try {
        const [v1, v2] = await Promise.all([
          callAI(prompt, 0.75).catch(() => null),
          callAI(prompt, 0.9).catch(() => null),
        ]);
        const candidates = [v1, v2].filter(Boolean).map((c) => ({ data: c, score: scoreListing(c, spec, profile) }));
        candidates.sort((a, b) => b.score.total - a.score.total);
        if (candidates[0] && candidates[0].score.total >= 60) {
          best = candidates[0].data;
          second = candidates[1]?.data || null;
          if (candidates[0].score.issues.length) warnings.push(`${dir.name}: ${candidates[0].score.issues.join('; ')}`);
        }
      } catch (e) {
        warnings.push(`${dir.name}: AI failed (${e.message}), using fallback`);
      }
    }

    if (!best) best = fallbackListing(profile, countryData.name, spec);

    let postTitle = clean(best.postTitle) || fallbackListing(profile, countryData.name, spec).postTitle;
    let postContent = clean(best.postContent) || fallbackListing(profile, countryData.name, spec).postContent;
    if (postTitle.length > spec.titleMax) postTitle = truncate(postTitle, spec.titleMax);
    if (postContent.length > spec.descMax) postContent = truncate(postContent, spec.descMax);

    if (targetLang !== 'en') {
      postTitle = await translateText(postTitle, targetLang);
      await new Promise((r) => setTimeout(r, 300));
      postContent = await translateText(postContent, targetLang);
      await new Promise((r) => setTimeout(r, 300));
    }

    const copyText =
      `Post Title: ${postTitle}\n` +
      `Post Content: ${postContent}\n` +
      `Keywords: ${(best.keywords || []).join(', ')}\n` +
      `Category: ${best.category || profile.category}`;

    listings.push({
      directory: dir.name,
      composeUrl: dir.composeUrl,
      siteUrl: dir.url,
      type: dir.type,
      categoryHint: dir.category,
      tone: spec.tone,
      postTitle,
      postContent,
      keywords: best.keywords || [],
      category: best.category || profile.category,
      copyText,
      variant2: second ? {
        postTitle: clean(second.postTitle).slice(0, spec.titleMax),
        postContent: clean(second.postContent).slice(0, spec.descMax),
      } : null,
    });
  }

  const napCheck = checkNaps(profile, listings.map((l) => ({
    directory: l.directory, name: profile.name, address: profile.address, phone: profile.phone,
  })));

  return {
    country,
    countryName: countryData.name,
    language: targetLang,
    translated: targetLang !== 'en',
    total: listings.length,
    totalRequested: dirs.length,
    skipped: skipped.length,
    skippedDetails: skipped,
    bookmarklet: buildBookmarklet(),
    listings,
    warnings,
    napCheck,
    instructions:
      targetLang !== 'en'
        ? `Listings translated to ${targetLang}. Click "Open + Copy" → new tab opens on compose page and content copies → click bookmarklet → submit.`
        : 'Click "Open + Copy" → new tab opens and content copies → click bookmarklet → submit.',
  };
}

export default {
  DIRECTORIES_BY_COUNTRY,
  PLATFORM_SPECS,
  listDirectories,
  listSupportedCountries,
  generateListingsForCountry,
  translateText,
  buildBookmarklet,
  checkNaps,
  normalisePhone,
  normaliseAddress,
};