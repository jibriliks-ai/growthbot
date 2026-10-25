// ============================================================
// GrowthBot — Video engine
// ============================================================
// Pipeline:
//   1. OpenAI     → script sized to duration (10–25s)
//   2. Pexels     → N portrait clips (N scales with duration)
//   3. ElevenLabs → MP3 voiceover (MANDATORY)
//   4. Shotstack  → 9:16 MP4 render
//
// Five professional advert style templates drive fonts, colors,
// transitions, music, and pacing.
//
// Voiceover is NOT optional. If ElevenLabs fails, the job fails
// with a clear error. No silent music-only fallbacks.
// ============================================================
import axios from 'axios';
import OpenAI from 'openai';

// ============================================================
// CONFIG
// ============================================================
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SHOTSTACK_ENV =
  String(process.env.SHOTSTACK_ENV || 'stage').toLowerCase() === 'production'
    ? 'v1'
    : 'stage';

const SHOTSTACK_EDIT_BASE = `https://api.shotstack.io/edit/${SHOTSTACK_ENV}`;
const SHOTSTACK_INGEST_BASE = `https://api.shotstack.io/ingest/${SHOTSTACK_ENV}`;
const SHOTSTACK_KEY = process.env.SHOTSTACK_API_KEY || '';

const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

const USER_AGENT = 'GrowthBot/3.0 (+https://growthbot.app)';

// ============================================================
// DURATION PRESETS
// ============================================================
// Words-per-second ≈ 2.8 for natural speech with breathing room.
// Scene proportions keep hook short, benefit long, CTA tight.
// ============================================================
export const DURATION_PRESETS = {
  10: { clips: 2, words: 28, hookSec: 3, benefitSec: 4, ctaSec: 3 },
  15: { clips: 3, words: 42, hookSec: 3, benefitSec: 7, ctaSec: 5 },
  20: { clips: 4, words: 56, hookSec: 4, benefitSec: 10, ctaSec: 6 },
  25: { clips: 5, words: 70, hookSec: 5, benefitSec: 13, ctaSec: 7 },
};

export function normaliseDuration(input) {
  const n = Number(input);
  const valid = [10, 15, 20, 25];
  if (valid.includes(n)) return n;
  // Snap to nearest valid
  return valid.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 15);
}

// ============================================================
// STYLE TEMPLATES
// ============================================================
// Each template drives Shotstack output: fonts, colors, transitions,
// music, and pacing. Users pick one before generating.
// ============================================================
export const STYLE_TEMPLATES = {
  documentary: {
    label: 'Documentary',
    description: 'Calm, trustworthy, muted tones. Great for education and serious brands.',
    font: 'Inter',
    titleColor: '#ffffff',
    titleBackground: '#1f2937',
    accentColor: '#60a5fa',
    transition: { in: 'fade', out: 'fade' },
    musicUrl:
      'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/looking-up.mp3',
    musicVolume: 0.18,
    voiceStyle: 'calm and measured, slight Nigerian accent',
  },
  infomercial: {
    label: 'Infomercial',
    description: 'High energy, bold colors, punchy cuts. Best for products and promos.',
    font: 'Montserrat',
    titleColor: '#facc15',
    titleBackground: '#dc2626',
    accentColor: '#f97316',
    transition: { in: 'zoom', out: 'slideLeft' },
    musicUrl:
      'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/summer-party.mp3',
    musicVolume: 0.22,
    voiceStyle: 'energetic, excited, upbeat pitch',
  },
  tutorial: {
    label: 'Tutorial',
    description: 'Clean, structured, neutral. Best for how-to guides and demos.',
    font: 'Inter',
    titleColor: '#111827',
    titleBackground: '#f3f4f6',
    accentColor: '#7c3aed',
    transition: { in: 'slideRight', out: 'slideLeft' },
    musicUrl:
      'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/afternoon.mp3',
    musicVolume: 0.15,
    voiceStyle: 'clear, instructional, friendly',
  },
  testimonial: {
    label: 'Testimonial',
    description: 'Warm, personal, soft edges. Best for trust-building and reviews.',
    font: 'Playfair Display',
    titleColor: '#fef3c7',
    titleBackground: '#7c2d12',
    accentColor: '#fbbf24',
    transition: { in: 'fade', out: 'fade' },
    musicUrl:
      'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/piano-moment.mp3',
    musicVolume: 0.16,
    voiceStyle: 'warm, personal, sincere',
  },
  'product-showcase': {
    label: 'Product Showcase',
    description: 'Premium, dark, elegant. Best for luxury, tech, and high-end services.',
    font: 'Montserrat',
    titleColor: '#fbbf24',
    titleBackground: '#000000',
    accentColor: '#fbbf24',
    transition: { in: 'zoom', out: 'zoom' },
    musicUrl:
      'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/cyberpunk.mp3',
    musicVolume: 0.25,
    voiceStyle: 'premium, confident, low register',
  },
};

export function getStyleTemplate(name) {
  return STYLE_TEMPLATES[name] || STYLE_TEMPLATES.documentary;
}

// ============================================================
// SCRIPT GENERATION
// ============================================================
export async function generateScript({
  topic,
  businessName = 'My Business',
  durationSeconds = 15,
  style = 'documentary',
}) {
  if (!openai) {
    throw new Error(
      'OPENAI_API_KEY is required for script generation. Add it to .env.'
    );
  }

  const duration = normaliseDuration(durationSeconds);
  const preset = DURATION_PRESETS[duration];
  const styleDef = getStyleTemplate(style);

  const prompt = `You are a viral short-video copywriter for Nigerian businesses.

Topic: ${topic}
Business: ${businessName}
Duration: ${duration} seconds
Style: ${styleDef.label} — ${styleDef.description}
Voice tone: ${styleDef.voiceStyle}

STRICT word budget: the "fullScript" field MUST be ${preset.words} words (±5).
At 2.8 words/second, that fills exactly ${duration} seconds.

Structure:
- Hook (first ${preset.hookSec}s): stop-scroll opener, pidgin English allowed
- Benefit (next ${preset.benefitSec}s): two concrete benefits, urgent
- CTA (final ${preset.ctaSec}s): one clear action

Return JSON only (no markdown, no code fences):
{
  "hook": "the hook line",
  "benefit": "two benefits in one or two sentences",
  "cta": "clear call to action",
  "fullScript": "hook + benefit + cta as ONE flowing voiceover, EXACTLY ${preset.words} words",
  "caption": "viral social caption with emojis and 5 hashtags including #Naija",
  "searchKeywords": ["2 short stock-footage keywords, e.g. shawarma, lagos street food"]
}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(res.choices[0].message.content);

  // Verify word count is within tolerance — if not, do one tight retry
  const wordCount = String(parsed.fullScript || '').split(/\s+/).filter(Boolean).length;
  const targetMin = preset.words - 8;
  const targetMax = preset.words + 8;

  if (wordCount < targetMin || wordCount > targetMax) {
    console.warn(
      `⚠️  Script word count ${wordCount} outside ${targetMin}–${targetMax}, retrying with stricter instruction`
    );
    const retry = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Rewrite this voiceover to be EXACTLY ${preset.words} words (no more, no less). Keep the meaning. Return ONLY the rewritten voiceover text, no JSON, no quotes.

Original (${wordCount} words):
${parsed.fullScript}`,
        },
      ],
      temperature: 0.5,
    });
    parsed.fullScript = retry.choices[0].message.content.trim();
  }

  return {
    ...parsed,
    durationSeconds: duration,
    style,
    source: 'openai',
  };
}

// ============================================================
// PEXELS — PORTRAIT STOCK CLIPS
// ============================================================
export async function fetchPexelsVideos(keywords, count = 3) {
  const PEXELS_KEY = process.env.PEXELS_API_KEY;
  if (!PEXELS_KEY) {
    throw new Error(
      'PEXELS_API_KEY is required. Sign up free at https://www.pexels.com/api/'
    );
  }

  const results = [];
  const perPage = Math.max(3, count);

  for (const keyword of keywords.slice(0, 3)) {
    if (results.length >= count) break;
    try {
      const res = await axios.get('https://api.pexels.com/videos/search', {
        params: {
          query: keyword,
          per_page: perPage,
          orientation: 'portrait',
        },
        headers: { Authorization: PEXELS_KEY },
        timeout: 12_000,
      });

      for (const video of res.data?.videos || []) {
        if (results.length >= count) break;
        const files = video.video_files || [];
        const file =
          files.find((f) => f.quality === 'hd' && f.width <= 800) ||
          files.find((f) => f.orientation === 'portrait') ||
          files[0];
        if (file?.link) {
          results.push({
            id: video.id,
            url: file.link,
            width: file.width,
            height: file.height,
          });
        }
      }
    } catch (e) {
      console.error(`⚠️  Pexels search failed for "${keyword}":`, e.message);
    }
  }

  if (results.length < count) {
    throw new Error(
      `Only found ${results.length}/${count} stock clips. Try different keywords or check your Pexels key.`
    );
  }
  return results;
}

// ============================================================
// ELEVENLABS — MANDATORY MP3 VOICEOVER
// ============================================================
export async function generateVoiceover(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY is required. Add it to .env (sign up at https://elevenlabs.io)'
    );
  }
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate voiceover from empty script');
  }

  const res = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(DEFAULT_VOICE_ID)}`,
    {
      text,
      model_id: 'eleven_turbo_v2_5', // faster + cheaper, still natural
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 30_000,
    }
  );

  return Buffer.from(res.data);
}

// ============================================================
// SHOTSTACK INGEST — UPLOAD MP3
// ============================================================
export async function uploadAudioToShotstack(buffer) {
  if (!SHOTSTACK_KEY) {
    throw new Error('SHOTSTACK_API_KEY is required to render videos');
  }

  const signRes = await axios.post(
    `${SHOTSTACK_INGEST_BASE}/upload`,
    {},
    {
      headers: { 'x-api-key': SHOTSTACK_KEY, Accept: 'application/json' },
      timeout: 15_000,
    }
  );

  const signedUrl = signRes.data?.data?.attributes?.url;
  if (!signedUrl) {
    throw new Error('Shotstack ingest did not return a signed URL');
  }

  await axios.put(signedUrl, buffer, {
    headers: { 'Content-Type': 'audio/mpeg' },
    maxBodyLength: Infinity,
    timeout: 60_000,
  });

  return signedUrl;
}

// ============================================================
// SHOTSTACK — BUILD EDIT JSON WITH STYLE
// ============================================================
export function buildEditJson({
  script,
  clips,
  businessName,
  style,
  voiceoverUrl,
}) {
  const tpl = getStyleTemplate(style);
  const duration = normaliseDuration(script.durationSeconds);
  const preset = DURATION_PRESETS[duration];

  // Distribute clips evenly across the duration
  const perClip = duration / clips.length;
  const videoClips = clips.map((clip, index) => ({
    asset: {
      type: 'video',
      src: clip.url,
      volume: 0,
    },
    start: index * perClip,
    length: perClip,
    fit: 'crop',
    transition: index === 0 ? undefined : tpl.transition,
  }));

  // Three title scenes: hook, benefit, CTA
  const titleClips = [
    {
      asset: {
        type: 'title',
        text: script.hook,
        style: 'bold',
        size: 'large',
        color: tpl.titleColor,
        background: tpl.titleBackground,
        font: { family: tpl.font },
      },
      start: 0,
      length: preset.hookSec,
      position: 'center',
      transition: { in: tpl.transition.in, out: tpl.transition.out },
    },
    {
      asset: {
        type: 'title',
        text: script.benefit,
        style: 'bold',
        size: 'medium',
        color: '#ffffff',
        background: 'rgba(0,0,0,0.6)',
        font: { family: tpl.font },
      },
      start: preset.hookSec,
      length: preset.benefitSec,
      position: 'center',
    },
    {
      asset: {
        type: 'title',
        text: `${script.cta} — ${businessName}`,
        style: 'bold',
        size: 'large',
        color: tpl.accentColor,
        background: 'rgba(0,0,0,0.7)',
        font: { family: tpl.font },
      },
      start: preset.hookSec + preset.benefitSec,
      length: preset.ctaSec,
      position: 'bottom',
    },
  ];

  return {
    timeline: {
      background: '#000000',
      tracks: [
        { clips: videoClips },
        { clips: titleClips },
        // Voiceover — full duration, full volume
        {
          clips: [
            {
              asset: { type: 'audio', src: voiceoverUrl, volume: 1 },
              start: 0,
              length: duration,
            },
          ],
        },
        // Background music — mixed low under voice
        {
          clips: [
            {
              asset: {
                type: 'audio',
                src: tpl.musicUrl,
                volume: tpl.musicVolume,
                effect: 'fadeInFadeOut',
              },
              start: 0,
              length: duration,
            },
          ],
        },
      ],
    },
    output: {
      format: 'mp4',
      size: { width: 1080, height: 1920 },
      fps: 30,
    },
  };
}

// ============================================================
// SHOTSTACK — SUBMIT + POLL
// ============================================================
export async function renderWithShotstack(editJson) {
  if (!SHOTSTACK_KEY) {
    throw new Error('SHOTSTACK_API_KEY is required to render videos');
  }

  const res = await axios.post(
    `${SHOTSTACK_EDIT_BASE}/render`,
    editJson,
    {
      headers: {
        'x-api-key': SHOTSTACK_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
    }
  );

  const renderId = res.data?.response?.id;
  if (!renderId) {
    throw new Error(
      'Shotstack did not return a render ID: ' + JSON.stringify(res.data)
    );
  }

  return {
    renderId,
    status: 'rendering',
    pollUrl: `/api/video-status/${renderId}`,
    environment: SHOTSTACK_ENV,
  };
}

export async function pollShotstackStatus(renderId) {
  if (!SHOTSTACK_KEY) return null;

  const res = await axios.get(
    `${SHOTSTACK_EDIT_BASE}/render/${encodeURIComponent(renderId)}`,
    {
      headers: { 'x-api-key': SHOTSTACK_KEY },
      timeout: 15_000,
    }
  );

  const r = res.data?.response || {};
  return {
    id: r.id,
    status: r.status,
    url: r.url || null,
    poster: r.poster || null,
    duration: r.duration || null,
    error: r.error || null,
    note:
      r.status === 'done'
        ? 'URL expires in 24 hours — download the MP4 if you need it longer.'
        : null,
  };
}

// ============================================================
// TOP-LEVEL ORCHESTRATOR
// ============================================================
export async function createVideo({
  topic,
  businessName = 'My Business',
  durationSeconds = 15,
  style = 'documentary',
}) {
  if (!topic) throw new Error('A topic is required');
  const duration = normaliseDuration(durationSeconds);
  const tpl = getStyleTemplate(style);
  const preset = DURATION_PRESETS[duration];

  // 1. Script (scaled by duration + style)
  const script = await generateScript({
    topic,
    businessName,
    durationSeconds: duration,
    style,
  });

  // 2. Clips — count depends on duration
  const clips = await fetchPexelsVideos(script.searchKeywords || [topic], preset.clips);

  // 3. Voiceover — mandatory, throws on failure
  const voiceoverBuffer = await generateVoiceover(script.fullScript);

  // 4. Upload voiceover to Shotstack
  const voiceoverUrl = await uploadAudioToShotstack(voiceoverBuffer);

  // 5. Build and submit render
  const editJson = buildEditJson({
    script,
    clips,
    businessName,
    style,
    voiceoverUrl,
  });

  const render = await renderWithShotstack(editJson);

  return {
    ok: true,
    status: 'rendering',
    durationSeconds: duration,
    style,
    styleLabel: tpl.label,
    script,
    clips,
    voiceoverUrl,
    renderId: render.renderId,
    pollUrl: render.pollUrl,
    environment: render.environment,
    message: `Rendering ${duration}s ${tpl.label} video. Poll ${render.pollUrl} until status is "done".`,
  };
}

export default {
  DURATION_PRESETS,
  STYLE_TEMPLATES,
  normaliseDuration,
  getStyleTemplate,
  generateScript,
  fetchPexelsVideos,
  generateVoiceover,
  uploadAudioToShotstack,
  buildEditJson,
  renderWithShotstack,
  pollShotstackStatus,
  createVideo,
};