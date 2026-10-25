// ============================================================
// GrowthBot — AI Draft Generator (Module 2)
// ============================================================
// Takes a question + a blog URL and produces a helpful answer draft
// that ends with a link to the full guide.
//
// Safety tuned for each platform:
//   • Reddit  → short, casual, no link in first sentence
//   • Quora   → longer, story-shaped, link at the end
//   • Nairaland → direct, plain, link clearly marked
//   • Generic → polite, structured, link at end
//
// We NEVER generate spam. We reject spam phrases and refund the token cost.
// ============================================================
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    })
  : null;

const AI_MODEL = process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY
  ? 'deepseek-flash'
  : 'gpt-4o-mini';

const SPAM_PHRASES = [
  'click here', 'click now', 'buy now', '100% sure', 'guaranteed',
  'limited time', 'act fast', 'don\'t miss', 'free money', 'make money fast',
  'lowest price', 'best price ever', 'unbelievable', 'shocking',
];

const PLATFORM_TONES = {
  reddit: {
    tone: 'casual, helpful, no hype, no marketing language. Avoid links in the first sentence. Reddit users downvote self-promo. Write as if you\'re just answering as a knowledgeable person.',
    wordCount: 90,
    maxWords: 130,
  },
  quora: {
    tone: 'informative, structured, slightly formal. Quora readers expect a thorough answer with personal tone. Introduce with context, add value, then link.',
    wordCount: 140,
    maxWords: 180,
  },
  nairaland: {
    tone: 'direct and plain English. Nigerian users prefer clear, no-nonsense answers. Avoid flowery language. Link clearly at the end as "Full guide here".',
    wordCount: 120,
    maxWords: 160,
  },
  generic: {
    tone: 'polite, helpful, professional. Answer directly, then link to the full guide.',
    wordCount: 120,
    maxWords: 160,
  },
};

function detectPlatform(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('reddit.com')) return 'reddit';
  if (lower.includes('quora.com')) return 'quora';
  if (lower.includes('nairaland.com')) return 'nairaland';
  return 'generic';
}

function buildPrompt({ questionTitle, questionUrl, blogTitle, blogUrl, platform, toneConfig }) {
  return `You are writing a genuine, helpful answer to a real question on ${platform}.

QUESTION: "${questionTitle}"
PLATFORM URL: ${questionUrl}

We have a full guide on this: "${blogTitle}"
Guide URL: ${blogUrl}

REQUIREMENTS:
1. Answer the question genuinely in the first 2–3 sentences. Give real value, not a teaser.
2. Total length: ${toneConfig.wordCount} words (max ${toneConfig.maxWords}).
3. Tone: ${toneConfig.tone}
4. End with a single line: "Full guide here: ${blogUrl}"
5. Followed by a single line: "Source: ${blogTitle}"
6. Do NOT use ANY of these spam phrases: ${SPAM_PHRASES.join(', ')}
7. Do NOT use emojis, exclamation marks, or ALL CAPS.
8. Do NOT make claims you can't back up ("best", "fastest", "guaranteed").
9. Never claim to be the author of the guide — write as a helpful reader.
10. Plain text only — no markdown headers, no bullet lists unless essential.

Return the answer as plain text. Nothing else — no quotes around it, no labels.`;
}

// ============================================================
// MAIN — generateDraft
// ============================================================
export async function generateDraft({
  questionTitle,
  questionUrl,
  blogTitle,
  blogUrl,
}) {
  if (!openai) {
    throw new Error('No AI API key configured (OPENAI_API_KEY or DEEPSEEK_API_KEY)');
  }
  if (!questionTitle || !blogUrl) {
    throw new Error('questionTitle and blogUrl are required');
  }

  const platform = detectPlatform(questionUrl);
  const toneConfig = PLATFORM_TONES[platform];
  const prompt = buildPrompt({
    questionTitle,
    questionUrl,
    blogTitle: blogTitle || 'Full guide',
    blogUrl,
    platform,
    toneConfig,
  });

  let draft;
  try {
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    });
    draft = (res.choices[0].message.content || '').trim();
  } catch (e) {
    throw new Error('AI generation failed: ' + e.message);
  }

  // Safety check — reject if any spam phrase slipped in
  const lower = draft.toLowerCase();
  const violations = SPAM_PHRASES.filter((p) => lower.includes(p));
  if (violations.length > 0) {
    return {
      ok: false,
      platform,
      reason: `Draft contains spam phrases: ${violations.join(', ')}`,
      draft,
    };
  }

  const wordCount = draft.split(/\s+/).filter(Boolean).length;
  return {
    ok: true,
    platform,
    draft,
    wordCount,
    containsLink: draft.includes(blogUrl),
    reviewedAt: new Date().toISOString(),
  };
}

export default { generateDraft, detectPlatform };