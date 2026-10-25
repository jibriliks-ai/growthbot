// ============================================================
// GrowthBot — SEO audit + auto-fix engine
// Professional JS port of the Python scoring logic.
// Every check is real; every score is measured, never assumed.
// ============================================================
import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================
// SCORING WEIGHTS (sum = 100)
// ============================================================
const W = {
  titleLength: 15,
  keywordInTitle: 10,
  metaDescription: 10,
  h1Single: 8,
  h2Multiple: 7,
  contentLength: 10,
  imageAlt: 10,
  internalLinks: 10,
  schema: 10,
  sitemap: 10,
  pageSize: 10,
};

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toTitleCase(str) {
  return String(str ?? '')
    .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function fallbackTitle(keyword, h1Text, currentTitle) {
  const base = keyword
    ? toTitleCase(keyword)
    : h1Text || currentTitle || 'Untitled Page';
  const combined = `${base} — 2026 Guide`;
  return combined.length > 60 ? combined.slice(0, 57) + '…' : combined;
}

function fallbackMeta(keyword, h1Text) {
  const topic = keyword || h1Text || 'this topic';
  const text = `Learn how to ${topic} with our step-by-step 2026 guide. Official links, common errors, and fixes. Read now.`;
  return text.length > 155 ? text.slice(0, 152) + '…' : text;
}

// ============================================================
// SITEMAP DETECTION — real HTTP requests, no assumptions
// ============================================================
export async function checkSitemap(url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }

  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemap.xml.gz`,
  ];

  for (const candidate of candidates) {
    try {
      const res = await axios.head(candidate, {
        timeout: 5000,
        validateStatus: (s) => s === 200,
        headers: { 'User-Agent': 'GrowthBot/3.0' },
      });
      if (res.status === 200) return candidate;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

// Pull post URLs out of a sitemap (for internal-link suggestions)
export async function extractSitemapUrls(sitemapUrl, limit = 20) {
  if (!sitemapUrl) return [];
  try {
    const res = await axios.get(sitemapUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'GrowthBot/3.0' },
      maxContentLength: 2_000_000,
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const urls = [];

    // Handle both <urlset> and <sitemapindex>
    $('url > loc').each((_, el) => {
      if (urls.length < limit) urls.push($(el).text().trim());
    });
    $('sitemap > loc').each((_, el) => {
      if (urls.length < limit) urls.push($(el).text().trim());
    });

    return urls.filter(Boolean);
  } catch {
    return [];
  }
}

// ============================================================
// SCORING — returns full breakdown + issue list
// ============================================================
export function calculateSEOScore({ url, html, keyword, sitemapUrl }) {
  const $ = cheerio.load(html);
  const issues = [];
  const breakdown = {};
  let score = 0;

  // 1. Title length
  const title = $('title').first().text().trim();
  if (title.length >= 50 && title.length <= 60) {
    score += W.titleLength;
    breakdown.titleLength = W.titleLength;
  } else if (title.length > 0) {
    score += 7;
    breakdown.titleLength = 7;
    issues.push({
      id: 'title_length',
      severity: 'warning',
      message: `Title is ${title.length} chars (ideal: 50–60)`,
    });
  } else {
    breakdown.titleLength = 0;
    issues.push({
      id: 'title_missing',
      severity: 'error',
      message: 'Missing <title> tag',
    });
  }

  // 2. Keyword in title
  if (keyword && title.toLowerCase().includes(keyword.toLowerCase())) {
    score += W.keywordInTitle;
    breakdown.keywordInTitle = W.keywordInTitle;
  } else {
    breakdown.keywordInTitle = 0;
    if (keyword) {
      issues.push({
        id: 'keyword_missing_title',
        severity: 'warning',
        message: `Keyword "${keyword}" not in title`,
      });
    }
  }

  // 3. Meta description
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';
  if (metaDesc.length >= 120 && metaDesc.length <= 155) {
    score += W.metaDescription;
    breakdown.metaDescription = W.metaDescription;
  } else {
    breakdown.metaDescription = 0;
    issues.push({
      id: 'meta_missing',
      severity: 'error',
      message:
        metaDesc.length === 0
          ? 'Missing meta description'
          : `Meta description is ${metaDesc.length} chars (ideal: 120–155)`,
    });
  }

  // 4. Exactly 1 H1
  const h1Count = $('h1').length;
  if (h1Count === 1) {
    score += W.h1Single;
    breakdown.h1Single = W.h1Single;
  } else {
    breakdown.h1Single = 0;
    issues.push({
      id: 'h1_count',
      severity: 'error',
      message:
        h1Count === 0
          ? 'No H1 tag found'
          : `${h1Count} H1 tags (should be exactly 1)`,
    });
  }

  // 5. 2+ H2
  const h2Count = $('h2').length;
  if (h2Count >= 2) {
    score += W.h2Multiple;
    breakdown.h2Multiple = W.h2Multiple;
  } else {
    breakdown.h2Multiple = 0;
    issues.push({
      id: 'h2_count',
      severity: 'warning',
      message: `Only ${h2Count} H2 tag${h2Count === 1 ? '' : 's'} (need 2+)`,
    });
  }

  // 6. Content length
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const contentLength = bodyText.length;
  if (contentLength > 600) {
    score += W.contentLength;
    breakdown.contentLength = W.contentLength;
  } else {
    breakdown.contentLength = 0;
    issues.push({
      id: 'content_thin',
      severity: 'warning',
      message: `Content is ${contentLength} chars (need 600+)`,
    });
  }

  // 7. Images with alt
  const images = $('img').toArray();
  const imagesWithAlt = images.filter((img) => $(img).attr('alt')?.trim());
  if (images.length === 0) {
    // Don't punish text-only pages — award half credit
    score += 5;
    breakdown.imageAlt = 5;
  } else if (imagesWithAlt.length === images.length) {
    score += W.imageAlt;
    breakdown.imageAlt = W.imageAlt;
  } else if (imagesWithAlt.length > 0) {
    score += 5;
    breakdown.imageAlt = 5;
    issues.push({
      id: 'image_alt_partial',
      severity: 'warning',
      message: `${images.length - imagesWithAlt.length}/${images.length} images missing alt text`,
    });
  } else {
    breakdown.imageAlt = 0;
    issues.push({
      id: 'image_alt_missing',
      severity: 'warning',
      message: `All ${images.length} images missing alt text`,
    });
  }

  // 8. Internal links
  let internalLinks = 0;
  try {
    const host = new URL(url).hostname;
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('/') || href.includes(host)) internalLinks++;
    });
  } catch {}
  if (internalLinks >= 2) {
    score += W.internalLinks;
    breakdown.internalLinks = W.internalLinks;
  } else {
    breakdown.internalLinks = 0;
    issues.push({
      id: 'internal_links',
      severity: 'warning',
      message: `Only ${internalLinks} internal link${internalLinks === 1 ? '' : 's'} (need 2+)`,
    });
  }

  // 9. Schema markup
  const hasSchema =
    html.includes('schema.org') || /application\/ld\+json/i.test(html);
  if (hasSchema) {
    score += W.schema;
    breakdown.schema = W.schema;
  } else {
    breakdown.schema = 0;
    issues.push({
      id: 'schema_missing',
      severity: 'warning',
      message: 'No JSON-LD schema markup found',
    });
  }

  // 10. Sitemap (real — passed in from checkSitemap())
  if (sitemapUrl) {
    score += W.sitemap;
    breakdown.sitemap = W.sitemap;
  } else {
    breakdown.sitemap = 0;
    issues.push({
      id: 'sitemap_missing',
      severity: 'error',
      message: 'No sitemap.xml found at common paths',
    });
  }

  // 11. Page size
  const sizeKb = Buffer.byteLength(html, 'utf8') / 1024;
  if (sizeKb < 200) {
    score += W.pageSize;
    breakdown.pageSize = W.pageSize;
  } else {
    score += 3;
    breakdown.pageSize = 3;
    issues.push({
      id: 'page_size',
      severity: 'warning',
      message: `HTML is ${sizeKb.toFixed(0)}KB (ideal: <200KB)`,
    });
  }

  return {
    score: Math.min(score, 100),
    title,
    metaDescription: metaDesc,
    h1Count,
    h2Count,
    contentLength,
    imageCount: images.length,
    imagesWithAlt: imagesWithAlt.length,
    internalLinks,
    hasSchema,
    sitemapUrl,
    sizeKb: Math.round(sizeKb),
    issues,
    breakdown,
  };
}

// ============================================================
// AI-POWERED FIX GENERATION (internal helper)
// One OpenAI call returns everything: title, meta, H2s, alts, FAQ.
// Falls back to null on any failure.
// ============================================================
async function callAIForFixes({
  openai,
  pageTitle,
  h1Text,
  bodyText,
  keyword,
  metaDesc,
  imageCount,
  language,
}) {
  const prompt = `You are a senior SEO copywriter. Fix the SEO issues on this blog post.

Current data:
- Primary keyword: ${keyword || '(none provided)'}
- Current title: ${pageTitle || '(missing)'}
- Current H1: ${h1Text || '(missing)'}
- Current meta description: ${metaDesc || '(missing)'}
- Content preview: ${bodyText.slice(0, 800)}
- Images needing alt text: ${imageCount}

Return valid JSON only (no markdown, no code fences):
{
  "title": "50-60 char title including the keyword",
  "metaDescription": "120-155 char compelling description",
  "h2Suggestions": ["Specific section title 1", "Specific section title 2"],
  "imageAlts": ["Descriptive alt text 1", "Descriptive alt text 2"],
  "faq": { "question": "How do I ...?", "answer": "Concise 2-sentence answer." }
}

Rules:
- Title 50-60 chars, keyword included, no clickbait
- Meta 120-155 chars
- H2s must be specific to the content
- Image alts: exactly ${imageCount} items, each descriptive of the image
- FAQ question should be what a real user searches
- Language: ${language || 'en'}`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    console.error('⚠️  AI fix generation failed:', e.message);
    return null;
  }
}

// ============================================================
// GENERATE FIXES — mutate a copy of the HTML, return diff
// ============================================================
export async function generateFixes({
  html,
  url,
  keyword = '',
  internalLinks = [],
  openai = null,
  language = 'en',
}) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const fixes = [];
  const changes = {};

  const pageTitle = $('title').first().text().trim();
  const h1Text = $('h1').first().text().trim();
  const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 2000);
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';

  const needsTitleFix =
    pageTitle.length < 50 ||
    pageTitle.length > 60 ||
    (keyword && !pageTitle.toLowerCase().includes(keyword.toLowerCase()));

  const needsMetaFix = metaDesc.length < 120 || metaDesc.length > 155;
  const imagesNeedingAlt = $('img')
    .toArray()
    .filter((img) => !$(img).attr('alt')?.trim());
  const needsFaq =
    !html.includes('"@type": "FAQPage"') &&
    !html.includes('"@type":"FAQPage"');

  // Single AI call covers every fix
  let ai = null;
  if (
    openai &&
    (needsTitleFix || needsMetaFix || imagesNeedingAlt.length > 0 || needsFaq)
  ) {
    ai = await callAIForFixes({
      openai,
      pageTitle,
      h1Text,
      bodyText,
      keyword,
      metaDesc,
      imageCount: imagesNeedingAlt.length,
      language,
    });
  }

  // --- Title ---
  if (needsTitleFix) {
    const newTitle = ai?.title || fallbackTitle(keyword, h1Text, pageTitle);
    if ($('title').length) $('title').first().text(newTitle);
    else $('head').append(`<title>${escapeHtml(newTitle)}</title>`);
    changes.title = newTitle;
    fixes.push(
      `Title: "${pageTitle || '(empty)'}" → "${newTitle}" (${newTitle.length} chars)`
    );
  }

  // --- Meta description ---
  if (needsMetaFix) {
    const newMeta = ai?.metaDescription || fallbackMeta(keyword, h1Text);
    if ($('meta[name="description"]').length) {
      $('meta[name="description"]').attr('content', newMeta);
    } else {
      $('head').append(
        `<meta name="description" content="${escapeHtml(newMeta)}">`
      );
    }
    changes.metaDescription = newMeta;
    fixes.push(
      `Meta description: ${metaDesc.length} chars → ${newMeta.length} chars`
    );
  }

  // --- H1 cleanup ---
  const h1s = $('h1');
  if (h1s.length === 0) {
    const fallbackH1 = ai?.title || keyword || 'Page Title';
    $('body').prepend(`<h1>${escapeHtml(fallbackH1)}</h1>`);
    fixes.push(`Added H1: "${fallbackH1}"`);
  } else if (h1s.length > 1) {
    h1s.slice(1).each((_, el) => {
      // Preserve inner HTML when demoting
      $(el).replaceWith(`<h2>${$(el).html()}</h2>`);
    });
    fixes.push(`Converted ${h1s.length - 1} extra H1 to H2`);
  }

  // --- H2 top-up ---
  const h2Count = $('h2').length;
  if (h2Count < 2) {
    const toAdd = 2 - h2Count;
    for (let i = 0; i < toAdd; i++) {
      const h2Text =
        ai?.h2Suggestions?.[i] ||
        `${keyword || 'Overview'} — Part ${i + 1}`;
      $('body').append(`<h2>${escapeHtml(h2Text)}</h2>`);
    }
    fixes.push(`Added ${toAdd} H2 heading${toAdd > 1 ? 's' : ''}`);
  }

  // --- Image alt text ---
  imagesNeedingAlt.forEach((img, idx) => {
    const altText = ai?.imageAlts?.[idx] || keyword || 'Image';
    $(img).attr('alt', altText);
  });
  if (imagesNeedingAlt.length > 0) {
    fixes.push(
      `Added alt text to ${imagesNeedingAlt.length} image${
        imagesNeedingAlt.length > 1 ? 's' : ''
      }`
    );
  }

  // --- Internal links ---
  if (internalLinks.length > 0) {
    const linksToAdd = internalLinks.slice(0, 3);
    const firstP = $('p').first();
    if (firstP.length) {
      const linkHtml = linksToAdd
        .map((link) => {
          const href = typeof link === 'string' ? link : link.href;
          const label =
            typeof link === 'string'
              ? link
              : link.text || link.href;
          return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
        })
        .join(' • ');
      firstP.append(
        `<div style="margin-top:12px;font-size:0.95em;opacity:0.9"><strong>See also:</strong> ${linkHtml}</div>`
      );
      fixes.push(
        `Added ${linksToAdd.length} internal link${linksToAdd.length > 1 ? 's' : ''}`
      );
    }
  }

  // --- FAQ schema ---
  if (needsFaq) {
    const faq = ai?.faq || {
      question: `How do I ${keyword || 'get started'}?`,
      answer:
        ai?.metaDescription ||
        metaDesc ||
        `Learn more about ${keyword || 'this topic'} in our complete guide.`,
    };

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',   // ← BUGFIX from Python version
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        },
      ],
    };

    $('head').append(
      `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    );
    fixes.push('Injected FAQ schema (eligible for Google rich results)');
  }

  return {
    fixedHtml: $.html(),
    fixes,
    changes,
  };
}

// ============================================================
// TOP-LEVEL ORCHESTRATOR
// Everything the widget and API need in one call.
// ============================================================
export async function fullAudit({
  url,
  keyword = '',
  openai = null,
  internalLinks = [],
  autoFix = true,
  language = 'en',
}) {
  // 1. Fetch page
  let html;
  try {
    const res = await axios.get(url, {
      timeout: 10_000,
      headers: { 'User-Agent': 'GrowthBot/3.0 (+https://growthbot.app)' },
      maxContentLength: 5_000_000,
    });
    html = res.data;
  } catch (e) {
    throw new Error(`Could not fetch ${url}: ${e.message}`);
  }

  // 2. Detect sitemap (real request)
  const sitemapUrl = await checkSitemap(url);

  // 3. Score BEFORE
  const before = calculateSEOScore({ url, html, keyword, sitemapUrl });

  // 4. Auto-fix if requested
  let after = null;
  let fixedHtml = null;
  let fixes = [];

  if (autoFix) {
    const fixResult = await generateFixes({
      html,
      url,
      keyword,
      internalLinks,
      openai,
      language,
    });
    fixedHtml = fixResult.fixedHtml;
    fixes = fixResult.fixes;

    // 5. Score AFTER — recomputed on fixed HTML
    after = calculateSEOScore({
      url,
      html: fixedHtml,
      keyword,
      sitemapUrl,
    });
  }

  return {
    url,
    keyword,
    sitemapUrl,
    before,
    after,
    fixes,
    fixedHtml,
  };
}