/*!
 * GrowthBot Widget v4.0 — Mobile App Edition
 * Works on desktop (compact panel) AND mobile (fullscreen app experience)
 *
 * Usage: <script src="https://YOUR-APP/widget.js" data-key="YOUR_KEY"></script>
 *
 * Optional attributes:
 *   data-position="bottom-right|bottom-left"    FAB position
 *   data-key="..."                              Your API key
 */
(function () {
  'use strict';

  if (window.__growthbotLoaded) return;
  window.__growthbotLoaded = true;

  // ═══════════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════════
  const script =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"][data-key]') ||
    document.querySelector('script[src*="widget.js"]');

  if (!script) {
    console.warn('[GrowthBot] Could not find script tag');
    return;
  }

  const API_KEY = script.getAttribute('data-key') || '';
  const POSITION = script.getAttribute('data-position') || 'bottom-right';
  const SRC = script.src || '';
  const BACKEND = SRC.substring(0, SRC.lastIndexOf('/')) || window.location.origin;
  const PAGE_URL = window.location.href;
  const DEMO_MODE = !API_KEY;

  // ═══════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════
  const state = {
    open: false,
    isMobile: window.matchMedia('(max-width: 768px)').matches,
    tab: 'home',
    subTab: 'indexnow',
    plan: 'free',
    usage: {},
    limits: { freeAudits: 3, premiumVideos: 30, backlinks: 10, price: 5000 },
    business: null,
    analytics: null,
    pollTimer: null,
    reachable: true,
  };

  let gbHistoryEntry = false;
  let savedScrollY = 0;

  // ═══════════════════════════════════════════════════════════
  // SHADOW HOST
  // ═══════════════════════════════════════════════════════════
  if (document.getElementById('growthbot-host')) return;
  const host = document.createElement('div');
  host.id = 'growthbot-host';
  host.setAttribute('data-position', POSITION);
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // ═══════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════
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
      --gb-safe-bottom: env(safe-area-inset-bottom, 0px);
      --gb-safe-top: env(safe-area-inset-top, 0px);
    }
    :host([data-position="bottom-right"]) { bottom: 20px; right: 20px; }
    :host([data-position="bottom-left"])  { bottom: 20px; left: 20px;  }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ─── FLOATING BUTTON ─── */
    .gb-fab {
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
      font-family: inherit;
    }
    .gb-fab:hover { transform: scale(1.05); }
    .gb-fab:active { transform: scale(0.92); }
    .gb-fab::after {
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

    /* ─── PANEL — DESKTOP (sidebar) ─── */
    .gb-panel {
      position: absolute;
      bottom: 76px;
      right: 0;
      width: 400px;
      max-width: calc(100vw - 32px);
      height: 640px;
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

    /* ─── PANEL — MOBILE (fullscreen) ─── */
    .gb-panel.mobile {
      position: fixed;
      inset: 0;
      bottom: 0;
      right: 0;
      left: 0;
      top: 0;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      max-width: 100vw;
      max-height: 100vh;
      max-height: 100dvh;
      border-radius: 0;
      border: none;
      padding-top: var(--gb-safe-top);
      animation: gb-slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
    }
    @keyframes gb-slide-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    /* ─── HEADER ─── */
    .gb-header {
      padding: 14px 16px;
      background: var(--gb-surface);
      border-bottom: 1px solid var(--gb-border);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      min-height: 56px;
      touch-action: none; /* enable swipe-down-to-close */
    }
    .gb-header-back {
      background: transparent;
      border: none;
      color: var(--gb-muted);
      cursor: pointer;
      font-size: 22px;
      padding: 4px 8px 4px 0;
      border-radius: 6px;
      font-family: inherit;
      display: none;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      min-height: 36px;
    }
    .gb-header-back.visible { display: flex; }
    .gb-header-back:active { color: var(--gb-text); background: var(--gb-surface-2); }
    .gb-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 15px;
      color: var(--gb-text);
      flex: 1;
      min-width: 0;
    }
    .gb-brand-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--gb-accent), var(--gb-accent-2));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .gb-brand-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .gb-brand-title {
      font-size: 15px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gb-brand-sub {
      font-size: 10px;
      color: var(--gb-muted);
      line-height: 1.2;
      font-weight: 500;
      margin-top: 2px;
    }
    .gb-header-close {
      background: transparent;
      border: none;
      color: var(--gb-muted);
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
      padding: 4px 10px;
      border-radius: 6px;
      font-family: inherit;
      min-width: 36px;
      min-height: 36px;
    }
    .gb-header-close:active { color: var(--gb-text); background: var(--gb-surface-2); }

    /* ─── BANNER ─── */
    .gb-banner {
      padding: 8px 16px;
      background: rgba(124,58,237,0.08);
      border-bottom: 1px solid var(--gb-border);
      font-size: 12px;
      color: var(--gb-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .gb-banner.warn { background: rgba(250,204,21,0.08); color: var(--gb-warning); }
    .gb-banner.error { background: rgba(248,113,113,0.08); color: var(--gb-error); }

    /* ─── BODY ─── */
    .gb-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .gb-body::-webkit-scrollbar { width: 4px; }
    .gb-body::-webkit-scrollbar-thumb { background: var(--gb-surface-2); border-radius: 2px; }

    /* ─── NAV — DESKTOP (top tabs) ─── */
    .gb-nav {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: var(--gb-surface);
      border-bottom: 1px solid var(--gb-border);
      flex-shrink: 0;
      overflow-x: auto;
      order: -1;
    }
    .gb-nav::-webkit-scrollbar { display: none; }
    .gb-nav-item {
      flex: 1;
      min-width: 60px;
      padding: 8px 8px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--gb-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      white-space: nowrap;
    }
    .gb-nav-item:hover:not(.active) { color: var(--gb-text); background: var(--gb-surface-2); }
    .gb-nav-item.active { background: var(--gb-accent); color: #fff; }
    .gb-nav-item.locked::after { content: ' 🔒'; font-size: 10px; }

    /* ─── NAV — MOBILE (bottom bar) ─── */
    .gb-panel.mobile .gb-nav {
      order: 10;
      padding: 6px 4px calc(6px + var(--gb-safe-bottom));
      border-top: 1px solid var(--gb-border);
      border-bottom: none;
      gap: 0;
    }
    .gb-panel.mobile .gb-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 8px 4px;
      border-radius: 10px;
      font-size: 10px;
      min-height: 56px;
    }
    .gb-panel.mobile .gb-nav-item .icon {
      font-size: 20px;
      line-height: 1;
    }
    .gb-panel.mobile .gb-nav-item.active {
      background: transparent;
      color: var(--gb-accent-light);
    }

    /* ─── GENERIC CONTENT ─── */
    .gb-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--gb-muted);
      margin: 14px 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .gb-label:first-child { margin-top: 0; }
    .gb-input,
    .gb-select,
    .gb-textarea {
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid var(--gb-border-strong);
      background: var(--gb-surface);
      color: var(--gb-text);
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s ease;
      -webkit-appearance: none;
      appearance: none;
    }
    .gb-input:focus,
    .gb-select:focus,
    .gb-textarea:focus { border-color: var(--gb-accent); }
    .gb-textarea { resize: vertical; min-height: 70px; font-family: inherit; }
    .gb-select {
      background-image: linear-gradient(45deg, transparent 50%, var(--gb-muted) 50%),
                        linear-gradient(135deg, var(--gb-muted) 50%, transparent 50%);
      background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%;
      background-size: 5px 5px;
      background-repeat: no-repeat;
      padding-right: 34px;
    }
    .gb-select option { background: var(--gb-surface); color: var(--gb-text); }

    .gb-btn {
      width: 100%;
      padding: 13px 16px;
      border-radius: 12px;
      border: none;
      background: var(--gb-accent);
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
      margin-top: 12px;
      font-family: inherit;
      min-height: 46px;
    }
    .gb-btn:hover:not(:disabled) { background: #6d28d9; }
    .gb-btn:active:not(:disabled) { transform: scale(0.98); }
    .gb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .gb-btn.secondary { background: var(--gb-surface-2); color: var(--gb-text); }
    .gb-btn.secondary:hover:not(:disabled) { background: var(--gb-border-strong); }
    .gb-btn.small { padding: 8px 14px; font-size: 12px; width: auto; margin-top: 8px; min-height: 34px; }

    /* ─── HOME SCREEN ─── */
    .gb-home-greeting {
      font-size: 13px;
      color: var(--gb-muted);
      margin-bottom: 6px;
    }
    .gb-home-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--gb-text);
      margin-bottom: 4px;
      line-height: 1.2;
    }
    .gb-home-sub {
      font-size: 13px;
      color: var(--gb-muted);
      margin-bottom: 20px;
    }
    .gb-home-section {
      margin-bottom: 24px;
    }
    .gb-home-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--gb-dim);
      margin-bottom: 10px;
    }
    .gb-quick-actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .gb-quick-action {
      background: var(--gb-surface);
      border: 1px solid var(--gb-border);
      border-radius: 14px;
      padding: 18px 8px 14px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      color: var(--gb-text);
      min-height: 92px;
    }
    .gb-quick-action:hover:not(:disabled) {
      background: var(--gb-surface-2);
      border-color: var(--gb-accent);
      transform: translateY(-1px);
    }
    .gb-quick-action:active:not(:disabled) { transform: translateY(0); }
    .gb-quick-action:disabled { opacity: 0.5; cursor: not-allowed; }
    .gb-quick-action .icon {
      font-size: 26px;
      display: block;
      margin-bottom: 6px;
      line-height: 1;
    }
    .gb-quick-action .label {
      font-size: 12px;
      font-weight: 600;
    }
    .gb-quick-action .sub {
      font-size: 10px;
      color: var(--gb-muted);
      margin-top: 2px;
    }
    .gb-stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .gb-stat-card {
      background: var(--gb-surface);
      border: 1px solid var(--gb-border);
      border-radius: 12px;
      padding: 12px;
      text-align: center;
    }
    .gb-stat-num {
      font-size: 22px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--gb-accent-light), #60a5fa);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
      margin-bottom: 4px;
    }
    .gb-stat-lbl {
      font-size: 10px;
      color: var(--gb-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .gb-plan-card {
      background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.08));
      border: 1px solid rgba(124,58,237,0.35);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .gb-plan-info {
      flex: 1;
      min-width: 0;
    }
    .gb-plan-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: var(--gb-surface-2);
      color: var(--gb-muted);
      margin-bottom: 4px;
    }
    .gb-plan-badge.premium {
      background: linear-gradient(135deg, var(--gb-accent), var(--gb-accent-2));
      color: #fff;
    }
    .gb-plan-name { font-size: 15px; font-weight: 700; color: var(--gb-text); margin-bottom: 2px; }
    .gb-plan-desc { font-size: 11px; color: var(--gb-muted); }
    .gb-plan-upgrade {
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--gb-accent);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      font-family: inherit;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* ─── MORE SCREEN ─── */
    .gb-menu-list {
      background: var(--gb-surface);
      border: 1px solid var(--gb-border);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .gb-menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 15px 16px;
      border: none;
      background: transparent;
      color: var(--gb-text);
      cursor: pointer;
      width: 100%;
      text-align: left;
      font-family: inherit;
      font-size: 14px;
      border-bottom: 1px solid var(--gb-border);
      transition: background 0.15s ease;
      min-height: 52px;
    }
    .gb-menu-item:last-child { border-bottom: none; }
    .gb-menu-item:hover { background: var(--gb-surface-2); }
    .gb-menu-item .icon { font-size: 20px; flex-shrink: 0; width: 24px; text-align: center; }
    .gb-menu-item .text { flex: 1; }
    .gb-menu-item .arrow { color: var(--gb-dim); font-size: 18px; }
    .gb-menu-item a { color: inherit; text-decoration: none; }
    .gb-menu-item.warn { color: var(--gb-error); }

    /* ─── SECTION HEADERS ─── */
    .gb-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--gb-muted);
      margin: 16px 0 8px;
    }

    /* ─── SCORE ─── */
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
    .gb-score-num.good {
      background: linear-gradient(135deg, #4ade80, #22c55e);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .gb-score-label {
      font-size: 11px;
      color: var(--gb-muted);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
    }
    .gb-score-arrow { color: var(--gb-accent-light); font-size: 24px; }

    /* ─── LIST ─── */
    .gb-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .gb-list-item {
      padding: 10px 12px;
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

    /* ─── SCRIPT BOX ─── */
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
    .gb-script-box strong {
      color: var(--gb-text);
      display: block;
      margin-bottom: 4px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* ─── PACKAGE ─── */
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
      gap: 8px;
    }
    .gb-package-platform { font-weight: 700; font-size: 13px; color: var(--gb-text); }
    .gb-package-title {
      font-size: 12px;
      color: var(--gb-accent-light);
      margin-bottom: 6px;
      word-break: break-word;
    }
    .gb-package-desc {
      font-size: 12px;
      color: var(--gb-muted);
      line-height: 1.5;
      max-height: 100px;
      overflow-y: auto;
    }

    /* ─── SUBTABS ─── */
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
      padding: 9px;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: var(--gb-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    }
    .gb-subtab.active { background: var(--gb-accent); color: #fff; }

    /* ─── STATUS ─── */
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

    /* ─── LOADING ─── */
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

    /* ─── VIDEO PREVIEW ─── */
    .gb-video-preview {
      width: 100%;
      aspect-ratio: 9 / 16;
      max-height: 320px;
      border-radius: 10px;
      background: #000;
      border: 1px solid var(--gb-border);
      margin-top: 12px;
      overflow: hidden;
    }
    .gb-video-preview video { width: 100%; height: 100%; object-fit: contain; }

    /* ─── LINK BOX ─── */
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

    /* ─── TOAST ─── */
    .gb-toast {
      position: fixed;
      bottom: calc(90px + var(--gb-safe-bottom));
      left: 50%;
      transform: translateX(-50%);
      background: var(--gb-success);
      color: #052e16;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      z-index: 1;
      animation: gb-toast-in 0.2s ease-out;
      pointer-events: none;
      max-width: calc(100vw - 40px);
      text-align: center;
    }
    @keyframes gb-toast-in {
      from { opacity: 0; transform: translate(-50%, 8px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }

    /* ─── UTIL ─── */
    .gb-hidden { display: none !important; }

    /* ─── MOBILE TWEAKS ─── */
    @media (max-width: 480px) {
      .gb-quick-action { padding: 16px 6px 12px; min-height: 88px; }
      .gb-quick-action .icon { font-size: 24px; }
      .gb-quick-action .label { font-size: 11px; }
      .gb-home-title { font-size: 18px; }
      .gb-stat-num { font-size: 20px; }
    }
  `;
  shadow.appendChild(styles);

  // ═══════════════════════════════════════════════════════════
  // DOM SHELL
  // ═══════════════════════════════════════════════════════════
  const fab = document.createElement('button');
  fab.className = 'gb-fab';
  fab.setAttribute('aria-label', 'Open GrowthBot');
  fab.innerHTML = '✨';

  const panel = document.createElement('div');
  panel.className = 'gb-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'GrowthBot');

  shadow.appendChild(fab);
  shadow.appendChild(panel);

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════
  function $(id) { return shadow.getElementById ? shadow.getElementById(id) : panel.querySelector('#' + id); }
  function qs(sel) { return panel.querySelector(sel); }
  function qsa(sel) { return panel.querySelectorAll(sel); }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'gb-toast';
    el.textContent = msg;
    shadow.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  async function copy(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg || 'Copied!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      shadow.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(successMsg || 'Copied!'); }
      catch { toast('Copy failed'); }
      finally { ta.remove(); }
    }
  }

  async function api(path, opts) {
    const options = Object.assign({ method: 'GET' }, opts || {});
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
      options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    }
    const res = await fetch(BACKEND + path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || ('HTTP ' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  // ═══════════════════════════════════════════════════════════
  // BODY SCROLL LOCK
  // ═══════════════════════════════════════════════════════════
  function lockBodyScroll() {
    savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }
  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, savedScrollY);
  }

  // ═══════════════════════════════════════════════════════════
  // HISTORY (mobile back button)
  // ═══════════════════════════════════════════════════════════
  function pushHistory() {
    if (gbHistoryEntry) return;
    try {
      history.pushState({ __growthbot: true }, '', location.href);
      gbHistoryEntry = true;
    } catch (e) {}
  }
  function popHistory() {
    if (!gbHistoryEntry) return;
    gbHistoryEntry = false;
    try { history.back(); } catch (e) {}
  }
  window.addEventListener('popstate', () => {
    if (gbHistoryEntry) {
      gbHistoryEntry = false;
      if (state.open) closePanel({ skipHistoryPop: true });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // PLAN
  // ═══════════════════════════════════════════════════════════
  async function loadPlan() {
    if (DEMO_MODE) { state.reachable = false; return; }
    try {
      const data = await api(
        '/api/check-plan?key=' + encodeURIComponent(API_KEY) +
        '&url=' + encodeURIComponent(PAGE_URL)
      );
      state.plan = data.plan || 'free';
      state.usage = data.usage || {};
      state.limits = Object.assign(state.limits, data.limits || {});
      state.reachable = true;
    } catch (e) {
      state.reachable = false;
    }
  }

  async function loadBusiness() {
    if (DEMO_MODE) return;
    try {
      const r = await api('/api/businesses/me');
      state.business = r.business;
    } catch { state.business = null; }
  }

  async function loadAnalytics() {
    if (!state.business) return;
    try {
      const r = await api('/api/businesses/' + state.business.id + '/analytics');
      state.analytics = r.analytics;
    } catch { state.analytics = null; }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: SHELL
  // ═══════════════════════════════════════════════════════════
  function renderShell() {
    if (state.isMobile) panel.classList.add('mobile');
    else panel.classList.remove('mobile');

    const isFree = state.plan === 'free';
    const isHome = state.tab === 'home';
    const showBack = state.isMobile && !isHome;

    const bizName = state.business?.name || 'GrowthBot';
    const bizSub = state.business?.category || 'Business tools';

    const bannerText = DEMO_MODE
      ? 'Demo mode — add <code>data-key</code> to activate'
      : !state.reachable
        ? '⚠️ Connection problem'
        : isFree
          ? `${state.usage.auditsToday || 0}/${state.limits.freeAudits || 3} audits today · Free plan`
          : `⭐ Premium · ${state.usage.videosMonth || 0}/${state.limits.premiumVideos || 30} videos this month`;

    const bannerClass = DEMO_MODE || !state.reachable ? 'warn' : '';

    const tabs = [
      { key: 'home', icon: '🏠', label: 'Home' },
      { key: 'seo', icon: '🔍', label: 'SEO' },
      { key: 'video', icon: '🎬', label: 'Video' },
      { key: 'links', icon: '🔗', label: 'Links' },
      { key: 'more', icon: '⋯', label: 'More' },
    ];

    panel.innerHTML = `
      <div class="gb-header">
        <button class="gb-header-back ${showBack ? 'visible' : ''}" aria-label="Back" data-action="back">←</button>
        <div class="gb-brand">
          <span class="gb-brand-mark">✨</span>
          <div class="gb-brand-text">
            <div class="gb-brand-title">${escapeHtml(bizName)}</div>
            <div class="gb-brand-sub">${escapeHtml(bizSub)}</div>
          </div>
        </div>
        <button class="gb-header-close" aria-label="Close" data-action="close">×</button>
      </div>
      <div class="gb-banner ${bannerClass}">
        <span>${bannerText}</span>
      </div>
      <nav class="gb-nav">
        ${tabs.map(t => `
          <button class="gb-nav-item ${state.tab === t.key ? 'active' : ''} ${(t.key === 'video' || t.key === 'links') && isFree ? 'locked' : ''}" data-tab="${t.key}">
            <span class="icon">${t.icon}</span>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </nav>
      <div class="gb-body" id="gb-body"></div>
    `;

    // Wire header
    const backBtn = qs('[data-action="back"]');
    if (backBtn) backBtn.addEventListener('click', () => {
      state.tab = 'home';
      renderShell();
    });
    qs('[data-action="close"]').addEventListener('click', () => closePanel());

    // Wire nav
    qsa('.gb-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        if (target === state.tab) return;
        if ((target === 'video' || target === 'links') && isFree) {
          renderUpgradePrompt(target);
          return;
        }
        stopPolling();
        state.tab = target;
        renderShell();
      });
    });

    // Swipe down to close (mobile)
    if (state.isMobile) {
      attachSwipeDown();
    }

    renderBody();
  }

  // ═══════════════════════════════════════════════════════════
  // SWIPE DOWN TO CLOSE
  // ═══════════════════════════════════════════════════════════
  function attachSwipeDown() {
    const header = qs('.gb-header');
    if (!header) return;
    let startY = 0, startX = 0, active = false;

    header.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      active = true;
    }, { passive: true });

    header.addEventListener('touchmove', (e) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy > 100 && dx < 60) {
        active = false;
        closePanel();
      }
    }, { passive: true });

    header.addEventListener('touchend', () => { active = false; }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════
  // BODY DISPATCH
  // ═══════════════════════════════════════════════════════════
  function renderBody() {
    const body = qs('#gb-body');
    if (!body) return;
    body.scrollTop = 0;
    if (state.tab === 'home') renderHome(body);
    else if (state.tab === 'seo') renderSeoTab(body);
    else if (state.tab === 'video') renderVideoTab(body);
    else if (state.tab === 'links') renderLinksTab(body);
    else if (state.tab === 'more') renderMoreTab(body);
  }

  // ═══════════════════════════════════════════════════════════
  // HOME TAB
  // ═══════════════════════════════════════════════════════════
  function renderHome(body) {
    const isFree = state.plan === 'free';
    const todayAudits = state.usage.auditsToday || 0;
    const todayLimit = state.limits.freeAudits || 3;
    const videos = state.usage.videosMonth || 0;
    const leads = state.analytics?.leads || 0;
    const clicks = state.analytics?.total_clicks || 0;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    body.innerHTML = `
      <div class="gb-home-greeting">${greeting} 👋</div>
      <div class="gb-home-title">${escapeHtml(state.business?.name || 'Welcome to GrowthBot')}</div>
      <div class="gb-home-sub">
        ${state.business ? 'Let\'s grow your business today.' : 'Set up your business to unlock all features.'}
      </div>

      <div class="gb-home-section">
        <div class="gb-home-section-title">Quick actions</div>
        <div class="gb-quick-actions">
          <button class="gb-quick-action" data-quick="seo">
            <span class="icon">🔍</span>
            <div class="label">Audit</div>
            <div class="sub">${isFree ? todayLimit - todayAudits + ' left' : 'Unlimited'}</div>
          </button>
          <button class="gb-quick-action" data-quick="video" ${isFree ? 'disabled' : ''}>
            <span class="icon">🎬</span>
            <div class="label">Video</div>
            <div class="sub">${isFree ? '🔒 Premium' : 'Create ad'}</div>
          </button>
          <button class="gb-quick-action" data-quick="links" ${isFree ? 'disabled' : ''}>
            <span class="icon">🔗</span>
            <div class="label">Links</div>
            <div class="sub">${isFree ? '🔒 Premium' : 'Track & index'}</div>
          </button>
        </div>
      </div>

      <div class="gb-home-section">
        <div class="gb-home-section-title">This month</div>
        <div class="gb-stats-row">
          <div class="gb-stat-card">
            <div class="gb-stat-num">${todayAudits}</div>
            <div class="gb-stat-lbl">Audits</div>
          </div>
          <div class="gb-stat-card">
            <div class="gb-stat-num">${videos}</div>
            <div class="gb-stat-lbl">Videos</div>
          </div>
          <div class="gb-stat-card">
            <div class="gb-stat-num">${leads}</div>
            <div class="gb-stat-lbl">Leads</div>
          </div>
        </div>
      </div>

      <div class="gb-home-section">
        <div class="gb-plan-card">
          <div class="gb-plan-info">
            <div class="gb-plan-badge ${isFree ? '' : 'premium'}">${isFree ? 'Free' : '⭐ Premium'}</div>
            <div class="gb-plan-name">${isFree ? 'Upgrade to Premium' : 'Premium active'}</div>
            <div class="gb-plan-desc">${isFree ? 'Unlimited audits, AI videos, backlinks, leads' : 'All features unlocked'}</div>
          </div>
          ${isFree ? `<a class="gb-plan-upgrade" href="${BACKEND}/pay.html?key=${encodeURIComponent(API_KEY)}" target="_blank" rel="noopener">Upgrade ₦${state.limits.price || 5000}</a>` : ''}
        </div>
      </div>

      ${!state.business ? `
        <div class="gb-home-section">
          <button class="gb-btn" data-open-dashboard>Set up your business →</button>
          <div style="font-size:11px;color:var(--gb-dim);text-align:center;margin-top:8px">
            Opens the full dashboard in a new tab
          </div>
        </div>
      ` : ''}
    `;

    body.querySelectorAll('[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-quick');
        if (btn.disabled) return;
        if ((t === 'video' || t === 'links') && isFree) {
          renderUpgradePrompt(t);
          return;
        }
        state.tab = t;
        renderShell();
      });
    });

    const openBtn = body.querySelector('[data-open-dashboard]');
    if (openBtn) openBtn.addEventListener('click', () => {
      window.open(BACKEND + '/dashboard.html?key=' + encodeURIComponent(API_KEY), '_blank');
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SEO TAB
  // ═══════════════════════════════════════════════════════════
  function renderSeoTab(body) {
    body.innerHTML = `
      <label class="gb-label">Page URL</label>
      <input id="gb-seo-url" class="gb-input" type="url" value="${escapeHtml(PAGE_URL)}" placeholder="https://..." />
      <label class="gb-label">Target keyword (optional)</label>
      <input id="gb-seo-kw" class="gb-input" type="text" placeholder="e.g. jamb caps 2026" />
      <button id="gb-seo-go" class="gb-btn" type="button">Audit & Auto-fix</button>
      <div id="gb-seo-result" aria-live="polite"></div>
    `;

    body.querySelector('#gb-seo-go').addEventListener('click', async function () {
      const btn = this;
      const url = body.querySelector('#gb-seo-url').value.trim();
      const keyword = body.querySelector('#gb-seo-kw').value.trim();
      const result = body.querySelector('#gb-seo-result');
      if (!url) return;
      if (DEMO_MODE) {
        result.innerHTML = '<div class="gb-status warning">Add a <code>data-key</code> to run real audits.</div>';
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Auditing…';
      result.innerHTML = '<div class="gb-status info">Analyzing page…</div>';
      try {
        const data = await api('/api/audit', {
          method: 'POST',
          body: { url, keyword, key: API_KEY, autoFix: true },
        });
        renderAuditResult(result, data);
        loadPlan();
      } catch (e) {
        if (e.status === 403 && e.data?.error === 'FREE_LIMIT') {
          result.innerHTML = `
            <div class="gb-status warning">
              Daily free limit reached.
              <a href="${BACKEND}/pay.html?key=${encodeURIComponent(API_KEY)}" target="_blank" style="color:inherit;text-decoration:underline;font-weight:700">Upgrade →</a>
            </div>`;
        } else {
          result.innerHTML = '<div class="gb-status error">' + escapeHtml(e.message) + '</div>';
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Audit & Auto-fix';
      }
    });
  }

  function renderAuditResult(container, data) {
    const before = data.before || { score: 0, issues: [] };
    const after = data.after;
    const fixes = data.fixes || [];
    let html = '<div class="gb-score-row">';
    html += `<div class="gb-score-block"><div class="gb-score-num">${before.score}</div><div class="gb-score-label">Before</div></div>`;
    if (after) {
      html += `<div class="gb-score-arrow">→</div><div class="gb-score-block"><div class="gb-score-num good">${after.score}</div><div class="gb-score-label">After</div></div>`;
    }
    html += '</div>';

    const issues = before.issues || [];
    if (issues.length) {
      html += '<div class="gb-section-title">Issues (' + issues.length + ')</div><ul class="gb-list">';
      issues.slice(0, 8).forEach(i => {
        const sev = i.severity === 'error' ? 'error' : 'warning';
        html += `<li class="gb-list-item ${sev}">${escapeHtml(i.message || i)}</li>`;
      });
      html += '</ul>';
    } else {
      html += '<div class="gb-status success">✓ No critical issues</div>';
    }
    if (fixes.length) {
      html += '<div class="gb-section-title">Fixes (' + fixes.length + ')</div><ul class="gb-list">';
      fixes.slice(0, 8).forEach(f => {
        html += `<li class="gb-list-item success">${escapeHtml(f)}</li>`;
      });
      html += '</ul>';
    }
    html += '<button id="gb-copy-report" class="gb-btn secondary" type="button">Copy report</button>';
    container.innerHTML = html;
    const copyBtn = container.querySelector('#gb-copy-report');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      copy(reportText(data), 'Report copied!');
    });
  }

  function reportText(data) {
    const b = data.before || {};
    const a = data.after;
    return [
      'GrowthBot SEO Report',
      'URL: ' + data.url,
      'Score: ' + (b.score || 0) + (a ? ' → ' + a.score : ''),
      '',
      'Issues:',
      ...(b.issues || []).map(i => '  - ' + (i.message || i)),
      '',
      'Fixes:',
      ...(data.fixes || []).map(f => '  - ' + f),
    ].join('\n');
  }

  // ═══════════════════════════════════════════════════════════
  // VIDEO TAB
  // ═══════════════════════════════════════════════════════════
  function renderVideoTab(body) {
    body.innerHTML = `
      <label class="gb-label">Topic</label>
      <input id="gb-vid-topic" class="gb-input" placeholder="Fresh cows available in Warri" />
      <label class="gb-label">Business name</label>
      <input id="gb-vid-biz" class="gb-input" value="${escapeHtml(state.business?.name || '')}" placeholder="Jibriliks Livestock" />
      <label class="gb-label">Duration</label>
      <select id="gb-vid-dur" class="gb-select">
        <option value="10">10 seconds</option>
        <option value="15" selected>15 seconds</option>
        <option value="20">20 seconds</option>
        <option value="25">25 seconds</option>
      </select>
      <label class="gb-label">Style</label>
      <select id="gb-vid-style" class="gb-select">
        <option value="documentary">Documentary — calm, trustworthy</option>
        <option value="infomercial">Infomercial — high energy</option>
        <option value="tutorial">Tutorial — clean, structured</option>
        <option value="testimonial">Testimonial — warm, personal</option>
        <option value="product-showcase">Product Showcase — premium</option>
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
        result.innerHTML = '<div class="gb-status warning">Enter a topic</div>';
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Generating…';
      result.innerHTML = '<div class="gb-status info">Writing script + voiceover…</div>';
      try {
        const data = await api('/api/create-video', {
          method: 'POST',
          body: { key: API_KEY, topic, businessName, durationSeconds, style },
        });
        let html = '';
        if (data.script) {
          html += '<div class="gb-script-box"><strong>Script</strong>' + escapeHtml(data.script.fullScript || '') + '</div>';
          if (data.script.caption) {
            html += '<div class="gb-script-box"><strong>Caption</strong>' + escapeHtml(data.script.caption) + '</div>';
          }
        }
        if (data.renderId && data.pollUrl) {
          html += '<div class="gb-status info" id="gb-vid-status">Rendering MP4…</div>';
          html += '<div id="gb-vid-preview"></div>';
          result.innerHTML = html;
          startPolling(data.pollUrl, result);
        } else {
          result.innerHTML = html + '<div class="gb-status success">Ready</div>';
        }
      } catch (e) {
        if (e.status === 403) {
          result.innerHTML = `
            <div class="gb-status warning">
              Premium required.
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
          if (statusEl) { statusEl.className = 'gb-status success'; statusEl.textContent = '✓ Ready!'; }
          if (previewEl) {
            previewEl.innerHTML = `
              <div class="gb-video-preview"><video src="${escapeHtml(data.url)}" controls muted playsinline></video></div>
              <a class="gb-btn" href="${escapeHtml(data.url)}" target="_blank" rel="noopener" download style="display:block;text-align:center;margin-top:10px;text-decoration:none">⬇ Download MP4</a>
            `;
          }
          return;
        }
        if (data.status === 'failed') {
          if (statusEl) { statusEl.className = 'gb-status error'; statusEl.textContent = 'Render failed'; }
          return;
        }
        state.pollTimer = setTimeout(tick, 5000);
      } catch {
        state.pollTimer = setTimeout(tick, 8000);
      }
    };
    tick();
  }

  function stopPolling() {
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
  }

  // ═══════════════════════════════════════════════════════════
  // LINKS TAB
  // ═══════════════════════════════════════════════════════════
  function renderLinksTab(body) {
    body.innerHTML = `
      <div class="gb-subtabs">
        <button class="gb-subtab ${state.subTab === 'indexnow' ? 'active' : ''}" data-sub="indexnow">IndexNow</button>
        <button class="gb-subtab ${state.subTab === 'listing' ? 'active' : ''}" data-sub="listing">Listings</button>
      </div>
      <div id="gb-links-content"></div>
    `;
    body.querySelectorAll('.gb-subtab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.subTab = tab.getAttribute('data-sub');
        renderLinksTab(body);
      });
    });
    const content = body.querySelector('#gb-links-content');
    if (state.subTab === 'indexnow') renderIndexNow(content);
    else renderListing(content);
  }

  function renderIndexNow(container) {
    container.innerHTML = `
      <p style="font-size:12px;color:var(--gb-muted);line-height:1.5;margin-bottom:12px">
        Tell Bing, Yandex, Naver, and Seznam to crawl this page sooner.
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
      try {
        const data = await api('/api/backlink/indexnow', {
          method: 'POST',
          body: { key: API_KEY, urls: [url], siteUrl: url },
        });
        const ok = data.ok !== false;
        result.innerHTML = `<div class="gb-status ${ok ? 'success' : 'error'}">${escapeHtml(data.message || (ok ? 'Submitted' : 'Failed'))}</div>`;
      } catch (e) {
        result.innerHTML = '<div class="gb-status error">' + escapeHtml(e.message) + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit to IndexNow';
      }
    });
  }

  function renderListing(container) {
    container.innerHTML = `
      <p style="font-size:12px;color:var(--gb-muted);line-height:1.5;margin-bottom:12px">
        Generate copy-paste-ready listings for Jiji, Google Business Profile, VConnect, etc.
      </p>
      <label class="gb-label">Business name</label>
      <input id="gb-lb-name" class="gb-input" value="${escapeHtml(state.business?.name || '')}" />
      <label class="gb-label">Phone</label>
      <input id="gb-lb-phone" class="gb-input" value="${escapeHtml(state.business?.phone || '')}" />
      <label class="gb-label">City</label>
      <input id="gb-lb-city" class="gb-input" value="${escapeHtml(state.business?.city || '')}" />
      <label class="gb-label">Category</label>
      <input id="gb-lb-cat" class="gb-input" value="${escapeHtml(state.business?.category || '')}" />
      <label class="gb-label">Short description</label>
      <textarea id="gb-lb-desc" class="gb-textarea" placeholder="What do you do?">${escapeHtml(state.business?.description || '')}</textarea>
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
      if (!profile.name) { result.innerHTML = '<div class="gb-status warning">Business name required</div>'; return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="gb-loading"></span>Generating…';
      try {
        const data = await api('/api/backlink/listing', {
          method: 'POST',
          body: { key: API_KEY, profile },
        });
        let html = '';
        if (data.napCheck && !data.napCheck.ok) {
          html += '<div class="gb-status warning">' + escapeHtml(data.napCheck.message) + '</div>';
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
        result.querySelectorAll('[data-copy-pkg]').forEach(b => {
          b.addEventListener('click', () => {
            const key = b.getAttribute('data-copy-pkg');
            const pkg = data.packages[key];
            if (!pkg) return;
            copy(`Title: ${pkg.title}\n\n${pkg.description}\n\nName: ${pkg.name}\nAddress: ${pkg.address}\nPhone: ${pkg.phone}\nCategory: ${pkg.category}`, pkg.platform + ' copied!');
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

  // ═══════════════════════════════════════════════════════════
  // MORE TAB
  // ═══════════════════════════════════════════════════════════
  function renderMoreTab(body) {
    const isFree = state.plan === 'free';
    body.innerHTML = `
      <div class="gb-home-section">
        <div class="gb-home-section-title">Account</div>
        <div class="gb-menu-list">
          <button class="gb-menu-item" data-go-dashboard>
            <span class="icon">📊</span>
            <span class="text">Full dashboard</span>
            <span class="arrow">→</span>
          </button>
          <button class="gb-menu-item" data-go-business>
            <span class="icon">🏢</span>
            <span class="text">${state.business ? 'Edit business profile' : 'Set up business profile'}</span>
            <span class="arrow">→</span>
          </button>
          <button class="gb-menu-item" data-go-campaigns>
            <span class="icon">📣</span>
            <span class="text">Campaigns & smart links</span>
            <span class="arrow">→</span>
          </button>
          <button class="gb-menu-item" data-go-leads>
            <span class="icon">👥</span>
            <span class="text">Leads inbox</span>
            <span class="arrow">→</span>
          </button>
        </div>
      </div>

      <div class="gb-home-section">
        <div class="gb-home-section-title">Plan</div>
        <div class="gb-menu-list">
          <button class="gb-menu-item" data-go-pay>
            <span class="icon">${isFree ? '⭐' : '✅'}</span>
            <span class="text">${isFree ? 'Upgrade to Premium' : 'Manage subscription'}</span>
            <span class="arrow">→</span>
          </button>
        </div>
      </div>

      <div class="gb-home-section">
        <div class="gb-home-section-title">Developer</div>
        <div class="gb-menu-list">
          <button class="gb-menu-item" data-copy-key>
            <span class="icon">🔑</span>
            <span class="text">Copy API key</span>
            <span class="arrow">→</span>
          </button>
        </div>
        <div style="font-size:11px;color:var(--gb-dim);text-align:center;margin-top:8px;line-height:1.5">
          API key: <code style="color:var(--gb-accent-light)">${API_KEY ? API_KEY.slice(0, 8) + '…' : '(none)'}</code>
        </div>
      </div>

      <div style="text-align:center;font-size:11px;color:var(--gb-dim);padding:20px 0;line-height:1.6">
        GrowthBot v4.0 · Made for Nigerian businesses<br>
        <a href="${BACKEND}/terms.html" target="_blank" rel="noopener" style="color:var(--gb-muted)">Terms</a>
      </div>
    `;

    body.querySelector('[data-go-dashboard]')?.addEventListener('click', () => {
      window.open(BACKEND + '/dashboard.html', '_blank');
    });
    body.querySelector('[data-go-business]')?.addEventListener('click', () => {
      window.open(BACKEND + '/dashboard.html#business', '_blank');
    });
    body.querySelector('[data-go-campaigns]')?.addEventListener('click', () => {
      window.open(BACKEND + '/dashboard.html#campaigns', '_blank');
    });
    body.querySelector('[data-go-leads]')?.addEventListener('click', () => {
      window.open(BACKEND + '/dashboard.html#leads', '_blank');
    });
    body.querySelector('[data-go-pay]')?.addEventListener('click', () => {
      window.open(BACKEND + '/pay.html?key=' + encodeURIComponent(API_KEY), '_blank');
    });
    body.querySelector('[data-copy-key]')?.addEventListener('click', () => {
      if (!API_KEY) return toast('No API key');
      copy(API_KEY, 'API key copied!');
    });
  }

  // ═══════════════════════════════════════════════════════════
  // UPGRADE PROMPT
  // ═══════════════════════════════════════════════════════════
  function renderUpgradePrompt(tab) {
    const body = qs('#gb-body');
    const feature = tab === 'video' ? 'Video generation' : 'Backlink tools';
    body.innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:56px;margin-bottom:14px">🔒</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">${feature} is Premium</div>
        <div style="font-size:13px;color:var(--gb-muted);line-height:1.6;margin-bottom:24px">
          Unlock unlimited audits, AI video ads, IndexNow submission, and directory listings.
        </div>
        <a class="gb-btn" href="${BACKEND}/pay.html?key=${encodeURIComponent(API_KEY)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">
          Upgrade for ₦${(state.limits.price || 5000).toLocaleString()}/month
        </a>
        <button class="gb-btn secondary" id="gb-back-home" type="button">← Back to home</button>
      </div>
    `;
    body.querySelector('#gb-back-home').addEventListener('click', () => {
      state.tab = 'home';
      renderShell();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════
  async function openPanel() {
    if (state.open) return;
    state.open = true;
    panel.classList.add('open');
    if (state.isMobile) {
      pushHistory();
      lockBodyScroll();
    }
    renderShell();
    await Promise.all([loadPlan(), loadBusiness()]);
    await loadAnalytics();
    renderShell();
  }

  function closePanel(opts) {
    if (!state.open) return;
    state.open = false;
    panel.classList.remove('open');
    stopPolling();
    if (state.isMobile) {
      unlockBodyScroll();
      if (!opts?.skipHistoryPop) popHistory();
    }
  }

  fab.addEventListener('click', () => (state.open ? closePanel() : openPanel()));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) closePanel();
  });

  window.addEventListener('resize', () => {
    const wasMobile = state.isMobile;
    state.isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (state.open && wasMobile !== state.isMobile) renderShell();
  });

  // Prefetch plan
  loadPlan();
})();
