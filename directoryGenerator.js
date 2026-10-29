// directoryGenerator.js — v3.0
// 4 fields: Post Title / Post Content / Keywords / Category
// composeUrl per directory. Translation via googletrans.
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ============================================================
// TRANSLATION
// ============================================================
export async function translateText(text, targetLang) {
  if (!text || !targetLang || targetLang === 'en') return text;
  try {
    const { default: translate } = await import('googletrans');
    const result = await translate(text, { from: 'en', to: targetLang });
    return result.text;
  } catch (e) {
    console.warn('Translation failed:', e.message);
    return text;
  }
}

// ============================================================
// DIRECTORY DB — composeUrl = direct post form page
// ============================================================
export const DIRECTORIES_BY_COUNTRY = {
  ng: {
    name: 'Nigeria', language: 'en',
    directories: [
      { name: 'Jiji.ng', composeUrl: 'https://jiji.ng/post', url: 'https://jiji.ng', type: 'manual', category: 'classified' },
      { name: 'OLX Nigeria', composeUrl: 'https://www.olx.com.ng/post', url: 'https://www.olx.com.ng', type: 'manual', category: 'classified' },
      { name: 'Locanto Nigeria', composeUrl: 'https://www.locanto.com.ng/post-ad/', url: 'https://www.locanto.com.ng', type: 'manual', category: 'classified' },
      { name: 'VConnect', composeUrl: 'https://www.vconnect.com/register', url: 'https://www.vconnect.com', type: 'manual', category: 'business' },
      { name: 'BusinessList.com.ng', composeUrl: 'https://www.businesslist.com.ng/add-company', url: 'https://www.businesslist.com.ng', type: 'manual', category: 'business' },
      { name: 'Yellow Pages Nigeria', composeUrl: 'https://www.yellowpages.com.ng/add-listing', url: 'https://www.yellowpages.com.ng', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
      { name: 'Bing Places', composeUrl: 'https://www.bingplaces.com/', url: 'https://www.bingplaces.com', type: 'manual', category: 'local' },
    ],
  },
  us: {
    name: 'United States', language: 'en',
    directories: [
      { name: 'Craigslist', composeUrl: 'https://post.craigslist.org/', url: 'https://www.craigslist.org', type: 'manual', category: 'classified' },
      { name: 'Yelp', composeUrl: 'https://biz.yelp.com/', url: 'https://www.yelp.com', type: 'manual', category: 'local' },
      { name: 'Yellow Pages US', composeUrl: 'https://www.yellowpages.com/', url: 'https://www.yellowpages.com', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
      { name: 'Bing Places', composeUrl: 'https://www.bingplaces.com/', url: 'https://www.bingplaces.com', type: 'manual', category: 'local' },
    ],
  },
  gb: {
    name: 'United Kingdom', language: 'en',
    directories: [
      { name: 'Gumtree', composeUrl: 'https://www.gumtree.com/post', url: 'https://www.gumtree.com', type: 'manual', category: 'classified' },
      { name: 'Yell.com', composeUrl: 'https://www.yell.com/account/join/', url: 'https://www.yell.com', type: 'manual', category: 'business' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  in: {
    name: 'India', language: 'en',
    directories: [
      { name: 'OLX India', composeUrl: 'https://www.olx.in/post', url: 'https://www.olx.in', type: 'manual', category: 'classified' },
      { name: 'Quikr', composeUrl: 'https://www.quikr.com/post-free-ad', url: 'https://www.quikr.com', type: 'manual', category: 'classified' },
      { name: 'JustDial', composeUrl: 'https://www.justdial.com/', url: 'https://www.justdial.com', type: 'manual', category: 'business' },
      { name: 'IndiaMART', composeUrl: 'https://seller.indiamart.com/', url: 'https://www.indiamart.com', type: 'manual', category: 'business' },
    ],
  },
  ke: {
    name: 'Kenya', language: 'en',
    directories: [
      { name: 'Jiji Kenya', composeUrl: 'https://jiji.co.ke/post', url: 'https://jiji.co.ke', type: 'manual', category: 'classified' },
      { name: 'OLX Kenya', composeUrl: 'https://www.olx.co.ke/post', url: 'https://www.olx.co.ke', type: 'manual', category: 'classified' },
      { name: 'BusinessList Kenya', composeUrl: 'https://www.businesslist.co.ke/add-company', url: 'https://www.businesslist.co.ke', type: 'manual', category: 'business' },
    ],
  },
  za: {
    name: 'South Africa', language: 'en',
    directories: [
      { name: 'Gumtree South Africa', composeUrl: 'https://www.gumtree.co.za/post', url: 'https://www.gumtree.co.za', type: 'manual', category: 'classified' },
      { name: 'OLX ZA', composeUrl: 'https://www.olx.co.za/post', url: 'https://www.olx.co.za', type: 'manual', category: 'classified' },
    ],
  },
  de: {
    name: 'Germany', language: 'de',
    directories: [
      { name: 'eBay Kleinanzeigen', composeUrl: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html', url: 'https://www.kleinanzeigen.de', type: 'manual', category: 'classified' },
      { name: 'Google Business Profile', composeUrl: 'https://business.google.com/', url: 'https://business.google.com', type: 'manual', category: 'local' },
    ],
  },
  fr: {
    name: 'France', language: 'fr',
    directories: [
      { name: 'LeBonCoin', composeUrl: 'https://www.leboncoin.fr/deposer_une_annonce', url: 'https://www.leboncoin.fr', type: 'manual', category: 'classified' },
      { name: 'PagesJaunes', composeUrl: 'https://www.pagesjaunes.fr/pros/creer-fiche', url: 'https://www.pagesjaunes.fr', type: 'manual', category: 'business' },
    ],
  },
  br: {
    name: 'Brazil', language: 'pt',
    directories: [
      { name: 'OLX Brasil', composeUrl: 'https://www.olx.com.br/anunciar', url: 'https://www.olx.com.br', type: 'manual', category: 'classified' },
      { name: 'MercadoLivre', composeUrl: 'https://www.mercadolivre.com.br/publicar', url: 'https://www.mercadolivre.com.br', type: 'manual', category: 'classified' },
    ],
  },
  pt: {
    name: 'Portugal', language: 'pt',
    directories: [
      { name: 'OLX Portugal', composeUrl: 'https://www.olx.pt/ads/create', url: 'https://www.olx.pt', type: 'manual', category: 'classified' },
    ],
  },
  es: {
    name: 'Spain', language: 'es',
    directories: [
      { name: 'Milanuncios', composeUrl: 'https://www.milanuncios.com/publicar-anuncios/', url: 'https://www.milanuncios.com', type: 'manual', category: 'classified' },
    ],
  },
};

// ============================================================
// AI — generates exactly 4 fields
// ============================================================
async function aiListing(profile, directory, countryName) {
  if (!openai) return null;

  const prompt = `Write a classified listing for "${directory.name}" (${directory.category} category) in ${countryName}.

Business: ${profile.name}
Category: ${profile.category || 'Business'}
City: ${profile.city || ''}, ${profile.state || ''}
Phone: ${profile.phone || 'N/A'}
Website: ${profile.website || 'N/A'}
Description: ${profile.description || ''}

Return JSON only:
{
  "postTitle": "60-char title with business name + location + benefit",
  "postContent": "250-400 char description with phone, location, benefit",
  "keywords": ["4-6 searchable keywords"],
  "category": "single best category name"
}

Rules:
- For classifieds (Jiji, OLX): sales-focused, urgent tone
- For business directories (Yelp, Yellow Pages): professional, formal
- No spam phrases ("CLICK NOW", "100% GUARANTEED")
- Include the phone number in postContent`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    console.error('AI listing failed:', e.message);
    return null;
  }
}

function fallbackListing(profile, countryName) {
  const loc = [profile.city, profile.state].filter(Boolean).join(', ') || countryName;
  return {
    postTitle: `${profile.name} — ${profile.category || 'Business'} in ${loc}`.slice(0, 60),
    postContent: `${profile.name} is a trusted ${(profile.category || 'business').toLowerCase()} in ${loc}. Call ${profile.phone || 'us'} for quality products and fast delivery. ${profile.website ? 'Visit ' + profile.website : ''}`.slice(0, 400),
    keywords: [profile.category, profile.city, profile.state].filter(Boolean),
    category: profile.category || 'Business',
  };
}

// ============================================================
// BOOKMARKLET — autofills any compose page from clipboard
// ============================================================
export function buildBookmarklet() {
  return `javascript:(function(){var t=prompt('Paste your listing (Title/Content/Keywords/Category):');if(!t)return;var m={};t.split('\\n').forEach(function(l){var i=l.indexOf(':');if(i>0)m[l.slice(0,i).trim().toLowerCase()]=l.slice(i+1).trim();});var ttl=m['post title']||m['title']||'',cnt=m['post content']||m['content']||'',kw=m['keywords']||'',cat=m['category']||'';document.querySelectorAll('input,textarea,select').forEach(function(el){var k=((el.name||'')+' '+(el.id||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.labels&&el.labels[0]?el.labels[0].innerText:'')).toLowerCase();if(/title|subject|headline/.test(k))el.value=ttl;else if(/desc|content|body|message|detail/.test(k)&&el.tagName==='TEXTAREA')el.value=cnt;else if(/keyword|tag/.test(k))el.value=kw;else if(/categ/.test(k))el.value=cat;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});alert('Filled! Review and click Submit.');})();`;
}

// ============================================================
// LIST
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
// GENERATE
// ============================================================
export async function generateListingsForCountry({ profile, country = 'ng', limit = 30, language = null }) {
  const countryData = DIRECTORIES_BY_COUNTRY[String(country).toLowerCase()];
  if (!countryData) throw new Error('Unsupported country: ' + country);

  const targetLang = language || countryData.language || 'en';
  const dirs = countryData.directories.slice(0, limit);
  const listings = [];

  for (const dir of dirs) {
    let data = null;
    if (openai) data = await aiListing(profile, dir, countryData.name);
    if (!data) data = fallbackListing(profile, countryData.name);

    // Translate if needed
    if (targetLang !== 'en') {
      data.postTitle = await translateText(data.postTitle, targetLang);
      await new Promise((r) => setTimeout(r, 250));
      data.postContent = await translateText(data.postContent, targetLang);
    }

    const copyText =
      `Post Title: ${data.postTitle}\n` +
      `Post Content: ${data.postContent}\n` +
      `Keywords: ${(data.keywords || []).join(', ')}\n` +
      `Category: ${data.category}`;

    listings.push({
      directory: dir.name,
      composeUrl: dir.composeUrl,
      siteUrl: dir.url,
      type: dir.type,
      categoryHint: dir.category,
      postTitle: data.postTitle,
      postContent: data.postContent,
      keywords: data.keywords || [],
      category: data.category,
      copyText,
    });
  }

  return {
    country,
    countryName: countryData.name,
    language: targetLang,
    translated: targetLang !== 'en',
    total: listings.length,
    bookmarklet: buildBookmarklet(),
    listings,
    instructions:
      targetLang !== 'en'
        ? `Listings translated to ${targetLang}. For each row: click "Open + Copy" → new tab opens on compose page and content copies → click your bookmarklet → submit.`
        : 'For each row: click "Open + Copy" → new tab opens and content copies → click bookmarklet → submit.',
  };
}

export default {
  DIRECTORIES_BY_COUNTRY,
  listDirectories,
  listSupportedCountries,
  generateListingsForCountry,
  translateText,
  buildBookmarklet,
};