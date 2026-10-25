// ============================================================
// GrowthBot — 2x/day social scheduler
// ============================================================
import cron from 'node-cron';
import { postForAccount } from './socialPoster.js';
import { pool } from './db.js';

const TIMEZONE = process.env.SOCIAL_TIMEZONE || 'Africa/Lagos';
const windowState = new Map();

async function runScheduledPosts(windowLabel) {
  const key = `${new Date().toISOString().slice(0, 10)}::${windowLabel}`;
  if (windowState.has(key)) {
    console.log(`⏭️  ${windowLabel} already posted today — skipping`);
    return { skipped: true, reason: 'already_posted' };
  }
  windowState.set(key, Date.now());

  const { rows: blogs } = await pool.query(
    `SELECT api_key FROM blogs WHERE plan = 'premium'`
  );

  const results = [];
  for (const { api_key: apiKey } of blogs) {
    for (const platform of ['facebook', 'linkedin']) {
      try {
        const result = await postForAccount({
          apiKey,
          platform,
          message: await buildMessage(apiKey, platform, windowLabel),
        });
        results.push({ apiKey, platform, ...result });
        console.log(
          `${result.ok ? '✅' : '❌'} ${platform} for ${apiKey}: ${
            result.ok ? result.postId || result.url : result.error
          }`
        );
      } catch (e) {
        results.push({ apiKey, platform, ok: false, error: e.message });
        console.error(`❌ ${platform} for ${apiKey}:`, e.message);
      }
    }
  }
  return { skipped: false, window: windowLabel, results };
}

async function buildMessage(apiKey, platform, windowLabel) {
  const { rows } = await pool.query(
    'SELECT url, email FROM blogs WHERE api_key = $1',
    [apiKey]
  );
  const blog = rows[0];
  const site = blog?.url || 'our blog';
  const morning = windowLabel === 'morning';
  const prefix = morning ? '🌅 Good morning!' : '🌆 Evening update:';
  return `${prefix}

Fresh content is live on ${site} — new guides, admission updates, and answers to the questions students are asking today.

👉 Read now: ${site}

#JAMB #WAEC #Admissions #Nigeria #SchoolNews`;
}

export function startScheduler() {
  if (process.env.DISABLE_SOCIAL_CRON === 'true') {
    console.log('⏸️  Social cron disabled (DISABLE_SOCIAL_CRON=true)');
    return [];
  }
  const jobs = [
    cron.schedule(
      '0 9 * * *',
      () => runScheduledPosts('morning').catch((e) => console.error('Morning cron error:', e)),
      { timezone: TIMEZONE }
    ),
    cron.schedule(
      '0 18 * * *',
      () => runScheduledPosts('evening').catch((e) => console.error('Evening cron error:', e)),
      { timezone: TIMEZONE }
    ),
  ];
  console.log(`⏰ Social cron scheduled (${TIMEZONE}): 09:00 + 18:00`);
  return jobs;
}

export async function runSocialNow(windowLabel = 'manual') {
  return runScheduledPosts(windowLabel);
}

export default { startScheduler, runSocialNow };