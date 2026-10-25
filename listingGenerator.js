// ============================================================
// GrowthBot — Directory / NAP listing package generator
// ============================================================
// Replaces fragile Puppeteer auto-submission with 100%-reliable,
// copy-paste-ready listing packages. No platform can ban a user
// for pasting text they generated themselves.
//
// One OpenAI call produces every platform's copy. If OpenAI is
// unavailable, formula fallbacks keep the product usable.
// ============================================================

export const PLATFORM_SPECS = {
  jiji: {
    label: 'Jiji.ng',
    titleMax: 70,
    descMax: 1000,
    note: 'Use the “Post Ad” flow. Choose the closest category, paste title + description, upload 3+ photos.',
  },
  gbp: {
    label: 'Google Business Profile',
    titleMax: 30,
    descMax: 750,
    note: 'Edit “Business description”. Keep NAP identical to your website footer.',
  },
  vconnect: {
    label: 'VConnect',
    titleMax: 80,
    descMax: 2000,
    note: 'Free listing. Add all service categories you actually offer.',
  },
  yellowpages: {
    label: 'Yellow Pages Nigeria',
    titleMax: 80,
    descMax: 1000,
    note: 'Free basic listing. Pick the most specific category available.',
  },
  generic: {
    label: 'Generic directory (300+ sites)',
    titleMax: 60,
    descMax: 300,
    note: 'Use this short version for directories with tight limits.',
  },
};

// ============================================================
// HELPERS
// ============================================================
function clean(str) {
  return String(str ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(str, max) {
  const s = clean(str);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

// Normalise Nigerian phone numbers to +234XXXXXXXXXX for NAP checks
export function normalisePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

// Normalise address for comparison (not for display)
export function normaliseAddress(raw) {
  return clean(raw)
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseName(raw) {
  return clean(raw).toLowerCase().replace(/\s+/g, ' ');
}

// ============================================================
// NAP CONSISTENCY CHECK
// ============================================================
export function checkNaps(profile, packages) {
  const canonical = {
    name: normaliseName(profile.name),
    address: normaliseAddress(profile.address),
    phone: normalisePhone(profile.phone),
  };

  const mismatches = [];

  for (const [platform, pkg] of Object.entries(packages)) {
    if (!pkg) continue;

    const pName = normaliseName(pkg.name);
    const pAddr = normaliseAddress(pkg.address);
    const pPhone = normalisePhone(pkg.phone);

    if (pName && pName !== canonical.name) {
      mismatches.push({
        platform,
        field: 'name',
        expected: canonical.name,
        found: pName,
      });
    }
    if (pAddr && pAddr !== canonical.address) {
      mismatches.push({
        platform,
        field: 'address',
        expected: canonical.address,
        found: pAddr,
      });
    }
    if (pPhone && pPhone !== canonical.phone) {
      mismatches.push({
        platform,
        field: 'phone',
        expected: canonical.phone,
        found: pPhone,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    canonical,
    mismatches,
    message:
      mismatches.length === 0
        ? 'NAP is consistent across every generated listing.'
        : `${mismatches.length} NAP mismatch(es) found — fix before publishing.`,
  };
}

// ============================================================
// FORMULA FALLBACKS (used when OpenAI is unavailable)
// ============================================================
function fallbackPackage(profile, spec) {
  const name = clean(profile.name);
  const city = clean(profile.city);
  const state = clean(profile.state);
  const category = clean(profile.category) || 'Business';
  const services = Array.isArray(profile.services)
    ? profile.services.filter(Boolean).slice(0, 5)
    : [];

  const location = [city, state].filter(Boolean).join(', ');

  const title = truncate(
    `${name} — ${category}${location ? ` in ${location}` : ''}`,
    spec.titleMax
  );

  const parts = [];
  parts.push(
    `${name} is a trusted ${category.toLowerCase()}${
      location ? ` based in ${location}` : ''
    }.`
  );
  if (services.length) {
    parts.push(`We offer: ${services.join(', ')}.`);
  }
  if (profile.description) {
    parts.push(clean(profile.description));
  }
  parts.push(
    `Call ${clean(profile.phone) || 'us'} or WhatsApp ${
      clean(profile.whatsapp) || clean(profile.phone) || 'us'
    } to get started.`
  );
  if (profile.website) {
    parts.push(`Website: ${clean(profile.website)}`);
  }

  const description = truncate(parts.join(' '), spec.descMax);

  return {
    platform: spec.label,
    title,
    description,
    name,
    address: clean(profile.address),
    phone: clean(profile.phone),
    website: clean(profile.website),
    category: clean(profile.category),
    note: spec.note,
  };
}

// ============================================================
// OPENAI CALL — one prompt for every platform
// ============================================================
async function callAIForPackages(profile, openai) {
  const platformList = Object.entries(PLATFORM_SPECS)
    .map(
      ([key, s]) =>
        `- ${key} ("${s.label}"): title ≤ ${s.titleMax} chars, description ≤ ${s.descMax} chars`
    )
    .join('\n');

  const prompt = `You are a local-SEO copywriter for Nigerian businesses.
Create ready-to-paste directory listings from this business profile.

BUSINESS PROFILE
Name: ${clean(profile.name)}
Address: ${clean(profile.address)}
City: ${clean(profile.city)}
State: ${clean(profile.state)}
Phone: ${clean(profile.phone)}
WhatsApp: ${clean(profile.whatsapp)}
Email: ${clean(profile.email)}
Website: ${clean(profile.website)}
Category: ${clean(profile.category)}
Services: ${(profile.services || []).join(', ')}
Existing description: ${clean(profile.description)}
Target keywords: ${(profile.keywords || []).join(', ')}

PLATFORM LIMITS
${platformList}

Return valid JSON only (no markdown, no code fences):
{
  "jiji": { "title": "...", "description": "..." },
  "gbp": { "title": "...", "description": "..." },
  "vconnect": { "title": "...", "description": "..." },
  "yellowpages": { "title": "...", "description": "..." },
  "generic": { "title": "...", "description": "..." }
}

Rules:
- Every title must include the business name.
- Descriptions must be specific, benefit-led, and include the city/state.
- Do NOT invent services, awards, or claims that are not in the profile.
- Do NOT change the phone number, address, or business name.
- Keep every field within its character limit.
- Language: English (Nigerian English is fine).`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    console.error('⚠️  AI listing generation failed:', e.message);
    return null;
  }
}

// ============================================================
// MAIN GENERATOR
// ============================================================
export async function generateListingPackages({ profile, openai = null }) {
  if (!profile || !clean(profile.name)) {
    throw new Error('A business profile with at least a name is required');
  }

  const ai = openai ? await callAIForPackages(profile, openai) : null;

  const packages = {};
  const warnings = [];

  for (const [key, spec] of Object.entries(PLATFORM_SPECS)) {
    const fallback = fallbackPackage(profile, spec);

    const aiPkg = ai?.[key];
    let title = clean(aiPkg?.title) || fallback.title;
    let description = clean(aiPkg?.description) || fallback.description;

    if (title.length > spec.titleMax) {
      warnings.push(
        `${spec.label}: title was ${title.length} chars — truncated to ${spec.titleMax}.`
      );
      title = truncate(title, spec.titleMax);
    }
    if (description.length > spec.descMax) {
      warnings.push(
        `${spec.label}: description was ${description.length} chars — truncated to ${spec.descMax}.`
      );
      description = truncate(description, spec.descMax);
    }

    // Force NAP from the canonical profile — AI must never change these
    packages[key] = {
      platform: spec.label,
      title,
      description,
      name: clean(profile.name),
      address: clean(profile.address),
      phone: clean(profile.phone),
      whatsapp: clean(profile.whatsapp) || clean(profile.phone),
      email: clean(profile.email),
      website: clean(profile.website),
      category: clean(profile.category),
      note: spec.note,
      source: aiPkg ? 'ai' : 'fallback',
    };
  }

  const napCheck = checkNaps(profile, packages);

  return {
    profile,
    packages,
    napCheck,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// PRETTY PRINTER — for the widget “Copy” buttons
// ============================================================
export function formatPackageForClipboard(pkg) {
  const lines = [
    `── ${pkg.platform} ──`,
    `Title: ${pkg.title}`,
    '',
    pkg.description,
    '',
    `Name: ${pkg.name}`,
    `Address: ${pkg.address}`,
    `Phone: ${pkg.phone}`,
    pkg.whatsapp ? `WhatsApp: ${pkg.whatsapp}` : null,
    pkg.website ? `Website: ${pkg.website}` : null,
    `Category: ${pkg.category}`,
    '',
    `Tip: ${pkg.note}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export default {
  PLATFORM_SPECS,
  normalisePhone,
  normaliseAddress,
  checkNaps,
  generateListingPackages,
  formatPackageForClipboard,
};