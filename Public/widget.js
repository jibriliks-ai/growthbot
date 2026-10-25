/*!
 * GrowthBot Widget v3.1
 * Embeddable freemium widget for Blogger / WordPress / any site
 * Usage: <script src="https://YOUR-APP/widget.js" data-key="YOUR_KEY"></script>
 */
(function () {
  'use strict';

  // ============================================================
  // GUARDS
  // ============================================================
  if (window.__growthbotLoaded) return;
  window.__growthbotLoaded = true;

  const script =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"][data-key]') ||
    document.querySelector('script[src*="widget.js"]');

  if (!script) {
    console.warn('[GrowthBot] Could not find widget script tag');
    return;
  }

  const API_KEY = script.getAttribute('data-key') || '';
  const POSITION = script.getAttribute('data-position') || 'bottom-right';
  const SRC = script.src || '';
  const BACKEND = SRC.substring(0, SRC.lastIndexOf('/')) || window.location.origin;
  const PAGE_URL = window.location.href;
  const DEMO_MODE = !API_KEY;

  // ============================================================
  // SHADOW HOST
  // ============================================================
  if (document.getElementById('growthbot-host')) return;
  const host = document.createElement('div');
  host.id = 'growthbot-host';
  host.setAttribute('data-position', POSITION);
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ============================================================
  // STYLES
  // ============================================================
  const styles = document.createElement('style');
  styles.textContent = `
    :host {
      all: initial;
      position: fixed;
      z-index: 2147483647;
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      --gb-bg: #0f0f12;
      --gb-surface: #18181b;
      --gb-surface-2: #27272a;
      --gb-border: #27272a;
      --gb-border-strong: #3f3f46;
      --gb-text: #e5e7eb;
      --gb-muted: #a1a1aa;
      --gb-dim: #71717a;
      --gb-accent: #7c3aed;
      --gb-accent-2: #4f46e5;
      --gb-accent-light: #a78bfa;
      --gb-success: #4ade80;
      --gb-error: #f87171;
      --gb-warning: #facc15;
    }
    :host([data-position="bottom-right"]) { bottom: 20px; right: 20px; }
    :host([data-position="bottom-left"])  { bottom: 20px; left: 20px;  }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .gb-btn-float {
      width: 60px; height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--gb-accent), var(--gb-accent-2));
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(124,58,237,0.4), 0 2px 8px rgba(0,0,0,0.3);
      font-size: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      position: relative;
    }
    .gb-btn-float:hover { transform: scale(1.05); box-shadow: 0 12px 32px rgba(124,58,237,0.5); }
    .gb-btn-float:active { transform: scale(0.96); }
    .gb-btn-float::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 2px solid rgba(167,139,250,0.3);
      animation: gb-pulse 2.5s infinite;
      pointer-events: none;
    }
    @keyframes gb-pulse {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.15); opacity: 0; }
    }

    .gb-panel {
      position: absolute;
      bottom: 76px;
      right: 0;
      width: 400px;
      max-width: calc(100vw - 32px);
      height: 600px;
      max-height: calc(100vh - 100px);
      background: var(--gb-bg);
      color: var(--gb-text);
      border-radius: 16px;
      border: 1px solid var(--gb-border);
      box-shadow: 0 20px 60px rgba(0,0,0,0.55);
      display: none;
      flex-direction: column;
      overflow: hidden;
      animation: gb-slide-in 0.2s ease-out;
    }
    :host([data-position="bottom-left"]) .gb-panel {
      right: auto;
      left: 0;
    }
    .gb-panel.open { display: flex; }
    @keyframes gb-slide-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .gb-header {
      padding: 16px 18px;
      background: var(--gb-surface);
      border-bottom: 1px solid var(--gb-border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-shrink: 0;
    }
    .gb-brand { font-weight: 800; font-size: 15px; color: var(--gb-text); letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
    .gb-brand-mark { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, var(--gb-accent), var(--gb-accent-2)); display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .gb-tagline { font-size: 11px; color: var(--gb-muted); margin-top: 2px; }
    .gb-close {
      background: transparent;
      border: none;
      color: var(--gb-muted);
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 6px;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .gb-close:hover { color: var(--gb-text); background: var(--gb-surface-2); }

    .gb-banner {
      padding: 10px 18px;
      background: rgba(124,58,237,0.08);
      border-bottom: 1px solid var(--gb-border);
      font-size: 12px;
      color: var(--gb-muted);
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .gb-banner.warn { background: rgba(250,204,21,0.08); color: var(--gb-warning); }
    .gb-banner.error { background: rgba(248,113,113,0.08); color: var(--gb-error); }

    .gb-tabs {
      display: flex;
      gap: 4px;
      padding: 10px 12px 0;
      background: var(--gb-surface);
      border-bottom: 1px solid var(--gb-border);
      flex-shrink: 0;
    }
    .gb-tab {
      flex: 1;
      padding: 9px 8px;
      border: none;
      border-radius: 8px 8px 0 0;
      background: transparent;
      color: var(--gb-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .gb-tab:hover:not(.active) { color: var(--gb-text); background: var(--gb-surface-2); }
    .gb-tab.active { background: var(--gb-bg); color: var(--gb-text); }
    .gb-tab.locked::after { content: ' 🔒'; font-size: 10px; }

    .gb-body {
      flex: 1;
      overflow-y: auto;
      padding: 18px;
    }
    .gb-body::-webkit-scrollbar { width: 6px; }
    .gb-body::-webkit-scrollbar-thumb { background: var(--gb-surface-2); border-radius: 3px; }
    .gb-body::-webkit-scrollbar-track { background: transparent; }

    .gb-label { display: block; font-size: 12px; font-weight: 600; color: var(--gb-muted); margin: 12px 0 6px; }
    .gb-label:first-child { margin-top: 0; }
    .gb-input, .gb-select, .gb-textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: 9px;
      border: 1px solid var(--gb-border-strong);
      background: var(--gb-surface);
      color: var(--gb-text);
      font-family: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .gb-input:focus, .gb-select:focus, .gb-textarea:focus { border-color: var(--gb-accent); }
    .gb-textarea { resize: vertical; min-height: 60px; font-family: inherit; }
    .gb-select option { background: var(--gb-surface); color: var(--gb-text); }

    .gb-btn {
      width: 100%;
      padding: 11px 16px;
      border-radius: 10px;
      border: none;
      background: var(--gb-accent);
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease;
      margin-top: 12px;
    }
    .gb-btn:hover:not(:disabled) { background: #6d28d9; }
    .gb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .gb-btn.secondary { background: var(--gb-surface-2); color: var(--gb-text); }
    .gb-btn.secondary:hover:not(:disabled) { background: var(--gb-border-strong); }
    .gb-btn.small { padding: 8px 12px; font-size: 12px; width: auto; margin-top: 8px; }

    .gb-score-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 20px 0;
      margin-bottom: 12px;
      background: var(--gb-surface);
      border-radius: 12px;
      border: 1px solid var(--gb-border);
    }
    .gb-score-block { text-align: center; }
    .gb-score-num {
      font-size: 44px;
      font-weight: 800;
      line-height: 1;
      background: linear-gradient(135deg, var(--gb-accent-light), #60a5fa);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .gb-score-num.good { background: linear-gradient(135deg, #4ade80, #22c55e); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .gb-score-label { font-size: 11px; color: var(--gb-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .gb-score-arrow { color: var(--gb-accent-light); font-size: 24px; }

    .gb-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gb-muted); margin: 16px 0 8px; }

    .gb-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .gb-list-item {
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      background: var(--gb-surface);
      border-left: 3px solid var(--gb-border-strong);
      color: #d4d4d8;
      line-height: 1.5;
    }
    .gb-list-item.error { border-left-color: var(--gb-error); }
    .gb-list-item.warning { border-left-color: var(--gb-warning); }
    .gb-list-item.success { border-left-color: var(--gb-success); color: var(--gb-success); }

    .gb-script-box {
      background: var(--gb-surface);
      border: 1px solid var(--gb-border);
      border-radius: 10px;
      padding: 14px;
      font-size: 12.5px;
      line-height: 1.6;
      color: #d4d4d8;
      margin-bottom: 12px;
    }
    .gb-script-box strong { color: var(--gb-text); display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .gb-script-box + .gb-script-box { margin-top: 8px; }

    .gb-package {
      background: var(--gb-surface);
      border: 1px solid var(--gb-border);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .gb-package-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .gb-package-platform { font-weight: 700; font-size: 13px; color: var(--gb-text); }
    .gb-package-title { font-size: 12px; color: var(--gb-accent-light); margin-bottom: 6px; word-break: break-word; }
    .gb-package-desc { font-size: 12px; color: #a1a1aa; line-height: 1.5; max-height: 100px; overflow-y: auto; }

    .gb-subtabs {
      display: flex;
      gap: 4px;
      margin-bottom: 14px;
      background: var(--gb-surface);
      padding: 4px;
      border-radius: 10px;
    }
    .gb-subtab {
      flex: 1;
      padding: 8px;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: var(--gb-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .gb-subtab.active { background: var(--gb-accent); color: #fff; }

    .gb-status {
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12px;
      margin-top: 10px;
      line-height: 1.5;
    }
    .gb-status.info { background: rgba(124,58,237,0.12); color: var(--gb-accent-light); }
    .gb-status.success { background: rgba(74,222,128,0.1); color: var(--gb-success); }
    .gb-status.error { background: rgba(248,113,113,0.1); color: var(--gb-error); }
    .gb-status.warning { background: rgba(250,204,21,0.1); color: var(--gb-warning); }

    .gb-loading {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: gb-spin 0.6s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes gb-spin { to { transform: rotate(360deg); } }

    .gb-video-preview {
      width: 100%;
      aspect-ratio: 9 / 16;
      max-height: 240px;
      border-radius: 10px;
      background: #000;
      border: 1px solid var(--gb-border);
      margin-top: 12px;
      overflow: hidden;
      position: relative;
    }
    .gb-video-preview video { width: 100%; height: 100%; object-fit: contain; }

    .gb-link-box {
      background: var(--gb-surface);
      border: 1px solid var(--gb-border-strong);
      border-radius: 8px;
      padding: 10px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 11px;
      color: var(--gb-accent-light);
      word-break: break-all;
      margin: 8px 0;
    }

    .gb-footer {
      padding: 8px 18px;
      border-top: 1px solid var(--gb-border);
      font-size: 11px;
      color: var(--gb-dim);
      text-align: center;
      background: var(--gb-surface);
      flex-shrink: 0;
    }
    .gb-footer a { color: var(--gb-muted); text-decoration: none; }
    .gb-footer a:hover { color: var(--gb-text); }

    .gb-toast {
      position: fixed;
      bottom: 90px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--gb-success);
      color: #052e16;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      z-index: 1;
      animation: gb-toast-in 0.2s ease-out;
      pointer-events: none;
    }
    @keyframes gb-toast-in {
      from { opacity: 0; transform: translate(-50%, 8px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }

    .gb-hidden { display: none !important; }

    @media (max-width: 480px) {
      .gb-panel { height: calc(100vh - 90px); }
      .gb-tab { font-size: 11px; padding: 8px 4px; }
    }
  `;
  shadow.appendChild(styles);

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    open: false,
    plan: 'free',
    usage: {},
    limits: { freeAudits: 3, premiumVideos: 30, backlinks: 10 },
    tab: 'seo',
    subTab: 'indexnow', // backlink subtab
    pollTimer: null,
    loading: false,
    backendReachable: true,
  };

  // ============================================================
  // DOM SHELL
  // ============================================================
  const btn = document.createElement('button');
  btn.className = 'gb-btn-float';
  btn.setAttribute('aria-label', 'Open GrowthBot');
  btn.innerHTML = '✨';

  const panel = document.createElement('div');
  panel.className = 'gb-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'GrowthBot assistant');

  shadow.appendChild(btn);
  shadow.appendChild(panel);

  // ============================================================
  // HELPERS
  // ============================================================
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'gb-toast';
    el.textContent = message;
    shadow.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  async function copy(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMessage || 'Copied!');
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      shadow.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(successMessage || 'Copied!'); }
      catch { toast('Copy failed'); }
      finally { ta.remove(); }
    }
  }

  async function api(path, opts) {
    const url = BACKEND + path;
    const options = Object.assign({ method: 'GET' }, opts || {});
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
      options.headers = Object.assign(
        { 'Content-Type': 'application/json' },
        options.headers || {}
      );
    }
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ============================================================
  // PLAN FETCH
  // ============================================================
  async function loadPlan() {
    if (DEMO_MODE) {
      state.backendReachable = false;
      return;
    }
    try {
      const data = await api(
        '/api/check-plan?key=' + encodeURIComponent(API_KEY) +
        '&url=' + encodeURIComponent(PAGE_URL)
      );
      state.plan = data.plan || 'free';
      state.usage = data.usage || {};
      state.limits = data.limits || state.limits;
      state.backendReachable = true;
    } catch (e) {
      console.warn('[GrowthBot] Plan fetch failed:', e.message);
      state.backendReachable = false;
    }
  }

  // ============================================================
  // RENDER: SHELL
  // ============================================================
  function renderShell() {
    const auditsUsed = state.usage.auditsToday || 0;
    const auditsLimit = state.limits.freeAudits || 3;
    const isFree = state.plan === 'free';

    const bannerText = DEMO_MODE
      ? 'Demo mode — add <code>data-key</code> to activate'
      : !state.backendReachable
        ? 'Backend unreachable — check connection'
        : isFree
          ? `Free plan — ${auditsUsed}/${auditsLimit} audits today`
          : `Premium · ${state.usage.videosMonth || 0}/${state.limits.premiumVideos || 30} videos this month`;

    const bannerClass = DEMO_MODE || !state.backendReachable ? 'warn' : '';

    panel.innerHTML = `
      <div class="gb-header">
        <div>
          <div class="gb-brand">
            <span class="gb-brand-mark">✨</span>
            GrowthBot
          </div>
          <div class="gb-tagline">SEO · Video · Backlinks</div>
        </div>
        <button class="gb-close" aria-label="Close" type="button">×</button>
      </div>
      <div class="gb-banner ${bannerClass}">
        <span>${bannerText}</span>
      </div>
      <div class="gb-tabs" role="tablist">
        <button class="gb-tab ${state.tab === 'seo' ? 'active' : ''}" data-tab="seo" role="tab">SEO Audit</button>
        <button class="gb-tab ${state.tab === 'video' ? 'active' : ''} ${isFree ? 'locked' : ''}" data-tab="video" role="tab">Video</button>
        <button class="gb-tab ${state.tab === 'backlink' ? 'active' : ''} ${isFree ? 'locked' : ''}" data-tab="backlink" role="tab">Backlink</button>
      </div>
      <div class="gb-body" id="gb-body"></div>
      ${isFree ? `<div class="gb-footer">Powered by <a href="${BACKEND}/dashboard.html" target="_blank" rel="noopener">GrowthBot</a></div>` : ''}
    `;

    attachShellEvents();
    renderBody();
  }

  function attachShellEvents() {
    panel.querySelector('.gb-close').addEventListener('click', closePanel);

    panel.querySelectorAll('.gb-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        if (target === state.tab) return;
        if ((target === 'video' || target === 'backlink') && state.plan === 'free') {
          renderUpgradePrompt(target);
          return;
        }
        stopPolling();
        state.tab = target;
        panel.querySelectorAll('.gb-tab').forEach((t) => {
          t.classList.toggle('active', t === tab);
        });
        renderBody();
      });
    });
  }

  // ============================================================
  // RENDER: BODY DISPATCH
  // ============================================================
  function renderBody() {
    const body = panel.querySelector('#gb-body');
    if (!body) return;

    if (state.tab === 'seo') renderSeoTab(body);
    else if (state.tab === 'video') renderVideoTab(body);
    else if (state.tab === 'backlink') renderBacklinkTab(body);
  }

  // ============================================================
  // SEO TAB
  // ============================================================
  function renderSeoTab(body) {
    body.innerHTML = `
      <label class="gb-label">Page to audit</label>
      <input id="gb-seo-url" class="gb-input" type="url" value="${escapeHtml(PAGE_URL)}" placeholder="https://..." />
      <label class="gb-label">Target keyword (optional)</label>
      <input id="gb-seo-kw" class="gb-input" type="text" placeholder="e.g. jamb caps 2026" />
      <button id="gb-seo-go" class="gb-btn" type="button">Audit &amp; Auto-fix</button>
      <div id="gb-seo-result" aria-live="polite"></div>
    `;

    body.querySelector('#gb-seo-go').addEventListener('click', async function () {
      const btn = this;
      const url = body.querySelector('#gb-seo-url').value.trim();
      const keyword = body.querySelector('#gb-seo-kw').value.trim();
      const result = body.querySelector('#gb-seo-result');

      if (!url) return;
      if (DEMO_MODE) {
        result.innerHTML = '<div class="gb-status warn">Add a <code>data-key</code> to run real audits. <a href="' + BACKEND + '/pay.html" target="_blank" style="color:inherit;text-decoration:underline">Get a key</a></div>';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Auditing…';
      result.innerHTML = '<div class="gb-status info">Fetching page, checking SEO, generating fixes… (15–30s)</div>';

      try {
        const data = await api('/api/audit', {
          method: 'POST',
          body: { url, keyword, key: API_KEY, autoFix: true },
        });
        renderAuditResult(result, data);
      } catch (e) {
        if (e.status === 403 && e.data && e.data.error === 'FREE_LIMIT') {
          result.innerHTML = `
            <div class="gb-status warn">
              Daily free limit reached (3 audits/day).
              <a href="${BACKEND}/pay.html?key=${encodeURIComponent(API_KEY)}" target="_blank" style="color:inherit;text-decoration:underline;font-weight:700">Upgrade to Premium →</a>
            </div>`;
        } else {
          result.innerHTML = '<div class="gb-status error">' + escapeHtml(e.message) + '</div>';
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Audit & Auto-fix';
        loadPlan().then(() => {
          const banner = panel.querySelector('.gb-banner span');
          if (banner && state.plan === 'free') {
            banner.textContent = `Free plan — ${state.usage.auditsToday || 0}/${state.limits.freeAudits || 3} audits today`;
          }
        });
      }
    });
  }

  function renderAuditResult(container, data) {
    const before = data.before || { score: 0, issues: [] };
    const after = data.after;
    const fixes = data.fixes || [];

    let html = '<div class="gb-score-row">';
    html += `<div class="gb-score-block">
      <div class="gb-score-num">${before.score}</div>
      <div class="gb-score-label">Before</div>
    </div>`;
    if (after) {
      html += `<div class="gb-score-arrow">→</div>
        <div class="gb-score-block">
          <div class="gb-score-num good">${after.score}</div>
          <div class="gb-score-label">After</div>
        </div>`;
    }
    html += '</div>';

    const issues = before.issues || [];
    if (issues.length > 0) {
      html += '<div class="gb-section-title">Issues found (' + issues.length + ')</div>';
      html += '<ul class="gb-list">';
      issues.slice(0, 8).forEach((i) => {
        const sev = i.severity === 'error' ? 'error' : 'warning';
        html += `<li class="gb-list-item ${sev}">${escapeHtml(i.message || i)}</li>`;
      });
      html += '</ul>';
    } else {
      html += '<div class="gb-status success">✓ No critical issues found</div>';
    }

    if (fixes.length > 0) {
      html += '<div class="gb-section-title">Auto-fixes applied (' + fixes.length + ')</div>';
      html += '<ul class="gb-list">';
      fixes.slice(0, 8).forEach((f) => {
        html += `<li class="gb-list-item success">${escapeHtml(f)}</li>`;
      });
      html += '</ul>';
    }

    html += '<button id="gb-copy-report" class="gb-btn secondary" type="button">Copy full report</button>';

    container.innerHTML = html;

    const copyBtn = container.querySelector('#gb-copy-report');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const report = [
          'GrowthBot SEO Report',
          'URL: ' + data.url,
          'Score: ' + before.score + (after ? ' → ' + after.score : ''),
          '',
          'Issues:',
          ...issues.map((i) => '  - ' + (i.message || i)),
          '',
          'Fixes:',
          ...fixes.map((f) => '  - ' + f),
        ].join('\n');
        copy(report, 'Report copied!');
      });
    }
  }

  // ============================================================
  // VIDEO TAB
  // ============================================================
  function renderVideoTab(body) {
    body.innerHTML = `
      <label class="gb-label">Topic</label>
      <input id="gb-vid-topic" class="gb-input" type="text" placeholder="e.g. Fresh cows available in Warri" />
      <label class="gb-label">Business name</label>
      <input id="gb-vid-biz" class="gb-input" type="text" placeholder="e.g. Jibriliks Livestock" />
      <label class="gb-label">Duration</label>
      <select id="gb-vid-dur" class="gb-select">
        <option value="10">10 seconds</option>
        <option value="15" selected>15 seconds</option>
        <option value="20">20 seconds</option>
        <option value="25">25 seconds</option>
      </select>
      <label class="gb-label">Style</label>
      <select id="gb-vid-style" class="gb-select">
        <option value="documentary" selected>Documentary — calm, trustworthy</option>
        <option value="infomercial">Infomercial — high energy</option>
        <option value="tutorial">Tutorial — clean, structured</option>
        <option value="testimonial">Testimonial — warm, personal</option>
        <option value="product-showcase">Product Showcase — premium, dark</option>
      </select>
      <button id="gb-vid-go" class="gb-btn" type="button">Generate Video</button>
      <div id="gb-vid-result" aria-live="polite"></div>
    `;

    body.querySelector('#gb-vid-go').addEventListener('click', async function () {
      const btn = this;
      const topic = body.querySelector('#gb-vid-topic').value.trim();
      const businessName = body.querySelector('#gb-vid-biz').value.trim();
      const durationSeconds = Number(body.querySelector('#gb-vid-dur').value);
      const style = body.querySelector('#gb-vid-style').value;
      const result = body.querySelector('#gb-vid-result');

      if (!topic) {
        result.innerHTML = '<div class="gb-status warn">Enter a topic first</div>';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Generating script + voiceover…';
      result.innerHTML = '<div class="gb-status info">Stage 1/3: writing script with AI…</div>';

      try {
        result.innerHTML = '<div class="gb-status info">Stage 2/3: rendering voiceover + fetching clips…</div>';
        const data = await api('/api/create-video', {
          method: 'POST',
          body: { key: API_KEY, topic, businessName, durationSeconds, style },
        });

        let html = '';
        if (data.script) {
          html += '<div class="gb-script-box"><strong>Script</strong>' +
                  escapeHtml(data.script.fullScript || data.script.hook || '') + '</div>';
          if (data.script.caption) {
            html += '<div class="gb-script-box"><strong>Caption</strong>' +
                    escapeHtml(data.script.caption) + '</div>';
          }
        }

        if (data.renderId && data.pollUrl) {
          html += '<div class="gb-status info" id="gb-vid-status">Stage 3/3: rendering MP4…</div>';
          html += '<div id="gb-vid-preview"></div>';
          result.innerHTML = html;

          // Start polling
          startPolling(data.pollUrl, result);
        } else if (data.ok === false) {
          result.innerHTML = html + '<div class="gb-status error">' + escapeHtml(data.error || data.reason || 'Render failed') + '</div>';
        } else {
          result.innerHTML = html + '<div class="gb-status success">Ready</div>';
        }
      } catch (e) {
        if (e.status === 403) {
          result.innerHTML = `
            <div class="gb-status warn">
              Premium required to create videos.
              <a href="${BACKEND}/pay.html?key=${encodeURIComponent(API_KEY)}" target="_blank" style="color:inherit;text-decoration:underline;font-weight:700">Upgrade →</a>
            </div>`;
        } else {
          result.innerHTML = '<div class="gb-status error">' + escapeHtml(e.message) + '</div>';
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Video';
      }
    });
  }

  function startPolling(pollUrl, container) {
    stopPolling();
    const tick = async () => {
      try {
        const data = await api(pollUrl);
        const statusEl = container.querySelector('#gb-vid-status');
        const previewEl = container.querySelector('#gb-vid-preview');

        if (data.status === 'done' && data.url) {
          if (statusEl) {
            statusEl.className = 'gb-status success';
            statusEl.textContent = '✓ Video ready!';
          }
          if (previewEl) {
            previewEl.innerHTML = `
              <div class="gb-video-preview">
                <video src="${escapeHtml(data.url)}" controls muted playsinline></video>
              </div>
              <a class="gb-btn" href="${escapeHtml(data.url)}" target="_blank" rel="noopener" download style="display:block;text-align:center;margin-top:10px;text-decoration:none">⬇ Download MP4</a>
              ${data.note ? '<div class="gb-status info" style="margin-top:8px">' + escapeHtml(data.note) + '</div>' : ''}
            `;
          }
          return;
        }

        if (data.status === 'failed') {
          if (statusEl) {
            statusEl.className = 'gb-status error';
            statusEl.textContent = 'Render failed: ' + (data.error || 'unknown error');
          }
          return;
        }

        if (statusEl) {
          statusEl.textContent = 'Rendering… (' + (data.status || 'queued') + ')';
        }
        state.pollTimer = setTimeout(tick, 5000);
      } catch (e) {
        state.pollTimer = setTimeout(tick, 8000);
      }
    };
    tick();
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  // ============================================================
  // BACKLINK TAB
  // ============================================================
  function renderBacklinkTab(body) {
    body.innerHTML = `
      <div class="gb-subtabs" role="tablist">
        <button class="gb-subtab ${state.subTab === 'indexnow' ? 'active' : ''}" data-sub="indexnow" role="tab">IndexNow</button>
        <button class="gb-subtab ${state.subTab === 'listing' ? 'active' : ''}" data-sub="listing" role="tab">Listings</button>
      </div>
      <div id="gb-bl-content"></div>
    `;

    body.querySelectorAll('.gb-subtab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.subTab = tab.getAttribute('data-sub');
        renderBacklinkTab(body);
      });
    });

    const content = body.querySelector('#gb-bl-content');
    if (state.subTab === 'indexnow') renderIndexNow(content);
    else renderListingGenerator(content);
  }

  function renderIndexNow(container) {
    container.innerHTML = `
      <p style="font-size:12px;color:var(--gb-muted);line-height:1.5;margin-bottom:12px">
        Tell Bing, Yandex, Naver, and Seznam to crawl this page sooner.
        (Google uses Search Console — it doesn't support IndexNow.)
      </p>
      <label class="gb-label">Page URL</label>
      <input id="gb-in-url" class="gb-input" type="url" value="${escapeHtml(PAGE_URL)}" />
      <button id="gb-in-go" class="gb-btn" type="button">Submit to IndexNow</button>
      <div id="gb-in-result" aria-live="polite"></div>
    `;

    container.querySelector('#gb-in-go').addEventListener('click', async function () {
      const btn = this;
      const url = container.querySelector('#gb-in-url').value.trim();
      const result = container.querySelector('#gb-in-result');
      if (!url) return;

      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Submitting…';
      result.innerHTML = '';

      try {
        const data = await api('/api/backlink/indexnow', {
          method: 'POST',
          body: { key: API_KEY, urls: [url], siteUrl: url },
        });
        const ok = data.ok !== false;
        result.innerHTML = `<div class="gb-status ${ok ? 'success' : 'error'}">
          ${escapeHtml(data.message || (ok ? 'Submitted successfully' : 'Submission failed'))}
          ${data.keyResult && !data.keyResult.ok ? '<br><br><strong>Key file issue:</strong> ' + escapeHtml(data.keyResult.reason || '') : ''}
        </div>`;
      } catch (e) {
        result.innerHTML = '<div class="gb-status error">' + escapeHtml(e.message) + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit to IndexNow';
      }
    });
  }

  function renderListingGenerator(container) {
    container.innerHTML = `
      <p style="font-size:12px;color:var(--gb-muted);line-height:1.5;margin-bottom:12px">
        Generate ready-to-paste listings for Jiji, Google Business Profile, VConnect, and more. Copy, paste, done.
      </p>
      <label class="gb-label">Business name</label>
      <input id="gb-lb-name" class="gb-input" placeholder="Jibriliks Livestock" />
      <label class="gb-label">Phone</label>
      <input id="gb-lb-phone" class="gb-input" placeholder="08031234567" />
      <label class="gb-label">City</label>
      <input id="gb-lb-city" class="gb-input" placeholder="Warri" />
      <label class="gb-label">Category</label>
      <input id="gb-lb-cat" class="gb-input" placeholder="Livestock Farm" />
      <label class="gb-label">Short description</label>
      <textarea id="gb-lb-desc" class="gb-textarea" placeholder="Premium cattle, healthy and vaccinated"></textarea>
      <button id="gb-lb-go" class="gb-btn" type="button">Generate Listings</button>
      <div id="gb-lb-result" aria-live="polite"></div>
    `;

    container.querySelector('#gb-lb-go').addEventListener('click', async function () {
      const btn = this;
      const profile = {
        name: container.querySelector('#gb-lb-name').value.trim(),
        phone: container.querySelector('#gb-lb-phone').value.trim(),
        city: container.querySelector('#gb-lb-city').value.trim(),
        category: container.querySelector('#gb-lb-cat').value.trim(),
        description: container.querySelector('#gb-lb-desc').value.trim(),
      };
      const result = container.querySelector('#gb-lb-result');

      if (!profile.name) {
        result.innerHTML = '<div class="gb-status warn">Business name required</div>';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Generating…';
      result.innerHTML = '';

      try {
        const data = await api('/api/backlink/listing', {
          method: 'POST',
          body: { key: API_KEY, profile },
        });

        let html = '';
        if (data.napCheck && !data.napCheck.ok) {
          html += '<div class="gb-status warn">' + escapeHtml(data.napCheck.message) + '</div>';
        }
        Object.entries(data.packages || {}).forEach(([key, pkg]) => {
          html += `
            <div class="gb-package">
              <div class="gb-package-head">
                <span class="gb-package-platform">${escapeHtml(pkg.platform)}</span>
                <button class="gb-btn small secondary" data-copy-pkg="${escapeHtml(key)}" type="button">Copy</button>
              </div>
              <div class="gb-package-title">${escapeHtml(pkg.title)}</div>
              <div class="gb-package-desc">${escapeHtml(pkg.description)}</div>
            </div>
          `;
        });
        result.innerHTML = html;

        result.querySelectorAll('[data-copy-pkg]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-copy-pkg');
            const pkg = data.packages[key];
            if (!pkg) return;
            const text = `Title: ${pkg.title}\n\n${pkg.description}\n\nName: ${pkg.name}\nAddress: ${pkg.address}\nPhone: ${pkg.phone}\nCategory: ${pkg.category}`;
            copy(text, pkg.platform + ' copied!');
          });
        });
      } catch (e) {
        result.innerHTML = '<div class="gb-status error">' + escapeHtml(e.message) + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Listings';
      }
    });
  }

  // ============================================================
  // UPGRADE PROMPT
  // ============================================================
  function renderUpgradePrompt(tab) {
    const body = panel.querySelector('#gb-body');
    const feature = tab === 'video' ? 'Video generation' : 'Backlink tools';
    body.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:48px;margin-bottom:12px">🔒</div>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:8px">${feature} is Premium</h3>
        <p style="font-size:13px;color:var(--gb-muted);line-height:1.5;margin-bottom:20px">
          Upgrade to unlock unlimited SEO audits, AI video ads, IndexNow submission, and directory listings.
        </p>
        <a class="gb-btn" href="${BACKEND}/pay.html?key=${encodeURIComponent(API_KEY)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">
          Upgrade for ₦${state.limits.price || 5000}/month
        </a>
        <button class="gb-btn secondary" id="gb-back-to-seo" type="button">← Back to SEO Audit</button>
      </div>
    `;
    body.querySelector('#gb-back-to-seo').addEventListener('click', () => {
      state.tab = 'seo';
      panel.querySelectorAll('.gb-tab').forEach((t) => {
        t.classList.toggle('active', t.getAttribute('data-tab') === 'seo');
      });
      renderBody();
    });
  }

  // ============================================================
  // OPEN / CLOSE
  // ============================================================
  function openPanel() {
    if (state.open) return;
    state.open = true;
    panel.classList.add('open');
    renderShell();
    loadPlan().then(() => {
      const banner = panel.querySelector('.gb-banner span');
      if (banner && state.plan === 'free') {
        banner.textContent = `Free plan — ${state.usage.auditsToday || 0}/${state.limits.freeAudits || 3} audits today`;
      }
    });
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;
    panel.classList.remove('open');
    stopPolling();
  }

  btn.addEventListener('click', () => (state.open ? closePanel() : openPanel()));

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) closePanel();
  });

  // Prefetch plan so the badge shows instantly on first open
  loadPlan();
})();