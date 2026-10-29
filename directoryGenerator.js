// directoryGenerator.js — v2.0
import { translate } from '@vitalets/google-translate-api';
import { chromium } from 'playwright';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// --- Translate listing to target language ---
export async function translateListing(text, targetLang) {
  try {
    const res = await translate(text, { to: targetLang });
    return res.text;
  } catch (e) {
    console.warn('Translation failed:', e.message);
    return text; // fallback to original
  }
}

// --- AI listing generator (returns structured fields) ---
async function generateStructuredListing(profile, directory, countryName) {
  if (!openai) return fallbackListing(profile);
  const prompt = `Create a business listing for ${directory.name}.
Business: ${profile.name}, ${profile.category || 'Business'}, ${profile.city}, ${countryName}
Phone: ${profile.phone}
Website: ${profile.website || 'N/A'}
Return JSON: {"headline":"60-char title","category":"best category","keywords":["3-5 keywords"],"post":"250-500 char full listing text"}`;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    return fallbackListing(profile);
  }
}

function fallbackListing(profile) {
  return {
    headline: `${profile.name} — ${profile.category || 'Business'} in ${profile.city || ''}`.slice(0, 60),
    category: profile.category || 'Business',
    keywords: [profile.category, profile.city, profile.state].filter(Boolean),
    post: `${profile.name} is your trusted ${(profile.category || 'business').toLowerCase()} in ${profile.city || ''}. Call ${profile.phone || 'us'} to learn more. ${profile.website ? 'Visit ' + profile.website : ''}`,
  };
}

// --- Playwright form filler for sites without registration ---
export async function autoFillListing(directoryUrl, listing) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(directoryUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Try common field selectors
    const titleField = page.locator('input[name*="title" i], input[name*="headline" i], input[placeholder*="title" i]').first();
    if (await titleField.count()) await titleField.fill(listing.headline);

    const descField = page.locator('textarea[name*="description" i], textarea[name*="post" i], textarea[placeholder*="description" i]').first();
    if (await descField.count()) await descField.fill(listing.post);

    const phoneField = page.locator('input[name*="phone" i], input[type="tel"]').first();
    if (await phoneField.count()) await phoneField.fill(listing.phone || '');

    return { filled: true, message: 'Fields filled — click Submit to complete.' };
  } catch (e) {
    return { filled: false, error: e.message };
  } finally {
    await browser.close();
  }
}