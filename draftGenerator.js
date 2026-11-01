// ============================================================
// draftGenerator.js — AI-powered Q&A sales copy generator
// Produces answers that genuinely help AND drive traffic.
// Supports: Gemini, OpenAI, Ollama (self-hosted), template fallback
// ============================================================

function platformTone(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('reddit'))        return 'first-person experience, specific and concrete — Reddit distrusts vague promotion, so earn the pitch with real detail first';
  if (p.includes('quora'))         return 'informative and thorough, business links are expected and welcome';
  if (p.includes('nairaland'))     return 'warm, direct, respectful; professional Nigerian tone is fine';
  if (p.includes('stack'))         return 'technical and strictly factual; the business link appears ONLY once, at the very end, framed as "reference"';
  if (p.includes('lemmy'))         return 'casual, tech-savvy, allergic to marketing speak — lead with substance';
  if (p.includes('discourse'))     return 'professional, forum-appropriate, deliver value first';
  if (p.includes('mbin') || p.includes('kbin') || p.includes('piefed')) return 'casual and direct, community-first';
  return 'conversational, warm, specific';
}

function buildSystemPrompt(business, platform) {
  const biz   = business.name || 'our business';
  const cat   = business.category || 'this topic';
  const city  = business.city || business.state || business.country || '';
  const site  = business.website || business.url || '';
  const phone = business.phone || business.whatsapp || '';

  return `You are an experienced ${cat} professional who runs ${biz}${city ? ' in ' + city : ''}. Someone posted a question on ${platform} that your business can genuinely help with. Write a reply that SELLS without feeling like an ad.

STRUCTURE (3 short paragraphs, 100-200 words):
1. OPENER (2-3 sentences): Answer the question with real, specific substance — a number, a named method, a concrete scenario. This is what earns the right to pitch.
2. VALUE (2-3 sentences): Introduce ${biz} naturally as "the business I work with" or "our team at ${biz}" — ONE mention, mid-answer, not at the start. Then name one SPECIFIC thing your business does well that maps to their problem.
3. CLOSER (2-3 sentences): Make a clear, specific offer of what they'll find at ${site} (e.g. "we've laid out the exact 5-step process we use for X" or "there's a template that walks you through this"). Then end with a soft but unmistakable CTA to ${site}.${phone ? ' Optionally include ' + phone + ' for direct contact.' : ''}

HARD RULES:
- No emojis. No bullet points. No bold. No markdown headers.
- Banned words: "unlock", "revolutionize", "game-changer", "supercharge", "in today's fast-paced world", "dive into", "leverage".
- Never say "I hope this helps" or "good luck" — it kills the CTA.
- The website URL must appear literally in the text (plain URL, not markdown link, except on Quora).
- Platform tone: ${platformTone(platform)}

Return ONLY the answer text. No quotes, no intro, no explanation.`;
}

// ============================================================
// AI providers
// ============================================================
async function tryGemini({ question, business, blogUrl, platform }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const userMsg =
    `Question (${platform}): "${question.title}"\n` +
    (question.snippet ? `Context: ${question.snippet}\n` : '') +
    `Business: ${business.name}${business.description ? ' — ' + business.description : ''}\n` +
    `Website: ${blogUrl || business.website || ''}\n` +
    `Phone: ${business.phone || business.whatsapp || '(none)'}\n\n` +
    `Write the reply now.`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(business, platform) }] },
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 500 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');
  return text.trim();
}

async function tryOpenAI({ question, business, blogUrl, platform }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const userMsg =
    `Question (${platform}): "${question.title}"\n` +
    (question.snippet ? `Context: ${question.snippet}\n` : '') +
    `Business: ${business.name}${business.description ? ' — ' + business.description : ''}\n` +
    `Website: ${blogUrl || business.website || ''}\n` +
    `Phone: ${business.phone || business.whatsapp || '(none)'}\n\nWrite the reply now.`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(business, platform) },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.9,
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned no text');
  return text.trim();
}

async function tryOllama({ question, business, blogUrl, platform }) {
  const url = process.env.OLLAMA_URL;           // e.g. http://localhost:11434
  if (!url) return null;
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  const fullPrompt = buildSystemPrompt(business, platform) +
    `\n\nQuestion (${platform}): "${question.title}"` +
    (question.snippet ? `\nContext: ${question.snippet}` : '') +
    `\nBusiness: ${business.name}\nWebsite: ${blogUrl || business.website || ''}\n\nWrite the reply now.`;
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: fullPrompt, stream: false, options: { temperature: 0.9 } }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return (data.response || '').trim() || null;
}

// ============================================================
// Fallback templates — these ARE sales copy (not just help)
// ============================================================
function tryTemplate({ question, business, blogUrl }) {
  const site  = blogUrl || business.website || '';
  const biz   = business.name || 'our team';
  const cat   = business.category || 'this';
  const phone = business.phone ? ` (${business.phone})` : '';
  const city  = business.city || '';

  const variants = [
    // Variant 1 — problem/solution/framework
    `The honest answer is that most people skip the fundamentals and jump straight to tactics. In my experience with ${cat}, the biggest wins come from doing three things well: understanding what your audience actually needs, committing to one channel long enough to see results, and measuring weekly instead of guessing.\n\nWe run ${biz}${city ? ' in ' + city : ''}${phone}, and I've watched this pattern play out across hundreds of clients. The single biggest mistake is trying to fix everything at once — you end up fixing nothing. Pick the one bottleneck costing you the most and give it 30 days.\n\nI put the exact 3-step process we use into a walkthrough at ${site} — no email gate, just the guide. If you want the shortcut, it's there.`,

    // Variant 2 — direct answer + specific offer
    `${question.title.replace(/[?.]+$/, '')} — the short answer is that it depends on what you're optimising for, but 90% of people get it wrong for the same reason: they focus on the surface instead of the fundamentals.\n\nHere's what actually works. Audit what you have now. Identify the one weak link. Fix only that for the next month. Everything else is noise. At ${biz}${city ? ' (' + city + ')' : ''}, this is literally the first thing we do with every client, and it's what separates the ones who see results from the ones who don't.\n\nThe full playbook — the exact checklist, the order of operations, the metrics to watch — is at ${site}. It's the same framework we use internally.`,

    // Variant 3 — story/credibility/CTA
    `I've been on both sides of this question — first as someone trying to figure it out alone, then as someone who had to build a system that worked repeatably. The thing nobody tells you: the answer isn't a tactic, it's a sequence.\n\nAt ${biz}${phone}, we've built the sequence into something we can run in ~30 days for almost any ${cat} situation. Start with fundamentals audit → pick the highest-leverage change → commit for 30 days → measure weekly. That's it. Everything else is decoration.\n\nWe documented the exact process — including the checklist we use and the numbers we track — at ${site}. Take the framework, run it, and you'll see why it works.`,
  ];

  const idx = ((question.title || '').length + (business.id || 0)) % variants.length;
  return variants[idx];
}

// ============================================================
// Public API — flexible signature
// ============================================================
export async function generateDraft(arg1, arg2, arg3) {
  // Normalize inputs
  let ctx;
  if (arg1 && typeof arg1 === 'object' && (arg1.question || arg1.business)) {
    ctx = {
      question: arg1.question || {},
      business: arg1.business || {},
      blogUrl:  arg1.blogUrl || arg1.blog_url || (arg1.business && arg1.business.website) || '',
      platform: arg1.platform || (arg1.question && arg1.question.source) || 'generic',
    };
  } else if (arg1 && typeof arg1 === 'object' && arg1.title) {
    ctx = {
      question: arg1,
      business: arg2 || {},
      blogUrl:  arg3 || (arg2 && arg2.website) || '',
      platform: arg1.source || 'generic',
    };
  } else {
    ctx = {
      question: { title: String(arg1 || ''), snippet: '', source: 'generic' },
      business: { name: String(arg2 || ''), website: String(arg3 || ''), category: '', description: '', phone: '' },
      blogUrl:  String(arg3 || ''),
      platform: 'generic',
    };
  }

  // Try providers in order: Gemini → OpenAI → Ollama → template
  const providers = [tryGemini, tryOpenAI, tryOllama];
  for (const provider of providers) {
    try {
      const text = await provider(ctx);
      if (text && text.length > 60) {
        console.log(`✅ Draft via ${provider.name} (${text.split(/\s+/).length} words)`);
        return text;
      }
    } catch (e) {
      console.warn(`⚠️  ${provider.name} failed: ${e.message}`);
    }
  }

  console.log('ℹ️  Using template fallback');
  return tryTemplate(ctx);
}