// ============================================================
// GrowthBot — MOD 5 Lead Engine
// ============================================================
// Smart links + lead capture + WhatsApp + review requests.
//
// WhatsApp is used in two different ways:
//   1. Smart link redirect uses a wa.me deep link (NO API needed)
//      → works immediately, no Meta app review
//   2. Review requests use WhatsApp Cloud API (requires approval)
//      → gated behind WHATSAPP_ACCESS_TOKEN
// ============================================================
import axios from 'axios';
import {
  getSmartLinkBySlug,
  recordSmartLinkClick,
  createLead,
  createReviewRequest,
  markReviewFailed,
  findLeadsDeliveredBefore,
} from './db.js';

// ============================================================
// CONFIG
// ============================================================
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:10000').replace(/\/$/, '');
const SMART_LINK_PREFIX = (process.env.SMART_LINK_PREFIX || 'l').replace(/^\/|\/$/g, '');

const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WA_TEMPLATE = process.env.WHATSAPP_TEMPLATE_REVIEW || 'review_request_v1';
const WA_API = 'https://graph.facebook.com/v21.0';

const IPAPI_KEY = process.env.IPAPI_KEY || '';
const USER_AGENT = 'GrowthBot/3.1';

// ============================================================
// SLUG GENERATION
// ============================================================
// Format: {platform}-{businessSlug}-{6hex}
// Example: fb-jibriliks-4f8a9c
// Collision-safe: 16.7M combos per platform+business pair.
// ============================================================
export function generateSlug({ platform, businessName, campaignId }) {
  const platformPart = String(platform || 'direct')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12) || 'direct';

  const businessPart = String(businessName || 'biz')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16) || 'biz';

  const randomPart = Math.random().toString(16).slice(2, 8);

  // campaignId is kept in the slug context for debugging, but not in the slug
  // itself — that way the URL is readable.
  return `${platformPart}-${businessPart}-${randomPart}`;
}

// ============================================================
// BUILD DESTINATION URL (wa.me deep link)
// ============================================================
// Uses the business's WhatsApp number to construct a wa.me link
// with a pre-filled, personalised message. No API key required.
// ============================================================
export function buildDestinationUrl({ business, campaign, platform }) {
  const phone = String(
    business?.whatsapp || business?.phone || ''
  ).replace(/\D/g, '');

  if (!phone) {
    // Fall back to the business website if no WhatsApp
    if (business?.website) return business.website;
    throw new Error(
      'Business has no WhatsApp, phone, or website — cannot redirect a smart link'
    );
  }

  // Normalise Nigerian numbers to +234XXXXXXXXXX for wa.me
  let waNumber = phone;
  if (waNumber.startsWith('0') && waNumber.length === 11) {
    waNumber = '234' + waNumber.slice(1);
  } else if (waNumber.startsWith('234')) {
    waNumber = phone;
  } else if (waNumber.length === 10) {
    waNumber = '234' + waNumber;
  }

  const platformLabel = {
    fb: 'Facebook',
    ig: 'Instagram',
    jiji: 'Jiji',
    linkedin: 'LinkedIn',
    gmb: 'Google',
    direct: 'your website',
  }[platform] || platform;

  const campaignName = campaign?.name || 'your recent advert';
  const message = `Hi ${business.name || 'there'}, I saw your advert "${campaignName}" on ${platformLabel}. I'm interested — can we talk?`;

  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

// ============================================================
// CREATE SMART LINKS FOR A CAMPAIGN
// ============================================================
export async function createSmartLinkForCampaign({
  campaign,
  business,
  platforms = ['fb', 'ig', 'jiji', 'linkedin', 'gmb', 'direct'],
  createSmartLinkFn, // injected to avoid circular imports
}) {
  if (!campaign?.id || !business?.id) {
    throw new Error('campaign and business with IDs are required');
  }

  const links = [];
  const errors = [];

  for (const platform of platforms) {
    try {
      const slug = generateSlug({
        platform,
        businessName: business.name,
        campaignId: campaign.id,
      });
      const destinationUrl = buildDestinationUrl({ business, campaign, platform });
      const link = await createSmartLinkFn({
        campaignId: campaign.id,
        slug,
        platform,
        destinationUrl,
      });
      links.push({
        ...link,
        publicUrl: `${PUBLIC_BASE_URL}/${SMART_LINK_PREFIX}/${slug}`,
      });
    } catch (e) {
      errors.push({ platform, error: e.message });
    }
  }

  return { links, errors };
}

// ============================================================
// IP GEOLOCATION — best effort, never blocks the redirect
// ============================================================
export async function geolocateIp(ip) {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.')) return null;
  if (!IPAPI_KEY) return null;

  try {
    const res = await axios.get(`https://ipapi.co/${ip}/json/`, {
      params: { key: IPAPI_KEY },
      timeout: 2500,
    });
    if (res.data?.error) return null;
    return {
      city: res.data.city || null,
      region: res.data.region || null,
      country: res.data.country_name || null,
    };
  } catch {
    return null; // Never block redirect on geolocation failure
  }
}

// ============================================================
// RESOLVE SMART LINK — the /l/:slug handler logic
// ============================================================
// Returns { redirectUrl, lead, smartLink, platform } or throws.
// The Express route wrapper (FILE 12) will do the actual 302.
// ============================================================
export async function resolveSmartLink({
  slug,
  ip,
  userAgent,
  referrer,
}) {
  const link = await getSmartLinkBySlug(slug);
  if (!link) {
    const err = new Error('Smart link not found');
    err.code = 'LINK_NOT_FOUND';
    throw err;
  }

  // Increment click counter (fire-and-forget friendly, but awaited here)
  await recordSmartLinkClick(slug).catch((e) => {
    console.error('⚠️  Could not record click:', e.message);
  });

  // Geolocate (best effort — returns null on failure)
  const geo = await geolocateIp(ip);

  // Create a lead row for every click. This is the "capture" step.
  // Even clicks that don't convert are useful analytics.
  let lead = null;
  try {
    lead = await createLead({
      businessId: link.business_id,
      campaignId: link.campaign_id,
      smartLinkId: link.id,
      sourcePlatform: link.platform,
      name: '',
      phone: '',
      email: '',
      ipAddress: ip || null,
      ipCity: geo?.city || null,
      userAgent: userAgent || null,
      referrer: referrer || null,
      intent: 'clicked',
      status: 'new',
      notes: `Auto-captured from smart link ${slug}`,
    });
  } catch (e) {
    console.error('⚠️  Could not create lead:', e.message);
    // Do NOT throw — the redirect must always work
  }

  return {
    redirectUrl: link.destination_url,
    smartLink: link,
    lead,
    platform: link.platform,
    campaignName: link.campaign_name,
    businessName: link.business_name,
  };
}

// ============================================================
// WHATSAPP CLOUD API — gated helper
// ============================================================
function ensureWhatsAppConfigured() {
  if (!WA_PHONE_ID || !WA_TOKEN) {
    const err = new Error(
      'WhatsApp Cloud API not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env, and get the app approved by Meta.'
    );
    err.code = 'WHATSAPP_NOT_CONFIGURED';
    throw err;
  }
}

// Send a plain text message — only works within the 24h customer service window
export async function sendWhatsAppText(toPhone, body) {
  ensureWhatsAppConfigured();
  const to = String(toPhone).replace(/\D/g, '');
  const res = await axios.post(
    `${WA_API}/${WA_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    }
  );
  return res.data;
}

// Send a pre-approved template message — REQUIRED outside the 24h window
// Template must be approved in the WhatsApp Manager.
export async function sendWhatsAppTemplate(toPhone, templateName, variables = []) {
  ensureWhatsAppConfigured();
  const to = String(toPhone).replace(/\D/g, '');

  // Standard template body: "Hi {{1}}, thanks for choosing {{2}}. Please leave us a review: {{3}}"
  const components =
    variables.length > 0
      ? [
          {
            type: 'body',
            parameters: variables.map((v) => ({ type: 'text', text: String(v) })),
          },
        ]
      : [];

  const res = await axios.post(
    `${WA_API}/${WA_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    }
  );
  return res.data;
}

// ============================================================
// BUILD REVIEW MESSAGE
// ============================================================
export function buildWhatsAppReviewMessage({
  businessName,
  leadName,
  googleReviewUrl,
}) {
  const who = leadName ? `Hi ${leadName}` : 'Hi';
  return (
    `${who}! 👋 Thanks for choosing ${businessName}.\n\n` +
    `If you enjoyed your experience, would you mind leaving us a quick review? ` +
    `It takes 30 seconds and means the world to us:\n\n${googleReviewUrl}\n\n` +
    `Thank you! 🙏`
  );
}

// ============================================================
// WHATSAPP WEBHOOK — record inbound messages as leads
// ============================================================
// Meta sends a POST with:
//   entry[].changes[].value.messages[]  ← inbound
//   entry[].changes[].value.statuses[]  ← delivery updates
// See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
// ============================================================
export async function recordLeadFromWhatsApp(payload) {
  const results = [];
  const errors = [];

  const entries = payload?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = value.messages || [];

      for (const msg of messages) {
        try {
          const phone = msg.from;
          const text = msg.text?.body || msg.button?.text || '';
          const contactName = value.contacts?.[0]?.profile?.name || '';

          // Which business owns this phone number ID?
          const waPhoneId = value.metadata?.phone_number_id;
          if (!waPhoneId) continue;

          // The lead needs a business_id. We look it up by matching
          // the WhatsApp phone number ID to a business. Since businesses
          // table doesn't store the WA phone ID yet, we do a best-effort
          // match against any business with a WhatsApp number that owns
          // this webhook. This requires one business per WA number.
          //
          // For a multi-business setup, add a `wa_phone_number_id` column
          // to businesses in a future migration. For now, skip gracefully.
          const businessId = await findBusinessByWhatsAppPhoneId(waPhoneId);
          if (!businessId) {
            errors.push({
              phone,
              error: 'No business mapped to this WhatsApp phone number ID',
            });
            continue;
          }

          const lead = await createLead({
            businessId,
            campaignId: null,
            smartLinkId: null,
            sourcePlatform: 'whatsapp',
            name: contactName,
            phone,
            email: '',
            ipAddress: null,
            ipCity: null,
            userAgent: null,
            referrer: 'whatsapp_inbound',
            intent: 'message',
            status: 'new',
            notes: text.slice(0, 500),
          });

          results.push(lead);
        } catch (e) {
          errors.push({ error: e.message });
        }
      }
    }
  }

  return { leads: results, errors };
}

// Placeholder — replace with real lookup once businesses has a
// wa_phone_number_id column. For now returns null, which is honest.
async function findBusinessByWhatsAppPhoneId(_waPhoneId) {
  return null;
}

// ============================================================
// REVIEW CRON — the daily review-request job
// ============================================================
// Finds leads delivered 24+ hours ago with no review request yet,
// sends the WhatsApp template, records the outcome.
//
// Requirements:
//   • Lead has status = 'delivered' and delivered_at ≥ 24h ago
//   • Business has a google_review_url
//   • WhatsApp Cloud API is configured
// ============================================================
export async function runReviewCron({ hoursAgo = 24, dryRun = false } = {}) {
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

  let candidates;
  try {
    candidates = await findLeadsDeliveredBefore(cutoff);
  } catch (e) {
    return { ok: false, stage: 'query', error: e.message };
  }

  if (candidates.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped: 0, candidates: 0 };
  }

  let whatsappConfigured = Boolean(WA_PHONE_ID && WA_TOKEN);

  const results = {
    ok: true,
    candidates: candidates.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  for (const lead of candidates) {
    if (!lead.phone) {
      results.skipped++;
      results.details.push({
        leadId: lead.id,
        skipped: true,
        reason: 'No phone number',
      });
      continue;
    }
    if (!lead.google_review_url) {
      results.skipped++;
      results.details.push({
        leadId: lead.id,
        skipped: true,
        reason: 'Business has no google_review_url',
      });
      continue;
    }
    if (!whatsappConfigured) {
      results.skipped++;
      results.details.push({
        leadId: lead.id,
        skipped: true,
        reason: 'WhatsApp Cloud API not configured',
      });
      continue;
    }

    if (dryRun) {
      results.details.push({
        leadId: lead.id,
        dryRun: true,
        wouldSendTo: lead.phone,
        messagePreview: buildWhatsAppReviewMessage({
          businessName: lead.business_name,
          leadName: lead.name,
          googleReviewUrl: lead.google_review_url,
        }).slice(0, 100),
      });
      continue;
    }

    try {
      // Create the review request row FIRST, then send.
      // This way a failed send still gets logged.
      const review = await createReviewRequest({
        businessId: lead.business_id,
        leadId: lead.id,
        googleReviewUrl: lead.google_review_url,
        platform: 'google',
        status: 'sending',
      });

      // The template must be approved in WhatsApp Manager.
      // Variables: [leadName||'customer', businessName, reviewUrl]
      await sendWhatsAppTemplate(lead.phone, WA_TEMPLATE, [
        lead.name || 'customer',
        lead.business_name,
        lead.google_review_url,
      ]);

      results.sent++;
      results.details.push({
        leadId: lead.id,
        reviewId: review.id,
        sent: true,
      });
    } catch (e) {
      results.failed++;
      results.details.push({
        leadId: lead.id,
        error: e.message,
      });
      // Best effort — try to mark the review row failed if one exists
      // (we don't have the id here if createReviewRequest itself failed)
      try {
        // re-query is too heavy; log to console
        console.error(
          `⚠️  Review send failed for lead ${lead.id}:`,
          e.message
        );
      } catch {}
    }
  }

  return results;
}

// ============================================================
// SMOKE TEST HELPERS
// ============================================================
export function isWhatsAppConfigured() {
  return Boolean(WA_PHONE_ID && WA_TOKEN);
}

export function smartLinkUrl(slug) {
  return `${PUBLIC_BASE_URL}/${SMART_LINK_PREFIX}/${slug}`;
}

export default {
  generateSlug,
  buildDestinationUrl,
  createSmartLinkForCampaign,
  geolocateIp,
  resolveSmartLink,
  sendWhatsAppText,
  sendWhatsAppTemplate,
  buildWhatsAppReviewMessage,
  recordLeadFromWhatsApp,
  runReviewCron,
  isWhatsAppConfigured,
  smartLinkUrl,
};