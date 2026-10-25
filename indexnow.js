// ============================================================
// GrowthBot — IndexNow submission module
// ============================================================
// IndexNow is a push protocol: you tell participating engines a URL
// has changed, and they crawl it sooner. It is supported by Bing,
// Yandex, Seznam.cz, Naver and Yep — NOT by Google.
//
// Facts this module is built on:
//   • Max 10,000 URLs per POST request.
//   • Key: 8–128 chars, [a-zA-Z0-9-] only.
//   • Key file: UTF-8 text at /{key}.txt containing ONLY the key.
//   • If the key file is not at the site root, every request must
//     include `keyLocation`.
//   • A key at /catalog/{key}.txt only authorises URLs under /catalog/.
//   • 200 = received. 202 = key pending verification (retry later).
//   • Submitting to one engine forwards to the others (~10s).
//   • Sitemap ping endpoints are DEAD (Google 404, Bing 410). We
//     verify sitemap accessibility instead of pinging it.
// ============================================================
import axios from 'axios';
import { createBacklinkJob, updateBacklinkJob } from './db.js';

// ============================================================
// ENDPOINTS
// ============================================================
export const ENDPOINTS = {
  // Shared endpoint — forwards to every participating engine.
  shared: 'https://api.indexnow.org/indexnow',
  bing: 'https://www.bing.com/indexnow',
  yandex: 'https://yandex.com/indexnow',
  seznam: 'https://search.seznam.cz/indexnow',
  naver: 'https://searchadvisor.naver.com/indexnow',
  yep: 'https://indexnow.yep.com/indexnow',
};

// Protocol hard limits
const MAX_URLS_PER_POST = 10_000;
const MAX_KEY_LENGTH = 128;
const MIN_KEY_LENGTH = 8;
const DEFAULT_BATCH_SIZE = 500; // conservative; well under the 10k cap

const USER_AGENT = 'GrowthBot/3.0 (+https://growthbot.app)';

// ============================================================
// VALIDATION HELPERS
// ============================================================
export function validateKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, reason: 'Key is empty or not a string' };
  }
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
    return {
      valid: false,
      reason: `Key must be ${MIN_KEY_LENGTH}–${MAX_KEY_LENGTH} characters (got ${key.length})`,
    };
  }
  if (!/^[a-zA-Z0-9-]+$/.test(key)) {
    return {
      valid: false,
      reason: 'Key may only contain letters, numbers, and dashes',
    };
  }
  return { valid: true };
}

function parseUrlSafe(input) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

// Where the key file is expected to live
export function buildKeyFileUrl(siteUrl, key, keyLocation = null) {
  if (keyLocation) return keyLocation;
  const u = parseUrlSafe(siteUrl);
  if (!u) throw new Error(`Invalid site URL: ${siteUrl}`);
  return `${u.origin}/${key}.txt`;
}

// ============================================================
// KEY FILE VERIFICATION — a real HTTP round-trip
// ============================================================
export async function verifyKeyFile({
  siteUrl,
  key,
  keyLocation = null,
  timeout = 8000,
}) {
  const keyCheck = validateKey(key);
  if (!keyCheck.valid) {
    return { ok: false, reason: keyCheck.reason };
  }

  let keyFileUrl;
  try {
    keyFileUrl = buildKeyFileUrl(siteUrl, key, keyLocation);
  } catch (e) {
    return { ok: false, reason: e.message, keyFileUrl: null };
  }

  try {
    const res = await axios.get(keyFileUrl, {
      timeout,
      responseType: 'text',
      headers: { 'User-Agent': USER_AGENT },
      // Some hosts serve txt as octet-stream; don't reject on content-type
      validateStatus: (s) => s >= 200 && s < 300,
      maxContentLength: 10_000,
    });

    // A valid key file contains the key and nothing else.
    // Allow trailing newline (editors add one) and BOM.
    const body = String(res.data ?? '')
      .replace(/^\uFEFF/, '')
      .trim();

    if (body === key) {
      return {
        ok: true,
        keyFileUrl,
        status: res.status,
        message: 'Key file found and contents match',
      };
    }

    if (body.includes(key)) {
      return {
        ok: true,
        keyFileUrl,
        status: res.status,
        warning: 'Key file contains extra content — engines may reject it',
        preview: body.slice(0, 120),
      };
    }

    return {
      ok: false,
      keyFileUrl,
      status: res.status,
      reason: 'Key file exists but does not contain the expected key',
      preview: body.slice(0, 120),
    };
  } catch (e) {
    const status = e.response?.status;
    if (status === 404) {
      return {
        ok: false,
        keyFileUrl,
        status,
        reason: `Key file not found at ${keyFileUrl}`,
        hint: 'Upload a UTF-8 text file named {key}.txt to your site root.',
      };
    }
    return {
      ok: false,
      keyFileUrl,
      status: status || null,
      reason: `Could not fetch key file: ${e.message}`,
    };
  }
}

// ============================================================
// URL PREPARATION
// ============================================================
function normaliseAndValidateUrls(urls, host) {
  const valid = [];
  const rejected = [];
  const seen = new Set();

  for (const raw of urls) {
    const u = parseUrlSafe(raw);
    if (!u) {
      rejected.push({ url: raw, reason: 'Invalid URL' });
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      rejected.push({ url: raw, reason: 'Only http/https are supported' });
      continue;
    }
    // IndexNow requires all URLs in a batch to share the key's host
    if (host && u.hostname !== host) {
      rejected.push({
        url: raw,
        reason: `Host "${u.hostname}" does not match key host "${host}"`,
      });
      continue;
    }
    // Strip fragments — they are not part of the resource identity
    u.hash = '';
    const clean = u.toString();
    if (seen.has(clean)) continue;
    seen.add(clean);
    valid.push(clean);
  }

  return { valid, rejected };
}

// ============================================================
// CORE SUBMITTER — pure, no database
// ============================================================
export async function submitUrls({
  urls,
  key,
  host,
  keyLocation = null,
  endpoint = ENDPOINTS.shared,
  batchSize = DEFAULT_BATCH_SIZE,
  timeout = 15_000,
}) {
  const keyCheck = validateKey(key);
  if (!keyCheck.valid) {
    return {
      ok: false,
      submitted: 0,
      reason: keyCheck.reason,
      batches: [],
    };
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return { ok: false, submitted: 0, reason: 'No URLs provided', batches: [] };
  }

  // If host wasn't supplied, derive it from the first URL
  let resolvedHost = host;
  if (!resolvedHost) {
    const first = parseUrlSafe(urls[0]);
    if (!first) {
      return { ok: false, submitted: 0, reason: 'Invalid first URL', batches: [] };
    }
    resolvedHost = first.hostname;
  }

  const { valid, rejected } = normaliseAndValidateUrls(urls, resolvedHost);
  if (valid.length === 0) {
    return {
      ok: false,
      submitted: 0,
      reason: 'No valid URLs after filtering',
      rejected,
      batches: [],
    };
  }

  const batches = [];
  let submitted = 0;
  let pending = 0;

  const size = Math.min(batchSize, MAX_URLS_PER_POST);
  for (let i = 0; i < valid.length; i += size) {
    const slice = valid.slice(i, i + size);

    const body = {
      host: resolvedHost,
      key,
      urlList: slice,
    };
    if (keyLocation) body.keyLocation = keyLocation;

    try {
      const res = await axios.post(endpoint, body, {
        timeout,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': USER_AGENT,
        },
        validateStatus: () => true, // we handle codes ourselves
      });

      const status = res.status;
      const accepted = status === 200;
      const awaitingVerification = status === 202;

      if (accepted) submitted += slice.length;
      if (awaitingVerification) pending += slice.length;

      batches.push({
        batchIndex: batches.length,
        urlCount: slice.length,
        status,
        ok: accepted || awaitingVerification,
        pending: awaitingVerification,
        response:
          typeof res.data === 'string'
            ? res.data.slice(0, 300)
            : res.data || null,
      });

      // 429 = rate limited. Stop immediately; caller can retry later.
      if (status === 429) {
        batches[batches.length - 1].fatal = true;
        break;
      }
    } catch (e) {
      batches.push({
        batchIndex: batches.length,
        urlCount: slice.length,
        status: e.response?.status || null,
        ok: false,
        error: e.message,
        fatal: true,
      });
      break;
    }
  }

  const allOk = batches.every((b) => b.ok);
  return {
    ok: allOk,
    endpoint,
    host: resolvedHost,
    submitted,
    pending,
    total: valid.length,
    rejected,
    batches,
    // Human-readable summary for the widget
    message: allOk
      ? pending > 0
        ? `${submitted} URL(s) accepted, ${pending} awaiting key verification`
        : `${submitted} URL(s) submitted successfully`
      : `${submitted} URL(s) submitted, but some batches failed`,
  };
}

// ============================================================
// SINGLE-URL GET FORM (handy for dashboards / manual tests)
// ============================================================
export async function submitSingleUrl({
  url,
  key,
  keyLocation = null,
  endpoint = ENDPOINTS.shared,
  timeout = 10_000,
}) {
  const keyCheck = validateKey(key);
  if (!keyCheck.valid) {
    return { ok: false, reason: keyCheck.reason };
  }

  const u = parseUrlSafe(url);
  if (!u) return { ok: false, reason: 'Invalid URL' };

  const params = new URLSearchParams({ url: u.toString(), key });
  if (keyLocation) params.set('keyLocation', keyLocation);

  try {
    const res = await axios.get(`${endpoint}?${params.toString()}`, {
      timeout,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true,
    });
    return {
      ok: res.status === 200 || res.status === 202,
      status: res.status,
      pending: res.status === 202,
      response: res.data || null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// SITEMAP CHECK — verification only, no pinging
// (Google 404 / Bing 410 on ping endpoints since 2023)
// ============================================================
export async function verifySitemap(sitemapUrl, timeout = 8000) {
  if (!sitemapUrl) {
    return { ok: false, reason: 'No sitemap URL provided' };
  }
  try {
    const res = await axios.get(sitemapUrl, {
      timeout,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true,
      maxContentLength: 2_000_000,
    });

    if (res.status !== 200) {
      return {
        ok: false,
        status: res.status,
        sitemapUrl,
        reason: `Sitemap returned HTTP ${res.status}`,
      };
    }

    const body = String(res.data ?? '');
    const looksLikeXml =
      body.includes('<urlset') || body.includes('<sitemapindex');

    return {
      ok: looksLikeXml,
      status: res.status,
      sitemapUrl,
      urlCount: (body.match(/<loc>/g) || []).length,
      reason: looksLikeXml
        ? null
        : 'File is reachable but does not look like a sitemap',
      note:
        'Ping endpoints are deprecated (Google 404, Bing 410). ' +
        'Submit once via Search Console / Bing Webmaster Tools, then rely on robots.txt + IndexNow.',
    };
  } catch (e) {
    return { ok: false, sitemapUrl, reason: e.message };
  }
}

// ============================================================
// CONVENIENCE: verify key + sitemap, then submit — with DB logging
// Used by /api/backlink and the widget's Backlink tab.
// ============================================================
export async function submitWithJobLog({
  apiKey,
  urls,
  siteUrl,
  key = process.env.INDEXNOW_KEY,
  keyLocation = null,
  endpoint = ENDPOINTS.shared,
  skipKeyCheck = false,
}) {
  const job = await createBacklinkJob(apiKey, siteUrl, 'indexnow', {
    urlCount: urls.length,
    endpoint,
  });

  try {
    let keyResult = { ok: true, skipped: true };
    if (!skipKeyCheck) {
      keyResult = await verifyKeyFile({ siteUrl, key, keyLocation });
    }

    if (!keyResult.ok) {
      await updateBacklinkJob(job.id, 'failed', { keyResult });
      return { ok: false, stage: 'key_verification', keyResult, jobId: job.id };
    }

    const result = await submitUrls({
      urls,
      key,
      keyLocation,
      endpoint,
    });

    await updateBacklinkJob(job.id, result.ok ? 'done' : 'failed', result);

    return { ...result, keyResult, jobId: job.id };
  } catch (e) {
    await updateBacklinkJob(job.id, 'failed', { error: e.message });
    return { ok: false, error: e.message, jobId: job.id };
  }
}

export default {
  ENDPOINTS,
  validateKey,
  buildKeyFileUrl,
  verifyKeyFile,
  submitUrls,
  submitSingleUrl,
  verifySitemap,
  submitWithJobLog,
};