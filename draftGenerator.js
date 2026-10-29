// ============================================================
// GrowthBot — AI Draft Generator (Super Brain v2.0)
// ============================================================
// Produces genuinely helpful, conversion-tuned Q&A answers that
// never look like spam. Answers first, link second. Always.
//
// Strategy:
//   1. Empathy hook → 2. Direct answer → 3. 2-3 specific insights
//   → 4. Optional social proof → 5. Soft transition → 6. Link → 7. Source
//
// Platform playbooks:
//   • Reddit   → pure value, no marketing voice, link buried at end
//   • Quora    → narrative, expert tone, credibility-building opener
//   • Nairaland→ direct Nigerian English, no fluff
//   • Generic  → helpful peer, structured
//
// Generates 2 internal variants, scores them, returns the better one.
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

// Model selection — upgrade quality with env var
const AI_MODEL =
  process.env.AI_DRAFT_MODEL ||
  (process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY ? 'deepseek-chat' : 'gpt-4o');

// ============================================================
// SPAM PHRASES — reject if these slip in
// ============================================================
const SPAM_PHRASES = [
  'click here', 'click now', 'buy now', '100% sure', 'guaranteed',
  'limited time', 'act fast', "don't miss", 'free money', 'make money fast',
  'lowest price', 'best price ever', 'unbelievable', 'shocking',
  'in today\'s fast-paced', 'in this article', "let's dive in",
  'game-changer', 'revolutionary', 'cutting-edge', 'state-of-the-art',
];

// ============================================================
// PLATFORM PLAYBOOKS — the strategy each platform rewards
// ============================================================
const PLATFORM_PLAYBOOKS = {
  reddit: {
    tone: 'Casual, peer-to-peer. You are NOT a business — you are a helpful person who happens to know this topic. No marketing language. No "we" — use "I" or passive voice. Reddit users downvote anything that smells like promotion.',
    structure: 'Open with empathy about the frustration. Answer the question directly in 2-3 sentences with real substance. Then give 2 concrete tips they can act on today. Only THEN, at the very end, casually mention the guide — as if you just remembered it exists.',
    linkStyle: 'Edit-style addendum: "Edit: for anyone who wants the full breakdown, I put it here: {URL}"',
    wordCount: 110,
    maxWords: 150,
  },
  quora: {
    tone: 'Thoughtful expert. Quora rewards long-form, substantive answers. Use "I" and personal experience framing. Share a real lesson or observation, not a sales pitch.',
    structure: 'Open with a personal observation that reframes the question. Give the direct answer with 2-3 numbered points. Add one specific example or number. Then transition naturally: "I broke down the whole approach in more detail here..."',
    linkStyle: '"I broke down the full approach here: {URL}"',
    wordCount: 160,
    maxWords: 200,
  },
  nairaland: {
    tone: 'Direct Nigerian English. Plain, no-nonsense, no flowery language. Nairaland users respect clarity over cleverness. Use "you" — talk directly.',
    structure: 'Answer the question head-on in the first sentence. Give 2-3 specific things to check or do. If price matters, name a range. End with the guide link clearly labeled.',
    linkStyle: '"Full guide here: {URL}"',
    wordCount: 130,
    maxWords: 170,
  },
  generic: {
    tone: 'Helpful peer with real expertise. Professional but warm. No hype, no overselling. Assume the reader is smart and busy.',
    structure: 'Acknowledge the question in 1 sentence. Answer directly with 2-3 specific insights. Add one concrete example. Then link to the full guide.',
    linkStyle: '"For the full step-by-step, see: {URL}"',
    wordCount: 130,
    maxWords: 170,
  },
};

function detectPlatform(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('reddit.com')) return 'reddit';
  if (lower.includes('quora.com')) return 'quora';
  if (lower.includes('nairaland.com')) return 'nairaland';
  return 'generic';
}

// ============================================================
// PROMPT BUILDER — the "brain"
// ============================================================
function buildPrompt({ questionTitle, questionUrl, blogTitle, blogUrl, platform, businessName, businessCategory, playbook }) {
  const linkStyle = playbook.linkStyle.replace('{URL}', blogUrl);
  const context = businessName
    ? `You can reference this casually ONCE (only if natural): you run ${businessName}${businessCategory ? `, a ${businessCategory}` : ''}. Do NOT pitch it.`
    : 'Do not claim to own any business.';

  return `You are a senior copywriter who has personally written on ${platform} for 5+ years. You know that this platform has ONE rule: value first, promotion never. Your answer must be so useful that it stands alone even if the link is stripped.

QUESTION: "${questionTitle}"
PLATFORM: ${platform}
${context}

You have a full guide on this topic: "${blogTitle}"
Guide URL: ${blogUrl}

YOUR PLAYBOOK:
Tone: ${playbook.tone}
Structure: ${playbook.structure}
Link format: ${linkStyle}
Target length: ${playbook.wordCount} words (max ${playbook.maxWords})

MANDATORY RULES:
1. Answer the actual question with REAL substance in the first 2-3 sentences. Not a teaser. Not "it depends". Real, specific, actionable.
2. Give 2-3 concrete tips, numbers, or steps the reader can use TODAY.
3. Do NOT open with "Great question" or "In today's world" or "Let's dive in" or any cliché.
4. Do NOT use emojis, exclamation marks, ALL CAPS, or markdown headers.
5. Do NOT use: ${SPAM_PHRASES.join(', ')}.
6. Do NOT overpromise ("best", "guaranteed", "fastest", "100%").
7. Do NOT write in first person as the author of the guide — write as a helpful reader.
8. Do NOT put the link anywhere except the very last 2 lines.
9. End with exactly this structure on two lines:
   [last helpful sentence]
   ${linkStyle}
   Source: ${blogTitle}
10. Plain text only. No quotes around the answer. No labels.

Return the answer as plain text. Start immediately — no preamble.`;
}

// ============================================================
// QUALITY SCORER — picks the better of two variants
// ============================================================
function scoreDraft(draft, { blogUrl, platform, maxWords }) {
  const lower = draft.toLowerCase();
  const words = draft.split(/\s+/).filter(Boolean).length;
  const score = { total: 100, issues: [] };

  // Spam check
  const spamHits = SPAM_PHRASES.filter((p) => lower.includes(p));
  if (spamHits.length) {
    score.total -= 40 * spamHits.length;
    score.issues.push(`spam: ${spamHits.join(', ')}`);
  }

  // Word count
  if (words > maxWords + 15) {
    score.total -= 20;
    score.issues.push(`too long (${words} > ${maxWords})`);
  } else if (words < 60) {
    score.total -= 15;
    score.issues.push(`too short (${words})`);
  }

  // Link must be near the end
  const linkIdx = draft.indexOf(blogUrl);
  if (linkIdx === -1) {
    score.total -= 30;
    score.issues.push('link missing');
  } else {
    const tailLen = draft.length - linkIdx;
    if (tailLen > 400) {
      score.total -= 15;
      score.issues.push('link too early');
    }
  }

  // Cliché check
  const cliches = ['great question', "in today's", "let's dive", "hope this helps"];
  const clicheHits = cliches.filter((c) => lower.includes(c));
  if (clicheHits.length) {
    score.total -= 10 * clicheHits.length;
    score.issues.push(`cliches: ${clicheHits.join(', ')}`);
  }

  // Emojis / caps
  if (/[\u{1F300}-\u{1FAFF}]/u.test(draft)) {
    score.total -= 20;
    score.issues.push('emojis');
  }
  if (/\b[A-Z]{5,}\b/.test(draft)) {
    score.total -= 10;
    score.issues.push('ALL CAPS');
  }

  // Reddit-specific: link in first 100 chars is a downvote magnet
  if (platform === 'reddit' && linkIdx !== -1 && linkIdx < 100) {
    score.total -= 25;
    score.issues.push('reddit: link too early');
  }

  return score;
}

// ============================================================
// SINGLE AI CALL
// ============================================================
async function callAI(prompt, temp) {
  const res = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a senior forum copywriter with 10 years of experience writing high-value answers on Reddit, Quora, and Nigerian forums. You never sound like a marketer. You answer with real substance. You never use clichés, emojis, or hype. You follow every instruction exactly.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: temp,
  });
  return (res.choices[0].message.content || '').trim();
}

// ============================================================
// MAIN — generateDraft
// ============================================================
export async function generateDraft({
  questionTitle,
  questionUrl,
  blogTitle,
  blogUrl,
  businessName = '',
  businessCategory = '',
}) {
  if (!openai) {
    throw new Error('No AI API key configured (OPENAI_API_KEY or DEEPSEEK_API_KEY)');
  }
  if (!questionTitle || !blogUrl) {
    throw new Error('questionTitle and blogUrl are required');
  }

  const platform = detectPlatform(questionUrl);
  const playbook = PLATFORM_PLAYBOOKS[platform];
  const prompt = buildPrompt({
    questionTitle,
    questionUrl,
    blogTitle: blogTitle || 'Full guide',
    blogUrl,
    platform,
    businessName,
    businessCategory,
    playbook,
  });

  // Generate 2 variants in parallel for A/B
  let variants = [];
  try {
    const [v1, v2] = await Promise.all([
      callAI(prompt, 0.65),
      callAI(prompt, 0.85),
    ]);
    variants = [v1, v2].filter(Boolean);
  } catch (e) {
    throw new Error('AI generation failed: ' + e.message);
  }

  if (variants.length === 0) {
    throw new Error('AI returned no usable output');
  }

  // Score and pick the better one
  const scored = variants.map((draft) => ({
    draft,
    score: scoreDraft(draft, { blogUrl, platform, maxWords: playbook.maxWords }),
  }));
  scored.sort((a, b) => b.score.total - a.score.total);
  const winner = scored[0];

  // If the best is still spam / broken, reject
  if (winner.score.total < 60) {
    return {
      ok: false,
      platform,
      reason: `Draft rejected: ${winner.score.issues.join('; ')}`,
      draft: winner.draft,
      variants: scored.map((s) => ({ draft: s.draft, score: s.score.total })),
    };
  }

  const wordCount = winner.draft.split(/\s+/).filter(Boolean).length;
  return {
    ok: true,
    platform,
    draft: winner.draft,
    wordCount,
    containsLink: winner.draft.includes(blogUrl),
    quality: winner.score.total,
    issues: winner.score.issues,
    // Bonus: alternative so the UI can show "Try another version"
    variants: scored.map((s) => ({ draft: s.draft, score: s.score.total })),
    reviewedAt: new Date().toISOString(),
  };
}

export default { generateDraft, detectPlatform };