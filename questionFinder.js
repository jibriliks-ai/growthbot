// ============================================================
// Auto Traffic Engine — Question Finder
// v8.0 — Reddit + Lemmy + Quora + Stack Exchange (free) + DDG
// 60 countries, automatic focus per country
// ============================================================
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

// ============================================================
// COUNTRY → SOURCES MAP (60 countries)
// Every country gets: Reddit + Lemmy + Stack Exchange + Quora
// Regional forums added where relevant.
// ============================================================
export const QA_SOURCES_BY_COUNTRY = {
  // ---- GLOBAL ----
  global: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- NORTH AMERICA ----
  us: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ca: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  mx: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- EUROPE ----
  gb: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'mse', label: 'MoneySavingExpert', domain: 'moneysavingexpert.com', method: 'ddg' },
  ],
  ie: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'boards', label: 'Boards.ie', domain: 'boards.ie', method: 'ddg' },
  ],
  de: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
    { id: 'gutefrage', label: 'Gutefrage.net', domain: 'gutefrage.net', method: 'ddg' },
  ],
  fr: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  es: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  it: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  nl: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  be: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  at: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ch: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  se: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  no: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  dk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  fi: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  pl: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  pt: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  gr: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  cz: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ro: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- AFRICA ----
  ng: [
    { id: 'nairaland', label: 'Nairaland', domain: 'nairaland.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ke: [
    { id: 'kenyatalk', label: 'KenyaTalk', domain: 'kenyatalk.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  gh: [
    { id: 'ghanaweb', label: 'GhanaWeb', domain: 'ghanaweb.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  za: [
    { id: 'mybroadband', label: 'MyBroadband', domain: 'mybroadband.co.za', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  eg: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ma: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tn: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  dz: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  et: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tz: [
    { id: 'jamiiforums', label: 'JamiiForums', domain: 'jamiiforums.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ug: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- ASIA ----
  in: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  pk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  bd: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  lk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  id: [
    { id: 'kaskus', label: 'Kaskus', domain: 'kaskus.co.id', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  my: [
    { id: 'lowyat', label: 'Lowyat.NET', domain: 'lowyat.net', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  sg: [
    { id: 'hardwarezone', label: 'HardwareZone', domain: 'hardwarezone.com.sg', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ph: [
    { id: 'pinoyexchange', label: 'PinoyExchange', domain: 'pinoyexchange.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  th: [
    { id: 'pantip', label: 'Pantip', domain: 'pantip.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  vn: [
    { id: 'tinhte', label: 'Tinhte.vn', domain: 'tinhte.vn', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  jp: [
    { id: 'chiebukuro', label: 'Yahoo Chiebukuro', domain: 'chiebukuro.yahoo.co.jp', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  kr: [
    { id: 'kin', label: 'Naver Knowledge iN', domain: 'kin.naver.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  cn: [
    { id: 'zhihu', label: 'Zhihu', domain: 'zhihu.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  hk: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tw: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- MIDDLE EAST ----
  ae: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  sa: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  il: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  tr: [
    { id: 'kizlarsoruyor', label: 'KizlarSoruyor', domain: 'kizlarsoruyor.com', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- LATIN AMERICA ----
  br: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ar: [
    { id: 'taringa', label: 'Taringa', domain: 'taringa.net', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  cl: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  co: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  pe: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  ve: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],

  // ---- OCEANIA ----
  au: [
    { id: 'whirlpool', label: 'Whirlpool Forums', domain: 'whirlpool.net.au', method: 'ddg' },
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
  nz: [
    { id: 'reddit', label: 'Reddit', domain: 'reddit.com', method: 'playwright' },
    { id: 'lemmy', label: 'Lemmy', domain: 'lemmy.world', method: 'lemmy' },
    { id: 'stackexchange', label: 'Stack Exchange', domain: 'stackexchange.com', method: 'stackexchange' },
    { id: 'quora', label: 'Quora', domain: 'quora.com', method: 'google_cse' },
  ],
};

// Country names (same as before)
const COUNTRY_NAMES = {
  global: 'Global', us: 'United States', ca: 'Canada', mx: 'Mexico', gb: 'United Kingdom', ie: 'Ireland',
  de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy', nl: 'Netherlands', be: 'Belgium', at: 'Austria',
  ch: 'Switzerland', se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland', pl: 'Poland', pt: 'Portugal',
  gr: 'Greece', cz: 'Czech Republic', ro: 'Romania', ng: 'Nigeria', ke: 'Kenya', gh: 'Ghana', za: 'South Africa',
  eg: 'Egypt', ma: 'Morocco', tn: 'Tunisia', dz: 'Algeria', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda',
  in: 'India', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka', id: 'Indonesia', my: 'Malaysia',
  sg: 'Singapore', ph: 'Philippines', th: 'Thailand', vn: 'Vietnam', jp: 'Japan', kr: 'South Korea',
  cn: 'China', hk: 'Hong Kong', tw: 'Taiwan', ae: 'UAE', sa: 'Saudi Arabia', il: 'Israel', tr: 'Turkey',
  br: 'Brazil', ar: 'Argentina', cl: 'Chile', co: 'Colombia', pe: 'Peru', ve: 'Venezuela', au: 'Australia', nz: 'New Zealand',
};

export function listSupportedCountries() {
  return Object.keys(QA_SOURCES_BY_COUNTRY).map((code) => ({
    code,
    name: COUNTRY_NAMES[code] || code.toUpperCase(),
    sources: QA_SOURCES_BY_COUNTRY[code].map((s) => s.label),
  }));
}

// ============================================================
// BROWSER — singleton (Playwright, sandbox disabled for Render)
// ============================================================
let browserInstance = null;
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

// ============================================================
// REDDIT — Playwright scraper
// ============================================================
async function scrapeReddit(keyword, limit = 10) {
  const browser = await getBrowser();
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const results = [];
  try {
    await page.goto(`https://www.reddit.com/search/?q=${encodeURIComponent(keyword)}&type=link`, {
      waitUntil: 'domcontentloaded', timeout: 25000,
    });
    await page.waitForTimeout(3500);
    const items = await page.$$eval('a[data-testid="post-title"]', (els) =>
      els.map((el) => ({ title: el.innerText.trim(), url: el.href }))
    );
    const seen = new Set();
    for (const item of items) {
      if (results.length >= limit) break;
      if (!item.title || seen.has(item.url)) continue;
      seen.add(item.url);
      results.push({ source: 'reddit', title: item.title, url: item.url, snippet: '' });
    }
    console.log(`✅ Reddit: ${results.length} results`);
  } catch (e) { console.warn(`❌ Reddit failed: ${e.message}`); }
  finally { await page.close(); }
  return results;
}

// ============================================================
// LEMMY — free v3 REST API (no key)
// ============================================================
async function searchLemmy(keyword, { limit = 10, instance = 'lemmy.world' } = {}) {
  const baseUrl = `https://${instance}/api/v3/search`;
  const params = new URLSearchParams({
    q: keyword,
    type_: 'Posts',
    listing_type: 'All',
    sort: 'TopAll',
    limit: String(Math.min(limit, 50)),
  });
  try {
    const res = await axios.get(`${baseUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AutoTrafficEngine/8.0' },
      timeout: 20000,
    });
    const posts = res.data?.posts || [];
    const results = posts.map((item) => {
      const post = item.post || {};
      return {
        source: 'lemmy',
        title: post.name || '',
        url: post.ap_id || `https://${instance}/post/${post.id}`,
        snippet: (post.body || '').slice(0, 300),
        community: item.community?.name || '',
      };
    }).filter((r) => r.title.length > 5);
    console.log(`✅ Lemmy: ${results.length} results`);
    return results;
  } catch (e) {
    console.warn(`❌ Lemmy failed: ${e.message}`);
    return [];
  }
}

// ============================================================
// STACK EXCHANGE — free, keyless, 300 req/day per IP
// Covers Stack Overflow, Super User, Ask Ubuntu, and 180+ sites
// ============================================================
async function searchStackExchange(keyword, { limit = 10, site = 'stackoverflow' } = {}) {
  const baseUrl = 'https://api.stackexchange.com/2.3/search/advanced';
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'relevance',
    q: keyword,
    site: site,
    pagesize: String(Math.min(limit, 100)),
    filter: 'withbody', // include body snippet
  });
  try {
    const res = await axios.get(`${baseUrl}?${params.toString()}`, {
      headers: { 'User-Agent': 'AutoTrafficEngine/8.0' },
      timeout: 20000,
    });
    const items = res.data?.items || [];
    const results = items.map((item) => ({
      source: 'stackexchange',
      title: item.title,
      url: item.link,
      snippet: (item.body || '').replace(/<[^>]*>/g, '').slice(0, 300), // strip HTML
      score: item.score,
      answerCount: item.answer_count,
    })).filter((r) => r.title && r.url);
    console.log(`✅ Stack Exchange (${site}): ${results.length} results`);
    return results;
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error_message || e.message;
    console.warn(`❌ Stack Exchange failed [${status}]: ${msg}`);
    return [];
  }
}

// ============================================================
// QUORA — Google Custom Search (requires GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID)
// ============================================================
async function searchQuoraGoogleCSE(keyword, { limit = 10 } = {}) {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cx) {
    console.warn('Quora skipped: GOOGLE_CSE_API_KEY or GOOGLE_CSE_ID not set');
    return [];
  }
  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q: `site:quora.com ${keyword}`,
        num: Math.min(limit, 10),
      },
      timeout: 15000,
    });
    const items = res.data?.items || [];
    const results = items.map((item) => ({
      source: 'quora',
      title: item.title.replace(/ - Quora$/, ''),
      url: item.link,
      snippet: item.snippet || '',
    }));
    console.log(`✅ Quora: ${results.length} results`);
    return results;
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error?.message || e.message;
    console.warn(`❌ Quora failed [${status}]: ${msg}`);
    return [];
  }
}

// ============================================================
// DUCKDUCKGO — fallback for forums (Nairaland etc.)
// ============================================================
async function searchDuckDuckGo(keyword, siteDomain, limit = 10) {
  try {
    const query = `site:${siteDomain} ${keyword}`;
    const res = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result').each((i, el) => {
      if (results.length >= limit) return false;
      const titleEl = $(el).find('.result__a');
      const urlEl = $(el).find('.result__url').attr('href');
      if (titleEl.length && urlEl) {
        results.push({ source: siteDomain, title: titleEl.text().trim(), url: urlEl, snippet: '' });
      }
    });
    console.log(`✅ DDG ${siteDomain}: ${results.length} results`);
    return results;
  } catch (e) {
    console.warn(`❌ DDG ${siteDomain} failed: ${e.message}`);
    return [];
  }
}

// ============================================================
// MAIN — automatic country focus
// ============================================================
export async function findQuestions({ keyword, country = 'ng', limitPerSource = 10 } = {}) {
  if (!keyword || keyword.trim().length < 3) throw new Error('Keyword must be at least 3 characters');

  const normalizedCountry = String(country).toLowerCase();
  const sources = QA_SOURCES_BY_COUNTRY[normalizedCountry] || QA_SOURCES_BY_COUNTRY.global;
  console.log(`🔍 Searching "${keyword}" in ${normalizedCountry} (${sources.length} sources)`);

  const allResults = [];
  const sourceStatus = [];

  for (const source of sources) {
    let results = [];
    let error = null;

    try {
      if (source.method === 'playwright' && source.domain === 'reddit.com') {
        results = await scrapeReddit(keyword, limitPerSource);
      } else if (source.method === 'lemmy') {
        results = await searchLemmy(keyword, { limit: limitPerSource });
      } else if (source.method === 'stackexchange') {
        // Use stackoverflow by default; you can add site mapping per country later
        results = await searchStackExchange(keyword, { limit: limitPerSource, site: 'stackoverflow' });
      } else if (source.method === 'google_cse') {
        results = await searchQuoraGoogleCSE(keyword, { limit: limitPerSource });
      } else if (source.method === 'ddg') {
        results = await searchDuckDuckGo(keyword, source.domain, limitPerSource);
      }
    } catch (e) {
      error = e.message;
    }

    sourceStatus.push({ source: source.id, label: source.label, count: results.length, error });
    allResults.push(...results);
  }

  // Dedupe by URL
  const seen = new Set();
  const deduped = [];
  for (const item of allResults) {
    try {
      const u = new URL(item.url);
      const key = u.origin + u.pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    } catch {}
  }

  console.log(`📊 Total found: ${deduped.length}`);
  return {
    keyword, country: normalizedCountry,
    totalFound: deduped.length,
    results: deduped,
    sourceStatus,
    warnings: sourceStatus.filter((s) => s.error).map((s) => `⚠️ ${s.label}: ${s.error}`),
  };
}

export default { findQuestions, listSupportedCountries, QA_SOURCES_BY_COUNTRY };