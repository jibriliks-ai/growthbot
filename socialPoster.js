// ============================================================
// GrowthBot — Facebook Page + LinkedIn Company poster
// ============================================================
import axios from 'axios';
import crypto from 'crypto';
import {
  getSocialAccount,
  updateSocialToken,
  markSocialPosted,
} from './db.js';

// ============================================================
// TOKEN ENCRYPTION (AES-256-GCM)
// ============================================================
const ALGO = 'aes-256-gcm';
const KEY = crypto
  .createHash('sha256')
  .update(process.env.TOKEN_ENCRYPTION_KEY || '')
  .digest();

export function encryptToken(plain) {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptToken(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  const decipher = crypto.createDecipheriv(
    ALGO, KEY, Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

// ============================================================
// CONFIG
// ============================================================
const FB_GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v26.0';
const FB_GRAPH = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;
const LI_VERSION = process.env.LINKEDIN_API_VERSION || '202607';
const LI_BASE = 'https://api.linkedin.com/rest';

// ============================================================
// FACEBOOK
// ============================================================
export async function postToFacebook({
  pageId, pageToken, message, link = null, imageUrl = null,
}) {
  if (!pageId || !pageToken) {
    return { ok: false, platform: 'facebook', error: 'Missing pageId or pageToken' };
  }
  if (!message && !link && !imageUrl) {
    return { ok: false, platform: 'facebook', error: 'Post has no content' };
  }

  const body = { message: message || '', access_token: pageToken };
  if (link) body.link = link;
  if (imageUrl) body.picture = imageUrl;

  try {
    const res = await axios.post(`${FB_GRAPH}/${pageId}/feed`, body, {
      timeout: 20_000,
      validateStatus: (s) => s < 500,
    });

    if (res.data?.id) {
      return {
        ok: true,
        platform: 'facebook',
        postId: res.data.id,
        url: `https://www.facebook.com/${res.data.id.replace('_', '/posts/')}`,
      };
    }
    return {
      ok: false,
      platform: 'facebook',
      error: res.data?.error?.message || 'Unknown Facebook error',
      code: res.data?.error?.code,
    };
  } catch (e) {
    return {
      ok: false,
      platform: 'facebook',
      error: e.response?.data?.error?.message || e.message,
    };
  }
}

// ============================================================
// LINKEDIN
// ============================================================
export async function postToLinkedIn({
  organizationId, accessToken, commentary, articleUrl = null, articleTitle = null,
}) {
  if (!organizationId || !accessToken || !commentary) {
    return { ok: false, platform: 'linkedin', error: 'Missing required fields' };
  }

  const payload = {
    author: `urn:li:organization:${organizationId}`,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (articleUrl) {
    payload.content = {
      article: {
        source: articleUrl,
        title: articleTitle || commentary.slice(0, 80),
        description: commentary.slice(0, 200),
      },
    };
  }

  try {
    const res = await axios.post(`${LI_BASE}/posts`, payload, {
      timeout: 20_000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Linkedin-Version': LI_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      validateStatus: (s) => s < 500,
    });

    if (res.status === 201) {
      return {
        ok: true,
        platform: 'linkedin',
        postId: res.headers['x-restli-id'] || null,
        url: res.headers['x-restli-id']
          ? `https://www.linkedin.com/feed/update/${res.headers['x-restli-id']}`
          : null,
      };
    }
    return {
      ok: false,
      platform: 'linkedin',
      status: res.status,
      error: res.data?.message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      platform: 'linkedin',
      error: e.response?.data?.message || e.message,
    };
  }
}

// ============================================================
// TOKEN REFRESH
// ============================================================
export async function refreshFacebookPageToken({
  userToken,
  appId = process.env.FACEBOOK_APP_ID,
  appSecret = process.env.FACEBOOK_APP_SECRET,
}) {
  if (!userToken || !appId || !appSecret) {
    return { ok: false, error: 'Missing userToken, appId, or appSecret' };
  }
  try {
    const exchange = await axios.get(`${FB_GRAPH}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userToken,
      },
      timeout: 15_000,
    });
    const longUserToken = exchange.data?.access_token;
    if (!longUserToken) {
      return { ok: false, error: 'No long-lived user token returned' };
    }
    const pages = await axios.get(`${FB_GRAPH}/me/accounts`, {
      params: { access_token: longUserToken },
      timeout: 15_000,
    });
    return {
      ok: true,
      longUserToken,
      pages: (pages.data?.data || []).map((p) => ({
        id: p.id,
        name: p.name,
        accessToken: p.access_token,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error?.message || e.message,
    };
  }
}

export async function refreshLinkedInToken({
  refreshToken,
  clientId = process.env.LINKEDIN_CLIENT_ID,
  clientSecret = process.env.LINKEDIN_CLIENT_SECRET,
}) {
  if (!refreshToken || !clientId || !clientSecret) {
    return { ok: false, error: 'Missing refreshToken, clientId, or clientSecret' };
  }
  try {
    const res = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
      }
    );
    return {
      ok: true,
      accessToken: res.data?.access_token,
      expiresIn: res.data?.expires_in,
      refreshToken: res.data?.refresh_token,
      refreshExpiresIn: res.data?.refresh_token_expires_in,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.response?.data?.error_description || e.message,
    };
  }
}

// ============================================================
// ACCOUNT-AWARE POST
// ============================================================
export async function postForAccount({
  apiKey, platform, message, link = null, imageUrl = null,
}) {
  const account = await getSocialAccount(apiKey, platform);
  if (!account || !account.enabled) {
    return {
      ok: false,
      platform,
      error: `No enabled ${platform} account for this API key`,
    };
  }

  let accessToken = decryptToken(account.access_token_enc);
  if (!accessToken) {
    return { ok: false, platform, error: 'Could not decrypt access token' };
  }

  if (account.expires_at) {
    const msLeft = new Date(account.expires_at).getTime() - Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (msLeft < threeDays && platform === 'linkedin' && account.refresh_token_enc) {
      const refreshToken = decryptToken(account.refresh_token_enc);
      const refreshed = await refreshLinkedInToken({ refreshToken });
      if (refreshed.ok) {
        accessToken = refreshed.accessToken;
        await updateSocialToken(apiKey, platform, {
          accessTokenEnc: encryptToken(refreshed.accessToken),
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        });
      }
    }
  }

  let result;
  if (platform === 'facebook') {
    result = await postToFacebook({
      pageId: account.account_id,
      pageToken: accessToken,
      message,
      link,
      imageUrl,
    });
  } else if (platform === 'linkedin') {
    result = await postToLinkedIn({
      organizationId: account.account_id,
      accessToken,
      commentary: message,
      articleUrl: link,
    });
  } else {
    return { ok: false, platform, error: `Unsupported platform: ${platform}` };
  }

  if (result.ok) {
    await markSocialPosted(apiKey, platform);
  } else {
    await updateSocialToken(apiKey, platform, {
      accessTokenEnc: account.access_token_enc,
      expiresAt: account.expires_at,
      lastError: result.error,
    });
  }

  return result;
}

export default {
  encryptToken,
  decryptToken,
  postToFacebook,
  refreshFacebookPageToken,
  postToLinkedIn,
  refreshLinkedInToken,
  postForAccount,
};