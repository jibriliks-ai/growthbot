/*!
 * Auto Traffic Engine — Embed Script v1.0
 * Full-screen app takeover for any website
 *
 * Usage:
 *   <script src="https://growthbot-aprv.onrender.com/embed.js" data-key="YOUR_KEY"></script>
 *
 * Optional security:
 *   data-domain="yourblog.com"  → only runs on this domain
 */
(function () {
  'use strict';

  if (window.__ateEmbedLoaded) return;
  window.__ateEmbedLoaded = true;

  var script = document.currentScript ||
               document.querySelector('script[src*="embed.js"][data-key]');
  if (!script) {
    console.error('[ATE Embed] Script tag not found');
    return;
  }

  var API_KEY = script.getAttribute('data-key') || '';
  var RESTRICT_DOMAIN = script.getAttribute('data-domain') || '';

  if (!API_KEY) {
    console.error('[ATE Embed] Missing data-key');
    return;
  }

  if (RESTRICT_DOMAIN && location.hostname !== RESTRICT_DOMAIN) {
    console.warn('[ATE Embed] Domain mismatch. Expected:', RESTRICT_DOMAIN, 'Got:', location.hostname);
    return;
  }

  var BACKEND;
  try { BACKEND = new URL(script.src).origin; }
  catch (e) { BACKEND = 'https://growthbot-aprv.onrender.com'; }

  var APP_URL = BACKEND + '/app.html?key=' + encodeURIComponent(API_KEY);

  function bootApp() {
    if (document.getElementById('ate-embed-container')) return;

    // 1. Hide Blogger chrome — all common selectors
    var hideSelectors = [
      '.navbar', '#navbar', '.Navbar',
      '.header-outer', '.Header', '.header-inner', '.header-cap-top', '.header-cap-bottom',
      'header', 'body > header',
      '.tabs-outer', '.tabs-inner', '.tabs-cap-top', '.tabs-cap-bottom',
      '.main-outer', '.main-inner', '.main-cap-top', '.main-cap-bottom',
      '.columns', '.columns-inner',
      '.column-center-outer', '.column-center-inner',
      '.column-left-outer', '.column-left-inner',
      '.column-right-outer', '.column-right-inner',
      '.footer-outer', '.footer-inner', '.footer-cap-top', '.footer-cap-bottom',
      'footer', 'body > footer',
      '.content-outer', '.content-inner', '.content-cap-top', '.content-cap-bottom',
      '.content-fauxcolumns', '.body-fauxcolumns',
      '.region-inner',
      '.blog-pager', '.post-header', '.post-title', '.post-footer',
      '.post', '.post-outer', '.blog-posts', '.blog-feeds',
      '.date-outer', '.date-posts', '.date-header',
      '.status-msg-wrap', '.breadcrumbs',
      '.sidebar', '#sidebar', '.sidebar-container',
      '.mobile-desktop-link', '.blog-mobile-link'
    ];
    hideSelectors.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          el.style.setProperty('display', 'none', 'important');
        });
      } catch (e) {}
    });

    // 2. Force viewport (no zoom, respects notch)
    var appVp = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
      vp.setAttribute('content', appVp);
    } else {
      var m = document.createElement('meta');
      m.name = 'viewport';
      m.content = appVp;
      document.head.appendChild(m);
    }

    // 3. Theme color — status bar blends with app background
    var tc = document.querySelector('meta[name="theme-color"]');
    if (!tc) {
      tc = document.createElement('meta');
      tc.name = 'theme-color';
      document.head.appendChild(tc);
    }
    tc.content = '#0a0a0f';

    // 4. Reset html/body
    ['margin', 'padding'].forEach(function (prop) {
      document.documentElement.style.setProperty(prop, '0', 'important');
      document.body.style.setProperty(prop, '0', 'important');
    });
    document.documentElement.style.setProperty('height', '100%', 'important');
    document.body.style.setProperty('height', '100%', 'important');
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('background', '#0a0a0f', 'important');

    // 5. Hide ALL body children except our container (later)
    Array.from(document.body.children).forEach(function (child) {
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') return;
      child.style.setProperty('display', 'none', 'important');
    });

    // 6. Build fullscreen container
    var container = document.createElement('div');
    container.id = 'ate-embed-container';
    container.style.cssText = [
      'position:fixed',
      'top:0', 'left:0', 'right:0', 'bottom:0',
      'width:100vw', 'height:100vh', 'height:100dvh',
      'z-index:2147483647',
      'background:#0a0a0f',
      'padding-top:env(safe-area-inset-top,0px)',
      'padding-bottom:env(safe-area-inset-bottom,0px)',
      'padding-left:env(safe-area-inset-left,0px)',
      'padding-right:env(safe-area-inset-right,0px)',
      'box-sizing:border-box',
      'overflow:hidden'
    ].join(';');

    // 7. Loader overlay
    var loader = document.createElement('div');
    loader.id = 'ate-embed-loader';
    loader.style.cssText = [
      'position:absolute', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:#0a0a0f',
      'transition:opacity .35s ease',
      'font-family:Inter,system-ui,-apple-system,sans-serif',
      'z-index:2'
    ].join(';');

    loader.innerHTML =
      '<style>@keyframes ateSpin{to{transform:rotate(360deg)}}</style>' +
      '<div style="width:44px;height:44px;border:3px solid rgba(139,92,246,.18);border-top-color:#8b5cf6;border-radius:50%;animation:ateSpin .9s linear infinite;margin-bottom:20px;"></div>' +
      '<div style="display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800;color:#f4f4f5;letter-spacing:-.02em;">' +
        '<div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 16px rgba(139,92,246,.35);">🚦</div>' +
        'Auto Traffic Engine' +
      '</div>' +
      '<div style="font-size:12px;color:#71717a;margin-top:6px;">Loading your dashboard…</div>';

    // 8. Iframe
    var iframe = document.createElement('iframe');
    iframe.id = 'ate-embed-iframe';
    iframe.src = APP_URL;
    iframe.setAttribute('allow', 'clipboard-write; clipboard-read');
    iframe.setAttribute('title', 'Auto Traffic Engine');
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#0a0a0f;';

    iframe.addEventListener('load', function () {
      setTimeout(function () {
        loader.style.opacity = '0';
        setTimeout(function () { if (loader.parentNode) loader.remove(); }, 400);
      }, 250);
    });

    setTimeout(function () {
      if (loader.parentNode) {
        loader.style.opacity = '0';
        setTimeout(function () { if (loader.parentNode) loader.remove(); }, 400);
      }
    }, 10000);

    container.appendChild(loader);
    container.appendChild(iframe);

    // 9. Append to body
    if (document.body) {
      document.body.appendChild(container);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(container);
      });
    }

    // 10. Hide Android URL bar
    setTimeout(function () {
      window.scrollTo(0, 1);
      setTimeout(function () { window.scrollTo(0, 0); }, 100);
    }, 300);

    // 11. Prevent pull-to-refresh
    document.addEventListener('touchmove', function (e) {
      if (e.target === document.body ||
          e.target === document.documentElement ||
          e.target.id === 'ate-embed-container' ||
          e.target.id === 'ate-embed-loader') {
        e.preventDefault();
      }
    }, { passive: false });

    console.log('[ATE Embed] Booted successfully:', APP_URL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
  } else {
    bootApp();
  }
  setTimeout(bootApp, 500);
  setTimeout(bootApp, 1500);
  setTimeout(bootApp, 3000);
})();